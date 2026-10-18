from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_ai_report_falls_back_to_template_without_key():
    with TestClient(app) as client:
        response = client.post("/api/studies/demo")
        assert response.status_code == 202, response.text
        study_id = response.json()["study"]["study"]["id"]
        draft = client.post(f"/api/studies/{study_id}/ai/report-draft")
        assert draft.status_code == 200, draft.text
        payload = draft.json()
        assert payload["generator"] == "template"
        assert payload["status"] == "draft"
        assert payload["content"]["sections"]
        assert payload["content"]["provenance"]["fallback_reason"]

        audit = client.get(f"/api/studies/{study_id}/audit").json()
        assert any(item["action"] == "ai_report_draft" for item in audit["items"])
