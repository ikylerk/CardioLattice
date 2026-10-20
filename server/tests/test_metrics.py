"""Known-answer tests for the research segmentation metrics."""

from __future__ import annotations

import numpy as np
import pytest

from app.metrics import (
    assd,
    centroid_distance_mm,
    dice,
    hd95,
    jaccard,
    volume_error_ml,
)


def _box(
    shape: tuple[int, int, int] = (20, 20, 20),
    start: tuple[int, int, int] = (6, 6, 6),
    size: tuple[int, int, int] = (6, 6, 6),
) -> np.ndarray:
    mask = np.zeros(shape, dtype=bool)
    slices = tuple(slice(offset, offset + length) for offset, length in zip(start, size))
    mask[slices] = True
    return mask


def _single_voxel(
    shape: tuple[int, int, int], index: tuple[int, int, int]
) -> np.ndarray:
    mask = np.zeros(shape, dtype=bool)
    mask[index] = True
    return mask


def test_identical_masks_are_perfect_match() -> None:
    mask = _box()
    spacing = (1.0, 0.5, 2.0)

    assert dice(mask, mask) == pytest.approx(1.0)
    assert jaccard(mask, mask) == pytest.approx(1.0)
    assert hd95(mask, mask, spacing_mm=spacing) == pytest.approx(0.0)
    assert assd(mask, mask, spacing_mm=spacing) == pytest.approx(0.0)
    assert volume_error_ml(mask, mask, spacing_mm=spacing) == pytest.approx(0.0)
    assert centroid_distance_mm(mask, mask, spacing_mm=spacing) == pytest.approx(0.0)


def test_identical_masks_with_non_binary_positive_labels() -> None:
    mask = _box()
    pred = mask.astype(np.uint8) * 7
    gt = mask.astype(np.uint8) * 3

    assert dice(pred, gt) == pytest.approx(1.0)
    assert jaccard(pred, gt) == pytest.approx(1.0)
    assert hd95(pred, gt, spacing_mm=1.0) == pytest.approx(0.0)


def test_disjoint_masks_have_zero_overlap() -> None:
    pred = _box(start=(2, 2, 2), size=(4, 4, 4))
    gt = _box(start=(12, 12, 12), size=(4, 4, 4))

    assert dice(pred, gt) == pytest.approx(0.0)
    assert jaccard(pred, gt) == pytest.approx(0.0)
    assert volume_error_ml(pred, gt) == pytest.approx(0.0)

    hd = hd95(pred, gt, spacing_mm=(1.0, 1.0, 1.0))
    assert hd is not None
    assert hd > 0.0
    assert hd <= np.sqrt(3.0) * 10.0 + 1e-6  # nearest corners are 10 voxels apart


def test_shifted_cube_has_plausible_metrics_and_respects_spacing() -> None:
    gt = _box(start=(6, 6, 6), size=(6, 6, 6))
    pred = _box(start=(6, 6, 8), size=(6, 6, 6))  # Shifted 2 voxels along axis 2.

    # Intersection = 6 * 6 * 4 = 144; both masks contain 216 voxels.
    assert dice(pred, gt) == pytest.approx(2.0 * 144.0 / (216.0 + 216.0))
    assert jaccard(pred, gt) == pytest.approx(144.0 / (216.0 + 216.0 - 144.0))
    assert volume_error_ml(pred, gt, spacing_mm=(1.0, 1.0, 1.0)) == pytest.approx(0.0)

    assert centroid_distance_mm(
        pred, gt, spacing_mm=(1.0, 1.0, 1.0)
    ) == pytest.approx(2.0)
    assert hd95(pred, gt, spacing_mm=(1.0, 1.0, 1.0)) == pytest.approx(2.0)
    assert assd(pred, gt, spacing_mm=(1.0, 1.0, 1.0)) > 0.0

    # Doubling spacing along the shift axis doubles the centroid distance and
    # the worst surface distance.
    assert centroid_distance_mm(
        pred, gt, spacing_mm=(1.0, 1.0, 2.0)
    ) == pytest.approx(4.0)
    assert hd95(pred, gt, spacing_mm=(1.0, 1.0, 2.0)) == pytest.approx(4.0)


def test_anisotropic_spacing_on_single_voxel_shift() -> None:
    gt = _single_voxel((5, 5, 10), (2, 2, 2))
    pred = _single_voxel((5, 5, 10), (2, 2, 3))

    assert dice(pred, gt) == pytest.approx(0.0)
    assert centroid_distance_mm(
        pred, gt, spacing_mm=(1.0, 1.0, 1.0)
    ) == pytest.approx(1.0)
    assert hd95(pred, gt, spacing_mm=(1.0, 1.0, 1.0)) == pytest.approx(1.0)
    assert assd(pred, gt, spacing_mm=(1.0, 1.0, 1.0)) == pytest.approx(1.0)

    # One voxel along the third axis is 3 mm when that axis has 3 mm spacing.
    assert centroid_distance_mm(
        pred, gt, spacing_mm=(1.0, 1.0, 3.0)
    ) == pytest.approx(3.0)
    assert hd95(pred, gt, spacing_mm=(1.0, 1.0, 3.0)) == pytest.approx(3.0)
    assert assd(pred, gt, spacing_mm=(1.0, 1.0, 3.0)) == pytest.approx(3.0)


def test_volume_error_uses_anisotropic_voxel_volume() -> None:
    gt = _box(shape=(12, 12, 12), start=(3, 3, 3), size=(4, 4, 4))
    pred = _box(shape=(12, 12, 12), start=(3, 3, 3), size=(4, 4, 5))

    # 16 extra voxels * (1 mm * 1 mm * 2 mm) = 32 mm^3 = 0.032 mL.
    assert volume_error_ml(
        pred, gt, spacing_mm=(1.0, 1.0, 2.0)
    ) == pytest.approx(0.032)


def test_empty_masks_are_handled_sensibly() -> None:
    empty = np.zeros((5, 5, 5), dtype=bool)
    mask = _single_voxel((5, 5, 5), (2, 2, 2))

    assert dice(empty, empty) == pytest.approx(1.0)
    assert jaccard(empty, empty) == pytest.approx(1.0)
    assert hd95(empty, empty) == pytest.approx(0.0)
    assert assd(empty, empty) == pytest.approx(0.0)
    assert centroid_distance_mm(empty, empty) is None

    assert dice(empty, mask) == pytest.approx(0.0)
    assert jaccard(empty, mask) == pytest.approx(0.0)
    assert hd95(empty, mask) is None
    assert assd(empty, mask) is None
    assert centroid_distance_mm(empty, mask) is None
    assert volume_error_ml(empty, mask) == pytest.approx(0.001)


def test_supports_2d_masks() -> None:
    gt = np.zeros((10, 10), dtype=bool)
    gt[3:7, 3:7] = True
    pred = np.zeros((10, 10), dtype=bool)
    pred[3:7, 5:9] = True

    assert dice(pred, gt) == pytest.approx(0.5)
    assert jaccard(pred, gt) == pytest.approx(1.0 / 3.0)
    assert hd95(pred, gt, spacing_mm=(1.0, 1.0)) > 0.0


def test_invalid_inputs_raise_clear_errors() -> None:
    mask = _box()

    with pytest.raises(ValueError, match="same shape"):
        dice(mask, np.zeros((1, 20, 20), dtype=bool))

    with pytest.raises(ValueError, match="2D/3D"):
        dice(np.zeros(4, dtype=bool), np.zeros(4, dtype=bool))

    with pytest.raises(ValueError, match="one value per array axis"):
        hd95(mask, mask, spacing_mm=(1.0, 1.0))

    with pytest.raises(ValueError, match="greater than zero"):
        hd95(mask, mask, spacing_mm=(1.0, 0.0, 1.0))

    with pytest.raises(ValueError, match="non-finite"):
        hd95(
            np.full((2, 2, 2), np.nan),
            np.zeros((2, 2, 2)),
            spacing_mm=1.0,
        )
