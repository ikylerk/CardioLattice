from __future__ import annotations

from .i18n import measurement_label, measurement_reason, normalize_lang, present
from .models import Job, MeshRecord, Measurement, Report, Segmentation, Series, Study, VolumeRecord
from .reporting import annotate_report_language


def subject_out(subject) -> dict | None:
    if subject is None:
        return None
    return {
        "id": subject.id,
        "pseudonym": subject.pseudonym,
        "sex": subject.sex,
        "ageYears": subject.age_years,
    }


def _texts(values: list | None, lang: str) -> list:
    return [present(item, lang) if isinstance(item, str) else item for item in (values or [])]


def series_out(series: Series, lang: str = "en") -> dict:
    language = normalize_lang(lang)
    return {
        "id": series.id,
        "seriesUid": series.series_uid,
        "number": series.series_number,
        "modality": series.modality,
        "description": series.description,
        "sliceCount": series.slice_count,
        "rows": series.rows,
        "cols": series.cols,
        "pixelSpacing": series.pixel_spacing,
        "sliceThickness": series.slice_thickness,
        "kvp": series.kvp,
        "kernel": series.kernel,
        "contrastAgent": series.contrast_agent,
        "isSelected": series.is_selected,
        "candidateScore": series.candidate_score,
        "reasons": _texts(series.reasons, language),
    }


def _markers(markers: list | None, lang: str) -> list:
    output = []
    for marker in markers or []:
        if not isinstance(marker, dict):
            output.append(marker)
            continue
        item = dict(marker)
        label = item.get("label")
        if isinstance(label, str):
            item["label"] = present(label, lang)
        output.append(item)
    return output


def _quality(quality: dict | None, lang: str) -> dict | None:
    if not isinstance(quality, dict):
        return quality
    cloned = dict(quality)
    warnings = cloned.get("warnings")
    if isinstance(warnings, list):
        cloned["warnings"] = _texts(warnings, lang)
    return cloned


def volume_out(volume: VolumeRecord, lang: str = "en") -> dict:
    language = normalize_lang(lang)
    return {
        "id": volume.id,
        "studyId": volume.study_id,
        "seriesId": volume.series_id,
        "kind": volume.kind,
        "dims": volume.dims,
        "spacing": volume.spacing,
        "origin": volume.origin,
        "direction": volume.direction,
        "huRange": volume.hu_range,
        "boundsMin": [
            -volume.dims[0] * volume.spacing[0] / 2,
            -volume.dims[1] * volume.spacing[1] / 2,
            -volume.dims[2] * volume.spacing[2] / 2,
        ],
        "boundsMax": [
            volume.dims[0] * volume.spacing[0] / 2,
            volume.dims[1] * volume.spacing[1] / 2,
            volume.dims[2] * volume.spacing[2] / 2,
        ],
        "defaultSlices": volume.default_slices,
        "markers": _markers(volume.markers, language),
        "stats": volume.stats,
        "bytes": volume.bytes,
        "dataUrl": f"/api/volumes/{volume.id}/data",
        "pipelineVersion": volume.pipeline_version,
    }


def segmentation_out(segmentation: Segmentation, lang: str = "en") -> dict:
    language = normalize_lang(lang)
    return {
        "id": segmentation.id,
        "studyId": segmentation.study_id,
        "volumeId": segmentation.volume_id,
        "task": segmentation.task,
        "modelId": segmentation.model_id,
        "modelVersion": segmentation.model_version,
        "status": segmentation.status,
        "labelMap": segmentation.label_map,
        "quality": _quality(segmentation.quality, language),
        "provenance": _note_dict(segmentation.provenance, language),
    }


def _note_dict(value: dict | None, lang: str) -> dict | None:
    if not isinstance(value, dict):
        return value
    cloned = dict(value)
    note = cloned.get("note")
    if isinstance(note, str):
        cloned["note"] = present(note, lang)
    return cloned


def mesh_out(mesh: MeshRecord, lang: str = "en") -> dict:
    language = normalize_lang(lang)
    return {
        "id": mesh.id,
        "studyId": mesh.study_id,
        "segmentationId": mesh.segmentation_id,
        "structureCode": mesh.structure_code,
        "format": mesh.format,
        "url": f"/api/meshes/{mesh.id}/glb",
        "vertexCount": mesh.vertex_count,
        "triangleCount": mesh.triangle_count,
        "bbox": mesh.bbox,
        "sceneTransform": _note_dict(mesh.scene_transform, language),
        "provenance": _note_dict(mesh.provenance, language),
    }


def measurement_out(item: Measurement, lang: str = "en") -> dict:
    language = normalize_lang(lang)
    return {
        "id": item.id,
        "code": item.code,
        "label": measurement_label(item.code, language, item.label),
        "value": item.value,
        "unit": item.unit,
        "method": item.method,
        "source": item.source,
        "validationStatus": item.validation_status,
        "status": item.status,
        "reason": measurement_reason(item.code, language, item.reason),
        "segmentAha": item.segment_aha,
        "provenance": item.provenance,
    }


def report_out(report: Report, lang: str = "en") -> dict:
    """Return the stored report. ``lang`` does not translate ``content``."""
    _ = lang
    return {
        "id": report.id,
        "studyId": report.study_id,
        "status": report.status,
        "content": annotate_report_language(report.content),
        "generator": report.generator,
        "model": report.model,
        "promptVersion": report.prompt_version,
        "approvedBy": report.approved_by,
        "approvedAt": report.approved_at.isoformat() if report.approved_at else None,
        "version": 1,
    }


def job_out(job: Job, lang: str = "en") -> dict:
    language = normalize_lang(lang)
    return {
        "id": job.id,
        "studyId": job.study_id,
        "type": job.type,
        "state": job.state,
        "progress": job.progress,
        "stage": job.stage,
        "message": present(job.message, language),
        "error": present(job.error, language),
    }


def availability_out(study: Study) -> dict:
    has_volume = bool(study.volumes)
    has_seg = bool(study.segmentations)
    has_mesh = bool(study.meshes)
    return {
        "cta": has_volume,
        "anatomy": has_mesh,
        "analysis": bool(study.measurements),
        "report": bool(study.reports),
        "angio": False,
        "echo": False,
    }


def study_summary(study: Study, lang: str = "en") -> dict:
    language = normalize_lang(lang)
    return {
        "id": study.id,
        "subject": subject_out(study.subject),
        "studyUid": study.study_uid,
        "studyDate": study.study_date,
        "description": study.description,
        "modality": study.modality,
        "source": study.source,
        "status": study.status,
        "error": present(study.error, language),
        "createdAt": study.created_at.isoformat() if study.created_at else None,
        "availability": availability_out(study),
    }


def study_bundle(study: Study, lang: str = "en") -> dict:
    language = normalize_lang(lang)
    return {
        "study": study_summary(study, language),
        "series": [series_out(item, language) for item in sorted(study.series, key=lambda s: (s.series_number or 0))],
        "volumes": [volume_out(item, language) for item in study.volumes],
        "segmentations": [segmentation_out(item, language) for item in study.segmentations],
        "meshes": [mesh_out(item, language) for item in study.meshes],
        "measurements": [measurement_out(item, language) for item in study.measurements],
        "reports": [report_out(item, language) for item in study.reports],
        "jobs": [job_out(item, language) for item in sorted(study.jobs, key=lambda j: j.created_at)],
    }
