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
    component_count: int = 1
    primary_path_voxels: int = 0

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
            "branchCountDefinition": {
                "connectivity": 26,
                "paths": "maximal_non_branching_after_adjacent_junction_contraction",
                "closedPathCount": 1,
                "isolatedVertexCount": 0,
                "junctionInternalEdgesCounted": False,
            },
            "skeletonCoverage": "one_connected_skeleton_per_original_component",
            "stenosisCandidates": self.stenosis_candidates,
            "centerline": self.centerline,
            "coordinateFrame": "native_label_index_axis_mm",
            "componentCount": self.component_count,
            "primaryPathVoxels": self.primary_path_voxels,
            "diameterScope": "longest_path_only",
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


def _validated_skeleton_components(adjacency, source_components, component_count):
    """Require one connected 26-neighbour skeleton per original mask component."""
    remaining = set(adjacency)
    components = []
    fragment_counts = np.zeros(component_count + 1, dtype=int)
    while remaining:
        seed = min(remaining)
        component, pending = set(), [seed]
        remaining.remove(seed)
        while pending:
            node = pending.pop()
            component.add(node)
            for neighbor, _ in adjacency[node]:
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    pending.append(neighbor)
        source_id = int(source_components[seed])
        fragment_counts[source_id] += 1
        components.append(component)
    problems = []
    for source_id in range(1, component_count + 1):
        fragments = int(fragment_counts[source_id])
        if fragments == 0:
            problems.append(f"component {source_id} uncovered (no skeleton voxels)")
        elif fragments > 1:
            problems.append(f"component {source_id} split into {fragments} skeleton fragments")
    if problems:
        raise ValueError("skeleton component coverage/connectivity failed: " + "; ".join(problems))
    return components


def _count_branches(adjacency) -> int:
    """Count maximal non-branching paths in the contracted undirected graph.

    Adjacent degree > 2 voxel nodes form one junction. Internal junction edges
    are discarded; external parallel edges are retained. Degrees are recomputed
    after contraction, so a junction cluster with only two external edges does
    not split a path. Each maximal path counts once, including a path that leaves
    and returns to the same junction. An isolated degree-two cycle counts once;
    an isolated vertex counts zero. Cycles wholly inside a merged junction are
    internal junction structure and do not count as branches.

    Edge IDs preserve distinct paths and allow cycles to terminate without
    double-counting. Physical lengths still use the original voxel graph.
    """
    representatives = {node: node for node in adjacency}
    junctions = {node for node, edges in adjacency.items() if len(edges) > 2}
    while junctions:
        seed = min(junctions)
        junctions.remove(seed)
        pending = [seed]
        while pending:
            node = pending.pop()
            representatives[node] = seed
            for neighbor, _ in adjacency[node]:
                if neighbor in junctions:
                    junctions.remove(neighbor)
                    pending.append(neighbor)

    contracted = {representative: [] for representative in representatives.values()}
    edge_id = 0
    for node, edges in adjacency.items():
        for neighbor, _ in edges:
            if node >= neighbor:
                continue
            start, end = representatives[node], representatives[neighbor]
            if start == end:
                continue
            contracted[start].append((end, edge_id))
            contracted[end].append((start, edge_id))
            edge_id += 1

    visited = set()

    def follow_path(node, incoming_edge):
        while incoming_edge not in visited:
            visited.add(incoming_edge)
            if len(contracted[node]) != 2:
                return
            node, incoming_edge = next(
                (neighbor, candidate) for neighbor, candidate in contracted[node]
                if candidate != incoming_edge
            )

    count = 0
    for node, edges in contracted.items():
        if len(edges) == 2:
            continue
        for neighbor, edge in edges:
            if edge not in visited:
                count += 1
                follow_path(neighbor, edge)
    # Every remaining component has degree two everywhere: a closed path.
    for edges in contracted.values():
        for neighbor, edge in edges:
            if edge not in visited:
                count += 1
                follow_path(neighbor, edge)
    return count


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
    if labels.ndim != 3 or len(spacing_mm) != 3 or not np.all(np.isfinite(spacing_mm)) or np.any(np.asarray(spacing_mm) <= 0):
        raise ValueError("expected a 3D label mask and three positive finite spacings")
    source_components, component_count = ndimage.label(mask, structure=np.ones((3, 3, 3)))
    voxel_count = int(np.count_nonzero(mask))
    if voxel_count < 8:
        raise ValueError("coronary mask is too small for centerline analysis")

    sx, sy, sz = spacing_mm
    sampling = (sz, sy, sx)  # ndimage arrays are (z, y, x)
    distance = ndimage.distance_transform_edt(np.pad(mask, 1), sampling=sampling)[1:-1, 1:-1, 1:-1]
    skeleton = skeletonize(mask, method="lee")
    skeleton = skeleton & mask
    coordinates = np.argwhere(skeleton)
    skeleton_voxels = int(len(coordinates))
    # Coverage and connectivity are checked against every original component
    # below, including when Lee thinning removes all or only some components.

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

    # Select the longest two-sweep path across every disconnected component.
    # Tree-wide length below still includes every component.
    components = _validated_skeleton_components(adjacency, source_components, component_count)
    centerline_length, path = 0.0, []
    for component in components:
        seed = min(component)
        farthest_a, _, _ = _dijkstra(seed, adjacency, distance)
        _, length, candidate_path = _dijkstra(farthest_a, adjacency, distance)
        if not path or length > centerline_length:
            centerline_length, path = length, candidate_path
    path_distances = [0.0]
    for a, b in zip(path, path[1:]):
        path_distances.append(path_distances[-1] + float(np.linalg.norm(
            (np.asarray(b) - np.asarray(a)) * np.asarray(sampling)
        )))

    # Total skeleton length is the sum of unique undirected edges.
    total_length = 0.0
    for node, edges in adjacency.items():
        for neighbor, edge in edges:
            if node < neighbor:
                total_length += edge

    endpoints = sum(1 for node, edges in adjacency.items() if len(edges) == 1)
    branch_count = _count_branches(adjacency)
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
                    "pathLengthMm": round(float(path_distances[local_index]), 2),
                    "note": "Research radius-profile candidate, not a validated stenosis measurement.",
                }
            )
            index += 1

    # Cap the exported centerline to keep the JSON bounded.
    step = max(1, int(np.ceil(len(path) / 1200)))
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
        branch_count=branch_count,
        stenosis_candidates=candidates,
        centerline=centerline,
        component_count=int(component_count),
        primary_path_voxels=len(path),
    )
