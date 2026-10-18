from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Measurement, Study
from ..reporting import template_report

PROMPT_VERSION = "report_v1"

SYSTEM_PROMPT = """你是 CardioScope Pro 研究原型的结构化报告助手。
你只能使用用户提供的结构化事实，不得编造测量值、诊断、治疗建议、概率或患者信息。
每条陈述必须引用一个或多个 measurement ID（evidence_refs）。
不要把 not_computed 的项目写成数值；只能在 limitations 中说明原因。
不要输出患者姓名；只使用 pseudonym。
输出中文（zh-CN）。
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
                "value": item.value,
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

    client = Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=2200,
        temperature=0.2,
        system=SYSTEM_PROMPT,
        tools=[REPORT_TOOL],
        tool_choice={"type": "tool", "name": "submit_report"},
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


NUMBER_RE = re.compile(r"(?<![A-Za-z])(-?\d+(?:\.\d+)?)(?![\d.])")


def _numeric_guardrail(content: dict, measurements: list[Measurement]) -> list[str]:
    by_id = {item.id: item for item in measurements}
    flagged = []
    for section in content.get("sections", []):
        for claim in section.get("claims", []):
            refs = claim.get("evidence_refs") or []
            allowed = []
            for ref in refs:
                item = by_id.get(ref)
                if item and item.value is not None:
                    allowed.append(float(item.value))
            for match in NUMBER_RE.findall(claim.get("text", "")):
                number = float(match)
                if not allowed:
                    claim["status"] = "needs_review"
                    flagged.append(claim.get("id"))
                    break
                if not any(abs(number - value) <= max(0.5, abs(value) * 0.02) for value in allowed):
                    claim["status"] = "needs_review"
                    flagged.append(claim.get("id"))
                    break
    return flagged


def _build_content(study: Study, tool: dict[str, Any], model: str, measurements: list[Measurement]) -> dict:
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
            "title": "检查摘要",
            "claims": [
                {
                    "id": "c_summary",
                    "text": tool.get("summary", ""),
                    "type": "summary",
                    "evidence_refs": [],
                }
            ],
        },
        {"id": "findings", "title": "影像所见", "claims": findings},
        {"id": "limitations", "title": "局限与未计算项", "claims": limitations},
    ]
    content = {
        "schema_version": "report/v1",
        "study_id": study.id,
        "status": "draft",
        "language": "zh-CN",
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
            "AI 辅助草稿：仅对结构化测量进行语言化，所有数值需医生逐条核对。",
            "研究原型，不可用于临床诊断或治疗决策。",
        ],
        "disclaimer": "Research prototype. AI-generated draft. Not for clinical diagnosis or treatment decisions.",
        "provenance": {
            "generator": "claude",
            "model": model,
            "prompt_version": PROMPT_VERSION,
            "measurement_ids": [item.id for item in measurements],
        },
    }
    flagged = _numeric_guardrail(content, measurements)
    if flagged:
        content["limitations"].append(
            f"有 {len(flagged)} 条陈述的数字未能与引用测量对应，已标记为待复核。"
        )
    return content


def generate_report_draft(db: Session, study: Study) -> tuple[dict, str, str | None]:
    measurements = list(
        db.scalars(select(Measurement).where(Measurement.study_id == study.id)).all()
    )
    if not settings.anthropic_api_key:
        content = template_report(study, measurements)
        content["provenance"]["fallback_reason"] = "ANTHROPIC_API_KEY is not configured; template used."
        return content, "template", None
    try:
        facts = build_facts(study, measurements)
        tool = _call_claude(facts)
        content = _build_content(study, tool, settings.anthropic_model, measurements)
        return content, "claude", settings.anthropic_model
    except Exception as exc:  # noqa: BLE001
        content = template_report(study, measurements)
        content["provenance"]["fallback_reason"] = f"Claude draft failed: {str(exc)[:200]}"
        return content, "template", None
