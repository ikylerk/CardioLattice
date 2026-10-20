import { t, useI18n, serverText, measurementLabel, errorDetail } from '../i18n.js'
import { tImaging } from '../i18n-imaging.js'
import React from 'react'
import {
  CircleAlert,
  GitCompare,
  History,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import ViewHeader from './ViewHeader.jsx'
import { Badge, Button, Section, Stat } from './ui.jsx'
import { useStudy } from '../study/StudyContext.jsx'
import { createComparison, getComparison, getPriorCandidates } from '../api/client.js'

const EMPTY = '—'

const statusLabels = () => ({
  ok: { label: tImaging('comparison.passed'), tone: 'teal' },
  success: { label: tImaging('comparison.passed'), tone: 'teal' },
  registered: { label: tImaging('comparison.registered'), tone: 'teal' },
  complete: { label: t('analysis.done'), tone: 'teal' },
  completed: { label: tImaging('comparison.computed'), tone: 'teal' },
  completed_with_warnings: { label: tImaging('comparison.reviewComplete'), tone: 'amber' },
  not_comparable: { label: tImaging('comparison.notComparable'), tone: 'amber' },
  not_run: { label: tImaging('comparison.notRun'), tone: 'neutral' },
  low_quality: { label: tImaging('comparison.lowQuality'), tone: 'amber' },
  warning: { label: tImaging('comparison.review'), tone: 'amber' },
  partial: { label: tImaging('comparison.partial'), tone: 'amber' },
  not_computed: { label: t('common.notComputed'), tone: 'neutral' },
  skipped: { label: tImaging('comparison.notRun'), tone: 'neutral' },
  failed: { label: t('status.failed'), tone: 'red' },
  error: { label: t('status.failed'), tone: 'red' },
})

const comparabilityLabels = () => ({
  comparable: { label: tImaging('comparison.comparable'), tone: 'teal' },
  not_comparable: { label: tImaging('comparison.notComparable'), tone: 'amber' },
  incomparable: { label: tImaging('comparison.notComparable'), tone: 'amber' },
  partially_comparable: { label: tImaging('comparison.partiallyComparable'), tone: 'amber' },
  unknown: { label: tImaging('common.unknown'), tone: 'neutral' },
  not_computed: { label: t('common.notComputed'), tone: 'neutral' },
})

function isMissing(value) {
  return value === null || value === undefined || value === ''
}

function formatNumber(value, unit = '') {
  if (isMissing(value)) return EMPTY
  let text
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return EMPTY
    const magnitude = Math.abs(value)
    const digits = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : magnitude >= 1 ? 2 : magnitude >= 0.01 ? 3 : 4
    text = value.toFixed(digits)
    if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '')
  } else {
    text = String(value)
  }
  return unit ? `${text} ${unit}` : text
}

function formatMetric(metric) {
  if (isMissing(metric)) return EMPTY
  if (typeof metric === 'object') {
    if (Array.isArray(metric)) return JSON.stringify(metric)
    const name = metric.name ? serverText(metric.name) : metric.label || metric.code ? measurementLabel(metric) : metric.method
    const hasValue = !isMissing(metric.value)
    if (!isMissing(name) && hasValue) return `${name} · ${formatNumber(metric.value, metric.unit || '')}`
    if (!isMissing(name)) return String(name)
    if (hasValue) return formatNumber(metric.value, metric.unit || '')
    return JSON.stringify(metric)
  }
  return String(metric)
}

function formatValue(value, unit = '') {
  if (isMissing(value)) return EMPTY
  if (typeof value === 'object') return formatMetric(value)
  return formatNumber(value, unit)
}

function formatDelta(value, unit = '') {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const text = formatNumber(value, unit)
    return value > 0 ? `+${text}` : text
  }
  return formatValue(value, unit)
}

function formatPercent(value) {
  if (isMissing(value)) return EMPTY
  if (typeof value === 'number' && Number.isFinite(value)) return `${formatNumber(value)}%`
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return `${value.trim()}%`
  return formatValue(value)
}

function toWarningList(value) {
  if (isMissing(value)) return []
  if (Array.isArray(value)) return value.filter((item) => !isMissing(item))
  return [value]
}

function warningText(warning) {
  if (warning && typeof warning === 'object' && !Array.isArray(warning)) {
    return serverText(warning.message || warning.text || warning.label || warning)
  }
  return serverText(warning)
}

function statusInfo(value) {
  if (isMissing(value)) return { label: tImaging('common.notReturned'), tone: 'neutral', raw: EMPTY }
  const raw = String(value)
  const known = statusLabels()[raw.toLowerCase()]
  return known ? { ...known, raw } : { label: raw, tone: 'neutral', raw }
}

function comparabilityInfo(value) {
  if (value && typeof value === 'object') {
    const comparable = value.comparable === true
    return {
      ...comparabilityLabels()[comparable ? 'comparable' : 'not_comparable'],
      comparable,
      warnings: toWarningList(value.warnings),
    }
  }
  if (isMissing(value)) return { label: tImaging('common.notSpecified'), tone: 'neutral' }
  const raw = String(value)
  return { ...(comparabilityLabels()[raw.toLowerCase()] || { label: raw, tone: 'neutral' }), comparable: false, warnings: [tImaging('comparison.legacy')] }
}

function CandidateRow({ candidate, selected, onSelect, disabled }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      className={`comparison-candidate ${selected ? 'active' : ''}`}
      onClick={onSelect}
    >
      <span className="comparison-candidate-radio" aria-hidden="true" />
      <span className="comparison-candidate-main">
        <b>{candidate.studyDate || tImaging('common.dateUnknown')}</b>
        <span>{serverText(candidate.description) || tImaging('common.noStudyDescription')}</span>
      </span>
      <span className="comparison-candidate-meta">
        <em>{candidate.source || tImaging('common.unspecifiedSource')}</em>
        <small>{candidate.id}</small>
      </span>
    </button>
  )
}

export default function ComparisonView({ onNavigate }) {
  useI18n()
  const { study, isApi } = useStudy()
  const current = study?.study
  const studyId = current?.id

  const [candidates, setCandidates] = React.useState([])
  const [candidatesLoading, setCandidatesLoading] = React.useState(false)
  const [candidatesError, setCandidatesError] = React.useState('')
  const [priorId, setPriorId] = React.useState('')
  const [running, setRunning] = React.useState(false)
  const [runError, setRunError] = React.useState('')
  const [result, setResult] = React.useState(null)
  const requestVersionRef = React.useRef(0)
  const currentStudyIdRef = React.useRef(studyId)
  currentStudyIdRef.current = studyId

  React.useEffect(() => {
    let cancelled = false
    requestVersionRef.current += 1
    setCandidates([])
    setCandidatesError('')
    setPriorId('')
    setRunning(false)
    setRunError('')
    setResult(null)

    if (!studyId || !isApi) {
      setCandidatesLoading(false)
      return undefined
    }

    setCandidatesLoading(true)
    getPriorCandidates(studyId)
      .then((data) => {
        if (cancelled) return
        const items = Array.isArray(data?.items) ? data.items : []
        setCandidates(items.filter((item) => item?.id && item.id !== studyId))
      })
      .catch((err) => {
        if (!cancelled) setCandidatesError(errorDetail(err))
      })
      .finally(() => {
        if (!cancelled) setCandidatesLoading(false)
      })

    return () => {
      cancelled = true
      requestVersionRef.current += 1
    }
  }, [studyId, isApi])

  const selected = candidates.find((item) => item.id === priorId) || null

  const runComparison = async () => {
    if (!studyId || !priorId || running) return
    const requestStudyId = studyId
    const requestVersion = ++requestVersionRef.current
    setRunning(true)
    setRunError('')
    setResult(null)
    try {
      const created = await createComparison(studyId, priorId)
      let payload = created
      if (payload && !payload.registration && !payload.deltas && payload.id) {
        payload = await getComparison(payload.id)
      }
      if (currentStudyIdRef.current !== requestStudyId || requestVersionRef.current !== requestVersion) return
      if (!payload) {
        setRunError({ imagingKey: 'comparison.noResponse' })
        return
      }
      if (payload.currentStudyId !== requestStudyId || payload.priorStudyId !== priorId) {
        setRunError({ imagingKey: 'comparison.wrongStudies' })
        return
      }
      setResult(payload)
    } catch (err) {
      if (currentStudyIdRef.current === requestStudyId && requestVersionRef.current === requestVersion) {
        setRunError(errorDetail(err))
      }
    } finally {
      if (currentStudyIdRef.current === requestStudyId && requestVersionRef.current === requestVersion) setRunning(false)
    }
  }

  const registration = result?.registration && typeof result.registration === 'object'
    ? result.registration
    : null
  const registrationStatus = statusInfo(registration?.status)
  const resultStatus = statusInfo(result?.status)
  const registrationUsable = registration?.status === 'completed' && registration?.quality === 'research_qc_passed'
  const registrationWarnings = toWarningList(registration?.warnings)
  const hasRegistrationWarningsField = Boolean(
    registration && Object.prototype.hasOwnProperty.call(registration, 'warnings'),
  )
  const deltas = Array.isArray(result?.deltas) ? result.deltas : []
  const resultWarnings = toWarningList(result?.warnings)
  const comparableCount = deltas.filter(
    (item) => item && registrationUsable && comparabilityInfo(item.comparability).comparable,
  ).length

  return (
    <div className="module-view comparison-view">
      <ViewHeader
        index="07"
        eyebrow="LONGITUDINAL COMPARISON"
        title={t('nav.comparison')}
        titleSuffix="LONGITUDINAL COMPARISON"
        description={tImaging('comparison.description')}
        meta={
          <>
            <span>{candidatesLoading ? tImaging('comparison.loadingCandidates') : tImaging('comparison.candidateCount', { v0: candidates.length })}</span>
            <i />
            <span>{result ? resultStatus.label : tImaging('comparison.awaitingRun')}</span>
          </>
        }
        actions={
          <>
            <Badge tone="amber" dot>{tImaging('comparison.researchBadge')}</Badge>
            <Button
              variant="outline"
              size="sm"
              icon={<GitCompare size={14} />}
              onClick={runComparison}
              disabled={!studyId || !priorId || running}
            >{tImaging('comparison.run')}</Button>
          </>
        }
      />

      <div className="module-body analysis-body comparison-body">
        <div className="analysis-main comparison-main">
          <div className="analysis-strip comparison-strip">
            <Stat
              label={tImaging('comparison.priorCandidates')}
              value={candidatesLoading ? EMPTY : candidates.length}
              hint={tImaging('comparison.earlierSameSubject')}
            />
            <Stat
              label={tImaging('comparison.selectedPrior')}
              value={selected?.studyDate || EMPTY}
              hint={selected?.description || tImaging('common.notSelected')}
            />
            <Stat
              label={tImaging('comparison.status')}
              value={result ? resultStatus.label : t('workbench.modelNotRun')}
              accent={result && resultStatus.tone !== 'teal' ? 'amber' : undefined}
              hint={result ? tImaging('comparison.resultReturned') : tImaging('comparison.waiting')}
            />
            <Stat
              label={tImaging('comparison.deltas')}
              value={result ? deltas.length : EMPTY}
              hint={result ? tImaging('comparison.comparableCount', { v0: comparableCount }) : tImaging('comparison.provenanceHint')}
            />
          </div>

          <Section title={t('topbar.currentStudy')} code="CURRENT STUDY" right={<History size={13} />}>
            {current ? (
              <div className="scan-params comparison-current-grid">
                <div><span>{t('report.subject')}</span><b>{current.subject?.pseudonym || EMPTY}</b></div>
                <div><span>{t('report.studyDate')}</span><b>{current.studyDate || EMPTY}</b></div>
                <div><span>{tImaging('common.studyDescription')}</span><b>{serverText(current.description) || EMPTY}</b></div>
                <div><span>{t('workbench.modality')}</span><b>{current.modality || EMPTY}</b></div>
                <div><span>{t('workbench.source')}</span><b>{current.source || EMPTY}</b></div>
                <div><span>{tImaging('common.status')}</span><b>{current.status || EMPTY}</b></div>
                <div><span>{tImaging('common.studyId')}</span><b>{current.id || EMPTY}</b></div>
                <div><span>{tImaging('common.subjectId')}</span><b>{current.subject?.id || EMPTY}</b></div>
              </div>
            ) : (
              <div className="comparison-empty">
                <CircleAlert size={16} />
                <b>{t('cta.emptyTitle')}</b>
                <span>{tImaging('comparison.selectStudy')}</span>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.('workbench')}>{tImaging('comparison.openWorkbench')}</Button>
              </div>
            )}
          </Section>

          <Section title={tImaging('comparison.priorCandidates')} code="PRIOR CANDIDATES" right={<History size={13} />}>
            {!isApi ? (
              <div className="comparison-empty">
                <CircleAlert size={16} />
                <b>{tImaging('comparison.noDemoTitle')}</b>
                <span>{tImaging('comparison.noDemoBody')}</span>
              </div>
            ) : !studyId ? (
              <div className="comparison-empty">
                <CircleAlert size={16} />
                <b>{tImaging('comparison.noCurrent')}</b>
                <span>{tImaging('comparison.selectBeforeCandidates')}</span>
              </div>
            ) : candidatesLoading ? (
              <div className="comparison-empty">
                <GitCompare size={16} />
                <b>{tImaging('comparison.loadingPrior')}</b>
                <span>{tImaging('comparison.backendCandidates')}</span>
              </div>
            ) : candidatesError ? (
              <div className="workbench-error">
                <CircleAlert size={14} />
                <span>{serverText(candidatesError)}</span>
              </div>
            ) : candidates.length ? (
              <div className="comparison-candidate-list" role="radiogroup" aria-label={tImaging('comparison.candidatesAria')}>
                {candidates.map((candidate) => (
                  <CandidateRow
                    key={candidate.id}
                    candidate={candidate}
                    selected={candidate.id === priorId}
                    disabled={running}
                    onSelect={() => {
                      setPriorId(candidate.id)
                      setRunError('')
                      setResult(null)
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="comparison-empty">
                <CircleAlert size={16} />
                <b>{tImaging('comparison.noCandidates')}</b>
                <span>{tImaging('comparison.candidateRules')}</span>
              </div>
            )}
          </Section>

          <div className="comparison-run-bar">
            <div>
              <span>{tImaging('comparison.selectedPriorStudy')}</span>
              <b>
                {selected
                  ? `${selected.studyDate || tImaging('common.dateUnknown')} · ${serverText(selected.description) || tImaging('common.noDescription')}`
                  : tImaging('common.notSelected')}
              </b>
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={<GitCompare size={14} />}
              onClick={runComparison}
              disabled={!studyId || !priorId || running}
            >
              {running ? tImaging('comparison.running') : tImaging('comparison.run')}
            </Button>
          </div>

          {running ? (
            <div className="comparison-empty comparison-running">
              <GitCompare size={16} />
              <b>{tImaging('comparison.computing')}</b>
              <span>{tImaging('comparison.noInventedValues')}</span>
            </div>
          ) : null}

          {runError ? (
            <div className="workbench-error">
              <CircleAlert size={14} />
              <span>{runError.imagingKey ? tImaging(runError.imagingKey) : serverText(runError)}</span>
            </div>
          ) : null}

          {result ? (
            <>
              <Section
                title={tImaging('comparison.registrationQuality')}
                code="REGISTRATION QUALITY"
                right={<ShieldCheck size={13} />}
              >
                {registration ? (
                  <div className="comparison-registration">
                    <div className="comparison-registration-head">
                      <div>
                        <span>{tImaging('comparison.registrationStatus')}</span>
                        <Badge tone={registrationStatus.tone} dot>{registrationStatus.label}</Badge>
                        {registrationStatus.raw !== registrationStatus.label ? (
                          <em>{registrationStatus.raw}</em>
                        ) : null}
                      </div>
                      <span className="comparison-result-id">{result.id || EMPTY}</span>
                    </div>
                    <div className="comparison-registration-grid">
                      <div>
                        <span>{tImaging('comparison.method')}</span>
                        <b>{formatMetric(registration.method)}</b>
                      </div>
                      <div>
                        <span>{tImaging('comparison.quality')}</span>
                        <b>{registration.quality === 'research_qc_passed' ? tImaging('comparison.engineeringQc') : formatValue(registration.quality)}</b>
                      </div>
                      <div>
                        <span>{tImaging('comparison.metric')}</span>
                        <b>{formatMetric(registration.metric)}</b>
                      </div>
                    </div>
                    <div className="comparison-warnings">
                      <div className="comparison-warnings-title">
                        <CircleAlert size={12} />
                        <span>{tImaging('comparison.registrationWarnings')}</span>
                      </div>
                      {registrationWarnings.length ? (
                        <ul>
                          {registrationWarnings.map((warning, index) => (
                            <li key={`${warningText(warning)}-${index}`}>{warningText(warning)}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="comparison-warning-none">
                          {hasRegistrationWarningsField ? tImaging('comparison.noRegistrationWarnings') : tImaging('comparison.missingWarnings')}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="comparison-empty">
                    <CircleAlert size={16} />
                    <b>{tImaging('comparison.noRegistration')}</b>
                    <span>{tImaging('comparison.noRegistrationBody')}</span>
                  </div>
                )}
              </Section>

              <Section
                title={tImaging('comparison.deltas')}
                code="DELTA METRICS"
                right={
                  <span className="comparison-result-meta">
                    {result.createdAt || (result.id ? `ID ${result.id}` : EMPTY)}
                  </span>
                }
              >
                {deltas.length ? (
                  <div className="comparison-table-wrap">
                    <table className="comparison-table">
                      <thead>
                        <tr>
                          <th>{t('report.colMetric')}</th>
                          <th>{tImaging('comparison.current')}</th>
                          <th>{tImaging('comparison.prior')}</th>
                          <th>{tImaging('comparison.absoluteChange')}</th>
                          <th>{tImaging('comparison.percentage')}</th>
                          <th>{tImaging('comparison.methodSource')}</th>
                          <th>{tImaging('comparison.comparability')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deltas.map((raw, index) => {
                          const item = raw && typeof raw === 'object' ? raw : {}
                          const comparability = comparabilityInfo(item.comparability)
                          const incomplete = isMissing(item.current) || isMissing(item.prior)
                          const comparable = registrationUsable && comparability.comparable === true
                          const reasons = comparability.warnings || []
                          return (
                            <tr
                              key={item.code || `${item.label || 'metric'}-${index}`}
                              className={incomplete ? 'not-computed' : ''}
                            >
                              <td>
                                <b>{measurementLabel(item) || EMPTY}</b>
                                {item.label && item.code ? <em>{item.code}</em> : null}
                              </td>
                              <td>{isMissing(item.current) ? <span className="comparison-missing">{t('common.notComputed')}</span> : formatValue(item.current, item.currentUnit ?? item.unit)}</td>
                              <td>{isMissing(item.prior) ? <span className="comparison-missing">{t('common.notComputed')}</span> : formatValue(item.prior, item.priorUnit ?? item.unit)}</td>
                              <td>{comparable ? formatDelta(item.delta, item.unit) : EMPTY}</td>
                              <td>{comparable ? formatPercent(item.percent) : EMPTY}</td>
                              <td>
                                <span>{formatMetric(item.method)}</span>
                                <em>{serverText(item.source) || EMPTY}</em>
                                {item.comparability?.prior?.method && item.comparability.prior.method !== item.method ? <em>{tImaging('comparison.priorPrefix')}{formatMetric(item.comparability.prior.method)}</em> : null}
                                {item.comparability?.prior?.source && item.comparability.prior.source !== item.source ? <em>{tImaging('comparison.priorSourcePrefix')}{serverText(item.comparability.prior.source)}</em> : null}
                              </td>
                              <td>
                                <Badge tone={comparable ? comparability.tone : 'amber'}>{comparable ? comparability.label : tImaging('comparison.notComparable')}</Badge>
                                {reasons.map((reason, reasonIndex) => <em key={reasonIndex}>{warningText(reason)}</em>)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="comparison-empty">
                    <CircleAlert size={16} />
                    <b>{tImaging('comparison.noMetrics')}</b>
                    <span>{tImaging('comparison.noMetricsBody')}</span>
                  </div>
                )}
              </Section>

              {resultWarnings.length ? (
                <Section title={tImaging('comparison.warnings')} code="WARNINGS" right={<CircleAlert size={13} />}>
                  <ul className="comparison-warning-list">
                    {resultWarnings.map((warning, index) => (
                      <li key={`${warningText(warning)}-${index}`}>{warningText(warning)}</li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              <div className="comparison-disclaimer" role="note">
                <ShieldAlert size={20} />
                <div>
                  <b>{tImaging('comparison.notPrediction')}</b>
                  <span>{tImaging('comparison.predictionScope')}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="comparison-placeholder">
              <GitCompare size={22} />
              <div>
                <b>{tImaging('comparison.noResult')}</b>
                <span>{tImaging('comparison.runHint')}</span>
              </div>
            </div>
          )}
        </div>

        <aside className="inspector comparison-inspector">
          <div className="selection-hero">
            <div className="selection-eyebrow">
              <span>SUBJECT MATCH</span>
              <span className="selection-id">SAME SUBJECT</span>
            </div>
            <div className="selection-title">
              <span className="structure-swatch swatch-great" />
              <div>
                <h2>{current?.subject?.pseudonym || t('topbar.noStudy')}</h2>
                <small>{current?.studyDate || EMPTY} · {serverText(current?.description) || EMPTY}</small>
              </div>
            </div>
            <p>{tImaging('comparison.subjectScope')}</p>
          </div>

          <Section title={t('topbar.currentStudy')} code="CURRENT STUDY" right={<History size={13} />}>
            <div className="scan-params">
              <div><span>{tImaging('common.studyId')}</span><b>{current?.id || EMPTY}</b></div>
              <div><span>{t('workbench.date')}</span><b>{current?.studyDate || EMPTY}</b></div>
              <div><span>{t('workbench.modality')}</span><b>{current?.modality || EMPTY}</b></div>
              <div><span>{t('workbench.source')}</span><b>{current?.source || EMPTY}</b></div>
              <div><span>{tImaging('common.status')}</span><b>{current?.status || EMPTY}</b></div>
              <div><span>{tImaging('common.description')}</span><b>{serverText(current?.description) || EMPTY}</b></div>
            </div>
          </Section>

          <Section title={tImaging('comparison.protocol')} code="PROTOCOL" right={<ShieldCheck size={13} />}>
            <div className="comparison-rules">
              <div>
                <b>{tImaging('comparison.sameSubject')}</b>
                <span>{tImaging('comparison.identityRule')}</span>
              </div>
              <div>
                <b>{tImaging('comparison.traceable')}</b>
                <span>{tImaging('comparison.traceabilityRule')}</span>
              </div>
              <div>
                <b>{tImaging('comparison.nonPredictive')}</b>
                <span>{tImaging('comparison.nonPredictiveRule')}</span>
              </div>
            </div>
          </Section>

          <div className="cta-disclaimer">
            <CircleAlert size={12} />{tImaging('comparison.disclaimer')}</div>
        </aside>
      </div>
    </div>
  )
}
