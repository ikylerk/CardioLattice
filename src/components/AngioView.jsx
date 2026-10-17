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

const PRESETS = {
  left: [
    { label: 'LAO Cranial', sub: 'LAD / 分叉', rot: 30, tilt: 30 },
    { label: 'RAO Cranial', sub: 'LAD / 间隔', rot: -30, tilt: 30 },
    { label: 'LAO Caudal', sub: 'LCx / 主干', rot: 45, tilt: -30 },
    { label: 'RAO Caudal', sub: 'LCx / 远端', rot: -30, tilt: -30 },
    { label: 'Spider', sub: '左主干分叉', rot: 45, tilt: -35 },
    { label: 'AP Cranial', sub: 'LAD 中远段', rot: 0, tilt: 30 },
  ],
  right: [
    { label: 'LAO', sub: 'RCA 近中段', rot: 30, tilt: 0 },
    { label: 'RAO', sub: 'RCA 中段', rot: -30, tilt: 0 },
    { label: 'AP', sub: 'RCA 开口', rot: 0, tilt: 0 },
    { label: 'AP Cranial', sub: 'RCA 远端', rot: 0, tilt: 30 },
    { label: 'LAO Cranial', sub: 'RCA / PDA', rot: 30, tilt: 30 },
    { label: 'RAO Caudal', sub: 'RCA / PL', rot: -30, tilt: -30 },
  ],
}

const ANALYSIS_STEPS = [
  '提取血管中心线',
  '拟合参考直径',
  '测量最小管腔直径',
  '估算血流动力学',
]

const QCA_RESULTS = {
  left: {
    vessel: 'LAD 中段',
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
    vessel: 'RCA 近段',
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
      setError('当前环境无法初始化造影渲染。请启用 WebGL 后重试。')
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
  const presetActive = (preset) => preset.rot === rot && preset.tilt === tilt

  const capture = () => {
    const url = engineRef.current?.capture()
    if (url) {
      downloadDataUrl(url, `Angio_${side}_${rot}_${tilt}.png`)
      notify('造影影像已保存为 PNG')
    }
  }

  return (
    <div className="module-view angio-view">
      <ViewHeader
        index="02"
        eyebrow="CORONARY ANGIOGRAPHY"
        title="冠脉造影"
        titleSuffix="FLUOROSCOPY"
        description="三维冠脉树实时投照 · C 臂角度模拟 · QCA 定量狭窄分析"
        meta={
          <>
            <span>LCA / RCA</span>
            <i />
            <span>右优势型</span>
            <i />
            <span>15 FPS CINE</span>
          </>
        }
        actions={
          <>
            <Badge tone="amber" dot>模拟透视</Badge>
            <Button variant="outline" size="sm" icon={<Camera size={14} />} onClick={capture}>
              导出影像
            </Button>
          </>
        }
      />

      <div className="module-body">
        <div className="viewer angio-viewer">
          {error ? <div className="webgl-error">{error}</div> : null}
          <div className="angio-viewer-grid" />
          <div className="angio-viewer-head">
            <div className="angio-system-tabs">
              <Segmented options={SIDE_OPTIONS} value={side} onChange={setSide} ariaLabel="冠脉系统" />
            </div>
            <div className="angio-head-right">
              <div className="angio-display-tabs">
                <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} ariaLabel="影像模式" />
              </div>
              <div className="floating-toolbar">
                <IconButton label="冠脉标签" className={labels ? 'active' : ''} onClick={() => setLabels((v) => !v)}>
                  <Tag size={15} />
                </IconButton>
                <IconButton label="重新注射造影剂" onClick={() => engineRef.current?.inject()}>
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
                <button type="button" className="console-play" onClick={() => setPlaying(!playing)} aria-label={playing ? '暂停电影回放' : '播放电影回放'}>
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
                  <Syringe size={11} /> 注射
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
              <p>{side === 'right' ? '右冠状动脉 · 右优势型' : side === 'left' ? '左冠状动脉 · 右优势型' : '双侧冠状动脉 · 综合观察'}</p>
            </div>
            <span className="projection-id">PROJ · 04</span>
          </div>

          <Section title="投照角度" code="C-ARM ANGLES" right={<Gauge size={13} />} className="projection-section">
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

          <Section title="标准体位" code="PRESETS" right={<span className="section-hint">{currentPresets.length} 组</span>} className="presets-section">
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
              presets={currentPresets}
              onPick={(preset) => {
                setRot(preset.rot)
                setTilt(preset.tilt)
              }}
            />
          </Section>

          <Section
            title="QCA 定量分析"
            code="AUTOMATED QCA"
            className="qca-section"
            right={<Badge tone={qca === 'done' ? (result.severity === 'critical' ? 'red' : 'teal') : 'neutral'}>{qca === 'done' ? '完成' : qca === 'analyzing' ? '分析中' : '待分析'}</Badge>}
          >
            {qca === 'idle' ? (
              <div className="qca-idle">
                <div className="qca-idle-visual">
                  <span className="qca-target"><Target size={18} /></span>
                  <div>
                    <b>{result.vessel} · {result.segment}</b>
                    <small>自动中心线与参考直径拟合</small>
                  </div>
                </div>
                <p>在舒张末期帧上检测病变段、最小管腔直径与参考血管直径，并估算 FFR-CT。</p>
                <Button variant="primary" size="sm" onClick={runQca} icon={<ScanLine size={14} />}>
                  运行 QCA 分析
                </Button>
              </div>
            ) : null}

            {qca === 'analyzing' ? (
              <div className="qca-analyzing">
                <div className="analyzing-head">
                  <Loader2 size={14} className="spin" />
                  <b>正在分析 {result.vessel}</b>
                  <span>{Math.min(100, Math.round((qcaStep / ANALYSIS_STEPS.length) * 100))}%</span>
                </div>
                <div className="analysis-progress">
                  <i style={{ width: `${(qcaStep / ANALYSIS_STEPS.length) * 100}%` }} />
                </div>
                <div className="analysis-steps">
                  {ANALYSIS_STEPS.map((step, index) => (
                    <div key={step} className={index < qcaStep ? 'done' : index === qcaStep ? 'active' : ''}>
                      <span>{index < qcaStep ? <Check size={10} /> : index + 1}</span>
                      {step}
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
                    {result.severity === 'critical' ? '显著狭窄' : '轻度狭窄'}
                  </Badge>
                </div>
                <div className="stenosis-track">
                  <i style={{ width: `${result.ds}%` }} />
                  <span style={{ left: `${result.ds}%` }} />
                </div>
                <div className="qca-metric-grid">
                  <Stat label="MLD" value={result.mld.toFixed(2)} unit="mm" />
                  <Stat label="RVD" value={result.rvd.toFixed(2)} unit="mm" />
                  <Stat label="面积狭窄" value={result.area} unit="%" />
                  <Stat label="病变长度" value={result.length} unit="mm" />
                  <Stat label="FFR-CT" value={result.ffr.toFixed(2)} accent={result.ffr < 0.8 ? 'amber' : undefined} />
                  <Stat label="置信度" value={result.confidence} unit="%" />
                </div>
                <div className="qca-meta">
                  <span>LVEF 54%</span>
                  <span>SYNTAX {result.syntax}</span>
                  <span>参考帧 ED</span>
                </div>
                <div className="qca-conclusion">
                  <CircleAlert size={14} />
                  <p>
                    {result.severity === 'critical'
                      ? 'LAD 中段重度狭窄，FFR-CT < 0.80，建议有创 FFR 复核并评估血运重建。'
                      : 'RCA 近段轻度狭窄，血流动力学意义不显著，建议药物治疗与随访。'}
                  </p>
                </div>
                {result.stent ? (
                  <div className="stent-plan">
                    <div>
                      <span>虚拟 PCI 规划</span>
                      <b>{result.stent}</b>
                    </div>
                    <ChevronRight size={14} />
                    <div>
                      <span>预计残余狭窄</span>
                      <b>{result.residual}%</b>
                    </div>
                  </div>
                ) : null}
                <div className="qca-actions">
                  <Button variant="outline" size="sm" onClick={runQca}>重新分析</Button>
                  <Button variant="ghost" size="sm" onClick={() => notify('QCA 结果已加入结构化报告')}>加入报告</Button>
                </div>
              </div>
            ) : null}
          </Section>

          <Section title="C 臂几何" code="EQUIPMENT GEOMETRY" right={<Crosshair size={13} />} className="carm-section">
            <CarmDiagram rot={rot} tilt={tilt} />
            <div className="carm-meta">
              <span><i className="dot-source" /> X 射线源</span>
              <span><i className="dot-detector" /> 平板探测器</span>
              <span className="carm-sdd">SID 950 mm</span>
            </div>
          </Section>

          <Section title="病变摘要" code="LESION SUMMARY" right={<Activity size={13} />} className="lesion-section">
            <div className="lesion-summary">
              <div className="lesion-summary-head">
                <span className={`severity-dot ${result.severity}`} />
                <div>
                  <b>{result.vessel}</b>
                  <small>{result.segment} · 右优势型</small>
                </div>
                <strong>{result.ds}%</strong>
              </div>
              <p>
                {result.severity === 'critical'
                  ? '中度钙化斑块，狭窄段长度 18 mm，远端 TIMI 3 级血流（模拟）。'
                  : '近段偏心性斑块，未见明显负性重构，远端血流正常（模拟）。'}
              </p>
            </div>
          </Section>
        </aside>
      </div>
    </div>
  )
}
