import React from 'react'
import { CheckCircle2, CircleAlert, FileSignature, History, Save, ShieldCheck } from 'lucide-react'
import { Badge, Button } from '../ui.jsx'
import { getReportVersions } from '../../api/reports.js'
import { apiGet, apiPost } from '../../api/client.js'
import './report-versions.css'

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
  return item ? `${item.label}${item.status === 'computed' && item.value != null ? `：${item.value} ${item.unit || ''}` : '（未计算）'}` : ref
}

export default function StructuredReport({ report: incomingReport, study, approveBusy, onRefresh, notify }) {
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
          setVersionsError('报告已更新，请刷新后重新复核。')
          return
        }
        setReviewBase({ baseVersion: current.version, baseContentHash: current.contentHash })
      })
      .catch((error) => {
        if (!cancelled) setVersionsError(error.message || '版本历史加载失败')
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
      notify?.(`${message}；其他检查数据刷新失败，请重新加载。`)
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
      await applyResult(result, `已保存修订 v${result.version}，需重新复核。`)
    } catch (error) {
      setReviewBase(null)
      setVersionsError('保存未完成，请刷新报告后重试。')
      notify?.(error.message || '保存修订失败')
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
      await applyResult(result, `已复核批准 v${result.version}。`)
    } catch (error) {
      setReviewBase(null)
      setVersionsError('批准未完成，请刷新报告并核对待复核项。')
      notify?.(error.message || '批准失败')
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
        <b>尚无报告草稿</b>
        <span>运行检查流水线后，服务端会生成一份可追溯的结构化报告草稿。</span>
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

      {content.provenance?.fallback_reason ? (
        <div className="report-ai-banner" role="status">
          <CircleAlert size={13} />模板回退：{content.provenance.fallback_reason}
        </div>
      ) : null}
      {editing ? <p className="report-versions-status">正在编辑修订稿；保存后原批准失效，需要重新复核。</p> : null}

      {sections.map((section, index) => (
        <section className="report-section" key={section.id || index}>
          <h2><span>{String(index + 1).padStart(2, '0')}</span> {section.title}</h2>
          {(section.claims || []).map((claim, claimIndex) => (
            <div className="report-claim" key={claim.id}>
              <p>
                {editing ? <textarea className="report-edit-text" aria-label={`${section.title} 第${claimIndex + 1}条`} value={claim.text} onChange={(event) => editText('sections', claimIndex, event.target.value, index)} /> : claim.text}
                {claim.status === 'needs_review' ? <Badge tone="amber">待复核</Badge> : null}
                {editing && claim.status === 'needs_review' ? <button type="button" className="report-versions-save" onClick={() => reviewClaim('sections', claimIndex, index)}>已核对并修正证据</button> : null}
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
          {!section.claims?.length ? <p className="report-muted">本节无内容。</p> : null}
        </section>
      ))}

      {content.impression?.length ? (
        <section className="report-section report-conclusion">
          <h2><span>{String(sections.length + 1).padStart(2, '0')}</span> 印象</h2>
          <ol>
            {content.impression.map((item, index) => (
              <li key={item.id}>
                {editing ? <textarea className="report-edit-text" aria-label={`印象 第${index + 1}条`} value={item.text} onChange={(event) => editText('impression', index, event.target.value)} /> : item.text}
                {item.status === 'needs_review' ? <Badge tone="amber">待复核</Badge> : null}
                {editing && item.status === 'needs_review' ? <button type="button" className="report-versions-save" onClick={() => reviewClaim('impression', index)}>已核对并修正证据</button> : null}
                {item.status === 'research_only' ? <Badge tone="amber">研究</Badge> : null}
                {citations(item.evidence_refs)}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {content.recommendations?.length ? (
        <section className="report-section">
          <h2><span>{String(sections.length + 2).padStart(2, '0')}</span> 建议</h2>
          <ul className="report-recommendations">
            {content.recommendations.map((item, index) => <li key={item.id}>
              {editing ? <textarea className="report-edit-text" aria-label={`建议 第${index + 1}条`} value={item.text} onChange={(event) => editText('recommendations', index, event.target.value)} /> : item.text}
              {item.status === 'needs_review' ? <Badge tone="amber">待复核</Badge> : null}
              {editing && item.status === 'needs_review' ? <button type="button" className="report-versions-save" onClick={() => reviewClaim('recommendations', index)}>已核对并修正证据</button> : null}
              {citations(item.evidence_refs)}
            </li>)}
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

      <section className="report-versions" aria-label="版本历史">
        <header className="report-versions-head">
          <div>
            <History size={13} />
            <b>版本历史</b>
            <span>VERSIONS</span>
          </div>
          <em>{versions.length} 个不可变快照</em>
        </header>

        {versionsLoading ? (
          <p className="report-versions-status">正在加载版本历史…</p>
        ) : null}
        {versionsError ? (
          <p className="report-versions-status error">{versionsError}</p>
        ) : null}
        {!versionsLoading && !versionsError && !versions.length ? (
          <p className="report-versions-status">尚无版本快照。保存修订或批准报告后会生成不可变版本。</p>
        ) : null}

        {versions.length ? (
          <ol className="report-versions-list">
            {versions.map((version) => (
              <li key={version.id || version.version}>
                <span className="report-versions-badge">v{version.version}</span>
                <div className="report-versions-meta">
                  <b>{STATUS_LABEL[version.status] || version.status}</b>
                  <span>
                    {version.editedBy || '—'} ·{' '}
                    <time dateTime={version.createdAt || undefined}>
                      {version.createdAt ? new Date(version.createdAt).toLocaleString() : '—'}
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
          }}>编辑修订</button> : <button className="report-versions-save" type="button" disabled={amendBusy} onClick={() => setEditing(false)}>取消编辑</button>}
          <input
            type="text"
            value={amendReason}
            onChange={(event) => setAmendReason(event.target.value)}
            placeholder="修订原因（必填）"
            disabled={!editing || amendBusy}
            aria-label="修订原因"
            maxLength={240}
          />
          <button
            type="button"
            className="report-versions-save"
            onClick={handleAmend}
            disabled={amendBusy || reviewBusy || !reviewBase || !changed || !amendReason.trim()}
          >
            <Save size={12} />
            {amendBusy ? '保存中…' : '保存修订'}
          </button>
        </div>
      </section>

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
              <span>{hasReviewFlags ? '存在证据待复核项，需修订并完成逐项核对。' : '批准绑定当前版本和内容；修订后需重新复核。'}</span>
            </div>
            <Button variant="primary" size="sm" onClick={handleApprove} disabled={approveBusy || reviewBusy || amendBusy || editing || !reviewBase || hasReviewFlags}>
              {approveBusy || reviewBusy ? '批准中…' : '批准报告'}
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
