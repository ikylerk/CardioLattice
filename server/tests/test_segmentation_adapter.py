"""Adapter contract tests: mocked inference, real NIfTI I/O and resampling."""

import sys
from pathlib import Path
from types import ModuleType

import numpy as np
import pytest
import SimpleITK as sitk

from app.imaging import segmentation
from app.imaging.dicom import LoadedSeries, SubjectInfo, build_preview


# Independent expected semantics, not imported from the implementation.
OUTPUTS = (
    ("heart_ventricle_left", "LV", 1, (1, 2, 2)),
    ("heart_ventricle_right", "RV", 2, (3, 2, 2)),
    ("heart_atrium_left", "LA", 3, (5, 2, 2)),
    ("heart_atrium_right", "RA", 4, (7, 2, 2)),
    ("aorta", "AO", 5, (9, 2, 2)),
    ("heart_myocardium", "MYO", 6, (9, 6, 5)),
)


@pytest.fixture
def geometry_case(tmp_path):
    image = sitk.GetImageFromArray(np.full((24, 28, 32), 300, dtype=np.float32))
    image.SetSpacing((0.75, 1.0, 1.25))
    image.SetOrigin((38.0, -18.0, 57.0))
    image.SetDirection((0.0, -1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0))
    path = tmp_path / "hu.nii.gz"
    sitk.WriteImage(image, str(path))
    image = sitk.ReadImage(str(path))
    loaded = LoadedSeries(
        array_hu=sitk.GetArrayFromImage(image),
        spacing_mm=image.GetSpacing(),
        origin=image.GetOrigin(),
        direction=image.GetDirection(),
        warnings=[],
        subject=SubjectInfo("test", "test", None, None, None, None),
    )
    preview = build_preview(loaded, crop_mm=20, max_dim=13)
    assert not np.allclose(preview.origin, image.GetOrigin())
    assert not np.allclose(preview.spacing, image.GetSpacing())
    masks = {}
    expected = np.zeros(tuple(preview.dims[::-1]), dtype=np.uint8)
    for stem, _, label, index in OUTPUTS:
        point = (np.asarray(preview.affine) @ np.array([*index, 1.0]))[:3]
        native_index = image.TransformPhysicalPointToIndex(tuple(point))
        # The downsampling ratio need not be integral: the target point must
        # sample this native voxel, not necessarily coincide with its centre.
        continuous = image.TransformPhysicalPointToContinuousIndex(tuple(point))
        assert np.all(np.abs(np.asarray(native_index) - continuous) < 0.5)
        mask = sitk.Image(image.GetSize(), sitk.sitkUInt8)
        mask.CopyInformation(image)
        mask[native_index] = 255  # Exercise SITK binary conversion, not a numpy shortcut.
        masks[stem] = mask
        expected[index[::-1]] = label
    return path, preview, masks, expected


@pytest.fixture
def mock_backend(monkeypatch):
    calls = []
    package = ModuleType("totalsegmentator")
    package.__path__ = []
    api = ModuleType("totalsegmentator.python_api")
    package.python_api = api
    monkeypatch.setitem(sys.modules, "totalsegmentator", package)
    monkeypatch.setitem(sys.modules, "totalsegmentator.python_api", api)

    def installed_version(name):
        assert name == "TotalSegmentator"
        return "9.8.7+adapter.test"

    monkeypatch.setattr(segmentation.metadata, "version", installed_version)

    def install(masks, *, orientation=None, error=None, after_write=None):
        def infer(input_path, output_path, **kwargs):
            calls.append((input_path, output_path, kwargs))
            if error is not None:
                raise error
            for stem, mask in masks.items():
                saved = sitk.DICOMOrient(mask, orientation) if orientation else mask
                sitk.WriteImage(saved, str(Path(output_path) / f"{stem}.nii.gz"))
            if after_write is not None:
                after_write(Path(output_path))

        api.totalsegmentator = infer
        return calls

    return install


@pytest.mark.parametrize("orientation", [None, "LPS", "RAS"])
def test_official_outputs_align_in_physical_space(geometry_case, mock_backend, orientation):
    path, preview, masks, expected = geometry_case
    # Official upstream class 7 is pulmonary artery, not this project's CALC.
    masks["pulmonary_artery"] = next(iter(masks.values()))
    calls = mock_backend(masks, orientation=orientation)
    result = segmentation.segment_totalsegmentator(path, preview)

    np.testing.assert_array_equal(result.label_array, expected)
    assert result.label_array.dtype == np.uint8
    assert result.label_map == {code: label for _, code, label, _ in OUTPUTS}
    assert "CALC" not in result.label_map
    assert result.model_version == "9.8.7+adapter.test"
    assert result.validation_status == "research"
    assert result.quality["native_voxels"] == {code: 1 for _, code, _, _ in OUTPUTS}
    assert result.quality["preview_voxels"] == {code: 1 for _, code, _, _ in OUTPUTS}
    provenance = result.provenance
    assert provenance["weights_version"] is None
    assert provenance["model_version_source"] == "installed_package"
    assert provenance["coordinate_system"] == "LPS"
    assert provenance["task_requires_license"] is True
    assert provenance["unsupported_task_outputs"] == ["pulmonary_artery"]
    assert provenance["preview_geometry"]["origin"] == preview.origin
    assert provenance["preview_geometry"]["spacing"] == preview.spacing
    output = Path(provenance["output_directory"])
    assert calls == [(str(path), str(output), {
        "task": "heartchambers_highres", "output_type": "nifti",
        "ml": False, "skip_saving": False, "device": "cpu", "quiet": True,
    })]
    for stem, code, _, _ in OUTPUTS:
        saved = sitk.ReadImage(str(output / f"{stem}.nii.gz"))
        assert provenance["source_masks"][code] == f"{stem}.nii.gz"
        assert provenance["source_geometry"][code] == {
            "size": list(saved.GetSize()),
            "spacing": list(saved.GetSpacing()),
            "origin": list(saved.GetOrigin()),
            "direction": list(saved.GetDirection()),
        }


@pytest.mark.parametrize("missing_stem", [item[0] for item in OUTPUTS])
def test_missing_required_output_fails(geometry_case, mock_backend, missing_stem):
    path, preview, masks, _ = geometry_case
    masks.pop(missing_stem)
    mock_backend(masks)
    with pytest.raises(ValueError, match=f"missing required outputs: {missing_stem}"):
        segmentation.segment_totalsegmentator(path, preview)


def test_old_incorrect_names_cannot_succeed(geometry_case, mock_backend):
    path, preview, masks, _ = geometry_case
    old_names = ("left_ventricle", "right_ventricle", "left_atrium", "right_atrium", "aorta", "myocardium")
    mock_backend(dict(zip(old_names, masks.values())))
    with pytest.raises(ValueError, match="missing required outputs: heart_ventricle_left"):
        segmentation.segment_totalsegmentator(path, preview)


@pytest.mark.parametrize("empty_stem", [None, *[item[0] for item in OUTPUTS]])
def test_empty_native_outputs_fail(geometry_case, mock_backend, empty_stem):
    path, preview, masks, _ = geometry_case
    for stem in masks:
        if empty_stem is None or stem == empty_stem:
            masks[stem] = masks[stem] * 0
    mock_backend(masks)
    with pytest.raises(ValueError, match=f"required output is empty: {empty_stem or OUTPUTS[0][0]}"):
        segmentation.segment_totalsegmentator(path, preview)


def test_nonempty_mask_outside_preview_cannot_succeed(geometry_case, mock_backend):
    path, preview, masks, _ = geometry_case
    masks["heart_ventricle_left"].SetOrigin((1000.0, 2000.0, 3000.0))
    mock_backend(masks)
    with pytest.raises(ValueError, match="empty on the preview grid: heart_ventricle_left"):
        segmentation.segment_totalsegmentator(path, preview)


def test_overlapping_chambers_cannot_silently_overwrite(geometry_case, mock_backend):
    path, preview, masks, _ = geometry_case
    masks["heart_ventricle_right"] = masks["heart_ventricle_left"]
    mock_backend(masks)
    with pytest.raises(ValueError, match="masks overlap.*heart_ventricle_right"):
        segmentation.segment_totalsegmentator(path, preview)


def test_prior_outputs_do_not_hide_incomplete_retry(geometry_case, mock_backend):
    path, preview, masks, _ = geometry_case
    mock_backend(masks)
    first = segmentation.segment_totalsegmentator(path, preview)
    old_output = Path(first.provenance["output_directory"])
    calls = mock_backend({})
    with pytest.raises(ValueError, match="missing required outputs"):
        segmentation.segment_totalsegmentator(path, preview)
    assert Path(calls[-1][1]) != old_output
    assert (old_output / "heart_ventricle_left.nii.gz").is_file()


def test_corrupt_output_reports_filename(geometry_case, mock_backend):
    path, preview, masks, _ = geometry_case

    def corrupt(output):
        (output / "heart_ventricle_left.nii.gz").write_bytes(b"not nifti")

    mock_backend(masks, after_write=corrupt)
    with pytest.raises(ValueError, match="cannot read required output: heart_ventricle_left.nii.gz"):
        segmentation.segment_totalsegmentator(path, preview)


def test_negative_mask_values_fail(geometry_case, mock_backend):
    path, preview, masks, _ = geometry_case
    masks["heart_myocardium"] = -sitk.Cast(masks["heart_myocardium"], sitk.sitkFloat32)
    mock_backend(masks)
    with pytest.raises(ValueError, match="invalid mask values: heart_myocardium"):
        segmentation.segment_totalsegmentator(path, preview)


@pytest.mark.parametrize("invalid_kind", ["2d", "vector"])
def test_nonscalar_or_non3d_outputs_fail(geometry_case, mock_backend, invalid_kind):
    path, preview, masks, _ = geometry_case
    mask = masks["heart_myocardium"]
    masks["heart_myocardium"] = mask[:, :, 0] if invalid_kind == "2d" else sitk.Compose(mask, mask)
    mock_backend(masks)
    with pytest.raises(ValueError, match="must be scalar 3D: heart_myocardium"):
        segmentation.segment_totalsegmentator(path, preview)


def test_missing_install_metadata_fails_before_inference(geometry_case, mock_backend, monkeypatch):
    path, preview, masks, _ = geometry_case
    calls = mock_backend(masks)

    def missing(_):
        raise segmentation.metadata.PackageNotFoundError("TotalSegmentator")

    monkeypatch.setattr(segmentation.metadata, "version", missing)
    with pytest.raises(RuntimeError, match="not installed or its package metadata is missing"):
        segmentation.segment_totalsegmentator(path, preview)
    assert calls == []


def test_upstream_license_exit_does_not_terminate_server(geometry_case, mock_backend):
    path, preview, _, _ = geometry_case
    mock_backend({}, error=SystemExit(1))
    with pytest.raises(RuntimeError, match="heartchambers_highres exited.*check the task license") as exc:
        segmentation.segment_totalsegmentator(path, preview)
    assert isinstance(exc.value.__cause__, SystemExit)


def test_upstream_failure_cannot_return_success(geometry_case, mock_backend):
    path, preview, _, _ = geometry_case
    mock_backend({}, error=RuntimeError("inference failed"))
    with pytest.raises(RuntimeError, match="inference failed"):
        segmentation.segment_totalsegmentator(path, preview)
