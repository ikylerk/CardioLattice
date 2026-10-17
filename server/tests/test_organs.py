from __future__ import annotations

from fastapi.testclient import TestClient

import re

from app.codes import coded
from app.main import app
from app.organ_library import ORGAN_LIBRARY, SEG_LABEL_MAP, public_catalog, standard_label_map, validate

_CJK = re.compile(r"[\u4e00-\u9fff]")


def test_organ_catalog_is_valid():
    assert validate() == []
    codes = [organ["code"] for organ in ORGAN_LIBRARY["organs"]]
    assert len(codes) == len(set(codes))
    assert len(codes) >= 10
    assert "HEART" in codes
    assert {"LUNG_R", "LUNG_L", "LIVER", "KIDNEY_R", "KIDNEY_L", "AORTA", "SPINE"} <= set(codes)

    assert {"LV", "RV", "LA", "RA", "AO", "MYO", "CALC"} <= set(SEG_LABEL_MAP)
    assert standard_label_map({"LV": 1, "AO": 5}) == {"LV": "HEART_LV", "AO": "AORTA"}


def test_organ_api_returns_codes_not_text():
    with TestClient(app) as client:
        response = client.get("/api/organs", headers={"Accept-Language": "zh"})
        same = client.get("/api/organs")
        assert response.status_code == 200
        data = response.json()
        assert data == same.json()
        assert data == public_catalog()
        assert data["version"] == ORGAN_LIBRARY["version"]
        assert data["frame"]["name"] == "RAS_BODY_CENTER"
        assert data["frame"]["description"] == coded("FRAME_RAS_BODY_CENTER")
        assert _CJK.search(response.text) is None
        assert len(data["organs"]) == len(ORGAN_LIBRARY["organs"])
        heart = next(item for item in data["organs"] if item["code"] == "HEART")
        assert heart["name"] == coded("HEART")
        assert "en" not in heart
        assert heart["source"] == coded("SOURCE_DEMO_HEART_GLB")
        assert heart["note"] == coded("NOTE_HEART_NORMALIZED_SURFACE")
        assert heart["system"] == "cardiovascular"
        systems = {item["id"]: item for item in data["systems"]}
        assert systems["cardiovascular"]["name"] == coded("cardiovascular")
        assert "en" not in systems["cardiovascular"]
        assert data["standardCodes"]["HEART_LV"]["name"] == coded("HEART_LV")
        assert data["standardCodes"]["CORONARY_CALCIFICATION"]["name"] == coded("CORONARY_CALCIFICATION")
