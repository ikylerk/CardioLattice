from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..config import settings
from ..db import SessionLocal, get_db
from ..ingest import create_study_from_paths, enqueue_pipeline, new_study_id, prepare_upload
from ..models import AuditEvent, Job, Report, Study, utcnow
from ..schemas import job_out, report_out, study_bundle, study_summary
from ..storage import storage

router = APIRouter(prefix="/api")


class SeriesSelection(BaseModel):
    seriesId: str


class ApproveRequest(BaseModel):
    approvedBy: str = settings.default_actor


def _bundle(db: Session, study_id: str):
    study = db.get(Study, study_id)
    if study is None:
        raise HTTPException(status_code=404, detail="study not found")
    return study_bundle(study)


@router.get("/health")
def health():
    return {
        "status": "ok",
        "dataMode": "api",
        "segmentationAdapter": settings.segmentation_adapter,
        "pipelineVersion": "m1.0",
        "researchOnly": True,
    }


@router.get("/studies")
def list_studies(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    studies = db.scalars(select(Study).order_by(Study.created_at.desc()).limit(limit)).all()
    return {"items": [study_summary(item) for item in studies]}


@router.post("/studies", status_code=202)
def upload_study(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    study_id = new_study_id()
    try:
        extracted, paths = prepare_upload(files, study_id=study_id)
        study, job = create_study_from_paths(
            db,
            study_id=study_id,
            extracted_dir=extracted,
            paths=paths,
            source="upload",
            fixture_meta=None,
            background_tasks=background_tasks,
        )
    except ValueError as exc:
        db.rollback()
        storage.delete_study(study_id)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        storage.delete_study(study_id)
        raise HTTPException(status_code=500, detail=f"ingest failed: {exc}") from exc
    job_id = job.id if job else None
    db.expire_all()
    study = db.get(Study, study_id)
    job = db.get(Job, job_id) if job_id else None
    return {"study": study_bundle(study), "job": job_out(job) if job else None}


@router.post("/studies/demo", status_code=202)
def create_demo_study(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate a synthetic DICOM fixture server-side and run the real pipeline.

    This is the fastest way to exercise upload -> volume -> mesh -> metrics
    without any patient data. The study is permanently marked `source=demo` and
    every measurement carries `validation_status=synthetic`.
    """
    from scripts.make_synthetic_dicom import generate_fixture

    study_id = new_study_id()
    try:
        fixture_dir = storage.study_dir(study_id) / "fixture"
        meta = generate_fixture(fixture_dir)
        paths = sorted((fixture_dir / "dicom").glob("*.dcm"))
        study, job = create_study_from_paths(
            db,
            study_id=study_id,
            extracted_dir=fixture_dir / "dicom",
            paths=paths,
            source="demo",
            fixture_meta={"labels_path": meta["labels_path"], "kind": meta["kind"]},
            background_tasks=background_tasks,
        )
    except ValueError as exc:
        db.rollback()
        storage.delete_study(study_id)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        storage.delete_study(study_id)
        raise HTTPException(status_code=500, detail=f"demo fixture failed: {exc}") from exc
    job_id = job.id if job else None
    db.expire_all()
    study = db.get(Study, study_id)
    job = db.get(Job, job_id) if job_id else None
    return {"study": study_bundle(study), "job": job_out(job) if job else None}


@router.get("/studies/{study_id}")
def get_study(study_id: str, db: Session = Depends(get_db)):
    return _bundle(db, study_id)


@router.post("/studies/{study_id}/select-series")
def select_series(
    study_id: str,
    body: SeriesSelection,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    study = db.get(Study, study_id)
    if study is None:
        raise HTTPException(status_code=404, detail="study not found")
    chosen = next((item for item in study.series if item.id == body.seriesId), None)
    if chosen is None:
        raise HTTPException(status_code=404, detail="series not found in this study")
    for item in study.series:
        item.is_selected = item.id == chosen.id
    study.status = "queued"
    job = Job(study_id=study.id, type="pipeline", state="queued", stage="queued", message="Queued")
    db.add(job)
    audit.record(
        db,
        study_id=study.id,
        actor=settings.default_actor,
        action="select_series",
        payload={"series_id": chosen.id},
    )
    db.commit()
    enqueue_pipeline(background_tasks, study_id, job.id)
    return {"study": study_bundle(study), "job": job_out(job)}


@router.post("/studies/{study_id}/pipeline", status_code=202)
def rerun_pipeline(
    study_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    study = db.get(Study, study_id)
    if study is None:
        raise HTTPException(status_code=404, detail="study not found")
    if not any(item.is_selected for item in study.series):
        raise HTTPException(status_code=400, detail="no series selected")
    study.status = "queued"
    job = Job(study_id=study.id, type="pipeline", state="queued", stage="queued", message="Queued")
    db.add(job)
    audit.record(db, study_id=study.id, actor=settings.default_actor, action="pipeline_requested")
    db.commit()
    enqueue_pipeline(background_tasks, study_id, job.id)
    return {"job": job_out(job)}


@router.get("/jobs/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job_out(job)


@router.get("/studies/{study_id}/events")
async def study_events(study_id: str):
    async def stream():
        last = None
        deadline = asyncio.get_event_loop().time() + 15 * 60
        while asyncio.get_event_loop().time() < deadline:
            db = SessionLocal()
            try:
                job = db.scalars(
                    select(Job).where(Job.study_id == study_id).order_by(Job.created_at.desc()).limit(1)
                ).first()
                payload = job_out(job) if job else {"state": "waiting", "progress": 0, "stage": "waiting"}
                text = json.dumps(payload, ensure_ascii=False)
                if text != last:
                    yield f"event: progress\ndata: {text}\n\n"
                    last = text
                if job and job.state in {"succeeded", "failed", "canceled"}:
                    yield f"event: done\ndata: {text}\n\n"
                    return
            finally:
                db.close()
            await asyncio.sleep(0.7)
        yield "event: timeout\ndata: {}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.get("/studies/{study_id}/audit")
def get_audit(study_id: str, db: Session = Depends(get_db)):
    events = db.scalars(
        select(AuditEvent).where(AuditEvent.study_id == study_id).order_by(AuditEvent.seq)
    ).all()
    return {
        "verified": audit.verify_chain(db, study_id),
        "items": [
            {
                "id": event.id,
                "actor": event.actor,
                "action": event.action,
                "payloadHash": event.payload_hash,
                "prevHash": event.prev_hash,
                "hash": event.hash,
                "at": event.created_at.isoformat(),
            }
            for event in events
        ],
    }


@router.delete("/studies/{study_id}")
def delete_study(study_id: str, db: Session = Depends(get_db)):
    study = db.get(Study, study_id)
    if study is None:
        raise HTTPException(status_code=404, detail="study not found")
    db.query(AuditEvent).filter(AuditEvent.study_id == study_id).delete()
    db.delete(study)
    db.commit()
    storage.delete_study(study_id)
    return {"deleted": study_id}


@router.post("/studies/{study_id}/reports/{report_id}/approve")
def approve_report(
    study_id: str,
    report_id: str,
    body: ApproveRequest,
    db: Session = Depends(get_db),
):
    report = db.get(Report, report_id)
    if report is None or report.study_id != study_id:
        raise HTTPException(status_code=404, detail="report not found")
    if report.status == "approved":
        return report_out(report)
    report.status = "approved"
    report.approved_by = body.approvedBy
    report.approved_at = utcnow()
    audit.record(
        db,
        study_id=study_id,
        actor=body.approvedBy,
        action="report_approved",
        payload={"report_id": report.id},
    )
    db.commit()
    return report_out(report)


@router.get("/studies/{study_id}/files/{relative_path:path}")
def forbid_raw_files(study_id: str, relative_path: str):
    # Raw DICOM is deliberately not exposed. Only derived assets have routes.
    raise HTTPException(status_code=404, detail="not found")
