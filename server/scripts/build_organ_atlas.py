#!/usr/bin/env python3
"""Build the standardized organ atlas from open anatomical reference meshes.

Sources:
  * BodyParts3D 4.0 (DBCLS, CC BY 4.0) — selected organs and the cardiac model.
  * HuBMAP Human Reference Atlas v1.1 male (CC BY 4.0) — whole-organ surfaces
    for liver, lungs, kidneys, spleen and pancreas.

The script is a maintainer tool: the generated GLBs and catalogue are committed,
but the source archives are not. See docs/organ-library.md for download links.

Outputs:
  src/assets/organs/<CODE>.glb
  src/assets/organs/ATTRIBUTION.md
  shared/organ_library.json (updated in place)

Coordinate pipeline:
  human-atlas frame: metres, Y-up, x=left, z=anterior
  -> align HRA organs to the BodyParts3D frame with a uniform scale+translation
  -> RAS, millimetres, origin at the centre of the reference organ set
"""

from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

import numpy as np
import trimesh
from scipy.optimize import least_squares

PROJECT = Path(__file__).resolve().parents[2]

# BodyParts3D part selection (human-atlas FJ ids / names).
AORTA_NAMES = {"Ascending aorta", "Arch of aorta", "Descending aorta"}
IVC_NAMES = {"Inferior vena cava"}


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


def parts_by_names(manifest: dict, names: set[str]) -> list[dict]:
    return [part for part in manifest["parts"] if part["name"] in names]


def parts_by_filter(manifest: dict, predicate) -> list[dict]:
    return [part for part in manifest["parts"] if predicate(part)]


def concept_parts(manifest: dict, concept_id: str) -> list[dict]:
    concept = next(item for item in manifest["concepts"] if item["id"] == concept_id)
    lookup = {part["id"]: part for part in manifest["parts"]}
    return [lookup[element] for element in concept["elements"] if element in lookup]


def load_hra_mesh(path: Path, node_filter) -> trimesh.Trimesh:
    scene = trimesh.load(str(path), force="scene")
    selected = []
    for name, geometry in scene.geometry.items():
        if not node_filter(name):
            continue
        transform, _ = scene.graph.get(name)
        mesh = geometry.copy()
        mesh.apply_transform(transform)
        selected.append(mesh)
    if not selected:
        raise ValueError(f"no nodes matched in {path}")
    return concat(selected)


def node_centroid(path: Path, node: str) -> np.ndarray:
    scene = trimesh.load(str(path), force="scene")
    geometry = scene.geometry[node].copy()
    transform, _ = scene.graph.get(node)
    geometry.apply_transform(transform)
    return np.asarray(geometry.centroid, dtype=float)


def build_bp3d_organs(manifest: dict, chunks: dict[int, bytes]) -> dict[str, trimesh.Trimesh]:
    organs: dict[str, trimesh.Trimesh] = {}

    organs["HEART"] = concat([decode_part(chunks, part) for part in concept_parts(manifest, "FMA7088")])
    organs["STOMACH"] = concat([decode_part(chunks, part) for part in parts_by_names(manifest, {"Stomach"})])
    organs["GALLBLADDER"] = concat(
        [decode_part(chunks, part) for part in parts_by_names(manifest, {"Gallbladder"})]
    )
    organs["AORTA"] = concat([decode_part(chunks, part) for part in parts_by_names(manifest, AORTA_NAMES)])
    organs["IVC"] = concat([decode_part(chunks, part) for part in parts_by_names(manifest, IVC_NAMES)])
    organs["TRACHEA"] = concat([decode_part(chunks, part) for part in parts_by_names(manifest, {"Trachea"})])

    spine = parts_by_filter(
        manifest,
        lambda part: part["system"] == "skeletal"
        and ("vertebra" in part["name"].lower() or part["name"] in {"Sacrum", "Coccyx"})
        and "artery" not in part["name"].lower(),
    )
    organs["SPINE"] = concat([decode_part(chunks, part) for part in spine])
    return organs


def build_hra_organs(hra_dir: Path) -> dict[str, trimesh.Trimesh]:
    organs: dict[str, trimesh.Trimesh] = {}
    organs["LIVER"] = load_hra_mesh(hra_dir / "VH_M_Liver.glb", lambda name: name == "VH_M_liver_capsule")
    organs["LUNG_L"] = load_hra_mesh(
        hra_dir / "VH_M_Lung.glb",
        lambda name: name.startswith("VH_M_left_") and "bronchopulmonary_segment" in name,
    )
    organs["LUNG_R"] = load_hra_mesh(
        hra_dir / "VH_M_Lung.glb",
        lambda name: name.startswith("VH_M_right_") and "bronchopulmonary_segment" in name,
    )
    organs["KIDNEY_L"] = load_hra_mesh(
        hra_dir / "VH_M_Kidney_L.glb", lambda name: name == "VH_M_kidney_capsule_L"
    )
    organs["KIDNEY_R"] = load_hra_mesh(
        hra_dir / "VH_M_Kidney_R.glb", lambda name: name == "VH_M_kidney_capsule_R"
    )
    organs["SPLEEN"] = load_hra_mesh(hra_dir / "VH_M_Spleen.glb", lambda name: True)
    organs["PANCREAS"] = load_hra_mesh(hra_dir / "VH_M_Pancreas.glb", lambda name: True)
    return organs


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
    # human-atlas: x=left, y=superior, z=anterior (metres)
    # RAS: x=right, y=anterior, z=superior (millimetres)
    converted = np.column_stack((-vertices[:, 0] * 1000.0, vertices[:, 2] * 1000.0, vertices[:, 1] * 1000.0))
    faces = np.asarray(mesh.faces)[:, [0, 2, 1]]  # reflection reverses winding
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
    "HEART": 70_000,
    "LIVER": 45_000,
    "LUNG_L": 40_000,
    "LUNG_R": 40_000,
    "KIDNEY_L": 25_000,
    "KIDNEY_R": 25_000,
    "SPLEEN": 20_000,
    "PANCREAS": 18_000,
    "STOMACH": 18_000,
    "GALLBLADDER": 10_000,
    "AORTA": 24_000,
    "IVC": 14_000,
    "TRACHEA": 12_000,
    "SPINE": 70_000,
}

SOURCE = {
    "bodyparts3d": "BodyParts3D 4.0 (DBCLS, CC BY 4.0); selected surfaces, simplified",
    "hra": "HuBMAP Human Reference Atlas v1.1 male (CC BY 4.0); selected surfaces, simplified, aligned to the BodyParts3D reference frame",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--atlas-json", default="/tmp/human_atlas/atlas.json")
    parser.add_argument("--chunks", default="/tmp/human_atlas")
    parser.add_argument("--hra", default="/tmp/hra")
    parser.add_argument("--output", default=str(PROJECT / "src/assets/organs"))
    parser.add_argument("--catalog", default=str(PROJECT / "shared/organ_library.json"))
    args = parser.parse_args()

    manifest = load_manifest(Path(args.atlas_json))
    chunks = load_chunks(Path(args.chunks))
    bp3d_organs = build_bp3d_organs(manifest, chunks)
    hra_organs = build_hra_organs(Path(args.hra))

    bp3d_landmarks, hra_landmarks = landmark_points(manifest, chunks, Path(args.hra))
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

    # Centre the reference organ set at the origin.
    bounds = np.array([mesh.bounds for mesh in ras.values()])
    centre = (bounds[:, 0, :].min(axis=0) + bounds[:, 1, :].max(axis=0)) / 2.0
    print(f"Atlas centre offset (RAS mm): {np.round(centre, 1)}")

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    catalog_path = Path(args.catalog)
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))

    organ_sources = {
        "HEART": "bodyparts3d",
        "STOMACH": "bodyparts3d",
        "GALLBLADDER": "bodyparts3d",
        "AORTA": "bodyparts3d",
        "IVC": "bodyparts3d",
        "TRACHEA": "bodyparts3d",
        "SPINE": "bodyparts3d",
        "LIVER": "hra",
        "LUNG_L": "hra",
        "LUNG_R": "hra",
        "KIDNEY_L": "hra",
        "KIDNEY_R": "hra",
        "SPLEEN": "hra",
        "PANCREAS": "hra",
    }

    for organ in catalog["organs"]:
        code = organ["code"]
        if code not in ras:
            continue
        mesh = simplify(ras[code], TARGET_FACES.get(code, 40_000))
        mesh.vertices = np.asarray(mesh.vertices) - centre
        mesh.export(str(output / f"{code}.glb"), file_type="glb")
        org_bounds = mesh.bounds
        organ["centerMm"] = [round(float(value), 1) for value in (org_bounds[0] + org_bounds[1]) / 2]
        organ["sizeMm"] = [round(float(value), 1) for value in org_bounds[1] - org_bounds[0]]
        organ["mesh"] = {"type": "glb", "asset": f"organs/{code}.glb"}
        organ["source"] = SOURCE[organ_sources[code]]
        organ["note"] = "Anatomical reference surface; not patient-specific. See src/assets/organs/ATTRIBUTION.md."
        print(f"{code}: {len(mesh.vertices)} verts, {len(mesh.faces)} tris, size={organ['sizeMm']}")

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
        {
            "id": "bodyparts3d",
            "name": "BodyParts3D 4.0",
            "institution": "Database Center for Life Science (DBCLS)",
            "license": "CC BY 4.0",
            "url": "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html",
        },
        {
            "id": "hra",
            "name": "HuBMAP Human Reference Atlas v1.1 male reference organs",
            "institution": "HuBMAP Consortium",
            "license": "CC BY 4.0",
            "url": "https://github.com/hubmapconsortium/ccf-releases",
        },
    ]
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    attribution = """# Organ model attribution

The organ GLB files in this directory are adapted anatomical reference meshes.
They are **CC BY 4.0**, not MIT. The repository code remains MIT.

## BodyParts3D 4.0

- Source: BodyParts3D 4.0, Database Center for Life Science (DBCLS).
- Dataset: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- License: CC Attribution 4.0 International (CC BY 4.0).
  - Official license page (updated 2025-02-27): https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
  - The original OBJ headers reference the legacy CC BY-SA 2.1 Japan text; the
    current official database license supersedes it.
- Used for: heart, stomach, gallbladder, aorta, inferior vena cava, trachea,
  and the vertebral column.
- Adaptations: selected parts merged, simplified, axes/units converted to RAS
  millimetres, and the reference organ set centred at the origin.

## HuBMAP Human Reference Atlas v1.1

- Source: Human Reference Atlas (HRA), HuBMAP Consortium, v1.1 male reference
  organs: liver, lung, left/right kidney, spleen, pancreas.
- Dataset: https://github.com/hubmapconsortium/ccf-releases
- License: CC Attribution 4.0 International (CC BY 4.0).
- Adaptations: selected node surfaces merged, simplified, aligned to the
  BodyParts3D reference frame, and converted to RAS millimetres.

## Important

These models are reference anatomy for orientation, teaching, atlas display and
registration placeholders. They are not derived from the patient and must not be
used for diagnosis, measurement, or treatment decisions.
"""
    (output / "ATTRIBUTION.md").write_text(attribution, encoding="utf-8")
    print(f"Wrote {output} and {catalog_path}")


if __name__ == "__main__":
    main()
