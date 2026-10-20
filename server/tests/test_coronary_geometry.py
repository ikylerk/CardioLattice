"""Native-grid coronary topology regressions; no database or pipeline needed."""

import numpy as np
import pytest
from skimage.morphology import skeletonize

from app.imaging import coronary_analysis
from app.imaging.coronary_analysis import _count_branches, analyze_coronary_mask


@pytest.mark.parametrize("lost_width", [2, 4, 6, 8])
@pytest.mark.parametrize("lost_first", [True, False])
def test_actual_lee_loss_of_either_component_fails_closed(lost_width, lost_first):
    """Real Lee thinning, without mocking: even square tubes vanish completely."""
    labels = np.zeros((44, 40, 40), dtype=np.uint16)
    lost_start, good_start = (5, 25) if lost_first else (25, 5)
    labels[3:39, lost_start:lost_start + lost_width, lost_start:lost_start + lost_width] = 300
    labels[3:39, good_start:good_start + 5, good_start:good_start + 5] = 300
    raw_skeleton = skeletonize(labels == 300, method="lee")
    assert raw_skeleton.any(), "the surviving component previously hid the loss"
    assert not raw_skeleton[:, lost_start:lost_start + lost_width, lost_start:lost_start + lost_width].any()
    source_id = 1 if lost_first else 2
    with pytest.raises(ValueError, match=rf"component {source_id} uncovered \(no skeleton voxels\)"):
        analyze_coronary_mask(labels, (0.5, 0.5, 1.5), label_value=300)


def test_actual_lee_loss_of_all_components_names_each_uncovered_component():
    labels = np.zeros((44, 36, 36), dtype=np.uint16)
    labels[3:39, 5:9, 5:9] = 300
    labels[3:39, 24:28, 24:28] = 300
    assert not skeletonize(labels == 300, method="lee").any()
    with pytest.raises(ValueError) as caught:
        analyze_coronary_mask(labels, (0.5, 0.5, 1.5), label_value=300)
    assert "component 1 uncovered" in str(caught.value)
    assert "component 2 uncovered" in str(caught.value)


@pytest.mark.parametrize("fragmented_first", [True, False])
def test_fragmented_skeleton_is_rejected_before_quantification(monkeypatch, fragmented_first):
    """Inject disconnected skeleton output to exercise the provider failure gate."""
    labels = np.zeros((44, 36, 36), dtype=np.uint16)
    labels[3:39, 5:10, 5:10] = 300
    labels[3:39, 24:29, 24:29] = 300
    broken_center, good_center = (7, 26) if fragmented_first else (26, 7)
    fragmented = np.zeros_like(labels, dtype=bool)
    fragmented[5:15, broken_center, broken_center] = True
    fragmented[20:37, broken_center, broken_center] = True
    fragmented[5:37, good_center, good_center] = True

    def provider_output(mask, *, method):
        assert method == "lee"
        assert np.all(mask[fragmented])
        return fragmented.copy()

    def must_not_quantify(*args, **kwargs):
        pytest.fail("path/diameter quantification ran on a fragmented skeleton")

    monkeypatch.setattr(coronary_analysis, "skeletonize", provider_output)
    monkeypatch.setattr(coronary_analysis, "_dijkstra", must_not_quantify)
    source_id = 1 if fragmented_first else 2
    with pytest.raises(ValueError, match=rf"component {source_id} split into 2 skeleton fragments"):
        analyze_coronary_mask(labels, (0.5, 0.5, 1.5), label_value=300)


def test_two_real_straight_components_are_two_branches_with_all_native_lengths():
    labels = np.zeros((44, 32, 32), dtype=np.uint16)
    labels[3:39, 5:10, 5:10] = 300
    labels[7:32, 21:26, 21:26] = 300
    result = analyze_coronary_mask(labels, (0.5, 0.5, 1.5), label_value=300)
    assert result.component_count == 2
    assert result.branch_count == 2
    assert result.endpoints == 4
    assert result.voxel_count == 1525
    assert result.skeleton_total_length_mm == pytest.approx(82.5)
    assert result.centerline_length_mm == pytest.approx(49.5)
    assert result.skeleton_voxels > result.primary_path_voxels
    assert np.linalg.norm(np.diff(result.centerline, axis=0), axis=1).sum() == pytest.approx(49.5)
    payload = result.as_dict()
    assert payload["coordinateFrame"] == "native_label_index_axis_mm"
    assert payload["diameterScope"] == "longest_path_only"
    assert payload["skeletonCoverage"] == "one_connected_skeleton_per_original_component"
    assert payload["branchCountDefinition"]["closedPathCount"] == 1
    assert payload["branchCountDefinition"]["isolatedVertexCount"] == 0


def test_real_closed_voxel_loop_is_one_branch_and_keeps_full_circumference():
    labels = np.zeros((5, 25, 25), dtype=np.uint16)
    yy, xx = np.indices((25, 25))
    labels[2, np.abs(yy - 12) + np.abs(xx - 12) == 8] = 300
    result = analyze_coronary_mask(labels, (1.0, 1.0, 1.0), label_value=300)
    assert result.component_count == 1
    assert result.endpoints == 0
    assert result.branch_count == 1
    assert result.skeleton_voxels == 32
    assert result.skeleton_total_length_mm == pytest.approx(32 * np.sqrt(2))


def test_real_y_shaped_voxel_tree_has_three_branches():
    labels = np.zeros((31, 31, 31), dtype=np.uint16)
    center = np.array([15, 15, 15])
    labels[tuple(center)] = 300
    for direction in [(-1, 0, 0), (1, 1, 0), (1, -1, 0)]:
        for step in range(1, 9):
            labels[tuple(center + np.array(direction) * step)] = 300
    result = analyze_coronary_mask(labels, (0.5, 0.7, 1.5), label_value=300)
    assert result.component_count == 1
    assert result.endpoints == 3
    assert result.branch_count == 3


def graph(edges, isolated=()):
    """Small named topology fixtures, independent of voxelization and thinning."""
    result = {node: [] for node in isolated}
    for start, end in edges:
        result.setdefault(start, []).append((end, 1.0))
        result.setdefault(end, []).append((start, 1.0))
    return result


@pytest.mark.parametrize("edges,expected", [
    pytest.param([], 0, id="isolated-vertices-have-no-path"),
    pytest.param([(0, 1), (1, 2), (2, 3)], 1, id="straight-path"),
    pytest.param([(0, 1), (1, 2), (4, 5), (5, 6)], 2, id="two-straight-components"),
    pytest.param([(0, 1), (1, 2), (0, 3), (3, 4), (0, 5), (5, 6)], 3, id="y-junction"),
    pytest.param(
        [(0, 1), (0, 2), (2, 3), (0, 4), (4, 5), (1, 6), (6, 7), (1, 8), (8, 9)],
        4, id="adjacent-junction-nodes-merge",
    ),
    pytest.param(
        [(0, 1), (1, 2), (0, 3), (3, 4), (0, 5), (5, 10), (10, 11), (11, 12), (10, 13), (13, 14)],
        5, id="separated-junctions-keep-connecting-path",
    ),
    pytest.param([(0, 1), (1, 2), (2, 3), (3, 0)], 1, id="isolated-cycle"),
    pytest.param(
        [(0, 1), (1, 2), (2, 3), (3, 0), (0, 4), (4, 5)],
        2, id="loop-returning-to-junction-plus-tail",
    ),
    pytest.param(
        [(0, 1), (1, 2), (2, 3), (3, 0), (10, 11), (11, 12), (12, 13), (13, 10)],
        2, id="two-isolated-cycles",
    ),
    pytest.param(
        [(0, 1), (1, 10), (0, 2), (2, 10), (0, 3), (3, 10)],
        3, id="three-distinct-paths-between-junctions",
    ),
    pytest.param(
        [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)],
        0, id="cycles-internal-to-junction-are-not-branches",
    ),
    pytest.param(
        [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3), (0, 4), (4, 5), (1, 6), (6, 7)],
        1, id="junction-with-two-exits-is-part-of-one-path",
    ),
])
def test_maximal_nonbranching_paths_and_cycle_conventions(edges, expected):
    adjacency = graph(edges, isolated=(99,))
    assert _count_branches(adjacency) == expected
    # A count must not depend on voxel/dictionary traversal order.
    reversed_adjacency = {node: list(reversed(neighbors)) for node, neighbors in reversed(adjacency.items())}
    assert _count_branches(reversed_adjacency) == expected
