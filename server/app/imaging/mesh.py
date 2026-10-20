from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import trimesh
from scipy import ndimage
from skimage import measure

from .dicom import PreviewVolume
from .segmentation import LABELS

COLORS = {
    "LV": (196, 82, 88),
    "RV": (86, 132, 190),
    "LA": (214, 154, 82),
    "RA": (104, 178, 132),
    "AO": (150, 124, 190),
    "MYO": (176, 96, 120),
    "CALC": (232, 226, 206),
}

STRUCTURE_NAMES = {
    "LV": "左心室",
    "RV": "右心室",
    "LA": "左心房",
    "RA": "右心房",
    "AO": "主动脉",
    "MYO": "心肌",
    "CALC": "钙化",
}


@dataclass
class MeshInfo:
    structure_code: str
    vertex_count: int
    triangle_count: int
    bbox: list[list[float]]


def _largest_component(mask: np.ndarray) -> np.ndarray:
    labelled, count = ndimage.label(mask)
    if count <= 1:
        return mask
    sizes = ndimage.sum(mask, labelled, range(1, count + 1))
    keep = int(np.argmax(sizes)) + 1
    return labelled == keep


def build_glb(
    label_array: np.ndarray,
    preview: PreviewVolume,
    out_path: Path,
    *,
    max_triangles_per_structure: int = 80_000,
) -> tuple[list[MeshInfo], dict]:
    """Extract isosurfaces from label masks and export one GLB with named nodes.

    Coordinates: RAS millimetres -> scene units. The largest physical dimension
    of the preview is mapped to 3.0 scene units so the existing camera framing
    remains usable. The same transform is returned as provenance.
    """
    nx, ny, nz = preview.dims
    sx, sy, sz = preview.spacing
    size_mm = np.array([nx * sx, ny * sy, nz * sz], dtype=float)
    scale = 3.0 / float(max(size_mm))
    center = (size_mm - np.asarray(preview.spacing)) / 2.0

    scene = trimesh.Scene()
    infos: list[MeshInfo] = []

    for code, value in sorted(preview_labels(label_array).items()):
        mask = label_array == value
        if not np.any(mask):
            continue
        mask = _largest_component(mask)
        # Marching cubes expects (z, y, x) spacing.
        verts, faces, normals, _ = measure.marching_cubes(
            mask.astype(np.uint8), level=0.5, spacing=(sz, sy, sx)
        )
        if faces.size == 0:
            continue
        # (z_mm, y_mm, x_mm) -> (x, y, z) in centred scene units.
        xyz = np.stack([verts[:, 2], verts[:, 1], verts[:, 0]], axis=1)
        xyz = (xyz - center) * scale
        mesh = trimesh.Trimesh(vertices=xyz, faces=faces, process=True)
        try:
            trimesh.smoothing.filter_taubin(mesh, lamb=0.45, nu=0.53, iterations=6)
        except Exception:
            pass
        if len(mesh.faces) > max_triangles_per_structure:
            try:
                mesh = mesh.simplify_quadric_decimation(face_count=max_triangles_per_structure)
            except Exception:
                pass
        color = COLORS.get(code, (160, 160, 160))
        mesh.visual.face_colors = [*color, 255]
        scene.add_geometry(mesh, node_name=code, geom_name=code)
        infos.append(
            MeshInfo(
                structure_code=code,
                vertex_count=int(len(mesh.vertices)),
                triangle_count=int(len(mesh.faces)),
                bbox=np.asarray(mesh.bounds, dtype=float).round(4).tolist(),
            )
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if len(scene.geometry) == 0:
        raise ValueError("no labelled structures found; mesh not created")
    scene.export(str(out_path), file_type="glb")
    transform = {
        "scale": scale,
        "center_mm": center.tolist(),
        "source": "preview_index_axis_mm",
        "target": "scene_units",
        "note": "GLB coordinates are already in scene units.",
    }
    return infos, transform


def preview_labels(label_array: np.ndarray) -> dict[str, int]:
    return {
        LABELS[value][0]: value
        for value in sorted(int(item) for item in np.unique(label_array))
        if value in LABELS
    }


def cavity_volumes(label_array: np.ndarray, preview: PreviewVolume) -> dict[str, float]:
    voxel_ml = float(np.prod(preview.spacing)) / 1000.0
    volumes: dict[str, float] = {}
    for code, value in preview_labels(label_array).items():
        if code not in {"LV", "RV", "LA", "RA"}:
            continue
        volumes[code] = float(np.count_nonzero(label_array == value)) * voxel_ml
    return volumes

def build_structure_glb(
    label_array: np.ndarray,
    preview: PreviewVolume,
    out_path: Path,
    structures: dict[int, dict],
    *,
    max_triangles_per_structure: int = 80_000,
    source_geometry: dict | None = None,
) -> tuple[list[MeshInfo], dict]:
    """Extract all annotated components, retaining native-grid detail.

    Mesh vertices use preview index-axis mm, centered and scaled for display.
    Physical LPS coordinates remain recoverable through preview metadata.
    """
    from .nifti import native_points_to_preview_mm

    size_mm = np.asarray(preview.dims) * preview.spacing
    scale = 3.0 / float(max(size_mm))
    center = (size_mm - np.asarray(preview.spacing)) / 2.0
    sx, sy, sz = source_geometry["spacing"] if source_geometry else preview.spacing
    scene = trimesh.Scene()
    infos: list[MeshInfo] = []
    for value, spec in sorted(structures.items()):
        mask = label_array == value
        if not np.any(mask):
            continue
        # Padding closes surfaces at image borders; never drop disconnected
        # annotated vessels or bilateral structures by keeping just one island.
        verts, faces, _, _ = measure.marching_cubes(
            np.pad(mask, 1).astype(np.uint8), level=0.5, spacing=(sz, sy, sx),
        )
        xyz = verts[:, ::-1] - np.asarray([sx, sy, sz])
        if source_geometry:
            xyz = np.asarray(native_points_to_preview_mm(xyz, source_geometry, preview))
            basis = np.linalg.inv(np.asarray(preview.direction).reshape(3, 3)) @ np.asarray(source_geometry["direction"]).reshape(3, 3)
            if np.linalg.det(basis) < 0:
                faces = faces[:, ::-1]
        mesh = trimesh.Trimesh(vertices=(xyz - center) * scale, faces=faces, process=True)
        if len(mesh.faces) > max_triangles_per_structure:
            try:
                mesh = mesh.simplify_quadric_decimation(face_count=max_triangles_per_structure)
            except Exception:
                pass
        mesh.visual.face_colors = [*spec.get("color", (160, 160, 160)), 255]
        code = spec.get("code") or f"LABEL_{value}"
        scene.add_geometry(mesh, node_name=code, geom_name=code)
        infos.append(MeshInfo(
            structure_code=code, vertex_count=int(len(mesh.vertices)),
            triangle_count=int(len(mesh.faces)),
            bbox=np.asarray(mesh.bounds, dtype=float).round(4).tolist(),
        ))
    if not scene.geometry:
        raise ValueError("no labelled structures found; mesh not created")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    scene.export(str(out_path), file_type="glb")
    return infos, {
        "scale": scale, "center_mm": center.tolist(),
        "source": "preview_index_axis_mm", "target": "scene_units",
        "physicalCoordinateSystem": "LPS", "previewOrigin": preview.origin,
        "previewDirection": preview.direction, "sourceGeometry": source_geometry,
        "note": "GLB vertices are centered scene units. All label components retained; no surface smoothing.",
    }

