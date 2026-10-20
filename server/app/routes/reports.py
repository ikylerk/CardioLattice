from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from .. import audit
from ..codes import coded
from .. import report_models  # noqa: F401  (register ReportVersion with Base.metadata)
from ..config import settings
from ..db import get_db
from ..models import Report, utcnow
from ..report_models import ReportVersion
from ..report_versions import (
    amend as amend_version,
    current_version,
    content_hash,
    preserve_baseline,
    report_write,
    list_versions,
    snapshot,
)
from ..schemas import report_out

router = APIRouter(prefix="/api")


class ReportPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: dict
    baseVersion: int = Field(ge=0, strict=True)
    baseContentHash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    actor: str | None = None
    reason: str | None = None


class AmendRequest(ReportPatch):
    reason: str = Field(min_length=1, max_length=1000)


def version_out(version: ReportVersion) -> dict:
    return {
        "id": version.id,
        "reportId": version.report_id,
        "version": version.version,
        "status": version.status,
        "content": version.content,
        "generator": version.generator,
        "model": version.model,
        "promptVersion": version.prompt_version,
        "editedBy": version.edited_by,
        "reason": version.reason,
        "contentHash": version.content_hash,
        "createdAt": version.created_at.isoformat() if version.created_at else None,
    }


@router.get("/reports/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db)):
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail=coded("REPORT_NOT_FOUND"))
    return {**report_out(report), "version": current_version(db, report_id),
            "contentHash": content_hash(report.content)}


@router.get("/reports/{report_id}/versions")
def get_report_versions(report_id: str, db: Session = Depends(get_db)):
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail=coded("REPORT_NOT_FOUND"))
    versions = list_versions(db, report_id)
    return {
        "reportId": report_id,
        "currentVersion": versions[-1].version if versions else 0,
        "contentHash": content_hash(report.content),
        "status": report.status,
        "items": [version_out(item) for item in versions],
    }


@router.patch("/reports/{report_id}")
def patch_report(report_id: str, body: ReportPatch, db: Session = Depends(get_db)):
    """Edit a draft only when the editor's version is still current."""
    with report_write(db, report_id, body.baseVersion, body.baseContentHash) as report:
        if report.status == "approved":
            raise HTTPException(status_code=409, detail=coded("APPROVED_IMMUTABLE"))
        version = amend_version(
            db, report, body.content, actor=body.actor, reason=body.reason or "edited",
        )
        audit.record(
            db, study_id=report.study_id, actor=body.actor or settings.default_actor,
            action="report_edited",
            payload={"report_id": report.id, "version": version.version,
                     "content_hash": version.content_hash},
        )
        result = {**report_out(report), "version": version.version, "contentHash": version.content_hash}
        db.commit()
        return result


@router.post("/reports/{report_id}/amend")
def amend_report(report_id: str, body: AmendRequest, db: Session = Depends(get_db)):
    """Append a revision, preserving approval history and requiring new review."""
    if not body.reason.strip():
        raise HTTPException(status_code=422, detail="revision reason must not be blank")
    with report_write(db, report_id, body.baseVersion, body.baseContentHash) as report:
        version = amend_version(
            db, report, body.content, actor=body.actor, reason=body.reason.strip(),
        )
        audit.record(
            db, study_id=report.study_id, actor=body.actor or settings.default_actor,
            action="report_amended",
            payload={"report_id": report.id, "version": version.version,
                     "content_hash": version.content_hash, "reason": body.reason.strip()},
        )
        result = {**report_out(report), "version": version.version, "contentHash": version.content_hash}
        db.commit()
        return result


class VersionApproval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    baseVersion: int = Field(ge=0, strict=True)
    baseContentHash: str = Field(pattern=r"^[0-9a-f]{64}$")
    approvedBy: str = Field(default=settings.default_actor, min_length=1, max_length=128)


@router.post("/reports/{report_id}/approve")
def approve_report_version(report_id: str, body: VersionApproval, db: Session = Depends(get_db)):
    """Bind approval to the exact version and content shown to the reviewer."""
    with report_write(db, report_id, body.baseVersion, body.baseContentHash) as report:
        claims = [
            claim for section in report.content.get("sections", [])
            for claim in section.get("claims", [])
        ] + report.content.get("impression", []) + report.content.get("recommendations", [])
        if any(claim.get("status") == "needs_review" for claim in claims):
            raise HTTPException(status_code=409, detail="resolve flagged evidence before approval")
        if not body.approvedBy.strip():
            raise HTTPException(status_code=422, detail="reviewer must not be blank")
        if report.status != "approved":
            preserve_baseline(db, report)
            report.status = "approved"
            report.approved_by = body.approvedBy.strip()
            report.approved_at = utcnow()
            version = snapshot(db, report, actor=report.approved_by, reason="approved")
            audit.record(
                db, study_id=report.study_id, actor=report.approved_by,
                action="report_approved",
                payload={"report_id": report.id, "version": version.version,
                         "content_hash": version.content_hash},
            )
        result = {**report_out(report), "version": current_version(db, report.id),
                  "contentHash": content_hash(report.content)}
        db.commit()
        return result
