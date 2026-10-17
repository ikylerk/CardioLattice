from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from app.main import app
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

        measurements = {item["code"]: item for item in bundle["measurements"]}
        assert measurements["LV_VOLUME"]["status"] == "computed"
        assert measurements["LV_VOLUME"]["validationStatus"] == "synthetic"
        assert measurements["LV_VOLUME"]["value"] > 0
        for code in ("LV_EF", "STENOSIS_LAD", "FFR_CT", "CALCIUM_SCORE", "AHA_SEGMENTS"):
            assert measurements[code]["status"] == "not_computed"
            assert measurements[code]["reason"]
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

        mesh = client.get(bundle["meshes"][0]["url"])
        assert mesh.status_code == 200
        assert mesh.content[:4] == b"glTF"

        report = bundle["reports"][0]
        assert report["status"] == "draft"
        assert report["generator"] == "template"
        assert report["content"]["language"] == "en"
        assert report["content"]["disclaimer"] == (
            "Research prototype, not a medical device. "
            "This project is not certified by NMPA / FDA / CE, and outputs must not be used "
            "for clinical diagnosis, treatment decisions, or medico-legal purposes. "
            "All data in demo mode is procedurally synthesized."
        )

        approved = client.post(
            f"/api/studies/{study_id}/reports/{report['id']}/approve",
            json={"approvedBy": "dr.test"},
        )
        assert approved.status_code == 200
        assert approved.json()["status"] == "approved"

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
