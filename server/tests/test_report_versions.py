from __future__ import annotations

import copy

from fastapi.testclient import TestClient

from app.main import app


def _create_demo_report(client: TestClient) -> tuple[str, dict]:
    response = client.post("/api/studies/demo")
    assert response.status_code == 202, response.text
    payload = response.json()
    assert payload["job"]["state"] == "succeeded"
    study_id = payload["study"]["study"]["id"]
    reports = payload["study"]["reports"]
    assert len(reports) == 1
    return study_id, reports[0]


def test_report_versions_and_clinician_revision_workflow():
    from app.report_versions import content_hash

    with TestClient(app) as client:
        study_id, report = _create_demo_report(client)
        report_id = report["id"]
        url = f"/api/reports/{report_id}"
        original = copy.deepcopy(report["content"])
        assert client.get(url).json()["version"] == 0
        edited_content = copy.deepcopy(original)
        edited_content["sections"][0]["title"] = "医生修订"
        edited = client.patch(url, json={
            "content": edited_content, "baseVersion": 0, "actor": "dr.editor", "reason": "clarify",
        })
        assert edited.status_code == 200, edited.text
        assert edited.json()["version"] == 2
        versions = client.get(f"{url}/versions").json()["items"]
        assert versions[0]["content"] == original
        assert versions[0]["status"] == "draft"
        assert versions[1]["content"] == edited_content
        for version in versions:
            assert version["contentHash"] == content_hash(version["content"])

        # Mandatory version guard; stale saves and stale approvals cannot write.
        assert client.patch(url, json={"content": edited_content}).status_code == 422
        assert client.patch(url, json={"content": original, "baseVersion": 0}).status_code == 409
        assert client.post(f"{url}/amend", json={
            "content": original, "reason": "stale", "baseVersion": 0,
        }).status_code == 409
        assert client.post(f"{url}/approve", json={
            "baseVersion": 0, "baseContentHash": content_hash(original),
        }).status_code == 409
        assert client.post(f"{url}/approve", json={
            "baseVersion": 2, "baseContentHash": "0" * 64,
        }).status_code == 409
        approved = client.post(f"{url}/approve", json={
            "baseVersion": 2, "baseContentHash": content_hash(edited_content), "approvedBy": "dr.approver",
        })
        assert approved.status_code == 200, approved.text
        assert approved.json()["version"] == 3
        assert approved.json()["approvedBy"] == "dr.approver"
        approval = client.get(f"{url}/versions").json()["items"][-1]
        assert approval["contentHash"] == content_hash(edited_content)
        assert approval["status"] == "approved"
        assert client.patch(url, json={"content": original, "baseVersion": 3}).status_code == 409

        revised = client.post(f"{url}/amend", json={
            "content": original, "baseVersion": 3, "reason": "post-approval correction", "actor": "dr.reviewer",
        })
        assert revised.status_code == 200, revised.text
        assert revised.json()["version"] == 4
        assert revised.json()["status"] == "clinician_reviewed"
        assert revised.json()["approvedBy"] is None
        assert revised.json()["approvedAt"] is None
        assert revised.json()["generator"] == "human"
        assert revised.json()["model"] is None
        versions = client.get(f"{url}/versions").json()["items"]
        assert versions[2] == approval
        assert client.get(url).json()["version"] == 4
        audit = client.get(f"/api/studies/{study_id}/audit").json()
        assert audit["verified"] is True
        assert [item["action"] for item in audit["items"]].count("report_amended") == 1


def test_concurrent_report_edits_only_accept_one_writer():
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    with TestClient(app) as client:
        study_id, report = _create_demo_report(client)
        url = f"/api/reports/{report['id']}"
        barrier = Barrier(2)

        def write(title):
            content = copy.deepcopy(report["content"])
            content["sections"][0]["title"] = title
            barrier.wait(timeout=10)
            return client.patch(url, json={"content": content, "baseVersion": 0})

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(write, ["first editor", "second editor"]))
        assert sorted(result.status_code for result in responses) == [200, 409]
        versions = client.get(f"{url}/versions").json()["items"]
        assert len(versions) == 2
        assert versions[0]["content"] == report["content"]
        winner = next(result.json() for result in responses if result.status_code == 200)
        assert client.get(url).json()["content"] == winner["content"]
        assert client.get(f"/api/studies/{study_id}/audit").json()["verified"] is True


def test_hash_ordering_and_snapshot_copy_and_restore_metadata():
    import pytest
    from app.db import SessionLocal
    from app.models import Report
    from app.report_versions import content_hash, restore, snapshot

    assert content_hash({"b": 2, "a": "中文"}) == content_hash({"a": "中文", "b": 2})
    with pytest.raises(ValueError):
        content_hash({"bad": float("nan")})
    with TestClient(app) as client:
        _, report = _create_demo_report(client)
        with SessionLocal() as db:
            current = db.get(Report, report["id"])
            current.generator, current.model, current.prompt_version = "claude", "test-model", "test-prompt"
            source = copy.deepcopy(current.content)
            first = snapshot(db, current, content=source)
            source["sections"][0]["title"] = "mutated outside snapshot"
            assert first.content["sections"][0]["title"] != source["sections"][0]["title"]
            first_hash = first.content_hash
            current.generator, current.model, current.prompt_version = "human", None, None
            current.approved_by = "old-reviewer"
            restored = restore(db, current, first.version)
            assert (current.generator, current.model, current.prompt_version) == ("claude", "test-model", "test-prompt")
            assert current.approved_by is None
            assert restored.content_hash == first_hash
            with pytest.raises(ValueError, match="new approval"):
                restore(db, current, first.version, status="approved")
            db.rollback()


def test_flagged_report_requires_explicit_review_before_approval():
    from app.report_versions import content_hash

    with TestClient(app) as client:
        _, report = _create_demo_report(client)
        url = f"/api/reports/{report['id']}"
        content = copy.deepcopy(report["content"])
        content["impression"][0]["status"] = "needs_review"
        edited = client.patch(url, json={"content": content, "baseVersion": 0}).json()
        response = client.post(f"{url}/approve", json={
            "baseVersion": edited["version"], "baseContentHash": content_hash(content),
        })
        assert response.status_code == 409
        assert client.get(url).json()["approvedBy"] is None
        content["impression"][0]["status"] = "clinician_reviewed"
        reviewed = client.post(f"{url}/amend", json={
            "content": content, "baseVersion": edited["version"], "reason": "verified evidence",
        })
        assert reviewed.status_code == 200, reviewed.text
        response = client.post(f"{url}/approve", json={
            "baseVersion": reviewed.json()["version"], "baseContentHash": content_hash(content),
        })
        assert response.status_code == 200
