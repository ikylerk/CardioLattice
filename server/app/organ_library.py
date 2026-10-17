from __future__ import annotations

import json
import os
from pathlib import Path

from .codes import coded

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


# Human sentences in the JSON stay in the file for the frontend bundle.
# The API returns these codes instead.
_SOURCE_BY_TEXT = {
    "Demo surface: Realistic Human Heart by neshallads, CC BY 4.0; reference placement": "SOURCE_DEMO_HEART_GLB",
    "Standard reference ellipsoid": "SOURCE_REFERENCE_ELLIPSOID",
    "Standard reference tube": "SOURCE_REFERENCE_TUBE",
    "Standard reference stack": "SOURCE_REFERENCE_STACK",
}

_NOTE_BY_ORGAN = {
    "HEART": "NOTE_HEART_NORMALIZED_SURFACE",
    "LUNG_R": "NOTE_LUNG_R_ORIENTATION",
    "LUNG_L": "NOTE_LUNG_L_SIZE",
    "TRACHEA": "NOTE_REFERENCE_GEOMETRY",
    "LIVER": "NOTE_LIVER_NOT_SEGMENTS",
    "GALLBLADDER": "NOTE_REFERENCE_GEOMETRY",
    "STOMACH": "NOTE_STOMACH_ORIENTATION",
    "SPLEEN": "NOTE_REFERENCE_GEOMETRY",
    "PANCREAS": "NOTE_REFERENCE_GEOMETRY",
    "KIDNEY_R": "NOTE_KIDNEY_R_LOWER",
    "KIDNEY_L": "NOTE_REFERENCE_GEOMETRY",
    "AORTA": "NOTE_AORTA_NOT_CENTERLINE",
    "IVC": "NOTE_REFERENCE_GEOMETRY",
    "SPINE": "NOTE_SPINE_ORIENTATION",
}


def _source_coded(organ: dict) -> dict:
    code = _SOURCE_BY_TEXT.get(organ.get("source", ""))
    if code:
        return coded(code)
    return coded("SOURCE_ORGAN", code=organ["code"])


def _note_coded(organ: dict) -> dict:
    code = _NOTE_BY_ORGAN.get(organ["code"])
    if code:
        return coded(code)
    return coded("NOTE_ORGAN", code=organ["code"])


def _organ_public(organ: dict) -> dict:
    public = {
        "code": organ["code"],
        "name": coded(organ["code"]),
        "system": organ["system"],
        "color": organ["color"],
        "centerMm": organ["centerMm"],
        "sizeMm": organ["sizeMm"],
        "mesh": organ["mesh"],
        "renderable": organ["renderable"],
        "source": _source_coded(organ),
        "note": _note_coded(organ),
    }
    if "segLabels" in organ:
        public["segLabels"] = list(organ["segLabels"])
    return public


def public_catalog() -> dict:
    """Catalog for ``GET /api/organs``. Display strings are codes."""
    frame = ORGAN_LIBRARY["frame"]
    return {
        "version": ORGAN_LIBRARY["version"],
        "updated": ORGAN_LIBRARY["updated"],
        "frame": {
            "name": frame["name"],
            "units": frame["units"],
            "description": coded(f"FRAME_{frame['name']}"),
        },
        "systems": [
            {"id": item["id"], "name": coded(item["id"]), "color": item["color"]}
            for item in ORGAN_LIBRARY["systems"]
        ],
        "organs": [_organ_public(item) for item in ORGAN_LIBRARY["organs"]],
        "segLabelMap": dict(SEG_LABEL_MAP),
        "standardCodes": {
            code: {"name": coded(code), "system": item["system"]}
            for code, item in STANDARD_CODES.items()
        },
    }


def standard_code_for(seg_label: str) -> str:
    return SEG_LABEL_MAP.get(seg_label, seg_label)


def standard_label_map(labels: dict | list) -> dict[str, str]:
    return {str(label): standard_code_for(str(label)) for label in labels}


_problems = validate()
if _problems:
    raise ValueError("invalid organ library: " + "; ".join(_problems))
