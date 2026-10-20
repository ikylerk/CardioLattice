"""Stable API codes.

Human text for errors, reasons, stage messages, series reasons, and labels
lives in the frontend. This module only builds ``{"code", "params"}`` objects
and maps previously stored keys or English sentences onto those codes.
"""

from __future__ import annotations

import json

from fastapi import HTTPException


class CodedError(ValueError):
    def __init__(self, message_code: str, status_code: int = 400, **params):
        self.code = message_code
        self.params = {key: value for key, value in params.items()}
        self.status_code = status_code
        super().__init__(message_code)

    def body(self) -> dict:
        return {"code": self.code, "params": self.params}


def coded(message_code: str, **params) -> dict:
    return {"code": message_code, "params": dict(params)}


def store(message_code: str, **params) -> str:
    """Persist a code in a text column. Params are JSON; a bare code has none."""
    if not params:
        return message_code
    return json.dumps(coded(message_code, **params), ensure_ascii=False, separators=(",", ":"))


def abort(message_code: str, status_code: int, **params) -> None:
    raise HTTPException(status_code=status_code, detail=coded(message_code, **params))


def http_error(exc: CodedError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.body())


# Measurement label codes match the measurement ``code``, except VOLUME.
LABEL_CODES = frozenset(
    {
        "LV_VOLUME",
        "RV_VOLUME",
        "LA_VOLUME",
        "RA_VOLUME",
        "LV_EF",
        "STENOSIS_LAD",
        "FFR_CT",
        "CALCIUM_SCORE",
        "AHA_SEGMENTS",
        "VOLUME",
    }
)

# not_computed reason codes, keyed by measurement code.
REASON_BY_MEASUREMENT = {
    "LV_EF": "LV_EF_REQUIRES_TWO_PHASES",
    "STENOSIS_LAD": "NO_VALIDATED_LUMEN_MODEL",
    "FFR_CT": "FFR_CT_REQUIRES_MODEL",
    "CALCIUM_SCORE": "CALCIUM_SCORE_REQUIRES_NONCONTRAST",
    "AHA_SEGMENTS": "AHA_NOT_FROM_CTA",
}

STAGE_MESSAGE = {
    "queued": "STAGE_QUEUED",
    "validating": "STAGE_VALIDATING",
    "anonymizing": "STAGE_ANONYMIZING",
    "building_volume": "STAGE_BUILDING_VOLUME",
    "segmenting": "STAGE_SEGMENTING",
    "meshing": "STAGE_MESHING",
    "computing_metrics": "STAGE_COMPUTING_METRICS",
    "drafting_report": "STAGE_DRAFTING_REPORT",
    "succeeded": "STAGE_SUCCEEDED",
    "failed": "STAGE_FAILED",
}

# Previously stored keys and English sentences. Not served as text.
_LEGACY = {
    "error.series_no_files": "SERIES_NO_FILES",
    "error.no_dicom_for_series": "NO_DICOM_FOR_SERIES",
    "error.no_series_selected_pipeline": "NO_SERIES_SELECTED",
    "error.no_labelled_structures": "NO_LABELLED_STRUCTURES",
    "error.labels_path_required": "LABELS_PATH_REQUIRED",
    "error.upload_too_large": "UPLOAD_TOO_LARGE",
    "error.no_dicom_in_upload": "NO_DICOM_IN_UPLOAD",
    "error.no_ct_series": "NO_CT_SERIES",
    "error.study_already_uploaded": "STUDY_ALREADY_UPLOADED",
    "error.no_plausible_ccta": "NO_PLAUSIBLE_CCTA",
    "error.zip_traversal": "ZIP_TRAVERSAL",
    "error.zip_entry_too_large": "ZIP_ENTRY_TOO_LARGE",
    "error.zip_expands_too_large": "ZIP_EXPANDS_TOO_LARGE",
    "error.volume_size": "VOLUME_SIZE",
    "error.too_few_slices": "TOO_FEW_SLICES",
    "error.inconsistent_dimensions": "INCONSISTENT_DIMENSIONS",
    "error.storage_escape": "STORAGE_ESCAPE",
    "http.study_not_found": "STUDY_NOT_FOUND",
    "http.series_not_found": "SERIES_NOT_FOUND",
    "http.job_not_found": "JOB_NOT_FOUND",
    "http.report_not_found": "REPORT_NOT_FOUND",
    "http.volume_not_found": "VOLUME_NOT_FOUND",
    "http.mesh_not_found": "MESH_NOT_FOUND",
    "http.not_found": "NOT_FOUND",
    "http.no_series_selected": "NO_SERIES_SELECTED",
    "http.approved_immutable": "APPROVED_IMMUTABLE",
    "http.volume_gone": "VOLUME_GONE",
    "http.mesh_gone": "MESH_GONE",
    "http.ingest_failed": "INGEST_FAILED",
    "http.demo_failed": "DEMO_FAILED",
    "stage.queued": "STAGE_QUEUED",
    "stage.validating": "STAGE_VALIDATING",
    "stage.anonymizing": "STAGE_ANONYMIZING",
    "stage.building_volume": "STAGE_BUILDING_VOLUME",
    "stage.segmenting": "STAGE_SEGMENTING",
    "stage.meshing": "STAGE_MESHING",
    "stage.computing_metrics": "STAGE_COMPUTING_METRICS",
    "stage.drafting_report": "STAGE_DRAFTING_REPORT",
    "stage.succeeded": "STAGE_SUCCEEDED",
    "stage.failed": "STAGE_FAILED",
    "series.ct_modality": "SERIES_CT_MODALITY",
    "series.axial_geometry": "SERIES_AXIAL_GEOMETRY",
    "series.thin_slices": "SERIES_THIN_SLICES",
    "series.cardiac_protocol": "SERIES_CARDIAC_PROTOCOL",
    "series.contrast_present": "SERIES_CONTRAST_PRESENT",
    "series.enough_slices": "SERIES_ENOUGH_SLICES",
    "series.too_few_slices": "SERIES_TOO_FEW_SLICES",
    "series.excluded_nondiagnostic": "SERIES_EXCLUDED_NONDIAGNOSTIC",
    "series.non_ct": "SERIES_NON_CT",
    "marker.calcification_synthetic": "MARKER_CALCIFICATION_SYNTHETIC",
    "quality.synthetic_ground_truth": "QUALITY_SYNTHETIC_GROUND_TRUTH",
    "quality.totalsegmentator_research": "QUALITY_TOTALSEGMENTATOR_RESEARCH",
    "note.synthetic_fixture": "NOTE_SYNTHETIC_FIXTURE",
    "note.glb_scene_units": "NOTE_GLB_SCENE_UNITS",
    "model.synthetic.intended_use": "MODEL_SYNTHETIC_INTENDED_USE",
    "model.synthetic.license": "MODEL_SYNTHETIC_LICENSE",
    "model.totalseg.intended_use": "MODEL_TOTALSEG_INTENDED_USE",
    "model.totalseg.license": "MODEL_TOTALSEG_LICENSE",
    "model.lumen.intended_use": "MODEL_LUMEN_INTENDED_USE",
    "model.lumen.license": "MODEL_LUMEN_LICENSE",
    "Queued": "STAGE_QUEUED",
    "Validating selected series": "STAGE_VALIDATING",
    "De-identifying and remapping UIDs": "STAGE_ANONYMIZING",
    "Decoding pixels, resampling, building preview volume": "STAGE_BUILDING_VOLUME",
    "Decoding pixels, resampling, and building the preview volume": "STAGE_BUILDING_VOLUME",
    "Segmenting cardiac structures": "STAGE_SEGMENTING",
    "Extracting surfaces and exporting GLB": "STAGE_MESHING",
    "Computing deterministic measurements": "STAGE_COMPUTING_METRICS",
    "Generating deterministic report draft": "STAGE_DRAFTING_REPORT",
    "Generating the deterministic report draft": "STAGE_DRAFTING_REPORT",
    "Pipeline completed": "STAGE_SUCCEEDED",
    "Pipeline failed": "STAGE_FAILED",
    "CT modality": "SERIES_CT_MODALITY",
    "Axial geometry": "SERIES_AXIAL_GEOMETRY",
    "axial geometry": "SERIES_AXIAL_GEOMETRY",
    "Thin slices": "SERIES_THIN_SLICES",
    "thin slices": "SERIES_THIN_SLICES",
    "Cardiac protocol description": "SERIES_CARDIAC_PROTOCOL",
    "cardiac protocol description": "SERIES_CARDIAC_PROTOCOL",
    "Contrast agent present": "SERIES_CONTRAST_PRESENT",
    "contrast agent present": "SERIES_CONTRAST_PRESENT",
    "At least 64 slices": "SERIES_ENOUGH_SLICES",
    ">=64 slices": "SERIES_ENOUGH_SLICES",
    "Too few slices": "SERIES_TOO_FEW_SLICES",
    "too few slices": "SERIES_TOO_FEW_SLICES",
    "Excluded non-diagnostic series": "SERIES_EXCLUDED_NONDIAGNOSTIC",
    "excluded non-diagnostic series": "SERIES_EXCLUDED_NONDIAGNOSTIC",
    "Non-CT series": "SERIES_NON_CT",
    "non-CT series": "SERIES_NON_CT",
    "Left ventricular cavity volume (acquired phase)": "LV_VOLUME",
    "Right ventricular cavity volume (acquired phase)": "RV_VOLUME",
    "Left atrial cavity volume (acquired phase)": "LA_VOLUME",
    "Right atrial cavity volume (acquired phase)": "RA_VOLUME",
    "Left ventricular ejection fraction (EF)": "LV_EF",
    "LAD stenosis severity": "STENOSIS_LAD",
    "Agatston calcium score": "CALCIUM_SCORE",
    "AHA 17-segment perfusion / viability": "AHA_SEGMENTS",
    "Requires end-diastolic and end-systolic phases; it cannot be computed from a single-phase CTA.": "LV_EF_REQUIRES_TWO_PHASES",
    "No validated coronary lumen or stenosis model is connected.": "NO_VALIDATED_LUMEN_MODEL",
    "Requires a validated CFD or hemodynamic model.": "FFR_CT_REQUIRES_MODEL",
    "Requires a non-contrast calcium-scoring series.": "CALCIUM_SCORE_REQUIRES_NONCONTRAST",
    "Perfusion or myocardial viability cannot be inferred from CTA alone.": "AHA_NOT_FROM_CTA",
    "Validated input or a validated model is missing.": "MISSING_VALIDATED_INPUT",
    "Calcified focus (synthetic)": "MARKER_CALCIFICATION_SYNTHETIC",
    "Synthetic ground truth — not a clinical segmentation.": "QUALITY_SYNTHETIC_GROUND_TRUTH",
    "Synthetic ground truth — not a clinical segmentation": "QUALITY_SYNTHETIC_GROUND_TRUTH",
    "Research adapter; not validated for stenosis or FFR.": "QUALITY_TOTALSEGMENTATOR_RESEARCH",
    "Generated from the same phantom definition as the DICOM fixture.": "NOTE_SYNTHETIC_FIXTURE",
    "GLB coordinates are already in scene units.": "NOTE_GLB_SCENE_UNITS",
    "Pipeline verification on synthetic fixtures only.": "MODEL_SYNTHETIC_INTENDED_USE",
    "Generated in-repo.": "MODEL_SYNTHETIC_LICENSE",
    "Research segmentation; not validated for stenosis or FFR.": "MODEL_TOTALSEG_INTENDED_USE",
    "Code is Apache-2.0; task weights require a per-task licence review.": "MODEL_TOTALSEG_LICENSE",
    "Not configured.": "MODEL_LUMEN_INTENDED_USE",
    "Pending validation and licence review.": "MODEL_LUMEN_LICENSE",
    "selected series has no stored files": "SERIES_NO_FILES",
    "no DICOM files found for the selected series": "NO_DICOM_FOR_SERIES",
    "no series selected; choose a CCTA series before running the pipeline": "NO_SERIES_SELECTED",
    "no labelled structures found; mesh not created": "NO_LABELLED_STRUCTURES",
    "synthetic_ground_truth requires fixture_meta.labels_path": "LABELS_PATH_REQUIRED",
    "upload exceeds size limit": "UPLOAD_TOO_LARGE",
    "Upload exceeds the size limit.": "UPLOAD_TOO_LARGE",
    "no readable DICOM files found in the upload": "NO_DICOM_IN_UPLOAD",
    "No readable DICOM files found in the upload.": "NO_DICOM_IN_UPLOAD",
    "no CT/MR DICOM series found; this build accepts CCTA DICOM only": "NO_CT_SERIES",
    "No CT/MR DICOM series found; this build accepts CCTA DICOM only.": "NO_CT_SERIES",
    "this study has already been uploaded": "STUDY_ALREADY_UPLOADED",
    "This study has already been uploaded.": "STUDY_ALREADY_UPLOADED",
    "no plausible CCTA series with at least 16 slices": "NO_PLAUSIBLE_CCTA",
    "No plausible CCTA series with at least 16 slices.": "NO_PLAUSIBLE_CCTA",
    "zip entry path traversal rejected": "ZIP_TRAVERSAL",
    "Zip entry path traversal was rejected.": "ZIP_TRAVERSAL",
    "zip entry exceeds size limit": "ZIP_ENTRY_TOO_LARGE",
    "A zip entry exceeds the size limit.": "ZIP_ENTRY_TOO_LARGE",
    "zip expands beyond the upload size limit": "ZIP_EXPANDS_TOO_LARGE",
    "The zip expands beyond the upload size limit.": "ZIP_EXPANDS_TOO_LARGE",
    "selected series has fewer than two slices with pixel data": "TOO_FEW_SLICES",
    "The selected series has fewer than two slices with pixel data.": "TOO_FEW_SLICES",
    "inconsistent Rows/Columns within the selected series": "INCONSISTENT_DIMENSIONS",
    "Rows/Columns are inconsistent within the selected series.": "INCONSISTENT_DIMENSIONS",
    "storage path escapes storage root": "STORAGE_ESCAPE",
    "Storage path escapes the storage root.": "STORAGE_ESCAPE",
    "study not found": "STUDY_NOT_FOUND",
    "Study not found.": "STUDY_NOT_FOUND",
    "series not found in this study": "SERIES_NOT_FOUND",
    "Series not found in this study.": "SERIES_NOT_FOUND",
    "job not found": "JOB_NOT_FOUND",
    "Job not found.": "JOB_NOT_FOUND",
    "report not found": "REPORT_NOT_FOUND",
    "Report not found.": "REPORT_NOT_FOUND",
    "volume not found": "VOLUME_NOT_FOUND",
    "Volume not found.": "VOLUME_NOT_FOUND",
    "mesh not found": "MESH_NOT_FOUND",
    "Mesh not found.": "MESH_NOT_FOUND",
    "not found": "NOT_FOUND",
    "Not found.": "NOT_FOUND",
    "no series selected": "NO_SERIES_SELECTED",
    "No series selected.": "NO_SERIES_SELECTED",
    "approved reports must be amended, not overwritten": "APPROVED_IMMUTABLE",
    "Approved reports must be amended, not overwritten.": "APPROVED_IMMUTABLE",
    "volume artifact no longer available": "VOLUME_GONE",
    "Volume artifact is no longer available.": "VOLUME_GONE",
    "mesh artifact no longer available": "MESH_GONE",
    "Mesh artifact is no longer available.": "MESH_GONE",
}

_KNOWN = frozenset(_LEGACY.values()) | frozenset(REASON_BY_MEASUREMENT.values()) | frozenset(
    {
        "INVALID_LANG",
        "INGEST_FAILED",
        "DEMO_FAILED",
        "UNEXPECTED",
        "MISSING_VALIDATED_INPUT",
        "VOLUME_SIZE",
        "VOLUME",
        *LABEL_CODES,
        *STAGE_MESSAGE.values(),
    }
)


def as_coded(value):
    """Return ``{"code", "params"}`` for a stored code.

    An unrecognized string is returned unchanged. That is the compatibility
    fallback for text this server no longer owns. New writes use codes.
    """
    if value is None or isinstance(value, (int, float, bool)):
        return value
    if isinstance(value, list):
        return [as_coded(item) for item in value]
    if isinstance(value, dict):
        code = value.get("code")
        if isinstance(code, str):
            params = value.get("params")
            if not isinstance(params, dict):
                params = {}
            return {"code": code, "params": params}
        return value
    if not isinstance(value, str):
        return value
    if value in _KNOWN:
        return coded(value)
    legacy = _LEGACY.get(value)
    if legacy:
        return coded(legacy)
    if len(value) >= 2 and value[0] == "{" and value[-1] == "}":
        try:
            data = json.loads(value)
        except json.JSONDecodeError:
            return value
        if isinstance(data, dict) and isinstance(data.get("code"), str):
            return as_coded(data)
    return value


def label_coded(measurement_code: str, stored=None):
    """Translate known labels while retaining labels outside this protocol."""
    if measurement_code in LABEL_CODES and measurement_code != "VOLUME":
        return coded(measurement_code)
    if measurement_code.endswith("_VOLUME"):
        return coded("VOLUME", code=measurement_code[: -len("_VOLUME")])
    return as_coded(stored) if stored else measurement_code


def reason_coded(measurement_code: str, status: str, stored: str | None):
    # The recorded failure is authoritative, including new coronary/atlas errors.
    # A generic reason inferred from the measurement code must not replace it.
    if stored:
        return as_coded(stored)
    if status != "not_computed":
        return None
    mapped = REASON_BY_MEASUREMENT.get(measurement_code)
    if mapped:
        return coded(mapped)
    return None


def require_lang(value: str | None) -> str:
    """``en`` or ``zh``. Missing means English. Anything else is INVALID_LANG."""
    if value is None:
        return "en"
    if value in ("en", "zh"):
        return value
    raise CodedError("INVALID_LANG", status_code=400, lang=value)
