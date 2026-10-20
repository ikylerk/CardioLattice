from __future__ import annotations

import copy
import json
from types import SimpleNamespace

import numpy as np
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import registration
from app.models import AuditEvent, Base, Measurement, Segmentation, Study, Subject, VolumeRecord
from app.registration import _chamber_centroids, _semantic_label_map, register_cardiac_atlas, solve_similarity


POINTS = np.array([[0, 0, 0], [4, 1, 0], [1, 5, 0], [1, 2, 6]], dtype=float)


@pytest.fixture
def case(tmp_path, monkeypatch):
    """Exercise persistence in an isolated DB and directory, never the app DB."""
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    monkeypatch.setattr(registration, "storage", SimpleNamespace(
        study_dir=lambda study_id: tmp_path / study_id,
        relative=lambda path: str(path.relative_to(tmp_path)),
    ))
    with Session(engine) as db:
        subject = Subject(id="subject_test", pseudonym="registration_synthetic")
        study = Study(id="study_test", subject=subject, study_uid="registration-test")
        volume = VolumeRecord(
            id="volume_test", study=study, dims=[15, 17, 19], spacing=[0.7, 1.3, 2.1],
            origin=[12, -13, 47], direction=[0, -1, 0, 1, 0, 0, 0, 0, 1],
            affine=[[0, -1.3, 0, 12], [0.7, 0, 0, -13], [0, 0, 2.1, 47], [0, 0, 0, 1]],
            hu_range=[-1024, 3071], data_path="unused.u8", bytes=15 * 17 * 19,
        )
        segmentation = Segmentation(
            id="seg_test", study=study, volume_id=volume.id, task="test",
            status="completed", label_map={"LV": 19, "RV": 7, "LA": 91, "RA": 3},
            provenance={},
        )
        db.add_all([subject, study, volume, segmentation])
        db.commit()
        labels = np.zeros((19, 17, 15), dtype=np.int16)
        for value, index in zip([19, 7, 91, 3], [(3, 5, 2), (5, 8, 9), (12, 6, 4), (9, 13, 11)]):
            labels[index] = value
        yield SimpleNamespace(
            db=db, study=study, volume=volume, segmentation=segmentation,
            labels=labels, artifact=tmp_path / study.id / "derived" / "atlas_registration.json",
        )
    engine.dispose()


def run(case):
    return register_cardiac_atlas(case.db, case.study, case.volume, case.segmentation, case.labels)


def assert_not_computed(case):
    assert run(case) is None
    saved = json.loads(case.artifact.read_text())
    assert saved["status"] == saved["validationStatus"] == "not_computed"
    assert saved["reason"]
    assert saved["targets"] == saved["landmarks"] == []
    assert saved["rmsMm"] is None
    assert "transform" not in saved and "scale" not in saved
    rows = list(case.db.scalars(select(Measurement)))
    assert {row.code for row in rows} == {
        "ATLAS_REGISTRATION", "ATLAS_REGISTRATION_RMS", "ATLAS_REGISTERED_TARGETS",
    }
    assert all(row.status == "not_computed" and row.value is None and row.reason for row in rows)
    assert all(row.provenance["targets"] == [] for row in rows)
    return saved


@pytest.mark.parametrize("source", [POINTS, POINTS[:3]])
def test_known_similarity_and_planar_triangle(source):
    rotation = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1]], dtype=float)
    target = 2.3 * (source @ rotation.T) + [12, -4, 8]
    scale, fitted_rotation, translation, rms, residuals = solve_similarity(source, target)
    assert scale == pytest.approx(2.3)
    np.testing.assert_allclose(fitted_rotation, rotation, atol=1e-12)
    np.testing.assert_allclose(translation, [12, -4, 8], atol=1e-12)
    assert rms < 1e-12
    assert max(residuals) < 1e-12
    assert np.linalg.det(fitted_rotation) == pytest.approx(1)


@pytest.mark.parametrize("source,target", [
    ([], []),
    (POINTS[:2], POINTS[:2]),
    (POINTS, POINTS[:3]),
    (np.ones((3, 2)), np.ones((3, 2))),
    (np.ones((3, 3, 1)), np.ones((3, 3, 1))),
    (np.full((3, 3), np.nan), POINTS[:3]),
    (POINTS[:3], np.full((3, 3), np.inf)),
    (np.zeros((4, 3)), POINTS),
    (POINTS, np.zeros((4, 3))),
    (np.vstack([POINTS[:3], POINTS[0]]), POINTS),
    (POINTS, np.vstack([POINTS[:3], POINTS[0]])),
    ([[0, 0, 0], [1, 0, 0], [2, 0, 0]], POINTS[:3]),
    (POINTS[:3], [[0, 0, 0], [1, 0, 0], [2, 0, 0]]),
    (POINTS[:3], [[0, 0, 0], [1, 0, 0], [2, 1e-10, 0]]),
    (POINTS * 1e200, POINTS),
])
def test_similarity_rejects_invalid_or_degenerate_geometry(source, target):
    with pytest.raises(ValueError):
        solve_similarity(source, target)


def test_reflection_is_not_returned_as_a_rotation():
    target = POINTS * [-1, 1, 1]
    _, rotation, _, rms, _ = solve_similarity(POINTS, target)
    assert np.linalg.det(rotation) == pytest.approx(1)
    assert rms > 0.1


def test_arbitrary_label_numbers_and_aliases_use_explicit_semantics(case):
    mapping = {"heart_lv": 19, "CHAMBER_RV": 7, " LA ": 91, "RA": 3}
    centroids = _chamber_centroids(case.labels, mapping, case.volume.dims, case.volume.spacing)
    np.testing.assert_allclose(centroids["LV"], (np.array([2, 5, 3]) + 0.5 - np.array([15, 17, 19]) / 2) * [0.7, 1.3, 2.1])
    assert set(centroids) == {"LV", "RV", "LA", "RA"}
    assert _semantic_label_map({"LABEL_1": 1, "LABEL_2": 2, "LABEL_3": 3, "LABEL_4": 4}) == {}


@pytest.mark.parametrize("value", [0, -1, 1.5, 1.0, True, np.nan, np.inf, None, "19", [19]])
def test_invalid_label_values_cannot_create_success(case, value):
    case.segmentation.label_map = {**case.segmentation.label_map, "LV": value}
    assert_not_computed(case)


@pytest.mark.parametrize("change", [
    {"RV": 19},               # One value assigned to two chambers.
    {"HEART_LV": 12},         # One chamber assigned to two values.
    {" lv ": 12},             # Case/whitespace duplicate.
    {"UNKNOWN": 19},          # Ambiguous reuse by a non-chamber code.
    {"LV": 99},               # Declared chamber absent from the array.
])
def test_ambiguous_or_absent_declared_labels_fail(case, change):
    case.segmentation.label_map = {**case.segmentation.label_map, **change}
    assert_not_computed(case)


def test_unmapped_numeric_labels_do_not_identify_chambers(case):
    case.segmentation.label_map = {f"LABEL_{value}": value for value in (19, 7, 91, 3)}
    assert_not_computed(case)


def test_label_spec_detects_chamber_lost_by_dictionary_overwrite(case):
    case.segmentation.provenance = {"label_spec": {
        "17": {"code": "LV"}, "19": {"code": "LV"}, "7": {"code": "RV"},
        "91": {"code": "LA"}, "3": {"code": "RA"},
    }}
    saved = assert_not_computed(case)
    assert "duplicate" in saved["reason"]


@pytest.mark.parametrize("spec", [
    {"19": {"code": "RV"}, "7": {"code": "LV"}, "91": {"code": "LA"}, "3": {"code": "RA"}},
    {"19": {"code": "LV"}, "019": {"code": "HEART_LV"}, "7": {"code": "RV"}, "91": {"code": "LA"}, "3": {"code": "RA"}},
    {"19.0": {"code": "LV"}},
])
def test_inconsistent_label_spec_is_rejected(case, spec):
    case.segmentation.provenance = {"label_spec": spec}
    assert_not_computed(case)


def test_explicit_standard_semantics_are_supported_and_cross_checked(case):
    case.segmentation.label_map = {"custom_lv": 19, "custom_rv": 7, "custom_la": 91, "custom_ra": 3}
    case.segmentation.provenance = {
        "standard_label_map": {f"custom_{code.lower()}": f"HEART_{code}" for code in ("LV", "RV", "LA", "RA")},
        "label_spec": {str(value): {"code": code} for code, value in case.segmentation.label_map.items()},
    }
    result = run(case)
    assert result["landmarkCount"] == 4
    case.segmentation.label_map = {"LV": 19, "RV": 7, "LA": 91, "RA": 3}
    case.segmentation.provenance = {"standard_label_map": {"LV": "HEART_RV"}}
    assert_not_computed(case)


@pytest.mark.parametrize("problem", [
    "spacing_zero", "spacing_negative", "spacing_nan", "spacing_shape",
    "dims_fractional", "dims_shape", "array_shape", "array_nan", "array_fractional",
    "array_negative", "array_bool", "collinear", "coincident_centroids",
    "wrong_volume", "wrong_study", "incomplete_segmentation",
])
def test_invalid_inputs_never_persist_computed_results(case, problem):
    if problem.startswith("spacing_"):
        case.volume.spacing = {
            "spacing_zero": [0, 1, 1], "spacing_negative": [1, -1, 1],
            "spacing_nan": [1, float("nan"), 1], "spacing_shape": [1, 1],
        }[problem]
    elif problem == "dims_fractional":
        case.volume.dims = [15.5, 17, 19]
    elif problem == "dims_shape":
        case.volume.dims = [15, 17]
    elif problem == "array_shape":
        case.labels = case.labels[:-1]
    elif problem in ("array_nan", "array_fractional", "array_negative"):
        case.labels = case.labels.astype(float)
        case.labels[0, 0, 0] = {"array_nan": np.nan, "array_fractional": 0.2, "array_negative": -1}[problem]
    elif problem == "array_bool":
        case.labels = case.labels.astype(bool)
    elif problem == "collinear":
        case.labels[:] = 0
        for index, value in enumerate([19, 7, 91, 3]):
            case.labels[2, 3, 2 + index * 3] = value
    elif problem == "coincident_centroids":
        case.labels[:] = 0
        case.labels[3, 4, [2, 8]] = 19
        case.labels[3, 4, [3, 7]] = 7
        case.labels[10, 12, 4] = 91
        case.labels[15, 5, 7] = 3
    elif problem == "wrong_volume":
        case.segmentation.volume_id = "unrelated"
    elif problem == "wrong_study":
        case.volume.study_id = "unrelated"
    elif problem == "incomplete_segmentation":
        case.segmentation.status = "failed"
    assert_not_computed(case)


@pytest.mark.parametrize("problem", ["duplicate_id", "missing_chamber", "non_finite_target", "degenerate_reference"])
def test_invalid_reference_atlas_cannot_return_success(case, monkeypatch, problem):
    targets = copy.deepcopy(registration.TARGETS)
    heart = next(target for target in targets if target["id"] == "CHAMBER_LV")
    if problem == "duplicate_id":
        targets.append(copy.deepcopy(heart))
    elif problem == "missing_chamber":
        targets.remove(heart)
    elif problem == "non_finite_target":
        next(target for target in targets if target["id"] == "VALVE_MITRAL")["coordinateMm"] = [np.nan, 0, 0]
    elif problem == "degenerate_reference":
        for target in targets:
            if target["id"].startswith("CHAMBER_"):
                target["coordinateMm"] = [0, 0, 0]
    monkeypatch.setattr(registration, "TARGETS", targets)
    assert_not_computed(case)


def test_records_observations_mapping_residuals_and_legacy_frame(case):
    result = run(case)
    assert result["frame"] == "patient_preview_centered_mm"
    assert result["version"] == "atlas-registration/v1"
    assert result["schemaRevision"] == 2
    assert result["validationStatus"] == "research"
    assert result["targetFrame"]["patientPhysicalTransformApplied"] is False
    assert result["targetFrame"]["arrayOrder"] == "ZYX"
    assert result["sourceFrame"]["name"] == registration.ORGAN_TARGETS["frame"]["name"]
    assert result["targetAccuracyMm"] is None
    assert result["targetAccuracyStatus"] == "not_evaluated"
    assert result["fitMetric"] == "in_sample_landmark_rms"
    assert len(result["targets"]) == 11
    matrix = np.array(result["transform"]["matrix4x4"])
    errors = []
    for landmark in result["landmarks"]:
        index_xyz = np.argwhere(case.labels == landmark["labelValue"]).mean(axis=0)[::-1]
        observed = (index_xyz + 0.5 - np.array(case.volume.dims) / 2) * case.volume.spacing
        mapped = (matrix @ [*landmark["referenceMm"], 1])[:3]
        np.testing.assert_allclose(landmark["centroidIndexXyz"], index_xyz)
        np.testing.assert_allclose(landmark["observedPatientMm"], observed)
        np.testing.assert_allclose(landmark["mappedPatientMm"], mapped)
        np.testing.assert_allclose(landmark["patientMm"], np.round(mapped, 2))
        error = np.linalg.norm(mapped - observed)
        errors.append(error)
        assert landmark["fitResidualMm"] == pytest.approx(error)
        assert landmark["voxelCount"] == 1
    assert any(error > 0.1 for error in errors), "test must distinguish observed and fitted points"
    assert result["fitRmsMm"] == pytest.approx(np.sqrt(np.mean(np.square(errors))))
    assert result["rmsMm"] == round(result["fitRmsMm"], 2)
    for target in result["targets"]:
        mapped = (matrix @ [*target["referenceMm"], 1])[:3]
        np.testing.assert_allclose(target["mappedPatientMm"], mapped)
        np.testing.assert_allclose(target["patientMm"], np.round(mapped, 2))
    assert json.loads(case.artifact.read_text()) == result
    assert "NaN" not in case.artifact.read_text()
    assert len(list(case.db.scalars(select(AuditEvent)))) == 1


def test_failure_after_success_clears_stale_api_artifact_and_all_duplicate_rows(case):
    assert run(case)["status"] == "computed"
    original = case.db.scalars(select(Measurement).where(Measurement.code == "ATLAS_REGISTRATION_RMS")).one()
    case.db.add(Measurement(
        study_id=case.study.id, code=original.code, label=original.label, value=original.value,
        unit=original.unit, method=original.method, source=original.source,
        status="computed", validation_status="research", provenance=dict(original.provenance),
    ))
    case.db.commit()
    case.segmentation.label_map = {**case.segmentation.label_map, "RV": 19}
    assert_not_computed(case)
    case.segmentation.label_map = {**case.segmentation.label_map, "RV": 7}
    assert run(case)["status"] == "computed"
    rows = list(case.db.scalars(select(Measurement)))
    assert len(rows) == 4
    assert all(row.status == "computed" and row.reason is None for row in rows)
    assert len(list(case.db.scalars(select(AuditEvent)))) == 3


def test_three_explicit_noncollinear_chambers_remain_supported(case):
    case.segmentation.label_map = {"LV": 19, "RV": 7, "LA": 91}
    assert run(case)["landmarkCount"] == 3
