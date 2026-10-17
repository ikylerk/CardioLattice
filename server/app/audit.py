from __future__ import annotations

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import AuditEvent, utcnow


def _payload_digest(payload: dict | None) -> str:
    return hashlib.sha256(
        json.dumps(payload or {}, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _stable_timestamp(value) -> str:
    # SQLite may return naive datetimes; normalise both sides of the chain.
    return value.replace(tzinfo=None).isoformat(timespec="microseconds")


def _chain_hash(prev_hash: str | None, actor: str, action: str, payload_hash: str, created_at) -> str:
    body = "|".join(
        [
            prev_hash or "",
            actor,
            action,
            payload_hash,
            _stable_timestamp(created_at),
        ]
    )
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def record(
    db: Session,
    *,
    study_id: str | None,
    actor: str | None,
    action: str,
    payload: dict | None = None,
) -> AuditEvent:
    actor = actor or settings.default_actor
    previous = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.study_id == study_id)
        .order_by(AuditEvent.seq.desc())
        .limit(1)
    ).first()
    prev_hash = previous.hash if previous else None
    seq = (previous.seq + 1) if previous else 1
    created_at = utcnow()
    payload_hash = _payload_digest(payload)
    event = AuditEvent(
        study_id=study_id,
        seq=seq,
        actor=actor,
        action=action,
        payload_hash=payload_hash,
        prev_hash=prev_hash,
        hash=_chain_hash(prev_hash, actor, action, payload_hash, created_at),
        created_at=created_at,
    )
    db.add(event)
    db.flush()
    return event


def verify_chain(db: Session, study_id: str) -> bool:
    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.study_id == study_id)
        .order_by(AuditEvent.seq)
    ).all()
    prev = None
    for event in events:
        if event.prev_hash != prev:
            return False
        expected = _chain_hash(prev, event.actor, event.action, event.payload_hash, event.created_at)
        if event.hash != expected:
            return False
        prev = event.hash
    return True
