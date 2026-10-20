"""Focused checks for the geometry/i18n merge; inference stays mocked."""

import json
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import numpy as np
import pytest
import SimpleITK as sitk
import trimesh
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app import pipeline, registration
from app.codes import CodedError, as_coded
from app.imaging import segmentation
from app.imaging.dicom import LoadedSeries, SubjectInfo, build_preview
from app.imaging.mesh import build_glb, build_structure_glb
from app.models import Base, Job, Measurement, MeshRecord, Report, Segmentation, Series, Study, Subject, VolumeRecord
from app.storage import LocalStorage


@pytest.fixture
def case(tmp_path, monkeypatch):
    labels = np.zeros((20, 20, 20), dtype=np.uint8)
    for value, (z, y, x) in enumerate(
        [(3, 3, 3), (3, 3, 13), (3, 13, 3), (13, 13, 13), (13, 3, 3), (13, 3, 13)],
        start=1,
    ):
        labels[z:z + 3, y:y + 3, x:x + 3] = value
    loaded = LoadedSeries(
        array_hu=labels.astype(np.float32) * 100,
        spacing_mm=(0.8, 1.2, 2.0),
        origin=(43.0, -21.0, 67.0),
        direction=(0.0, -1.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 1.0),
        warnings=[],
        subject=SubjectInfo("merge-test", "merge-test", "F", 60, None, None),
    )
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    storage = LocalStorage(tmp_path / "storage")
    monkeypatch.setattr(pipeline, "SessionLocal", sessions)
    monkeypatch.setattr(pipeline, "storage", storage)
    monkeypatch.setattr(registration, "storage", storage)
    monkeypatch.setattr(pipeline, "_selected_files", lambda series: [])
    monkeypatch.setattr(pipeline, "load_series", lambda *args, **kwargs: loaded)
    monkeypatch.setattr(pipeline, "deidentify_series",
                        lambda files, out_dir, **kwargs: out_dir.mkdir(parents=True, exist_ok=True))
    monkeypatch.setattr(pipeline.settings, "segmentation_adapter", "totalsegmentator")
    with sessions() as db:
        study = Study(id="merge-study", subject=Subject(pseudonym="merge-test"), study_uid="merge-uid")
        study.series.append(Series(series_uid="merge-series", is_selected=True))
        db.add(study)
        db.commit()

    yield SimpleNamespace(
        labels=labels, loaded=loaded, storage=storage, sessions=sessions, study_id=study.id,
    )
    engine.dispose()


@pytest.fixture
def inference(monkeypatch):
    calls = []
    package = ModuleType("totalsegmentator")
    package.__path__ = []
    api = ModuleType("totalsegmentator.python_api")
    package.python_api = api
    stems = [
        "heart_ventricle_left", "heart_ventricle_right", "heart_atrium_left",
        "heart_atrium_right", "aorta", "heart_myocardium",
    ]

    def infer(input_path, output_path, **kwargs):
        # Consume the pipeline's actual exported HU NIfTI. The model's outputs
        # inherit that geometry, so lost origin/direction breaks the whole path.
        image = sitk.ReadImage(input_path)
        calls.append((image, kwargs))
        for value, stem in enumerate(stems, start=1):
            mask = sitk.Cast(image == value * 100, sitk.sitkUInt8)
            sitk.WriteImage(mask, str(Path(output_path) / f"{stem}.nii.gz"))

    api.totalsegmentator = infer
    monkeypatch.setitem(sys.modules, "totalsegmentator", package)
    monkeypatch.setitem(sys.modules, "totalsegmentator.python_api", api)
    installed_version = segmentation.metadata.version
    monkeypatch.setattr(
        segmentation.metadata, "version",
        lambda name: "9.8.7+merge.test" if name == "TotalSegmentator" else installed_version(name),
    )
    return calls


def queue(case, lang="en"):
    with case.sessions() as db:
        job = pipeline.make_pipeline_job(case.study_id, lang or "en")
        if lang is None:
            job.payload = None  # Jobs created before report-language capture.
        db.add(job)
        db.commit()
        return job.id


@pytest.mark.parametrize("lang", ["en", "zh", None])
def test_pipeline_keeps_geometry_registration_and_job_language(case, inference, lang):
    job_id = queue(case, lang)
    pipeline.run_pipeline(case.study_id, job_id)

    with case.sessions() as db:
        job = db.get(Job, job_id)
        assert job.state == "succeeded", job.error
        assert job.progress == 100
        assert as_coded(job.message) == {"code": "STAGE_SUCCEEDED", "params": {}}
        assert db.get(Study, case.study_id).status == "ready"
        volume = db.scalars(select(VolumeRecord)).one()
        assert volume.pipeline_version == "m1.1-physical-geometry"
        assert volume.origin == list(case.loaded.origin)
        assert volume.direction == list(case.loaded.direction)
        expected_affine = np.eye(4)
        expected_affine[:3, :3] = np.reshape(case.loaded.direction, (3, 3)) @ np.diag(case.loaded.spacing_mm)
        expected_affine[:3, 3] = case.loaded.origin
        np.testing.assert_allclose(volume.affine, expected_affine)

        mask_record = db.scalars(select(Segmentation)).one()
        np.testing.assert_array_equal(np.load(case.storage.path_for(mask_record.mask_path)), case.labels)
        assert mask_record.model_version == "9.8.7+merge.test"
        assert mask_record.provenance["weights_version"] is None
        assert mask_record.provenance["coordinate_system"] == "LPS"
        assert mask_record.quality["warnings"] == ["QUALITY_TOTALSEGMENTATOR_RESEARCH"]
        assert mask_record.quality["native_voxels"] == mask_record.quality["preview_voxels"]
        assert set(mask_record.quality["native_voxels"].values()) == {27}

        meshes = list(db.scalars(select(MeshRecord)))
        assert {mesh.structure_code for mesh in meshes} == {"LV", "RV", "LA", "RA", "AO", "MYO"}
        center = (np.asarray(volume.dims) - 1) * volume.spacing / 2
        for mesh in meshes:
            np.testing.assert_allclose(mesh.scene_transform["center_mm"], center)
            assert mesh.scene_transform["source"] == "preview_index_axis_mm"
            assert mesh.scene_transform["note"] == "NOTE_GLB_SCENE_UNITS"

        measurements = {row.code: row for row in db.scalars(select(Measurement))}
        for code in ("LV_VOLUME", "RV_VOLUME", "LA_VOLUME", "RA_VOLUME"):
            assert measurements[code].label == code
            assert measurements[code].value == round(27 * np.prod(case.loaded.spacing_mm) / 1000, 2)
        for code in pipeline._NOT_COMPUTED:
            assert measurements[code].status == "not_computed"
            assert measurements[code].label == code
            assert isinstance(as_coded(measurements[code].reason), dict)
        fit = measurements["ATLAS_REGISTRATION_RMS"]
        assert fit.status == "computed"
        assert fit.provenance["fitMetric"] == "in_sample_landmark_rms"
        assert fit.provenance["targetAccuracyStatus"] == "not_evaluated"
        assert fit.provenance["targetAccuracyMm"] is None
        report = db.scalars(select(Report)).one()
        assert report.content["lang"] == report.content["provenance"]["lang"] == (lang or "en")

    assert len(inference) == 1
    exported, options = inference[0]
    assert exported.GetOrigin() == pytest.approx(case.loaded.origin)
    assert exported.GetDirection() == pytest.approx(case.loaded.direction)
    assert exported.GetSpacing() == pytest.approx(case.loaded.spacing_mm)
    assert options["task"] == "heartchambers_highres"
    assert options["ml"] is False


def test_pipeline_preserves_coded_failure_params(case, monkeypatch):
    job_id = queue(case, "zh")

    def bad_volume(*args, **kwargs):
        raise CodedError("VOLUME_SIZE", size=3, dims=[2, 2, 2])

    monkeypatch.setattr(pipeline, "load_series", bad_volume)
    pipeline.run_pipeline(case.study_id, job_id)
    with case.sessions() as db:
        job = db.get(Job, job_id)
        study = db.get(Study, case.study_id)
        assert job.state == study.status == "failed"
        assert as_coded(job.error) == as_coded(study.error) == {
            "code": "VOLUME_SIZE", "params": {"size": 3, "dims": [2, 2, 2]},
        }
        assert as_coded(job.message) == {"code": "STAGE_FAILED", "params": {}}
        assert db.scalars(select(Report)).first() is None


def test_pipeline_without_adapter_keeps_registration_unavailable(case, monkeypatch):
    monkeypatch.setattr(pipeline.settings, "segmentation_adapter", "synthetic_ground_truth")
    job_id = queue(case, "zh")
    pipeline.run_pipeline(case.study_id, job_id)
    with case.sessions() as db:
        job = db.get(Job, job_id)
        assert job.state == "succeeded", job.error
        row = db.scalars(select(Measurement).where(Measurement.code == "ATLAS_REGISTRATION")).one()
        assert row.label == "ATLAS_REGISTRATION"
        assert row.status == "not_computed" and row.value is None
        assert as_coded(row.reason) == {
            "code": "MISSING_VALIDATED_INPUT", "params": {"required_chambers": 3},
        }


@pytest.mark.parametrize("native", [False, True])
def test_both_mesh_paths_use_the_same_empty_result_code(case, tmp_path, native):
    preview = build_preview(case.loaded, crop_mm=None)
    empty = np.zeros_like(case.labels)
    with pytest.raises(CodedError) as exc:
        if native:
            build_structure_glb(empty, preview, tmp_path / "empty.glb", {1: {"code": "LV"}})
        else:
            build_glb(empty, preview, tmp_path / "empty.glb")
    assert exc.value.body() == {"code": "NO_LABELLED_STRUCTURES", "params": {}}


def test_native_mesh_keeps_components_and_machine_readable_provenance(case, tmp_path):
    preview = build_preview(case.loaded, crop_mm=None)
    labels = np.zeros_like(case.labels, dtype=np.uint16)
    labels[0:3, 2:5, 2:5] = 300
    labels[12:15, 12:15, 12:15] = 300
    output = tmp_path / "native.glb"
    _, transform = build_structure_glb(labels, preview, output, {300: {"code": "CORONARY"}})
    scene = trimesh.load(output, force="scene")
    assert len(next(iter(scene.geometry.values())).split()) == 2
    assert transform["note"] == "NOTE_GLB_SCENE_UNITS"
    assert transform["allLabelComponentsRetained"] is True
    assert transform["surfaceSmoothing"] is False
    assert transform["physicalCoordinateSystem"] == "LPS"
    json.dumps(transform)
