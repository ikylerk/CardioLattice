import React from 'react'
import { CheckCircle2, CircleAlert, FileSignature, ShieldCheck } from 'lucide-react'
import { Badge, Button } from '../ui.jsx'
import { enumLabel, useI18n } from '../../i18n.js'

function generatorLabel(report, t) {
  if (report.generator === 'claude') return t('report.aiDraft', { model: report.model || 'Claude' })
  if (report.generator === 'human') return t('report.human')
  return t('report.template')
}

function citationLabel(ref, measurementMap) {
  const item = measurementMap[ref]
  return item ? item.label : ref
}

export default function StructuredReport({ report, study, onApprove, approveBusy }) {
  const { t } = useI18n()
  if (!report) {
    return (
      <div className="report-empty">
        <CircleAlert size={22} />
        <b>{t('report.emptyTitle')}</b>
        <span>{t('report.emptyBody')}</span>
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
          <em>{enumLabel('status', report.status)} · {generatorLabel(report, t)}</em>
        </div>
      </div>

      <div className="report-title">
        <span className="report-title-kicker">RESEARCH STRUCTURED REPORT</span>
        <h1>{t('report.docTitle')}</h1>
        <p>{studyMeta.description || 'CCTA'} · {studyMeta.modalities?.join(' / ') || studyMeta.modalities || '—'}</p>
      </div>

      <div className="report-patient">
        <div><span>{t('report.subject')}</span><b>{subject.pseudonym || '—'}</b></div>
        <div><span>{t('report.sexAge')}</span><b>{subject.sex || '—'} / {subject.age_years ?? '—'}</b></div>
        <div><span>{t('report.studyDate')}</span><b>{studyMeta.date || '—'}</b></div>
        <div><span>{t('report.dataSource')}</span><b>{studyMeta.source || '—'}</b></div>
        <div><span>{t('report.reportStatus')}</span><b>{enumLabel('status', report.status)}</b></div>
        <div><span>{t('report.generator')}</span><b>{generatorLabel(report, t)}</b></div>
      </div>

      {isAi ? (
        <div className="report-ai-banner">
          <CircleAlert size={13} />
          {t('report.aiBanner')}
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
          {!section.claims?.length ? <p className="report-muted">{t('report.emptySection')}</p> : null}
        </section>
      ))}

      {content.impression?.length ? (
        <section className="report-section report-conclusion">
          <h2><span>{String(sections.length + 1).padStart(2, '0')}</span> {t('report.impression')}</h2>
          <ol>
            {content.impression.map((item) => (
              <li key={item.id}>
                {item.text}
                {item.status === 'research_only' ? <Badge tone="amber">{t('common.research')}</Badge> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {content.recommendations?.length ? (
        <section className="report-section">
          <h2><span>{String(sections.length + 2).padStart(2, '0')}</span> {t('report.recommendations')}</h2>
          <ul className="report-recommendations">
            {content.recommendations.map((item) => <li key={item.id}>{item.text}</li>)}
          </ul>
        </section>
      ) : null}

      {content.limitations?.length ? (
        <section className="report-section">
          <h2>{t('report.limitations')}</h2>
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
            {t('report.provenance', {
              generator: report.generator,
              model: report.model || '—',
              prompt: report.promptVersion || '—',
              count: (content.provenance?.measurement_ids || []).length,
            })}
          </span>
        </div>
      </div>

      <div className={`report-approval ${isApproved ? 'approved' : ''}`}>
        {isApproved ? (
          <>
            <CheckCircle2 size={15} />
            <div>
              <b>{t('report.approved')}</b>
              <span>{report.approvedBy || '—'} · {report.approvedAt ? new Date(report.approvedAt).toLocaleString() : '—'}</span>
            </div>
          </>
        ) : (
          <>
            <FileSignature size={15} />
            <div>
              <b>{t('report.pending')}</b>
              <span>{t('report.pendingHint')}</span>
            </div>
            <Button variant="primary" size="sm" onClick={onApprove} disabled={approveBusy}>
              {approveBusy ? t('report.approving') : t('report.approve')}
            </Button>
          </>
        )}
      </div>

      <div className="report-disclaimer">
        <CircleAlert size={12} />
        <p>
          {content.disclaimer || t('disclaimer.body')}
        </p>
      </div>
      <div className="report-pagefoot">
        <span>CardioScope Pro · Research Prototype</span>
        <span>PAGE 1 / 1 · NOT FOR CLINICAL USE</span>
      </div>
    </article>
  )
}
