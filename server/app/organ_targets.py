from __future__ import annotations

import json
import os
from pathlib import Path

from .organ_library import ORGANS, ORGAN_LIBRARY

_CANDIDATES = [
    Path(os.getenv("ORGAN_TARGETS_PATH", "")) if os.getenv("ORGAN_TARGETS_PATH") else None,
    Path(__file__).resolve().parents[2] / "shared" / "organ_targets.json",
    Path(__file__).resolve().parents[1] / "shared" / "organ_targets.json",
]
_PATH = next((path for path in _CANDIDATES if path and path.exists()), None)
if _PATH is None:
    raise FileNotFoundError("shared/organ_targets.json not found")

ORGAN_TARGETS: dict = json.loads(_PATH.read_text(encoding="utf-8"))
TARGETS: list[dict] = ORGAN_TARGETS.get("targets", [])
APPROACHES = {"anterior", "posterior", "left", "right"}
VIEWS = {"anterior", "posterior", "left", "right"}


def validate() -> list[str]:
    problems: list[str] = []
    seen: set[str] = set()
    for target in TARGETS:
        target_id = target.get("id")
        if not target_id:
            problems.append("target without id")
            continue
        if target_id in seen:
            problems.append(f"duplicate target id: {target_id}")
        seen.add(target_id)
        organ = target.get("organ")
        if organ not in ORGANS:
            problems.append(f"{target_id}: unknown organ {organ}")
            continue
        coordinate = target.get("coordinateMm", [])
        if len(coordinate) != 3 or not all(isinstance(value, (int, float)) for value in coordinate):
            problems.append(f"{target_id}: invalid coordinate")
        if target.get("approach") not in APPROACHES:
            problems.append(f"{target_id}: invalid approach")
        if target.get("standardView") not in VIEWS:
            problems.append(f"{target_id}: invalid standardView")
        part_code = target.get("partCode")
        if part_code:
            parts = {part["code"] for part in ORGANS[organ].get("parts", [])}
            if parts and part_code not in parts:
                problems.append(f"{target_id}: partCode {part_code} not in {organ} parts")
    return problems


def catalog() -> dict:
    return ORGAN_TARGETS


_problems = validate()
if _problems:
    raise ValueError("invalid organ targets: " + "; ".join(_problems))
