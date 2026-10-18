from __future__ import annotations

import json
import os
from pathlib import Path

_CANDIDATES = [
    Path(os.getenv("CORONARY_MODEL_PATH", "")) if os.getenv("CORONARY_MODEL_PATH") else None,
    Path(__file__).resolve().parents[2] / "shared" / "coronary_model.json",
    Path(__file__).resolve().parents[1] / "shared" / "coronary_model.json",
]
_PATH = next((path for path in _CANDIDATES if path and path.exists()), None)
if _PATH is None:
    raise FileNotFoundError("shared/coronary_model.json not found")

CORONARY_MODEL: dict = json.loads(_PATH.read_text(encoding="utf-8"))
SEGMENTS: list[dict] = CORONARY_MODEL.get("segments", [])
MYOCARDIAL_SEGMENTS = {item["id"]: item for item in CORONARY_MODEL.get("myocardialSegments", [])}
REFERENCE_ANALYSIS: dict = CORONARY_MODEL.get("referenceAnalysis", {})
SIDES = {"left", "right"}


def validate() -> list[str]:
    problems: list[str] = []
    seen: set[str] = set()
    for segment in SEGMENTS:
        segment_id = segment.get("id")
        if not segment_id:
            problems.append("segment without id")
            continue
        if segment_id in seen:
            problems.append(f"duplicate segment id: {segment_id}")
        seen.add(segment_id)
        if segment.get("side") not in SIDES:
            problems.append(f"{segment_id}: invalid side")
        if float(segment.get("referenceDiameterMm", 0)) <= 0:
            problems.append(f"{segment_id}: invalid reference diameter")
        if float(segment.get("lengthMm", 0)) <= 0:
            problems.append(f"{segment_id}: invalid length")
        for aha_id in segment.get("ahaMyocardialSegments", []):
            if aha_id not in MYOCARDIAL_SEGMENTS:
                problems.append(f"{segment_id}: unknown AHA myocardial segment {aha_id}")
    if set(MYOCARDIAL_SEGMENTS) != set(range(1, 18)):
        problems.append("myocardialSegments must cover AHA 1-17")
    for side, analysis in REFERENCE_ANALYSIS.items():
        if side not in SIDES:
            problems.append(f"referenceAnalysis: invalid side {side}")
        if analysis.get("segmentId") not in seen:
            problems.append(f"referenceAnalysis[{side}]: unknown segmentId")
        if float(analysis.get("rvd", 0)) <= 0 or float(analysis.get("mld", 0)) <= 0:
            problems.append(f"referenceAnalysis[{side}]: invalid diameters")
    for side, projections in CORONARY_MODEL.get("projections", {}).items():
        if side not in SIDES:
            problems.append(f"projections: invalid side {side}")
        for projection in projections:
            if not isinstance(projection.get("rot"), (int, float)) or not isinstance(projection.get("tilt"), (int, float)):
                problems.append(f"projections[{side}]: invalid angles")
    return problems


def catalog() -> dict:
    return CORONARY_MODEL


_problems = validate()
if _problems:
    raise ValueError("invalid coronary model: " + "; ".join(_problems))
