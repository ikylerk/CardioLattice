from itertools import product

import numpy as np
import pytest
import SimpleITK as sitk
import trimesh

from app.imaging.dicom import LoadedSeries, SubjectInfo, _to_ras, build_preview
from app.imaging.mesh import build_structure_glb
from app.imaging.nifti import load_nifti_case, label_volumes_ml, native_points_to_preview_mm
from app.imaging.coronary_analysis import analyze_coronary_mask
from app.public_import import parse_label_spec


def write_case(tmp_path, labels, spacing=(0.4, 0.7, 1.2), origin=(23., -17., 41.),
               direction=(0., -1., 0., 1., 0., 0., 0., 0., 1.)):
    image = sitk.GetImageFromArray(np.where(labels, 330, -800).astype(np.float32))
    image.SetSpacing(spacing)
    image.SetOrigin(origin)
    image.SetDirection(direction)
    mask = sitk.GetImageFromArray(labels)
    mask.CopyInformation(image)
    image_path, mask_path = tmp_path / "image.nii.gz", tmp_path / "labels.nii.gz"
    sitk.WriteImage(image, str(image_path))
    sitk.WriteImage(mask, str(mask_path))
    return image_path, mask_path


def test_orientation_preserves_physical_points():
    data = np.arange(2 * 3 * 4, dtype=np.float32).reshape(2, 3, 4)
    image = sitk.GetImageFromArray(data)
    image.SetOrigin((42., -13., 9.))
    image.SetSpacing((0.4, 0.7, 2.0))
    canonical = _to_ras(image)
    assert canonical.GetDirection() == (-1., 0., 0., 0., -1., 0., 0., 0., 1.)
    for index in product(range(4), range(3), range(2)):
        point = image.TransformIndexToPhysicalPoint(index)
        new_index = canonical.TransformPhysicalPointToIndex(point)
        assert canonical[new_index] == image[index]


def test_crop_origin_and_affine_include_spacing():
    loaded = LoadedSeries(
        array_hu=np.zeros((18, 20, 22), dtype=np.float32),
        spacing_mm=(2., 3., 4.), origin=(31., -18., 50.),
        direction=(-1., 0., 0., 0., -1., 0., 0., 0., 1.), warnings=[],
        subject=SubjectInfo("test", "test", None, None, None, None),
    )
    preview = build_preview(loaded, crop_mm=24, max_dim=8)
    z0, _, y0, _, x0, _ = preview.crop_box_zyx
    matrix = np.diag([-1., -1., 1.])
    expected_origin = np.asarray(loaded.origin) + matrix @ (np.array([x0, y0, z0]) * loaded.spacing_mm)
    assert preview.origin == pytest.approx(expected_origin)
    index = np.array([2., 1., 3., 1.])
    physical = np.asarray(preview.affine) @ index
    assert physical[:3] == pytest.approx(expected_origin + matrix @ (index[:3] * preview.spacing))


def test_native_measurement_is_independent_of_preview_and_retains_uint16(tmp_path):
    labels = np.zeros((30, 40, 50), dtype=np.uint16)
    labels[3:17, 7:20, 5:9] = 300
    labels[25, 36, 46] = 1024
    paths = write_case(tmp_path, labels)
    high = load_nifti_case(*paths, max_dim=128, resample_mm=0.4)
    low = load_nifti_case(*paths, max_dim=8, resample_mm=2.)
    assert high.native_labels.dtype == low.native_labels.dtype == np.uint16
    np.testing.assert_array_equal(low.native_labels, labels)
    expected = 14 * 13 * 4 * 0.4 * 0.7 * 1.2 / 1000
    assert label_volumes_ml(low.native_labels, low.native_geometry["spacing"])[300] == pytest.approx(expected)
    assert label_volumes_ml(high.native_labels, high.native_geometry["spacing"]) == label_volumes_ml(
        low.native_labels, low.native_geometry["spacing"]
    )
    assert low.metadata["labelValues"] == [300, 1024]


def test_native_surface_retains_disconnected_components(tmp_path):
    labels = np.zeros((20, 24, 30), dtype=np.uint16)
    labels[2:6, 3:7, 4:8] = 300
    labels[14:17, 18:21, 23:26] = 300
    case = load_nifti_case(*write_case(tmp_path, labels), max_dim=8)
    output = tmp_path / "both.glb"
    infos, transform = build_structure_glb(
        case.native_labels, case.preview, output, {300: {"code": "PAIRED"}},
        source_geometry=case.native_geometry,
    )
    scene = trimesh.load(output, force="scene")
    mesh = next(iter(scene.geometry.values()))
    assert len(mesh.split(only_watertight=False)) == 2
    assert len(infos) == 1
    # A known label voxel maps through native LPS and back to the preview grid.
    point = np.array([5, 4, 3]) * case.native_geometry["spacing"]
    mapped = native_points_to_preview_mm([point], case.native_geometry, case.preview)[0]
    source_physical = (np.asarray(case.native_geometry["direction"]).reshape(3, 3) @ point
                       + case.native_geometry["origin"])
    recovered = np.asarray(case.preview.direction).reshape(3, 3) @ mapped + case.preview.origin
    np.testing.assert_allclose(recovered, source_physical)
    scene_point = (np.asarray(mapped) - transform["center_mm"]) * transform["scale"]
    assert np.all(scene_point >= mesh.bounds[0]) and np.all(scene_point <= mesh.bounds[1])


def test_public_preview_does_not_crop_peripheral_organs(tmp_path):
    labels = np.zeros((6, 6, 400), dtype=np.uint16)
    labels[1:4, 1:4, 5:12] = 1
    case = load_nifti_case(*write_case(tmp_path, labels, spacing=(1., 1., 1.)), max_dim=128)
    assert max(np.asarray(case.preview.dims) * case.preview.spacing) >= 399
    assert np.count_nonzero(case.native_labels) == 63
    assert case.preview.crop_box_zyx[4] == 0


def test_reflected_storage_preserves_surface_winding(tmp_path):
    labels = np.zeros((14, 16, 20), dtype=np.uint16)
    labels[3:9, 4:11, 5:13] = 300
    paths = write_case(tmp_path, labels)
    original = load_nifti_case(*paths)
    label_image = sitk.ReadImage(str(paths[1]))
    sitk.WriteImage(sitk.Flip(label_image, [True, False, False]), str(paths[1]))
    flipped = load_nifti_case(*paths)
    meshes = []
    for i, case in enumerate([original, flipped]):
        path = tmp_path / f"orientation-{i}.glb"
        build_structure_glb(case.native_labels, case.preview, path, {300: {"code": "STRUCTURE"}},
                            source_geometry=case.native_geometry)
        meshes.append(next(iter(trimesh.load(path, force="scene").geometry.values())))
    np.testing.assert_allclose(meshes[0].bounds, meshes[1].bounds, atol=1e-6)
    assert meshes[0].volume > 0 and meshes[1].volume > 0
    assert meshes[0].volume == pytest.approx(meshes[1].volume, rel=1e-6)


def test_misaligned_labels_fail_instead_of_silent_empty_mask(tmp_path):
    labels = np.zeros((12, 14, 16), dtype=np.uint16)
    labels[3:8, 4:9, 5:10] = 1
    image_path, label_path = write_case(tmp_path, labels)
    label = sitk.ReadImage(str(label_path))
    label.SetOrigin((10000., 0., 0.))
    sitk.WriteImage(label, str(label_path))
    with pytest.raises(ValueError, match="field of view"):
        load_nifti_case(image_path, label_path)


@pytest.mark.parametrize("invalid", [-1., 1.5, float("nan"), 65536.])
def test_invalid_labels_rejected_before_cast(tmp_path, invalid):
    labels = np.zeros((8, 8, 8), dtype=np.float32)
    labels[3, 3, 3] = invalid
    with pytest.raises(ValueError, match="integer IDs|label map is empty"):
        load_nifti_case(*write_case(tmp_path, labels))


def test_binary_label_has_no_invented_anatomical_semantics():
    labels = np.ones((3, 3, 3), dtype=np.uint16)
    assert parse_label_spec(None, labels)[1]["code"] == "LABEL_1"
    assert parse_label_spec('{"1":"CORONARY_TREE"}', labels)[1]["code"] == "CORONARY_TREE"
    with pytest.raises(ValueError, match="absent"):
        parse_label_spec('{"2":"LV"}', labels)
    with pytest.raises(ValueError, match="duplicate"):
        parse_label_spec('{"1":"LV","2":"LV"}', np.array([1, 2]))


def test_coronary_analysis_keeps_both_trees_and_physical_lengths():
    labels = np.zeros((44, 32, 32), dtype=np.uint16)
    labels[3:39, 5:10, 5:10] = 300
    labels[7:32, 21:26, 21:26] = 300
    result = analyze_coronary_mask(labels, (0.5, 0.5, 1.5), label_value=300)
    assert result.component_count == 2
    assert result.voxel_count == np.count_nonzero(labels)
    assert result.skeleton_total_length_mm > result.centerline_length_mm
    points = np.asarray(result.centerline)
    assert result.centerline_length_mm == pytest.approx(np.linalg.norm(np.diff(points, axis=0), axis=1).sum())
    assert result.as_dict()["diameterScope"] == "longest_path_only"
