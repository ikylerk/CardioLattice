from __future__ import annotations

import copy
import hashlib
import json
from contextlib import contextmanager

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from .config import settings
from .models import Report
from .report_models import ReportVersion


def content_hash(content: dict | None) -> str:
    """Stable SHA-256 digest of report content.

    Keys are sorted and separators are compact so that semantically identical
    JSON always hashes to the same value regardless of insertion order.
    """
    canonical = json.dumps(
        content or {},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def latest_version(db: Session, report_id: str) -> ReportVersion | None:
    return db.scalars(
        select(ReportVersion)
        .where(ReportVersion.report_id == report_id)
        .order_by(ReportVersion.version.desc())
        .limit(1)
    ).first()


def current_version(db: Session, report_id: str) -> int:
    """Latest persisted version number, or 0 when no snapshot exists yet."""
    latest = latest_version(db, report_id)
    return latest.version if latest else 0


def next_version(db: Session, report_id: str) -> int:
    return current_version(db, report_id) + 1


def list_versions(db: Session, report_id: str) -> list[ReportVersion]:
    return list(
        db.scalars(
            select(ReportVersion)
            .where(ReportVersion.report_id == report_id)
            .order_by(ReportVersion.version.asc())
        ).all()
    )


@contextmanager
def report_write(db: Session, report_id: str, base_version: int | None = None,
                 base_content_hash: str | None = None):
    """Serialize writers at the database row, then check the editor's snapshot.

    A no-op UPDATE acquires a write lock on SQLite as well as a row lock on
    databases supporting concurrent writers. Never flush stale ORM state first.
    The caller commits content, snapshot and audit together inside this context.
    """
    try:
        with db.no_autoflush:
            result = db.execute(
                update(Report).where(Report.id == report_id)
                .values(status=Report.status, updated_at=Report.updated_at)
                .execution_options(synchronize_session=False)
            )
        if result.rowcount != 1:
            raise HTTPException(status_code=404, detail="report not found")
        report = db.get(Report, report_id)
        db.refresh(report)
        actual = current_version(db, report_id)
        if base_version is not None and base_version != actual:
            raise HTTPException(status_code=409, detail=f"version conflict: current version is {actual}")
        if base_content_hash is not None and base_content_hash != content_hash(report.content):
            raise HTTPException(status_code=409, detail="report content changed; reload before saving")
        yield report
    except (IntegrityError, OperationalError) as exc:
        db.rollback()
        if isinstance(exc, OperationalError) and not any(
            word in str(exc).lower() for word in ("locked", "busy", "deadlock", "serialize")
        ):
            raise
        raise HTTPException(status_code=409, detail="concurrent report update; reload and retry") from exc
    except Exception:
        db.rollback()
        raise


def preserve_baseline(db: Session, report: Report) -> None:
    """Keep the original payload before the first edit or regeneration."""
    if latest_version(db, report.id) is None:
        snapshot(db, report, actor=report.approved_by, reason="baseline before revision")


def snapshot(
    db: Session,
    report: Report,
    actor: str | None = None,
    reason: str | None = None,
    *,
    status: str | None = None,
    content: dict | None = None,
) -> ReportVersion:
    """Append an immutable version of the report's current state.

    The caller is responsible for committing (or rolling back) the session.
    """
    body = copy.deepcopy(report.content if content is None else content)
    version = ReportVersion(
        report_id=report.id,
        version=next_version(db, report.id),
        status=status or report.status,
        content=body,
        generator=report.generator,
        model=report.model,
        prompt_version=report.prompt_version,
        edited_by=actor or settings.default_actor,
        reason=reason,
        content_hash=content_hash(body),
    )
    db.add(version)
    db.flush()
    return version


def restore(
    db: Session,
    report: Report,
    version: int,
    actor: str | None = None,
    reason: str | None = None,
    *,
    status: str = "clinician_reviewed",
) -> ReportVersion:
    """Make a prior version current again by appending a *new* version.

    Prior ``ReportVersion`` rows are never mutated.
    """
    target = db.scalars(
        select(ReportVersion)
        .where(ReportVersion.report_id == report.id)
        .where(ReportVersion.version == version)
    ).first()
    if target is None:
        raise ValueError(f"report version {version} not found")
    if status == "approved":
        raise ValueError("restored reports require a new approval")
    if content_hash(target.content) != target.content_hash:
        raise ValueError("report version integrity check failed")
    preserve_baseline(db, report)
    report.content = copy.deepcopy(target.content)
    report.status = status
    report.generator = target.generator
    report.model = target.model
    report.prompt_version = target.prompt_version
    report.approved_by = None
    report.approved_at = None
    return snapshot(
        db,
        report,
        actor=actor,
        reason=reason or f"restored from version {version}",
        status=status,
    )


def amend(
    db: Session,
    report: Report,
    content: dict,
    actor: str | None = None,
    reason: str | None = None,
    *,
    status: str = "clinician_reviewed",
) -> ReportVersion:
    """Apply clinician-edited content and append a new immutable version."""
    if status == "approved":
        raise ValueError("amended reports require a new approval")
    preserve_baseline(db, report)
    report.content = copy.deepcopy(content)
    report.status = status
    report.generator = "human"
    report.model = None
    report.prompt_version = None
    # A revision invalidates any prior approval.
    report.approved_by = None
    report.approved_at = None
    return snapshot(db, report, actor=actor, reason=reason, status=status)
