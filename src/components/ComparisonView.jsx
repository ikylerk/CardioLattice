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

const STATUS_MAP = {
  ok: { label: '通过', tone: 'teal' },
  success: { label: '通过', tone: 'teal' },
  registered: { label: '已配准', tone: 'teal' },
  complete: { label: '已完成', tone: 'teal' },
  completed: { label: '计算完成', tone: 'teal' },
  completed_with_warnings: { label: '完成 · 需复核', tone: 'amber' },
  not_comparable: { label: '不可比', tone: 'amber' },
  not_run: { label: '未执行', tone: 'neutral' },
  low_quality: { label: '质量不足', tone: 'amber' },
  warning: { label: '需复核', tone: 'amber' },
  partial: { label: '部分完成', tone: 'amber' },
  not_computed: { label: '未计算', tone: 'neutral' },
  skipped: { label: '未执行', tone: 'neutral' },
  failed: { label: '失败', tone: 'red' },
  error: { label: '失败', tone: 'red' },
}

const COMPARABILITY_MAP = {
  comparable: { label: '可比', tone: 'teal' },
  not_comparable: { label: '不可比', tone: 'amber' },
  incomparable: { label: '不可比', tone: 'amber' },
  partially_comparable: { label: '部分可比', tone: 'amber' },
  unknown: { label: '未知', tone: 'neutral' },
  not_computed: { label: '未计算', tone: 'neutral' },
}

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
    const name = metric.name || metric.label || metric.code || metric.method
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
  if (typeof warning === 'string') return warning
  if (warning && typeof warning === 'object') {
    return warning.message || warning.text || warning.code || warning.label || JSON.stringify(warning)
  }
  return String(warning)
}

function statusInfo(value) {
  if (isMissing(value)) return { label: '未返回', tone: 'neutral', raw: EMPTY }
  const raw = String(value)
  const known = STATUS_MAP[raw.toLowerCase()]
  return known ? { ...known, raw } : { label: raw, tone: 'neutral', raw }
}

function comparabilityInfo(value) {
  if (value && typeof value === 'object') {
    const comparable = value.comparable === true
    return {
      ...COMPARABILITY_MAP[comparable ? 'comparable' : 'not_comparable'],
      comparable,
      warnings: toWarningList(value.warnings),
    }
  }
  if (isMissing(value)) return { label: '未标注', tone: 'neutral' }
  const raw = String(value)
  return { ...(COMPARABILITY_MAP[raw.toLowerCase()] || { label: raw, tone: 'neutral' }), comparable: false, warnings: ['旧版可比性未通过当前校验。'] }
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
        <b>{candidate.studyDate || '日期未知'}</b>
        <span>{candidate.description || '无检查描述'}</span>
      </span>
      <span className="comparison-candidate-meta">
        <em>{candidate.source || '未标注来源'}</em>
        <small>{candidate.id}</small>
      </span>
    </button>
  )
}

export default function ComparisonView({ onNavigate }) {
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
        if (!cancelled) setCandidatesError(err.message || String(err))
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
      if (!payload) throw new Error('对比接口未返回结果')
      if (payload.currentStudyId !== requestStudyId || payload.priorStudyId !== priorId) {
        throw new Error('对比结果与所选检查不一致，请重新运行')
      }
      setResult(payload)
    } catch (err) {
      if (currentStudyIdRef.current === requestStudyId && requestVersionRef.current === requestVersion) {
        setRunError(err.message || String(err))
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
        title="纵向对比"
        titleSuffix="LONGITUDINAL COMPARISON"
        description="同一受试者既往检查的配准与差值浏览；只展示后端返回的可追溯指标，不预测未来事件。"
        meta={
          <>
            <span>{candidatesLoading ? '读取候选…' : `${candidates.length} 条既往候选`}</span>
            <i />
            <span>{result ? resultStatus.label : '尚未运行'}</span>
          </>
        }
        actions={
          <>
            <Badge tone="amber" dot>研究用途 · 非预测</Badge>
            <Button
              variant="outline"
              size="sm"
              icon={<GitCompare size={14} />}
              onClick={runComparison}
              disabled={!studyId || !priorId || running}
            >
              运行纵向对比
            </Button>
          </>
        }
      />

      <div className="module-body analysis-body comparison-body">
        <div className="analysis-main comparison-main">
          <div className="analysis-strip comparison-strip">
            <Stat
              label="既往候选"
              value={candidatesLoading ? EMPTY : candidates.length}
              hint="同一受试者、当前检查之前"
            />
            <Stat
              label="已选既往"
              value={selected?.studyDate || EMPTY}
              hint={selected?.description || '尚未选择'}
            />
            <Stat
              label="对比状态"
              value={result ? resultStatus.label : '未运行'}
              accent={result && resultStatus.tone !== 'teal' ? 'amber' : undefined}
              hint={result ? '已返回结果' : '等待运行'}
            />
            <Stat
              label="指标差值"
              value={result ? deltas.length : EMPTY}
              hint={result ? `${comparableCount} 项标注可比` : '含 method / source / comparability'}
            />
          </div>

          <Section title="当前检查" code="CURRENT STUDY" right={<History size={13} />}>
            {current ? (
              <div className="scan-params comparison-current-grid">
                <div><span>受试者</span><b>{current.subject?.pseudonym || EMPTY}</b></div>
                <div><span>检查日期</span><b>{current.studyDate || EMPTY}</b></div>
                <div><span>检查描述</span><b>{current.description || EMPTY}</b></div>
                <div><span>模态</span><b>{current.modality || EMPTY}</b></div>
                <div><span>来源</span><b>{current.source || EMPTY}</b></div>
                <div><span>状态</span><b>{current.status || EMPTY}</b></div>
                <div><span>检查 ID</span><b>{current.id || EMPTY}</b></div>
                <div><span>受试者 ID</span><b>{current.subject?.id || EMPTY}</b></div>
              </div>
            ) : (
              <div className="comparison-empty">
                <CircleAlert size={16} />
                <b>尚未选择检查</b>
                <span>请先在检查工作台选择或上传一次检查，再运行纵向对比。</span>
                <Button size="sm" variant="outline" onClick={() => onNavigate?.('workbench')}>
                  前往检查工作台
                </Button>
              </div>
            )}
          </Section>

          <Section title="既往候选" code="PRIOR CANDIDATES" right={<History size={13} />}>
            {!isApi ? (
              <div className="comparison-empty">
                <CircleAlert size={16} />
                <b>演示模式不提供纵向对比数据</b>
                <span>纵向对比需要 API 模式下同一受试者的多次真实检查；不会使用演示数值替代。</span>
              </div>
            ) : !studyId ? (
              <div className="comparison-empty">
                <CircleAlert size={16} />
                <b>缺少当前检查</b>
                <span>选择当前检查后才能读取同一受试者的既往候选。</span>
              </div>
            ) : candidatesLoading ? (
              <div className="comparison-empty">
                <GitCompare size={16} />
                <b>正在读取既往检查…</b>
                <span>候选列表由后端按同一受试者筛选，不在此处推断。</span>
              </div>
            ) : candidatesError ? (
              <div className="workbench-error">
                <CircleAlert size={14} />
                <span>{candidatesError}</span>
              </div>
            ) : candidates.length ? (
              <div className="comparison-candidate-list" role="radiogroup" aria-label="既往检查候选">
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
                <b>未找到符合条件的既往检查</b>
                <span>需要同一受试者的两次已就绪检查，且检查日期有效、既往日期严格早于当前。缺失日期或同日记录不会作为既往候选。</span>
              </div>
            )}
          </Section>

          <div className="comparison-run-bar">
            <div>
              <span>已选既往检查</span>
              <b>
                {selected
                  ? `${selected.studyDate || '日期未知'} · ${selected.description || '无描述'}`
                  : '尚未选择'}
              </b>
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={<GitCompare size={14} />}
              onClick={runComparison}
              disabled={!studyId || !priorId || running}
            >
              {running ? '运行中…' : '运行纵向对比'}
            </Button>
          </div>

          {running ? (
            <div className="comparison-empty comparison-running">
              <GitCompare size={16} />
              <b>正在配准并计算差值…</b>
              <span>结果只包含后端返回的指标；未返回或 not_computed 的项保持为空。</span>
            </div>
          ) : null}

          {runError ? (
            <div className="workbench-error">
              <CircleAlert size={14} />
              <span>{runError}</span>
            </div>
          ) : null}

          {result ? (
            <>
              <Section
                title="配准质量"
                code="REGISTRATION QUALITY"
                right={<ShieldCheck size={13} />}
              >
                {registration ? (
                  <div className="comparison-registration">
                    <div className="comparison-registration-head">
                      <div>
                        <span>配准状态</span>
                        <Badge tone={registrationStatus.tone} dot>{registrationStatus.label}</Badge>
                        {registrationStatus.raw !== registrationStatus.label ? (
                          <em>{registrationStatus.raw}</em>
                        ) : null}
                      </div>
                      <span className="comparison-result-id">{result.id || EMPTY}</span>
                    </div>
                    <div className="comparison-registration-grid">
                      <div>
                        <span>方法 / METHOD</span>
                        <b>{formatMetric(registration.method)}</b>
                      </div>
                      <div>
                        <span>质量 / QUALITY</span>
                        <b>{registration.quality === 'research_qc_passed' ? '工程质控通过 · 解剖准确性未验证' : formatValue(registration.quality)}</b>
                      </div>
                      <div>
                        <span>度量 / METRIC</span>
                        <b>{formatMetric(registration.metric)}</b>
                      </div>
                    </div>
                    <div className="comparison-warnings">
                      <div className="comparison-warnings-title">
                        <CircleAlert size={12} />
                        <span>配准警告</span>
                      </div>
                      {registrationWarnings.length ? (
                        <ul>
                          {registrationWarnings.map((warning, index) => (
                            <li key={`${warningText(warning)}-${index}`}>{warningText(warning)}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="comparison-warning-none">
                          {hasRegistrationWarningsField ? '无配准警告。' : '后端未返回警告字段。'}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="comparison-empty">
                    <CircleAlert size={16} />
                    <b>未返回配准信息</b>
                    <span>对比结果中没有 registration 字段；不会以默认方法或质量填充。</span>
                  </div>
                )}
              </Section>

              <Section
                title="指标差值"
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
                          <th>指标</th>
                          <th>当前</th>
                          <th>既往</th>
                          <th>绝对变化</th>
                          <th>百分比</th>
                          <th>方法 / 来源</th>
                          <th>可比性</th>
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
                                <b>{item.label || item.code || EMPTY}</b>
                                {item.label && item.code ? <em>{item.code}</em> : null}
                              </td>
                              <td>{isMissing(item.current) ? <span className="comparison-missing">未计算</span> : formatValue(item.current, item.currentUnit ?? item.unit)}</td>
                              <td>{isMissing(item.prior) ? <span className="comparison-missing">未计算</span> : formatValue(item.prior, item.priorUnit ?? item.unit)}</td>
                              <td>{comparable ? formatDelta(item.delta, item.unit) : EMPTY}</td>
                              <td>{comparable ? formatPercent(item.percent) : EMPTY}</td>
                              <td>
                                <span>{formatMetric(item.method)}</span>
                                <em>{item.source || EMPTY}</em>
                                {item.comparability?.prior?.method && item.comparability.prior.method !== item.method ? <em>既往：{item.comparability.prior.method}</em> : null}
                                {item.comparability?.prior?.source && item.comparability.prior.source !== item.source ? <em>既往来源：{item.comparability.prior.source}</em> : null}
                              </td>
                              <td>
                                <Badge tone={comparable ? comparability.tone : 'amber'}>{comparable ? comparability.label : '不可比'}</Badge>
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
                    <b>未返回可比较指标</b>
                    <span>结果 deltas 为空或全部为 not_computed；不会用推算值填充差值表。</span>
                  </div>
                )}
              </Section>

              {resultWarnings.length ? (
                <Section title="对比警告" code="WARNINGS" right={<CircleAlert size={13} />}>
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
                  <b>不是预测 · NOT A PREDICTION</b>
                  <span>
                    纵向对比只描述两次检查之间可量化指标的差异，不预测疾病进展、不推断未来风险，也不构成治疗建议。
                    配准质量不足或指标不可比时，差值不应被解读为病情变化；所有结果需医生复核。
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="comparison-placeholder">
              <GitCompare size={22} />
              <div>
                <b>尚未生成对比</b>
                <span>选择一条既往检查并运行纵向对比。结果只展示配准质量、可追溯差值与非预测声明。</span>
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
                <h2>{current?.subject?.pseudonym || '未选择检查'}</h2>
                <small>{current?.studyDate || EMPTY} · {current?.description || EMPTY}</small>
              </div>
            </div>
            <p>
              只比较同一受试者、当前检查之前的检查。不同受试者的检查不会进入候选列表；
              缺失指标保持为空，不做插值或推算。
            </p>
          </div>

          <Section title="当前检查" code="CURRENT STUDY" right={<History size={13} />}>
            <div className="scan-params">
              <div><span>检查 ID</span><b>{current?.id || EMPTY}</b></div>
              <div><span>日期</span><b>{current?.studyDate || EMPTY}</b></div>
              <div><span>模态</span><b>{current?.modality || EMPTY}</b></div>
              <div><span>来源</span><b>{current?.source || EMPTY}</b></div>
              <div><span>状态</span><b>{current?.status || EMPTY}</b></div>
              <div><span>描述</span><b>{current?.description || EMPTY}</b></div>
            </div>
          </Section>

          <Section title="对比规则" code="PROTOCOL" right={<ShieldCheck size={13} />}>
            <div className="comparison-rules">
              <div>
                <b>同一受试者</b>
                <span>按同一受试者 ID 校验；检查日期必须有效且早于当前，不以导入时间推断。</span>
              </div>
              <div>
                <b>可追溯</b>
                <span>差值保留 method / source / comparability；缺失值不填充。</span>
              </div>
              <div>
                <b>非预测</b>
                <span>结果描述两次检查的差异，不推断未来事件。</span>
              </div>
            </div>
          </Section>

          <div className="cta-disclaimer">
            <CircleAlert size={12} />
            研究原型。配准与差值结果需医生复核；不用于临床诊断、风险预测或治疗决策。
          </div>
        </aside>
      </div>
    </div>
  )
}
