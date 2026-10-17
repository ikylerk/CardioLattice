from __future__ import annotations

import hashlib
from pathlib import Path

from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import audit
from .config import settings
from .imaging.dicom import (
    choose_series,
    collect_dicom_paths,
    inspect_files,
    read_study_meta,
    safe_extract_zip,
    subject_from_headers,
)
from .models import Job, Series, Study, Subject, new_id
from .pipeline import run_pipeline
from .storage import storage


def enqueue_pipeline(background_tasks: BackgroundTasks | None, study_id: str, job_id: str) -> None:
    if settings.run_pipeline_sync or background_tasks is None:
        run_pipeline(study_id, job_id)
    else:
        background_tasks.add_task(run_pipeline, study_id, job_id)


def prepare_upload(files, *, study_id: str) -> tuple[Path, list[Path]]:
    """Persist an upload and return (extracted_dir, dicom candidate paths)."""
    extracted = storage.study_dir(study_id) / "upload" / "extracted"
    extracted.mkdir(parents=True, exist_ok=True)
    max_bytes = settings.max_upload_mb * 1024 * 1024
    total = 0

    if len(files) == 1 and (files[0].filename or "").lower().endswith(".zip"):
        upload = files[0]
        archive_path = storage.study_dir(study_id) / "upload" / "archive.zip"
        archive_path.parent.mkdir(parents=True, exist_ok=True)
        with archive_path.open("wb") as handle:
            while chunk := upload.file.read(1024 * 1024):
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError("upload exceeds size limit")
                handle.write(chunk)
        safe_extract_zip(archive_path, extracted, max_bytes)
    else:
        for upload in files:
            name = Path(upload.filename or "upload.bin").name
            target = extracted / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("wb") as handle:
                while chunk := upload.file.read(1024 * 1024):
                    total += len(chunk)
                    if total > max_bytes:
                        raise ValueError("upload exceeds size limit")
                    handle.write(chunk)

    paths = collect_dicom_paths(extracted)
    if not paths:
        raise ValueError("no readable DICOM files found in the upload")
    return extracted, paths


def create_study_from_paths(
    db: Session,
    *,
    study_id: str,
    extracted_dir: Path,
    paths: list[Path],
    source: str,
    fixture_meta: dict | None,
    background_tasks: BackgroundTasks | None,
) -> tuple[Study, Job | None]:
    series_infos = inspect_files(paths)
    if not series_infos:
        raise ValueError("no CT/MR DICOM series found; this build accepts CCTA DICOM only")
    meta = read_study_meta(paths)
    subject_info = subject_from_headers(paths, salt=settings.deid_salt)

    existing = db.scalar(select(Study).where(Study.study_uid == meta["study_uid"]))
    if existing is not None:
        raise ValueError("this study has already been uploaded")

    subject = db.scalar(select(Subject).where(Subject.patient_id_hash == subject_info.patient_id_hash))
    if subject is None:
        subject = Subject(
            pseudonym=subject_info.pseudonym,
            sex=subject_info.sex,
            age_years=subject_info.age_years,
            patient_id_hash=subject_info.patient_id_hash,
        )
        db.add(subject)
        db.flush()

    study = Study(
        id=study_id,
        subject_id=subject.id,
        study_uid=meta["study_uid"],
        accession_hash=hashlib.sha256(f"{settings.deid_salt}:{meta['accession']}".encode()).hexdigest()
        if meta["accession"]
        else None,
        study_date=meta["study_date"] or None,
        description=meta["description"] or series_infos[0].description,
        modality="CT",
        source=source,
        status="uploaded",
        fixture_meta=fixture_meta,
    )
    db.add(study)

    rows: list[Series] = []
    for info in series_infos:
        row = Series(
            study_id=study_id,
            series_uid=info.series_uid,
            series_number=info.series_number,
            modality=info.modality,
            description=info.description,
            slice_count=info.slice_count,
            rows=info.rows,
            cols=info.cols,
            pixel_spacing=info.pixel_spacing,
            slice_thickness=info.slice_thickness,
            spacing_between_slices=info.spacing_between_slices,
            image_orientation=info.image_orientation,
            image_position_first=info.image_position_first,
            kvp=info.kvp,
            kernel=info.kernel,
            contrast_agent=info.contrast_agent,
            candidate_score=info.score,
            reasons=info.reasons,
            storage_dir=storage.relative(extracted_dir),
        )
        db.add(row)
        rows.append(row)
    db.flush()

    best, ambiguous = choose_series(series_infos)
    if best is None:
        raise ValueError("no plausible CCTA series with at least 16 slices")

    selected = next(row for row in rows if row.series_uid == best.series_uid)
    selected.is_selected = True

    job = None
    if ambiguous and source != "demo":
        study.status = "needs_series_selection"
    else:
        study.status = "queued"
        job = Job(study_id=study_id, type="pipeline", state="queued", stage="queued", message="Queued")
        db.add(job)

    audit.record(
        db,
        study_id=study_id,
        actor=settings.default_actor,
        action="ingest",
        payload={
            "source": source,
            "series": [
                {"uid": info.series_uid, "score": info.score, "slices": info.slice_count}
                for info in series_infos
            ],
            "ambiguous": ambiguous,
        },
    )
    db.commit()

    if job is not None:
        enqueue_pipeline(background_tasks, study_id, job.id)
    return study, job


def new_study_id() -> str:
    return new_id("stu")
