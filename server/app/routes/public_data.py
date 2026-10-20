from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, Query
from sqlalchemy.orm import Session

from .. import audit
from ..codes import CodedError, http_error, require_lang
from ..config import settings
from ..db import get_db
from ..ingest import new_study_id
from ..models import Job, Study, Subject, utcnow
from ..public_import import run_public_import
from ..schemas import job_out, study_bundle
from ..storage import storage

router = APIRouter(prefix="/api")


def _extension_ok(name: str | None) -> bool:
    lower = (name or "").lower()
    return lower.endswith(".nii") or lower.endswith(".nii.gz")


@router.post("/public/import", status_code=202)
def import_public_case(
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...),
    labels: UploadFile = File(...),
    dataset: str = Form("public_dataset"),
    label_map: str = Form(""),
    lang: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Import a public NIfTI case (for example ImageCAS / ASOCA).

    This is a research-only path and is marked `source=public_dataset`. It does
    not run the clinical DICOM de-identification pipeline.
    """
    try:
        language = require_lang(lang)
    except CodedError as exc:
        raise http_error(exc) from exc
    if not _extension_ok(image.filename) or not _extension_ok(labels.filename):
        raise HTTPException(status_code=400, detail="image and labels must be .nii or .nii.gz")
    study_id = new_study_id()
    public_dir = storage.study_dir(study_id) / "upload" / "public"
    public_dir.mkdir(parents=True, exist_ok=True)
    image_path = public_dir / ("image.nii.gz" if (image.filename or "").lower().endswith(".gz") else "image.nii")
    labels_path = public_dir / ("labels.nii.gz" if (labels.filename or "").lower().endswith(".gz") else "labels.nii")
    try:
        input_hashes = {}
        for key, upload, target in (("image", image, image_path), ("labels", labels, labels_path)):
            content_hash = hashlib.sha256()
            with target.open("wb") as handle:
                while chunk := upload.file.read(1024 * 1024):
                    content_hash.update(chunk)
                    handle.write(chunk)
            input_hashes[key] = content_hash.hexdigest()
        digest = hashlib.sha256(f"{dataset}:{input_hashes['image']}".encode()).hexdigest()
        subject = db.query(Subject).filter(Subject.patient_id_hash == digest).first()
        if subject is None:
            subject = Subject(
                pseudonym=f"PUBLIC-{digest[:6].upper()}",
                patient_id_hash=digest,
                sex=None,
                age_years=None,
            )
            db.add(subject)
            db.flush()
        study = Study(
            id=study_id,
            subject_id=subject.id,
            study_uid=f"2.25.{uuid4()}",
            study_date=None,
            description=f"公开数据集 · {dataset}",
            modality="CT",
            source="public_dataset",
            status="queued",
            fixture_meta={
                "image_path": storage.relative(image_path),
                "labels_path": storage.relative(labels_path),
                "dataset": dataset,
                "label_map": label_map,
                "input_hashes": input_hashes,
                "dataset_verification": "user_declared",
            },
        )
        db.add(study)
        job = Job(
            study_id=study_id,
            type="public_import",
            payload={"lang": language},
            state="queued",
            stage="queued",
            message="Queued public NIfTI import",
        )
        db.add(job)
        audit.record(
            db,
            study_id=study_id,
            actor=settings.default_actor,
            action="public_import_requested",
            payload={"dataset": dataset, "label_map_supplied": bool(label_map)},
        )
        db.commit()
        if settings.run_pipeline_sync:
            run_public_import(study_id, job.id)
        else:
            background_tasks.add_task(run_public_import, study_id, job.id)
        job_id = job.id
        db.expire_all()
        study = db.get(Study, study_id)
        job = db.get(Job, job_id)
        return {"study": study_bundle(study), "job": job_out(job) if job else None}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        storage.delete_study(study_id)
        raise HTTPException(status_code=500, detail=f"public import failed: {exc}") from exc
