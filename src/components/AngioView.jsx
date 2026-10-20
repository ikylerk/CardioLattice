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
import HeartEngine from '../three/HeartEngine.js'
import Carm3D from './Carm3D.jsx'
import CORONARY_MODEL from '../../shared/coronary_model.json'
import { useI18n } from '../i18n.js'

const SIDE_OPTIONS = [
  { value: 'left', label: '左冠 LCA' },
  { value: 'right', label: '右冠 RCA' },
  { value: 'both', label: '双侧' },
]

const MODE_OPTIONS = [
  { value: 'fluoro', label: '透视' },
  { value: 'dsa', label: 'DSA' },
  { value: 'bone', label: '骨骼' },
]

const PRESETS = CORONARY_MODEL.projections
const QCA_RESULTS = CORONARY_MODEL.referenceAnalysis
const ANALYSIS_STEPS = CORONARY_MODEL.analysisSteps
const SEGMENTS = CORONARY_MODEL.segments
const MYOCARDIAL_SEGMENTS = Object.fromEntries(
  CORONARY_MODEL.myocardialSegments.map((segment) => [segment.id, segment]),
)
const PRESET_SUB_KEYS = {
  '左主干分叉': 'angio.subSpider',
  'LCX / 远端': 'angio.subLcxDistal',
  'LAD 中远段': 'angio.subLadMid',
  'LAD / 分叉': 'angio.subLadBif',
  'LAD / 间隔': 'angio.subLadSeptal',
  '左冠侧位': 'angio.subLeftLateral',
  '左冠正位': 'angio.subLeftAnterior',
  'RCA 近中段': 'angio.subRcaProx',
  'RCA 中段': 'angio.subRcaMid',
  'RCA 开口': 'angio.subRcaOstium',
  'RCA 远端': 'angio.subRcaDistal',
}
const SEGMENT_NAME_KEYS = { LM: 'anatomy.lm', LAD_MID: 'angio.ladMid', RCA_PROX: 'angio.rcaProx' }

function angleLabel(rot, tilt) {
  const h = `${rot >= 0 ? 'LAO' : 'RAO'} ${Math.abs(rot)}°`
  const v = `${tilt >= 0 ? 'CRA' : 'CAU'} ${Math.abs(tilt)}°`
  return `${h} / ${v}`
}

function readAngioHash() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const a = Number(params.get('a'))
  const b = Number(params.get('b'))
  const system = params.get('sys')
  return {
    rot: params.get('a')?.trim() && Number.isFinite(a) ? Math.max(-90, Math.min(90, a)) : -30,
    tilt: params.get('b')?.trim() && Number.isFinite(b) ? Math.max(-45, Math.min(45, b)) : -30,
    side: system === 'right' ? 'right' : system === 'both' ? 'both' : 'left',
  }
}

function downloadDataUrl(dataUrl, name) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = name
  link.click()
}

export default function AngioView({ playing, setPlaying, notify }) {
  const { lang, t } = useI18n()
  // Keep reference wording until the shared dictionary gains the new feature keys.
  const tr = (key, fallback, vars) => {
    const translated = t(key, vars)
    return translated === key
      ? fallback.replace(/\{(\w+)\}/g, (match, name) => String(vars?.[name] ?? match))
      : translated
  }
  const segmentName = (segment) => tr(
    SEGMENT_NAME_KEYS[segment.id] || `angio.segmentNames.${segment.id}`,
    segment.name,
  )
  const initial = React.useRef(readAngioHash()).current
  const [side, setSide] = React.useState(initial.side)
  const [mode, setMode] = React.useState('fluoro')
  const [rot, setRot] = React.useState(initial.rot)
  const [tilt, setTilt] = React.useState(initial.tilt)
  React.useEffect(() => {
    window.history.replaceState(null, '', `#a=${rot}&b=${tilt}&sys=${side}`)
  }, [rot, tilt, side])
  React.useEffect(() => {
    const applyHash = () => {
      const params = new URLSearchParams(window.location.hash.slice(1))
      if (!params.has('a') && !params.has('b') && !params.has('sys')) return
      const next = readAngioHash()
      setRot(next.rot)
      setTilt(next.tilt)
      setSide(next.side)
    }
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])
  const [labels, setLabels] = React.useState(true)
  const [frame, setFrame] = React.useState(128)
  const [qca, setQca] = React.useState('idle')
  const [qcaStep, setQcaStep] = React.useState(0)
  const [selectedSegmentId, setSelectedSegmentId] = React.useState(null)
  const [skeleton, setSkeleton] = React.useState(true)
  const [seeThrough, setSeeThrough] = React.useState(false)
  const [heartLabels, setHeartLabels] = React.useState(false)
  const [detectorView, setDetectorView] = React.useState(false)
  const [foreshortening, setForeshortening] = React.useState(true)
  const [planes, setPlanes] = React.useState(false)
  const [dominance, setDominance] = React.useState('right')
  const [graftsOn, setGraftsOn] = React.useState(false)
  const [graftVisibility, setGraftVisibility] = React.useState({ LIMA: true, 'SVG-OM': true, 'SVG-PDA': true })
  const [ramusVisible, setRamusVisible] = React.useState(false)
  const [colorMode, setColorMode] = React.useState(false)
  const [error, setError] = React.useState('')
  const hostRef = React.useRef(null)
  const engineRef = React.useRef(null)
  const heartHostRef = React.useRef(null)
  const heartEngineRef = React.useRef(null)
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
      setError('angio.webgl')
    }
    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (!heartHostRef.current) return undefined
    try {
      const engine = new HeartEngine(heartHostRef.current, { bpm: 72, playing })
      heartEngineRef.current = engine
      engine.setMode('xray')
      engine.setContextVisible(true)
      engine.setLabelsVisible(false)
      engine.setAutoRotate(false)
      engine.camera.fov = 52
      engine.camera.updateProjectionMatrix()
      engine.setViewAngle(22, 10, 1.15)
    } catch (err) {
      console.error(err)
    }
    return () => {
      heartEngineRef.current?.dispose()
      heartEngineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    heartEngineRef.current?.setContextVisible(skeleton)
  }, [skeleton])

  React.useEffect(() => {
    heartEngineRef.current?.setMode(seeThrough ? 'xray' : 'all')
  }, [seeThrough])

  React.useEffect(() => {
    heartEngineRef.current?.setLabelsVisible(heartLabels)
  }, [heartLabels])

  React.useEffect(() => {
    heartEngineRef.current?.applyLanguage?.()
  }, [lang])

  React.useEffect(() => {
    if (!detectorView) return
    heartEngineRef.current?.setAutoRotate(false)
    heartEngineRef.current?.setViewAngle(rot, tilt)
  }, [detectorView, rot, tilt])

  React.useEffect(() => {
    engineRef.current?.setDominance(dominance)
  }, [dominance])

  React.useEffect(() => {
    engineRef.current?.setGrafts(graftsOn)
  }, [graftsOn])

  React.useEffect(() => {
    for (const [id, visible] of Object.entries(graftVisibility)) {
      engineRef.current?.setGraft(id, visible)
    }
  }, [graftVisibility])

  React.useEffect(() => {
    engineRef.current?.setRamusVisible(ramusVisible)
  }, [ramusVisible])

  React.useEffect(() => {
    engineRef.current?.setColorMode(colorMode)
  }, [colorMode])

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
    engineRef.current?.setSelectedVessel(null)
    setQca('idle')
    setSelectedSegmentId(null)
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
    const reference = QCA_RESULTS[side === 'right' ? 'right' : 'left']
    const lesion = SEGMENTS.find((segment) => segment.id === reference.segmentId)
    if (lesion) {
      setSelectedSegmentId(lesion.id)
      engineRef.current?.setSelectedVessel(lesion.vessel)
      const projection = (PRESETS[side === 'right' ? 'right' : 'left'] || []).find(
        (item) => item.optimalFor?.includes(lesion.id),
      )
      if (projection) {
        setRot(projection.rot)
        setTilt(projection.tilt)
      }
    }
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
  const resultVessel = tr('angio.referenceVessel', '{vessel}（参考模型）', {
    vessel: segmentName(SEGMENTS.find((segment) => segment.id === result.segmentId) || { id: result.segmentId, name: result.vessel }),
  })
  const displayPresets = currentPresets.map((preset) => ({
    ...preset,
    sub: PRESET_SUB_KEYS[preset.sub] ? tr(PRESET_SUB_KEYS[preset.sub], preset.sub) : preset.sub,
  }))
  const currentSegments = SEGMENTS.filter((segment) => side === 'both' || segment.side === side)
  const selectedSegment = currentSegments.find((segment) => segment.id === selectedSegmentId) || null
  const activeProjectionOptimal = selectedSegment
    ? (currentPresets || []).some(
      (preset) => preset.optimalFor?.includes(selectedSegment.id) && preset.rot === rot && preset.tilt === tilt,
    )
    : false
  const presetActive = (preset) => preset.rot === rot && preset.tilt === tilt

  const selectSegment = (segment) => {
    setSelectedSegmentId(segment.id)
    engineRef.current?.setSelectedVessel(segment.vessel)
    const projection = (currentPresets || []).find((item) => item.optimalFor?.includes(segment.id))
    if (projection) {
      setRot(projection.rot)
      setTilt(projection.tilt)
    }
  }

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
        description={tr('angio.referenceDescription', '独立参考冠脉模型 · C 臂角度模拟 · 冠脉分段与参考定量分析（不读取当前检查）')}
        meta={
          <>
            <span>LCA / RCA</span>
            <i />
            <span>{t('angio.dominance')}</span>
            <i />
            <span>{t('angio.cine')}</span>
          </>
        }
        actions={
          <>
            <Badge tone="amber" dot>{tr('angio.referenceBadge', '参考模型 · 非患者')}</Badge>
            <Button variant="outline" size="sm" icon={<Camera size={14} />} onClick={capture}>
              {t('angio.export')}
            </Button>
          </>
        }
      />

      <div className="module-body">
        <div className="viewer angio-viewer">
          {error ? <div className="webgl-error">{t(error)}</div> : null}
          <div className="angio-viewer-grid" />
          <div className="angio-viewer-head">
            <div className="angio-system-tabs">
              <Segmented options={SIDE_OPTIONS.map((option) => ({ ...option, label: t(`angio.${option.value}`) }))} value={side} onChange={setSide} ariaLabel={t('angio.sideAria')} />
            </div>
            <div className="angio-head-right">
              <div className="angio-display-tabs">
                <Segmented options={MODE_OPTIONS.map((option) => ({ ...option, label: t(`angio.${option.value}`) }))} value={mode} onChange={setMode} ariaLabel={t('angio.modeAria')} />
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
            <div className="angio-anatomy-panel">
              <div className="angio-anatomy-toolbar">
                {[
                  ['detectorView', '探测器视角', detectorView, () => setDetectorView((value) => !value)],
                  ['foreshortening', '缩短提示', foreshortening, () => setForeshortening((value) => !value)],
                  ['skeleton', '骨骼', skeleton, () => setSkeleton((value) => !value)],
                  ['seeThrough', '透视显示', seeThrough, () => setSeeThrough((value) => !value)],
                  ['heartLabels', '结构标签', heartLabels, () => setHeartLabels((value) => !value)],
                  ['planes', '探测器平面', planes, () => setPlanes((value) => !value)],
                ].map(([id, label, active, onClick]) => (
                  <button key={id} type="button" className={active ? 'active' : ''} onClick={onClick}>
                    {tr(`angio.controls.${id}`, label)}
                  </button>
                ))}
              </div>
              <div className="angio-anatomy-host" ref={heartHostRef} />
              {planes ? <div className="angio-detector-plane" /> : null}
              {foreshortening && selectedSegment ? (
                <div className={`angio-foreshorten ${activeProjectionOptimal ? 'ok' : 'warn'}`}>
                  {activeProjectionOptimal
                    ? tr('angio.projectionOptimal', '当前体位为该段推荐体位')
                    : tr('angio.projectionForeshortened', '当前体位可能造成缩短')}
                </div>
              ) : null}
              <div className="angio-anatomy-foot">{tr('angio.heartOverlay', '3D HEART · CORONARY OVERLAY')}</div>
            </div>

            <div className="angio-center-column">
              <div className="angio-protocol-bar">
                <span className="protocol-label">{tr('angio.dominanceLabel', 'DOMINANCE')}</span>
                <Segmented
                  options={[
                    { value: 'right', label: t('angio.dominanceShort') },
                    { value: 'left', label: tr('angio.dominanceLeft', '左优势') },
                    { value: 'co', label: tr('angio.dominanceCo', '共优势') },
                  ]}
                  value={dominance}
                  onChange={setDominance}
                  ariaLabel={tr('angio.dominanceAria', '冠脉优势型')}
                />
                <span className="protocol-label">{tr('angio.grafts', 'GRAFTS')}</span>
                <Segmented
                  options={[
                    { value: 'off', label: tr('angio.off', '关闭') },
                    { value: 'on', label: tr('angio.on', '开启') },
                  ]}
                  value={graftsOn ? 'on' : 'off'}
                  onChange={(value) => setGraftsOn(value === 'on')}
                  ariaLabel={tr('angio.graftsAria', '桥血管')}
                />
                <button
                  type="button"
                  className={`protocol-chip ${ramusVisible ? 'active' : ''}`}
                  onClick={() => setRamusVisible((value) => !value)}
                >
                  {tr('angio.ramus', 'Ramus intermedius')}
                </button>
                <button
                  type="button"
                  className={`protocol-chip ${colorMode ? 'active' : ''}`}
                  onClick={() => setColorMode((value) => !value)}
                >
                  {tr('angio.color', 'Color')}
                </button>
                {graftsOn ? (
                  <span className="protocol-grafts">
                    {['LIMA', 'SVG-OM', 'SVG-PDA'].map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={graftVisibility[id] ? 'active' : ''}
                        onClick={() => setGraftVisibility((current) => ({ ...current, [id]: !current[id] }))}
                      >
                        {id}
                      </button>
                    ))}
                  </span>
                ) : null}
              </div>

              <div className="angio-monitor">
              <div className="angio-monitor-bezel">
                <div className={`angio-film film-${mode}`}>
                  <div className="angio-canvas-host" ref={hostRef} />
                  <div className="film-corner tl" />
                  <div className="film-corner tr" />
                  <div className="film-corner bl" />
                  <div className="film-corner br" />
                  <div className="angio-film-top">
                    <span className="film-live"><i /> {tr('angio.liveFluoro', 'LIVE FLUORO')}</span>
                    <span className="film-system">{t(`angio.${side}`)}</span>
                    <span className="film-angle">{angleLabel(rot, tilt)}</span>
                  </div>
                  <div className="angio-film-bottom">
                    <div>
                      <span>{tr('angio.frameNumber', '帧 {frame}', { frame: String(frame).padStart(4, '0') })}</span>
                      <span>{tr('angio.cineRate', 'CINE 15 FPS')}</span>
                      <span>{tr('angio.arterialPhase', 'ARTERIAL PHASE')}</span>
                    </div>
                    <span className="film-disclaimer">{tr('angio.referenceNonDiagnostic', 'REFERENCE MODEL · NON-DIAGNOSTIC')}</span>
                  </div>
                  <div className="film-reticle" aria-hidden="true">
                    <span />
                  </div>
                  <div className="film-side-mark left">R</div>
                  <div className="film-side-mark right">L</div>
                </div>
              </div>
              <div className="monitor-caption">
                <span>{tr('angio.monitor', 'MONITOR 1 · CATH LAB VIEW')}</span>
                <span>{tr('angio.monitorScale', 'ZOOM 1.0× · 512 × 512 MATRIX')}</span>
              </div>
            </div>

            <div className="angio-console">
              <div className="cine-controls">
                <button type="button" className="console-play" onClick={() => setPlaying(!playing)} aria-label={t(playing ? 'angio.pause' : 'angio.play')}>
                  {playing ? <Pause size={13} /> : <Play size={13} />}
                </button>
                <div className="cine-copy">
                  <b>{tr('angio.cineLoop', 'CINE LOOP')}</b>
                  <small>{playing ? tr('angio.playing', '播放中 · 15 FPS') : t('anatomy.paused')}</small>
                </div>
                <div className="cine-progress">
                  <span style={{ animationPlayState: playing ? 'running' : 'paused' }} />
                </div>
              </div>
              <div className="bolus-strip">
                <span className="bolus-label">{tr('angio.contrast', 'CONTRAST')}</span>
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
                <div><span>{tr('angio.masks', 'MASKS')}</span><b>02</b></div>
                <div><span>FOV</span><b>18 cm</b></div>
                <div><span>{tr('angio.dose', 'DOSE')}</span><b>0.8 Gy·cm²</b></div>
              </div>
            </div>
            </div>
          </div>
        </div>

        <aside className="inspector angio-inspector">
          <div className="angio-inspector-head">
            <div>
              <span className="selection-eyebrow">{tr('angio.activeProjection', 'ACTIVE PROJECTION')}</span>
              <h2>{angleLabel(rot, tilt)}</h2>
              <p>{t(`angio.${side}System`)}</p>
            </div>
            <span className="projection-id">PROJ · 04</span>
          </div>

          <Section title={t('angio.angles')} code="C-ARM ANGLES" right={<Gauge size={13} />} className="projection-section">
            <div className="angle-pair">
              <div>
                <span>{tr('angio.horizontal', 'HORIZONTAL')}</span>
                <strong>{rot >= 0 ? 'LAO' : 'RAO'} <em>{Math.abs(rot)}°</em></strong>
              </div>
              <div>
                <span>{tr('angio.angulation', 'ANGULATION')}</span>
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
              {displayPresets.map((preset) => (
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
                  <small>{preset.sub}</small>
                  <em>
                    {preset.rot >= 0 ? 'LAO' : 'RAO'} {Math.abs(preset.rot)} · {preset.tilt >= 0 ? 'CRA' : 'CAU'} {Math.abs(preset.tilt)}
                  </em>
                </button>
              ))}
            </div>
            <AngleMap
              rot={rot}
              tilt={tilt}
              presets={displayPresets}
              onPick={(preset) => {
                setRot(preset.rot)
                setTilt(preset.tilt)
              }}
            />
          </Section>

          <Section title={tr('angio.segments', '冠脉分段')} code="CORONARY SEGMENTS" right={<span className="section-hint">{tr('angio.segmentCount', '{count} 段', { count: currentSegments.length })}</span>} className="segment-section">
            <div className="angio-segment-list">
              {currentSegments.map((segment) => (
                <button
                  key={segment.id}
                  type="button"
                  className={`angio-segment-row ${selectedSegmentId === segment.id ? 'active' : ''}`}
                  onClick={() => selectSegment(segment)}
                >
                  <span className="segment-name">
                    <b>{segmentName(segment)}</b>
                    <small>{segment.coronarySegment} · {segment.territory} · AHA {segment.ahaMyocardialSegments.join('/')}</small>
                  </span>
                  <span className="segment-metrics">
                    <em>{segment.referenceDiameterMm.toFixed(1)} mm</em>
                    <small>{segment.lengthMm} mm</small>
                  </span>
                  {segment.referenceLesion ? <i className="segment-lesion">{tr('angio.referenceLesion', '参考病变')}</i> : null}
                </button>
              ))}
            </div>
            {selectedSegment ? (
              <div className="angio-segment-detail">
                <div><span>{tr('angio.segment', '分段')}</span><b>{segmentName(selectedSegment)} · {selectedSegment.coronarySegment}</b></div>
                <div><span>{tr('angio.territory', '供血区')}</span><b>{selectedSegment.territory}</b></div>
                <div><span>{tr('angio.referenceDimensions', '参考直径 / 长度')}</span><b>{selectedSegment.referenceDiameterMm} mm / {selectedSegment.lengthMm} mm</b></div>
                <div><span>{tr('angio.ahaSegments', 'AHA 心肌段')}</span><b>{selectedSegment.ahaMyocardialSegments.map((id) => `${id} ${tr(`analysis.seg${id}`, MYOCARDIAL_SEGMENTS[id]?.name || '')}`).join(' · ')}</b></div>
                <p>{tr('angio.referenceSegmentNote', '参考冠脉模型分段，用于投照体位与教学分析；不是患者病变。')}</p>
              </div>
            ) : (
              <div className="angio-model-note">{tr('angio.referenceSelectSegment', '选择分段以高亮血管并匹配推荐投照体位；数据来自参考冠脉模型，不是患者影像。')}</div>
            )}
          </Section>

          <Section
            title={tr('angio.referenceQca', '参考定量分析')}
            code="REFERENCE QCA"
            className="qca-section"
            right={<Badge tone={qca === 'done' ? (result.severity === 'critical' ? 'red' : 'teal') : 'neutral'}>{t(qca === 'done' ? 'angio.qcaDone' : qca === 'analyzing' ? 'angio.qcaRunning' : 'angio.qcaIdle')}</Badge>}
          >
            {qca === 'idle' ? (
              <div className="qca-idle">
                <div className="qca-idle-visual">
                  <span className="qca-target"><Target size={18} /></span>
                  <div>
                    <b>{resultVessel} · {result.segment}</b>
                    <small>{tr('angio.referenceQcaFit', '基于参考冠脉模型的分段几何分析')}</small>
                  </div>
                </div>
                <p>{tr('angio.referenceQcaBody', '读取参考冠脉模型的分段直径/长度与参考病变，生成参考狭窄指标和合成 FFR 提示；不基于患者影像。')}</p>
                <Button variant="primary" size="sm" onClick={runQca} icon={<ScanLine size={14} />}>
                  {tr('angio.runReferenceQca', '运行参考分析')}
                </Button>
              </div>
            ) : null}

            {qca === 'analyzing' ? (
              <div className="qca-analyzing">
                <div className="analyzing-head">
                  <Loader2 size={14} className="spin" />
                  <b>{t('angio.analyzing', { vessel: resultVessel })}</b>
                  <span>{Math.min(100, Math.round((qcaStep / ANALYSIS_STEPS.length) * 100))}%</span>
                </div>
                <div className="analysis-progress">
                  <i style={{ width: `${(qcaStep / ANALYSIS_STEPS.length) * 100}%` }} />
                </div>
                <div className="analysis-steps">
                  {ANALYSIS_STEPS.map((step, index) => (
                    <div key={step} className={index < qcaStep ? 'done' : index === qcaStep ? 'active' : ''}>
                      <span>{index < qcaStep ? <Check size={10} /> : index + 1}</span>
                      {tr(`angio.referenceSteps.step${index + 1}`, step)}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {qca === 'done' ? (
              <div className={`qca-result ${result.severity}`}>
                <div className="qca-result-head">
                  <div>
                    <span>{t('analysis.ds')}</span>
                    <strong>{result.ds}<small>%</small></strong>
                  </div>
                  <Badge tone={result.severity === 'critical' ? 'red' : 'teal'} dot>
                    {t(result.severity === 'critical' ? 'angio.severe' : 'angio.mild')}
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
                  <Stat label={t('angio.confidence')} value={result.confidence ?? '—'} unit={result.confidence != null ? '%' : ''} />
                </div>
                <div className="qca-meta">
                  <span>{tr('angio.referenceLvef', '参考 LVEF 54%')}</span>
                  <span>{tr('angio.referenceSyntax', '参考 SYNTAX {value}', { value: result.syntax })}</span>
                  <span>{t('angio.refFrame')}</span>
                </div>
                <p className="angio-model-note">{tr('angio.referenceResultNote', result.note)}</p>
                <div className="qca-conclusion">
                  <CircleAlert size={14} />
                  <p>
                    {result.severity === 'critical'
                      ? tr('angio.referenceConclusionSevere', '参考模型：LAD 中段几何狭窄；FFR 为合成参考值。真实患者需结合有创 FFR 与临床评估，本结果不构成治疗建议。')
                      : tr('angio.referenceConclusionMild', '参考模型：RCA 近段轻度几何狭窄；无患者级血流动力学结论。')}
                  </p>
                </div>
                {result.stent ? (
                  <div className="stent-plan">
                    <div>
                      <span>{tr('angio.referencePci', '参考 PCI 尺寸（教学）')}</span>
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
                  <Button variant="ghost" size="sm" onClick={() => notify(tr('angio.addDemoReportToast', '参考分析已加入演示报告'))}>{tr('angio.addDemoReport', '加入报告（演示）')}</Button>
                </div>
              </div>
            ) : null}
          </Section>

          <Section title={t('angio.geometry')} code="EQUIPMENT GEOMETRY" right={<Crosshair size={13} />} className="carm-section">
            <Carm3D rot={rot} tilt={tilt} />
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
                  <b>{resultVessel}</b>
                  <small>{result.segment} · {t('angio.dominance')}</small>
                </div>
                <strong>{result.ds}%</strong>
              </div>
              <p>
                {result.severity === 'critical'
                  ? t('angio.summarySevere')
                  : t('angio.summaryMild')}
              </p>
            </div>
          </Section>
        </aside>
      </div>
    </div>
  )
}
