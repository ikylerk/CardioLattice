from __future__ import annotations

from pathlib import Path

import numpy as np
import trimesh
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
