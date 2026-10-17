from __future__ import annotations

import json
import re
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.i18n import DISCLAIMER_EN, negotiate, t
from app.main import app
from app.models import Report
from app.reporting import annotate_report_language, template_report

CJK = re.compile(r"[\u4e00-\u9fff]")
SERVER_ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".venv", "venv", "__pycache__", ".pytest_cache", "var", ".uv"}


def _assert_no_cjk(payload) -> None:
    text = json.dumps(payload, ensure_ascii=False)
    match = CJK.search(text)
    assert match is None, text[max(0, match.start() - 80) : match.end() + 80]


def _study():
    return SimpleNamespace(
        id="stu_test",
        description="Cardiac CTA",
        modality="CT",
        source="demo",
        study_date="20261017",
        subject=SimpleNamespace(pseudonym="SUBJ-TEST", sex="M", age_years=40),
    )


def _item(**overrides):
    values = {
        "id": "mea_1",
        "status": "not_computed",
        "value": None,
        "label": "SHOULD_NOT_LEAK",
        "reason": "SHOULD_NOT_LEAK",
        "code": "LV_EF",
        "unit": None,
        "method": "not_available",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_negotiate_only_exact_zh_selects_chinese():
    assert negotiate(None) == "en"
    assert negotiate("") == "en"
    assert negotiate("en") == "en"
    assert negotiate("EN") == "en"
    assert negotiate("zh") == "zh"
    assert negotiate("ZH") == "zh"
    assert negotiate("zh,en;q=0.5") == "zh"
    assert negotiate("zh;q=0.9") == "zh"
    assert negotiate("zh-CN") == "en"
    assert negotiate("zh-Hans") == "en"
    assert negotiate("fr") == "en"
    assert negotiate("en-US,en;q=0.9") == "en"


def test_template_report_languages_do_not_leak_stored_labels():
    study = _study()
    measurements = [
        _item(
            id="mea_vol",
            status="computed",
            value=12.5,
            code="LV_VOLUME",
            unit="mL",
            method="voxel_count",
            reason=None,
        ),
        _item(),
    ]
    english = template_report(study, measurements, "en")
    chinese = template_report(study, measurements, "zh")

    assert english["language"] == "en"
    assert chinese["language"] == "zh"
    assert english["disclaimer"] == DISCLAIMER_EN
    assert chinese["disclaimer"].startswith(DISCLAIMER_EN)
    assert "不得用于临床诊断或治疗决策" in chinese["disclaimer"]
    assert "SHOULD_NOT_LEAK" not in json.dumps(english)
    assert "SHOULD_NOT_LEAK" not in json.dumps(chinese, ensure_ascii=False)
    _assert_no_cjk(english)
    assert CJK.search(json.dumps(chinese, ensure_ascii=False))
    assert "LV_EF" not in english["sections"][2]["claims"][0]["text"]
    assert english["sections"][2]["claims"][0]["text"].startswith(
        "Left ventricular ejection fraction (EF) was not computed:"
    )
    assert "单时相 CTA 不可计算" in chinese["sections"][2]["claims"][0]["text"]
    assert english["impression"][0]["status"] == "research_only"
    assert chinese["impression"][0]["status"] == "research_only"
    assert english["study"]["source"] == "demo"
    assert chinese["study"]["source"] == "demo"


def test_legacy_report_language_is_marked_without_mutating_the_document():
    legacy = {"sections": [{"title": "检查摘要", "claims": [{"text": "旧版中文报告"}]}]}
    marked = annotate_report_language(legacy)
    assert "language" not in legacy
    assert marked["language"] == "zh-CN"
    assert marked["sections"] == legacy["sections"]

    english = {"sections": [{"title": "Study summary"}]}
    assert annotate_report_language(english)["language"] == "en"
    assert "language" not in english

    stored = {"language": "zh-CN", "disclaimer": "研究原型。不得用于临床诊断或治疗决策。"}
    assert annotate_report_language(stored) is stored


def test_error_root_and_models_follow_accept_language():
    files = {"files": ("notes.txt", b"this is not a dicom file", "text/plain")}
    with TestClient(app) as client:
        missing = client.post("/api/studies", files=files)
        english = client.post("/api/studies", files=files, headers={"Accept-Language": "en"})
        chinese = client.post("/api/studies", files=files, headers={"Accept-Language": "zh"})
        region = client.post("/api/studies", files=files, headers={"Accept-Language": "zh-CN"})
        french = client.post("/api/studies", files=files, headers={"Accept-Language": "fr"})

        assert missing.status_code == english.status_code == chinese.status_code == 400
        assert missing.json()["detail"] == english.json()["detail"] == region.json()["detail"]
        assert french.json()["detail"] == english.json()["detail"]
        assert english.json()["detail"] == t("error.no_ct_series", "en")
        assert chinese.json()["detail"] == t("error.no_ct_series", "zh")
        _assert_no_cjk(english.json())
        assert CJK.search(chinese.json()["detail"])

        not_found = client.get("/api/studies/stu_missing")
        not_found_zh = client.get("/api/studies/stu_missing", headers={"Accept-Language": "zh"})
        assert not_found.status_code == 404
        assert not_found.json()["detail"] == "Study not found."
        assert not_found_zh.json()["detail"] == "未找到该检查。"

        root_missing = client.get("/")
        root_en = client.get("/", headers={"Accept-Language": "en"})
        root_zh = client.get("/", headers={"Accept-Language": "zh"})
        assert root_missing.json()["warning"] == root_en.json()["warning"] == DISCLAIMER_EN
        assert root_zh.json()["warning"].startswith(DISCLAIMER_EN)
        assert "不得用于临床诊断或治疗决策" in root_zh.json()["warning"]
        assert root_zh.json()["status"] == "ok"

        models_en = client.get("/api/models", headers={"Accept-Language": "en"})
        models_zh = client.get("/api/models", headers={"Accept-Language": "zh"})
        assert models_en.json()["models"][2]["regulatoryStatus"] == "not_computed"
        assert models_zh.json()["models"][2]["regulatoryStatus"] == "not_computed"
        assert models_en.json()["models"][2]["intendedUse"] == "Not configured."
        assert models_zh.json()["models"][2]["intendedUse"] == "未配置。"
        _assert_no_cjk(models_en.json())


def _bundle_text(bundle: dict) -> str:
    return json.dumps(bundle, ensure_ascii=False)


def test_demo_accept_language_en_has_no_chinese():
    with TestClient(app) as client:
        response = client.post("/api/studies/demo", headers={"Accept-Language": "en"})
        assert response.status_code == 202, response.text
        payload = response.json()
        _assert_no_cjk(payload)
        assert payload["job"]["stage"] == "succeeded"
        assert payload["job"]["message"] == "Pipeline completed"
        study_id = payload["study"]["study"]["id"]
        bundle = payload["study"]
        measurements = {item["code"]: item for item in bundle["measurements"]}
        assert measurements["LV_EF"]["status"] == "not_computed"
        assert measurements["LV_EF"]["reason"] == t("measurement.LV_EF.reason", "en")
        assert measurements["STENOSIS_LAD"]["label"] == "LAD stenosis severity"
        assert measurements["FFR_CT"]["code"] == "FFR_CT"
        report = bundle["reports"][0]["content"]
        assert report["language"] == "en"
        assert report["disclaimer"] == DISCLAIMER_EN
        assert any(reason == "CT modality" for reason in bundle["series"][0]["reasons"])
        marker_labels = [marker["label"] for marker in bundle["volumes"][0]["markers"]]
        assert "Calcified focus (synthetic)" in marker_labels
        assert bundle["segmentations"][0]["provenance"]["note"] == t("note.synthetic_fixture", "en")
        assert bundle["meshes"][0]["sceneTransform"]["note"] == t("note.glb_scene_units", "en")

        again = client.get(f"/api/studies/{study_id}", headers={"Accept-Language": "fr"})
        assert again.status_code == 200
        _assert_no_cjk(again.json())


def test_demo_zh_keeps_stored_report_and_localizes_labels():
    with TestClient(app) as client:
        created = client.post("/api/studies/demo", headers={"Accept-Language": "zh"})
        assert created.status_code == 202, created.text
        payload = created.json()
        assert payload["job"]["stage"] == "succeeded"
        assert payload["job"]["message"] == "流水线已完成"
        bundle = payload["study"]
        study_id = bundle["study"]["id"]
        measurements = {item["code"]: item for item in bundle["measurements"]}
        assert measurements["LV_EF"]["code"] == "LV_EF"
        assert measurements["LV_EF"]["status"] == "not_computed"
        assert measurements["LV_EF"]["reason"] == t("measurement.LV_EF.reason", "zh")
        assert measurements["LV_VOLUME"]["label"] == "左心室腔容积（采集时相）"
        assert measurements["CALCIUM_SCORE"]["label"] == "Agatston 钙化积分"
        report = bundle["reports"][0]
        content = report["content"]
        assert content["language"] == "zh"
        assert content["disclaimer"].startswith(DISCLAIMER_EN)
        assert "不得用于临床诊断或治疗决策" in content["disclaimer"]
        assert "本检查为程序化合成的 DICOM 夹具" in _bundle_text(content)
        assert any("心脏协议描述" == reason or "CT 模态" == reason for reason in bundle["series"][0]["reasons"])
        assert bundle["segmentations"][0]["provenance"]["note"] == "由与该 DICOM 夹具相同的体模定义生成。"
        assert bundle["meshes"][0]["sceneTransform"]["note"] == "GLB 坐标已经是场景单位。"
        frozen = json.loads(json.dumps(content))

        english = client.get(f"/api/studies/{study_id}", headers={"Accept-Language": "en"})
        assert english.status_code == 200
        english_bundle = english.json()
        english_report = english_bundle["reports"][0]["content"]
        assert english_report == frozen
        english_measurements = {item["code"]: item for item in english_bundle["measurements"]}
        assert english_measurements["LV_EF"]["reason"] == t("measurement.LV_EF.reason", "en")
        assert english_measurements["LV_VOLUME"]["label"] == t("measurement.LV_VOLUME.label", "en")
        _assert_no_cjk(english_measurements)
        _assert_no_cjk(english_bundle["jobs"])
        _assert_no_cjk(english_bundle["series"])
        assert english_bundle["jobs"][-1]["message"] == "Pipeline completed"
        assert english_bundle["jobs"][-1]["stage"] == "succeeded"

        missing = client.get(f"/api/studies/{study_id}")
        missing_measurements = {item["code"]: item for item in missing.json()["measurements"]}
        assert missing_measurements["LV_EF"]["reason"] == t("measurement.LV_EF.reason", "en")
        assert missing.json()["reports"][0]["content"] == frozen

        approved = client.post(
            f"/api/studies/{study_id}/reports/{report['id']}/approve",
            json={"approvedBy": "dr.test"},
            headers={"Accept-Language": "en"},
        )
        assert approved.status_code == 200
        assert approved.json()["status"] == "approved"
        assert approved.json()["content"] == frozen
        audit = client.get(f"/api/studies/{study_id}/audit").json()
        assert audit["verified"] is True

        db = SessionLocal()
        row = db.get(Report, report["id"])
        legacy = {
            "schema_version": "report/v1",
            "sections": [{"id": "summary", "title": "检查摘要", "claims": [{"text": "旧版中文报告，不得改写。"}]}],
            "disclaimer": "研究原型。不得用于临床诊断或治疗决策。",
        }
        row.content = legacy
        db.commit()
        db.close()

        legacy_response = client.get(f"/api/studies/{study_id}", headers={"Accept-Language": "en"})
        legacy_content = legacy_response.json()["reports"][0]["content"]
        assert legacy_content["language"] == "zh-CN"
        assert legacy_content["sections"] == legacy["sections"]
        assert legacy_content["disclaimer"] == legacy["disclaimer"]
        legacy_labels = {item["code"]: item["label"] for item in legacy_response.json()["measurements"]}
        assert legacy_labels["LV_EF"] == t("measurement.LV_EF.label", "en")

        db = SessionLocal()
        row = db.get(Report, report["id"])
        assert "language" not in row.content
        assert row.content["sections"] == legacy["sections"]
        assert row.content["disclaimer"] == legacy["disclaimer"]
        db.close()
        assert client.get(f"/api/studies/{study_id}/audit").json()["verified"] is True


def test_cjk_in_server_is_confined_to_the_zh_catalog_and_tests():
    offenders = []
    for path in SERVER_ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        relative = path.relative_to(SERVER_ROOT).as_posix()
        if relative == "app/i18n.py" or relative.startswith("tests/"):
            continue
        if path.suffix.lower() in {".png", ".dcm", ".nii", ".gz", ".glb", ".u8", ".pyc"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if CJK.search(text):
            offenders.append(relative)
    assert offenders == []
