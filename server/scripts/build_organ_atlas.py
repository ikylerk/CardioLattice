#!/usr/bin/env python3
"""Build the standardized organ atlas from open anatomical reference meshes.

Sources:
  * BodyParts3D 4.0 (DBCLS, CC BY 4.0) — selected organs and the cardiac model.
  * HuBMAP Human Reference Atlas v1.1 male (CC BY 4.0) — whole-organ surfaces
    for liver, lungs, kidneys, spleen and pancreas.

The script is a maintainer tool: the generated GLBs, catalogue and target map
are committed, but the source archives are not. See docs/organ-library.md for
download links.

Outputs:
  src/assets/organs/<CODE>.glb
  src/assets/organs/<CODE>_detail.glb
  src/assets/organs/ATTRIBUTION.md
  shared/organ_library.json (updated in place)
  shared/organ_targets.json
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import trimesh

PROJECT = Path(__file__).resolve().parents[2]

AORTA_NAMES = {"Ascending aorta", "Arch of aorta", "Descending aorta"}
IVC_NAMES = {"Inferior vena cava"}

ORDINAL = {
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5,
    "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,
    "eleventh": 11, "twelfth": 12,
}
SPINE_LEVELS = {
    "First cervical vertebra": ("C1", "第1颈椎"),
    "Second cervical vertebra": ("C2", "第2颈椎"),
    "Third cervical vertebra": ("C3", "第3颈椎"),
    "Fourth cervical vertebra": ("C4", "第4颈椎"),
    "Fifth cervical vertebra": ("C5", "第5颈椎"),
    "Sixth cervical vertebra": ("C6", "第6颈椎"),
    "Seventh cervical vertebra": ("C7", "第7颈椎"),
    "First thoracic vertebra": ("T1", "第1胸椎"),
    "Second thoracic vertebra": ("T2", "第2胸椎"),
    "Third thoracic vertebra": ("T3", "第3胸椎"),
    "Fourth thoracic vertebra": ("T4", "第4胸椎"),
    "Fifth thoracic vertebra": ("T5", "第5胸椎"),
    "Sixth thoracic vertebra": ("T6", "第6胸椎"),
    "Seventh thoracic vertebra": ("T7", "第7胸椎"),
    "Eighth thoracic vertebra": ("T8", "第8胸椎"),
    "Ninth thoracic vertebra": ("T9", "第9胸椎"),
    "Tenth thoracic vertebra": ("T10", "第10胸椎"),
    "Eleventh thoracic vertebra": ("T11", "第11胸椎"),
    "Twelfth thoracic vertebra": ("T12", "第12胸椎"),
    "First lumbar vertebra": ("L1", "第1腰椎"),
    "Second lumbar vertebra": ("L2", "第2腰椎"),
    "Third lumbar vertebra": ("L3", "第3腰椎"),
    "Fourth lumbar vertebra": ("L4", "第4腰椎"),
    "Fifth lumbar vertebra": ("L5", "第5腰椎"),
    "Sacrum": ("SACRUM", "骶骨"),
    "Coccyx": ("COCCYX", "尾骨"),
}

LIVER_SEGMENTS = {
    "left_anterolateral_segment": ("LIVER_SEGMENT_LEFT_ANTEROLATERAL", "左前外侧段"),
    "left_inferomedial_segment": ("LIVER_SEGMENT_LEFT_INFEROMEDIAL", "左内侧下段"),
    "left_posterolateral_segment": ("LIVER_SEGMENT_LEFT_POSTEROLATERAL", "左后外侧段"),
    "left_superiomedial_segment": ("LIVER_SEGMENT_LEFT_SUPERIOMEDIAL", "左内侧上段"),
    "right_anteroinferior_segment": ("LIVER_SEGMENT_RIGHT_ANTEROINFERIOR", "右前下段"),
    "right_anterosuperior_segment": ("LIVER_SEGMENT_RIGHT_ANTEROSUPERIOR", "右前上段"),
    "right_posteroinferior_segment": ("LIVER_SEGMENT_RIGHT_POSTEROINFERIOR", "右后下段"),
    "right_posterosuperior_segment": ("LIVER_SEGMENT_RIGHT_POSTEROSUPERIOR", "右后上段"),
}

PANCREAS_NODES = {
    "VH_M_head_of_pancreas": ("PANCREAS_HEAD", "胰头"),
    "VH_M_neck_of_pancreas": ("PANCREAS_NECK", "胰颈"),
    "VH_M_body_of_pancreas": ("PANCREAS_BODY", "胰体"),
    "VH_F_tail_of_pancreas": ("PANCREAS_TAIL", "胰尾"),
    "VH_F_uncinate_process_of_the_pancreas": ("PANCREAS_UNCINATE", "钩突"),
}

SPLEEN_NODES = {
    "VH_M_diaphragmatic_surface_of_spleen": ("SPLEEN_DIAPHRAGMATIC", "膈面"),
    "VH_M_gastric_surface_of_spleen": ("SPLEEN_GASTRIC", "胃面"),
    "VH_M_colic_surface_of_spleen": ("SPLEEN_COLIC", "结肠面"),
    "VH_M_renal_surface_of_spleen": ("SPLEEN_RENAL", "肾面"),
    "VH_M_hilum_of_spleen": ("SPLEEN_HILUM", "脾门"),
}


@dataclass
class DetailPart:
    code: str
    name: str
    kind: str
    mesh: trimesh.Trimesh
    source: str


def load_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_chunks(chunk_dir: Path) -> dict[int, bytes]:
    chunks: dict[int, bytes] = {}
    for path in sorted(chunk_dir.glob("body-*.bin.gz")):
        index = int(path.stem.split("-")[1].split(".")[0])
        with gzip.open(path, "rb") as handle:
            chunks[index] = handle.read()
    return chunks


def decode_part(chunks: dict[int, bytes], part: dict) -> trimesh.Trimesh:
    buffer = chunks[part["chunk"]]
    vertices = np.frombuffer(
        buffer, dtype="<f4", count=part["vertexCount"] * 3, offset=part["positions"]
    ).reshape(-1, 3)
    faces = np.frombuffer(
        buffer, dtype="<u4", count=part["indexCount"], offset=part["indices"]
    ).reshape(-1, 3)
    return trimesh.Trimesh(vertices=vertices.astype(np.float64), faces=faces, process=True)


def concat(meshes: list[trimesh.Trimesh]) -> trimesh.Trimesh:
    mesh = trimesh.util.concatenate(meshes)
    mesh.merge_vertices()
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.update_faces(mesh.unique_faces())
    return mesh


def concept_parts(manifest: dict, concept_id: str) -> list[dict]:
    concept = next(item for item in manifest["concepts"] if item["id"] == concept_id)
    lookup = {part["id"]: part for part in manifest["parts"]}
    return [lookup[element] for element in concept["elements"] if element in lookup]


def load_hra_scene(path: Path):
    return trimesh.load(str(path), force="scene")


def world_geometry(scene, name: str) -> trimesh.Trimesh:
    geometry = scene.geometry[name].copy()
    transform, _ = scene.graph.get(name)
    geometry.apply_transform(transform)
    return geometry


def load_hra_mesh(path: Path, node_filter) -> trimesh.Trimesh:
    scene = load_hra_scene(path)
    selected = [world_geometry(scene, name) for name in scene.geometry if node_filter(name)]
    if not selected:
        raise ValueError(f"no nodes matched in {path}")
    return concat(selected)


def node_centroid(path: Path, node: str) -> np.ndarray:
    scene = load_hra_scene(path)
    return np.asarray(world_geometry(scene, node).centroid, dtype=float)


def build_bp3d_organs(manifest: dict, chunks: dict[int, bytes]) -> dict[str, trimesh.Trimesh]:
    organs: dict[str, trimesh.Trimesh] = {}
    organs["HEART"] = concat([decode_part(chunks, part) for part in concept_parts(manifest, "FMA7088")])
    organs["STOMACH"] = concat(
        [decode_part(chunks, part) for part in manifest["parts"] if part["name"] == "Stomach"]
    )
    organs["GALLBLADDER"] = concat(
        [decode_part(chunks, part) for part in manifest["parts"] if part["name"] == "Gallbladder"]
    )
    organs["AORTA"] = concat(
        [decode_part(chunks, part) for part in manifest["parts"] if part["name"] in AORTA_NAMES]
    )
    organs["IVC"] = concat(
        [decode_part(chunks, part) for part in manifest["parts"] if part["name"] in IVC_NAMES]
    )
    organs["TRACHEA"] = concat(
        [decode_part(chunks, part) for part in manifest["parts"] if part["name"] == "Trachea"]
    )
    spine = [
        part for part in manifest["parts"]
        if part["system"] == "skeletal"
        and ("vertebra" in part["name"].lower() or part["name"] in {"Sacrum", "Coccyx"})
        and "artery" not in part["name"].lower()
    ]
    organs["SPINE"] = concat([decode_part(chunks, part) for part in spine])
    return organs


def build_hra_organs(hra_dir: Path) -> dict[str, trimesh.Trimesh]:
    return {
        "LIVER": load_hra_mesh(hra_dir / "VH_M_Liver.glb", lambda name: name == "VH_M_liver_capsule"),
        "LUNG_L": load_hra_mesh(
            hra_dir / "VH_M_Lung.glb",
            lambda name: name.startswith("VH_M_left_") and "bronchopulmonary_segment" in name,
        ),
        "LUNG_R": load_hra_mesh(
            hra_dir / "VH_M_Lung.glb",
            lambda name: name.startswith("VH_M_right_") and "bronchopulmonary_segment" in name,
        ),
        "KIDNEY_L": load_hra_mesh(
            hra_dir / "VH_M_Kidney_L.glb", lambda name: name == "VH_M_kidney_capsule_L"
        ),
        "KIDNEY_R": load_hra_mesh(
            hra_dir / "VH_M_Kidney_R.glb", lambda name: name == "VH_M_kidney_capsule_R"
        ),
        "SPLEEN": load_hra_mesh(hra_dir / "VH_M_Spleen.glb", lambda name: True),
        "PANCREAS": load_hra_mesh(hra_dir / "VH_M_Pancreas.glb", lambda name: True),
    }


def classify_heart(name: str) -> str:
    lower = name.lower()
    if "papillary" in lower or "muscle" in lower:
        return "muscle"
    if "valve" in lower or "leaflet" in lower or "cusp" in lower:
        return "valve"
    if any(term in lower for term in ("coronary", "interventricular branch", "circumflex", "diagonal", "marginal")):
        return "coronary"
    if any(term in lower for term in ("ventricle", "atrium", "septum")):
        return "chamber"
    return "other"


def build_detail_parts(
    manifest: dict,
    chunks: dict[int, bytes],
    hra_dir: Path,
) -> dict[str, list[DetailPart]]:
    details: dict[str, list[DetailPart]] = {}

    heart = []
    for index, part in enumerate(concept_parts(manifest, "FMA7088"), start=1):
        heart.append(
            DetailPart(
                code=f"HEART_PART_{index:03d}",
                name=part["name"],
                kind=classify_heart(part["name"]),
                mesh=decode_part(chunks, part),
                source="bodyparts3d",
            )
        )
    details["HEART"] = heart

    details["AORTA"] = [
        DetailPart(
            code=code,
            name=name,
            kind="segment",
            mesh=decode_part(chunks, next(part for part in manifest["parts"] if part["name"] == source_name)),
            source="bodyparts3d",
        )
        for code, name, source_name in (
            ("AORTA_ASCENDING", "升主动脉", "Ascending aorta"),
            ("AORTA_ARCH", "主动脉弓", "Arch of aorta"),
            ("AORTA_DESCENDING", "降主动脉", "Descending aorta"),
        )
    ]

    ivc_parts = [part for part in manifest["parts"] if part["name"] in IVC_NAMES]
    ivc_parts.sort(key=lambda part: part["bounds"][1][1], reverse=True)
    details["IVC"] = [
        DetailPart(
            code="IVC_SUPERIOR" if index == 0 else "IVC_INFERIOR",
            name="下腔静脉（近心段）" if index == 0 else "下腔静脉（腹段）",
            kind="segment",
            mesh=decode_part(chunks, part),
            source="bodyparts3d",
        )
        for index, part in enumerate(ivc_parts)
    ]

    spine_parts = [
        part for part in manifest["parts"]
        if part["system"] == "skeletal"
        and ("vertebra" in part["name"].lower() or part["name"] in {"Sacrum", "Coccyx"})
        and "artery" not in part["name"].lower()
    ]
    spine = []
    for part in spine_parts:
        level, name = SPINE_LEVELS.get(part["name"], (None, None))
        if not level:
            continue
        spine.append(
            DetailPart(
                code=f"SPINE_{level}",
                name=name,
                kind="vertebra",
                mesh=decode_part(chunks, part),
                source="bodyparts3d",
            )
        )
    details["SPINE"] = spine

    single = {
        "STOMACH": ("STOMACH_BODY", "胃体", "Stomach"),
        "GALLBLADDER": ("GALLBLADDER_BODY", "胆囊", "Gallbladder"),
        "TRACHEA": ("TRACHEA_MAIN", "气管", "Trachea"),
    }
    for organ, (code, name, part_name) in single.items():
        part = next(part for part in manifest["parts"] if part["name"] == part_name)
        details[organ] = [DetailPart(code=code, name=name, kind="organ", mesh=decode_part(chunks, part), source="bodyparts3d")]

    # HRA-derived detail parts
    liver_scene = load_hra_scene(hra_dir / "VH_M_Liver.glb")
    liver_parts: list[DetailPart] = []
    ligaments = []
    for node in liver_scene.geometry:
        geometry = world_geometry(liver_scene, node)
        short = node.replace("VH_M_", "")
        if node == "VH_M_liver_capsule":
            liver_parts.append(DetailPart("LIVER_CAPSULE", "肝脏表面", "capsule", geometry, "hra"))
        elif short in LIVER_SEGMENTS:
            code, name = LIVER_SEGMENTS[short]
            liver_parts.append(DetailPart(code, name, "segment", geometry, "hra"))
        elif node == "VH_M_caudate_lobe_of_liver":
            liver_parts.append(DetailPart("LIVER_CAUDATE", "尾状叶", "lobe", geometry, "hra"))
        elif node == "VH_M_quadrate_lobe_of_liver":
            liver_parts.append(DetailPart("LIVER_QUADRATE", "方叶", "lobe", geometry, "hra"))
        elif node.startswith("VH_M_") and node != "VH_M_liver_capsule":
            ligaments.append(geometry)
    if ligaments:
        liver_parts.append(DetailPart("LIVER_LIGAMENTS", "肝韧带与压迹", "surface", concat(ligaments), "hra"))
    details["LIVER"] = liver_parts

    lung_scene = load_hra_scene(hra_dir / "VH_M_Lung.glb")
    for side, code_prefix, display_prefix in (
        ("left", "LUNG_L", "左肺"),
        ("right", "LUNG_R", "右肺"),
    ):
        parts = []
        index = 0
        for node in sorted(lung_scene.geometry):
            if not node.startswith(f"VH_M_{side}_") or "bronchopulmonary_segment" not in node:
                continue
            index += 1
            pretty = node.replace(f"VH_M_{side}_", "").replace("_", " ").replace("bronchopulmonary segment", "段")
            parts.append(
                DetailPart(
                    code=f"{code_prefix}_SEGMENT_{index:02d}",
                    name=f"{display_prefix}{pretty}",
                    kind="segment",
                    mesh=world_geometry(lung_scene, node),
                    source="hra",
                )
            )
        details[code_prefix] = parts

    for side in ("L", "R"):
        scene = load_hra_scene(hra_dir / f"VH_M_Kidney_{side}.glb")
        groups: dict[str, list[trimesh.Trimesh]] = {}
        for node in scene.geometry:
            lower = node.lower()
            if "capsule" in lower:
                key = "CAPSULE"
            elif "outer_cortex" in lower:
                key = "CORTEX"
            elif "renal_column" in lower:
                key = "COLUMN"
            elif "pyramid" in lower:
                key = "MEDULLA"
            elif "papilla" in lower or "calyx" in lower:
                key = "CALYCES"
            elif "pelvis" in lower:
                key = "PELVIS"
            elif "hilum" in lower:
                key = "HILUM"
            else:
                key = "OTHER"
            groups.setdefault(key, []).append(world_geometry(scene, node))
        names = {
            "CAPSULE": ("肾包膜", "capsule"),
            "CORTEX": ("肾皮质", "cortex"),
            "COLUMN": ("肾柱", "medulla"),
            "MEDULLA": ("肾髓质（锥体）", "medulla"),
            "CALYCES": ("肾盏", "calyx"),
            "PELVIS": ("肾盂", "pelvis"),
            "HILUM": ("肾门", "hilum"),
        }
        details[f"KIDNEY_{side}"] = [
            DetailPart(
                code=f"KIDNEY_{side}_{key}",
                name=name,
                kind=kind,
                mesh=concat(meshes),
                source="hra",
            )
            for key, meshes in groups.items()
            for name, kind in [names.get(key, (key, "other"))]
        ]

    pancreas_scene = load_hra_scene(hra_dir / "VH_M_Pancreas.glb")
    details["PANCREAS"] = [
        DetailPart(code, name, "segment", world_geometry(pancreas_scene, node), "hra")
        for node, (code, name) in PANCREAS_NODES.items()
        if node in pancreas_scene.geometry
    ]

    spleen_scene = load_hra_scene(hra_dir / "VH_M_Spleen.glb")
    details["SPLEEN"] = [
        DetailPart(code, name, "surface", world_geometry(spleen_scene, node), "hra")
        for node, (code, name) in SPLEEN_NODES.items()
        if node in spleen_scene.geometry
    ]
    return details


def landmark_points(manifest: dict, chunks: dict[int, bytes], hra_dir: Path):
    parts = {part["id"]: part for part in manifest["parts"]}
    bp3d = {}
    for key, part_id in {
        "heart_lv": "FJ2422",
        "kidney_l": "FJ3145",
        "kidney_r": "FJ3147",
        "spleen": "FJ2561",
        "pancreas": "FJ2629",
        "trachea": "FJ2541",
    }.items():
        bp3d[key] = decode_part(chunks, parts[part_id]).centroid

    hra = {
        "heart_lv": node_centroid(hra_dir / "VH_M_Heart.glb", "VH_M_heart_left_ventricle"),
        "kidney_l": node_centroid(hra_dir / "VH_M_Kidney_L.glb", "VH_M_kidney_capsule_L"),
        "kidney_r": node_centroid(hra_dir / "VH_M_Kidney_R.glb", "VH_M_kidney_capsule_R"),
        "spleen": load_hra_mesh(hra_dir / "VH_M_Spleen.glb", lambda name: True).centroid,
        "pancreas": load_hra_mesh(hra_dir / "VH_M_Pancreas.glb", lambda name: True).centroid,
        "trachea": node_centroid(hra_dir / "VH_M_Lung.glb", "VH_M_trachea"),
    }
    return bp3d, hra


def solve_similarity(bp3d: dict, hra: dict) -> tuple[float, np.ndarray, float]:
    keys = list(bp3d)
    source = np.array([hra[key] for key in keys])
    target = np.array([bp3d[key] for key in keys])
    rows = len(keys) * 3
    matrix = np.zeros((rows, 4))
    vector = target.reshape(-1)
    for index in range(len(keys)):
        for axis in range(3):
            row = index * 3 + axis
            matrix[row, 0] = source[index, axis]
            matrix[row, 1 + axis] = 1.0
    params, *_ = np.linalg.lstsq(matrix, vector, rcond=None)
    scale = float(params[0])
    translation = params[1:4]
    residual = matrix @ params - vector
    rms = float(np.sqrt(np.mean(residual**2)))
    return scale, translation, rms


def to_ras_mm(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    converted = np.column_stack((-vertices[:, 0] * 1000.0, vertices[:, 2] * 1000.0, vertices[:, 1] * 1000.0))
    faces = np.asarray(mesh.faces)[:, [0, 2, 1]]
    result = trimesh.Trimesh(vertices=converted, faces=faces, process=True)
    result.merge_vertices()
    result.update_faces(result.nondegenerate_faces())
    result.update_faces(result.unique_faces())
    if result.is_watertight and result.volume < 0:
        result.invert()
    return result


def simplify(mesh: trimesh.Trimesh, target_faces: int) -> trimesh.Trimesh:
    if len(mesh.faces) <= target_faces:
        return mesh
    try:
        return mesh.simplify_quadric_decimation(face_count=target_faces)
    except Exception:
        return mesh


TARGET_FACES = {
    "HEART": 70_000, "LIVER": 45_000, "LUNG_L": 40_000, "LUNG_R": 40_000,
    "KIDNEY_L": 25_000, "KIDNEY_R": 25_000, "SPLEEN": 20_000, "PANCREAS": 18_000,
    "STOMACH": 18_000, "GALLBLADDER": 10_000, "AORTA": 24_000, "IVC": 14_000,
    "TRACHEA": 12_000, "SPINE": 70_000,
}
DETAIL_TARGET_FACES = {
    "HEART": 2_800, "SPINE": 4_000, "LIVER": 4_000, "LUNG_L": 3_000,
    "LUNG_R": 3_000, "KIDNEY_L": 4_000, "KIDNEY_R": 4_000,
    "PANCREAS": 4_000, "SPLEEN": 4_000, "AORTA": 8_000, "IVC": 6_000,
    "STOMACH": 12_000, "GALLBLADDER": 8_000, "TRACHEA": 8_000,
}

SOURCE = {
    "bodyparts3d": "BodyParts3D 4.0 (DBCLS, CC BY 4.0); selected surfaces, simplified",
    "hra": "HuBMAP Human Reference Atlas v1.1 male (CC BY 4.0); selected surfaces, simplified, aligned to the BodyParts3D reference frame",
}


def bbox_center_size(mesh: trimesh.Trimesh):
    bounds = mesh.bounds
    center = (bounds[0] + bounds[1]) / 2.0
    size = bounds[1] - bounds[0]
    return [round(float(value), 1) for value in center], [round(float(value), 1) for value in size]


def build_targets(
    details: dict[str, list[DetailPart]],
    final_parts: dict[str, list[DetailPart]],
    organs: dict[str, trimesh.Trimesh],
) -> list[dict]:
    targets: list[dict] = []
    parts_by_organ = {
        organ: {part.code: part for part in parts}
        for organ, parts in final_parts.items()
    }

    def add(organ, target_id, name, category, part_code, coordinate, view, approach, reference, description):
        targets.append({
            "id": target_id,
            "organ": organ,
            "name": name,
            "category": category,
            "partCode": part_code,
            "coordinateMm": [round(float(value), 1) for value in coordinate],
            "standardView": view,
            "approach": approach,
            "reference": reference,
            "description": description,
        })

    heart = parts_by_organ.get("HEART", {})
    seen: set[str] = set()

    def add_unique(*args, **kwargs):
        target_id = args[1]
        if target_id in seen:
            return
        seen.add(target_id)
        add(*args, **kwargs)

    def pick(predicate):
        candidates = [part for part in heart.values() if predicate(part.name.lower())]
        if not candidates:
            return None
        return max(candidates, key=lambda part: len(part.mesh.vertices))

    chamber_specs = [
        ("CHAMBER_LV", "左心室腔", "cavity of left ventricle"),
        ("CHAMBER_RV", "右心室腔", "cavity of right ventricle"),
        ("CHAMBER_LA", "左心房腔", "cavity of left atrium"),
        ("CHAMBER_RA", "右心房腔", "cavity of right atrium"),
    ]
    for target_id, name, needle in chamber_specs:
        part = pick(lambda text, needle=needle: needle in text)
        if part:
            add_unique("HEART", target_id, name, "chamber", part.code, part.mesh.centroid, "anterior", "anterior", "BodyParts3D", "参考心腔中心")

    valve_specs = [
        ("VALVE_MITRAL", "二尖瓣", "mitral valve"),
        ("VALVE_AORTIC", "主动脉瓣", "aortic valve"),
        ("VALVE_TRICUSPID", "三尖瓣", "tricuspid valve"),
        ("VALVE_PULMONARY", "肺动脉瓣", "pulmonary valve"),
    ]
    for target_id, name, needle in valve_specs:
        part = pick(lambda text, needle=needle: needle in text)
        if part:
            add_unique("HEART", target_id, name, "valve", part.code, part.mesh.centroid, "anterior", "anterior", "BodyParts3D", "参考瓣膜中心")

    coronary_specs = [
        ("CORONARY_LAD_PROX", "LAD 近段（解剖参考）", ("trunk of anterior interventricular branch", "anterior interventricular branch of left coronary artery")),
        ("CORONARY_LCX_PROX", "LCX 近段（解剖参考）", ("circumflex branch of left coronary artery", "left circumflex artery")),
        ("CORONARY_RCA_PROX", "RCA 近段（解剖参考）", ("right coronary artery",)),
    ]
    for target_id, name, needles in coronary_specs:
        part = pick(lambda text, needles=needles: any(needle in text for needle in needles))
        if part:
            add_unique("HEART", target_id, name, "coronary", part.code, part.mesh.centroid, "anterior", "anterior", "AHA 17-segment model", "参考冠脉中心，不含患者病变信息")

    for organ in ("LUNG_L", "LUNG_R"):
        for part in parts_by_organ.get(organ, {}).values():
            if part.kind != "segment":
                continue
            add(organ, f"{organ}_{part.code.split('_')[-1]}_TARGET", part.name, "segment", part.code, part.mesh.centroid, "anterior", "anterior", "HRA bronchopulmonary segment", "参考肺段中心")

    for organ in ("LIVER",):
        for part in parts_by_organ.get(organ, {}).values():
            if part.kind not in {"segment", "lobe"}:
                continue
            add(organ, f"{part.code}_TARGET", part.name, "segment", part.code, part.mesh.centroid, "anterior", "anterior", "HRA liver segment", "参考肝段中心；未做 Couinaud 临床分级")
    if "LIVER_CAPSULE" in parts_by_organ.get("LIVER", {}):
        part = parts_by_organ["LIVER"]["LIVER_CAPSULE"]
        add("LIVER", "LIVER_SURFACE", "肝脏表面", "capsule", part.code, part.mesh.centroid, "anterior", "anterior", "HRA liver capsule", "参考表面中心")

    for organ, side in (("KIDNEY_L", "L"), ("KIDNEY_R", "R")):
        parts = parts_by_organ.get(organ, {})
        capsule = parts.get(f"KIDNEY_{side}_CAPSULE")
        if capsule:
            bounds = capsule.mesh.bounds
            x, y = capsule.mesh.centroid[0], capsule.mesh.centroid[1]
            add(organ, f"KIDNEY_{side}_UPPER", "上极（参考）", "pole", capsule.code, [x, y, bounds[1][2]], "posterior", "posterior", "anatomical landmark", "参考极点，不是病变")
            add(organ, f"KIDNEY_{side}_LOWER", "下极（参考）", "pole", capsule.code, [x, y, bounds[0][2]], "posterior", "posterior", "anatomical landmark", "参考极点，不是病变")
            add(organ, f"KIDNEY_{side}_MID", "中部（参考）", "pole", capsule.code, capsule.mesh.centroid, "posterior", "posterior", "anatomical landmark", "参考中心")
        for key, label in (("PELVIS", "肾盂"), ("HILUM", "肾门")):
            part = parts.get(f"KIDNEY_{side}_{key}")
            if part:
                add(organ, f"KIDNEY_{side}_{key}_TARGET", label, "hilum", part.code, part.mesh.centroid, "posterior", "posterior", "HRA kidney node", "参考解剖中心")

    for part in parts_by_organ.get("PANCREAS", {}).values():
        add("PANCREAS", f"{part.code}_TARGET", part.name, "segment", part.code, part.mesh.centroid, "anterior", "anterior", "HRA pancreas", "参考解剖中心")

    spleen = parts_by_organ.get("SPLEEN", {})
    if spleen:
        outer = [part for part in spleen.values() if part.kind == "surface"]
        if outer:
            all_mesh = concat([part.mesh for part in outer])
            bounds = all_mesh.bounds
            x, y = all_mesh.centroid[0], all_mesh.centroid[1]
            add("SPLEEN", "SPLEEN_UPPER", "上极（参考）", "pole", outer[0].code, [x, y, bounds[1][2]], "left", "left", "anatomical landmark", "参考极点")
            add("SPLEEN", "SPLEEN_LOWER", "下极（参考）", "pole", outer[0].code, [x, y, bounds[0][2]], "left", "left", "anatomical landmark", "参考极点")
        if "SPLEEN_HILUM" in spleen:
            part = spleen["SPLEEN_HILUM"]
            add("SPLEEN", "SPLEEN_HILUM_TARGET", "脾门", "hilum", part.code, part.mesh.centroid, "left", "left", "HRA spleen", "参考解剖中心")

    for part in parts_by_organ.get("AORTA", {}).values():
        add("AORTA", f"{part.code}_TARGET", part.name, "segment", part.code, part.mesh.centroid, "anterior", "anterior", "BodyParts3D", "参考解剖中心")
    for part in parts_by_organ.get("IVC", {}).values():
        add("IVC", f"{part.code}_TARGET", part.name, "segment", part.code, part.mesh.centroid, "anterior", "anterior", "BodyParts3D", "参考解剖中心")

    if "TRACHEA_MAIN" in parts_by_organ.get("TRACHEA", {}):
        part = parts_by_organ["TRACHEA"]["TRACHEA_MAIN"]
        bounds = part.mesh.bounds
        x, y = part.mesh.centroid[0], part.mesh.centroid[1]
        add("TRACHEA", "TRACHEA_CARINA", "隆突（参考）", "landmark", part.code, [x, y, bounds[0][2]], "anterior", "anterior", "anatomical landmark", "参考位置，不是病变")
        add("TRACHEA", "TRACHEA_MID", "气管中段", "landmark", part.code, part.mesh.centroid, "anterior", "anterior", "anatomical landmark", "参考位置，不是病变")

    if "STOMACH_BODY" in parts_by_organ.get("STOMACH", {}):
        part = parts_by_organ["STOMACH"]["STOMACH_BODY"]
        vertices = np.asarray(part.mesh.vertices)
        center = vertices.mean(axis=0)
        centered = vertices - center
        _, _, vh = np.linalg.svd(centered, full_matrices=False)
        axis = vh[0]
        projection = centered @ axis
        for index, (percentile, name) in enumerate(
            ((10, "贲门/胃底（参考）"), (30, "胃体上部（参考）"), (50, "胃体（参考）"), (70, "胃窦（参考）"), (90, "幽门（参考）"))
        ):
            value = np.percentile(projection, percentile)
            point = center + axis * value
            add("STOMACH", f"STOMACH_REGION_{index + 1}", name, "region", part.code, point, "anterior", "anterior", "morphological reference", "按形态主轴划分的参考区域，不是内镜定位")

    for part in parts_by_organ.get("SPINE", {}).values():
        if part.code in {"SPINE_C7", "SPINE_T1", "SPINE_T4", "SPINE_T8", "SPINE_T12", "SPINE_L1", "SPINE_L4", "SPINE_L5", "SPINE_SACRUM"}:
            add("SPINE", f"{part.code}_TARGET", part.name, "vertebra", part.code, part.mesh.centroid, "posterior", "posterior", "BodyParts3D vertebra", "参考椎体中心，不是病变")

    return targets


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--atlas-json", default="/tmp/human_atlas/atlas.json")
    parser.add_argument("--chunks", default="/tmp/human_atlas")
    parser.add_argument("--hra", default="/tmp/hra")
    parser.add_argument("--output", default=str(PROJECT / "src/assets/organs"))
    parser.add_argument("--catalog", default=str(PROJECT / "shared/organ_library.json"))
    parser.add_argument("--targets", default=str(PROJECT / "shared/organ_targets.json"))
    args = parser.parse_args()

    manifest = load_manifest(Path(args.atlas_json))
    chunks = load_chunks(Path(args.chunks))
    hra_dir = Path(args.hra)
    bp3d_organs = build_bp3d_organs(manifest, chunks)
    hra_organs = build_hra_organs(hra_dir)
    details = build_detail_parts(manifest, chunks, hra_dir)

    bp3d_landmarks, hra_landmarks = landmark_points(manifest, chunks, hra_dir)
    scale, translation, rms = solve_similarity(bp3d_landmarks, hra_landmarks)
    print(f"HRA -> BodyParts3D: scale={scale:.5f} translation={np.round(translation, 4)} rms={rms * 1000:.1f} mm")
    if rms > 0.04:
        print("WARNING: alignment residual is above 40 mm; inspect shared landmarks.")

    aligned_hra = {}
    for code, mesh in hra_organs.items():
        mesh = mesh.copy()
        mesh.vertices = np.asarray(mesh.vertices) * scale + translation
        aligned_hra[code] = mesh

    all_organs = {**bp3d_organs, **aligned_hra}
    ras = {code: to_ras_mm(mesh) for code, mesh in all_organs.items()}
    bounds = np.array([mesh.bounds for mesh in ras.values()])
    centre = (bounds[:, 0, :].min(axis=0) + bounds[:, 1, :].max(axis=0)) / 2.0
    print(f"Atlas centre offset (RAS mm): {np.round(centre, 1)}")

    # Convert detail parts to the shared final frame.
    final_parts: dict[str, list[DetailPart]] = {}
    for organ, parts in details.items():
        converted = []
        for part in parts:
            mesh = part.mesh.copy()
            if part.source == "hra":
                mesh.vertices = np.asarray(mesh.vertices) * scale + translation
            mesh = to_ras_mm(mesh)
            mesh.vertices = np.asarray(mesh.vertices) - centre
            converted.append(DetailPart(part.code, part.name, part.kind, mesh, part.source))
        final_parts[organ] = converted

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    catalog_path = Path(args.catalog)
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))

    organ_sources = {
        "HEART": "bodyparts3d", "STOMACH": "bodyparts3d", "GALLBLADDER": "bodyparts3d",
        "AORTA": "bodyparts3d", "IVC": "bodyparts3d", "TRACHEA": "bodyparts3d", "SPINE": "bodyparts3d",
        "LIVER": "hra", "LUNG_L": "hra", "LUNG_R": "hra", "KIDNEY_L": "hra",
        "KIDNEY_R": "hra", "SPLEEN": "hra", "PANCREAS": "hra",
    }

    catalog_parts: dict[str, list[dict]] = {}
    for organ in catalog["organs"]:
        code = organ["code"]
        if code not in ras:
            continue
        mesh = simplify(ras[code], TARGET_FACES.get(code, 40_000))
        mesh.vertices = np.asarray(mesh.vertices) - centre
        mesh.export(str(output / f"{code}.glb"), file_type="glb")
        center, size = bbox_center_size(mesh)
        organ["centerMm"] = center
        organ["sizeMm"] = size
        organ["mesh"] = {"type": "glb", "asset": f"organs/{code}.glb"}
        organ["source"] = SOURCE[organ_sources[code]]
        organ["note"] = "Anatomical reference surface; not patient-specific. See src/assets/organs/ATTRIBUTION.md."

        parts = final_parts.get(code, [])
        if len(parts) > 1:
            scene = trimesh.Scene()
            part_records = []
            for part in parts:
                part_mesh = simplify(part.mesh, DETAIL_TARGET_FACES.get(code, 4_000))
                scene.add_geometry(part_mesh, node_name=part.code, geom_name=part.code)
                pcenter, psize = bbox_center_size(part_mesh)
                part_records.append({
                    "code": part.code,
                    "name": part.name,
                    "kind": part.kind,
                    "node": part.code,
                    "centerMm": pcenter,
                    "sizeMm": psize,
                })
            detail_path = output / f"{code}_detail.glb"
            scene.export(str(detail_path), file_type="glb")
            organ["detailAsset"] = f"organs/{code}_detail.glb"
            organ["parts"] = part_records
            catalog_parts[code] = part_records
        else:
            organ["detailAsset"] = None
            organ["parts"] = []
        print(f"{code}: outer {len(mesh.vertices)}v/{len(mesh.faces)}t, detail parts={len(parts)}")

    catalog["version"] = "organ-atlas/v2"
    catalog["updated"] = "2026-10-18"
    catalog["frame"] = {
        "name": "RAS_ORGAN_REFERENCE",
        "units": "mm",
        "description": (
            "Origin at the centre of the reference organ set. +x right, +y anterior, "
            "+z superior. Adapted from BodyParts3D 4.0 and HuBMAP HRA v1.1; not patient anatomy."
        ),
    }
    catalog["sources"] = [
        {"id": "bodyparts3d", "name": "BodyParts3D 4.0", "institution": "Database Center for Life Science (DBCLS)", "license": "CC BY 4.0", "url": "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html"},
        {"id": "hra", "name": "HuBMAP Human Reference Atlas v1.1 male reference organs", "institution": "HuBMAP Consortium", "license": "CC BY 4.0", "url": "https://github.com/hubmapconsortium/ccf-releases"},
    ]
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    targets = build_targets(details, final_parts, ras)
    target_catalog = {
        "version": "organ-targets/v1",
        "frame": catalog["frame"],
        "disclaimer": "Reference targets for orientation, teaching and workflow simulation only. Not a diagnosis, biopsy plan, or surgical navigation system.",
        "targets": targets,
    }
    Path(args.targets).write_text(json.dumps(target_catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Targets: {len(targets)}")

    attribution = """# Organ model attribution

The organ GLB files and target catalogue in this directory are adapted
anatomical reference data. They are **CC BY 4.0**, not MIT. Repository code
remains MIT.

## BodyParts3D 4.0

- Source: BodyParts3D 4.0, Database Center for Life Science (DBCLS).
- Dataset: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- License: CC Attribution 4.0 International (CC BY 4.0).
  - Official license page (updated 2025-02-27): https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
  - The original OBJ headers reference the legacy CC BY-SA 2.1 Japan text; the
    current official database license supersedes it.
- Used for: heart, stomach, gallbladder, aorta, inferior vena cava, trachea,
  and the vertebral column.
- Adaptations: selected parts merged or exported as named sub-structures,
  simplified, axes/units converted to RAS millimetres, and the reference organ
  set centred at the origin.

## HuBMAP Human Reference Atlas v1.1

- Source: Human Reference Atlas (HRA), HuBMAP Consortium, v1.1 male reference
  organs: liver, lung, left/right kidney, spleen, pancreas.
- Dataset: https://github.com/hubmapconsortium/ccf-releases
- License: CC Attribution 4.0 International (CC BY 4.0).
- Adaptations: selected node surfaces merged or exported as named sub-structures,
  simplified, aligned to the BodyParts3D reference frame, and converted to RAS
  millimetres.

## Important

These models and targets are reference anatomy for orientation, teaching,
atlas display, registration placeholders and workflow simulation. They are not
derived from the patient and must not be used for diagnosis, measurement, or
treatment decisions.
"""
    (output / "ATTRIBUTION.md").write_text(attribution, encoding="utf-8")
    print(f"Wrote {output}, {catalog_path}, {Path(args.targets)}")


if __name__ == "__main__":
    main()
