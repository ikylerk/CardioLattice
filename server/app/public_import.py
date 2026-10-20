from __future__ import annotations

import json
import traceback
from pathlib import Path

import numpy as np

from . import audit
from .config import settings
from .db import SessionLocal
from .imaging.coronary_analysis import analyze_coronary_mask
from .imaging.mesh import build_structure_glb
from .imaging.nifti import label_volumes_ml, load_nifti_case, native_points_to_preview_mm
from .models import (
    Job,
    Measurement,
    MeshRecord,
    Report,
    Segmentation,
    Study,
    VolumeRecord,
    utcnow,
)
from .registration import register_cardiac_atlas
from .reporting import template_report
from .storage import storage

PALETTE = [
    (196, 82, 88), (86, 132, 190), (214, 154, 82), (104, 178, 132),
    (150, 124, 190), (176, 96, 120), (232, 226, 206), (120, 170, 160),
]


def parse_label_spec(raw: str | None, labels: np.ndarray) -> dict[int, dict]:
    present = sorted(int(value) for value in np.unique(labels) if int(value) != 0)
    parsed = json.loads(raw) if raw else {}
    if not isinstance(parsed, dict):
        raise ValueError("label_map must be a JSON object")
    spec = {}
    used_codes = set()
    for key, value in parsed.items():
        try:
            value_int = int(key)
        except (TypeError, ValueError) as exc:
            raise ValueError("label_map keys must be integer label IDs") from exc
        if value_int not in present or value_int in spec:
            raise ValueError(f"label_map ID {key} is absent, zero, or duplicated")
        if isinstance(value, str):
            value = {"code": value, "name": value}
        if not isinstance(value, dict):
            raise ValueError("label_map values must be objects or strings")
        code = value.get("code") or f"LABEL_{value_int}"
        name = value.get("name") or code
        if not isinstance(code, str) or not code.strip() or not isinstance(name, str):
            raise ValueError("label_map code/name must be nonempty strings")
        code = code.strip().upper()
        if code in used_codes:
            raise ValueError(f"duplicate structure code: {code}")
        color = value.get("color", list(PALETTE[len(spec) % len(PALETTE)]))
        if (not isinstance(color, (list, tuple)) or len(color) != 3
                or any(type(c) is not int or not 0 <= c <= 255 for c in color)):
            raise ValueError("label_map color must contain three integers in [0, 255]")
        used_codes.add(code)
        spec[value_int] = {"code": code, "name": name, "color": color}
    # A binary mask can represent any organ. Never infer coronary semantics
    # from label number 1 or from a user-entered dataset title.
    for value in present:
        if value not in spec:
            code = f"LABEL_{value}"
            if code in used_codes:
                raise ValueError(f"duplicate structure code: {code}")
            used_codes.add(code)
            spec[value] = {
                "code": code, "name": f"标签 {value}",
                "color": list(PALETTE[len(spec) % len(PALETTE)]),
            }
    return spec


def _progress(db, job: Job, stage: str, progress: int, message: str) -> None:
    job.stage = stage
    job.progress = max(job.progress, min(progress, 100))
    job.message = message
    job.state = "running"
    job.updated_at = utcnow()
    db.commit()


def run_public_import(study_id: str, job_id: str) -> None:
    db = SessionLocal()
    try:
        study = db.get(Study, study_id)
        job = db.get(Job, job_id)
        if study is None or job is None:
            return
        study.status = "processing"
        db.commit()
        meta = study.fixture_meta or {}
        image_path = storage.path_for(meta["image_path"])
        labels_path = storage.path_for(meta["labels_path"])

        _progress(db, job, "validating", 8, "Loading public NIfTI image and labels")
        case = load_nifti_case(
            image_path,
            labels_path,
            resample_mm=settings.resample_mm,
            max_dim=settings.max_voxels,
        )
        preview, labels, volume_meta = case
        native_labels = case.native_labels
        native_spacing = case.native_geometry["spacing"]
        spec = parse_label_spec(meta.get("label_map"), native_labels)
        if not spec:
            raise ValueError("label map is empty")

        _progress(db, job, "building_volume", 30, "Building preview volume")
        volume_path = storage.study_dir(study.id) / "derived" / "volume.u8"
        volume_path.parent.mkdir(parents=True, exist_ok=True)
        preview.data.tofile(str(volume_path))
        volume = VolumeRecord(
            study_id=study.id,
            series_id=None,
            kind="preview_u8",
            dims=preview.dims,
            spacing=preview.spacing,
            origin=preview.origin,
            direction=preview.direction,
            affine=preview.affine,
            hu_range=preview.hu_range,
            data_path=storage.relative(volume_path),
            bytes=int(preview.data.nbytes),
            pipeline_version="public-nifti-v2",
            default_slices=preview.default_slices,
            markers=[],
            stats=preview.stats,
        )
        db.add(volume)
        db.commit()

        _progress(db, job, "segmenting", 50, "Aligning public dataset labels")
        labels_path_npy = storage.study_dir(study.id) / "derived" / "labels.npy"
        np.save(labels_path_npy, labels)
        native_path = labels_path_npy.with_name("native_labels.npy")
        np.save(native_path, native_labels)
        segmentation = Segmentation(
            study_id=study.id,
            volume_id=volume.id,
            task="public_dataset_labels",
            model_id=meta.get("dataset") or "public_dataset",
            model_version="label_map",
            status="completed",
            mask_path=storage.relative(labels_path_npy),
            label_map={item["code"]: value for value, item in spec.items()},
            quality={"label_values": sorted(spec), "warnings": volume_meta["warnings"]},
            provenance={
                "source": "public_dataset",
                "dataset": meta.get("dataset"),
                "label_spec": spec,
                "native_mask_path": storage.relative(native_path),
                "native_geometry": case.native_geometry,
                "measurement_grid": "native_label",
                "dataset_verification": "user_declared",
                "input_hashes": meta.get("input_hashes", {}),
                "validation_status": "public_dataset",
            },
        )
        db.add(segmentation)
        db.commit()

        _progress(db, job, "meshing", 70, "Extracting label surfaces")
        mesh_path = storage.study_dir(study.id) / "derived" / "public_structures.glb"
        infos, scene_transform = build_structure_glb(
            native_labels, preview, mesh_path, spec, source_geometry=case.native_geometry,
        )
        for info in infos:
            db.add(
                MeshRecord(
                    study_id=study.id,
                    segmentation_id=segmentation.id,
                    structure_code=info.structure_code,
                    path=storage.relative(mesh_path),
                    format="glb",
                    vertex_count=info.vertex_count,
                    triangle_count=info.triangle_count,
                    bbox=info.bbox,
                    scene_transform=scene_transform,
                    provenance={
                        "source": "public_dataset",
                        "dataset": meta.get("dataset"),
                        "validation_status": "public_dataset",
                    },
                )
            )
        db.commit()

        _progress(db, job, "computing_metrics", 85, "Computing reference label volumes")
        volumes = label_volumes_ml(native_labels, native_spacing)
        for value, item in spec.items():
            db.add(
                Measurement(
                    study_id=study.id,
                    code=f"{item['code']}_VOLUME",
                    label=f"{item['name']} 体积",
                    value=round(volumes.get(value, 0.0), 2),
                    unit="mL",
                    method="voxel_count",
                    source=meta.get("dataset") or "public_dataset",
                    validation_status="public_dataset",
                    status="computed",
                    provenance={
                        "segmentation_id": segmentation.id, "label_value": value,
                        "measurement_grid": "native_label", "native_geometry": case.native_geometry,
                        "input_hashes": meta.get("input_hashes", {}),
                    },
                )
            )
        coronary_labels = [
            (value, item) for value, item in spec.items()
            if "CORONARY" in item["code"].upper()
        ]
        coronary_values = [value for value, _ in coronary_labels]
        # Analyze one union of explicitly named coronary labels. Otherwise each
        # branch would emit duplicate global metric codes and the UI could pick
        # an arbitrary branch as the whole-tree result.
        coronary_inputs = [(1, {"code": "CORONARY_TREE", "name": "冠脉树"})] if coronary_values else []
        for value, item in coronary_inputs:
            try:
                coronary_mask = np.isin(native_labels, coronary_values).astype(np.uint8)
                analysis = analyze_coronary_mask(coronary_mask, native_spacing, label_value=1)
                analysis_path = storage.study_dir(study.id) / "derived" / f"coronary_analysis_{value}.json"
                analysis_path.write_text(
                    json.dumps(analysis.as_dict(), ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                analysis_relative = storage.relative(analysis_path)
                analysis_metrics = [
                    ("CORONARY_CENTERLINE_LENGTH", "冠脉主中心线路径长度（研究）", analysis.centerline_length_mm, "mm"),
                    ("CORONARY_TOTAL_LENGTH", "冠脉骨架总长度（研究）", analysis.skeleton_total_length_mm, "mm"),
                    ("CORONARY_MEAN_DIAMETER", "主中心线路径平均管径（研究）", analysis.mean_diameter_mm, "mm"),
                    ("CORONARY_MIN_DIAMETER", "主中心线路径最小管径（研究）", analysis.min_diameter_mm, "mm"),
                    ("CORONARY_REFERENCE_DIAMETER", "主中心线路径参考管径（研究）", analysis.reference_diameter_mm, "mm"),
                    ("CORONARY_STENOSIS_CANDIDATES", "冠脉狭窄候选（研究）", len(analysis.stenosis_candidates), "个"),
                ]
                for code, label, metric_value, unit in analysis_metrics:
                    provenance = {
                        "segmentation_id": segmentation.id,
                        "label_values": coronary_values,
                        "analysis_path": analysis_relative,
                        "measurement_grid": "native_label",
                        "native_geometry": case.native_geometry,
                        "input_hashes": meta.get("input_hashes", {}),
                        "centerline_frame": "patient_preview_centered_mm",
                        "branch_count": analysis.branch_count,
                        "component_count": analysis.component_count,
                        "diameter_scope": "longest_path_only",
                        "candidate_frame": "native_label_index_axis_mm",
                        "endpoints": analysis.endpoints,
                        "candidates": analysis.stenosis_candidates,
                        "note": analysis.as_dict()["note"],
                    }
                    if code == "CORONARY_CENTERLINE_LENGTH":
                        centerline = native_points_to_preview_mm(analysis.centerline, case.native_geometry, preview)
                        center = (np.asarray(preview.dims) - 1) * preview.spacing / 2
                        provenance["centerline"] = (np.asarray(centerline) - center).tolist()
                    db.add(
                        Measurement(
                            study_id=study.id,
                            code=code,
                            label=label,
                            value=round(float(metric_value), 2),
                            unit=unit,
                            method="skeleton_centerline_research_v1",
                            source=meta.get("dataset") or "public_dataset",
                            validation_status="research",
                            status="computed",
                            provenance=provenance,
                        )
                    )
            except Exception as exc:  # noqa: BLE001
                db.add(
                    Measurement(
                        study_id=study.id,
                        code=f"{item['code']}_CENTERLINE",
                        label=f"{item['name']} 中心线分析",
                        value=None,
                        unit=None,
                        method="skeleton_centerline_research_v1",
                        source="public_dataset",
                        validation_status="research",
                        status="not_computed",
                        reason=f"冠脉中心线分析失败：{exc}",
                    )
                )
        db.commit()

        register_cardiac_atlas(db, study, volume, segmentation, labels)

        for code, label, reason in (
            ("STENOSIS", "狭窄程度", "公开数据导入未运行经过验证的狭窄模型。"),
            ("FFR_CT", "FFR-CT", "未运行经过验证的血流动力学模型。"),
            ("LV_EF", "左心室射血分数", "公开数据标签不包含 ED/ES 或心室功能信息。"),
            ("CALCIUM_SCORE", "Agatston 钙化积分", "需要非增强钙化序列。"),
            ("AHA_SEGMENTS", "AHA 17 段灌注/存活心肌", "公开数据标签不包含灌注/存活信息。"),
            ("DATASET_NOTE", "数据来源", "公开数据集研究导入，非临床患者数据。"),
        ):
            db.add(
                Measurement(
                    study_id=study.id,
                    code=code,
                    label=label,
                    value=None,
                    unit=None,
                    method="not_available",
                    source="none",
                    validation_status="not_computed",
                    status="not_computed",
                    reason=reason,
                )
            )
        db.commit()
        measurements = list(db.query(Measurement).filter(Measurement.study_id == study.id).all())

        _progress(db, job, "drafting_report", 94, "Generating research report draft")
        report = Report(
            study_id=study.id,
            status="draft",
            content=template_report(study, measurements),
            generator="template",
        )
        db.add(report)
        study.status = "ready"
        job.state = "succeeded"
        job.stage = "succeeded"
        job.progress = 100
        job.message = "Public dataset import completed"
        job.updated_at = utcnow()
        audit.record(
            db,
            study_id=study.id,
            actor=settings.default_actor,
            action="public_import_completed",
            payload={"dataset": meta.get("dataset"), "labels": sorted(spec)},
        )
        db.commit()
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        db.rollback()
        study = db.get(Study, study_id)
        job = db.get(Job, job_id)
        if study:
            study.status = "failed"
            study.error = str(exc)
        if job:
            job.state = "failed"
            job.stage = "failed"
            job.error = str(exc)
            job.message = "Public import failed"
            job.updated_at = utcnow()
        if study:
            audit.record(
                db,
                study_id=study.id,
                actor=settings.default_actor,
                action="public_import_failed",
                payload={"error": str(exc)[:500]},
            )
        db.commit()
    finally:
        db.close()
