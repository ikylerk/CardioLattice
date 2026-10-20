from __future__ import annotations

from dataclasses import dataclass
from importlib import metadata
from pathlib import Path
from tempfile import mkdtemp

import numpy as np
import SimpleITK as sitk

from ..config import settings
from ..organ_library import ORGAN_LIBRARY, standard_label_map
from .dicom import PreviewVolume, align_labels_to_preview, load_label_image

# Canonical research label map. These are structure identifiers, not clinical
# diagnoses. Synthetic fixtures and future models must use the same labels.
LABELS = {
    1: ("LV", "左心室腔"),
    2: ("RV", "右心室腔"),
    3: ("LA", "左心房腔"),
    4: ("RA", "右心房腔"),
    5: ("AO", "主动脉"),
    6: ("MYO", "心肌"),
    7: ("CALC", "钙化"),
}


@dataclass
class SegmentationResult:
    label_array: np.ndarray  # uint8 on the preview grid
    label_map: dict[str, int]
    model_id: str
    model_version: str
    validation_status: str
    quality: dict
    provenance: dict


def segment_synthetic(study, preview: PreviewVolume) -> SegmentationResult:
    """Load the fixture's ground-truth labels on the preview grid.

    This is not an AI model. It exists so the ingest -> mask -> mesh -> metrics
    path can be verified with known truth. Real uploads must use a registered
    model (or remain not_computed).
    """
    meta = study.fixture_meta or {}
    labels_path = meta.get("labels_path")
    if not labels_path or not Path(labels_path).exists():
        raise ValueError("synthetic_ground_truth requires fixture_meta.labels_path")

    array, _ = load_label_image(Path(labels_path), resample_mm=settings.resample_mm)
    aligned = align_labels_to_preview(array, preview)
    present = sorted(int(value) for value in np.unique(aligned) if int(value) != 0)
    label_map = {LABELS[value][0]: value for value in present if value in LABELS}
    quality = {
        "label_values_present": present,
        "voxels": int(np.count_nonzero(aligned)),
        "warnings": ["Synthetic ground truth — not a clinical segmentation"],
    }
    return SegmentationResult(
        label_array=aligned,
        label_map=label_map,
        model_id="synthetic_ground_truth",
        model_version="fixture-v1",
        validation_status="synthetic",
        quality=quality,
        provenance={
            "algorithm": "synthetic_ground_truth",
            "labels_path": str(labels_path),
            "organ_library_version": ORGAN_LIBRARY["version"],
            "standard_label_map": standard_label_map(label_map),
            "note": "Generated from the same phantom definition as the DICOM fixture.",
        },
    )


def segment_totalsegmentator(hu_nifti: Path, preview: PreviewVolume) -> SegmentationResult:
    """Run the explicitly selected, licensed heartchambers_highres adapter.

    All six supported structures must have nonempty native and preview masks.
    model_version records the installed software, not the model weights version.
    """
    try:
        package_version = metadata.version("TotalSegmentator")
    except metadata.PackageNotFoundError as exc:
        raise RuntimeError("TotalSegmentator is not installed or its package metadata is missing") from exc
    try:
        from totalsegmentator.python_api import totalsegmentator  # type: ignore
    except ImportError as exc:
        raise RuntimeError("TotalSegmentator Python API or a required dependency is unavailable") from exc

    # A fresh run directory prevents outputs from earlier/failed runs being
    # mistaken for results of this invocation. Retain files for provenance.
    output_root = hu_nifti.parent / "totalsegmentator"
    output_root.mkdir(parents=True, exist_ok=True)
    output = Path(mkdtemp(prefix="run-", dir=output_root))
    try:
        totalsegmentator(
            str(hu_nifti),
            str(output),
            task="heartchambers_highres",
            output_type="nifti",
            ml=False,
            skip_saving=False,
            device="cpu",
            quiet=True,
        )
    except SystemExit as exc:
        # Upstream exits for licensing errors; do not let it terminate the server.
        raise RuntimeError(
            f"TotalSegmentator heartchambers_highres exited ({exc.code}); "
            "check the task license and upstream error"
        ) from exc

    # Names from the official class_map, mapped by anatomy to our own IDs:
    # https://github.com/wasserth/TotalSegmentator/blob/master/totalsegmentator/map_to_binary.py
    # The task also emits pulmonary_artery, which has no supported project code.
    # In particular, upstream ID 7 must never be interpreted as our CALC ID 7.
    mapping = {
        "heart_ventricle_left": 1,
        "heart_ventricle_right": 2,
        "heart_atrium_left": 3,
        "heart_atrium_right": 4,
        "aorta": 5,
        "heart_myocardium": 6,
    }
    missing = [stem for stem in mapping if not (output / f"{stem}.nii.gz").is_file()]
    if missing:
        raise ValueError(f"TotalSegmentator missing required outputs: {', '.join(missing)}")

    combined = np.zeros(tuple(preview.dims[::-1]), dtype=np.uint8)
    native_voxels = {}
    preview_voxels = {}
    source_geometry = {}
    for stem, value in mapping.items():
        candidate = output / f"{stem}.nii.gz"
        try:
            mask = sitk.ReadImage(str(candidate))
        except RuntimeError as exc:
            raise ValueError(f"TotalSegmentator cannot read required output: {candidate.name}") from exc
        if mask.GetDimension() != 3 or mask.GetNumberOfComponentsPerPixel() != 1:
            raise ValueError(f"TotalSegmentator output must be scalar 3D: {stem}")
        values = sitk.GetArrayViewFromImage(mask)
        if not np.isfinite(values).all() or np.any(values < 0):
            raise ValueError(f"TotalSegmentator output contains invalid mask values: {stem}")
        count = int(np.count_nonzero(values > 0))
        if count == 0:
            raise ValueError(f"TotalSegmentator required output is empty: {stem}")

        # SITK's binary comparison/cast preserves origin, spacing and direction.
        # Resample directly in physical LPS coordinates, without ndarray cropping
        # or a guessed origin. Preview origin already includes its crop offset.
        binary = sitk.Cast(mask > 0, sitk.sitkUInt8)
        aligned_image = sitk.Resample(
            binary, preview.dims, sitk.Transform(), sitk.sitkNearestNeighbor,
            preview.origin, preview.spacing, preview.direction, 0, sitk.sitkUInt8,
        )
        aligned = sitk.GetArrayFromImage(aligned_image) > 0
        aligned_count = int(np.count_nonzero(aligned))
        if aligned_count == 0:
            raise ValueError(
                f"TotalSegmentator required output is empty on the preview grid: {stem}; "
                "check physical geometry, field of view and preview resolution"
            )
        if np.any(aligned & (combined != 0)):
            raise ValueError(f"TotalSegmentator required masks overlap on the preview grid: {stem}")
        combined[aligned] = value
        code = LABELS[value][0]
        native_voxels[code] = count
        preview_voxels[code] = aligned_count
        source_geometry[code] = {
            "size": list(mask.GetSize()),
            "spacing": list(mask.GetSpacing()),
            "origin": list(mask.GetOrigin()),
            "direction": list(mask.GetDirection()),
        }

    label_map = {LABELS[value][0]: value for value in mapping.values()}
    return SegmentationResult(
        label_array=combined,
        label_map=label_map,
        model_id="totalsegmentator",
        model_version=package_version,
        validation_status="research",
        quality={
            "warnings": ["Research adapter; not validated for stenosis or FFR."],
            "native_voxels": native_voxels,
            "preview_voxels": preview_voxels,
        },
        provenance={
            "algorithm": "totalsegmentator",
            "task": "heartchambers_highres",
            "package_version": package_version,
            "model_version_source": "installed_package",
            "weights_version": None,
            "task_requires_license": True,
            "output_directory": str(output),
            "source_masks": {LABELS[value][0]: f"{stem}.nii.gz" for stem, value in mapping.items()},
            "unsupported_task_outputs": ["pulmonary_artery"],
            "coordinate_system": "LPS",
            "resampling": "nearest_neighbor",
            "source_geometry": source_geometry,
            "preview_geometry": {
                "size": list(preview.dims),
                "spacing": list(preview.spacing),
                "origin": list(preview.origin),
                "direction": list(preview.direction),
            },
            "organ_library_version": ORGAN_LIBRARY["version"],
            "standard_label_map": standard_label_map(label_map),
        },
    )
