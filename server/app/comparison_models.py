from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, new_id, utcnow


class Comparison(Base):
    """Stored longitudinal comparison between a current and a prior study.

    Registration and deltas are research artifacts; they are persisted as JSON so
    the exact values returned by the API remain reproducible/inspectable.
    """

    __tablename__ = "comparisons"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("cmp"))
    current_study_id: Mapped[str] = mapped_column(ForeignKey("studies.id"), index=True)
    prior_study_id: Mapped[str] = mapped_column(ForeignKey("studies.id"), index=True)
    registration: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    deltas: Mapped[list | None] = mapped_column(JSON, nullable=True)
    warnings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
