import React from 'react'
import { CheckCircle2, CircleAlert, FileSignature, ShieldCheck } from 'lucide-react'
import { Badge, Button } from '../ui.jsx'

const STATUS_LABEL = {
  draft: '草稿',
  clinician_reviewed: '医生已编辑',
  approved: '已批准',
  amended: '已修订',
}

function generatorLabel(report) {
  if (report.generator === 'claude') return `AI 草稿 · ${report.model || 'Claude'}`
  if (report.generator === 'human') return '医生编辑'
  return '模板生成'
}

function citationLabel(ref, measurementMap) {
  const item = measurementMap[ref]
  return item ? item.label : ref
}

export default function StructuredReport({ report, study, onApprove, approveBusy }) {
  if (!report) {
    return (
      <div className="report-empty">
        <CircleAlert size={22} />
        <b>尚无报告草稿</b>
        <span>运行检查流水线后，服务端会生成一份可追溯的结构化报告草稿。</span>
      </div>
    )
  }
  const content = report.content || {}
  const sections = content.sections || []
  const subject = content.subject || {}
  const studyMeta = content.study || {}
  const measurementMap = Object.fromEntries((study?.measurements || []).map((item) => [item.id, item]))
  const isApproved = report.status === 'approved'
  const isAi = report.generator === 'claude'

  return (
    <article className="report-document structured-report">
      <div className="report-letterhead">
        <div className="report-brand">
          <span>CARDIOVASCULAR IMAGING · RESEARCH</span>
        </div>
        <div className="report-number">
          <span>REPORT NO.</span>
          <b>{report.id.replace(/^rep_/, 'R-').toUpperCase()}</b>
          <em>{STATUS_LABEL[report.status] || report.status} · {generatorLabel(report)}</em>
        </div>
      </div>

      <div className="report-title">
        <span className="report-title-kicker">RESEARCH STRUCTURED REPORT</span>
        <h1>心血管影像结构化报告</h1>
        <p>{studyMeta.description || 'CCTA'} · {studyMeta.modalities?.join(' / ') || studyMeta.modalities || '—'}</p>
      </div>

      <div className="report-patient">
        <div><span>受试者</span><b>{subject.pseudonym || '—'}</b></div>
        <div><span>性别 / 年龄</span><b>{subject.sex || '—'} / {subject.age_years ?? '—'}</b></div>
        <div><span>检查日期</span><b>{studyMeta.date || '—'}</b></div>
        <div><span>数据来源</span><b>{studyMeta.source || '—'}</b></div>
        <div><span>报告状态</span><b>{STATUS_LABEL[report.status] || report.status}</b></div>
        <div><span>生成方式</span><b>{generatorLabel(report)}</b></div>
      </div>

      {isAi ? (
        <div className="report-ai-banner">
          <CircleAlert size={13} />
          AI 生成草稿：仅对结构化测量进行语言化，所有数值需医生逐条核对；未批准前不得作为正式报告。
        </div>
      ) : null}

      {sections.map((section, index) => (
        <section className="report-section" key={section.id || index}>
          <h2><span>{String(index + 1).padStart(2, '0')}</span> {section.title}</h2>
          {(section.claims || []).map((claim) => (
            <div className="report-claim" key={claim.id}>
              <p>{claim.text}</p>
              {(claim.evidence_refs || []).length ? (
                <div className="report-citations">
                  {claim.evidence_refs.map((ref) => (
                    <span key={ref} title={ref}>{citationLabel(ref, measurementMap)}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {!section.claims?.length ? <p className="report-muted">本节无内容。</p> : null}
        </section>
      ))}

      {content.impression?.length ? (
        <section className="report-section report-conclusion">
          <h2><span>{String(sections.length + 1).padStart(2, '0')}</span> 印象</h2>
          <ol>
            {content.impression.map((item) => (
              <li key={item.id}>
                {item.text}
                {item.status === 'research_only' ? <Badge tone="amber">研究</Badge> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {content.recommendations?.length ? (
        <section className="report-section">
          <h2><span>{String(sections.length + 2).padStart(2, '0')}</span> 建议</h2>
          <ul className="report-recommendations">
            {content.recommendations.map((item) => <li key={item.id}>{item.text}</li>)}
          </ul>
        </section>
      ) : null}

      {content.limitations?.length ? (
        <section className="report-section">
          <h2>局限</h2>
          <ul className="report-recommendations">
            {content.limitations.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </section>
      ) : null}

      <div className="report-provenance">
        <ShieldCheck size={13} />
        <div>
          <b>Provenance</b>
          <span>
            生成方式：{report.generator} · 模型：{report.model || '—'} · 模板：{report.promptVersion || '—'} ·
            测量引用：{(content.provenance?.measurement_ids || []).length} 项
          </span>
        </div>
      </div>

      <div className={`report-approval ${isApproved ? 'approved' : ''}`}>
        {isApproved ? (
          <>
            <CheckCircle2 size={15} />
            <div>
              <b>已批准</b>
              <span>{report.approvedBy || '—'} · {report.approvedAt ? new Date(report.approvedAt).toLocaleString() : '—'}</span>
            </div>
          </>
        ) : (
          <>
            <FileSignature size={15} />
            <div>
              <b>待医生复核</b>
              <span>批准后才会标记为最终报告；批准动作写入审计链。</span>
            </div>
            <Button variant="primary" size="sm" onClick={onApprove} disabled={approveBusy}>
              {approveBusy ? '批准中…' : '批准报告'}
            </Button>
          </>
        )}
      </div>

      <div className="report-disclaimer">
        <CircleAlert size={12} />
        <p>
          {content.disclaimer || '研究原型。不可用于临床诊断或治疗决策。'}
        </p>
      </div>
      <div className="report-pagefoot">
        <span>CardioScope Pro · Research Prototype</span>
        <span>PAGE 1 / 1 · NOT FOR CLINICAL USE</span>
      </div>
    </article>
  )
}
