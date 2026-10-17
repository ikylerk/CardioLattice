from __future__ import annotations

from pathlib import Path

import numpy as np
import trimesh
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
        assert data["version"] == "organ-atlas/v2"
        assert data["frame"]["name"] == "RAS_ORGAN_REFERENCE"
        assert data["frame"]["description"] == coded("FRAME_RAS_ORGAN_REFERENCE")
        assert _CJK.search(response.text) is None
        assert len(data["organs"]) == len(ORGAN_LIBRARY["organs"])
        heart = next(item for item in data["organs"] if item["code"] == "HEART")
        lung = next(item for item in data["organs"] if item["code"] == "LUNG_R")
        assert heart["name"] == coded("HEART")
        assert "en" not in heart
        assert heart["source"] == coded("SOURCE_BODYPARTS3D")
        assert heart["note"] == coded("NOTE_ANATOMICAL_REFERENCE")
        assert lung["source"] == coded("SOURCE_HUBMAP_HRA")
        assert heart["system"] == "cardiovascular"
        systems = {item["id"]: item for item in data["systems"]}
        assert systems["cardiovascular"]["name"] == coded("cardiovascular")
        assert "en" not in systems["cardiovascular"]
        assert data["standardCodes"]["HEART_LV"]["name"] == coded("HEART_LV")
        sources = {item["id"]: item for item in data["sources"]}
        assert sources["bodyparts3d"]["name"] == coded("SOURCE_NAME_BODYPARTS3D")
        assert sources["bodyparts3d"]["institution"] == coded("INSTITUTION_DBCLS")
        assert sources["bodyparts3d"]["license"] == coded("LICENSE_CC_BY_4_0")
        assert sources["hra"]["name"] == coded("SOURCE_NAME_HUBMAP_HRA")
        assert sources["hra"]["institution"] == coded("INSTITUTION_HUBMAP")
        assert "CC BY" not in response.text


def test_organ_glb_assets_exist_and_load():
    project = Path(__file__).resolve().parents[2]
    assert ORGAN_LIBRARY["version"] == "organ-atlas/v2"
    assert ORGAN_LIBRARY["frame"]["name"] == "RAS_ORGAN_REFERENCE"
    for organ in ORGAN_LIBRARY["organs"]:
        if not organ.get("renderable"):
            continue
        assert organ["mesh"]["type"] == "glb"
        assert "CC BY 4.0" in organ["source"]
        path = project / "src" / "assets" / organ["mesh"]["asset"]
        assert path.exists(), f"missing organ asset {path}"
        scene = trimesh.load(str(path), force="scene")
        assert len(scene.geometry) > 0
        bounds = np.asarray(scene.bounds, dtype=float)
        assert np.isfinite(bounds).all()
        size = bounds[1] - bounds[0]
        assert size.max() > 10.0, f"{organ['code']} has an implausible size {size}"
