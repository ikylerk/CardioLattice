"""Codes for API text, and report language chosen at generation."""

from __future__ import annotations

import re
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy.orm import attributes

from app.codes import coded
from app.db import SessionLocal
from app.main import app
from app.models import Report
from app.reporting import DISCLAIMER_EN, DISCLAIMER_ZH, template_report

_CJK = re.compile(r"[\u4e00-\u9fff]")
SERVER_ROOT = Path(__file__).resolve().parents[1]


def _study():
    subject = SimpleNamespace(pseudonym="SUBJ-1", sex="F", age_years=60)
    return SimpleNamespace(
        id="stu_test",
        description="Cardiac CTA",
        modality="CT",
        source="demo",
        study_date="20260101",
        subject=subject,
    )


def _measurement(**kwargs):
    defaults = dict(
        id="mea_1",
        code="LV_VOLUME",
        label="SHOULD_NOT_LEAK",
        value=10.0,
        unit="mL",
        method="voxel_count",
        status="computed",
        reason="SHOULD_NOT_LEAK",
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_template_report_is_frozen_in_the_requested_language():
    study = _study()
    measurements = [
        _measurement(),
        _measurement(
            id="mea_ef",
            code="LV_EF",
            reason="LV_EF_REQUIRES_TWO_PHASES",
            value=None,
            unit=None,
            method="not_available",
            status="not_computed",
        ),
    ]
    english = template_report(study, measurements, "en")
    chinese = template_report(study, measurements, "zh")

    assert english["lang"] == "en"
    assert chinese["lang"] == "zh"
    assert "language" not in english
    assert "language" not in chinese
    assert english["provenance"]["lang"] == "en"
    assert chinese["provenance"]["lang"] == "zh"
    assert "language" not in english["provenance"]
    assert "language" not in chinese["provenance"]
    assert english["disclaimer"] == DISCLAIMER_EN
    assert chinese["disclaimer"] == DISCLAIMER_ZH
    assert "不是医疗器械" in chinese["disclaimer"]
    assert "NMPA / FDA / CE" in english["disclaimer"]
    assert "medico-legal" in english["disclaimer"]
    assert "SHOULD_NOT_LEAK" not in str(english)
    assert "SHOULD_NOT_LEAK" not in str(chinese)
    assert _CJK.search(str(english)) is None
    assert _CJK.search(chinese["disclaimer"])


def test_codes_params_and_report_lang_query():
    files = {"files": ("notes.txt", b"this is not a dicom file", "text/plain")}
    with TestClient(app) as client:
        missing = client.post("/api/studies", files=files)
        header_only = client.post("/api/studies", files=files, headers={"Accept-Language": "zh"})
        invalid = client.post("/api/studies/demo?lang=fr")
        region = client.post("/api/studies/demo?lang=zh-CN")
        assert missing.status_code == 400
        assert header_only.status_code == 400
        assert missing.json()["detail"] == coded("NO_CT_SERIES")
        assert header_only.json()["detail"] == coded("NO_CT_SERIES")
        assert invalid.status_code == 400
        assert invalid.json()["detail"] == coded("INVALID_LANG", lang="fr")
        assert region.json()["detail"] == coded("INVALID_LANG", lang="zh-CN")

        not_found = client.get("/api/studies/stu_missing", headers={"Accept-Language": "zh"})
        assert not_found.status_code == 404
        assert not_found.json()["detail"] == coded("STUDY_NOT_FOUND")

        root = client.get("/", headers={"Accept-Language": "zh"})
        assert root.json()["warning"] == DISCLAIMER_EN
        assert _CJK.search(root.json()["warning"]) is None

        models = client.get("/api/models", headers={"Accept-Language": "zh"}).json()["models"]
        assert models[0]["intendedUse"] == coded("MODEL_SYNTHETIC_INTENDED_USE")
        assert models[2]["license"] == coded("MODEL_LUMEN_LICENSE")


def _assert_codes(bundle: dict):
    job = bundle["jobs"][-1]
    assert job["stage"] == "succeeded"
    assert job["message"] == coded("STAGE_SUCCEEDED")
    assert job["error"] is None
    reasons = bundle["series"][0]["reasons"]
    assert coded("SERIES_CT_MODALITY") in reasons
    assert coded("SERIES_AXIAL_GEOMETRY") in reasons
    assert all(isinstance(item, dict) and "params" in item for item in reasons)
    measurements = {item["code"]: item for item in bundle["measurements"]}
    assert measurements["LV_VOLUME"]["label"] == coded("LV_VOLUME")
    assert measurements["LV_VOLUME"]["reason"] is None
    assert measurements["LV_EF"]["label"] == coded("LV_EF")
    assert measurements["LV_EF"]["reason"] == coded("LV_EF_REQUIRES_TWO_PHASES")
    assert measurements["STENOSIS_LAD"]["reason"] == coded("NO_VALIDATED_LUMEN_MODEL")
    assert measurements["FFR_CT"]["reason"] == coded("FFR_CT_REQUIRES_MODEL")
    assert measurements["CALCIUM_SCORE"]["reason"] == coded("CALCIUM_SCORE_REQUIRES_NONCONTRAST")
    assert measurements["AHA_SEGMENTS"]["reason"] == coded("AHA_NOT_FROM_CTA")
    marker = bundle["volumes"][0]["markers"][0]["label"]
    assert marker == coded("MARKER_CALCIFICATION_SYNTHETIC")
    warning = bundle["segmentations"][0]["quality"]["warnings"][0]
    assert warning == coded("QUALITY_SYNTHETIC_GROUND_TRUTH")
    assert bundle["segmentations"][0]["provenance"]["note"] == coded("NOTE_SYNTHETIC_FIXTURE")
    assert bundle["meshes"][0]["sceneTransform"]["note"] == coded("NOTE_GLB_SCENE_UNITS")
    return measurements


def test_demo_lang_en_zh_default_and_legacy_report():
    with TestClient(app) as client:
        default = client.post("/api/studies/demo", headers={"Accept-Language": "zh"})
        assert default.status_code == 202, default.text
        default_bundle = default.json()["study"]
        _assert_codes(default_bundle)
        default_report = default_bundle["reports"][0]["content"]
        assert default_report["lang"] == "en"
        assert "language" not in default_report
        assert default_report["disclaimer"] == DISCLAIMER_EN
        # Known labels are codes; new research fields retain their source text.
        assert _CJK.search(str(_assert_codes(default_bundle)["LV_VOLUME"])) is None
        assert _CJK.search(str(default_bundle["jobs"])) is None

        explicit = client.post("/api/studies/demo?lang=en")
        assert explicit.json()["study"]["reports"][0]["content"]["lang"] == "en"
        assert explicit.json()["study"]["reports"][0]["content"]["disclaimer"] == DISCLAIMER_EN

        created = client.post("/api/studies/demo?lang=zh", headers={"Accept-Language": "en"})
        assert created.status_code == 202, created.text
        bundle = created.json()["study"]
        _assert_codes(bundle)
        content = bundle["reports"][0]["content"]
        assert content["lang"] == "zh"
        assert content["provenance"]["lang"] == "zh"
        assert "language" not in content
        assert "language" not in content["provenance"]
        assert content["disclaimer"] == DISCLAIMER_ZH
        assert "本检查为程序化合成的 DICOM 夹具" in str(content)
        study_id = bundle["study"]["id"]
        report = bundle["reports"][0]

        again = client.get(f"/api/studies/{study_id}", headers={"Accept-Language": "en"})
        again_content = again.json()["reports"][0]["content"]
        assert again_content == content
        assert again.json()["measurements"]
        assert {item["code"]: item["reason"] for item in again.json()["measurements"]}[
            "LV_EF"
        ] == coded("LV_EF_REQUIRES_TWO_PHASES")

        approved = client.post(
            f"/api/studies/{study_id}/reports/{report['id']}/approve",
            json={"approvedBy": "dr.test", "baseVersion": report["version"], "baseContentHash": report["contentHash"]},
        )
        assert approved.status_code == 200
        assert approved.json()["content"]["disclaimer"] == DISCLAIMER_ZH
        assert approved.json()["content"]["lang"] == "zh"

        db = SessionLocal()
        try:
            row = db.get(Report, report["id"])
            legacy = {
                "schema_version": "report/v1",
                "study_id": study_id,
                "status": "approved",
                "lang": "zh",
                "disclaimer": "研究原型。不得用于临床诊断或治疗决策。",
                "provenance": {"lang": "zh"},
                "impression": [{"text": "旧报告原文"}],
            }
            assert "language" not in legacy
            row.content = legacy
            attributes.flag_modified(row, "content")
            db.commit()
            stored_copy = dict(row.content)
        finally:
            db.close()

        legacy_response = client.get(f"/api/studies/{study_id}")
        assert legacy_response.json()["reports"][0]["content"] == stored_copy
        assert legacy_response.json()["reports"][0]["content"]["lang"] == "zh"
        assert legacy_response.json()["reports"][0]["content"]["provenance"]["lang"] == "zh"
        assert "language" not in legacy_response.json()["reports"][0]["content"]

        db = SessionLocal()
        try:
            row = db.get(Report, report["id"])
            assert row.content == stored_copy
        finally:
            db.close()
        assert client.get(f"/api/studies/{study_id}/audit").json()["verified"] is True



def test_new_measurement_labels_and_failure_reasons_are_preserved():
    measurement = _measurement(code="CORONARY_TEST", label="Coronary centerline", value=None,
                               status="not_computed", reason="Disconnected mask; coverage is insufficient.")
    for lang in ("en", "zh"):
        report = template_report(_study(), [measurement], lang)
        claim = report["sections"][-1]["claims"][0]["text"]
        assert "Coronary centerline" in claim
        assert measurement.reason in claim


def test_ai_generation_language_and_invalid_language(monkeypatch):
    from app.ai import report_generator
    monkeypatch.setattr(report_generator.settings, "anthropic_api_key", None)
    with TestClient(app) as client:
        bundle = client.post("/api/studies/demo?lang=zh").json()["study"]
        url = f"/api/studies/{bundle['study']['id']}/ai/report-draft"
        assert client.post(url + "?lang=fr").status_code == 400
        for lang in ("en", "zh"):
            result = client.post(url + f"?lang={lang}")
            assert result.status_code == 200, result.text
            content = result.json()["content"]
            assert content["lang"] == lang
            assert content["provenance"]["lang"] == lang
            assert content["provenance"]["fallback_code"] == "not_configured"


def test_specific_failure_is_not_replaced_by_generic_measurement_reason():
    measurement = _measurement(code="LV_EF", value=None, status="not_computed",
                               reason="Phase metadata is invalid for this acquisition.")
    for lang in ("en", "zh"):
        content = template_report(_study(), [measurement], lang)
        assert measurement.reason in content["sections"][-1]["claims"][0]["text"]
