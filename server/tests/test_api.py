from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.codes import coded
from app.main import app
from app.models import Measurement, Report
from app.schemas import measurement_out, report_out
from scripts.make_synthetic_dicom import generate_fixture


def test_demo_pipeline_end_to_end():
    with TestClient(app) as client:
        response = client.post("/api/studies/demo")
        assert response.status_code == 202, response.text
        payload = response.json()
        assert payload["job"]["state"] == "succeeded"
        assert payload["job"]["stage"] == "succeeded"
        assert payload["job"]["progress"] == 100
        assert payload["job"]["message"] == {"code": "STAGE_SUCCEEDED", "params": {}}
        study_id = payload["study"]["study"]["id"]

        bundle = client.get(f"/api/studies/{study_id}").json()
        assert bundle["study"]["status"] == "ready"
        assert len(bundle["volumes"]) == 1
        assert len(bundle["meshes"]) == 7
        assert len(bundle["reports"]) == 1
        segmentation = bundle["segmentations"][0]
        assert segmentation["standardLabelMap"]["LV"] == "HEART_LV"
        assert segmentation["standardLabelMap"]["AO"] == "AORTA"

        measurements = {item["code"]: item for item in bundle["measurements"]}
        assert measurements["LV_VOLUME"]["status"] == "computed"
        assert measurements["LV_VOLUME"]["validationStatus"] == "synthetic"
        assert measurements["LV_VOLUME"]["value"] > 0
        for code in ("LV_EF", "STENOSIS_LAD", "FFR_CT", "CALCIUM_SCORE", "AHA_SEGMENTS"):
            assert measurements[code]["status"] == "not_computed"
            assert measurements[code]["reason"]
        assert measurements["ATLAS_REGISTRATION_RMS"]["status"] == "computed"
        assert measurements["ATLAS_REGISTRATION_RMS"]["value"] >= 0
        assert measurements["ATLAS_REGISTERED_TARGETS"]["value"] == 11
        assert len(measurements["ATLAS_REGISTRATION_RMS"]["provenance"]["targets"]) == 11
        assert measurements["LV_EF"]["code"] == "LV_EF"
        assert measurements["LV_EF"]["reason"] == {
            "code": "LV_EF_REQUIRES_TWO_PHASES",
            "params": {},
        }
        assert measurements["LV_VOLUME"]["label"] == {"code": "LV_VOLUME", "params": {}}

        volume = bundle["volumes"][0]
        data = client.get(volume["dataUrl"])
        assert data.status_code == 200
        assert len(data.content) == int(np.prod(volume["dims"]))

        registration = client.get(f"/api/studies/{study_id}/registration")
        assert registration.status_code == 200
        registration_data = registration.json()
        assert registration_data["validationStatus"] == "research"
        assert len(registration_data["targets"]) == 11

        mesh = client.get(bundle["meshes"][0]["url"])
        assert mesh.status_code == 200
        assert mesh.content[:4] == b"glTF"

        report = bundle["reports"][0]
        assert report["status"] == "draft"
        assert report["generator"] == "template"
        assert report["content"]["lang"] == "en"
        assert "language" not in report["content"]
        assert report["content"]["disclaimer"] == (
            "Research prototype, not a medical device. "
            "This project is not certified by NMPA / FDA / CE, and outputs must not be used "
            "for clinical diagnosis, treatment decisions, or medico-legal purposes. "
            "All data in demo mode is procedurally synthesized."
        )

        missing_lock = client.post(
            f"/api/studies/{study_id}/reports/{report['id']}/approve",
            json={"approvedBy": "dr.test"},
        )
        assert missing_lock.status_code == 422
        approved = client.post(
            f"/api/studies/{study_id}/reports/{report['id']}/approve",
            json={"approvedBy": "dr.test", "baseVersion": report["version"],
                  "baseContentHash": report["contentHash"]},
        )
        assert approved.status_code == 200
        assert approved.json()["status"] == "approved"
        updated = client.get(f"/api/studies/{study_id}").json()["reports"][0]
        assert updated["version"] == approved.json()["version"]
        assert updated["contentHash"] == approved.json()["contentHash"]
        stale = client.post(
            f"/api/studies/{study_id}/reports/{report['id']}/approve",
            json={"approvedBy": "dr.test", "baseVersion": report["version"],
                  "baseContentHash": report["contentHash"]},
        )
        assert stale.status_code == 409

        audit = client.get(f"/api/studies/{study_id}/audit").json()
        assert audit["verified"] is True
        assert any(item["action"] == "report_approved" for item in audit["items"])

        deleted = client.delete(f"/api/studies/{study_id}")
        assert deleted.status_code == 200
        assert client.get(f"/api/studies/{study_id}").status_code == 404


def test_upload_path_does_not_invent_measurements(tmp_path):
    fixture = generate_fixture(tmp_path / "upload_fixture")
    archive = fixture["zip_path"]

    with TestClient(app) as client:
        with open(archive, "rb") as handle:
            response = client.post(
                "/api/studies",
                files={"files": ("synthetic_ccta.zip", handle, "application/zip")},
            )
        assert response.status_code == 202, response.text
        study_id = response.json()["study"]["study"]["id"]
        bundle = client.get(f"/api/studies/{study_id}").json()

        assert bundle["study"]["status"] == "ready"
        assert len(bundle["volumes"]) == 1
        # A real upload has no synthetic ground truth, so no mesh or computed
        # measurements may be fabricated.
        assert bundle["meshes"] == []
        assert bundle["segmentations"] == []
        assert all(item["status"] == "not_computed" for item in bundle["measurements"])
        assert len(bundle["reports"]) == 1


def test_rejects_non_dicom_upload():
    with TestClient(app) as client:
        response = client.post(
            "/api/studies",
            files={"files": ("notes.txt", b"this is not a dicom file", "text/plain")},
        )
        assert response.status_code == 400


def test_health_and_feature_routes_survive_bilingual_merge(monkeypatch):
    from app.routes import studies

    capabilities = {
        "reportDraft": {"status": "configured_unverified", "reason": "not probed"},
        "imageSegmentation": {"status": "dependency_missing", "reason": "not installed"},
    }
    monkeypatch.setattr(studies, "get_runtime_capabilities", lambda: capabilities)
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["capabilities"] == capabilities
        assert health.json()["pipelineVersion"] == studies.PIPELINE_VERSION
        assert health.json()["researchOnly"] is True
        assert client.get("/api/coronary-model").status_code == 200
        assert client.get("/api/organ-targets").status_code == 200
        paths = client.get("/openapi.json").json()["paths"]
        assert "/api/comparisons" in paths
        assert "/api/studies/{study_id}/prior-candidates" in paths
        assert "/api/public/import" in paths
        assert "/api/studies/{study_id}/ai/report-draft" in paths


@pytest.mark.parametrize(
    ("code", "label", "reason"),
    [
        ("CORONARY_TREE_CENTERLINE", "冠脉中心线", "Skeletonization lost a connected component."),
        ("ATLAS_REGISTRATION_RMS", "图谱配准误差", "Registration failed: insufficient landmarks."),
        ("LV_EF", "心室射血分数", "Acquisition phase metadata is invalid."),
        ("NEW_RESEARCH_METRIC", "新增研究指标", '{"code":"CUSTOM_FAILURE","params":{"detail":"source missing"}}'),
    ],
)
def test_measurement_schema_preserves_recorded_failure_and_unknown_label(code, label, reason):
    item = Measurement(
        code=code, label=label, value=None, unit="mm", status="not_computed",
        reason=reason, method="research", source="public_dataset", validation_status="research",
    )
    result = measurement_out(item)
    assert result["status"] == "not_computed"
    assert result["value"] is None
    if code == "NEW_RESEARCH_METRIC":
        assert result["reason"] == {"code": "CUSTOM_FAILURE", "params": {"detail": "source missing"}}
    else:
        assert result["reason"] == reason
    assert result["label"] == (coded("LV_EF") if code == "LV_EF" else label)


def test_generic_volume_label_allows_code_parameter_and_missing_reason_stays_unknown():
    item = Measurement(code="CORONARY_LEFT_VOLUME", label="左冠脉体积", status="computed", value=1.2)
    result = measurement_out(item)
    assert result["label"] == {"code": "VOLUME", "params": {"code": "CORONARY_LEFT"}}
    assert result["reason"] is None
    unknown = Measurement(code="NEW_METRIC", label="新指标", status="not_computed")
    assert measurement_out(unknown)["reason"] is None
    assert measurement_out(unknown)["label"] == "新指标"
    unknown.status = "failed"
    unknown.reason = "native geometry is unavailable"
    assert measurement_out(unknown)["reason"] == unknown.reason


def test_detached_report_does_not_fabricate_version_or_translate_content():
    from app.report_versions import content_hash

    content = {"lang": "zh", "sections": [{"title": "原始报告", "claims": []}]}
    report = Report(id="rep_detached", study_id="stu_detached", content=content, status="draft")
    result = report_out(report)
    assert result["version"] is None
    assert result["contentHash"] == content_hash(content)
    assert result["content"] == content
