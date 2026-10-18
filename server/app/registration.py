from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from sqlalchemy.orm import Session

from . import audit
from .config import settings
from .models import Measurement, Segmentation, Study, VolumeRecord
from .organ_targets import TARGETS
from .storage import storage

REFERENCE_CHAMBER_IDS = {
    "LV": "CHAMBER_LV",
    "RV": "CHAMBER_RV",
    "LA": "CHAMBER_LA",
    "RA": "CHAMBER_RA",
}


def solve_similarity(source: np.ndarray, target: np.ndarray):
    """Umeyama similarity (scale + rotation + translation): target ≈ s R source + t."""
    source_mean = source.mean(axis=0)
    target_mean = target.mean(axis=0)
    source_centered = source - source_mean
    target_centered = target - target_mean
    covariance = target_centered.T @ source_centered / len(source)
    u, singular, vt = np.linalg.svd(covariance)
    sign = np.sign(np.linalg.det(u @ vt))
    correction = np.diag([1.0, 1.0, sign if sign != 0 else 1.0])
    rotation = u @ correction @ vt
    variance = float((source_centered**2).sum() / len(source))
    scale = float((singular * np.diag(correction)).sum() / variance) if variance > 0 else 1.0
    translation = target_mean - scale * (rotation @ source_mean)
    mapped = (scale * (rotation @ source.T)).T + translation
    residual = np.linalg.norm(mapped - target, axis=1)
    return scale, rotation, translation, float(np.sqrt(np.mean(residual**2))), residual


def _chamber_centroids(
    labels: np.ndarray,
    label_map: dict,
    dims: list[int],
    spacing: list[float],
) -> dict[str, np.ndarray]:
    centroids: dict[str, np.ndarray] = {}
    for code, value in label_map.items():
        if code not in REFERENCE_CHAMBER_IDS:
            continue
        mask = labels == int(value)
        if not np.any(mask):
            continue
        index = np.argwhere(mask).mean(axis=0)
        centroids[code] = np.array(
            [
                (index[2] + 0.5 - dims[0] / 2) * spacing[0],
                (index[1] + 0.5 - dims[1] / 2) * spacing[1],
                (index[0] + 0.5 - dims[2] / 2) * spacing[2],
            ],
            dtype=float,
        )
    return centroids


def register_cardiac_atlas(
    db: Session,
    study: Study,
    volume: VolumeRecord,
    segmentation: Segmentation,
    labels: np.ndarray,
) -> dict | None:
    """Research similarity registration from reference heart chambers to patient labels.

    This is not a validated patient registration. It provides a transparent,
    inspectable mapping of reference targets into the patient preview frame.
    """
    chamber_targets = {
        target["id"]: target for target in TARGETS if target["id"] in REFERENCE_CHAMBER_IDS.values()
    }
    centroids = _chamber_centroids(
        labels,
        segmentation.label_map or {},
        list(volume.dims),
        list(volume.spacing),
    )
    pairs = []
    for code, reference_target_id in REFERENCE_CHAMBER_IDS.items():
        if code not in centroids or reference_target_id not in chamber_targets:
            continue
        pairs.append((chamber_targets[reference_target_id], centroids[code]))

    if len(pairs) < 3:
        db.add(
            Measurement(
                study_id=study.id,
                code="ATLAS_REGISTRATION",
                label="参考图谱—患者配准",
                value=None,
                unit=None,
                method="chamber_centroid_similarity",
                source="reference_atlas",
                validation_status="not_computed",
                status="not_computed",
                reason=f"需要至少 3 个心腔标签；当前可用 {len(pairs)} 个。",
            )
        )
        db.commit()
        return None

    reference = np.array([item[0]["coordinateMm"] for item in pairs], dtype=float)
    patient = np.array([item[1] for item in pairs], dtype=float)
    scale, rotation, translation, rms, residuals = solve_similarity(reference, patient)

    heart_targets = [target for target in TARGETS if target.get("organ") == "HEART"]
    mapped_targets = []
    for target in heart_targets:
        reference_point = np.asarray(target["coordinateMm"], dtype=float)
        patient_point = scale * (rotation @ reference_point) + translation
        mapped_targets.append(
            {
                "id": target["id"],
                "name": target["name"],
                "category": target.get("category"),
                "referenceMm": [round(float(value), 2) for value in reference_point],
                "patientMm": [round(float(value), 2) for value in patient_point],
            }
        )

    landmarks = []
    for (target, _), residual in zip(pairs, residuals):
        patient_point = scale * (rotation @ np.asarray(target["coordinateMm"], dtype=float)) + translation
        landmarks.append(
            {
                "referenceTargetId": target["id"],
                "referenceMm": target["coordinateMm"],
                "patientMm": [round(float(value), 2) for value in patient_point],
                "residualMm": round(float(residual), 2),
            }
        )

    result = {
        "version": "atlas-registration/v1",
        "method": "chamber_centroid_umeyama_similarity",
        "validationStatus": "research",
        "frame": "patient_preview_centered_mm",
        "scale": round(scale, 5),
        "rotation": [[round(float(value), 6) for value in row] for row in rotation],
        "translationMm": [round(float(value), 2) for value in translation],
        "rmsMm": round(rms, 2),
        "landmarks": landmarks,
        "targets": mapped_targets,
        "note": (
            "Research registration using chamber centroids. Not externally validated. "
            "Mapped targets are reference anatomy, not patient lesions."
        ),
    }
    registration_path = storage.study_dir(study.id) / "derived" / "atlas_registration.json"
    registration_path.parent.mkdir(parents=True, exist_ok=True)
    registration_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    relative = storage.relative(registration_path)

    db.add(
        Measurement(
            study_id=study.id,
            code="ATLAS_REGISTRATION_RMS",
            label="图谱配准残差（研究）",
            value=round(rms, 2),
            unit="mm",
            method="chamber_centroid_umeyama_similarity",
            source="reference_atlas",
            validation_status="research",
            status="computed",
            provenance={
                "registration_path": relative,
                "scale": round(scale, 5),
                "target_count": len(mapped_targets),
                "landmarks": landmarks,
                "targets": mapped_targets,
                "segmentation_id": segmentation.id,
                "note": result["note"],
            },
        )
    )
    db.add(
        Measurement(
            study_id=study.id,
            code="ATLAS_REGISTERED_TARGETS",
            label="已映射参考靶点（研究）",
            value=len(mapped_targets),
            unit="个",
            method="chamber_centroid_umeyama_similarity",
            source="reference_atlas",
            validation_status="research",
            status="computed",
            provenance={"registration_path": relative},
        )
    )
    audit.record(
        db,
        study_id=study.id,
        actor=settings.default_actor,
        action="atlas_registration",
        payload={"rms_mm": round(rms, 2), "scale": round(scale, 5), "targets": len(mapped_targets)},
    )
    db.commit()
    return result
