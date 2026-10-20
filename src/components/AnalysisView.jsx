import React from 'react'
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FileText,
  GitBranch,
  HeartPulse,
  Layers,
  ScanLine,
  Sparkles,
  Target,
  Waves,
} from 'lucide-react'
import ViewHeader from './ViewHeader.jsx'
import { Badge, Button, Section, Stat } from './ui.jsx'
import StudyAnalysisView from './StudyAnalysisView.jsx'
import { useStudy } from '../study/StudyContext.jsx'
import { useI18n } from '../i18n.js'

const SEGMENTS = [
  { id: 1, nameKey: 'analysis.seg1', territory: 'LAD', ring: 'basal', center: -90, perfusion: 'severe', stenosis: 70, wmaKey: 'analysis.wmaHypo', viability: 92 },
  { id: 2, nameKey: 'analysis.seg2', territory: 'LAD', ring: 'basal', center: -150, perfusion: 'mild', stenosis: 70, wmaKey: 'analysis.wmaNormal', viability: 96 },
  { id: 3, nameKey: 'analysis.seg3', territory: 'RCA', ring: 'basal', center: 150, perfusion: 'normal', stenosis: 0, wmaKey: 'analysis.wmaNormal', viability: 98 },
  { id: 4, nameKey: 'analysis.seg4', territory: 'RCA', ring: 'basal', center: 90, perfusion: 'normal', stenosis: 30, wmaKey: 'analysis.wmaNormal', viability: 97 },
  { id: 5, nameKey: 'analysis.seg5', territory: 'LCX', ring: 'basal', center: 30, perfusion: 'mild', stenosis: 22, wmaKey: 'analysis.wmaNormal', viability: 96 },
  { id: 6, nameKey: 'analysis.seg6', territory: 'LCX', ring: 'basal', center: -30, perfusion: 'normal', stenosis: 0, wmaKey: 'analysis.wmaNormal', viability: 98 },
  { id: 7, nameKey: 'analysis.seg7', territory: 'LAD', ring: 'mid', center: -90, perfusion: 'severe', stenosis: 70, wmaKey: 'analysis.wmaHypo', viability: 91 },
  { id: 8, nameKey: 'analysis.seg8', territory: 'LAD', ring: 'mid', center: -150, perfusion: 'mild', stenosis: 70, wmaKey: 'analysis.wmaNormal', viability: 95 },
  { id: 9, nameKey: 'analysis.seg9', territory: 'RCA', ring: 'mid', center: 150, perfusion: 'normal', stenosis: 0, wmaKey: 'analysis.wmaNormal', viability: 98 },
  { id: 10, nameKey: 'analysis.seg10', territory: 'RCA', ring: 'mid', center: 90, perfusion: 'normal', stenosis: 30, wmaKey: 'analysis.wmaNormal', viability: 97 },
  { id: 11, nameKey: 'analysis.seg11', territory: 'LCX', ring: 'mid', center: 30, perfusion: 'mild', stenosis: 22, wmaKey: 'analysis.wmaNormal', viability: 97 },
  { id: 12, nameKey: 'analysis.seg12', territory: 'LCX', ring: 'mid', center: -30, perfusion: 'normal', stenosis: 0, wmaKey: 'analysis.wmaNormal', viability: 98 },
  { id: 13, nameKey: 'analysis.seg13', territory: 'LAD', ring: 'apical', center: -90, perfusion: 'severe', stenosis: 70, wmaKey: 'analysis.wmaHypo', viability: 90 },
  { id: 14, nameKey: 'analysis.seg14', territory: 'LAD', ring: 'apical', center: 180, perfusion: 'mild', stenosis: 70, wmaKey: 'analysis.wmaNormal', viability: 94 },
  { id: 15, nameKey: 'analysis.seg15', territory: 'RCA', ring: 'apical', center: 90, perfusion: 'normal', stenosis: 0, wmaKey: 'analysis.wmaNormal', viability: 97 },
  { id: 16, nameKey: 'analysis.seg16', territory: 'LCX', ring: 'apical', center: 0, perfusion: 'normal', stenosis: 0, wmaKey: 'analysis.wmaNormal', viability: 98 },
  { id: 17, nameKey: 'analysis.seg17', territory: 'LAD', ring: 'apex', center: 0, perfusion: 'mild', stenosis: 70, wmaKey: 'analysis.wmaNormal', viability: 93 },
]

const PERF_STYLE = {
  severe: { fill: 'rgba(168, 67, 59, .82)', stroke: '#c87b6e', labelKey: 'analysis.perfSevereLabel' },
  mild: { fill: 'rgba(151, 111, 56, .72)', stroke: '#b9945d', labelKey: 'analysis.perfMildLabel' },
  normal: { fill: 'rgba(42, 92, 88, .7)', stroke: '#527f7c', labelKey: 'analysis.perfNormalLabel' },
}

const RING_KEYS = {
  basal: 'analysis.ringBasal',
  mid: 'analysis.ringMid',
  apical: 'analysis.ringApical',
  apex: 'analysis.ringApex',
}

const RING_GEOMETRY = {
  basal: { rIn: 128, rOut: 164, span: 58 },
  mid: { rIn: 87, rOut: 124, span: 58 },
  apical: { rIn: 38, rOut: 83, span: 88 },
}

function polar(cx, cy, radius, angle) {
  const rad = (angle * Math.PI) / 180
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)]
}

function ringPath(cx, cy, rIn, rOut, start, end) {
  const [x1, y1] = polar(cx, cy, rIn, start)
  const [x2, y2] = polar(cx, cy, rOut, start)
  const [x3, y3] = polar(cx, cy, rOut, end)
  const [x4, y4] = polar(cx, cy, rIn, end)
  const large = end - start > 180 ? 1 : 0
  return `M ${x1} ${y1} L ${x2} ${y2} A ${rOut} ${rOut} 0 ${large} 1 ${x3} ${y3} L ${x4} ${y4} A ${rIn} ${rIn} 0 ${large} 0 ${x1} ${y1} Z`
}

function AhaBullseye({ selected, onSelect }) {
  const { t } = useI18n()
  const size = 380
  const cx = 190
  const cy = 190
  const selectedSegment = SEGMENTS.find((segment) => segment.id === selected)
  return (
    <svg className="aha-bullseye" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={t('analysis.bullseye')}>
      <defs>
        <radialGradient id="bullseyeCenter" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#173437" />
          <stop offset="1" stopColor="#091417" />
        </radialGradient>
        <filter id="bullseyeGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx={cx} cy={cy} r="172" fill="none" stroke="rgba(74, 111, 119, .2)" strokeWidth="0.8" />
      <circle cx={cx} cy={cy} r="166" fill="none" stroke="rgba(74, 111, 119, .1)" strokeWidth="0.6" strokeDasharray="2 4" />

      {SEGMENTS.filter((segment) => segment.ring !== 'apex').map((segment) => {
        const geometry = RING_GEOMETRY[segment.ring]
        const start = segment.center - geometry.span / 2
        const end = segment.center + geometry.span / 2
        const active = selected === segment.id
        const style = PERF_STYLE[segment.perfusion]
        const [tx, ty] = polar(cx, cy, (geometry.rIn + geometry.rOut) / 2, segment.center)
        return (
          <g key={segment.id} className="aha-segment" onClick={() => onSelect(segment.id)}>
            <path
              d={ringPath(cx, cy, geometry.rIn, geometry.rOut, start, end)}
              fill={style.fill}
              stroke={active ? '#b9f3e7' : 'rgba(7, 16, 18, .82)'}
              strokeWidth={active ? 2.4 : 1.4}
              filter={active ? 'url(#bullseyeGlow)' : undefined}
            />
            <text x={tx} y={ty + 2.5} textAnchor="middle" className={`aha-number ${active ? 'active' : ''}`}>
              {segment.id}
            </text>
          </g>
        )
      })}

      <circle
        cx={cx}
        cy={cy}
        r="35"
        fill="url(#bullseyeCenter)"
        stroke={selected === 17 ? '#b9f3e7' : 'rgba(85, 126, 126, .6)'}
        strokeWidth={selected === 17 ? 2.4 : 1}
        onClick={() => onSelect(17)}
        className="aha-segment"
      />
      <text x={cx} y={cy - 3} textAnchor="middle" className="aha-center-label">17</text>
      <text x={cx} y={cy + 11} textAnchor="middle" className="aha-center-sub">APEX</text>

      <g className="aha-territory-labels">
        <text x={cx} y="11" textAnchor="middle" className="territory lad">LAD</text>
        <text x="20" y={cy - 34} className="territory lcx">LCX</text>
        <text x={size - 20} y={cy + 42} textAnchor="end" className="territory rca">RCA</text>
      </g>
      <g transform={`translate(190 ${size - 3})`}>
        <text textAnchor="middle" className="aha-selected-label">
          {selectedSegment ? `${String(selectedSegment.id).padStart(2, '0')} · ${t(selectedSegment.nameKey)} · ${selectedSegment.territory}` : 'AHA 17-SEGMENT MODEL'}
        </text>
      </g>
    </svg>
  )
}

function FfrChart() {
  const { t } = useI18n()
  const width = 360
  const height = 154
  const plot = { left: 34, right: 346, top: 17, bottom: 123 }
  const x = (mm) => plot.left + (mm / 80) * (plot.right - plot.left)
  const y = (ffr) => plot.bottom - ((ffr - 0.6) / 0.4) * (plot.bottom - plot.top)
  const points = []
  for (let mm = 0; mm <= 80; mm += 1) {
    let ffr = 0.985 - mm * 0.0004
    if (mm > 20 && mm < 36) {
      const t = (mm - 20) / 16
      ffr -= 0.2 * (t * t * (3 - 2 * t))
    } else if (mm >= 36) {
      ffr -= 0.2
    }
    points.push([x(mm), y(ffr)])
  }
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(' ')
  return (
    <svg className="ffr-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('analysis.ffrAria')}>
      <rect width={width} height={height} fill="transparent" />
      {[0.6, 0.7, 0.8, 0.9, 1.0].map((value) => (
        <g key={value}>
          <line x1={plot.left} y1={y(value)} x2={plot.right} y2={y(value)} className={value === 0.8 ? 'chart-threshold-line' : 'chart-gridline'} />
          <text x={plot.left - 6} y={y(value) + 2} textAnchor="end" className="chart-axis-text">{value.toFixed(1)}</text>
        </g>
      ))}
      {[0, 20, 40, 60, 80].map((value) => (
        <g key={value}>
          <line x1={x(value)} y1={plot.top} x2={x(value)} y2={plot.bottom} className="chart-gridline" />
          <text x={x(value)} y={plot.bottom + 11} textAnchor="middle" className="chart-axis-text">{value}</text>
        </g>
      ))}
      <path
        d={`${path} L ${x(80)} ${plot.bottom} L ${x(0)} ${plot.bottom} Z`}
        fill="rgba(126, 78, 62, .12)"
      />
      <path d={path} fill="none" stroke="#e4ad74" strokeWidth="1.6" />
      <line x1={x(21)} y1={y(0.6)} x2={x(21)} y2={plot.top} className="chart-lesion-line" />
      <line x1={x(37)} y1={y(0.6)} x2={x(37)} y2={plot.top} className="chart-lesion-line" />
      <rect x={x(21)} y={plot.top} width={x(37) - x(21)} height={plot.bottom - plot.top} fill="rgba(168, 78, 64, .08)" />
      <circle cx={x(34)} cy={y(0.782)} r="3.2" fill="#efb36b" stroke="#ffd7a4" strokeWidth="1" />
      <text x={x(34) + 7} y={y(0.782) - 6} className="chart-callout">FFR-CT 0.78</text>
      <text x={x(29)} y={plot.top + 9} textAnchor="middle" className="chart-lesion-label">LAD LESION</text>
      <text x={plot.left} y={plot.top - 5} className="chart-title-sub">PRESSURE RATIO · HYPEREMIA</text>
      <text x={plot.right} y={height - 3} textAnchor="end" className="chart-axis-unit">DISTANCE (mm)</text>
    </svg>
  )
}

function PvLoop() {
  const { t } = useI18n()
  const width = 360
  const height = 154
  const plot = { left: 34, right: 340, top: 18, bottom: 124 }
  const x = (volume) => plot.left + ((volume - 50) / 110) * (plot.right - plot.left)
  const y = (pressure) => plot.bottom - (pressure / 140) * (plot.bottom - plot.top)
  return (
    <svg className="pv-loop" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('analysis.pvAria')}>
      <rect width={width} height={height} fill="transparent" />
      {[0, 40, 80, 120].map((pressure) => (
        <g key={pressure}>
          <line x1={plot.left} y1={y(pressure)} x2={plot.right} y2={y(pressure)} className="chart-gridline" />
          <text x={plot.left - 6} y={y(pressure) + 2} textAnchor="end" className="chart-axis-text">{pressure}</text>
        </g>
      ))}
      {[60, 80, 100, 120, 140].map((volume) => (
        <g key={volume}>
          <line x1={x(volume)} y1={plot.top} x2={x(volume)} y2={plot.bottom} className="chart-gridline" />
          <text x={x(volume)} y={plot.bottom + 11} textAnchor="middle" className="chart-axis-text">{volume}</text>
        </g>
      ))}
      <path
        d={`M ${x(142)} ${y(10)} C ${x(144)} ${y(65)} ${x(136)} ${y(116)} ${x(112)} ${y(121)} L ${x(96)} ${y(123)} C ${x(74)} ${y(122)} ${x(65)} ${y(108)} ${x(64)} ${y(86)} C ${x(62)} ${y(54)} ${x(66)} ${y(22)} ${x(82)} ${y(12)} C ${x(100)} ${y(4)} ${x(126)} ${y(6)} ${x(142)} ${y(10)} Z`}
        fill="rgba(101, 167, 155, .12)"
        stroke="rgba(107, 198, 183, .72)"
        strokeWidth="1.5"
      />
      <line x1={x(64)} y1={plot.bottom} x2={x(143)} y2={y(135)} stroke="rgba(189, 143, 83, .48)" strokeDasharray="3 4" />
      <circle cx={x(142)} cy={y(10)} r="3" fill="#7bd6c6" />
      <circle cx={x(64)} cy={y(86)} r="3" fill="#efb36b" />
      <text x={x(142) - 4} y={y(10) - 7} textAnchor="end" className="chart-callout">EDV 142</text>
      <text x={x(64) + 7} y={y(86) + 12} className="chart-callout">ESV 65</text>
      <text x={x(102)} y={y(60)} textAnchor="middle" className="chart-loop-label">SV 77 mL</text>
      <text x={plot.left} y={plot.top - 5} className="chart-title-sub">PV LOOP · 72 BPM</text>
      <text x={plot.right} y={height - 3} textAnchor="end" className="chart-axis-unit">LV VOLUME (mL)</text>
    </svg>
  )
}

export default function AnalysisView(props) {
  const { isApi } = useStudy()
  if (isApi) return <StudyAnalysisView {...props} />
  return <DemoAnalysisView {...props} />
}

function DemoAnalysisView({ notify, onReport, onNavigate }) {
  const { t } = useI18n()
  const [selected, setSelected] = React.useState(7)
  const segment = SEGMENTS.find((item) => item.id === selected)

  return (
    <div className="module-view analysis-view">
      <ViewHeader
        index="05"
        eyebrow="QUANTITATIVE ANALYSIS"
        title={t('analysis.title')}
        titleSuffix="MULTIMODAL"
        description={t('analysis.description')}
        meta={
          <>
            <span>AHA 17-SEGMENT</span>
            <i />
            <span>FFR-CT</span>
            <i />
            <span>AI SYNTHESIS</span>
          </>
        }
        actions={
          <>
            <Badge tone="teal" dot>{t('analysis.fused')}</Badge>
            <Button variant="outline" size="sm" icon={<FileText size={14} />} onClick={onReport}>
              {t('analysis.openReport')}
            </Button>
          </>
        }
      />

      <div className="module-body">
        <div className="viewer analysis-viewer">
          <div className="analysis-top-strip">
            <div className="analysis-risk-chips">
              <span><b>12%</b> {t('analysis.burden')}</span>
              <span><b>9%</b> {t('analysis.reversible')}</span>
              <span><b>91%</b> {t('analysis.viable')}</span>
              <span><b>0.78</b> FFR-CT</span>
            </div>
            <div className="analysis-updated"><Sparkles size={11} /> {t('analysis.fusionLine')}</div>
          </div>

          <div className="analysis-grid">
            <div className="analysis-card bullseye-card">
              <div className="analysis-card-head">
                <div>
                  <span className="analysis-kicker">MYOCARDIAL PERFUSION / AHA 17</span>
                  <h2>{t('analysis.perfusion')}</h2>
                </div>
                <div className="analysis-legend">
                  <span><i className="perf-normal" />{t('analysis.perfNormal')}</span>
                  <span><i className="perf-mild" />{t('analysis.perfMild')}</span>
                  <span><i className="perf-severe" />{t('analysis.perfSevere')}</span>
                </div>
              </div>
              <div className="bullseye-wrap">
                <AhaBullseye selected={selected} onSelect={setSelected} />
                <div className="bullseye-side">
                  <div className="territory-card lad">
                    <span>LAD</span>
                    <b>{t('analysis.ladTerritory')}</b>
                    <em>{t('analysis.ladBurden')}</em>
                  </div>
                  <div className="territory-card lcx">
                    <span>LCX</span>
                    <b>{t('analysis.lcxTerritory')}</b>
                    <em>{t('analysis.lcxBurden')}</em>
                  </div>
                  <div className="territory-card rca">
                    <span>RCA</span>
                    <b>{t('analysis.rcaTerritory')}</b>
                    <em>{t('analysis.rcaBurden')}</em>
                  </div>
                </div>
              </div>
              <div className="bullseye-foot">
                <span>{t('analysis.stress')}</span>
                <span>{t('analysis.ladDefect')}</span>
              </div>
            </div>

            <div className="analysis-charts">
              <div className="analysis-card chart-card">
                <div className="analysis-card-head compact">
                  <div>
                    <span className="analysis-kicker">FFR-CT PULLBACK / LAD</span>
                    <h2>{t('analysis.hemo')}</h2>
                  </div>
                  <Badge tone="amber">FFR 0.78</Badge>
                </div>
                <FfrChart />
                <div className="chart-foot">
                  <span>ΔP 24 mmHg</span>
                  <span>{t('analysis.lesionLength')}</span>
                  <span>{t('analysis.distalRatio')}</span>
                </div>
              </div>

              <div className="analysis-card chart-card">
                <div className="analysis-card-head compact">
                  <div>
                    <span className="analysis-kicker">LEFT VENTRICULAR FUNCTION</span>
                    <h2>{t('analysis.pv')}</h2>
                  </div>
                  <Badge tone="teal">EF 54%</Badge>
                </div>
                <PvLoop />
                <div className="chart-foot">
                  <span>GLS -16.8%</span>
                  <span>E/e' 9.4</span>
                  <span>{t('analysis.sv')}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="analysis-bottom">
            <div className="analysis-evidence">
              <span className="analysis-evidence-title">EVIDENCE TRAIL</span>
              <div><Layers size={12} /><b>CCTA</b><span>LAD 70% · {t('analysis.calcium')} 286</span><CheckCircle2 size={11} /></div>
              <ChevronRight size={11} />
              <div><ScanLine size={12} /><b>QCA</b><span>MLD 0.96 · RVD 3.20</span><CheckCircle2 size={11} /></div>
              <ChevronRight size={11} />
              <div><Waves size={12} /><b>ECHO</b><span>{t('analysis.echoWall')}</span><CheckCircle2 size={11} /></div>
            </div>
            <Button variant="ghost" size="sm" icon={<ArrowUpRight size={13} />} onClick={() => onNavigate('angio')}>
              {t('analysis.viewSource')}
            </Button>
          </div>
        </div>

        <aside className="inspector analysis-inspector">
          <div className="analysis-hero">
            <div className="selection-eyebrow">
              <span>AI MULTIMODAL SYNTHESIS</span>
              <span className="selection-id">CONF · 96.4%</span>
            </div>
            <div className="analysis-hero-head">
              <span className="analysis-severity" />
              <div>
                <h2>{t('analysis.heroTitle')}</h2>
                <p>{t('analysis.heroSub')}</p>
              </div>
            </div>
            <div className="analysis-hero-stats">
              <div><span>{t('analysis.ds')}</span><b>70<small>%</small></b></div>
              <div><span>FFR-CT</span><b>0.78</b></div>
              <div><span>{t('analysis.burdenShort')}</span><b>12<small>%</small></b></div>
            </div>
            <div className="analysis-conclusion">
              <CircleAlert size={13} />
              <p>{t('analysis.conclusion')}</p>
            </div>
          </div>

          <Section title={t('analysis.segment')} code="AHA SEGMENT" right={<Target size={13} />}>
            {segment ? (
              <div className="segment-detail">
                <div className="segment-detail-head">
                  <span className="segment-id">{String(segment.id).padStart(2, '0')}</span>
                  <div>
                    <b>{t(segment.nameKey)}</b>
                    <small>{t('analysis.territory', { vessel: segment.territory, ring: t(RING_KEYS[segment.ring]) })}</small>
                  </div>
                  <span className={`segment-perfusion ${segment.perfusion}`}>{t(PERF_STYLE[segment.perfusion].labelKey)}</span>
                </div>
                <div className="segment-metrics">
                  <Stat label={t('analysis.vesselStenosis')} value={segment.stenosis} unit="%" accent={segment.stenosis >= 50 ? 'amber' : undefined} />
                  <Stat label={t('analysis.wma')} value={t(segment.wmaKey)} />
                  <Stat label={t('analysis.viability')} value={segment.viability} unit="%" />
                </div>
                <div className="segment-bar">
                  <span>{t('analysis.reserve')}</span>
                  <div><i style={{ width: `${segment.viability}%` }} /></div>
                  <b>{segment.viability}%</b>
                </div>
              </div>
            ) : null}
          </Section>

          <Section title={t('analysis.risk')} code="RISK STRATIFICATION" right={<Activity size={13} />}>
            <div className="risk-grid">
              <div><span>SYNTAX SCORE</span><b>12</b><em>{t('analysis.syntaxRisk')}</em></div>
              <div><span>10Y MACE</span><b>8.4%</b><em>{t('analysis.mace')}</em></div>
              <div><span>{t('analysis.calcium')}</span><b>286</b><em>Agatston</em></div>
              <div><span>{t('analysis.massIndex')}</span><b>58</b><em>g/m²</em></div>
            </div>
          </Section>

          <Section title={t('analysis.path')} code="HEART TEAM" right={<GitBranch size={13} />}>
            <div className="treatment-path">
              <div className="path-step done">
                <span>01</span>
                <div><b>{t('analysis.path1')}</b><small>{t('analysis.path1sub')}</small></div>
              </div>
              <div className="path-step active">
                <span>02</span>
                <div><b>{t('analysis.path2')}</b><small>{t('analysis.path2sub')}</small></div>
              </div>
              <div className="path-step">
                <span>03</span>
                <div><b>{t('analysis.path3')}</b><small>{t('analysis.path3sub')}</small></div>
              </div>
            </div>
          </Section>

          <Section title={t('analysis.evidence')} code="SOURCE STUDIES" right={<HeartPulse size={13} />}>
            <div className="source-studies">
              <div><Layers size={13} /><span>CCTA · 0.5 mm</span><b>{t('analysis.done')}</b></div>
              <div><ScanLine size={13} /><span>ICA / QCA</span><b>{t('analysis.done')}</b></div>
              <div><Waves size={13} /><span>Echo · GLS</span><b>{t('analysis.done')}</b></div>
              <div><Activity size={13} /><span>FFR-CT</span><b>{t('analysis.aiEstimate')}</b></div>
            </div>
          </Section>

          <div className="analysis-actions">
            <Button variant="outline" size="sm" onClick={() => notify(t('analysis.syncToast'))}>{t('analysis.sync')}</Button>
            <Button variant="primary" size="sm" icon={<FileText size={14} />} onClick={onReport}>{t('analysis.makeReport')}</Button>
          </div>
        </aside>
      </div>
    </div>
  )
}
