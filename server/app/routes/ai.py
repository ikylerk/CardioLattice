from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..ai.report_generator import PROMPT_VERSION, generate_report_draft
from ..codes import CodedError, coded, http_error, require_lang
from ..config import settings
from ..db import get_db
from ..models import Report, Study
from ..schemas import report_out
from ..report_versions import content_hash, current_version, preserve_baseline, report_write, snapshot

router = APIRouter(prefix="/api")


@router.post("/studies/{study_id}/ai/report-draft")
def generate_ai_report_draft(study_id: str, lang: str | None = Query(default=None), db: Session = Depends(get_db)):
    try:
        language = require_lang(lang)
    except CodedError as exc:
        raise http_error(exc) from exc
    study = db.get(Study, study_id)
    if study is None:
        raise HTTPException(status_code=404, detail=coded("STUDY_NOT_FOUND"))
    # Capture the state BEFORE the potentially slow external model call.
    report = db.scalars(
        select(Report).where(Report.study_id == study_id)
        .order_by(Report.created_at.desc(), Report.id.desc()).limit(1)
    ).first()
    if report is None:
        raise HTTPException(status_code=409, detail="generate a pipeline report before requesting an AI draft")
    report_id = report.id
    baseline_version = current_version(db, report_id)
    baseline_hash = content_hash(report.content)
    baseline_status = report.status
    content, generator, model = generate_report_draft(db, study, language)
    # End the read transaction before taking the write lock (also releases a
    # SQLite WAL read snapshot). Concurrency is checked again under that lock.
    db.rollback()
    with report_write(db, report_id, baseline_version, baseline_hash) as report:
        latest_id = db.scalar(
            select(Report.id).where(Report.study_id == study_id)
            .order_by(Report.created_at.desc(), Report.id.desc()).limit(1)
        )
        if latest_id != report_id or report.status != baseline_status:
            raise HTTPException(status_code=409, detail="report changed during generation; reload and retry")
        preserve_baseline(db, report)
        report.content = content
        report.generator = generator
        report.model = model
        report.prompt_version = content.get("provenance", {}).get("prompt_version", PROMPT_VERSION)
        report.status = "draft"
        report.approved_by = None
        report.approved_at = None
        version = snapshot(db, report, actor=settings.default_actor, reason="AI draft" if generator == "claude" else "template fallback")
        audit.record(
            db, study_id=study_id, actor=settings.default_actor, action="ai_report_draft",
            payload={"report_id": report.id, "version": version.version,
                     "content_hash": version.content_hash, "generator": generator,
                     "model": model, "prompt_version": report.prompt_version,
                     "fallback_code": content.get("provenance", {}).get("fallback_code")},
        )
        result = {**report_out(report), "version": version.version, "contentHash": version.content_hash}
        db.commit()
        return result
