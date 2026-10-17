from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.organ_library import ORGAN_LIBRARY, SEG_LABEL_MAP, standard_label_map, validate


def test_organ_catalog_is_valid():
    assert validate() == []
    codes = [organ["code"] for organ in ORGAN_LIBRARY["organs"]]
    assert len(codes) == len(set(codes))
    assert len(codes) >= 10
    assert "HEART" in codes
    assert {"LUNG_R", "LUNG_L", "LIVER", "KIDNEY_R", "KIDNEY_L", "AORTA", "SPINE"} <= set(codes)

    assert {"LV", "RV", "LA", "RA", "AO", "MYO", "CALC"} <= set(SEG_LABEL_MAP)
    assert standard_label_map({"LV": 1, "AO": 5}) == {"LV": "HEART_LV", "AO": "AORTA"}


def test_organ_api_matches_catalog():
    with TestClient(app) as client:
        response = client.get("/api/organs")
        assert response.status_code == 200
        data = response.json()
        assert data["version"] == ORGAN_LIBRARY["version"]
        assert data["frame"]["name"] == ORGAN_LIBRARY["frame"]["name"]
        assert len(data["organs"]) == len(ORGAN_LIBRARY["organs"])
