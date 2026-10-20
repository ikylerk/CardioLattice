"""Binary segmentation metrics for 2D/3D research validation.

This module is intentionally free of application state and only depends on
NumPy/SciPy.  It is suitable for comparing a predicted label mask with a
reference label mask on the same voxel grid (for example, ImageCAS or ASOCA
coronary-artery annotations).

Conventions
-----------
* Inputs are binarised with ``array > 0``.  To evaluate one label from a
  multi-label map, extract that label before calling these functions.
* ``spacing_mm`` follows **NumPy array axis order**.  For a SimpleITK image,
  ``GetSpacing()`` is in ``(x, y, z)`` order, so reverse it before passing it
  here: ``tuple(reversed(image.GetSpacing()))``.
* Dice/Jaccard treat two empty masks as a perfect match (1.0).  Surface
  distances and centroid distance return ``None`` when exactly one mask is
  empty, because the quantity is undefined.  Two empty masks have zero surface
  distance (0.0) by convention.

These are research metrics only.  They do not establish clinical validity,
safety, or effectiveness.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from numpy.typing import ArrayLike
from scipy import ndimage

__all__ = [
    "dice",
    "jaccard",
    "hd95",
    "assd",
    "volume_error_ml",
    "centroid_distance_mm",
]

SpacingLike = float | Sequence[float] | np.ndarray


def _as_masks(pred: ArrayLike, gt: ArrayLike) -> tuple[np.ndarray, np.ndarray]:
    """Return foreground boolean masks after validating shape and values."""

    pred_array = np.asarray(pred)
    gt_array = np.asarray(gt)

    if pred_array.shape != gt_array.shape:
        raise ValueError(
            "pred and gt must have the same shape "
            f"(got {pred_array.shape} and {gt_array.shape})"
        )
    if pred_array.ndim not in (2, 3):
        raise ValueError(
            f"only 2D/3D masks are supported (got {pred_array.ndim}D input)"
        )
    if pred_array.size == 0:
        raise ValueError("pred and gt must not be empty arrays")

    for name, array in (("pred", pred_array), ("gt", gt_array)):
        if np.issubdtype(array.dtype, np.floating) and not np.all(
            np.isfinite(array)
        ):
            raise ValueError(f"{name} contains non-finite values")

    return pred_array > 0, gt_array > 0


def _normalise_spacing(spacing_mm: SpacingLike | None, ndim: int) -> tuple[float, ...]:
    """Return one positive spacing value per array axis."""

    if spacing_mm is None:
        return (1.0,) * ndim

    spacing = np.asarray(spacing_mm, dtype=float)
    if spacing.ndim == 0:
        spacing = np.full(ndim, float(spacing), dtype=float)
    elif spacing.shape != (ndim,):
        raise ValueError(
            "spacing_mm must be a scalar or have one value per array axis "
            f"(expected {ndim}, got shape {spacing.shape})"
        )

    if not np.all(np.isfinite(spacing)) or np.any(spacing <= 0):
        raise ValueError("spacing_mm values must be finite and greater than zero")
    return tuple(float(value) for value in spacing)


def _surface(mask: np.ndarray) -> np.ndarray:
    """Return the boundary voxels of a binary mask (6-connectivity in 3D)."""

    structure = ndimage.generate_binary_structure(mask.ndim, 1)
    eroded = ndimage.binary_erosion(mask, structure=structure, border_value=0)
    return mask & ~eroded


def _pooled_surface_distances(
    pred: np.ndarray, gt: np.ndarray, spacing: tuple[float, ...]
) -> np.ndarray:
    """Return bidirectional surface distances, pooled over both directions.

    Distances are in millimetres using the Euclidean distance transform.  The
    caller must ensure that both masks are non-empty.
    """

    pred_surface = _surface(pred)
    gt_surface = _surface(gt)

    # Distance from every prediction-surface voxel to the nearest GT-surface
    # voxel.  ``distance_transform_edt`` measures distance to the nearest zero,
    # so the complement of the surface is passed as input.
    distance_to_gt = ndimage.distance_transform_edt(
        ~gt_surface, sampling=spacing
    )
    pred_to_gt = distance_to_gt[pred_surface]
    del distance_to_gt

    distance_to_pred = ndimage.distance_transform_edt(
        ~pred_surface, sampling=spacing
    )
    gt_to_pred = distance_to_pred[gt_surface]

    return np.concatenate((pred_to_gt, gt_to_pred))


def dice(pred: ArrayLike, gt: ArrayLike) -> float:
    """Return the Sorensen-Dice coefficient for two binary masks.

    Two empty masks return 1.0; one empty mask returns 0.0.
    """

    pred_mask, gt_mask = _as_masks(pred, gt)
    pred_voxels = int(np.count_nonzero(pred_mask))
    gt_voxels = int(np.count_nonzero(gt_mask))
    denominator = pred_voxels + gt_voxels
    if denominator == 0:
        return 1.0
    intersection = int(np.count_nonzero(pred_mask & gt_mask))
    return float(2.0 * intersection / denominator)


def jaccard(pred: ArrayLike, gt: ArrayLike) -> float:
    """Return the intersection-over-union (Jaccard) coefficient.

    Two empty masks return 1.0; one empty mask returns 0.0.
    """

    pred_mask, gt_mask = _as_masks(pred, gt)
    union = int(np.count_nonzero(pred_mask | gt_mask))
    if union == 0:
        return 1.0
    intersection = int(np.count_nonzero(pred_mask & gt_mask))
    return float(intersection / union)


def hd95(
    pred: ArrayLike,
    gt: ArrayLike,
    spacing_mm: SpacingLike | None = 1.0,
) -> float | None:
    """Return the 95th-percentile symmetric surface distance in millimetres.

    Surface distances from both directions are pooled and the 95th percentile
    is taken.  Two empty masks return 0.0; if exactly one mask is empty the
    metric is undefined and ``None`` is returned.
    """

    pred_mask, gt_mask = _as_masks(pred, gt)
    pred_present = bool(np.any(pred_mask))
    gt_present = bool(np.any(gt_mask))
    if not pred_present and not gt_present:
        return 0.0
    if not pred_present or not gt_present:
        return None

    spacing = _normalise_spacing(spacing_mm, pred_mask.ndim)
    distances = _pooled_surface_distances(pred_mask, gt_mask, spacing)
    if distances.size == 0:  # Defensive; non-empty masks always have a surface.
        return None
    return float(np.percentile(distances, 95))


def assd(
    pred: ArrayLike,
    gt: ArrayLike,
    spacing_mm: SpacingLike | None = 1.0,
) -> float | None:
    """Return the average symmetric surface distance in millimetres.

    Two empty masks return 0.0; if exactly one mask is empty the metric is
    undefined and ``None`` is returned.
    """

    pred_mask, gt_mask = _as_masks(pred, gt)
    pred_present = bool(np.any(pred_mask))
    gt_present = bool(np.any(gt_mask))
    if not pred_present and not gt_present:
        return 0.0
    if not pred_present or not gt_present:
        return None

    spacing = _normalise_spacing(spacing_mm, pred_mask.ndim)
    distances = _pooled_surface_distances(pred_mask, gt_mask, spacing)
    if distances.size == 0:  # Defensive; non-empty masks always have a surface.
        return None
    return float(np.mean(distances))


def volume_error_ml(
    pred: ArrayLike,
    gt: ArrayLike,
    spacing_mm: SpacingLike | None = 1.0,
) -> float:
    """Return the absolute foreground volume difference in millilitres.

    The signed difference is ``pred_volume - gt_volume``; this function returns
    its absolute value.  ``1 mL = 1000 mm^3``.
    """

    pred_mask, gt_mask = _as_masks(pred, gt)
    spacing = _normalise_spacing(spacing_mm, pred_mask.ndim)
    voxel_volume_mm3 = float(np.prod(np.asarray(spacing, dtype=float)))
    voxel_difference = abs(
        int(np.count_nonzero(pred_mask)) - int(np.count_nonzero(gt_mask))
    )
    return float(voxel_difference * voxel_volume_mm3 / 1000.0)


def centroid_distance_mm(
    pred: ArrayLike,
    gt: ArrayLike,
    spacing_mm: SpacingLike | None = 1.0,
) -> float | None:
    """Return the distance between foreground centroids in millimetres.

    Centroids are computed from voxel indices, then scaled by ``spacing_mm``.
    Returns ``None`` if either mask is empty (including when both are empty),
    because an empty mask has no centroid.
    """

    pred_mask, gt_mask = _as_masks(pred, gt)
    if not np.any(pred_mask) or not np.any(gt_mask):
        return None

    spacing = _normalise_spacing(spacing_mm, pred_mask.ndim)
    spacing_array = np.asarray(spacing, dtype=float)
    pred_centroid = np.argwhere(pred_mask).mean(axis=0) * spacing_array
    gt_centroid = np.argwhere(gt_mask).mean(axis=0) * spacing_array
    return float(np.linalg.norm(pred_centroid - gt_centroid))
