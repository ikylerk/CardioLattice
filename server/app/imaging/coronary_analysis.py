from __future__ import annotations

import heapq
from dataclasses import dataclass

import numpy as np
from scipy import ndimage
from skimage.morphology import skeletonize


@dataclass
class CoronaryAnalysis:
    label_value: int
    voxel_count: int
    skeleton_voxels: int
    centerline_length_mm: float
    skeleton_total_length_mm: float
    mean_diameter_mm: float
    min_diameter_mm: float
    max_diameter_mm: float
    reference_diameter_mm: float
    endpoints: int
    branch_count: int
    stenosis_candidates: list[dict]
    centerline: list[list[float]]

    def as_dict(self) -> dict:
        return {
            "labelValue": self.label_value,
            "voxelCount": self.voxel_count,
            "skeletonVoxels": self.skeleton_voxels,
            "centerlineLengthMm": round(self.centerline_length_mm, 2),
            "skeletonTotalLengthMm": round(self.skeleton_total_length_mm, 2),
            "meanDiameterMm": round(self.mean_diameter_mm, 2),
            "minDiameterMm": round(self.min_diameter_mm, 2),
            "maxDiameterMm": round(self.max_diameter_mm, 2),
            "referenceDiameterMm": round(self.reference_diameter_mm, 2),
            "endpoints": self.endpoints,
            "branchCount": self.branch_count,
            "stenosisCandidates": self.stenosis_candidates,
            "centerline": self.centerline,
            "method": "skeleton_centerline_research_v1",
            "validationStatus": "research",
            "note": "Deterministic research analysis of a label mask; not a validated QCA and not for clinical use.",
        }


def _neighbors(index: tuple[int, int, int]):
    z, y, x = index
    for dz in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dz == dy == dx == 0:
                    continue
                yield z + dz, y + dy, x + dx, dz, dy, dx


def _largest_component(mask: np.ndarray) -> np.ndarray:
    labels, count = ndimage.label(mask)
    if count <= 1:
        return mask
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    return labels == (int(np.argmax(sizes)) + 1)


def _dijkstra(start, adjacency, distances):
    best = {start: 0.0}
    previous = {}
    heap = [(0.0, start)]
    while heap:
        current_distance, node = heapq.heappop(heap)
        if current_distance > best.get(node, float("inf")):
            continue
        for neighbor, edge in adjacency.get(node, ()):
            candidate = current_distance + edge
            if candidate < best.get(neighbor, float("inf")):
                best[neighbor] = candidate
                previous[neighbor] = node
                heapq.heappush(heap, (candidate, neighbor))
    if not best:
        return start, 0.0, []
    farthest = max(best, key=best.get)
    path = [farthest]
    while path[-1] != start:
        path.append(previous[path[-1]])
    path.reverse()
    return farthest, best[farthest], path


def analyze_coronary_mask(
    labels: np.ndarray,
    spacing_mm: tuple[float, float, float],
    *,
    label_value: int = 1,
) -> CoronaryAnalysis:
    """Deterministic centerline/diameter analysis of a coronary label mask.

    The result is a research measurement. It is not a validated QCA, and it must
    not be used for clinical decisions.
    """
    mask = labels == label_value
    if not np.any(mask):
        raise ValueError(f"label {label_value} is not present")
    mask = _largest_component(mask)
    voxel_count = int(np.count_nonzero(mask))
    if voxel_count < 8:
        raise ValueError("coronary mask is too small for centerline analysis")

    sx, sy, sz = spacing_mm
    sampling = (sz, sy, sx)  # ndimage arrays are (z, y, x)
    distance = ndimage.distance_transform_edt(mask, sampling=sampling)
    skeleton = skeletonize(mask, method="lee")
    skeleton = skeleton & mask
    coordinates = np.argwhere(skeleton)
    skeleton_voxels = int(len(coordinates))
    if skeleton_voxels == 0:
        raise ValueError("no skeleton could be extracted")

    voxel_set = {tuple(int(value) for value in row) for row in coordinates}
    adjacency: dict[tuple[int, int, int], list[tuple[tuple[int, int, int], float]]] = {}
    spacing_by_axis = (sz, sy, sx)

    for node in voxel_set:
        edges = []
        for nz, ny, nx, dz, dy, dx in _neighbors(node):
            if (nz, ny, nx) not in voxel_set:
                continue
            edge = float(
                np.sqrt(
                    (dz * spacing_by_axis[0]) ** 2
                    + (dy * spacing_by_axis[1]) ** 2
                    + (dx * spacing_by_axis[2]) ** 2
                )
            )
            edges.append(((nz, ny, nx), edge))
        adjacency[node] = edges

    # Two-sweep longest geodesic approximation on the skeleton graph.
    seed = tuple(int(value) for value in coordinates[int(np.argmax([distance[tuple(row)] for row in coordinates]))])
    farthest_a, _, _ = _dijkstra(seed, adjacency, distance)
    farthest_b, centerline_length, path = _dijkstra(farthest_a, adjacency, distance)

    # Total skeleton length is the sum of unique undirected edges.
    total_length = 0.0
    for node, edges in adjacency.items():
        for neighbor, edge in edges:
            if node < neighbor:
                total_length += edge

    endpoints = sum(1 for node, edges in adjacency.items() if len(edges) == 1)
    branch_points = sum(1 for node, edges in adjacency.items() if len(edges) > 2)
    diameters = np.array([2.0 * distance[node] for node in path], dtype=float) if path else np.array([0.0])
    reference_diameter = float(np.percentile(diameters, 80)) if diameters.size else 0.0
    mean_diameter = float(diameters.mean()) if diameters.size else 0.0
    min_diameter = float(diameters.min()) if diameters.size else 0.0
    max_diameter = float(diameters.max()) if diameters.size else 0.0

    candidates = []
    if path and reference_diameter > 0:
        # Group contiguous low-diameter points into candidate lesions.
        low = diameters < reference_diameter * 0.62
        index = 0
        while index < len(path):
            if not low[index]:
                index += 1
                continue
            start = index
            while index + 1 < len(path) and low[index + 1]:
                index += 1
            end = index
            segment = diameters[start : end + 1]
            local_index = int(start + np.argmin(segment))
            node = path[local_index]
            position = [
                float(node[2] * sx),
                float(node[1] * sy),
                float(node[0] * sz),
            ]
            candidates.append(
                {
                    "positionMm": [round(value, 2) for value in position],
                    "diameterMm": round(float(diameters[local_index]), 2),
                    "referenceDiameterMm": round(reference_diameter, 2),
                    "severityPct": round((1.0 - diameters[local_index] / reference_diameter) * 100.0, 1),
                    "pathIndex": local_index,
                    "pathLengthMm": round(float(local_index * np.mean(spacing_by_axis)), 2),
                    "note": "Research radius-profile candidate, not a validated stenosis measurement.",
                }
            )
            index += 1

    # Cap the exported centerline to keep the JSON bounded.
    step = max(1, len(path) // 1200)
    centerline = [
        [round(float(node[2] * sx), 2), round(float(node[1] * sy), 2), round(float(node[0] * sz), 2)]
        for node in path[::step]
    ]

    return CoronaryAnalysis(
        label_value=label_value,
        voxel_count=voxel_count,
        skeleton_voxels=skeleton_voxels,
        centerline_length_mm=float(centerline_length),
        skeleton_total_length_mm=float(total_length),
        mean_diameter_mm=mean_diameter,
        min_diameter_mm=min_diameter,
        max_diameter_mm=max_diameter,
        reference_diameter_mm=reference_diameter,
        endpoints=endpoints,
        branch_count=max(0, endpoints - 1) + branch_points,
        stenosis_candidates=candidates,
        centerline=centerline,
    )
