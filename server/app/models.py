from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:20]}"


class Base(DeclarativeBase):
    pass


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("sub"))
    pseudonym: Mapped[str] = mapped_column(String(64), unique=True)
    sex: Mapped[str | None] = mapped_column(String(8), nullable=True)
    age_years: Mapped[int | None] = mapped_column(Integer, nullable=True)
    patient_id_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    studies: Mapped[list["Study"]] = relationship(back_populates="subject")


class Study(Base):
    __tablename__ = "studies"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("stu"))
    subject_id: Mapped[str] = mapped_column(ForeignKey("subjects.id"))
    study_uid: Mapped[str] = mapped_column(String(128), unique=True)
    accession_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    study_date: Mapped[str | None] = mapped_column(String(16), nullable=True)
    description: Mapped[str | None] = mapped_column(String(256), nullable=True)
    modality: Mapped[str] = mapped_column(String(16), default="CT")
    source: Mapped[str] = mapped_column(String(24), default="upload")  # upload | demo | public_dataset
    status: Mapped[str] = mapped_column(String(32), default="uploaded")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    fixture_meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    subject: Mapped[Subject] = relationship(back_populates="studies")
    series: Mapped[list["Series"]] = relationship(back_populates="study", cascade="all, delete-orphan")
    volumes: Mapped[list["VolumeRecord"]] = relationship(back_populates="study", cascade="all, delete-orphan")
    segmentations: Mapped[list["Segmentation"]] = relationship(back_populates="study", cascade="all, delete-orphan")
    meshes: Mapped[list["MeshRecord"]] = relationship(back_populates="study", cascade="all, delete-orphan")
    measurements: Mapped[list["Measurement"]] = relationship(back_populates="study", cascade="all, delete-orphan")
    reports: Mapped[list["Report"]] = relationship(back_populates="study", cascade="all, delete-orphan")
    jobs: Mapped[list["Job"]] = relationship(back_populates="study", cascade="all, delete-orphan")


class Series(Base):
    __tablename__ = "series"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("ser"))
    study_id: Mapped[str] = mapped_column(ForeignKey("studies.id"), index=True)
    series_uid: Mapped[str] = mapped_column(String(128), index=True)
    series_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    modality: Mapped[str] = mapped_column(String(16), default="CT")
    description: Mapped[str | None] = mapped_column(String(256), nullable=True)
    slice_count: Mapped[int] = mapped_column(Integer, default=0)
    rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cols: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pixel_spacing: Mapped[list | None] = mapped_column(JSON, nullable=True)
    slice_thickness: Mapped[float | None] = mapped_column(Float, nullable=True)
    spacing_between_slices: Mapped[float | None] = mapped_column(Float, nullable=True)
    image_orientation: Mapped[list | None] = mapped_column(JSON, nullable=True)
    image_position_first: Mapped[list | None] = mapped_column(JSON, nullable=True)
    kvp: Mapped[float | None] = mapped_column(Float, nullable=True)
    kernel: Mapped[str | None] = mapped_column(String(64), nullable=True)
    contrast_agent: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_selected: Mapped[bool] = mapped_column(default=False)
    candidate_score: Mapped[float] = mapped_column(Float, default=0.0)
    reasons: Mapped[list | None] = mapped_column(JSON, nullable=True)
    storage_dir: Mapped[str | None] = mapped_column(String(512), nullable=True)

    study: Mapped[Study] = relationship(back_populates="series")


class VolumeRecord(Base):
    __tablename__ = "volumes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("vol"))
    study_id: Mapped[str] = mapped_column(ForeignKey("studies.id"), index=True)
    series_id: Mapped[str | None] = mapped_column(ForeignKey("series.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(32), default="preview_u8")
    dims: Mapped[list] = mapped_column(JSON)
    spacing: Mapped[list] = mapped_column(JSON)
    origin: Mapped[list | None] = mapped_column(JSON, nullable=True)
    direction: Mapped[list | None] = mapped_column(JSON, nullable=True)
    affine: Mapped[list | None] = mapped_column(JSON, nullable=True)
    hu_range: Mapped[list] = mapped_column(JSON)
    data_path: Mapped[str] = mapped_column(String(512))
    bytes: Mapped[int] = mapped_column(Integer)
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pipeline_version: Mapped[str] = mapped_column(String(64), default="m1")
    default_slices: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    markers: Mapped[list | None] = mapped_column(JSON, nullable=True)
    stats: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    study: Mapped[Study] = relationship(back_populates="volumes")


class Segmentation(Base):
    __tablename__ = "segmentations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("seg"))
    study_id: Mapped[str] = mapped_column(ForeignKey("studies.id"), index=True)
    volume_id: Mapped[str] = mapped_column(ForeignKey("volumes.id"))
    task: Mapped[str] = mapped_column(String(64))
    model_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="completed")
    mask_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    label_map: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    quality: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    provenance: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    study: Mapped[Study] = relationship(back_populates="segmentations")


class MeshRecord(Base):
    __tablename__ = "meshes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("msh"))
    study_id: Mapped[str] = mapped_column(ForeignKey("studies.id"), index=True)
    segmentation_id: Mapped[str | None] = mapped_column(ForeignKey("segmentations.id"), nullable=True)
    structure_code: Mapped[str] = mapped_column(String(32))
    path: Mapped[str] = mapped_column(String(512))
    format: Mapped[str] = mapped_column(String(16), default="glb")
    vertex_count: Mapped[int] = mapped_column(Integer, default=0)
    triangle_count: Mapped[int] = mapped_column(Integer, default=0)
    bbox: Mapped[list | None] = mapped_column(JSON, nullable=True)
    scene_transform: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    provenance: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    study: Mapped[Study] = relationship(back_populates="meshes")


class Measurement(Base):
    __tablename__ = "measurements"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("mea"))
    study_id: Mapped[str] = mapped_column(ForeignKey("studies.id"), index=True)
    code: Mapped[str] = mapped_column(String(64))
    label: Mapped[str] = mapped_column(String(128))
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(24), nullable=True)
    method: Mapped[str] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(64))
    validation_status: Mapped[str] = mapped_column(String(32), default="research")
    status: Mapped[str] = mapped_column(String(32), default="computed")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    segment_aha: Mapped[int | None] = mapped_column(Integer, nullable=True)
    provenance: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    study: Mapped[Study] = relationship(back_populates="measurements")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("rep"))
    study_id: Mapped[str] = mapped_column(ForeignKey("studies.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    content: Mapped[dict] = mapped_column(JSON)
    generator: Mapped[str] = mapped_column(String(32), default="template")
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    study: Mapped[Study] = relationship(back_populates="reports")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("job"))
    study_id: Mapped[str | None] = mapped_column(ForeignKey("studies.id"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(64), default="pipeline")
    state: Mapped[str] = mapped_column(String(24), default="queued")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    stage: Mapped[str] = mapped_column(String(48), default="queued")
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    study: Mapped[Study | None] = relationship(back_populates="jobs")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("aud"))
    study_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0, index=True)
    actor: Mapped[str] = mapped_column(String(128))
    action: Mapped[str] = mapped_column(String(64))
    payload_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prev_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
