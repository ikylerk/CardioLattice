from __future__ import annotations

import json
import os
from pathlib import Path

_CANDIDATES = [
    Path(os.getenv("ORGAN_LIBRARY_PATH", "")) if os.getenv("ORGAN_LIBRARY_PATH") else None,
    Path(__file__).resolve().parents[2] / "shared" / "organ_library.json",
    Path(__file__).resolve().parents[1] / "shared" / "organ_library.json",
]
_PATH = next((path for path in _CANDIDATES if path and path.exists()), None)
if _PATH is None:
    raise FileNotFoundError("shared/organ_library.json not found")

ORGAN_LIBRARY: dict = json.loads(_PATH.read_text(encoding="utf-8"))
SYSTEMS = {item["id"]: item for item in ORGAN_LIBRARY["systems"]}
ORGANS = {item["code"]: item for item in ORGAN_LIBRARY["organs"]}
SEG_LABEL_MAP: dict[str, str] = ORGAN_LIBRARY.get("segLabelMap", {})
STANDARD_CODES: dict = ORGAN_LIBRARY.get("standardCodes", {})


def validate() -> list[str]:
    problems: list[str] = []
    codes = [item["code"] for item in ORGAN_LIBRARY["organs"]]
    if len(codes) != len(set(codes)):
        problems.append("organ codes are not unique")
    for organ in ORGAN_LIBRARY["organs"]:
        if organ["system"] not in SYSTEMS:
            problems.append(f"{organ['code']}: unknown system {organ['system']}")
        if len(organ.get("sizeMm", [])) != 3:
            problems.append(f"{organ['code']}: sizeMm must have 3 values")
        if len(organ.get("centerMm", [])) != 3:
            problems.append(f"{organ['code']}: centerMm must have 3 values")
    for label, code in SEG_LABEL_MAP.items():
        if code not in STANDARD_CODES and code not in ORGANS:
            problems.append(f"segLabelMap[{label}] -> {code} is not a known code")
    return problems


def catalog() -> dict:
    return ORGAN_LIBRARY


def standard_code_for(seg_label: str) -> str:
    return SEG_LABEL_MAP.get(seg_label, seg_label)


def standard_label_map(labels: dict | list) -> dict[str, str]:
    return {str(label): standard_code_for(str(label)) for label in labels}


_problems = validate()
if _problems:
    raise ValueError("invalid organ library: " + "; ".join(_problems))
