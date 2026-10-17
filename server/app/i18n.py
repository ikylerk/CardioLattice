"""Plain English / Chinese text for human-readable API fields.

No i18n library. Callers pass ``en`` or ``zh`` from the ``Accept-Language``
header. Missing or unrecognized values use English. Enums, codes, field names,
and numbers are not translated here.

Reports are an exception: a draft is written in the request language and that
document is returned unchanged later. See ``reporting.annotate_report_language``.
"""

from __future__ import annotations

import json
import re
from typing import Annotated

from fastapi import Depends, Request

DEFAULT_LANG = "en"
SUPPORTED = ("en", "zh")

# Canonical English disclaimer. Chinese responses repeat this sentence in full
# and then the Chinese sentence. Do not shorten or soften either one.
DISCLAIMER_EN = "Research prototype. Not for clinical diagnosis or treatment decisions."

# Tokens matched against DICOM series descriptions. They are not displayed.
SERIES_DESCRIPTION_KEYWORDS_ZH = ("冠脉", "心脏")

_CJK = re.compile(r"[\u4e00-\u9fff]")
_PLACEHOLDERS = re.compile(r"\{(\w+)\}")

EN: dict[str, str] = {
    "disclaimer.body": DISCLAIMER_EN,
    "error.untranslated": "This message is not available in English.",
    "error.series_no_files": "Selected series has no stored files.",
    "error.no_dicom_for_series": "No DICOM files found for the selected series.",
    "error.no_series_selected_pipeline": "No series selected; choose a CCTA series before running the pipeline.",
    "error.no_labelled_structures": "No labelled structures found; mesh not created.",
    "error.labels_path_required": "synthetic_ground_truth requires fixture_meta.labels_path.",
    "error.upload_too_large": "Upload exceeds the size limit.",
    "error.no_dicom_in_upload": "No readable DICOM files found in the upload.",
    "error.no_ct_series": "No CT/MR DICOM series found; this build accepts CCTA DICOM only.",
    "error.study_already_uploaded": "This study has already been uploaded.",
    "error.no_plausible_ccta": "No plausible CCTA series with at least 16 slices.",
    "error.zip_traversal": "Zip entry path traversal was rejected.",
    "error.zip_entry_too_large": "A zip entry exceeds the size limit.",
    "error.zip_expands_too_large": "The zip expands beyond the upload size limit.",
    "error.volume_size": "Volume byte size {size} does not match dims {dims}.",
    "error.too_few_slices": "The selected series has fewer than two slices with pixel data.",
    "error.inconsistent_dimensions": "Rows/Columns are inconsistent within the selected series.",
    "error.storage_escape": "Storage path escapes the storage root.",
    "http.study_not_found": "Study not found.",
    "http.series_not_found": "Series not found in this study.",
    "http.job_not_found": "Job not found.",
    "http.report_not_found": "Report not found.",
    "http.volume_not_found": "Volume not found.",
    "http.mesh_not_found": "Mesh not found.",
    "http.not_found": "Not found.",
    "http.no_series_selected": "No series selected.",
    "http.approved_immutable": "Approved reports must be amended, not overwritten.",
    "http.volume_gone": "Volume artifact is no longer available.",
    "http.mesh_gone": "Mesh artifact is no longer available.",
    "http.ingest_failed": "Ingest failed: {detail}",
    "http.demo_failed": "Demo fixture failed: {detail}",
    "stage.queued": "Queued",
    "stage.validating": "Validating selected series",
    "stage.anonymizing": "De-identifying and remapping UIDs",
    "stage.building_volume": "Decoding pixels, resampling, and building the preview volume",
    "stage.segmenting": "Segmenting cardiac structures",
    "stage.meshing": "Extracting surfaces and exporting GLB",
    "stage.computing_metrics": "Computing deterministic measurements",
    "stage.drafting_report": "Generating the deterministic report draft",
    "stage.succeeded": "Pipeline completed",
    "stage.failed": "Pipeline failed",
    "series.ct_modality": "CT modality",
    "series.axial_geometry": "Axial geometry",
    "series.thin_slices": "Thin slices",
    "series.cardiac_protocol": "Cardiac protocol description",
    "series.contrast_present": "Contrast agent present",
    "series.enough_slices": "At least 64 slices",
    "series.too_few_slices": "Too few slices",
    "series.excluded_nondiagnostic": "Excluded non-diagnostic series",
    "series.non_ct": "Non-CT series",
    "measurement.LV_VOLUME.label": "Left ventricular cavity volume (acquired phase)",
    "measurement.RV_VOLUME.label": "Right ventricular cavity volume (acquired phase)",
    "measurement.LA_VOLUME.label": "Left atrial cavity volume (acquired phase)",
    "measurement.RA_VOLUME.label": "Right atrial cavity volume (acquired phase)",
    "measurement.volume_fallback.label": "{code} volume",
    "measurement.LV_EF.label": "Left ventricular ejection fraction (EF)",
    "measurement.LV_EF.reason": "Requires end-diastolic and end-systolic phases; it cannot be computed from a single-phase CTA.",
    "measurement.STENOSIS_LAD.label": "LAD stenosis severity",
    "measurement.STENOSIS_LAD.reason": "No validated coronary lumen or stenosis model is connected.",
    "measurement.FFR_CT.label": "FFR-CT",
    "measurement.FFR_CT.reason": "Requires a validated CFD or hemodynamic model.",
    "measurement.CALCIUM_SCORE.label": "Agatston calcium score",
    "measurement.CALCIUM_SCORE.reason": "Requires a non-contrast calcium-scoring series.",
    "measurement.AHA_SEGMENTS.label": "AHA 17-segment perfusion / viability",
    "measurement.AHA_SEGMENTS.reason": "Perfusion or myocardial viability cannot be inferred from CTA alone.",
    "measurement.missing_reason": "Validated input or a validated model is missing.",
    "marker.calcification_synthetic": "Calcified focus (synthetic)",
    "quality.synthetic_ground_truth": "Synthetic ground truth — not a clinical segmentation.",
    "quality.totalsegmentator_research": "Research adapter; not validated for stenosis or FFR.",
    "model.synthetic.intended_use": "Pipeline verification on synthetic fixtures only.",
    "model.synthetic.license": "Generated in-repo.",
    "model.totalseg.intended_use": "Research segmentation; not validated for stenosis or FFR.",
    "model.totalseg.license": "Code is Apache-2.0; task weights require a per-task licence review.",
    "model.lumen.intended_use": "Not configured.",
    "model.lumen.license": "Pending validation and licence review.",
    "note.synthetic_fixture": "Generated from the same phantom definition as the DICOM fixture.",
    "note.glb_scene_units": "GLB coordinates are already in scene units.",
    "report.section.summary": "Study summary",
    "report.section.measurements": "Quantitative measurements",
    "report.section.limitations": "Limitations and items not computed",
    "report.claim.study_type": "Study type: {description}; source: {source}.",
    "report.claim.demo_fixture": "This study is a procedurally synthesized DICOM fixture used to verify the imaging pipeline. It does not represent a real patient.",
    "report.claim.measurement": "{label}: {value}{unit} ({method}).",
    "report.claim.not_computed": "{label} was not computed: {reason}",
    "report.impression": "This is research-prototype output and includes only measurements that can be determined from the segmentation mask. Stenosis, FFR-CT, and single-phase EF are not provided.",
    "report.recommendation": "If a functional or hemodynamic assessment is required, obtain the appropriate study. Every result must be reviewed by a physician.",
    "report.limitation.prototype": "Research prototype. Not a basis for clinical diagnosis.",
    "report.limitation.no_lumen_model": "No validated coronary lumen or stenosis model is connected.",
    "report.limitation.single_phase": "Ejection fraction (EF) and stroke volume (SV) cannot be computed from a single-phase CTA.",
}

ZH: dict[str, str] = {
    "disclaimer.body": "研究原型。不得用于临床诊断或治疗决策。",
    "error.untranslated": "此消息没有可用的英文文本。",
    "error.series_no_files": "所选序列没有已存储的文件。",
    "error.no_dicom_for_series": "未找到所选序列的 DICOM 文件。",
    "error.no_series_selected_pipeline": "未选择序列；运行流水线前请选择 CCTA 序列。",
    "error.no_labelled_structures": "未找到已标注结构；未创建网格。",
    "error.labels_path_required": "合成真值需要 fixture_meta.labels_path。",
    "error.upload_too_large": "上传超过大小限制。",
    "error.no_dicom_in_upload": "上传内容中没有可读的 DICOM 文件。",
    "error.no_ct_series": "未找到 CT/MR DICOM 序列；此版本仅接受 CCTA DICOM。",
    "error.study_already_uploaded": "该检查已上传。",
    "error.no_plausible_ccta": "没有至少 16 层的可用 CCTA 序列。",
    "error.zip_traversal": "已拒绝包含路径穿越的压缩包条目。",
    "error.zip_entry_too_large": "压缩包内的文件超过大小限制。",
    "error.zip_expands_too_large": "压缩包解压后超过上传大小限制。",
    "error.volume_size": "体数据字节数 {size} 与维度 {dims} 不符。",
    "error.too_few_slices": "所选序列中包含像素数据的层数少于两层。",
    "error.inconsistent_dimensions": "所选序列内的 Rows/Columns 不一致。",
    "error.storage_escape": "存储路径超出存储根目录。",
    "http.study_not_found": "未找到该检查。",
    "http.series_not_found": "该检查中未找到此序列。",
    "http.job_not_found": "未找到该任务。",
    "http.report_not_found": "未找到该报告。",
    "http.volume_not_found": "未找到该体数据。",
    "http.mesh_not_found": "未找到该网格。",
    "http.not_found": "未找到。",
    "http.no_series_selected": "未选择序列。",
    "http.approved_immutable": "已批准的报告不能被覆盖，只能另行修订。",
    "http.volume_gone": "体数据文件已不存在。",
    "http.mesh_gone": "网格文件已不存在。",
    "http.ingest_failed": "导入失败：{detail}",
    "http.demo_failed": "合成夹具生成失败：{detail}",
    "stage.queued": "已排队",
    "stage.validating": "正在校验所选序列",
    "stage.anonymizing": "正在去标识并重映射 UID",
    "stage.building_volume": "正在解码像素、重采样并构建预览体数据",
    "stage.segmenting": "正在分割心脏结构",
    "stage.meshing": "正在提取表面并导出 GLB",
    "stage.computing_metrics": "正在计算确定性测量",
    "stage.drafting_report": "正在生成确定性报告草稿",
    "stage.succeeded": "流水线已完成",
    "stage.failed": "流水线失败",
    "series.ct_modality": "CT 模态",
    "series.axial_geometry": "轴位几何",
    "series.thin_slices": "薄层",
    "series.cardiac_protocol": "心脏协议描述",
    "series.contrast_present": "存在对比剂",
    "series.enough_slices": "不少于 64 层",
    "series.too_few_slices": "层数过少",
    "series.excluded_nondiagnostic": "已排除的非诊断序列",
    "series.non_ct": "非 CT 序列",
    "measurement.LV_VOLUME.label": "左心室腔容积（采集时相）",
    "measurement.RV_VOLUME.label": "右心室腔容积（采集时相）",
    "measurement.LA_VOLUME.label": "左心房腔容积（采集时相）",
    "measurement.RA_VOLUME.label": "右心房腔容积（采集时相）",
    "measurement.volume_fallback.label": "{code} 容积",
    "measurement.LV_EF.label": "左心室射血分数（EF）",
    "measurement.LV_EF.reason": "需要舒张末期与收缩末期两个时相；单时相 CTA 不可计算。",
    "measurement.STENOSIS_LAD.label": "LAD 狭窄程度",
    "measurement.STENOSIS_LAD.reason": "尚未接入经过验证的冠脉管腔/狭窄模型。",
    "measurement.FFR_CT.label": "FFR-CT",
    "measurement.FFR_CT.reason": "需要经过验证的 CFD 或血流动力学模型。",
    "measurement.CALCIUM_SCORE.label": "Agatston 钙化积分",
    "measurement.CALCIUM_SCORE.reason": "需要非增强钙化扫描序列。",
    "measurement.AHA_SEGMENTS.label": "AHA 17 段灌注/存活心肌",
    "measurement.AHA_SEGMENTS.reason": "仅凭 CTA 不能推断灌注或存活心肌。",
    "measurement.missing_reason": "缺少已验证的输入或模型。",
    "marker.calcification_synthetic": "钙化灶（合成）",
    "quality.synthetic_ground_truth": "合成真值，不是临床分割。",
    "quality.totalsegmentator_research": "研究用适配器；未针对狭窄或 FFR 进行验证。",
    "model.synthetic.intended_use": "仅用于在合成夹具上验证流水线。",
    "model.synthetic.license": "由本仓库生成。",
    "model.totalseg.intended_use": "研究用分割；未针对狭窄或 FFR 进行验证。",
    "model.totalseg.license": "代码为 Apache-2.0；任务权重需按任务核对许可。",
    "model.lumen.intended_use": "未配置。",
    "model.lumen.license": "尚待验证与许可核对。",
    "note.synthetic_fixture": "由与该 DICOM 夹具相同的体模定义生成。",
    "note.glb_scene_units": "GLB 坐标已经是场景单位。",
    "report.section.summary": "检查摘要",
    "report.section.measurements": "定量测量",
    "report.section.limitations": "局限与未计算项",
    "report.claim.study_type": "检查类型：{description}；数据来源：{source}。",
    "report.claim.demo_fixture": "本检查为程序化合成的 DICOM 夹具，用于验证影像处理链路，不代表真实患者。",
    "report.claim.measurement": "{label}：{value}{unit}（{method}）。",
    "report.claim.not_computed": "{label}未计算：{reason}",
    "report.impression": "当前为研究原型输出，仅包含可由分割掩膜确定的测量；未提供狭窄、FFR-CT 或基于单时相的 EF。",
    "report.recommendation": "如需功能或血流动力学评估，请补充相应检查；所有结果需由医生复核。",
    "report.limitation.prototype": "研究原型，非临床诊断依据。",
    "report.limitation.no_lumen_model": "未接入经过验证的冠脉管腔/狭窄模型。",
    "report.limitation.single_phase": "单时相 CTA 不能计算 EF/SV。",
}


def _catalogs_match() -> None:
    if set(EN) != set(ZH):
        missing = sorted(set(EN) - set(ZH))
        extra = sorted(set(ZH) - set(EN))
        raise RuntimeError(f"locale key mismatch missing={missing} extra={extra}")
    for key in EN:
        if set(_PLACEHOLDERS.findall(EN[key])) != set(_PLACEHOLDERS.findall(ZH[key])):
            raise RuntimeError(f"locale placeholders differ for {key}")


_catalogs_match()

# Exact legacy sentences -> key, so older rows can be shown in the request language
# without rewriting the stored report document.
_REVERSE: dict[str, str] = {}
for _catalog in (ZH, EN):
    for _key, _text in _catalog.items():
        _REVERSE[_text] = _key
_REVERSE.update(
    {
        "upload exceeds size limit": "error.upload_too_large",
        "no readable DICOM files found in the upload": "error.no_dicom_in_upload",
        "no CT/MR DICOM series found; this build accepts CCTA DICOM only": "error.no_ct_series",
        "this study has already been uploaded": "error.study_already_uploaded",
        "no plausible CCTA series with at least 16 slices": "error.no_plausible_ccta",
        "zip entry path traversal rejected": "error.zip_traversal",
        "zip entry exceeds size limit": "error.zip_entry_too_large",
        "zip expands beyond the upload size limit": "error.zip_expands_too_large",
        "selected series has fewer than two slices with pixel data": "error.too_few_slices",
        "inconsistent Rows/Columns within the selected series": "error.inconsistent_dimensions",
        "storage path escapes storage root": "error.storage_escape",
        "selected series has no stored files": "error.series_no_files",
        "no DICOM files found for the selected series": "error.no_dicom_for_series",
        "no series selected; choose a CCTA series before running the pipeline": "error.no_series_selected_pipeline",
        "no labelled structures found; mesh not created": "error.no_labelled_structures",
        "synthetic_ground_truth requires fixture_meta.labels_path": "error.labels_path_required",
        "study not found": "http.study_not_found",
        "series not found in this study": "http.series_not_found",
        "job not found": "http.job_not_found",
        "report not found": "http.report_not_found",
        "volume not found": "http.volume_not_found",
        "mesh not found": "http.mesh_not_found",
        "not found": "http.not_found",
        "no series selected": "http.no_series_selected",
        "approved reports must be amended, not overwritten": "http.approved_immutable",
        "volume artifact no longer available": "http.volume_gone",
        "mesh artifact no longer available": "http.mesh_gone",
        "Queued": "stage.queued",
        "Validating selected series": "stage.validating",
        "De-identifying and remapping UIDs": "stage.anonymizing",
        "Decoding pixels, resampling, building preview volume": "stage.building_volume",
        "Segmenting cardiac structures": "stage.segmenting",
        "Extracting surfaces and exporting GLB": "stage.meshing",
        "Computing deterministic measurements": "stage.computing_metrics",
        "Generating deterministic report draft": "stage.drafting_report",
        "Pipeline completed": "stage.succeeded",
        "Pipeline failed": "stage.failed",
        "axial geometry": "series.axial_geometry",
        "thin slices": "series.thin_slices",
        "cardiac protocol description": "series.cardiac_protocol",
        "contrast agent present": "series.contrast_present",
        ">=64 slices": "series.enough_slices",
        "too few slices": "series.too_few_slices",
        "excluded non-diagnostic series": "series.excluded_nondiagnostic",
        "non-CT series": "series.non_ct",
        "Synthetic ground truth — not a clinical segmentation": "quality.synthetic_ground_truth",
        "Research adapter; not validated for stenosis or FFR.": "quality.totalsegmentator_research",
        "钙化灶（合成）": "marker.calcification_synthetic",
        "左心室腔容积（采集时相）": "measurement.LV_VOLUME.label",
        "右心室腔容积（采集时相）": "measurement.RV_VOLUME.label",
        "左心房腔容积（采集时相）": "measurement.LA_VOLUME.label",
        "右心房腔容积（采集时相）": "measurement.RA_VOLUME.label",
        "左心室射血分数（EF）": "measurement.LV_EF.label",
        "LAD 狭窄程度": "measurement.STENOSIS_LAD.label",
        "Agatston 钙化积分": "measurement.CALCIUM_SCORE.label",
        "AHA 17 段灌注/存活心肌": "measurement.AHA_SEGMENTS.label",
        "需要舒张末期与收缩末期两个时相；单时相 CTA 不可计算。": "measurement.LV_EF.reason",
        "尚未接入经过验证的冠脉管腔/狭窄模型。": "measurement.STENOSIS_LAD.reason",
        "需要经过验证的 CFD 或血流动力学模型。": "measurement.FFR_CT.reason",
        "需要非增强钙化扫描序列。": "measurement.CALCIUM_SCORE.reason",
        "仅凭 CTA 不能推断灌注或存活心肌。": "measurement.AHA_SEGMENTS.reason",
        "缺少已验证的输入或模型。": "measurement.missing_reason",
    }
)


def contains_cjk(value: str) -> bool:
    return bool(_CJK.search(value))


def negotiate(header: str | None) -> str:
    """Return ``zh`` only when the first language range is exactly ``zh``.

    ``en``, a missing header, ``zh-CN``, and any other tag all return ``en``.
    The frontend contract sends ``Accept-Language: en`` or ``zh``.
    """
    if header is None:
        return DEFAULT_LANG
    first = header.split(",")[0].strip().lower()
    if not first:
        return DEFAULT_LANG
    tag = first.split(";")[0].strip()
    if tag == "zh":
        return "zh"
    return DEFAULT_LANG


def normalize_lang(value: str | None) -> str:
    if value == "zh":
        return "zh"
    return DEFAULT_LANG


def t(key: str, lang: str | None = None, **params) -> str:
    language = normalize_lang(lang)
    catalog = ZH if language == "zh" else EN
    template = catalog.get(key) or EN.get(key) or key
    if params:
        return template.format(**params)
    return template


def keyed(key: str, **params) -> str:
    """Stable stored form for a message that includes parameters."""
    if not params:
        return key
    return json.dumps({"k": key, "p": params}, ensure_ascii=False, separators=(",", ":"))


def _unpack(value: str) -> tuple[str, dict] | None:
    if value in EN:
        return value, {}
    if len(value) >= 2 and value[0] == "{" and value[-1] == "}":
        try:
            data = json.loads(value)
        except json.JSONDecodeError:
            return None
        if isinstance(data, dict) and isinstance(data.get("k"), str) and data["k"] in EN:
            params = data.get("p") or {}
            if isinstance(params, dict):
                return data["k"], params
    return None


def present(value: str | None, lang: str | None = None) -> str | None:
    """Localize a stored key or known sentence. Unknown English text passes through.

    Unknown Chinese text is not returned for an English request.
    """
    if value is None:
        return None
    language = normalize_lang(lang)
    unpacked = _unpack(value)
    if unpacked is not None:
        key, params = unpacked
        return t(key, language, **params)
    reverse_key = _REVERSE.get(value)
    if reverse_key:
        return t(reverse_key, language)
    if language == "en" and contains_cjk(value):
        return t("error.untranslated", "en")
    return value


def disclaimer(lang: str | None = None) -> str:
    """English sentence always in full. Chinese requests add the Chinese sentence."""
    if normalize_lang(lang) == "zh":
        return f"{DISCLAIMER_EN}\n{ZH['disclaimer.body']}"
    return DISCLAIMER_EN


def measurement_label(code: str, lang: str | None, stored: str | None = None) -> str:
    key = f"measurement.{code}.label"
    if key in EN:
        return t(key, lang)
    if stored and stored in _REVERSE:
        return t(_REVERSE[stored], lang)
    if normalize_lang(lang) == "en" and stored and contains_cjk(stored):
        return code
    return stored or code


def measurement_reason(code: str, lang: str | None, stored: str | None = None) -> str | None:
    key = f"measurement.{code}.reason"
    if key in EN:
        return t(key, lang)
    if stored is None:
        return None
    if stored in _REVERSE:
        return t(_REVERSE[stored], lang)
    if normalize_lang(lang) == "en" and contains_cjk(stored):
        return t("measurement.missing_reason", "en")
    return stored


def get_language(request: Request) -> str:
    return negotiate(request.headers.get("accept-language"))


Lang = Annotated[str, Depends(get_language)]
