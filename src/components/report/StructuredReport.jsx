import React from 'react'
import { CheckCircle2, CircleAlert, FileSignature, History, Save, ShieldCheck } from 'lucide-react'
import { Badge, Button } from '../ui.jsx'
import { getReportVersions } from '../../api/reports.js'
import { apiGet, apiPost } from '../../api/client.js'
import { enumLabel, errorDetail, measurementLabel, serverText, t, useI18n } from '../../i18n.js'
import { tReport } from '../../i18n-report.js'
import './report-versions.css'

function generatorLabel(report) {
  if (report.generator === 'claude') return t('report.aiDraft', { model: report.model || 'Claude' })
  if (report.generator === 'human') return t('report.human')
  return t('report.template')
}

function citationLabel(ref, measurementMap) {
  const item = measurementMap[ref]
  return item ? `${measurementLabel(item)}${item.status === 'computed' && item.value != null ? `: ${item.value} ${item.unit || ''}` : tReport('notComputedCitation')}` : ref
}

export default function StructuredReport({ report: incomingReport, study, approveBusy, onRefresh, notify }) {
  const { lang } = useI18n()
  const incomingIdRef = React.useRef(incomingReport?.id)
  incomingIdRef.current = incomingReport?.id
  const [report, setReport] = React.useState(incomingReport)
  const [reviewBase, setReviewBase] = React.useState(null)
  const [reviewBusy, setReviewBusy] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [editedContent, setEditedContent] = React.useState(null)
  React.useEffect(() => {
    setReport(incomingReport)
    setReviewBase(null)
    setEditing(false)
  }, [incomingReport])
  const reportId = report?.id
  const reportVersion = report?.version
  const [versions, setVersions] = React.useState([])
  const [versionsLoading, setVersionsLoading] = React.useState(false)
  const [versionsError, setVersionsError] = React.useState('')
  const [versionsReload, setVersionsReload] = React.useState(0)
  const [amendBusy, setAmendBusy] = React.useState(false)
  const [amendReason, setAmendReason] = React.useState('')

  React.useEffect(() => {
    if (!reportId) {
      setVersions([])
      setVersionsLoading(false)
      setVersionsError('')
      return undefined
    }
    let cancelled = false
    setVersionsLoading(true)
    setVersionsError('')
    setReviewBase(null)
    setVersions([])
    Promise.all([getReportVersions(reportId), apiGet(`/reports/${encodeURIComponent(reportId)}`)])
      .then(([payload, current]) => {
        if (cancelled) return
        setVersions(payload?.items || [])
        if (payload.currentVersion !== current.version || payload.contentHash !== current.contentHash ||
            JSON.stringify(current.content) !== JSON.stringify(report.content) || current.status !== report.status) {
          setVersionsError({ key: 'versionChanged' })
          return
        }
        setReviewBase({ baseVersion: current.version, baseContentHash: current.contentHash })
      })
      .catch((error) => {
        if (!cancelled) setVersionsError(errorDetail(error) || { key: 'historyFailed' })
      })
      .finally(() => {
        if (!cancelled) setVersionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reportId, reportVersion, report?.content, report?.status, versionsReload])

  const applyResult = async (result, message) => {
    if (incomingIdRef.current !== result.id) return
    setReport(result)
    setEditing(false)
    setReviewBase(null)
    setVersionsReload((value) => value + 1)
    try {
      await onRefresh?.()
      notify?.(message)
    } catch {
      notify?.(tReport('refreshFailed', { message }))
    }
  }

  const handleAmend = async () => {
    if (!report || !reviewBase || !editedContent || !amendReason.trim()) return
    setAmendBusy(true)
    try {
      const result = await apiPost(`/reports/${encodeURIComponent(report.id)}/amend`, {
        content: editedContent, ...reviewBase, actor: 'local-researcher', reason: amendReason.trim(),
      })
      setAmendReason('')
      await applyResult(result, tReport('amended', { version: result.version }))
    } catch (error) {
      setReviewBase(null)
      setVersionsError({ key: 'amendRetry' })
      notify?.(serverText(errorDetail(error)) || tReport('amendFailed'))
    } finally {
      setAmendBusy(false)
    }
  }

  const handleApprove = async () => {
    if (!report || !reviewBase || editing) return
    setReviewBusy(true)
    try {
      const result = await apiPost(`/reports/${encodeURIComponent(report.id)}/approve`, {
        ...reviewBase, approvedBy: 'local-researcher',
      })
      await applyResult(result, tReport('approvedVersion', { version: result.version }))
    } catch (error) {
      setReviewBase(null)
      setVersionsError({ key: 'approveRetry' })
      notify?.(serverText(errorDetail(error)) || t('report.approveFailed'))
    } finally {
      setReviewBusy(false)
    }
  }

  const editText = (group, index, text, sectionIndex) => {
    setEditedContent((previous) => {
      const next = JSON.parse(JSON.stringify(previous))
      const claim = group === 'sections' ? next.sections[sectionIndex].claims[index] : next[group][index]
      claim.text = text
      if (claim.status === 'clinician_reviewed') claim.status = 'needs_review'
      // Editing text alone does not clear evidence flags; review is explicit.
      return next
    })
  }

  const reviewClaim = (group, index, sectionIndex) => {
    setEditedContent((previous) => {
      const next = JSON.parse(JSON.stringify(previous))
      const claim = group === 'sections' ? next.sections[sectionIndex].claims[index] : next[group][index]
      claim.status = 'clinician_reviewed'
      return next
    })
  }

  if (!report) {
    return (
      <div className="report-empty">
        <CircleAlert size={22} />
        <b>{t('report.emptyTitle')}</b>
        <span>{t('report.emptyBody')}</span>
      </div>
    )
  }
  const content = (editing ? editedContent : report.content) || {}
  const hasReviewFlags = [...(content.sections || []).flatMap((s) => s.claims || []), ...(content.impression || []), ...(content.recommendations || [])].some((claim) => claim.status === 'needs_review')
  const changed = editing && JSON.stringify(editedContent) !== JSON.stringify(report.content)
  const sections = content.sections || []
  const subject = content.subject || {}
  const studyMeta = content.study || {}
  const measurementMap = Object.fromEntries((content.provenance?.measurement_snapshot || study?.measurements || []).map((item) => [item.id, item]))
  const citations = (refs) => refs?.length ? <div className="report-citations">{refs.map((ref) => <span key={ref} title={ref}>{citationLabel(ref, measurementMap)}</span>)}</div> : null
  const storedLang = content.lang || content.language
  const contentLang = storedLang === 'zh' || storedLang === 'zh-CN' ? 'zh-CN' : storedLang === 'en' ? 'en' : undefined
  const storedLanguageName = contentLang === 'zh-CN' ? t('lang.nameZh') : contentLang === 'en' ? t('lang.nameEn') : storedLang
  const locale = lang === 'zh' ? 'zh-CN' : 'en'
  const isApproved = report.status === 'approved'
  const isAi = report.generator === 'claude'

  return (
    <article className="report-document structured-report" lang={contentLang}>
      <div className="report-letterhead">
        <div className="report-brand">
          <span>CARDIOVASCULAR IMAGING · RESEARCH</span>
        </div>
        <div className="report-number">
          <span>REPORT NO.</span>
          <b>{report.id.replace(/^rep_/, 'R-').toUpperCase()}</b>
          <em>{enumLabel('status', report.status)} · {generatorLabel(report)}</em>
          {storedLanguageName ? <em>{t('report.storedLang', { lang: storedLanguageName })}</em> : null}
        </div>
      </div>

      <div className="report-title">
        <span className="report-title-kicker">RESEARCH STRUCTURED REPORT</span>
        <h1>{t('report.docTitle')}</h1>
        <p>{typeof studyMeta.description === 'string' ? studyMeta.description : serverText(studyMeta.description) || 'CCTA'} · {studyMeta.modalities?.join(' / ') || studyMeta.modalities || '—'}</p>
      </div>

      <div className="report-patient">
        <div><span>{t('report.subject')}</span><b>{subject.pseudonym || '—'}</b></div>
        <div><span>{t('report.sexAge')}</span><b>{subject.sex || '—'} / {subject.age_years ?? '—'}</b></div>
        <div><span>{t('report.studyDate')}</span><b>{studyMeta.date || '—'}</b></div>
        <div><span>{t('report.dataSource')}</span><b>{studyMeta.source || '—'}</b></div>
        <div><span>{t('report.reportStatus')}</span><b>{enumLabel('status', report.status)}</b></div>
        <div><span>{t('report.generator')}</span><b>{generatorLabel(report)}</b></div>
      </div>

      {isAi ? (
        <div className="report-ai-banner">
          <CircleAlert size={13} />
          {t('report.aiBanner')}
        </div>
      ) : null}

      {content.provenance?.fallback_reason ? (
        <div className="report-ai-banner" role="status">
          <CircleAlert size={13} />{tReport('fallback')}{serverText(content.provenance.fallback_reason)}
        </div>
      ) : null}
      {editing ? <p className="report-versions-status">{tReport('editing')}</p> : null}

      {sections.map((section, index) => (
        <section className="report-section" key={section.id || index}>
          <h2><span>{String(index + 1).padStart(2, '0')}</span> {section.title}</h2>
          {(section.claims || []).map((claim, claimIndex) => (
            <div className="report-claim" key={claim.id}>
              <p>
                {editing ? <textarea className="report-edit-text" aria-label={tReport('claimAria', { title: section.title, index: claimIndex + 1 })} value={claim.text} onChange={(event) => editText('sections', claimIndex, event.target.value, index)} /> : claim.text}
                {claim.status === 'needs_review' ? <Badge tone="amber">{tReport('needsReview')}</Badge> : null}
                {editing && claim.status === 'needs_review' ? <button type="button" className="report-versions-save" onClick={() => reviewClaim('sections', claimIndex, index)}>{tReport('evidenceReviewed')}</button> : null}
              </p>
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
            {content.impression.map((item, index) => (
              <li key={item.id}>
                {editing ? <textarea className="report-edit-text" aria-label={tReport('claimAria', { title: t('report.impression'), index: index + 1 })} value={item.text} onChange={(event) => editText('impression', index, event.target.value)} /> : item.text}
                {item.status === 'needs_review' ? <Badge tone="amber">{tReport('needsReview')}</Badge> : null}
                {editing && item.status === 'needs_review' ? <button type="button" className="report-versions-save" onClick={() => reviewClaim('impression', index)}>{tReport('evidenceReviewed')}</button> : null}
                {item.status === 'research_only' ? <Badge tone="amber">{t('common.research')}</Badge> : null}
                {citations(item.evidence_refs)}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {content.recommendations?.length ? (
        <section className="report-section">
          <h2><span>{String(sections.length + 2).padStart(2, '0')}</span> {t('report.recTitle')}</h2>
          <ul className="report-recommendations">
            {content.recommendations.map((item, index) => <li key={item.id}>
              {editing ? <textarea className="report-edit-text" aria-label={tReport('claimAria', { title: t('report.recommendations'), index: index + 1 })} value={item.text} onChange={(event) => editText('recommendations', index, event.target.value)} /> : item.text}
              {item.status === 'needs_review' ? <Badge tone="amber">{tReport('needsReview')}</Badge> : null}
              {editing && item.status === 'needs_review' ? <button type="button" className="report-versions-save" onClick={() => reviewClaim('recommendations', index)}>{tReport('evidenceReviewed')}</button> : null}
              {citations(item.evidence_refs)}
            </li>)}
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
          <b>{t('report.provenanceTitle')}</b>
          <span>
            {t('report.provenance', { generator: report.generator, model: report.model || '—', prompt: report.promptVersion || '—', count: (content.provenance?.measurement_ids || []).length })}
          </span>
        </div>
      </div>

      <section className="report-versions" aria-label={tReport('history')}>
        <header className="report-versions-head">
          <div>
            <History size={13} />
            <b>{tReport('history')}</b>
            <span>VERSIONS</span>
          </div>
          <em>{tReport('snapshots', { count: versions.length })}</em>
        </header>

        {versionsLoading ? (
          <p className="report-versions-status">{tReport('historyLoading')}</p>
        ) : null}
        {versionsError ? (
          <p className="report-versions-status error">{versionsError.key ? tReport(versionsError.key) : serverText(versionsError)}</p>
        ) : null}
        {!versionsLoading && !versionsError && !versions.length ? (
          <p className="report-versions-status">{tReport('historyEmpty')}</p>
        ) : null}

        {versions.length ? (
          <ol className="report-versions-list">
            {versions.map((version) => (
              <li key={version.id || version.version}>
                <span className="report-versions-badge">v{version.version}</span>
                <div className="report-versions-meta">
                  <b>{enumLabel('status', version.status)}</b>
                  <span>
                    {version.editedBy || '—'} ·{' '}
                    <time dateTime={version.createdAt || undefined}>
                      {version.createdAt ? new Date(version.createdAt).toLocaleString(locale) : '—'}
                    </time>
                  </span>
                  {version.reason ? <em>{version.reason}</em> : null}
                </div>
                {version.contentHash ? (
                  <code className="report-versions-hash" title={version.contentHash}>
                    {version.contentHash.slice(0, 10)}
                  </code>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}

        <div className="report-versions-actions">
          {!editing ? <button className="report-versions-save" type="button" disabled={!reviewBase || amendBusy || reviewBusy} onClick={() => {
            setEditedContent(JSON.parse(JSON.stringify(report.content || {})))
            setEditing(true)
          }}>{tReport('edit')}</button> : <button className="report-versions-save" type="button" disabled={amendBusy} onClick={() => setEditing(false)}>{tReport('cancel')}</button>}
          <input
            type="text"
            value={amendReason}
            onChange={(event) => setAmendReason(event.target.value)}
            placeholder={tReport('reasonRequired')}
            disabled={!editing || amendBusy}
            aria-label={tReport('reason')}
            maxLength={240}
          />
          <button
            type="button"
            className="report-versions-save"
            onClick={handleAmend}
            disabled={amendBusy || reviewBusy || !reviewBase || !changed || !amendReason.trim()}
          >
            <Save size={12} />
            {amendBusy ? tReport('saving') : tReport('save')}
          </button>
        </div>
      </section>

      <div className={`report-approval ${isApproved ? 'approved' : ''}`}>
        {isApproved ? (
          <>
            <CheckCircle2 size={15} />
            <div>
              <b>{t('report.approved')}</b>
              <span>{report.approvedBy || '—'} · {report.approvedAt ? new Date(report.approvedAt).toLocaleString(locale) : '—'}</span>
            </div>
          </>
        ) : (
          <>
            <FileSignature size={15} />
            <div>
              <b>{t('report.pending')}</b>
              <span>{hasReviewFlags ? tReport('evidencePending') : tReport('approvalBound')}</span>
            </div>
            <Button variant="primary" size="sm" onClick={handleApprove} disabled={approveBusy || reviewBusy || amendBusy || editing || !reviewBase || hasReviewFlags}>
              {approveBusy || reviewBusy ? t('report.approving') : t('report.approve')}
            </Button>
          </>
        )}
      </div>

      <div className="report-disclaimer">
        <CircleAlert size={12} />
        <p>
          {content.disclaimer || tReport('fallbackDisclaimer')}
        </p>
      </div>
      <div className="report-pagefoot">
        <span>CardioScope Pro · Research Prototype</span>
        <span>PAGE 1 / 1 · NOT FOR CLINICAL USE</span>
      </div>
    </article>
  )
}
