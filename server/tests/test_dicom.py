from __future__ import annotations

from pathlib import Path

import numpy as np
import pydicom

from app.imaging.dicom import (
    build_preview,
    choose_series,
    deidentify_series,
    inspect_files,
    load_label_image,
    load_series,
    align_labels_to_preview,
)
from app.imaging.mesh import build_glb, cavity_volumes
from scripts.make_synthetic_dicom import generate_fixture


def _fixture(tmp_path: Path) -> tuple[dict, list[Path]]:
    meta = generate_fixture(tmp_path / "fixture")
    paths = sorted((tmp_path / "fixture" / "dicom").glob("*.dcm"))
    return meta, paths


def test_series_selection_and_hu(tmp_path):
    meta, paths = _fixture(tmp_path)
    series = inspect_files(paths)
    assert len(series) == 1
    best, ambiguous = choose_series(series)
    assert best is not None and ambiguous is False

    loaded = load_series(paths, resample_mm=1.5, salt="test")
    labels, _ = load_label_image(Path(meta["labels_path"]), resample_mm=1.5)
    assert loaded.array_hu.shape == labels.shape

    # HU conversion and label alignment: the LV blood pool should be ~330 HU.
    lv = loaded.array_hu[labels == 1]
    rv = loaded.array_hu[labels == 2]
    myo = loaded.array_hu[labels == 6]
    assert lv.size > 0 and rv.size > 0 and myo.size > 0
    assert abs(float(lv.mean()) - 330) < 25
    assert abs(float(rv.mean()) - 330) < 25
    assert abs(float(myo.mean()) - 62) < 25


def test_preview_contract(tmp_path):
    _, paths = _fixture(tmp_path)
    loaded = load_series(paths, resample_mm=1.5, salt="test")
    preview = build_preview(loaded, max_dim=96)

    assert preview.data.dtype == np.uint8
    assert preview.data.size == int(np.prod(preview.dims))
    assert len(preview.dims) == 3
    assert preview.hu_range[0] >= -1024
    assert preview.hu_range[1] > preview.hu_range[0]
    assert preview.data.min() == 0
    assert preview.data.max() == 255
    assert len(preview.crop_box_zyx) == 6


def test_labels_align_to_preview_and_mesh(tmp_path):
    meta, paths = _fixture(tmp_path)
    loaded = load_series(paths, resample_mm=1.5, salt="test")
    preview = build_preview(loaded, max_dim=96)
    labels, _ = load_label_image(Path(meta["labels_path"]), resample_mm=1.5)
    aligned = align_labels_to_preview(labels, preview)

    assert aligned.shape == (preview.dims[2], preview.dims[1], preview.dims[0])
    assert set(np.unique(aligned).tolist()) >= {1, 2, 3, 4, 5, 6, 7}

    out = tmp_path / "structures.glb"
    infos, transform = build_glb(aligned, preview, out)
    assert out.exists() and out.stat().st_size > 1000
    assert {info.structure_code for info in infos} >= {"LV", "RV", "LA", "RA"}
    assert transform["scale"] > 0
    volumes = cavity_volumes(aligned, preview)
    assert set(volumes) == {"LV", "RV", "LA", "RA"}
    assert all(value > 0 for value in volumes.values())


def test_deidentification_removes_phi(tmp_path):
    _, paths = _fixture(tmp_path)
    out = tmp_path / "deid"
    original = pydicom.dcmread(str(paths[0]), stop_before_pixels=True, force=True)
    assert "PHI-TEST-001" == str(original.PatientID)

    uid_map = deidentify_series(paths[:4], out, salt="test-salt")
    assert uid_map
    deid_files = sorted(out.glob("*.dcm"))
    assert len(deid_files) == 4

    for path in deid_files:
        header = pydicom.dcmread(str(path), stop_before_pixels=True, force=True)
        assert header.PatientIdentityRemoved == "YES"
        assert str(header.PatientName) == "ANONYMOUS"
        assert "PHI-TEST-001" not in str(header.PatientID)
        assert "PHI TEST HOSPITAL" not in str(getattr(header, "InstitutionName", ""))
        assert str(header.StudyInstanceUID) != str(original.StudyInstanceUID)
        assert str(header.StudyInstanceUID) in set(uid_map.values())
