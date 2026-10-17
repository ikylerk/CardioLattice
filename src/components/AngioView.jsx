import React from 'react'
import {
  Activity,
  Camera,
  Check,
  ChevronRight,
  CircleAlert,
  Crosshair,
  Gauge,
  Loader2,
  Pause,
  Play,
  ScanLine,
  Syringe,
  Tag,
  Target,
} from 'lucide-react'
import ViewHeader from './ViewHeader.jsx'
import AngleMap from './AngleMap.jsx'
import CarmDiagram from './CarmDiagram.jsx'
import { Badge, Button, IconButton, Section, Segmented, Slider, Stat, Toggle } from './ui.jsx'
import AngioEngine from '../three/AngioEngine.js'
import { useI18n } from '../i18n.js'

const SIDE_OPTIONS = [
  { value: 'left', labelKey: 'angio.left' },
  { value: 'right', labelKey: 'angio.right' },
  { value: 'both', labelKey: 'angio.both' },
]

const MODE_OPTIONS = [
  { value: 'fluoro', labelKey: 'angio.fluoro' },
  { value: 'dsa', labelKey: 'angio.dsa' },
  { value: 'bone', labelKey: 'angio.bone' },
]

const PRESETS = {
  left: [
    { label: 'LAO Cranial', subKey: 'angio.subLadBif', rot: 30, tilt: 30 },
    { label: 'RAO Cranial', subKey: 'angio.subLadSeptal', rot: -30, tilt: 30 },
    { label: 'LAO Caudal', subKey: 'angio.subLcxLm', rot: 45, tilt: -30 },
    { label: 'RAO Caudal', subKey: 'angio.subLcxDistal', rot: -30, tilt: -30 },
    { label: 'Spider', subKey: 'angio.subSpider', rot: 45, tilt: -35 },
    { label: 'AP Cranial', subKey: 'angio.subLadMid', rot: 0, tilt: 30 },
  ],
  right: [
    { label: 'LAO', subKey: 'angio.subRcaProx', rot: 30, tilt: 0 },
    { label: 'RAO', subKey: 'angio.subRcaMid', rot: -30, tilt: 0 },
    { label: 'AP', subKey: 'angio.subRcaOstium', rot: 0, tilt: 0 },
    { label: 'AP Cranial', subKey: 'angio.subRcaDistal', rot: 0, tilt: 30 },
    { label: 'LAO Cranial', subKey: 'angio.subRcaPda', rot: 30, tilt: 30 },
    { label: 'RAO Caudal', subKey: 'angio.subRcaPl', rot: -30, tilt: -30 },
  ],
}

const ANALYSIS_STEPS = [
  'angio.stepCenterline',
  'angio.stepRef',
  'angio.stepMld',
  'angio.stepHemo',
]

const QCA_RESULTS = {
  left: {
    vesselKey: 'angio.ladMid',
    segment: 'AHA 7',
    ds: 70,
    mld: 0.96,
    rvd: 3.2,
    area: 84,
    length: 18,
    ffr: 0.78,
    syntax: 12,
    severity: 'critical',
    confidence: 96.4,
    stent: '3.0 × 18 mm',
    residual: 6,
  },
  right: {
    vesselKey: 'angio.rcaProx',
    segment: 'AHA 1',
    ds: 30,
    mld: 2.8,
    rvd: 4.0,
    area: 42,
    length: 10,
    ffr: 0.91,
    syntax: 0,
    severity: 'mild',
    confidence: 94.1,
    stent: null,
    residual: null,
  },
}

function angleLabel(rot, tilt) {
  const h = `${rot >= 0 ? 'LAO' : 'RAO'} ${Math.abs(rot)}°`
  const v = `${tilt >= 0 ? 'CRA' : 'CAU'} ${Math.abs(tilt)}°`
  return `${h} / ${v}`
}

function downloadDataUrl(dataUrl, name) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = name
  link.click()
}

export default function AngioView({ playing, setPlaying, notify }) {
  const { t } = useI18n()
  const [side, setSide] = React.useState('left')
  const [mode, setMode] = React.useState('fluoro')
  const [rot, setRot] = React.useState(30)
  const [tilt, setTilt] = React.useState(30)
  const [labels, setLabels] = React.useState(true)
  const [frame, setFrame] = React.useState(128)
  const [qca, setQca] = React.useState('idle')
  const [qcaStep, setQcaStep] = React.useState(0)
  const [error, setError] = React.useState('')
  const hostRef = React.useRef(null)
  const engineRef = React.useRef(null)
  const timers = React.useRef([])

  React.useEffect(() => {
    if (!hostRef.current) return undefined
    try {
      engineRef.current = new AngioEngine(hostRef.current, {
        rot,
        tilt,
        side,
        mode,
        playing,
      })
    } catch (err) {
      console.error(err)
      setError('webgl')
    }
    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    engineRef.current?.setAngles(rot, tilt)
  }, [rot, tilt])

  React.useEffect(() => {
    timers.current.forEach((timer) => {
      clearTimeout(timer)
      clearInterval(timer)
    })
    timers.current = []
    engineRef.current?.setSide(side)
    setQca('idle')
    engineRef.current?.setQcaVisible(false)
  }, [side])

  React.useEffect(() => {
    engineRef.current?.setMode(mode)
  }, [mode])

  React.useEffect(() => {
    engineRef.current?.setPlaying(playing)
  }, [playing])

  React.useEffect(() => {
    engineRef.current?.setLabelsVisible(labels)
  }, [labels])

  React.useEffect(() => {
    engineRef.current?.setQcaVisible(qca === 'done')
  }, [qca])

  React.useEffect(() => {
    if (!playing) return undefined
    const timer = setInterval(() => setFrame((value) => (value + 1) % 10000), 66)
    return () => clearInterval(timer)
  }, [playing])

  React.useEffect(
    () => () => {
      timers.current.forEach((timer) => clearTimeout(timer))
      timers.current.forEach((timer) => clearInterval(timer))
    },
    [],
  )

  const clearTimers = () => {
    timers.current.forEach((timer) => {
      clearTimeout(timer)
      clearInterval(timer)
    })
    timers.current = []
  }

  const runQca = () => {
    if (qca === 'analyzing') return
    clearTimers()
    setQca('analyzing')
    setQcaStep(0)
    ANALYSIS_STEPS.forEach((_, index) => {
      const timer = setTimeout(() => setQcaStep(index + 1), 300 + index * 320)
      timers.current.push(timer)
    })
    const doneTimer = setTimeout(() => setQca('done'), 1700)
    timers.current.push(doneTimer)
  }

  const currentPresets = PRESETS[side === 'right' ? 'right' : 'left']
  const result = QCA_RESULTS[side === 'right' ? 'right' : 'left']
  const vesselName = t(result.vesselKey)
  const sideOptions = SIDE_OPTIONS.map((item) => ({ ...item, label: t(item.labelKey) }))
  const modeOptions = MODE_OPTIONS.map((item) => ({ ...item, label: t(item.labelKey) }))
  const presetActive = (preset) => preset.rot === rot && preset.tilt === tilt

  const capture = () => {
    const url = engineRef.current?.capture()
    if (url) {
      downloadDataUrl(url, `Angio_${side}_${rot}_${tilt}.png`)
      notify(t('angio.exportToast'))
    }
  }

  return (
    <div className="module-view angio-view">
      <ViewHeader
        index="02"
        eyebrow="CORONARY ANGIOGRAPHY"
        title={t('angio.title')}
        titleSuffix="FLUOROSCOPY"
        description={t('angio.description')}
        meta={
          <>
            <span>LCA / RCA</span>
            <i />
            <span>{t('angio.dominance')}</span>
            <i />
            <span>15 FPS CINE</span>
          </>
        }
        actions={
          <>
            <Badge tone="amber" dot>{t('angio.simulated')}</Badge>
            <Button variant="outline" size="sm" icon={<Camera size={14} />} onClick={capture}>
              {t('angio.export')}
            </Button>
          </>
        }
      />

      <div className="module-body">
        <div className="viewer angio-viewer">
          {error ? <div className="webgl-error">{t('angio.webgl')}</div> : null}
          <div className="angio-viewer-grid" />
          <div className="angio-viewer-head">
            <div className="angio-system-tabs">
              <Segmented options={sideOptions} value={side} onChange={setSide} ariaLabel={t('angio.sideAria')} />
            </div>
            <div className="angio-head-right">
              <div className="angio-display-tabs">
                <Segmented options={modeOptions} value={mode} onChange={setMode} ariaLabel={t('angio.modeAria')} />
              </div>
              <div className="floating-toolbar">
                <IconButton label={t('angio.labels')} className={labels ? 'active' : ''} onClick={() => setLabels((v) => !v)}>
                  <Tag size={15} />
                </IconButton>
                <IconButton label={t('angio.reinject')} onClick={() => engineRef.current?.inject()}>
                  <Syringe size={15} />
                </IconButton>
              </div>
            </div>
          </div>

          <div className="angio-screen-area">
            <div className="angio-monitor">
              <div className="angio-monitor-bezel">
                <div className={`angio-film film-${mode}`}>
                  <div className="angio-canvas-host" ref={hostRef} />
                  <div className="film-corner tl" />
                  <div className="film-corner tr" />
                  <div className="film-corner bl" />
                  <div className="film-corner br" />
                  <div className="angio-film-top">
                    <span className="film-live"><i /> LIVE FLUORO</span>
                    <span className="film-system">{side === 'right' ? 'RCA · RIGHT CORONARY' : side === 'left' ? 'LCA · LEFT CORONARY' : 'LCA + RCA · BILATERAL'}</span>
                    <span className="film-angle">{angleLabel(rot, tilt)}</span>
                  </div>
                  <div className="angio-film-bottom">
                    <div>
                      <span>FRAME {String(frame).padStart(4, '0')}</span>
                      <span>CINE 15 FPS</span>
                      <span>ARTERIAL PHASE</span>
                    </div>
                    <span className="film-disclaimer">NON-DIAGNOSTIC SIMULATION</span>
                  </div>
                  <div className="film-reticle" aria-hidden="true">
                    <span />
                  </div>
                  <div className="film-side-mark left">R</div>
                  <div className="film-side-mark right">L</div>
                </div>
              </div>
              <div className="monitor-caption">
                <span>MONITOR 1 · CATH LAB VIEW</span>
                <span>ZOOM 1.0× · 512 × 512 MATRIX</span>
              </div>
            </div>

            <div className="angio-console">
              <div className="cine-controls">
                <button type="button" className="console-play" onClick={() => setPlaying(!playing)} aria-label={playing ? t('angio.pause') : t('angio.play')}>
                  {playing ? <Pause size={13} /> : <Play size={13} />}
                </button>
                <div className="cine-copy">
                  <b>CINE LOOP</b>
                  <small>{playing ? 'PLAYING · 15 FPS' : 'PAUSED'}</small>
                </div>
                <div className="cine-progress">
                  <span style={{ animationPlayState: playing ? 'running' : 'paused' }} />
                </div>
              </div>
              <div className="bolus-strip">
                <span className="bolus-label">CONTRAST</span>
                <div className="bolus-bar">
                  <i style={{ animationPlayState: playing ? 'running' : 'paused' }} />
                  <span className="bolus-marker" style={{ animationPlayState: playing ? 'running' : 'paused' }} />
                </div>
                <button type="button" onClick={() => engineRef.current?.inject()}>
                  <Syringe size={11} /> {t('angio.inject')}
                </button>
              </div>
              <button type="button" className="console-qca" onClick={runQca}>
                <Target size={11} />
                QCA
              </button>
              <div className="console-readout">
                <div><span>MASKS</span><b>02</b></div>
                <div><span>FOV</span><b>18 cm</b></div>
                <div><span>DOSE</span><b>0.8 Gy·cm²</b></div>
              </div>
            </div>
          </div>
        </div>

        <aside className="inspector angio-inspector">
          <div className="angio-inspector-head">
            <div>
              <span className="selection-eyebrow">ACTIVE PROJECTION</span>
              <h2>{angleLabel(rot, tilt)}</h2>
              <p>{side === 'right' ? t('angio.rightSystem') : side === 'left' ? t('angio.leftSystem') : t('angio.bothSystem')}</p>
            </div>
            <span className="projection-id">PROJ · 04</span>
          </div>

          <Section title={t('angio.angles')} code="C-ARM ANGLES" right={<Gauge size={13} />} className="projection-section">
            <div className="angle-pair">
              <div>
                <span>HORIZONTAL</span>
                <strong>{rot >= 0 ? 'LAO' : 'RAO'} <em>{Math.abs(rot)}°</em></strong>
              </div>
              <div>
                <span>ANGULATION</span>
                <strong>{tilt >= 0 ? 'CRA' : 'CAU'} <em>{Math.abs(tilt)}°</em></strong>
              </div>
            </div>
            <div className="angle-slider-block">
              <Slider
                label="RAO 90° ↔ LAO 90°"
                min={-90}
                max={90}
                value={rot}
                onChange={(value) => setRot(value)}
                format={(value) => `${Math.abs(value)}°`}
                ticks={['RAO 90', '0', 'LAO 90']}
              />
            </div>
            <div className="angle-slider-block">
              <Slider
                label="CAU 45° ↔ CRA 45°"
                min={-45}
                max={45}
                value={tilt}
                onChange={(value) => setTilt(value)}
                format={(value) => `${Math.abs(value)}°`}
                ticks={['CAU 45', '0', 'CRA 45']}
              />
            </div>
          </Section>

          <Section title={t('angio.presets')} code="PRESETS" right={<span className="section-hint">{t('common.presets', { count: currentPresets.length })}</span>} className="presets-section">
            <div className="angio-presets">
              {currentPresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={presetActive(preset) ? 'active' : ''}
                  onClick={() => {
                    setRot(preset.rot)
                    setTilt(preset.tilt)
                  }}
                >
                  <b>{preset.label}</b>
                  <small>{t(preset.subKey)}</small>
                  <em>
                    {preset.rot >= 0 ? 'LAO' : 'RAO'} {Math.abs(preset.rot)} · {preset.tilt >= 0 ? 'CRA' : 'CAU'} {Math.abs(preset.tilt)}
                  </em>
                </button>
              ))}
            </div>
            <AngleMap
              rot={rot}
              tilt={tilt}
              presets={currentPresets}
              onPick={(preset) => {
                setRot(preset.rot)
                setTilt(preset.tilt)
              }}
            />
          </Section>

          <Section
            title={t('angio.qca')}
            code="AUTOMATED QCA"
            className="qca-section"
            right={<Badge tone={qca === 'done' ? (result.severity === 'critical' ? 'red' : 'teal') : 'neutral'}>{qca === 'done' ? t('angio.qcaDone') : qca === 'analyzing' ? t('angio.qcaRunning') : t('angio.qcaIdle')}</Badge>}
          >
            {qca === 'idle' ? (
              <div className="qca-idle">
                <div className="qca-idle-visual">
                  <span className="qca-target"><Target size={18} /></span>
                  <div>
                    <b>{vesselName} · {result.segment}</b>
                    <small>{t('angio.qcaFit')}</small>
                  </div>
                </div>
                <p>{t('angio.qcaIdleBody')}</p>
                <Button variant="primary" size="sm" onClick={runQca} icon={<ScanLine size={14} />}>
                  {t('angio.runQca')}
                </Button>
              </div>
            ) : null}

            {qca === 'analyzing' ? (
              <div className="qca-analyzing">
                <div className="analyzing-head">
                  <Loader2 size={14} className="spin" />
                  <b>{t('angio.analyzing', { vessel: vesselName })}</b>
                  <span>{Math.min(100, Math.round((qcaStep / ANALYSIS_STEPS.length) * 100))}%</span>
                </div>
                <div className="analysis-progress">
                  <i style={{ width: `${(qcaStep / ANALYSIS_STEPS.length) * 100}%` }} />
                </div>
                <div className="analysis-steps">
                  {ANALYSIS_STEPS.map((step, index) => (
                    <div key={step} className={index < qcaStep ? 'done' : index === qcaStep ? 'active' : ''}>
                      <span>{index < qcaStep ? <Check size={10} /> : index + 1}</span>
                      {t(step)}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {qca === 'done' ? (
              <div className={`qca-result ${result.severity}`}>
                <div className="qca-result-head">
                  <div>
                    <span>DIAMETER STENOSIS</span>
                    <strong>{result.ds}<small>%</small></strong>
                  </div>
                  <Badge tone={result.severity === 'critical' ? 'red' : 'teal'} dot>
                    {result.severity === 'critical' ? t('angio.severe') : t('angio.mild')}
                  </Badge>
                </div>
                <div className="stenosis-track">
                  <i style={{ width: `${result.ds}%` }} />
                  <span style={{ left: `${result.ds}%` }} />
                </div>
                <div className="qca-metric-grid">
                  <Stat label="MLD" value={result.mld.toFixed(2)} unit="mm" />
                  <Stat label="RVD" value={result.rvd.toFixed(2)} unit="mm" />
                  <Stat label={t('angio.area')} value={result.area} unit="%" />
                  <Stat label={t('angio.length')} value={result.length} unit="mm" />
                  <Stat label="FFR-CT" value={result.ffr.toFixed(2)} accent={result.ffr < 0.8 ? 'amber' : undefined} />
                  <Stat label={t('angio.confidence')} value={result.confidence} unit="%" />
                </div>
                <div className="qca-meta">
                  <span>LVEF 54%</span>
                  <span>SYNTAX {result.syntax}</span>
                  <span>{t('angio.refFrame')}</span>
                </div>
                <div className="qca-conclusion">
                  <CircleAlert size={14} />
                  <p>
                    {result.severity === 'critical' ? t('angio.conclusionSevere') : t('angio.conclusionMild')}
                  </p>
                </div>
                {result.stent ? (
                  <div className="stent-plan">
                    <div>
                      <span>{t('angio.virtualPci')}</span>
                      <b>{result.stent}</b>
                    </div>
                    <ChevronRight size={14} />
                    <div>
                      <span>{t('angio.residual')}</span>
                      <b>{result.residual}%</b>
                    </div>
                  </div>
                ) : null}
                <div className="qca-actions">
                  <Button variant="outline" size="sm" onClick={runQca}>{t('angio.reanalyze')}</Button>
                  <Button variant="ghost" size="sm" onClick={() => notify(t('angio.addReportToast'))}>{t('angio.addReport')}</Button>
                </div>
              </div>
            ) : null}
          </Section>

          <Section title={t('angio.geometry')} code="EQUIPMENT GEOMETRY" right={<Crosshair size={13} />} className="carm-section">
            <CarmDiagram rot={rot} tilt={tilt} />
            <div className="carm-meta">
              <span><i className="dot-source" /> {t('angio.source')}</span>
              <span><i className="dot-detector" /> {t('angio.detector')}</span>
              <span className="carm-sdd">SID 950 mm</span>
            </div>
          </Section>

          <Section title={t('angio.summary')} code="LESION SUMMARY" right={<Activity size={13} />} className="lesion-section">
            <div className="lesion-summary">
              <div className="lesion-summary-head">
                <span className={`severity-dot ${result.severity}`} />
                <div>
                  <b>{vesselName}</b>
                  <small>{result.segment} · {t('angio.dominanceShort')}</small>
                </div>
                <strong>{result.ds}%</strong>
              </div>
              <p>
                {result.severity === 'critical' ? t('angio.summarySevere') : t('angio.summaryMild')}
              </p>
            </div>
          </Section>
        </aside>
      </div>
    </div>
  )
}
