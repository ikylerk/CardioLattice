from __future__ import annotations

import sqlite3
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app import db
from app.models import Base, Job, Report, Study, Subject


# A file-backed legacy jobs table, independent of the current ORM definition.
LEGACY_JOBS_SQL = """
CREATE TABLE jobs (
    id VARCHAR(32) PRIMARY KEY,
    study_id VARCHAR(32) REFERENCES studies(id),
    type VARCHAR(64) NOT NULL,
    state VARCHAR(24) NOT NULL,
    progress INTEGER NOT NULL,
    stage VARCHAR(48) NOT NULL,
    message TEXT,
    error TEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    legacy_note TEXT
);
CREATE INDEX ix_jobs_study_id ON jobs(study_id);
INSERT INTO jobs VALUES (
    'job_legacy', 'stu_legacy', 'public_import', 'failed', 50, 'failed',
    'original message', '{"code":"OLD_FAILURE","params":{"detail":"preserve me"}}',
    '2026-10-01 01:02:03', '2026-10-01 02:03:04', 'keep this extra column'
);
"""


@pytest.fixture
def legacy_engine(tmp_path):
    path = tmp_path / "legacy.db"
    with sqlite3.connect(path) as connection:
        connection.executescript(LEGACY_JOBS_SQL)
    engine = create_engine(f"sqlite:///{path}", connect_args={"timeout": 10})
    # Existing tables other than jobs are unchanged by this upgrade.
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        subject = Subject(id="sub_legacy", pseudonym="LEGACY")
        study = Study(id="stu_legacy", subject=subject, study_uid="legacy.uid", status="ready")
        session.add_all([
            study,
            Report(
                id="rep_legacy", study=study, status="approved",
                content={"lang": "zh", "sections": [], "original": "原始报告"},
                approved_by="original.reviewer",
            ),
        ])
        session.commit()
    yield engine
    engine.dispose()


def test_existing_database_upgrade_preserves_jobs_reports_and_custom_schema(legacy_engine, monkeypatch):
    monkeypatch.setattr(db, "engine", legacy_engine)
    with legacy_engine.connect() as connection:
        before_job = dict(connection.execute(text("SELECT * FROM jobs")).mappings().one())
        before_report = dict(connection.execute(text("SELECT * FROM reports")).mappings().one())
        before_indexes = inspect(connection).get_indexes("jobs")
    with Session(legacy_engine) as session, pytest.raises(OperationalError, match="jobs.payload"):
        session.scalars(select(Job)).all()

    db.init_db()
    db.init_db()

    with legacy_engine.connect() as connection:
        migrated_job = dict(connection.execute(text("SELECT * FROM jobs")).mappings().one())
        assert migrated_job.pop("payload") is None
        assert migrated_job == before_job
        assert dict(connection.execute(text("SELECT * FROM reports")).mappings().one()) == before_report
        assert inspect(connection).get_indexes("jobs") == before_indexes
        columns = inspect(connection).get_columns("jobs")
        assert sum(column["name"] == "payload" for column in columns) == 1
        assert next(column for column in columns if column["name"] == "payload")["nullable"]
    with Session(legacy_engine) as session:
        assert session.get(Job, "job_legacy").payload is None
        assert session.get(Study, "stu_legacy").jobs[0].id == "job_legacy"
        session.add(Job(id="job_new", study_id="stu_legacy", payload={"lang": "zh"}))
        session.commit()
    db.init_db()
    with Session(legacy_engine) as session:
        assert session.get(Job, "job_new").payload == {"lang": "zh"}
        assert session.get(Report, "rep_legacy").approved_by == "original.reviewer"


def test_concurrent_startups_upgrade_existing_database_once(legacy_engine, monkeypatch):
    monkeypatch.setattr(db, "engine", legacy_engine)
    barrier = Barrier(2)

    def start():
        barrier.wait(timeout=10)
        db.init_db()

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(start) for _ in range(2)]
        for future in futures:
            future.result(timeout=20)
    with Session(legacy_engine) as session:
        assert session.get(Job, "job_legacy").payload is None


def test_failed_startup_rolls_back_column_addition(legacy_engine, monkeypatch):
    monkeypatch.setattr(db, "engine", legacy_engine)

    def fail_create_all(**kwargs):
        raise RuntimeError("simulated later schema failure")

    with monkeypatch.context() as patch:
        patch.setattr(Base.metadata, "create_all", fail_create_all)
        with pytest.raises(RuntimeError, match="later schema failure"):
            db.init_db()
    assert "payload" not in {column["name"] for column in inspect(legacy_engine).get_columns("jobs")}
    db.init_db()
    with Session(legacy_engine) as session:
        assert session.get(Job, "job_legacy").error == '{"code":"OLD_FAILURE","params":{"detail":"preserve me"}}'


def test_application_startup_serves_legacy_database_after_upgrade(legacy_engine, monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app

    monkeypatch.setattr(db, "engine", legacy_engine)

    def get_legacy_session():
        with Session(legacy_engine) as session:
            yield session

    old_override = app.dependency_overrides.get(db.get_db)
    app.dependency_overrides[db.get_db] = get_legacy_session
    try:
        with TestClient(app) as client:
            job = client.get("/api/jobs/job_legacy")
            assert job.status_code == 200, job.text
            assert job.json()["error"] == {"code": "OLD_FAILURE", "params": {"detail": "preserve me"}}
            response = client.get("/api/studies/stu_legacy")
            assert response.status_code == 200, response.text
            report = response.json()["reports"][0]
            assert report["content"]["original"] == "原始报告"
            assert report["approvedBy"] == "original.reviewer"
            assert report["status"] == "approved"
            assert report["version"] == 0
            assert len(report["contentHash"]) == 64
    finally:
        if old_override is None:
            app.dependency_overrides.pop(db.get_db, None)
        else:
            app.dependency_overrides[db.get_db] = old_override


def test_fresh_database_initialization_and_existing_payload_are_idempotent(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'fresh.db'}")
    monkeypatch.setattr(db, "engine", engine)
    try:
        db.init_db()
        with Session(engine) as session:
            session.add(Job(id="job_current", payload={"lang": "en", "custom": [1, 2]}))
            session.commit()
        db.init_db()
        with Session(engine) as session:
            assert session.get(Job, "job_current").payload == {"lang": "en", "custom": [1, 2]}
        assert set(Base.metadata.tables) <= set(inspect(engine).get_table_names())
    finally:
        engine.dispose()
