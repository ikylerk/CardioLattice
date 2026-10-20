from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import settings

connect_args = {"check_same_thread": False} if settings.db_url.startswith("sqlite") else {}
engine = create_engine(settings.db_url, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from . import models  # noqa: F401  (register mappers)
    from .migrations import upgrade_legacy_schema

    with engine.begin() as connection:
        if connection.dialect.name == "sqlite":
            # Serialize inspection and DDL across concurrent application starts.
            # Explicit BEGIN also makes SQLite schema changes transactional.
            connection.exec_driver_sql("BEGIN IMMEDIATE")
        upgrade_legacy_schema(connection)
        models.Base.metadata.create_all(bind=connection)
