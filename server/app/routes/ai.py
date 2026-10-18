from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..ai.report_generator import PROMPT_VERSION, generate_report_draft
from ..config import settings
from ..db import get_db
from ..models import Report, Study
from ..schemas import report_out

router = APIRouter(prefix="/api")


@router.post("/studies/{study_id}/ai/report-draft")
def generate_ai_report_draft(study_id: str, db: Session = Depends(get_db)):
    study = db.get(Study, study_id)
    if study is None:
        raise HTTPException(status_code=404, detail="study not found")
    content, generator, model = generate_report_draft(db, study)
    report = db.scalars(
        select(Report).where(Report.study_id == study_id).order_by(Report.created_at.desc()).limit(1)
    ).first()
    if report is None:
        report = Report(study_id=study_id, status="draft", content=content, generator=generator)
        db.add(report)
    else:
        report.content = content
        report.generator = generator
        report.model = model
        report.prompt_version = PROMPT_VERSION
        report.status = "draft"
    audit.record(
        db,
        study_id=study_id,
        actor=settings.default_actor,
        action="ai_report_draft",
        payload={"generator": generator, "model": model, "prompt_version": PROMPT_VERSION},
    )
    db.commit()
    return report_out(report)
