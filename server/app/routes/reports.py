from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import audit
from ..config import settings
from ..db import get_db
from ..models import Report
from ..schemas import report_out

router = APIRouter(prefix="/api")


class ReportPatch(BaseModel):
    content: dict


@router.get("/reports/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db)):
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="report not found")
    return report_out(report)


@router.patch("/reports/{report_id}")
def patch_report(report_id: str, body: ReportPatch, db: Session = Depends(get_db)):
    """Clinician edit of the draft. M1 keeps a single current revision plus an
    audit event; immutable version history is a later milestone."""
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="report not found")
    if report.status == "approved":
        raise HTTPException(status_code=409, detail="approved reports must be amended, not overwritten")
    report.content = body.content
    report.generator = "human"
    report.status = "clinician_reviewed"
    audit.record(
        db,
        study_id=report.study_id,
        actor=settings.default_actor,
        action="report_edited",
        payload={"report_id": report.id},
    )
    db.commit()
    return report_out(report)
