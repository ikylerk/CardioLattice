from __future__ import annotations

import json
import math
from datetime import datetime
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import numpy as np
import SimpleITK as sitk
from fastapi.testclient import TestClient

from app.main import app
from app import comparison as comparison_module
from app.comparison import _compare_measurements, _preview_image, _run_registration, _transform_matrix
from app.comparison_models import Comparison
from app.db import SessionLocal, get_db
from app.models import Base, Measurement, Segmentation, Study, Subject, VolumeRecord


def _create_demo_study(client: TestClient) -> str:
    response = client.post("/api/studies/demo")
    assert response.status_code == 202, response.text
    payload = response.json()
    assert payload["job"]["state"] == "succeeded", json.dumps(payload, ensure_ascii=False)
    assert payload["study"]["study"]["status"] == "ready"
    return payload["study"]["study"]["id"]


def _import_other_subject(client: TestClient, tmp_path) -> str:
    """Import a tiny public NIfTI case, which creates an unrelated subject."""
    array = np.full((32, 32, 32), -500.0, dtype=np.float32)
    z, y, x = np.indices(array.shape)
    mask = (((z - 16) ** 2 + (y - 16) ** 2) < 5**2) & (x > 4) & (x < 28)
    array[mask] = 320.0
    image = sitk.GetImageFromArray(array)
    image.SetSpacing((1.5, 1.5, 1.5))
    image_path = tmp_path / "other_image.nii.gz"
    sitk.WriteImage(image, str(image_path))

    labels = np.zeros((32, 32, 32), dtype=np.uint8)
    labels[mask] = 1
    label_image = sitk.GetImageFromArray(labels)
    label_image.SetSpacing((1.5, 1.5, 1.5))
    labels_path = tmp_path / "other_labels.nii.gz"
    sitk.WriteImage(label_image, str(labels_path))

    with image_path.open("rb") as image_handle, labels_path.open("rb") as labels_handle:
        response = client.post(
            "/api/public/import",
            files={
                "image": ("image.nii.gz", image_handle, "application/gzip"),
                "labels": ("labels.nii.gz", labels_handle, "application/gzip"),
            },
            data={"dataset": "comparison_other_subject"},
        )
    assert response.status_code == 202, response.text
    payload = response.json()
    assert payload["study"]["study"]["status"] == "ready"
    return payload["study"]["study"]["id"]


def test_demo_studies_compare_with_registration():
    with TestClient(app) as client:
        prior_id = _create_demo_study(client)
        current_id = _create_demo_study(client)
        with SessionLocal() as db:
            db.get(Study, prior_id).study_date = "20250101"
            db.get(Study, current_id).study_date = "20260201"
            db.commit()

        candidates = client.get(f"/api/studies/{current_id}/prior-candidates")
        assert candidates.status_code == 200, candidates.text
        items = candidates.json()["items"]
        prior_candidate = next((item for item in items if item["id"] == prior_id), None)
        assert prior_candidate is not None
        assert prior_candidate["source"] == "demo"
        assert "LV_VOLUME" in prior_candidate["measurementCodes"]

        response = client.post(
            "/api/comparisons",
            json={"currentStudyId": current_id, "priorStudyId": prior_id},
        )
        assert response.status_code == 200, response.text
        comparison = response.json()

        assert comparison["id"].startswith("cmp_")
        assert comparison["currentStudyId"] == current_id
        assert comparison["priorStudyId"] == prior_id
        assert comparison["validationStatus"] == "research"
        assert isinstance(comparison["warnings"], list)

        deltas = {item["code"]: item for item in comparison["deltas"]}
        assert "LV_VOLUME" in deltas
        lv_volume = deltas["LV_VOLUME"]
        assert lv_volume["unit"] == "mL"
        assert lv_volume["current"] is not None
        assert lv_volume["prior"] is not None
        # Demo single-phase volumes have no documented acquisition phase.
        assert lv_volume["delta"] is None
        assert lv_volume["percent"] is None
        assert lv_volume["comparability"]["comparable"] is False
        assert "comparability" in lv_volume
        assert lv_volume["comparability"]["comparable"] in {True, False}

        registration = comparison["registration"]
        assert {
            "method",
            "status",
            "quality",
            "metric",
            "warnings",
        } <= set(registration)
        assert registration["method"] == "sitk_euler3d_mattes_mi"
        assert registration["status"] in {"completed", "low_quality"}
        assert registration["quality"] in {
            "research_qc_passed",
            "research_low_confidence",
            "not_assessed",
        }
        if registration["status"] == "completed":
            assert registration["metric"] is not None
            assert math.isfinite(registration["metric"])
        assert any(
            "not externally validated" in warning.lower()
            for warning in registration["warnings"]
        )

        fetched = client.get(f"/api/comparisons/{comparison['id']}")
        assert fetched.status_code == 200, fetched.text
        stored = fetched.json()
        assert stored["id"] == comparison["id"]
        assert stored["deltas"] == comparison["deltas"]

        audit = client.get(f"/api/studies/{current_id}/audit").json()
        assert audit["verified"] is True
        assert any(item["action"] == "study_comparison" for item in audit["items"])


def test_comparison_rejects_different_subjects(tmp_path):
    with TestClient(app) as client:
        demo_id = _create_demo_study(client)
        other_id = _import_other_subject(client, tmp_path)

        response = client.post(
            "/api/comparisons",
            json={"currentStudyId": demo_id, "priorStudyId": other_id},
        )
        assert response.status_code == 400, response.text
        assert "different subjects" in response.json()["detail"].lower()

        missing = client.post(
            "/api/comparisons",
            json={"currentStudyId": demo_id, "priorStudyId": "stu_does_not_exist"},
        )
        assert missing.status_code == 404
        assert "not found" in missing.json()["detail"].lower()


@pytest.fixture
def comparison_db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        def dependency():
            yield db
        previous = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = dependency
        try:
            yield db
        finally:
            if previous is None:
                app.dependency_overrides.pop(get_db, None)
            else:
                app.dependency_overrides[get_db] = previous
    engine.dispose()


def _pair(db):
    subject = Subject(pseudonym=f"comparison-{uuid4().hex}")
    db.add(subject)
    db.flush()
    prior = Study(subject_id=subject.id, study_uid=uuid4().hex, study_date="20250102",
                  status="ready", source="demo", created_at=datetime(2026, 2, 1))
    current = Study(subject_id=subject.id, study_uid=uuid4().hex, study_date="2025-02-03",
                    status="ready", source="demo", created_at=datetime(2026, 1, 1))
    db.add_all([prior, current])
    db.commit()
    return prior, current


def _measurement(**changes):
    values = dict(code="TOTAL_VOLUME", label="合成测试体积", value=120.0, unit="mL",
                  method="manual_research_v1", source="test", validation_status="research",
                  status="computed", provenance={})
    values.update(changes)
    return Measurement(**values)


def _volume(tmp_path, name, **changes):
    z, y, x = np.indices((24, 24, 24))
    array = (200 * np.exp(-((x - 10)**2 / 30 + (y - 12)**2 / 45 + (z - 13)**2 / 25))
             + 50 * np.exp(-((x - 17)**2 + (y - 5)**2 + (z - 9)**2) / 10)).astype(np.uint8)
    path = comparison_module.storage.root / "comparison-tests" / tmp_path.name / f"{name}.u8"
    path.parent.mkdir(parents=True, exist_ok=True)
    array.tofile(path)
    values = dict(id=name, kind="preview_u8", dims=[24, 24, 24], spacing=[1.0, 1.5, 2.0],
                  origin=[10.0, -20.0, 30.0], direction=[0, -1, 0, 1, 0, 0, 0, 0, 1],
                  hu_range=[0, 255], data_path=comparison_module.storage.relative(path), bytes=array.size, pipeline_version="test-v1")
    values.update(changes)
    return VolumeRecord(**values)


def _passed_registration(*args):
    return dict(status="completed", quality="research_qc_passed", metric=-1.0,
                warnings=[comparison_module.RESEARCH_REGISTRATION_NOTE],
                method="test_registration")


def test_candidates_use_acquisition_dates_not_import_order(comparison_db):
    db = comparison_db
    prior, current = _pair(db)
    for value in (None, "", "2025", "20250230", "2025-02-03", "20260101"):
        db.add(Study(subject_id=current.subject_id, study_uid=uuid4().hex,
                     study_date=value, status="ready", source="demo", created_at=datetime(2020, 1, 1)))
    db.commit()
    with TestClient(app) as client:
        response = client.get(f"/api/studies/{current.id}/prior-candidates")
        assert response.status_code == 200
        assert [item["id"] for item in response.json()["items"]] == [prior.id]


@pytest.mark.parametrize("prior_date,current_date", [
    (None, "20250102"), ("20250101", None), ("", "20250102"),
    ("20250230", "20250301"), ("20250102", "2025-01-02"),
    ("20250103", "20250102"), ("2025", "20250102"),
])
def test_api_rejects_unknown_same_or_reversed_dates(comparison_db, prior_date, current_date):
    prior, current = _pair(comparison_db)
    prior.study_date, current.study_date = prior_date, current_date
    comparison_db.commit()
    with TestClient(app) as client:
        response = client.post("/api/comparisons", json={"currentStudyId": current.id, "priorStudyId": prior.id})
        assert response.status_code == 400, response.text
        assert "date" in response.json()["detail"]
        assert not comparison_db.scalars(select(Comparison)).all()


@pytest.mark.parametrize("changes", [
    {"unit": "mm"}, {"method": "different"}, {"source": "reference_atlas"},
    {"validation_status": "not_computed"}, {"status": "not_computed"},
    {"unit": None}, {"value": float("inf")}, {"value": float("nan")},
    {"value": None}, {"segment_aha": 6}, {"provenance": {"label_value": 2}},
])
def test_incomparable_measurements_never_emit_delta(changes):
    result = _compare_measurements(_measurement(**changes), _measurement(value=100), False, (None, None))
    assert result["comparability"]["comparable"] is False
    assert result["comparability"]["warnings"]
    assert result["delta"] is None and result["percent"] is None
    json.dumps(result, allow_nan=False)


def test_compatible_values_zero_baseline_and_numeric_overflow():
    result = _compare_measurements(_measurement(value=120), _measurement(value=100), False, (None, None))
    assert result["comparability"]["comparable"] is True
    assert (result["delta"], result["percent"]) == (20, 20)
    result = _compare_measurements(_measurement(value=120), _measurement(value=0), False, (None, None))
    assert result["delta"] == 120 and result["percent"] is None
    result = _compare_measurements(_measurement(value=1e308), _measurement(value=-1e308), False, (None, None))
    assert result["delta"] is None and not result["comparability"]["comparable"]
    json.dumps(result, allow_nan=False)


def test_missing_measurement_and_unknown_cardiac_phase():
    result = _compare_measurements(None, _measurement(), False, (None, None))
    assert result["current"] is None and result["prior"] == 120
    assert result["delta"] is None
    result = _compare_measurements(_measurement(code="LV_VOLUME"), _measurement(code="LV_VOLUME"), False, (None, None))
    assert any("phase" in warning for warning in result["comparability"]["warnings"])


def test_preview_preserves_physical_origin_direction_and_anisotropic_spacing(tmp_path):
    volume = _volume(tmp_path, "physical")
    image = _preview_image(volume)
    assert image.GetOrigin() == (10, -20, 30)
    assert image.GetDirection() == tuple(volume.direction)
    assert image.TransformIndexToPhysicalPoint((2, 3, 4)) == pytest.approx((5.5, -18, 38))


@pytest.mark.parametrize("changes", [
    {"origin": None}, {"direction": None}, {"direction": [0] * 9},
    {"spacing": [0, 1, 1]}, {"spacing": [float("nan"), 1, 1]},
    {"dims": [24.5, 24, 24]}, {"dims": [24, 24]}, {"dims": [25, 24, 24]},
    {"affine": np.eye(4).tolist()},
])
def test_invalid_geometry_is_failed_not_success(tmp_path, changes):
    good = _volume(tmp_path, "good")
    bad = _volume(tmp_path, "bad", **changes)
    result = _run_registration(bad, good, "current", "prior")
    assert result["status"] == "failed"
    assert result["metric"] is None and result["transform"] is None
    json.dumps(result, allow_nan=False)


def test_constant_and_missing_preview_have_distinct_states(tmp_path):
    volume = _volume(tmp_path, "constant")
    np.zeros((24, 24, 24), dtype=np.uint8).tofile(comparison_module.storage.path_for(volume.data_path))
    assert _run_registration(volume, volume, "current", "prior")["status"] == "failed"
    assert _run_registration(None, volume, "current", "prior")["status"] == "not_run"


def test_transform_matrix_includes_rotation_center():
    transform = sitk.Euler3DTransform()
    transform.SetCenter((20, -10, 30))
    transform.SetRotation(0.1, 0.2, -0.3)
    transform.SetTranslation((4, 5, -2))
    matrix = np.asarray(_transform_matrix(transform))
    point = np.array([8.0, 12.0, -4.0, 1.0])
    assert (matrix @ point)[:3] == pytest.approx(transform.TransformPoint(tuple(point[:3])))


def test_real_registration_tracks_lps_translation(tmp_path):
    prior = _volume(tmp_path, "prior")
    current = _volume(tmp_path, "current", origin=[20.0, -24.0, 33.0])
    result = _run_registration(current, prior, "current", "prior")
    assert result["status"] in {"completed", "low_quality"}, result
    assert result["transform"]["mapping"] == "prior_to_current"
    assert result["transform"]["coordinateSystem"] == "LPS"
    matrix = np.asarray(result["transform"]["matrix"])
    physical_center = _preview_image(prior).TransformContinuousIndexToPhysicalPoint((11.5, 11.5, 11.5))
    mapped_center = (matrix @ np.r_[physical_center, 1])[:3]
    assert mapped_center == pytest.approx(np.asarray(physical_center) + [10, -4, 3], abs=1.0)
    assert result["qualityChecks"]["anatomicalAccuracyValidated"] is False


def test_api_persists_failed_registration_and_incomparable_rows(comparison_db, monkeypatch):
    prior, current = _pair(comparison_db)
    comparison_db.add_all([_measurement(study_id=prior.id, value=100),
                           _measurement(study_id=current.id, value=120, unit="mm"),
                           _measurement(study_id=current.id, code="CURRENT_ONLY")])
    comparison_db.commit()
    monkeypatch.setattr(comparison_module, "_run_registration", lambda *args: {
        "status": "failed", "quality": "not_assessed", "metric": None, "warnings": ["broken preview"],
    })
    with TestClient(app) as client:
        response = client.post("/api/comparisons", json={"currentStudyId": current.id, "priorStudyId": prior.id})
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["status"] == "failed"
        assert len(result["deltas"]) == 2
        assert all(row["delta"] is None and row["percent"] is None for row in result["deltas"])
        total = next(row for row in result["deltas"] if row["code"] == "TOTAL_VOLUME")
        assert total["currentUnit"] == "mm" and total["priorUnit"] == "mL" and total["unit"] is None
        assert client.get(f"/api/comparisons/{result['id']}").json() == result


def test_api_comparable_result_and_provenance_are_round_trippable(comparison_db, monkeypatch):
    prior, current = _pair(comparison_db)
    comparison_db.add_all([_measurement(study_id=prior.id, value=100),
                           _measurement(study_id=current.id, value=120)])
    comparison_db.commit()
    monkeypatch.setattr(comparison_module, "_run_registration", _passed_registration)
    with TestClient(app) as client:
        result = client.post("/api/comparisons", json={"currentStudyId": current.id, "priorStudyId": prior.id}).json()
        assert result["deltas"][0]["delta"] == 20
        assert result["deltas"][0]["percent"] == 20
        assert result["deltas"][0]["comparability"]["current"]["measurementId"]
        assert client.get(f"/api/comparisons/{result['id']}").json() == result


def test_legacy_nan_and_unverified_registration_are_safe_json(comparison_db):
    prior, current = _pair(comparison_db)
    stored = Comparison(current_study_id=current.id, prior_study_id=prior.id,
        status="completed", registration={"status": "completed", "quality": "research_converged", "metric": float("inf")},
        deltas=[{"code": "OLD", "current": float("nan"), "prior": 1, "delta": float("inf"), "percent": 0,
                 "comparability": {"comparable": True}}], warnings=[])
    comparison_db.add(stored)
    comparison_db.commit()
    with TestClient(app) as client:
        response = client.get(f"/api/comparisons/{stored.id}")
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["status"] == "not_comparable"
        assert result["registration"]["metric"] is None
        assert result["deltas"][0]["current"] is None
        assert result["deltas"][0]["delta"] is None
        assert result["deltas"][0]["comparability"]["comparable"] is False


@pytest.mark.parametrize("body", [
    {"currentStudyId": "", "priorStudyId": "x"},
    {"currentStudyId": " ", "priorStudyId": "x"},
    {"currentStudyId": 12, "priorStudyId": "x"},
    {"currentStudyId": "x", "priorStudyId": "y", "unexpected": True},
])
def test_comparison_request_validation(body):
    with TestClient(app) as client:
        assert client.post("/api/comparisons", json=body).status_code == 422


@pytest.mark.parametrize("stop,coverage,metric,expected", [
    ("RegularStepGradientDescentOptimizerv4: Maximum number of iterations (60) exceeded.", 1.0, -1.0, "low_quality"),
    ("RegularStepGradientDescentOptimizerv4: Gradient magnitude tolerance met.", 0.2, -1.0, "low_quality"),
    ("RegularStepGradientDescentOptimizerv4: Step too small after 10 iterations.", 1.0, -1.0, "completed"),
    ("RegularStepGradientDescentOptimizerv4: Step too small after 10 iterations.", 1.0, float("nan"), "failed"),
])
def test_optimizer_name_is_not_convergence_and_overlap_is_required(tmp_path, monkeypatch, stop, coverage, metric, expected):
    original = sitk.ImageRegistrationMethod
    class FakeRegistration:
        RANDOM = original.RANDOM
        def __getattr__(self, name):
            if name.startswith("Set"):
                return lambda *args, **kwargs: None
            raise AttributeError(name)
        def Execute(self, fixed, moving):
            return sitk.Euler3DTransform()
        def GetMetricValue(self):
            return metric
        def GetOptimizerStopConditionDescription(self):
            return stop
        def GetMetricNumberOfValidPoints(self):
            return 100
    monkeypatch.setattr(comparison_module.sitk, "ImageRegistrationMethod", FakeRegistration)
    monkeypatch.setattr(comparison_module, "_registration_overlap", lambda *args: (coverage, coverage))
    volume = _volume(tmp_path, "optimizer")
    result = _run_registration(volume, volume, "current", "prior")
    assert result["status"] == expected
    json.dumps(result, allow_nan=False)


@pytest.mark.parametrize("difference,expected", [
    ("none", True), ("native_spacing", False), ("model", False),
    ("wrong_study", False), ("grid", False), ("missing_segmentation", False),
])
def test_measurement_uses_linked_segmentation_and_native_grid(comparison_db, tmp_path, monkeypatch, difference, expected):
    db = comparison_db
    prior, current = _pair(db)
    for index, study in enumerate((prior, current)):
        volume = _volume(tmp_path, f"volume-{index}", id=f"vol_{index}", study_id=study.id,
                         spacing=[1 + index, 1.5, 2], pipeline_version="public-nifti-v2")
        db.add(volume)
        db.flush()
        segmentation = Segmentation(study_id=study.id, volume_id=volume.id, task="public_dataset_labels",
                                    model_id="same_dataset", model_version="label_map", status="completed")
        db.add(segmentation)
        db.flush()
        provenance = {"segmentation_id": segmentation.id, "measurement_grid": "native_label",
                      "native_geometry": {"spacing": [0.5, 0.5, 0.5]}}
        if index == 1:
            if difference == "native_spacing":
                provenance["native_geometry"]["spacing"] = [0.6, 0.5, 0.5]
            elif difference == "model":
                segmentation.model_version = "different"
            elif difference == "wrong_study":
                segmentation.study_id = prior.id
            elif difference == "grid":
                provenance["measurement_grid"] = "preview"
            elif difference == "missing_segmentation":
                provenance.pop("segmentation_id")
        db.add(_measurement(study_id=study.id, value=100 + 20 * index,
                            method="voxel_count", provenance=provenance))
        # A newer unrelated segmentation must never relabel the measurement provenance.
        db.add(Segmentation(study_id=study.id, volume_id=volume.id, task="other",
                            model_id="unrelated", model_version=f"latest-{index}", status="completed",
                            created_at=datetime(2099, 1, 1)))
    db.commit()
    monkeypatch.setattr(comparison_module, "_run_registration", _passed_registration)
    with TestClient(app) as client:
        response = client.post("/api/comparisons", json={"currentStudyId": current.id, "priorStudyId": prior.id})
        assert response.status_code == 200, response.text
        row = response.json()["deltas"][0]
        assert row["comparability"]["comparable"] is expected, row
        assert row["delta"] == (20 if expected else None)
        if expected:
            assert row["comparability"]["current"]["modelVersion"] == "label_map"
            assert row["comparability"]["current"]["spacing"] == [0.5, 0.5, 0.5]


def test_candidates_ignore_stale_computed_values(comparison_db):
    db = comparison_db
    prior, current = _pair(db)
    db.add(_measurement(study_id=prior.id, value=10, created_at=datetime(2020, 1, 1)))
    db.add(_measurement(study_id=prior.id, value=None, status="not_computed", created_at=datetime(2021, 1, 1)))
    db.commit()
    items = comparison_module.prior_candidates(db, current.id)
    assert items[0]["measurementCodes"] == []
