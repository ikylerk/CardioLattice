from __future__ import annotations

from fastapi.testclient import TestClient

from app.coronary_model import CORONARY_MODEL, MYOCARDIAL_SEGMENTS, REFERENCE_ANALYSIS, SEGMENTS, validate
from app.main import app


def test_coronary_model_is_valid():
    assert validate() == []
    ids = [segment["id"] for segment in SEGMENTS]
    assert len(ids) == len(set(ids))
    assert len(ids) == 17
    assert set(MYOCARDIAL_SEGMENTS) == set(range(1, 18))
    assert {segment["side"] for segment in SEGMENTS} == {"left", "right"}
    assert {segment["id"] for segment in SEGMENTS if segment.get("referenceLesion")} == {"LAD_MID", "RCA_PROX"}
    for analysis in REFERENCE_ANALYSIS.values():
        assert analysis["segmentId"] in ids
        assert analysis["rvd"] > analysis["mld"] > 0
    assert CORONARY_MODEL["projections"]["left"]
    assert CORONARY_MODEL["projections"]["right"]


def test_coronary_model_api():
    with TestClient(app) as client:
        response = client.get("/api/coronary-model")
        assert response.status_code == 200
        data = response.json()
        assert data["version"] == CORONARY_MODEL["version"]
        assert len(data["segments"]) == len(SEGMENTS)
        assert data["referenceAnalysis"]["left"]["segmentId"] == "LAD_MID"
