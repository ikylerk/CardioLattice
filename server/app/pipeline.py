from __future__ import annotations

import json
import traceback
from pathlib import Path

import numpy as np
import pydicom
from sqlalchemy import select

from . import audit
from .config import settings
from .db import SessionLocal
from .imaging.dicom import (
    build_preview,
    deidentify_series,
    load_series,
    write_hu_nifti,
)
from .imaging.mesh import build_glb, cavity_volumes
from .imaging.segmentation import segment_synthetic, segment_totalsegmentator
from .codes import REASON_BY_MEASUREMENT, STAGE_MESSAGE, CodedError, store
from .models import (
    Job,
    Measurement,
    MeshRecord,
    Report,
    Segmentation,
    Study,
    VolumeRecord,
    utcnow,
)
from .registration import register_cardiac_atlas
from .reporting import template_report
from .storage import storage

PIPELINE_VERSION = "m1.1-physical-geometry"
_NOT_COMPUTED = ("LV_EF", "STENOSIS_LAD", "FFR_CT", "CALCIUM_SCORE", "AHA_SEGMENTS")


def make_pipeline_job(study_id: str, lang: str) -> Job:
    """Queue a pipeline job. ``lang`` is the report language captured at creation."""
    return Job(
        study_id=study_id,
        type="pipeline",
        state="queued",
        stage="queued",
        message=store("STAGE_QUEUED"),
        payload={"lang": lang},
    )


def _job_language(job: Job | None) -> str:
    payload = job.payload if job is not None else None
    stored = payload.get("lang") if isinstance(payload, dict) else None
    if stored in ("en", "zh"):
        return stored
    return "en"


def _progress(db, job: Job, stage: str, progress: int) -> None:
    job.stage = stage
    job.progress = max(job.progress, min(progress, 100))
    job.message = store(STAGE_MESSAGE[stage])
    job.state = "running"
    job.updated_at = utcnow()
    db.commit()


def _selected_files(series) -> list[Path]:
    if not series.storage_dir:
        raise CodedError("SERIES_NO_FILES")
    root = storage.path_for(series.storage_dir)
    files: list[Path] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        try:
            header = pydicom.dcmread(str(path), stop_before_pixels=True, force=True)
        except Exception:
            continue
        if str(getattr(header, "SeriesInstanceUID", "")) == series.series_uid:
            files.append(path)
    if not files:
        raise CodedError("NO_DICOM_FOR_SERIES")
    return files


def _reset_derived(db, study: Study) -> None:
    for model in (VolumeRecord, Segmentation, MeshRecord, Measurement, Report):
        db.query(model).filter(model.study_id == study.id).delete()
    db.commit()


def run_pipeline(study_id: str, job_id: str) -> None:
    db = SessionLocal()
    try:
        study = db.get(Study, study_id)
        job = db.get(Job, job_id)
        if study is None or job is None:
            return
        study.status = "processing"
        study.error = None
        db.commit()
        language = _job_language(job)

        selected = next((item for item in study.series if item.is_selected), None)
        if selected is None:
            raise CodedError("NO_SERIES_SELECTED")

        _progress(db, job, "validating", 5)
        files = _selected_files(selected)

        _progress(db, job, "anonymizing", 15)
        deid_dir = storage.study_dir(study.id) / "deid"
        if deid_dir.exists():
            for path in deid_dir.glob("*"):
                path.unlink()
        deidentify_series(files, deid_dir, salt=settings.deid_salt)
        deid_files = sorted(deid_dir.glob("*.dcm"))
        audit.record(db, study_id=study.id, actor=settings.default_actor, action="deidentify", payload={"files": len(deid_files)})
        db.commit()

        _progress(db, job, "building_volume", 30)
        loaded = load_series(deid_files, resample_mm=settings.resample_mm, salt=settings.deid_salt)
        if study.subject:
            if not study.subject.sex:
                study.subject.sex = loaded.subject.sex
            if study.subject.age_years is None:
                study.subject.age_years = loaded.subject.age_years
        write_hu_nifti(loaded, storage.study_dir(study.id) / "derived" / "volume_hu.nii.gz")
        db.commit()

        preview = build_preview(loaded, max_dim=settings.max_voxels)
        _reset_derived(db, study)

        volume_path = storage.study_dir(study.id) / "derived" / "volume.u8"
        volume_path.parent.mkdir(parents=True, exist_ok=True)
        preview.data.tofile(str(volume_path))
        volume = VolumeRecord(
            study_id=study.id,
            series_id=selected.id,
            kind="preview_u8",
            dims=preview.dims,
            spacing=preview.spacing,
            origin=preview.origin,
            direction=preview.direction,
            affine=preview.affine,
            hu_range=preview.hu_range,
            data_path=storage.relative(volume_path),
            bytes=int(preview.data.nbytes),
            pipeline_version=PIPELINE_VERSION,
            default_slices=preview.default_slices,
            markers=[],
            stats=preview.stats,
        )
        db.add(volume)
        db.commit()
        audit.record(
            db,
            study_id=study.id,
            actor=settings.default_actor,
            action="build_volume",
            payload={
                "dims": preview.dims,
                "spacing": preview.spacing,
                "hu_range": preview.hu_range,
                "warnings": loaded.warnings,
            },
        )
        db.commit()

        _progress(db, job, "segmenting", 55)
        segmentation_result = None
        if study.source == "demo" and (study.fixture_meta or {}).get("labels_path"):
            segmentation_result = segment_synthetic(study, preview)
        elif settings.segmentation_adapter == "totalsegmentator":
            segmentation_result = segment_totalsegmentator(
                storage.study_dir(study.id) / "derived" / "volume_hu.nii.gz", preview
            )
        else:
            audit.record(
                db,
                study_id=study.id,
                actor=settings.default_actor,
                action="segmentation_skipped",
                payload={"reason": "no registered segmentation adapter for real uploads"},
            )
            db.commit()

        segmentation = None
        if segmentation_result is not None:
            labels_path = storage.study_dir(study.id) / "derived" / "labels.npy"
            np.save(labels_path, segmentation_result.label_array)
            segmentation = Segmentation(
                study_id=study.id,
                volume_id=volume.id,
                task=segmentation_result.model_id,
                model_id=segmentation_result.model_id,
                model_version=segmentation_result.model_version,
                status="completed",
                mask_path=storage.relative(labels_path),
                label_map=segmentation_result.label_map,
                quality=segmentation_result.quality,
                provenance={
                    **segmentation_result.provenance,
                    "validation_status": segmentation_result.validation_status,
                },
            )
            db.add(segmentation)
            db.commit()

        _progress(db, job, "meshing", 72)
        mesh_infos = []
        mesh_path = None
        scene_transform = None
        if segmentation_result is not None:
            mesh_path = storage.study_dir(study.id) / "derived" / "structures.glb"
            mesh_infos, scene_transform = build_glb(segmentation_result.label_array, preview, mesh_path)
            for info in mesh_infos:
                db.add(
                    MeshRecord(
                        study_id=study.id,
                        segmentation_id=segmentation.id,
                        structure_code=info.structure_code,
                        path=storage.relative(mesh_path),
                        format="glb",
                        vertex_count=info.vertex_count,
                        triangle_count=info.triangle_count,
                        bbox=info.bbox,
                        scene_transform=scene_transform,
                        provenance={
                            "model_id": segmentation_result.model_id,
                            "model_version": segmentation_result.model_version,
                            "validation_status": segmentation_result.validation_status,
                        },
                    )
                )
            db.commit()

        _progress(db, job, "computing_metrics", 85)
        measurements: list[Measurement] = []
        if segmentation_result is not None:
            volumes = cavity_volumes(segmentation_result.label_array, preview)
            for code, value in volumes.items():
                measurement_code = f"{code}_VOLUME"
                measurement = Measurement(
                    study_id=study.id,
                    code=measurement_code,
                    label=measurement_code,
                    value=round(float(value), 2),
                    unit="mL",
                    method="voxel_count",
                    source=segmentation_result.model_id,
                    validation_status=segmentation_result.validation_status,
                    status="computed",
                    provenance={
                        "segmentation_id": segmentation.id,
                        "voxel_volume_ml": float(np.prod(preview.spacing)) / 1000.0,
                    },
                )
                db.add(measurement)
                measurements.append(measurement)

        unavailable = list(_NOT_COMPUTED)
        for code in unavailable:
            db.add(
                Measurement(
                    study_id=study.id,
                    code=code,
                    label=code,
                    value=None,
                    unit=None,
                    method="not_available",
                    source="none",
                    validation_status="not_computed",
                    status="not_computed",
                    reason=REASON_BY_MEASUREMENT[code],
                )
            )
        if segmentation is not None and segmentation_result is not None:
            register_cardiac_atlas(db, study, volume, segmentation, segmentation_result.label_array)
        else:
            db.add(
                Measurement(
                    study_id=study.id,
                    code="ATLAS_REGISTRATION",
                    label="ATLAS_REGISTRATION",
                    value=None,
                    unit=None,
                    method="chamber_centroid_similarity",
                    source="reference_atlas",
                    validation_status="not_computed",
                    status="not_computed",
                    reason=store("MISSING_VALIDATED_INPUT", required_chambers=3),
                )
            )
        db.commit()
        measurements = list(
            db.scalars(select(Measurement).where(Measurement.study_id == study.id)).all()
        )

        # Synthetic calcification marker, if the fixture contains one.
        if segmentation_result is not None:
            calc = np.argwhere(segmentation_result.label_array == 7)
            if calc.size:
                cz, cy, cx = calc.mean(axis=0)
                sx, sy, sz = preview.spacing
                nx, ny, nz = preview.dims
                voxel = [int(round(cx)), int(round(cy)), int(round(cz))]
                world = [
                    (voxel[0] + 0.5 - nx / 2) * sx,
                    (voxel[1] + 0.5 - ny / 2) * sy,
                    (voxel[2] + 0.5 - nz / 2) * sz,
                ]
                volume.markers = [
                    {
                        "id": "marker_calc_1",
                        "label": "MARKER_CALCIFICATION_SYNTHETIC",
                        "voxel": voxel,
                        "worldMm": world,
                        "findingId": None,
                        "provenance": "synthetic_ground_truth",
                    }
                ]
                db.commit()

        _progress(db, job, "drafting_report", 92)
        report = Report(
            study_id=study.id,
            status="draft",
            content=template_report(study, measurements, language),
            generator="template",
        )
        db.add(report)
        study.status = "ready"
        job.state = "succeeded"
        job.stage = "succeeded"
        job.progress = 100
        job.message = store("STAGE_SUCCEEDED")
        job.updated_at = utcnow()
        audit.record(
            db,
            study_id=study.id,
            actor=settings.default_actor,
            action="pipeline_completed",
            payload={"measurements": len(measurements), "mesh_structures": len(mesh_infos)},
        )
        db.commit()
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        db.rollback()
        study = db.get(Study, study_id)
        job = db.get(Job, job_id)
        if isinstance(exc, CodedError):
            stored_error = store(exc.code, **exc.params)
        else:
            stored_error = store("UNEXPECTED", detail=str(exc)[:500])
        if study:
            study.status = "failed"
            study.error = stored_error
        if job:
            job.state = "failed"
            job.stage = "failed"
            job.error = stored_error
            job.message = store("STAGE_FAILED")
            job.updated_at = utcnow()
        if study:
            audit.record(
                db,
                study_id=study.id,
                actor=settings.default_actor,
                action="pipeline_failed",
                payload={"error": str(exc)[:500]},
            )
        db.commit()
    finally:
        db.close()
