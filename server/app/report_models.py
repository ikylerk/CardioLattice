from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, new_id, utcnow


class ReportVersion(Base):
    """Immutable snapshot of a report at a point in time.

    Rows in this table are append-only: edits, amendments, restores and
    approvals each create a new row rather than mutating an existing one.
    The current report content lives on ``Report``; this table is the audit
    trail of how that content evolved.
    """

    __tablename__ = "report_versions"
    __table_args__ = (
        # SQLite does not need this constraint for correctness, but it keeps
        # the ``(report_id, version)`` convention honest.
        UniqueConstraint("report_id", "version", name="uq_report_versions_report_version"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("rpv"))
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    content: Mapped[dict] = mapped_column(JSON, nullable=False)
    generator: Mapped[str] = mapped_column(String(32), default="template")
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    edited_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
