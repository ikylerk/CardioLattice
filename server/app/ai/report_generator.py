from __future__ import annotations

import json
import math
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Measurement, Study
from ..reporting import disclaimer, template_report

PROMPT_VERSION = "report_v2"

SYSTEM_PROMPT = """你是 CardioScope Pro 研究原型的结构化报告助手。
你只能使用用户提供的结构化事实，不得编造测量值、诊断、治疗建议、概率或患者信息。
每条陈述必须引用一个或多个 measurement ID（evidence_refs）。
不要把 not_computed 的项目写成数值；只能在 limitations 中说明原因。
不要输出患者姓名；只使用 pseudonym。
按照 report_language 指定的语言输出（en 英语，zh 简体中文）。
必须通过 submit_report 工具返回结果，不要输出自由文本。
"""

REPORT_TOOL = {
    "name": "submit_report",
    "description": "Submit a structured research report draft. Every claim must cite measurement IDs.",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "description": "检查摘要，1-3 句。"},
            "findings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                        "evidence_refs": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["text", "evidence_refs"],
                },
            },
            "impression": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                        "evidence_refs": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["text", "evidence_refs"],
                },
            },
            "recommendations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                        "evidence_refs": {"type": "array", "items": {"type": "string"}},
                        "category": {"type": "string"},
                    },
                    "required": ["text", "evidence_refs", "category"],
                },
            },
            "limitations": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["summary", "findings", "impression", "recommendations", "limitations"],
    },
}


def build_facts(study: Study, measurements: list[Measurement]) -> dict[str, Any]:
    subject = study.subject
    return {
        "study": {
            "id": study.id,
            "date": study.study_date,
            "description": study.description,
            "modality": study.modality,
            "source": study.source,
        },
        "subject": {
            "pseudonym": subject.pseudonym if subject else None,
            "sex": subject.sex if subject else None,
            "age_years": subject.age_years if subject else None,
        },
        "measurements": [
            {
                "id": item.id,
                "code": item.code,
                "label": item.label,
                "value": item.value if item.status == "computed" else None,
                "unit": item.unit,
                "method": item.method,
                "source": item.source,
                "validation_status": item.validation_status,
                "status": item.status,
                "reason": item.reason,
            }
            for item in measurements
        ],
        "rules": [
            "Only cite measurement IDs listed above.",
            "Do not diagnose or recommend treatment.",
            "not_computed measurements have no value; mention only as limitations.",
        ],
    }


def _call_claude(facts: dict[str, Any]) -> dict[str, Any]:
    from anthropic import Anthropic

    client = Anthropic(api_key=settings.anthropic_api_key, timeout=45.0, max_retries=1)
    response = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=2200,
        system=SYSTEM_PROMPT,
        tools=[REPORT_TOOL],
        # Sonnet 5.5 rejects forced tool use; the response is still validated locally.
        tool_choice={"type": "auto"},
        messages=[
            {
                "role": "user",
                "content": json.dumps(facts, ensure_ascii=False),
            }
        ],
    )
    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == "submit_report":
            return dict(block.input)
    raise ValueError("Claude did not return a submit_report tool call")


def _validate_tool(tool: Any, measurements: list[Measurement]) -> dict:
    """Validate the returned data locally; a tool schema is not validation."""
    required = {"summary", "findings", "impression", "recommendations", "limitations"}
    if not isinstance(tool, dict) or set(tool) != required:
        raise ValueError("invalid report schema")
    if not isinstance(tool["summary"], str) or not tool["summary"].strip():
        raise ValueError("invalid summary")
    if not isinstance(tool["limitations"], list) or any(
        not isinstance(item, str) or not item.strip() for item in tool["limitations"]
    ):
        raise ValueError("invalid limitations")
    by_id = {item.id: item for item in measurements}
    for key in ("findings", "impression", "recommendations"):
        if not isinstance(tool[key], list):
            raise ValueError("invalid claim list")
        for claim in tool[key]:
            expected = {"text", "evidence_refs"} | ({"category"} if key == "recommendations" else set())
            if not isinstance(claim, dict) or set(claim) != expected:
                raise ValueError("invalid claim schema")
            if not isinstance(claim["text"], str) or not claim["text"].strip():
                raise ValueError("invalid claim text")
            refs = claim["evidence_refs"]
            if not isinstance(refs, list) or not refs or any(
                not isinstance(ref, str) or ref not in by_id for ref in refs
            ):
                raise ValueError("claim must cite known measurements")
            if any(by_id[ref].status != "computed" or by_id[ref].value is None for ref in refs):
                raise ValueError("unavailable measurements belong only in limitations")
            if key == "recommendations" and claim["category"] != "research_follow_up":
                raise ValueError("unsupported recommendation category")
    return tool


NUMBER_RE = re.compile(r"(?<![A-Za-z\d.])[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?(?![\d.])")


def _numeric_guardrail(content: dict, measurements: list[Measurement]) -> list[str]:
    by_id = {item.id: item for item in measurements}
    flagged = []
    claims = [
        claim for section in content.get("sections", []) for claim in section.get("claims", [])
    ] + content.get("impression", []) + content.get("recommendations", [])
    for claim in claims:
        refs = claim.get("evidence_refs") or []
        allowed = [
            float(by_id[ref].value) for ref in refs
            if ref in by_id and by_id[ref].status == "computed" and by_id[ref].value is not None
            and math.isfinite(float(by_id[ref].value))
        ]
        for match in NUMBER_RE.findall(claim.get("text", "")):
            number = float(match)
            # Permit rounding to two decimal places, not broad 2%/0.5-unit
            # deviations that can change small measurements substantially.
            if not math.isfinite(number) or not any(
                abs(number - value) <= max(0.00501, abs(value) * 1e-9) for value in allowed
            ):
                claim["status"] = "needs_review"
                flagged.append(claim["id"])
                break
    return flagged


def _build_content(study: Study, tool: dict[str, Any], model: str, measurements: list[Measurement], lang: str = "zh") -> dict:
    subject = study.subject
    findings = []
    for index, item in enumerate(tool.get("findings", []), start=1):
        findings.append(
            {
                "id": f"c_finding_{index}",
                "text": item.get("text", ""),
                "type": "observation",
                "evidence_refs": item.get("evidence_refs", []),
            }
        )
    limitations = [
        {
            "id": f"c_limitation_{index}",
            "text": text,
            "type": "limitation",
            "evidence_refs": [],
        }
        for index, text in enumerate(tool.get("limitations", []), start=1)
    ]
    sections = [
        {
            "id": "summary",
            "title": "检查摘要" if lang == "zh" else "Study summary",
            "claims": [
                {
                    "id": "c_summary",
                    "text": tool.get("summary", ""),
                    "type": "summary",
                    "evidence_refs": [],
                }
            ],
        },
        {"id": "findings", "title": "影像所见" if lang == "zh" else "Findings", "claims": findings},
        {"id": "limitations", "title": "局限与未计算项" if lang == "zh" else "Limitations and items not computed", "claims": limitations},
    ]
    content = {
        "schema_version": "report/v1",
        "study_id": study.id,
        "status": "draft",
        "lang": lang,
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
                "id": f"i_{index}",
                "text": item.get("text", ""),
                "evidence_refs": item.get("evidence_refs", []),
                "status": "research_only",
            }
            for index, item in enumerate(tool.get("impression", []), start=1)
        ],
        "recommendations": [
            {
                "id": f"r_{index}",
                "text": item.get("text", ""),
                "category": item.get("category", "research_follow_up"),
                "evidence_refs": item.get("evidence_refs", []),
            }
            for index, item in enumerate(tool.get("recommendations", []), start=1)
        ],
        "limitations": [
            ("AI 辅助草稿：仅对结构化测量进行语言化，所有数值需医生逐条核对。" if lang == "zh" else "AI-assisted draft based only on structured measurements. A physician must verify every value."),
            ("研究原型，不可用于临床诊断或治疗决策。" if lang == "zh" else "Research prototype. Not for clinical diagnosis or treatment decisions."),
        ],
        "disclaimer": disclaimer(lang),
        "provenance": {
            "generator": "claude",
            "lang": lang,
            "model": model,
            "prompt_version": PROMPT_VERSION,
            "measurement_ids": [item.id for item in measurements],
        },
    }
    flagged = _numeric_guardrail(content, measurements)
    content["provenance"]["flagged_claim_ids"] = flagged
    content["provenance"]["evidence_validation"] = "needs_review" if flagged else "references_checked"
    if flagged:
        content["limitations"].append(
            (f"有 {len(flagged)} 条陈述的数字未能与引用测量对应，已标记为待复核。" if lang == "zh" else f"{len(flagged)} claims contain numbers that could not be matched to cited measurements and require review.")
        )
    return content


def generate_report_draft(db: Session, study: Study, lang: str = "zh") -> tuple[dict, str, str | None]:
    measurements = list(
        db.scalars(select(Measurement).where(Measurement.study_id == study.id)).all()
    )
    fallback_code = "not_configured"
    if settings.anthropic_api_key:
        try:
            facts = build_facts(study, measurements)
            facts["report_language"] = lang
            tool = _validate_tool(_call_claude(facts), measurements)
            content = _build_content(study, tool, settings.anthropic_model, measurements, lang)
            content["provenance"]["measurement_snapshot"] = facts["measurements"]
            return content, "claude", settings.anthropic_model
        except Exception:  # Model/schema failures must not leak raw service errors or credentials.
            fallback_code = "generation_or_validation_failed"
    content = template_report(study, measurements, lang)
    content["provenance"]["measurement_snapshot"] = build_facts(study, measurements)["measurements"]
    content["provenance"]["fallback_code"] = fallback_code
    fallback_messages = {
        "zh": {"not_configured": "未配置 AI 服务，已使用确定性模板。", "generation_or_validation_failed": "AI 调用或结果校验失败，已使用确定性模板。"},
        "en": {"not_configured": "AI service is not configured; a deterministic template was used.", "generation_or_validation_failed": "AI generation or validation failed; a deterministic template was used."},
    }
    content["provenance"]["fallback_reason"] = fallback_messages[lang][fallback_code]
    return content, "template", None
