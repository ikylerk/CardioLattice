from __future__ import annotations

from .i18n import (
    contains_cjk,
    disclaimer,
    measurement_label,
    measurement_reason,
    normalize_lang,
    t,
)
from .models import Measurement, Study


def annotate_report_language(content: dict) -> dict:
    """Return report content for an API response without rewriting stored text.

    Documents that already record ``language`` are returned as stored, including
    legacy Chinese reports tagged ``zh-CN``. A legacy document with no language
    is copied and marked; the database row is left untouched.
    """
    if not isinstance(content, dict):
        return content
    if content.get("language"):
        return content
    marked = dict(content)
    blob = _flatten_text(content)
    marked["language"] = "zh-CN" if contains_cjk(blob) else "en"
    return marked


def _flatten_text(value) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(_flatten_text(item) for item in value.values())
    if isinstance(value, list):
        return " ".join(_flatten_text(item) for item in value)
    return ""


def template_report(study: Study, measurements: list[Measurement], language: str | None = None) -> dict:
    """Deterministic report fallback. Every claim references a measurement or a
    study fact; no value is invented.

    ``language`` is the request language at generation time. The resulting
    document is stored as-is and is not translated on later reads.
    """
    lang = normalize_lang(language)
    subject = study.subject
    computed = [item for item in measurements if item.status == "computed" and item.value is not None]
    unavailable = [item for item in measurements if item.status != "computed"]

    summary_claims = [
        {
            "id": "c_summary_1",
            "text": t(
                "report.claim.study_type",
                lang,
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
                "text": t("report.claim.demo_fixture", lang),
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
                "text": t(
                    "report.claim.measurement",
                    lang,
                    label=measurement_label(item.code, lang, item.label),
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
        reason = measurement_reason(item.code, lang, item.reason) or t("measurement.missing_reason", lang)
        limitation_claims.append(
            {
                "id": f"c_limitation_{index}",
                "text": t(
                    "report.claim.not_computed",
                    lang,
                    label=measurement_label(item.code, lang, item.label),
                    reason=reason,
                ),
                "type": "limitation",
                "evidence_refs": [item.id],
            }
        )

    sections = [
        {"id": "summary", "title": t("report.section.summary", lang), "claims": summary_claims},
        {"id": "measurements", "title": t("report.section.measurements", lang), "claims": measurement_claims},
        {"id": "limitations", "title": t("report.section.limitations", lang), "claims": limitation_claims},
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
                "text": t("report.impression", lang),
                "evidence_refs": [],
                "status": "research_only",
            }
        ],
        "recommendations": [
            {
                "id": "r1",
                "text": t("report.recommendation", lang),
                "category": "research_follow_up",
                "evidence_refs": [],
            }
        ],
        "limitations": [
            t("report.limitation.prototype", lang),
            t("report.limitation.no_lumen_model", lang),
            t("report.limitation.single_phase", lang),
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
