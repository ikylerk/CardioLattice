from __future__ import annotations

from .models import Measurement, Study

# Sentence-by-sentence with the original Chinese banner in README (main):
# 研究原型，不是医疗器械。
# 本项目未取得 NMPA / FDA / CE 认证，输出不得用于临床诊断、治疗决策或医疗法律用途。
# 演示模式中的数据全部为程序化合成数据。
DISCLAIMER_EN = (
    "Research prototype, not a medical device. "
    "This project is not certified by NMPA / FDA / CE, and outputs must not be used "
    "for clinical diagnosis, treatment decisions, or medico-legal purposes. "
    "All data in demo mode is procedurally synthesized."
)
DISCLAIMER_ZH = (
    "研究原型，不是医疗器械。"
    "本项目未取得 NMPA / FDA / CE 认证，输出不得用于临床诊断、治疗决策或医疗法律用途。"
    "演示模式中的数据全部为程序化合成数据。"
)

_LABELS = {
    "en": {
        "LV_VOLUME": "Left ventricular cavity volume (acquired phase)",
        "RV_VOLUME": "Right ventricular cavity volume (acquired phase)",
        "LA_VOLUME": "Left atrial cavity volume (acquired phase)",
        "RA_VOLUME": "Right atrial cavity volume (acquired phase)",
        "LV_EF": "Left ventricular ejection fraction (EF)",
        "STENOSIS_LAD": "LAD stenosis severity",
        "FFR_CT": "FFR-CT",
        "CALCIUM_SCORE": "Agatston calcium score",
        "AHA_SEGMENTS": "AHA 17-segment perfusion / viability",
    },
    "zh": {
        "LV_VOLUME": "左心室腔容积（采集时相）",
        "RV_VOLUME": "右心室腔容积（采集时相）",
        "LA_VOLUME": "左心房腔容积（采集时相）",
        "RA_VOLUME": "右心房腔容积（采集时相）",
        "LV_EF": "左心室射血分数（EF）",
        "STENOSIS_LAD": "LAD 狭窄程度",
        "FFR_CT": "FFR-CT",
        "CALCIUM_SCORE": "Agatston 钙化积分",
        "AHA_SEGMENTS": "AHA 17 段灌注/存活心肌",
    },
}

_REASONS = {
    "en": {
        "LV_EF": "Requires end-diastolic and end-systolic phases; it cannot be computed from a single-phase CTA.",
        "STENOSIS_LAD": "No validated coronary lumen or stenosis model is connected.",
        "FFR_CT": "Requires a validated CFD or hemodynamic model.",
        "CALCIUM_SCORE": "Requires a non-contrast calcium-scoring series.",
        "AHA_SEGMENTS": "Perfusion or myocardial viability cannot be inferred from CTA alone.",
        "MISSING": "Validated input or a validated model is missing.",
    },
    "zh": {
        "LV_EF": "需要舒张末期与收缩末期两个时相；单时相 CTA 不可计算。",
        "STENOSIS_LAD": "尚未接入经过验证的冠脉管腔/狭窄模型。",
        "FFR_CT": "需要经过验证的 CFD 或血流动力学模型。",
        "CALCIUM_SCORE": "需要非增强钙化扫描序列。",
        "AHA_SEGMENTS": "仅凭 CTA 不能推断灌注或存活心肌。",
        "MISSING": "缺少已验证的输入或模型。",
    },
}

_TEXT = {
    "en": {
        "section.summary": "Study summary",
        "section.measurements": "Quantitative measurements",
        "section.limitations": "Limitations and items not computed",
        "claim.study_type": "Study type: {description}; source: {source}.",
        "claim.demo_fixture": "This study is a procedurally synthesized DICOM fixture used to verify the imaging pipeline. It does not represent a real patient.",
        "claim.measurement": "{label}: {value}{unit} ({method}).",
        "claim.not_computed": "{label} was not computed: {reason}",
        "label.volume": "{code} volume",
        "impression": "This is research-prototype output and includes only measurements that can be determined from the segmentation mask. Stenosis, FFR-CT, and single-phase EF are not provided.",
        "recommendation": "If a functional or hemodynamic assessment is required, obtain the appropriate study. Every result must be reviewed by a physician.",
        "limitation.prototype": "Research prototype. Not a basis for clinical diagnosis.",
        "limitation.no_lumen_model": "No validated coronary lumen or stenosis model is connected.",
        "limitation.single_phase": "Ejection fraction (EF) and stroke volume (SV) cannot be computed from a single-phase CTA.",
    },
    "zh": {
        "section.summary": "检查摘要",
        "section.measurements": "定量测量",
        "section.limitations": "局限与未计算项",
        "claim.study_type": "检查类型：{description}；数据来源：{source}。",
        "claim.demo_fixture": "本检查为程序化合成的 DICOM 夹具，用于验证影像处理链路，不代表真实患者。",
        "claim.measurement": "{label}：{value}{unit}（{method}）。",
        "claim.not_computed": "{label}未计算：{reason}",
        "label.volume": "{code} 容积",
        "impression": "当前为研究原型输出，仅包含可由分割掩膜确定的测量；未提供狭窄、FFR-CT 或基于单时相的 EF。",
        "recommendation": "如需功能或血流动力学评估，请补充相应检查；所有结果需由医生复核。",
        "limitation.prototype": "研究原型，非临床诊断依据。",
        "limitation.no_lumen_model": "未接入经过验证的冠脉管腔/狭窄模型。",
        "limitation.single_phase": "单时相 CTA 不能计算 EF/SV。",
    },
}


def disclaimer(lang: str) -> str:
    if lang == "zh":
        return DISCLAIMER_ZH
    return DISCLAIMER_EN


def _text(lang: str, key: str, **params) -> str:
    template = _TEXT[lang][key]
    if params:
        return template.format(**params)
    return template


def _label_text(lang: str, code: str) -> str:
    known = _LABELS[lang].get(code)
    if known:
        return known
    if code.endswith("_VOLUME"):
        return _text(lang, "label.volume", code=code[: -len("_VOLUME")])
    return code


def _reason_text(lang: str, code: str) -> str:
    return _REASONS[lang].get(code, _REASONS[lang]["MISSING"])


def template_report(study: Study, measurements: list[Measurement], lang: str) -> dict:
    """Deterministic report. Written once in ``lang`` and stored as-is.

    ``lang`` is ``en`` or ``zh``. Later reads do not translate this document.
    """
    if lang not in ("en", "zh"):
        lang = "en"
    subject = study.subject
    computed = [item for item in measurements if item.status == "computed" and item.value is not None]
    unavailable = [item for item in measurements if item.status != "computed"]

    summary_claims = [
        {
            "id": "c_summary_1",
            "text": _text(
                lang,
                "claim.study_type",
                description=study.description or study.modality,
                source=study.source,
            ),
            "type": "study_fact",
            "evidence_refs": [],
        }
    ]
    if study.source == "demo":
        summary_claims.append(
            {
                "id": "c_summary_2",
                "text": _text(lang, "claim.demo_fixture"),
                "type": "limitation",
                "evidence_refs": [],
            }
        )

    measurement_claims = []
    for index, item in enumerate(computed, start=1):
        unit = f" {item.unit}" if item.unit else ""
        measurement_claims.append(
            {
                "id": f"c_measure_{index}",
                "text": _text(
                    lang,
                    "claim.measurement",
                    label=_label_text(lang, item.code),
                    value=f"{item.value:.2f}",
                    unit=unit,
                    method=item.method,
                ),
                "type": "observation",
                "evidence_refs": [item.id],
            }
        )

    limitation_claims = []
    for index, item in enumerate(unavailable, start=1):
        limitation_claims.append(
            {
                "id": f"c_limitation_{index}",
                "text": _text(
                    lang,
                    "claim.not_computed",
                    label=_label_text(lang, item.code),
                    reason=_reason_text(lang, item.code),
                ),
                "type": "limitation",
                "evidence_refs": [item.id],
            }
        )

    sections = [
        {"id": "summary", "title": _text(lang, "section.summary"), "claims": summary_claims},
        {"id": "measurements", "title": _text(lang, "section.measurements"), "claims": measurement_claims},
        {"id": "limitations", "title": _text(lang, "section.limitations"), "claims": limitation_claims},
    ]

    return {
        "schema_version": "report/v1",
        "study_id": study.id,
        "status": "draft",
        "language": lang,
        "subject": {
            "pseudonym": subject.pseudonym if subject else None,
            "sex": subject.sex if subject else None,
            "age_years": subject.age_years if subject else None,
        },
        "study": {
            "date": study.study_date,
            "modalities": [study.modality],
            "description": study.description,
            "source": study.source,
        },
        "sections": sections,
        "impression": [
            {
                "id": "i1",
                "text": _text(lang, "impression"),
                "evidence_refs": [],
                "status": "research_only",
            }
        ],
        "recommendations": [
            {
                "id": "r1",
                "text": _text(lang, "recommendation"),
                "category": "research_follow_up",
                "evidence_refs": [],
            }
        ],
        "limitations": [
            _text(lang, "limitation.prototype"),
            _text(lang, "limitation.no_lumen_model"),
            _text(lang, "limitation.single_phase"),
        ],
        "disclaimer": disclaimer(lang),
        "provenance": {
            "generator": "template",
            "model": None,
            "prompt_version": "report_v1",
            "measurement_ids": [item.id for item in measurements],
            "language": lang,
        },
    }
