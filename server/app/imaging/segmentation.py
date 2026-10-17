from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..codes import CodedError
from ..config import settings
from .dicom import PreviewVolume, align_labels_to_preview, load_label_image

# Canonical research label map. These are structure identifiers, not clinical
# diagnoses. Synthetic fixtures and future models must use the same labels.
LABELS = {
    1: ("LV", "Left ventricular cavity"),
    2: ("RV", "Right ventricular cavity"),
    3: ("LA", "Left atrial cavity"),
    4: ("RA", "Right atrial cavity"),
    5: ("AO", "Aorta"),
    6: ("MYO", "Myocardium"),
    7: ("CALC", "Calcification"),
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
        raise CodedError("LABELS_PATH_REQUIRED")

    array, _ = load_label_image(Path(labels_path), resample_mm=settings.resample_mm)
    aligned = align_labels_to_preview(array, preview)
    present = sorted(int(value) for value in np.unique(aligned) if int(value) != 0)
    label_map = {LABELS[value][0]: value for value in present if value in LABELS}
    quality = {
        "label_values_present": present,
        "voxels": int(np.count_nonzero(aligned)),
        "warnings": ["QUALITY_SYNTHETIC_GROUND_TRUTH"],
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
            "note": "NOTE_SYNTHETIC_FIXTURE",
        },
    )


def segment_totalsegmentator(hu_nifti: Path, preview: PreviewVolume) -> SegmentationResult:
    """Optional research adapter. TotalSegmentator weights have task-specific
    licences; this adapter is not enabled by default and must not be used to
    produce stenosis or FFR claims."""
    from totalsegmentator.python_api import totalsegmentator  # type: ignore

    output = hu_nifti.parent / "totalsegmentator"
    output.mkdir(parents=True, exist_ok=True)
    totalsegmentator(
        str(hu_nifti),
        str(output),
        task="heartchambers_highres",
        output_type="nifti",
        device="cpu",
        quiet=True,
    )
    # The task writes separate masks; combine the chambers into our label map.
    combined = np.zeros((preview.dims[2], preview.dims[1], preview.dims[0]), dtype=np.uint8)
    mapping = {
        "left_ventricle": 1,
        "right_ventricle": 2,
        "left_atrium": 3,
        "right_atrium": 4,
        "aorta": 5,
        "myocardium": 6,
    }
    for stem, value in mapping.items():
        candidate = output / f"{stem}.nii.gz"
        if not candidate.exists():
            continue
        mask, _ = load_label_image(candidate, resample_mm=settings.resample_mm)
        aligned = align_labels_to_preview((mask > 0).astype(np.uint8), preview)
        combined[aligned > 0] = value
    return SegmentationResult(
        label_array=combined,
        label_map={name: value for value, (name, _) in LABELS.items() if np.any(combined == value)},
        model_id="totalsegmentator",
        model_version="2.4.0",
        validation_status="research",
        quality={"warnings": ["QUALITY_TOTALSEGMENTATOR_RESEARCH"]},
        provenance={"algorithm": "totalsegmentator", "task": "heartchambers_highres"},
    )
