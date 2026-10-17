from __future__ import annotations

from .models import Job, MeshRecord, Measurement, Report, Segmentation, Series, Study, VolumeRecord


def subject_out(subject) -> dict | None:
    if subject is None:
        return None
    return {
        "id": subject.id,
        "pseudonym": subject.pseudonym,
        "sex": subject.sex,
        "ageYears": subject.age_years,
    }


def series_out(series: Series) -> dict:
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
        "reasons": series.reasons or [],
    }


def volume_out(volume: VolumeRecord) -> dict:
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
        "markers": volume.markers or [],
        "stats": volume.stats,
        "bytes": volume.bytes,
        "dataUrl": f"/api/volumes/{volume.id}/data",
        "pipelineVersion": volume.pipeline_version,
    }


def segmentation_out(segmentation: Segmentation) -> dict:
    return {
        "id": segmentation.id,
        "studyId": segmentation.study_id,
        "volumeId": segmentation.volume_id,
        "task": segmentation.task,
        "modelId": segmentation.model_id,
        "modelVersion": segmentation.model_version,
        "status": segmentation.status,
        "labelMap": segmentation.label_map,
        "standardLabelMap": (segmentation.provenance or {}).get("standard_label_map", {}),
        "quality": segmentation.quality,
        "provenance": segmentation.provenance,
    }


def mesh_out(mesh: MeshRecord) -> dict:
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
        "sceneTransform": mesh.scene_transform,
        "provenance": mesh.provenance,
    }


def measurement_out(item: Measurement) -> dict:
    return {
        "id": item.id,
        "code": item.code,
        "label": item.label,
        "value": item.value,
        "unit": item.unit,
        "method": item.method,
        "source": item.source,
        "validationStatus": item.validation_status,
        "status": item.status,
        "reason": item.reason,
        "segmentAha": item.segment_aha,
        "provenance": item.provenance,
    }


def report_out(report: Report) -> dict:
    return {
        "id": report.id,
        "studyId": report.study_id,
        "status": report.status,
        "content": report.content,
        "generator": report.generator,
        "model": report.model,
        "promptVersion": report.prompt_version,
        "approvedBy": report.approved_by,
        "approvedAt": report.approved_at.isoformat() if report.approved_at else None,
        "version": 1,
    }


def job_out(job: Job) -> dict:
    return {
        "id": job.id,
        "studyId": job.study_id,
        "type": job.type,
        "state": job.state,
        "progress": job.progress,
        "stage": job.stage,
        "message": job.message,
        "error": job.error,
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


def study_summary(study: Study) -> dict:
    return {
        "id": study.id,
        "subject": subject_out(study.subject),
        "studyUid": study.study_uid,
        "studyDate": study.study_date,
        "description": study.description,
        "modality": study.modality,
        "source": study.source,
        "status": study.status,
        "error": study.error,
        "createdAt": study.created_at.isoformat() if study.created_at else None,
        "availability": availability_out(study),
    }


def study_bundle(study: Study) -> dict:
    return {
        "study": study_summary(study),
        "series": [series_out(item) for item in sorted(study.series, key=lambda s: (s.series_number or 0))],
        "volumes": [volume_out(item) for item in study.volumes],
        "segmentations": [segmentation_out(item) for item in study.segmentations],
        "meshes": [mesh_out(item) for item in study.meshes],
        "measurements": [measurement_out(item) for item in study.measurements],
        "reports": [report_out(item) for item in study.reports],
        "jobs": [job_out(item) for item in sorted(study.jobs, key=lambda j: j.created_at)],
    }
