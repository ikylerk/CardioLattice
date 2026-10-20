from __future__ import annotations

import math
from datetime import date, datetime
import re

import numpy as np
import SimpleITK as sitk
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import audit
from .comparison_models import Comparison
from .config import settings
from .models import Measurement, Segmentation, Study, VolumeRecord
from .storage import storage

REGISTRATION_METHOD = "sitk_euler3d_mattes_mi"
RESEARCH_REGISTRATION_NOTE = (
    "Research rigid registration (SimpleITK Euler3D + Mattes mutual information). "
    "Not externally validated and not for clinical diagnosis or treatment decisions."
)


def _study_date(value: str | None) -> date | None:
    """Only full acquisition dates establish longitudinal order; never import time."""
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not re.fullmatch(r"(?:[0-9]{8}|[0-9]{4}-[0-9]{2}-[0-9]{2})", value):
        return None
    try:
        return datetime.strptime(value, "%Y%m%d" if len(value) == 8 else "%Y-%m-%d").date()
    except ValueError:
        return None


def _is_earlier(candidate: Study, current: Study) -> bool:
    candidate_date = _study_date(candidate.study_date)
    current_date = _study_date(current.study_date)
    return candidate_date is not None and current_date is not None and candidate_date < current_date


def _computed_codes(db: Session, study_id: str) -> list[str]:
    return sorted(
        code for code, row in _latest_measurements(db, study_id).items()
        if row.status == "computed" and _finite_number(row.value) is not None
    )


def prior_candidates(db: Session, study_id: str) -> list[dict]:
    """Return ready studies for the same subject that precede ``study_id``."""
    study = db.get(Study, study_id)
    if study is None:
        raise LookupError("study not found")

    if not study.subject_id or study.status != "ready" or _study_date(study.study_date) is None:
        return []

    rows = db.scalars(
        select(Study)
        .where(Study.subject_id == study.subject_id)
        .where(Study.id != study.id)
        .where(Study.status == "ready")
        .order_by(Study.created_at.desc())
    ).all()

    return [
        {
            "id": candidate.id,
            "studyDate": candidate.study_date,
            "description": candidate.description,
            "source": candidate.source,
            "measurementCodes": _computed_codes(db, candidate.id),
        }
        for candidate in sorted(
            rows, key=lambda row: (_study_date(row.study_date) or date.min, row.id), reverse=True,
        )
        if _is_earlier(candidate, study)
    ]


def _latest_preview_volume(db: Session, study_id: str) -> VolumeRecord | None:
    return db.scalars(
        select(VolumeRecord)
        .where(VolumeRecord.study_id == study_id)
        .where(VolumeRecord.kind == "preview_u8")
        .order_by(VolumeRecord.created_at.desc())
        .limit(1)
    ).first()


def _latest_measurements(db: Session, study_id: str) -> dict[str, Measurement]:
    rows = db.scalars(
        select(Measurement)
        .where(Measurement.study_id == study_id)
        .order_by(Measurement.created_at.asc())
    ).all()
    latest: dict[str, Measurement] = {}
    for row in rows:
        latest[row.code] = row
    return latest


def _spacing_differs(current, prior) -> bool:
    try:
        a, b = np.asarray(current, dtype=float), np.asarray(prior, dtype=float)
        return not (
            a.shape == b.shape == (3,)
            and np.isfinite(a).all() and np.isfinite(b).all()
            and (a > 0).all() and (b > 0).all()
            and np.allclose(a, b, rtol=1e-3, atol=1e-6)
        )
    except (TypeError, ValueError):
        return True


def _preview_image(volume: VolumeRecord) -> sitk.Image:
    """Load the persisted preview geometry in SimpleITK physical LPS millimetres."""
    dims_raw = np.asarray(volume.dims, dtype=float)
    spacing = np.asarray(volume.spacing, dtype=float)
    origin = np.asarray(volume.origin, dtype=float)
    direction = np.asarray(volume.direction, dtype=float)
    if (
        dims_raw.shape != (3,) or not np.isfinite(dims_raw).all()
        or (dims_raw < 1).any() or not np.equal(dims_raw, np.floor(dims_raw)).all()
    ):
        raise ValueError("preview dimensions must be three positive integers")
    if spacing.shape != (3,) or not np.isfinite(spacing).all() or (spacing <= 0).any():
        raise ValueError("preview spacing must be three finite positive values")
    if origin.shape != (3,) or not np.isfinite(origin).all():
        raise ValueError("preview physical origin is missing or invalid")
    if direction.shape != (9,) or not np.isfinite(direction).all():
        raise ValueError("preview physical direction is missing or invalid")
    matrix = direction.reshape(3, 3)
    if not np.allclose(matrix.T @ matrix, np.eye(3), atol=1e-5, rtol=0):
        raise ValueError("preview direction must be orthonormal")
    if volume.affine is not None:
        affine = np.asarray(volume.affine, dtype=float)
        expected_affine = np.eye(4)
        expected_affine[:3, :3] = matrix @ np.diag(spacing)
        expected_affine[:3, 3] = origin
        if affine.shape != (4, 4) or not np.allclose(affine, expected_affine, atol=1e-5, rtol=0):
            raise ValueError("preview affine conflicts with spacing/origin/direction; reprocess this study")
    dims = [int(value) for value in dims_raw]
    path = storage.path_for(volume.data_path)
    if not path.is_file():
        raise FileNotFoundError(f"preview volume data not found for {volume.id}")
    expected = math.prod(dims)
    if path.stat().st_size != expected:
        raise ValueError(f"volume byte size does not match dims {dims}")
    raw = np.fromfile(path, dtype=np.uint8)
    array = raw.reshape((dims[2], dims[1], dims[0])).astype(np.float32)
    image = sitk.GetImageFromArray(array)
    image.SetSpacing(tuple(spacing))
    image.SetOrigin(tuple(origin))
    image.SetDirection(tuple(direction))
    return image


def _registration_overlap(fixed: sitk.Image, moving: sitk.Image, transform) -> tuple[float, float]:
    def coverage(target, source, mapping):
        mask = sitk.Image(source.GetSize(), sitk.sitkUInt8) + 1
        mask.CopyInformation(source)
        sampled = sitk.Resample(mask, target, mapping, sitk.sitkNearestNeighbor, 0)
        return float(np.mean(sitk.GetArrayViewFromImage(sampled) > 0))

    return coverage(fixed, moving, transform), coverage(moving, fixed, transform.GetInverse())


def _transform_matrix(transform) -> list[list[float]]:
    """Include the centre offset; parameters alone are not a homogeneous transform."""
    origin = np.asarray(transform.TransformPoint((0.0, 0.0, 0.0)))
    matrix = np.eye(4)
    matrix[:3, 3] = origin
    for axis in range(3):
        point = np.eye(3)[axis]
        matrix[:3, axis] = np.asarray(transform.TransformPoint(tuple(point))) - origin
    if not np.isfinite(matrix).all():
        raise ValueError("registration produced a non-finite transform")
    return matrix.tolist()


def _run_registration(
    current_volume: VolumeRecord | None,
    prior_volume: VolumeRecord | None,
    current_id: str,
    prior_id: str,
) -> dict:
    info = {
        "method": REGISTRATION_METHOD,
        "status": "not_run",
        "quality": "not_assessed",
        "metric": None,
        "metricName": "Mattes mutual information (negative; not an accuracy score)",
        "warnings": [RESEARCH_REGISTRATION_NOTE],
        "coordinateSystem": "LPS",
        "units": "mm",
        "fixedStudyId": prior_id,
        "movingStudyId": current_id,
        "transform": None,
    }
    if current_volume is None or prior_volume is None:
        info["warnings"].append("Registration not run: a study has no preview volume.")
        return info

    try:
        fixed = _preview_image(prior_volume)
        moving = _preview_image(current_volume)
        for image in (fixed, moving):
            if min(image.GetSize()) < 4:
                raise ValueError("registration needs at least four voxels on each axis")
            if float(np.std(sitk.GetArrayViewFromImage(image))) < 1e-6:
                raise ValueError("constant preview has no registration signal")

        method = sitk.ImageRegistrationMethod()
        method.SetMetricAsMattesMutualInformation(numberOfHistogramBins=32)
        method.SetMetricSamplingStrategy(sitk.ImageRegistrationMethod.RANDOM)
        method.SetMetricSamplingPercentage(0.08, seed=20261018)
        method.SetInterpolator(sitk.sitkLinear)
        initial = sitk.CenteredTransformInitializer(
            fixed, moving, sitk.Euler3DTransform(),
            sitk.CenteredTransformInitializerFilter.GEOMETRY,
        )
        method.SetInitialTransform(initial, inPlace=True)
        method.SetOptimizerAsRegularStepGradientDescent(
            learningRate=1.0, minStep=1e-4, numberOfIterations=60,
            relaxationFactor=0.5, gradientMagnitudeTolerance=1e-6,
        )
        method.SetOptimizerScalesFromPhysicalShift()
        transform = method.Execute(fixed, moving)
        metric = float(method.GetMetricValue())
        stop = method.GetOptimizerStopConditionDescription() or ""
        if not math.isfinite(metric):
            raise ValueError("registration produced a non-finite metric")
        # The optimizer's class name contains "Gradient": it is not convergence evidence.
        converged = any(token in stop.lower() for token in (
            "gradient magnitude tolerance met", "step too small",
        ))
        fixed_coverage, moving_coverage = _registration_overlap(fixed, moving, transform)
        valid_points = int(method.GetMetricNumberOfValidPoints())
        qc_passed = converged and valid_points > 0 and min(fixed_coverage, moving_coverage) >= 0.5
        info.update({
            "status": "completed" if qc_passed else "low_quality",
            "quality": "research_qc_passed" if qc_passed else "research_low_confidence",
            "metric": round(metric, 6),
            "stopCondition": stop,
            "qualityChecks": {
                "optimizerConverged": converged,
                "validMetricPoints": valid_points,
                "fixedCoverage": round(fixed_coverage, 6),
                "movingCoverage": round(moving_coverage, 6),
                "minimumCoverage": 0.5,
                "anatomicalAccuracyValidated": False,
            },
            "transform": {
                "mapping": "prior_to_current",
                "coordinateSystem": "LPS",
                "units": "mm",
                "matrix": _transform_matrix(transform),
            },
        })
        if not converged:
            info["warnings"].append(f"Registration optimizer did not converge: {stop}")
        if min(fixed_coverage, moving_coverage) < 0.5 or valid_points <= 0:
            info["warnings"].append("Insufficient physical field-of-view overlap or valid metric points.")
        info["warnings"].append(
            "Coverage and optimizer checks are engineering checks, not anatomical accuracy validation."
        )
    except Exception as exc:  # noqa: BLE001 - persist explicit failure, never claim success
        info.update({"status": "failed", "quality": "not_assessed", "metric": None, "transform": None})
        info["warnings"].append(f"Registration failed: {exc}")
    return info


def _finite_number(value) -> float | None:
    if value is None or isinstance(value, (bool, str)):
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError, OverflowError):
        return None


def _measurement_context(db: Session, measurement: Measurement | None) -> tuple[dict, list[str]]:
    if measurement is None:
        return {}, []
    provenance = measurement.provenance if isinstance(measurement.provenance, dict) else {}
    segmentation_id = provenance.get("segmentation_id")
    needs_segmentation = (
        measurement.method == "voxel_count"
        or (measurement.method or "").startswith("skeleton_")
        or bool(segmentation_id)
    )
    if not needs_segmentation:
        return {}, []
    segmentation = db.get(Segmentation, segmentation_id) if isinstance(segmentation_id, str) else None
    if segmentation is None or segmentation.study_id != measurement.study_id:
        return {}, ["Measurement segmentation provenance is missing or belongs to another study."]
    context = {
        "segmentationId": segmentation.id,
        "modelId": segmentation.model_id,
        "modelVersion": segmentation.model_version,
        "task": segmentation.task,
    }
    warnings = []
    if segmentation.status != "completed" or not segmentation.model_id or not segmentation.model_version:
        warnings.append("Measurement segmentation is incomplete or has unknown model identity/version.")
    volume = db.get(VolumeRecord, segmentation.volume_id)
    if volume is None or volume.study_id != measurement.study_id:
        warnings.append("Measurement source volume is missing or belongs to another study.")
    else:
        context.update({
            "volumeId": volume.id, "pipelineVersion": volume.pipeline_version,
            "spacing": volume.spacing, "volumeKind": volume.kind,
        })
    context["measurementGrid"] = provenance.get("measurement_grid", "preview")
    if context["measurementGrid"] == "native_label":
        native = provenance.get("native_geometry")
        native = native if isinstance(native, dict) else {}
        context["spacing"] = native.get("spacing")
        if _spacing_differs(context["spacing"], context["spacing"]):
            warnings.append("Native measurement voxel spacing is missing or invalid.")
    return context, warnings


def _compare_measurements(
    current: Measurement | None,
    prior: Measurement | None,
    spacing_differs: bool,
    model_versions: tuple[str | None, str | None],
    context_warnings: list[str] | None = None,
) -> dict:
    warns = list(context_warnings or [])
    current_value = _finite_number(current.value) if current and current.status == "computed" else None
    prior_value = _finite_number(prior.value) if prior and prior.status == "computed" else None
    if current_value is None or prior_value is None:
        warns.append("A measurement is missing, not computed, or non-finite.")
    for field in ("method", "source", "unit", "validation_status"):
        a, b = getattr(current, field, None), getattr(prior, field, None)
        if not a or not b:
            warns.append(f"Measurement {field} is missing.")
        elif a != b:
            warns.append(f"Measurement {field} differs (current={a}, prior={b}).")
    if current and prior:
        if current.segment_aha != prior.segment_aha:
            warns.append("Measurement AHA segment differs.")
        current_provenance = current.provenance if isinstance(current.provenance, dict) else {}
        prior_provenance = prior.provenance if isinstance(prior.provenance, dict) else {}
        for key in ("label_value", "cardiac_phase", "measurement_space", "measurement_grid", "pipeline_version"):
            if current_provenance.get(key) != prior_provenance.get(key):
                warns.append(f"Measurement provenance {key} differs.")
        if current.code in {"LV_VOLUME", "RV_VOLUME", "LA_VOLUME", "RA_VOLUME"}:
            if not current_provenance.get("cardiac_phase") or not prior_provenance.get("cardiac_phase"):
                warns.append("Cardiac acquisition phase is unknown; chamber volumes are not comparable.")
        if current.source == "reference_atlas" or prior.source == "reference_atlas":
            warns.append("Reference atlas values are not longitudinal patient measurements.")
    current_model, prior_model = model_versions
    if current_model != prior_model:
        warns.append(f"Segmentation model version differs (current={current_model}, prior={prior_model}).")
    if spacing_differs:
        warns.append("Measurement voxel spacing differs or is unavailable.")
    delta = percent = None
    if not warns:
        delta = current_value - prior_value
        percent = delta / prior_value * 100.0 if prior_value != 0 else None
        if not math.isfinite(delta) or (percent is not None and not math.isfinite(percent)):
            warns.append("Measurement change exceeds the finite numeric range.")
            delta = percent = None
    base = current if current is not None else prior
    return {
        "code": base.code,
        "label": base.label,
        "unit": current.unit if current and prior and current.unit == prior.unit else None,
        "currentUnit": current.unit if current else None,
        "priorUnit": prior.unit if prior else None,
        "current": round(current_value, 4) if current_value is not None else None,
        "prior": round(prior_value, 4) if prior_value is not None else None,
        "delta": round(delta, 4) if delta is not None else None,
        "percent": round(percent, 2) if percent is not None else None,
        "method": base.method,
        "source": base.source,
        "comparability": {
            "comparable": not warns,
            "warnings": list(dict.fromkeys(warns)),
            "current": {
                "measurementId": current.id if current else None,
                "method": current.method if current else None,
                "source": current.source if current else None,
                "validationStatus": current.validation_status if current else None,
                "modelVersion": current_model,
            },
            "prior": {
                "measurementId": prior.id if prior else None,
                "method": prior.method if prior else None,
                "source": prior.source if prior else None,
                "validationStatus": prior.validation_status if prior else None,
                "modelVersion": prior_model,
            },
        },
    }


def _json_safe(value):
    """Historical JSON may contain NaN/Infinity; HTTP JSON must never emit them."""
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def comparison_out(comparison: Comparison) -> dict:
    registration = _json_safe(comparison.registration or {})
    deltas = _json_safe(comparison.deltas or [])
    warnings = list(comparison.warnings or [])
    registration_usable = (
        registration.get("status") == "completed"
        and registration.get("quality") == "research_qc_passed"
        and _finite_number(registration.get("metric")) is not None
    )
    for item in deltas:
        comparability = item.get("comparability")
        explicit_comparable = isinstance(comparability, dict) and comparability.get("comparable") is True
        usable = (
            registration_usable and explicit_comparable
            and _finite_number(item.get("current")) is not None
            and _finite_number(item.get("prior")) is not None
            and _finite_number(item.get("delta")) is not None
        )
        if not usable:
            item["delta"] = item["percent"] = None
            if not isinstance(comparability, dict):
                comparability = {"warnings": ["Legacy comparability is not verified."]}
                item["comparability"] = comparability
            comparability["comparable"] = False
            if not registration_usable:
                comparability.setdefault("warnings", []).append(
                    "Registration quality checks did not pass; longitudinal deltas are withheld."
                )
            comparability["warnings"] = list(dict.fromkeys(comparability.get("warnings", [])))
    status = comparison.status
    if not registration_usable and status in {"completed", "completed_with_warnings"}:
        status = "failed" if registration.get("status") == "failed" else "not_comparable"
        warnings.append("Stored comparison does not meet current registration quality checks.")
    return {
        "id": comparison.id,
        "currentStudyId": comparison.current_study_id,
        "priorStudyId": comparison.prior_study_id,
        "registration": registration,
        "deltas": deltas,
        "warnings": list(dict.fromkeys(warnings)),
        "status": status,
        "validationStatus": "research",
        "createdAt": comparison.created_at.isoformat() if comparison.created_at else None,
    }


def run_comparison(db: Session, current_id: str, prior_id: str) -> dict:
    """Compare computed measurements and preview volumes of two studies.

    Raises LookupError when a study does not exist and ValueError when the pair
    is not a valid longitudinal comparison.
    """
    current = db.get(Study, current_id)
    prior = db.get(Study, prior_id)
    if current is None:
        raise LookupError(f"current study not found: {current_id}")
    if prior is None:
        raise LookupError(f"prior study not found: {prior_id}")
    if current.id == prior.id:
        raise ValueError("a study cannot be compared with itself")
    if not current.subject_id or not prior.subject_id or current.subject_id != prior.subject_id:
        raise ValueError("studies belong to different subjects; longitudinal comparison is not allowed")
    if current.status != "ready" or prior.status != "ready":
        raise ValueError(
            "both studies must be ready before comparison "
            f"(current={current.status}, prior={prior.status})"
        )

    if not _is_earlier(prior, current):
        raise ValueError("prior study must have a valid acquisition date strictly before the current study")

    warnings: list[str] = []
    current_volume = _latest_preview_volume(db, current_id)
    prior_volume = _latest_preview_volume(db, prior_id)
    spacing_differs = False
    if current_volume is not None and prior_volume is not None:
        spacing_differs = _spacing_differs(current_volume.spacing, prior_volume.spacing)
        if spacing_differs:
            warnings.append(
                "Preview voxel spacing differs between studies "
                f"(current={current_volume.spacing}, prior={prior_volume.spacing}); "
                "voxel-derived measurements may not be directly comparable."
            )
    else:
        missing = []
        if current_volume is None:
            missing.append("current")
        if prior_volume is None:
            missing.append("prior")
        warnings.append(
            "Missing preview volume for " + "/".join(missing) + " study; registration not possible."
        )

    if current.source != prior.source:
        warnings.append(
            f"Study source differs (current={current.source}, prior={prior.source})."
        )

    registration = _run_registration(current_volume, prior_volume, current_id, prior_id)
    warnings.extend(registration["warnings"])
    context_warnings = []
    if current.source != prior.source:
        context_warnings.append("Study source differs.")
    if current.modality != prior.modality:
        context_warnings.append("Study modality differs.")
    if registration["status"] != "completed":
        context_warnings.append("Registration quality checks did not pass; longitudinal deltas are withheld.")

    current_measurements = _latest_measurements(db, current_id)
    prior_measurements = _latest_measurements(db, prior_id)
    deltas: list[dict] = []
    for code in sorted(set(current_measurements) | set(prior_measurements)):
        current_measurement, prior_measurement = current_measurements.get(code), prior_measurements.get(code)
        current_context, current_warnings = _measurement_context(db, current_measurement)
        prior_context, prior_warnings = _measurement_context(db, prior_measurement)
        measurement_warnings = context_warnings + current_warnings + prior_warnings
        for key in ("modelId", "task", "pipelineVersion", "volumeKind", "measurementGrid"):
            if current_context.get(key) != prior_context.get(key):
                measurement_warnings.append(f"Measurement source {key} differs.")
        # Use the volume that actually produced each measurement, not a later segmentation.
        measurement_spacing_differs = spacing_differs
        if current_context or prior_context:
            measurement_spacing_differs = _spacing_differs(
                current_context.get("spacing"), prior_context.get("spacing"),
            )
        delta = _compare_measurements(
            current_measurement, prior_measurement, measurement_spacing_differs,
            (current_context.get("modelVersion"), prior_context.get("modelVersion")),
            measurement_warnings,
        )
        delta["comparability"]["current"].update(current_context)
        delta["comparability"]["prior"].update(prior_context)
        deltas.append(delta)
        warnings.extend(delta["comparability"]["warnings"])

    comparable_count = sum(item["comparability"]["comparable"] for item in deltas)
    if not comparable_count:
        warnings.append("No comparable measurements; no longitudinal change can be inferred.")
    warnings = list(dict.fromkeys(warnings))
    if registration["status"] == "failed":
        status = "failed"
    elif not comparable_count:
        status = "not_comparable"
    else:
        status = "completed_with_warnings" if warnings else "completed"

    comparison = Comparison(
        current_study_id=current_id,
        prior_study_id=prior_id,
        registration=registration,
        deltas=deltas,
        warnings=warnings,
        status=status,
    )
    db.add(comparison)
    db.flush()
    audit.record(
        db,
        study_id=current_id,
        actor=settings.default_actor,
        action="study_comparison",
        payload={
            "comparison_id": comparison.id,
            "prior_study_id": prior_id,
            "delta_codes": [item["code"] for item in deltas],
            "registration_status": registration["status"],
            "validation_status": "research",
        },
    )
    db.commit()
    db.refresh(comparison)
    return comparison_out(comparison)
