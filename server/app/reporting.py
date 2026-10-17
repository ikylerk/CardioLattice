from __future__ import annotations

from .models import Measurement, Study


def template_report(study: Study, measurements: list[Measurement]) -> dict:
    """Deterministic report fallback. Every claim references a measurement or a
    study fact; no value is invented."""
    subject = study.subject
    computed = [item for item in measurements if item.status == "computed" and item.value is not None]
    unavailable = [item for item in measurements if item.status != "computed"]

    summary_claims = [
        {
            "id": "c_summary_1",
            "text": f"检查类型：{study.description or study.modality}；数据来源：{study.source}。",
            "type": "study_fact",
            "evidence_refs": [],
        }
    ]
    if study.source == "demo":
        summary_claims.append(
            {
                "id": "c_summary_2",
                "text": "本检查为程序化合成的 DICOM 夹具，用于验证影像处理链路，不代表真实患者。",
                "type": "limitation",
                "evidence_refs": [],
            }
        )

    measurement_claims = []
    for index, item in enumerate(computed, start=1):
        measurement_claims.append(
            {
                "id": f"c_measure_{index}",
                "text": f"{item.label}：{item.value:.2f} {item.unit or ''}（{item.method}）。",
                "type": "observation",
                "evidence_refs": [item.id],
            }
        )

    limitation_claims = []
    for index, item in enumerate(unavailable, start=1):
        limitation_claims.append(
            {
                "id": f"c_limitation_{index}",
                "text": f"{item.label}未计算：{item.reason or '缺少已验证的输入或模型。'}",
                "type": "limitation",
                "evidence_refs": [item.id],
            }
        )

    sections = [
        {"id": "summary", "title": "检查摘要", "claims": summary_claims},
        {"id": "measurements", "title": "定量测量", "claims": measurement_claims},
        {"id": "limitations", "title": "局限与未计算项", "claims": limitation_claims},
    ]

    return {
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
                "id": "i1",
                "text": "当前为研究原型输出，仅包含可由分割掩膜确定的测量；未提供狭窄、FFR-CT 或基于单时相的 EF。",
                "evidence_refs": [],
                "status": "research_only",
            }
        ],
        "recommendations": [
            {
                "id": "r1",
                "text": "如需功能或血流动力学评估，请补充相应检查；所有结果需由医生复核。",
                "category": "research_follow_up",
                "evidence_refs": [],
            }
        ],
        "limitations": [
            "研究原型，非临床诊断依据。",
            "未接入经过验证的冠脉管腔/狭窄模型。",
            "单时相 CTA 不能计算 EF/SV。",
        ],
        "disclaimer": "Research prototype. Not for clinical diagnosis or treatment decisions.",
        "provenance": {
            "generator": "template",
            "model": None,
            "prompt_version": "report_v1",
            "measurement_ids": [item.id for item in measurements],
        },
    }
