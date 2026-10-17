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
    "BodyParts3D 4.0 (DBCLS, CC BY 4.0); selected surfaces, simplified": "SOURCE_BODYPARTS3D",
    "HuBMAP Human Reference Atlas v1.1 male (CC BY 4.0); selected surfaces, simplified, aligned to the BodyParts3D reference frame": "SOURCE_HUBMAP_HRA",
}

_NOTE_BY_TEXT = {
    "Anatomical reference surface; not patient-specific. See src/assets/organs/ATTRIBUTION.md.": "NOTE_ANATOMICAL_REFERENCE",
}

_SOURCE_CATALOG = {
    "bodyparts3d": {
        "name": "SOURCE_NAME_BODYPARTS3D",
        "institution": "INSTITUTION_DBCLS",
        "license": "LICENSE_CC_BY_4_0",
    },
    "hra": {
        "name": "SOURCE_NAME_HUBMAP_HRA",
        "institution": "INSTITUTION_HUBMAP",
        "license": "LICENSE_CC_BY_4_0",
    },
}


def _source_coded(organ: dict) -> dict:
    code = _SOURCE_BY_TEXT.get(organ.get("source", ""))
    if code:
        return coded(code)
    return coded("SOURCE_ORGAN", code=organ["code"])


def _note_coded(organ: dict) -> dict:
    code = _NOTE_BY_TEXT.get(organ.get("note", ""))
    if code:
        return coded(code)
    return coded("NOTE_ORGAN", code=organ["code"])


def _sources_public() -> list:
    output = []
    for item in ORGAN_LIBRARY.get("sources", []):
        known = _SOURCE_CATALOG.get(item.get("id"))
        if known:
            output.append(
                {
                    "id": item["id"],
                    "name": coded(known["name"]),
                    "institution": coded(known["institution"]),
                    "license": coded(known["license"]),
                    "url": item.get("url"),
                }
            )
            continue
        source_id = item.get("id", "")
        output.append(
            {
                "id": source_id,
                "name": coded("SOURCE_NAME", id=source_id),
                "institution": coded("INSTITUTION", id=source_id),
                "license": coded("LICENSE", id=source_id),
                "url": item.get("url"),
            }
        )
    return output


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
        "sources": _sources_public(),
    }


def standard_code_for(seg_label: str) -> str:
    return SEG_LABEL_MAP.get(seg_label, seg_label)


def standard_label_map(labels: dict | list) -> dict[str, str]:
    return {str(label): standard_code_for(str(label)) for label in labels}


_problems = validate()
if _problems:
    raise ValueError("invalid organ library: " + "; ".join(_problems))
