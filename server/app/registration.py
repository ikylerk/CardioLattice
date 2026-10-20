from __future__ import annotations

import json
import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import audit
from .config import settings
from .models import Measurement, Segmentation, Study, VolumeRecord
from .organ_targets import ORGAN_TARGETS, TARGETS
from .storage import storage

REFERENCE_CHAMBER_IDS = {
    "LV": "CHAMBER_LV",
    "RV": "CHAMBER_RV",
    "LA": "CHAMBER_LA",
    "RA": "CHAMBER_RA",
}


def solve_similarity(source: np.ndarray, target: np.ndarray):
    """Fit a proper similarity; residuals describe the fitted landmarks only.

    Three non-collinear points suffice. Planar points are valid, but repeated,
    collinear or numerically near-collinear points cannot determine a stable fit.
    """
    try:
        source = np.asarray(source, dtype=float)
        target = np.asarray(target, dtype=float)
        if (
            source.ndim != 2 or source.shape[1:] != (3,)
            or target.shape != source.shape or len(source) < 3
        ):
            raise ValueError("landmarks must be matching (N, 3) arrays with N >= 3")
        if not np.all(np.isfinite(source)) or not np.all(np.isfinite(target)):
            raise ValueError("landmarks must be finite")
        with np.errstate(over="raise", invalid="raise", divide="raise"):
            for points in (source, target):
                distances = np.linalg.norm(points[:, None] - points[None, :], axis=2)
                if np.any(distances[np.triu_indices(len(points), 1)] <= 1e-8):
                    raise ValueError("duplicate or indistinguishable landmarks")
                spectrum = np.linalg.svd(points - points.mean(axis=0), compute_uv=False)
                if spectrum[0] <= 1e-8 or spectrum[1] <= spectrum[0] * 1e-6:
                    raise ValueError("degenerate or near-collinear landmark geometry")
            source_mean = source.mean(axis=0)
            target_mean = target.mean(axis=0)
            source_centered = source - source_mean
            target_centered = target - target_mean
            covariance = target_centered.T @ source_centered / len(source)
            u, singular, vt = np.linalg.svd(covariance)
            if singular[1] <= singular[0] * 1e-6:
                raise ValueError("degenerate landmark correspondence")
            correction = np.diag([1.0, 1.0, -1.0 if np.linalg.det(u @ vt) < 0 else 1.0])
            rotation = u @ correction @ vt
            variance = float((source_centered**2).sum() / len(source))
            scale = float((singular * np.diag(correction)).sum() / variance)
            translation = target_mean - scale * (rotation @ source_mean)
            mapped = (scale * (rotation @ source.T)).T + translation
            residual = np.linalg.norm(mapped - target, axis=1)
            rms = float(np.sqrt(np.mean(residual**2)))
        if (
            not np.isfinite(scale) or scale <= 0 or not np.isfinite(rms)
            or not np.all(np.isfinite(translation)) or not np.all(np.isfinite(rotation))
            or not np.allclose(rotation.T @ rotation, np.eye(3), atol=1e-8)
            or not np.isclose(np.linalg.det(rotation), 1.0, atol=1e-8)
        ):
            raise ValueError("invalid similarity transform")
        return scale, rotation, translation, rms, residual
    except (TypeError, OverflowError, FloatingPointError, np.linalg.LinAlgError) as exc:
        raise ValueError("invalid or unstable landmark geometry") from exc


def _chamber_code(code: str) -> str | None:
    """Recognize explicit semantic codes, never infer anatomy from label values."""
    normalized = code.strip().upper()
    for chamber in REFERENCE_CHAMBER_IDS:
        if normalized in (chamber, f"HEART_{chamber}", f"CHAMBER_{chamber}"):
            return chamber
    return None


def _label_value(value) -> int:
    if isinstance(value, (bool, np.bool_)) or not isinstance(value, (int, np.integer)) or value <= 0:
        raise ValueError("label values must be positive integers, excluding background 0")
    return int(value)


def _semantic_label_map(label_map: dict, standard_map: dict | None = None) -> dict[str, int]:
    if not isinstance(label_map, dict) or not isinstance(standard_map, (dict, type(None))):
        raise ValueError("label_map and standard_label_map must be objects")
    standard_map = standard_map or {}
    chambers: dict[str, int] = {}
    seen_codes: set[str] = set()
    seen_values: set[int] = set()
    for code, raw_value in label_map.items():
        if not isinstance(code, str) or not code.strip():
            raise ValueError("label codes must be non-empty strings")
        normalized = code.strip().upper()
        value = _label_value(raw_value)
        if normalized in seen_codes or value in seen_values:
            raise ValueError("duplicate label code or label value")
        seen_codes.add(normalized)
        seen_values.add(value)
        chamber = _chamber_code(code)
        if code in standard_map:
            standard_code = standard_map[code]
            if not isinstance(standard_code, str):
                raise ValueError("standard label codes must be strings")
            standard_chamber = _chamber_code(standard_code)
            if chamber is not None and standard_chamber != chamber:
                raise ValueError("conflicting chamber semantics in standard_label_map")
            chamber = chamber or standard_chamber
        if chamber is None:
            continue
        if chamber in chambers:
            raise ValueError(f"duplicate chamber semantics: {chamber}")
        chambers[chamber] = value
    return chambers


def _segmentation_chamber_map(segmentation: Segmentation) -> dict[str, int]:
    provenance = segmentation.provenance or {}
    if not isinstance(provenance, dict):
        raise ValueError("segmentation provenance must be an object")
    standard_map = provenance.get("standard_label_map")
    label_map = segmentation.label_map
    chambers = _semantic_label_map({} if label_map is None else label_map, standard_map)
    # Public imports retain the original value -> code specification. Inspect it
    # before using the code -> value map, whose construction can hide duplicates.
    if "label_spec" in provenance:
        spec = provenance["label_spec"]
        if not isinstance(spec, dict):
            raise ValueError("label_spec must be an object")
        original = {}
        for raw_value, item in spec.items():
            if isinstance(raw_value, str):
                if not raw_value.isascii() or not raw_value.isdecimal():
                    raise ValueError("label_spec keys must be positive integers")
                raw_value = int(raw_value)
            value = _label_value(raw_value)
            code = item if isinstance(item, str) else item.get("code") if isinstance(item, dict) else None
            if not isinstance(code, str) or not code.strip() or code in original:
                raise ValueError("missing or duplicate code in label_spec")
            original[code] = value
        if _semantic_label_map(original, standard_map) != chambers:
            raise ValueError("label_map conflicts with original label_spec")
    return chambers


def _chamber_centroids(
    labels: np.ndarray,
    label_map: dict,
    dims: list[int],
    spacing: list[float],
) -> dict[str, np.ndarray]:
    labels = np.asarray(labels)
    dims_array = np.asarray(dims)
    spacing_array = np.asarray(spacing, dtype=float)
    if (
        dims_array.shape != (3,) or dims_array.dtype.kind not in "iu"
        or np.any(dims_array <= 0)
        or labels.ndim != 3 or labels.shape != tuple(dims_array[::-1])
    ):
        raise ValueError("labels must match preview dims XYZ in array order ZYX")
    if (
        spacing_array.shape != (3,) or not np.all(np.isfinite(spacing_array))
        or np.any(spacing_array <= 0)
    ):
        raise ValueError("preview spacing XYZ must be finite and positive")
    if (
        labels.dtype.kind not in "iuf" or not np.all(np.isfinite(labels))
        or np.any(labels < 0) or np.any(labels != np.floor(labels))
    ):
        raise ValueError("label array must contain finite non-negative integers")
    chambers = _semantic_label_map(label_map)
    centroids: dict[str, np.ndarray] = {}
    with np.errstate(over="raise", invalid="raise"):
        for code, value in chambers.items():
            mask = labels == value
            if not np.any(mask):
                raise ValueError(f"declared chamber label has no voxels: {code}={value}")
            index_xyz = np.argwhere(mask).mean(axis=0)[::-1]
            # Keep the existing voxel-centre convention for renderer compatibility.
            centroids[code] = (index_xyz + 0.5 - dims_array / 2) * spacing_array
            if not np.all(np.isfinite(centroids[code])):
                raise ValueError("non-finite chamber centroid")
    return centroids


def _build_registration_result(
    study: Study, volume: VolumeRecord, segmentation: Segmentation, labels: np.ndarray,
) -> dict:
    if (
        volume.study_id != study.id or segmentation.study_id != study.id
        or segmentation.volume_id != volume.id
    ):
        raise ValueError("study, preview volume and segmentation must refer to the same input")
    if segmentation.status != "completed":
        raise ValueError("segmentation must be completed")
    chamber_map = _segmentation_chamber_map(segmentation)
    centroids = _chamber_centroids(labels, chamber_map, volume.dims, volume.spacing)
    if len(centroids) < 3:
        raise ValueError(f"需要至少 3 个明确标注且非共线的心腔；当前可用 {len(centroids)} 个")

    source_frame = ORGAN_TARGETS.get("frame", {})
    if not source_frame.get("name") or source_frame.get("units") != "mm":
        raise ValueError("reference atlas must declare its coordinate frame in mm")
    heart_targets = [target for target in TARGETS if target.get("organ") == "HEART"]
    by_id = {}
    for target in heart_targets:
        target_id = target.get("id")
        point = np.asarray(target.get("coordinateMm"), dtype=float)
        if (
            not isinstance(target_id, str) or not target_id or target_id in by_id
            or point.shape != (3,) or not np.all(np.isfinite(point))
        ):
            raise ValueError("invalid or duplicate reference heart target")
        by_id[target_id] = target
    codes = [code for code in REFERENCE_CHAMBER_IDS if code in centroids]
    if any(REFERENCE_CHAMBER_IDS[code] not in by_id for code in codes):
        raise ValueError("reference atlas is missing a declared chamber target")
    reference = np.array([by_id[REFERENCE_CHAMBER_IDS[code]]["coordinateMm"] for code in codes])
    observed = np.array([centroids[code] for code in codes])
    scale, rotation, translation, rms, residuals = solve_similarity(reference, observed)
    mapped_landmarks = (scale * (rotation @ reference.T)).T + translation

    mapped_targets = []
    with np.errstate(over="raise", invalid="raise"):
        for target in heart_targets:
            reference_point = np.asarray(target["coordinateMm"], dtype=float)
            mapped_point = scale * (rotation @ reference_point) + translation
            if not np.all(np.isfinite(mapped_point)):
                raise ValueError("non-finite mapped reference target")
            mapped_targets.append({
                "id": target["id"],
                "name": target.get("name", target["id"]),
                "category": target.get("category"),
                "referenceMm": reference_point.tolist(),
                "patientMm": mapped_point.round(2).tolist(),
                "mappedPatientMm": mapped_point.tolist(),
                "coordinateRole": "mapped_reference_target",
            })
    landmarks = []
    for index, code in enumerate(codes):
        patient_index = observed[index] / np.asarray(volume.spacing) + (np.asarray(volume.dims) - 1) / 2
        landmarks.append({
            "referenceTargetId": REFERENCE_CHAMBER_IDS[code],
            "chamberCode": code,
            "labelValue": chamber_map[code],
            "voxelCount": int(np.count_nonzero(labels == chamber_map[code])),
            "centroidIndexXyz": patient_index.tolist(),
            "referenceMm": reference[index].tolist(),
            # Legacy patientMm is the mapped point, not an observation.
            "patientMm": mapped_landmarks[index].round(2).tolist(),
            "observedPatientMm": observed[index].tolist(),
            "mappedPatientMm": mapped_landmarks[index].tolist(),
            "residualMm": round(float(residuals[index]), 2),
            "fitResidualMm": float(residuals[index]),
        })
    frame = "patient_preview_centered_mm"
    matrix = np.eye(4)
    matrix[:3, :3] = scale * rotation
    matrix[:3, 3] = translation
    return {
        "version": "atlas-registration/v1",
        "schemaRevision": 2,
        "status": "computed",
        "method": "chamber_centroid_umeyama_similarity",
        "validationStatus": "research",
        "frame": frame,
        "sourceFrame": dict(source_frame),
        "targetFrame": {
            "name": frame,
            "units": "mm",
            "arrayOrder": "ZYX",
            "coordinateOrder": "XYZ",
            "dimsXyz": [int(value) for value in volume.dims],
            "spacingXyzMm": [float(value) for value in volume.spacing],
            "indexToMmFormula": "(index_xyz + 0.5 - dims_xyz / 2) * spacing_xyz",
            "axisDirections": ["increasing preview x index", "increasing preview y index", "increasing preview z index"],
            "origin": "centre of preview voxel extent",
            "patientPhysicalTransformApplied": False,
            "note": "Index-axis preview frame; neither native patient LPS nor native patient RAS. Origin/direction/affine are not applied.",
        },
        "scale": round(scale, 5),
        "rotation": rotation.round(6).tolist(),
        "translationMm": translation.round(2).tolist(),
        "transform": {
            "sourceFrame": source_frame["name"],
            "targetFrame": frame,
            "convention": "column vectors; mapped_mm = scale * rotation @ reference_mm + translation_mm",
            "matrix4x4": matrix.tolist(),
        },
        "rmsMm": round(rms, 2),
        "fitRmsMm": rms,
        "fitMetric": "in_sample_landmark_rms",
        "targetAccuracyMm": None,
        "targetAccuracyStatus": "not_evaluated",
        "landmarkCount": len(landmarks),
        "labelMapping": [
            {"chamberCode": code, "labelValue": chamber_map[code], "referenceTargetId": REFERENCE_CHAMBER_IDS[code]}
            for code in codes
        ],
        "input": {
            "studyId": study.id,
            "volumeId": volume.id,
            "segmentationId": segmentation.id,
            "semanticsSource": "explicit label_map codes and standard_label_map when provided; checked against label_spec when present",
            "sampling": "preview segmentation grid",
        },
        "landmarks": landmarks,
        "targets": mapped_targets,
        "note": (
            "Research registration using preview chamber centroids. RMS is an in-sample fit residual, "
            "not target registration accuracy. No independent target accuracy has been evaluated. "
            "Not externally validated. Mapped targets are reference anatomy, not patient lesions."
        ),
    }


def _persist_registration(db: Session, study: Study, result: dict) -> None:
    """Replace current derived outputs, including when a retry becomes invalid."""
    path = storage.study_dir(study.id) / "derived" / "atlas_registration.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(serialized, encoding="utf-8")
    temporary.replace(path)
    computed = result["status"] == "computed"
    provenance = {
        "registration_path": storage.relative(path),
        "segmentation_id": result["input"]["segmentationId"],
        "volume_id": result["input"]["volumeId"],
        "frame": result["frame"],
        "scale": result.get("scale"),
        "target_count": len(result["targets"]),
        "landmarks": result["landmarks"],
        "targets": result["targets"],
        "fitMetric": "in_sample_landmark_rms",
        "targetAccuracyStatus": "not_evaluated",
        "targetAccuracyMm": None,
        "note": result["note"],
    }
    metrics = {
        "ATLAS_REGISTRATION": ("参考图谱—患者配准", None, None),
        "ATLAS_REGISTRATION_RMS": ("图谱配准拟合残差（研究）", result.get("rmsMm"), "mm"),
        "ATLAS_REGISTERED_TARGETS": ("已映射参考靶点（研究）", len(result["targets"]) if computed else None, "个"),
    }
    existing = list(db.scalars(
        select(Measurement).where(Measurement.study_id == study.id, Measurement.code.in_(metrics))
    ))
    for code, (label, value, unit) in metrics.items():
        rows = [row for row in existing if row.code == code]
        if not rows:
            rows = [Measurement(study_id=study.id, code=code)]
            db.add(rows[0])
        # Also invalidate any historical duplicate row that the legacy API's
        # unordered first() could select.
        for row in rows:
            row.label, row.value, row.unit = label, value, unit
            row.method = result["method"]
            row.source = "reference_atlas"
            row.validation_status = result["validationStatus"]
            row.status = result["status"]
            row.reason = result.get("reason")
            row.provenance = dict(provenance)
    audit.record(
        db, study_id=study.id, actor=settings.default_actor, action="atlas_registration",
        payload={
            "status": result["status"],
            "fit_rms_mm": result.get("fitRmsMm"),
            "targets": len(result["targets"]),
            "segmentation_id": result["input"]["segmentationId"],
            "reason": result.get("reason"),
        },
    )
    db.commit()


def register_cardiac_atlas(
    db: Session,
    study: Study,
    volume: VolumeRecord,
    segmentation: Segmentation,
    labels: np.ndarray,
) -> dict | None:
    """Map explicit chamber semantics into the legacy centered preview frame.

    Invalid inputs produce a traceable not_computed result with no transform or
    targets. A computed fit is research output, never a target accuracy claim.
    """
    try:
        result = _build_registration_result(study, volume, segmentation, labels)
    except (ValueError, TypeError, OverflowError, FloatingPointError, np.linalg.LinAlgError) as exc:
        result = {
            "version": "atlas-registration/v1",
            "schemaRevision": 2,
            "status": "not_computed",
            "method": "chamber_centroid_umeyama_similarity",
            "validationStatus": "not_computed",
            "frame": "patient_preview_centered_mm",
            "reason": f"未进行图谱配准：{exc}",
            "input": {"studyId": study.id, "volumeId": volume.id, "segmentationId": segmentation.id},
            "rmsMm": None,
            "fitRmsMm": None,
            "fitMetric": "in_sample_landmark_rms",
            "targetAccuracyMm": None,
            "targetAccuracyStatus": "not_evaluated",
            "landmarks": [],
            "targets": [],
            "note": "Registration was not computed. No mapped targets or target accuracy are available.",
        }
    _persist_registration(db, study, result)
    return result if result["status"] == "computed" else None
