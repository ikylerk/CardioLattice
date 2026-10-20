from __future__ import annotations

from dataclasses import dataclass
from itertools import product
from pathlib import Path

import numpy as np
import SimpleITK as sitk

from .dicom import LoadedSeries, PreviewVolume, SubjectInfo, _to_ras, build_preview


@dataclass
class NiftiCase:
    preview: PreviewVolume
    labels: np.ndarray
    metadata: dict
    native_labels: np.ndarray
    native_geometry: dict

    def __iter__(self):
        # Preserve the original three-value unpacking API.
        yield self.preview
        yield self.labels
        yield self.metadata


def _validate_image(image: sitk.Image, name: str) -> None:
    if image.GetDimension() != 3 or image.GetNumberOfComponentsPerPixel() != 1:
        raise ValueError(f"{name} must be a scalar 3D image")
    spacing = np.asarray(image.GetSpacing())
    direction = np.asarray(image.GetDirection()).reshape(3, 3)
    if (not np.all(np.isfinite(spacing)) or np.any(spacing <= 0)
            or not np.all(np.isfinite(image.GetOrigin()))
            or not np.all(np.isfinite(direction))
            or not np.allclose(direction.T @ direction, np.eye(3), atol=1e-5)):
        raise ValueError(f"{name} has invalid physical geometry")


def native_points_to_preview_mm(points, geometry: dict, preview: PreviewVolume):
    """Map source index-axis mm to preview index-axis mm, before scene centering."""
    points = np.asarray(points, dtype=float)
    if points.size == 0:
        return []
    source_direction = np.asarray(geometry["direction"]).reshape(3, 3)
    preview_direction = np.asarray(preview.direction).reshape(3, 3)
    physical = points @ source_direction.T + np.asarray(geometry["origin"])
    return ((physical - np.asarray(preview.origin)) @ np.linalg.inv(preview_direction).T).tolist()


def load_nifti_case(
    image_path: Path,
    labels_path: Path,
    *,
    resample_mm: float = 1.5,
    max_dim: int = 192,
) -> NiftiCase:
    """Keep native annotations for quantification; resample only for display.

    SimpleITK exposes physical metadata in LPS even when the NIfTI header uses
    RAS. All resampling uses this physical space, never an array-shape guess.
    """
    image = sitk.ReadImage(str(image_path))
    labels_image = sitk.ReadImage(str(labels_path))
    _validate_image(image, "image")
    _validate_image(labels_image, "labels")
    if not np.isfinite(resample_mm) or resample_mm <= 0:
        raise ValueError("resample_mm must be finite and positive")
    raw_labels = sitk.GetArrayFromImage(labels_image)
    if (not np.all(np.isfinite(raw_labels)) or np.any(raw_labels < 0)
            or np.any(raw_labels > 65535) or np.any(raw_labels != np.floor(raw_labels))):
        raise ValueError("labels must contain integer IDs in [0, 65535]")
    native_labels = raw_labels.astype(np.uint16)
    if not np.any(native_labels):
        raise ValueError("label map is empty")
    # Require the annotation grid to lie inside the image field of view.
    # Reversed axes and cropped label grids are valid when physically aligned.
    for corner in product(*[(0, size - 1) for size in labels_image.GetSize()]):
        point = labels_image.TransformIndexToPhysicalPoint(corner)
        index = np.asarray(image.TransformPhysicalPointToContinuousIndex(point))
        if np.any(index < -0.501) or np.any(index > np.asarray(image.GetSize()) - 0.499):
            raise ValueError("label geometry falls outside the image field of view; check origin/direction")
    labels_image = sitk.Cast(labels_image, sitk.sitkUInt16)
    canonical = _to_ras(sitk.Cast(image, sitk.sitkFloat32))
    extent = (np.asarray(canonical.GetSize()) - 1) * canonical.GetSpacing()
    out_size = [max(1, int(np.ceil(value / resample_mm)) + 1) for value in extent]
    resampled = sitk.Resample(
        canonical, out_size, sitk.Transform(), sitk.sitkLinear,
        canonical.GetOrigin(), (resample_mm,) * 3, canonical.GetDirection(),
        -1024.0, sitk.sitkFloat32,
    )
    loaded = LoadedSeries(
        array_hu=sitk.GetArrayFromImage(resampled),
        spacing_mm=tuple(resampled.GetSpacing()),
        origin=tuple(resampled.GetOrigin()),
        direction=tuple(resampled.GetDirection()),
        warnings=[],
        subject=SubjectInfo(
            patient_id_hash="public-dataset", pseudonym="PUBLIC-DATASET",
            sex=None, age_years=None, study_date=None, study_description=None,
        ),
    )
    preview = build_preview(loaded, max_dim=max_dim, crop_mm=None)
    aligned_image = sitk.Resample(
        labels_image, preview.dims, sitk.Transform(), sitk.sitkNearestNeighbor,
        preview.origin, preview.spacing, preview.direction, 0, sitk.sitkUInt16,
    )
    aligned = sitk.GetArrayFromImage(aligned_image)
    native_values = sorted(int(v) for v in np.unique(native_labels) if v)
    visible_values = sorted(int(v) for v in np.unique(aligned) if v)
    missing = sorted(set(native_values) - set(visible_values))
    warnings = []
    if missing:
        warnings.append(f"Labels {missing} are absent from the display preview; native measurements and surfaces are retained.")
    geometry = {
        "dims": list(labels_image.GetSize()), "spacing": list(labels_image.GetSpacing()),
        "origin": list(labels_image.GetOrigin()), "direction": list(labels_image.GetDirection()),
        "physicalCoordinateSystem": "LPS",
    }
    metadata = {
        "dims": preview.dims, "spacing": preview.spacing, "huRange": preview.hu_range,
        "labelValues": native_values, "previewLabelValues": visible_values,
        "warnings": warnings, "measurementGrid": "native_label",
        "nativeGeometry": geometry, "physicalCoordinateSystem": "LPS",
    }
    preview.stats.update({"measurementGrid": "native_label", "warnings": warnings})
    return NiftiCase(preview, aligned, metadata, native_labels, geometry)


def label_volumes_ml(labels: np.ndarray, spacing_mm) -> dict[int, float]:
    voxel_ml = float(np.prod(spacing_mm)) / 1000.0
    return {
        int(value): float(np.count_nonzero(labels == value)) * voxel_ml
        for value in np.unique(labels)
        if int(value) != 0
    }
