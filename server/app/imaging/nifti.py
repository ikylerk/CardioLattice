from __future__ import annotations

from pathlib import Path

import numpy as np
import SimpleITK as sitk

from .dicom import LoadedSeries, SubjectInfo, align_labels_to_preview, build_preview


def load_nifti_case(
    image_path: Path,
    labels_path: Path,
    *,
    resample_mm: float = 1.5,
    max_dim: int = 192,
):
    """Load a public NIfTI case and align its label map to the preview grid.

    Public CCTA datasets (for example ImageCAS/ASOCA) provide NIfTI volumes and
    label maps. NIfTI is assumed to follow the RAS convention; the volume and
    labels are processed together so their display frame is consistent.
    """
    image = sitk.ReadImage(str(image_path))
    image = sitk.Cast(image, sitk.sitkFloat32)
    size_mm = np.array(image.GetSize(), dtype=float) * np.array(image.GetSpacing(), dtype=float)
    out_size = [max(1, int(round(value / resample_mm))) for value in size_mm]
    resampled = sitk.Resample(
        image,
        out_size,
        sitk.Transform(),
        sitk.sitkLinear,
        image.GetOrigin(),
        (resample_mm, resample_mm, resample_mm),
        image.GetDirection(),
        -1024.0,
        sitk.sitkFloat32,
    )
    array = sitk.GetArrayFromImage(resampled).astype(np.float32)
    spacing = tuple(float(value) for value in resampled.GetSpacing())
    loaded = LoadedSeries(
        array_hu=array,
        spacing_mm=spacing,
        origin=tuple(float(value) for value in resampled.GetOrigin()),
        direction=tuple(float(value) for value in resampled.GetDirection()),
        warnings=["Public NIfTI import: RAS orientation assumed"],
        subject=SubjectInfo(
            patient_id_hash="public-dataset",
            pseudonym="PUBLIC-DATASET",
            sex=None,
            age_years=None,
            study_date=None,
            study_description=None,
        ),
    )
    preview = build_preview(loaded, max_dim=max_dim)

    labels_image = sitk.ReadImage(str(labels_path))
    labels_image = sitk.Cast(labels_image, sitk.sitkUInt16)
    labels_resampled = sitk.Resample(
        labels_image,
        resampled,
        sitk.Transform(),
        sitk.sitkNearestNeighbor,
        0,
        sitk.sitkUInt16,
    )
    labels_array = sitk.GetArrayFromImage(labels_resampled).astype(np.uint8)
    aligned = align_labels_to_preview(labels_array, preview)
    return preview, aligned, {
        "dims": preview.dims,
        "spacing": preview.spacing,
        "huRange": preview.hu_range,
        "labelValues": sorted(int(value) for value in np.unique(aligned) if int(value) != 0),
        "warnings": loaded.warnings,
    }


def label_volumes_ml(labels: np.ndarray, spacing_mm) -> dict[int, float]:
    voxel_ml = float(np.prod(spacing_mm)) / 1000.0
    return {
        int(value): float(np.count_nonzero(labels == value)) * voxel_ml
        for value in np.unique(labels)
        if int(value) != 0
    }
