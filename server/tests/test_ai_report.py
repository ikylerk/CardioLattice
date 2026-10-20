from __future__ import annotations

import pytest
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


def test_ai_regeneration_preserves_approval_and_clears_current_signoff():
    from app.report_versions import content_hash

    with TestClient(app) as client:
        payload = client.post("/api/studies/demo").json()
        report = payload["study"]["reports"][0]
        study_id = report["studyId"]
        url = f"/api/reports/{report['id']}"
        approved = client.post(f"{url}/approve", json={
            "baseVersion": 0, "baseContentHash": content_hash(report["content"]), "approvedBy": "dr.ai-test",
        })
        assert approved.status_code == 200, approved.text
        old_versions = client.get(f"{url}/versions").json()["items"]
        draft = client.post(f"/api/studies/{study_id}/ai/report-draft")
        assert draft.status_code == 200, draft.text
        result = draft.json()
        assert result["version"] == 3
        assert result["status"] == "draft"
        assert result["approvedBy"] is None and result["approvedAt"] is None
        assert result["generator"] == "template" and result["model"] is None
        versions = client.get(f"{url}/versions").json()["items"]
        assert versions[:2] == old_versions
        assert versions[-1]["contentHash"] == content_hash(result["content"])


def test_ai_generation_rejects_a_report_edited_while_model_was_running(monkeypatch):
    from app.routes import ai
    from app.db import SessionLocal
    from app.models import Report
    from app.report_versions import amend

    original_generate = ai.generate_report_draft

    def interrupted(db, study):
        content = original_generate(db, study)
        # Simulate a different request committing during the model call.
        with SessionLocal() as other:
            report = other.query(Report).filter_by(study_id=study.id).first()
            edited = dict(report.content, concurrent_note="preserve clinician's edit")
            amend(other, report, edited, actor="dr.concurrent", reason="concurrent review")
            other.commit()
        return content

    monkeypatch.setattr(ai, "generate_report_draft", interrupted)
    with TestClient(app) as client:
        payload = client.post("/api/studies/demo").json()["study"]
        study_id = payload["study"]["id"]
        report_id = payload["reports"][0]["id"]
        result = client.post(f"/api/studies/{study_id}/ai/report-draft")
        assert result.status_code == 409, result.text
        current = client.get(f"/api/reports/{report_id}").json()
        assert current["content"]["concurrent_note"] == "preserve clinician's edit"
        assert current["generator"] == "human"
        audit = client.get(f"/api/studies/{study_id}/audit").json()
        assert not any(item["action"] == "ai_report_draft" for item in audit["items"])


def _model_fixture():
    from types import SimpleNamespace
    from unittest.mock import Mock

    study = SimpleNamespace(
        id="study-test", subject=None, study_date=None, description="研究检查", modality="CT", source="demo",
    )
    measurement = SimpleNamespace(
        id="m1", code="volume", label="体积", value=1.25, unit="ml",
        method="mask", source="synthetic", validation_status="research_only", status="computed", reason=None,
    )
    db = Mock()
    db.scalars.return_value.all.return_value = [measurement]
    tool = {
        "summary": "研究检查摘要。",
        "findings": [{"text": "体积为 1.25 ml。", "evidence_refs": ["m1"]}],
        "impression": [{"text": "体积为 1.25 ml，需复核。", "evidence_refs": ["m1"]}],
        "recommendations": [{"text": "复核现有测量。", "evidence_refs": ["m1"], "category": "research_follow_up"}],
        "limitations": ["仅供研究使用。"],
    }
    return db, study, measurement, tool


def test_valid_model_result_keeps_traceable_ai_label(monkeypatch):
    from app.ai import report_generator as generator

    db, study, _, tool = _model_fixture()
    monkeypatch.setattr(generator.settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(generator, "_call_claude", lambda facts: tool)
    content, source, model = generator.generate_report_draft(db, study)
    assert source == "claude" and model == generator.settings.anthropic_model
    assert content["provenance"]["measurement_ids"] == ["m1"]
    assert content["provenance"]["flagged_claim_ids"] == []


def test_invalid_model_responses_fall_back_without_service_error_leaks(monkeypatch):
    import copy
    from app.ai import report_generator as generator

    db, study, measurement, valid = _model_fixture()
    monkeypatch.setattr(generator.settings, "anthropic_api_key", "test-key")
    invalid = [None, {}, {"summary": "partial"}]
    for refs in ([], ["invented"], "m1"):
        tool = copy.deepcopy(valid)
        tool["findings"][0]["evidence_refs"] = refs
        invalid.append(tool)
    tool = copy.deepcopy(valid)
    tool["recommendations"][0]["category"] = "treatment"
    invalid.append(tool)
    for response in invalid:
        monkeypatch.setattr(generator, "_call_claude", lambda facts, result=response: result)
        content, source, model = generator.generate_report_draft(db, study)
        assert source == "template" and model is None
        assert content["provenance"]["generator"] == "template"
        assert content["provenance"]["fallback_code"] == "generation_or_validation_failed"
    measurement.status = "not_computed"
    monkeypatch.setattr(generator, "_call_claude", lambda facts: valid)
    assert generator.generate_report_draft(db, study)[1] == "template"

    def fail(facts):
        raise RuntimeError("secret-token patient-identifier upstream response")
    monkeypatch.setattr(generator, "_call_claude", fail)
    content, source, _ = generator.generate_report_draft(db, study)
    assert source == "template"
    assert "secret-token" not in str(content)
    assert "patient-identifier" not in str(content)


def test_numeric_guardrail_covers_impression_recommendation_and_small_values():
    from app.ai.report_generator import _build_content, _numeric_guardrail

    _, study, measurement, tool = _model_fixture()
    tool["findings"][0]["text"] = "体积 1.3 ml"
    tool["impression"][0]["text"] = "体积 9e2 ml"
    tool["recommendations"][0]["text"] = "复核体积 .9 ml"
    content = _build_content(study, tool, "fake-model", [measurement])
    assert set(content["provenance"]["flagged_claim_ids"]) == {"c_finding_1", "i_1", "r_1"}
    assert content["impression"][0]["status"] == "needs_review"
    assert content["recommendations"][0]["status"] == "needs_review"
    measurement.value = 0.49
    content = {"sections": [{"claims": [{"id": "zero", "text": "数值 0", "evidence_refs": ["m1"]}]}]}
    assert _numeric_guardrail(content, [measurement]) == ["zero"]


@pytest.mark.parametrize("response_kind", ["submit_report", "text_only", "wrong_tool", "empty"])
def test_sonnet_sdk_request_contract_and_missing_report_fallback(monkeypatch, response_kind):
    """Exercise the installed SDK's actual HTTP serialization without networking."""
    import json
    import anthropic
    import httpx2 as httpx
    from app.ai import report_generator as generator

    db, study, _, tool = _model_fixture()
    monkeypatch.setattr(generator.settings, "anthropic_api_key", "test-only-key")
    monkeypatch.setattr(generator.settings, "anthropic_model", "claude-sonnet-5-5")
    if response_kind in ("submit_report", "wrong_tool"):
        blocks = [{
            "type": "tool_use", "id": "toolu_test",
            "name": "submit_report" if response_kind == "submit_report" else "another_tool",
            "input": tool,
        }]
    elif response_kind == "text_only":
        blocks = [{"type": "text", "text": "Unstructured text must not become an AI report."}]
    else:
        blocks = []
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(200, json={
            "id": "msg_test", "type": "message", "role": "assistant",
            "model": "claude-sonnet-5-5", "content": blocks,
            "stop_reason": "tool_use" if response_kind in ("submit_report", "wrong_tool") else "end_turn",
            "stop_sequence": None, "usage": {"input_tokens": 1, "output_tokens": 1},
        })

    with anthropic.Anthropic(
        api_key="test-only-key",
        base_url="https://api.anthropic.com",  # Ignore local gateway overrides; transport is mocked.
        http_client=httpx.Client(transport=httpx.MockTransport(respond)),
    ) as sdk:
        monkeypatch.setattr(anthropic, "Anthropic", lambda **kwargs: sdk)
        content, source, model = generator.generate_report_draft(db, study)

    # Assert on bytes serialized by the installed SDK, not only method kwargs.
    assert len(requests) == 1
    assert requests[0].method == "POST"
    assert requests[0].url.path == "/v1/messages"
    payload = json.loads(requests[0].content)
    assert payload["model"] == "claude-sonnet-5-5"
    assert payload["tool_choice"] == {"type": "auto"}
    assert not {"temperature", "top_p", "top_k"} & payload.keys()
    assert payload["tools"] == [generator.REPORT_TOOL]
    assert json.loads(payload["messages"][0]["content"])["measurements"][0]["id"] == "m1"

    if response_kind == "submit_report":
        assert source == "claude" and model == "claude-sonnet-5-5"
        assert content["provenance"]["generator"] == "claude"
        assert "fallback_code" not in content["provenance"]
    else:
        assert source == "template" and model is None
        assert content["provenance"]["generator"] == "template"
        assert content["provenance"]["model"] is None
        assert content["provenance"]["fallback_code"] == "generation_or_validation_failed"
        assert content["provenance"]["fallback_reason"] == "AI 调用或结果校验失败，已使用确定性模板。"
        assert "Unstructured text" not in json.dumps(content)
