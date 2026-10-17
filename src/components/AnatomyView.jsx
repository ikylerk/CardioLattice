import React from 'react'
import {
  ArrowUpRight,
  Bone,
  Camera,
  Crosshair,
  Eye,
  HeartPulse,
  Maximize2,
  Pause,
  Play,
  Rotate3d,
  RotateCcw,
  ScanEye,
  Sparkles,
  Tag,
} from 'lucide-react'
import ViewHeader from './ViewHeader.jsx'
import { Badge, Button, IconButton, Section, Segmented, Slider, Stat, Toggle } from './ui.jsx'
import HeartEngine from '../three/HeartEngine.js'
import HEART_DATA from '../data/heart-data.json'
import PatientAnatomyView from './PatientAnatomyView.jsx'
import { useStudy } from '../study/StudyContext.jsx'

const MODES = [
  { value: 'all', label: '完整解剖', sub: 'ANATOMY' },
  { value: 'chamber', label: '心腔结构', sub: 'CHAMBER' },
  { value: 'coronary', label: '冠脉网络', sub: 'VESSELS' },
  { value: 'xray', label: '透视融合', sub: 'X-RAY' },
]

const STRUCTURE_LIST = [
  ['LV', '左心室'],
  ['RV', '右心室'],
  ['LA', '左心房'],
  ['RA', '右心房'],
  ['AO', '主动脉'],
  ['PT', '肺动脉'],
  ['MV', '二尖瓣'],
  ['AV', '主动脉瓣'],
  ['LM', '左主干'],
  ['LAD', '前降支'],
  ['LCX', '回旋支'],
  ['RCA', '右冠脉'],
]

const STRUCTURE_METRICS = {
  LV: [
    ['舒张末容积', '142', 'mL'],
    ['射血分数', '54', '%'],
    ['壁厚', '9.4', 'mm'],
  ],
  RV: [
    ['舒张末容积', '118', 'mL'],
    ['射血分数', '58', '%'],
    ['游离壁', '4.1', 'mm'],
  ],
  LA: [
    ['容积指数', '31', 'mL/m²'],
    ['前后径', '36', 'mm'],
  ],
  RA: [
    ['容积指数', '27', 'mL/m²'],
    ['横径', '34', 'mm'],
  ],
  AO: [
    ['窦部直径', '32', 'mm'],
    ['升主动脉', '29', 'mm'],
  ],
  PT: [
    ['主干直径', '24', 'mm'],
    ['分叉角', '68', '°'],
  ],
  MV: [
    ['瓣口面积', '4.2', 'cm²'],
    ['反流', '微量', ''],
  ],
  AV: [
    ['峰值流速', '1.4', 'm/s'],
    ['钙化', '轻度', ''],
  ],
  LM: [
    ['参考直径', '4.7', 'mm'],
    ['狭窄', '0', '%'],
  ],
  LAD: [
    ['参考直径', '3.7', 'mm'],
    ['狭窄', '70', '%'],
  ],
  LCX: [
    ['参考直径', '3.4', 'mm'],
    ['狭窄', '22', '%'],
  ],
  RCA: [
    ['参考直径', '4.0', 'mm'],
    ['狭窄', '30', '%'],
  ],
}

const GROUP_LABELS = {
  chamber: '心肌与心腔',
  great: '大血管',
  valve: '瓣膜结构',
  coronary: '冠状动脉',
}

const CLINICAL_TEXT = {
  LV: '左心室承担体循环泵血，室壁厚度与收缩功能是评估缺血性心肌病的关键。当前模型显示下壁基底段轻度运动减弱。',
  RV: '右心室呈新月形包绕左心室，对前负荷与肺动脉压力敏感。本病例右心功能处于正常范围。',
  LA: '左心房接收四条肺静脉回流，容量指数可用于评估舒张功能与房颤风险。',
  RA: '右心房接收上、下腔静脉回流，三尖瓣环与右房大小共同反映右心负荷。',
  AO: '主动脉起自左室流出道并经弓部发出头臂血管，管径与管壁钙化是 CTA 评估重点。',
  PT: '肺动脉主干承载右心输出，分叉角度与左右肺动脉管径用于评估肺循环。',
  LM: '左主干位于左冠窦，分出前降支与回旋支。左主干病变具有较高的血运重建优先级。',
  LAD: '前降支沿前室间沟下行，供应左室前壁、前间隔与心尖。中段可见 70% 直径狭窄，为本次评估的责任病变。',
  LCX: '回旋支沿左侧房室沟走行，发出钝缘支供应左室侧壁。近段可见轻度钙化斑块。',
  RCA: '右冠状动脉沿右侧房室沟走行，通常发出后降支供应下壁。近段可见 30% 轻度狭窄。',
  MV: '二尖瓣由前、后叶及瓣下装置构成，关闭不全可导致左房容量负荷增加。',
  AV: '主动脉瓣为三叶半月瓣，钙化与跨瓣压差用于判断狭窄程度。',
}

function downloadDataUrl(dataUrl, name) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = name
  link.click()
}

export default function AnatomyView(props) {
  const { isApi } = useStudy()
  if (isApi) return <PatientAnatomyView {...props} />
  return <DemoAnatomyView {...props} />
}

function DemoAnatomyView({ bpm, setBpm, playing, setPlaying, notify, onNavigate, onReport }) {
  const [mode, setMode] = React.useState('all')
  const [selected, setSelected] = React.useState('LV')
  const [labels, setLabels] = React.useState(true)
  const [thorax, setThorax] = React.useState(false)
  const [autoRotate, setAutoRotate] = React.useState(false)
  const [layers, setLayers] = React.useState({ chamber: true, great: true, valve: true, coronary: true })
  const [error, setError] = React.useState('')
  const hostRef = React.useRef(null)
  const engineRef = React.useRef(null)

  React.useEffect(() => {
    if (!hostRef.current) return undefined
    try {
      const engine = new HeartEngine(hostRef.current, {
        bpm,
        playing,
        onSelect: (id) => setSelected(id),
      })
      engineRef.current = engine
    } catch (err) {
      console.error(err)
      setError('当前环境无法初始化 WebGL 三维渲染。请启用硬件加速后重新打开。')
    }
    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
    // Engine is constructed once; runtime settings are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    engineRef.current?.setCardiac(bpm, playing)
  }, [bpm, playing])

  React.useEffect(() => {
    engineRef.current?.setMode(mode)
  }, [mode])

  React.useEffect(() => {
    engineRef.current?.setSelected(selected)
  }, [selected])

  React.useEffect(() => {
    Object.entries(layers).forEach(([group, visible]) => engineRef.current?.setLayer(group, visible))
  }, [layers])

  React.useEffect(() => {
    engineRef.current?.setLabelsVisible(labels)
  }, [labels])

  React.useEffect(() => {
    engineRef.current?.setContextVisible(thorax)
  }, [thorax])

  React.useEffect(() => {
    engineRef.current?.setAutoRotate(autoRotate)
  }, [autoRotate])

  const structure = HEART_DATA.meshes.find((item) => item.id === selected) || HEART_DATA.meshes[0]
  const metrics = STRUCTURE_METRICS[selected] || []
  const isLesion = selected === 'LAD'

  const capture = () => {
    const url = engineRef.current?.exportImage()
    if (url) {
      downloadDataUrl(url, `CardioScope_${selected}_3D.png`)
      notify('三维视图已导出为 PNG')
    }
  }

  return (
    <div className="module-view anatomy-view">
      <ViewHeader
        index="01"
        eyebrow="ANATOMY"
        title="三维心脏解剖"
        titleSuffix="ANATOMICAL MODEL"
        description="患者级 CCTA 重建 · 四腔心 · 瓣膜与冠脉树 · 生理搏动同步"
        meta={
          <>
            <span>四腔心</span>
            <i />
            <span>12 支冠脉</span>
            <i />
            <span>实时 WebGL</span>
          </>
        }
        actions={
          <>
            <Badge tone="teal" dot>生理同步</Badge>
            <Button variant="outline" size="sm" icon={<Camera size={14} />} onClick={capture}>
              截取视图
            </Button>
          </>
        }
      />

      <div className="module-body">
        <div className="viewer anatomy-viewer">
          <div className="three-host" ref={hostRef} />
          {error ? <div className="webgl-error">{error}</div> : null}

          <div className="viewer-overlay top-left">
            <Segmented options={MODES} value={mode} onChange={setMode} className="mode-segmented" ariaLabel="三维显示模式" />
          </div>

          <div className="viewer-overlay top-right">
            <div className="floating-toolbar">
              <IconButton label={labels ? '隐藏结构标签' : '显示结构标签'} className={labels ? 'active' : ''} onClick={() => setLabels((v) => !v)}>
                <Tag size={15} />
              </IconButton>
              <IconButton label={thorax ? '隐藏胸廓参考' : '显示胸廓参考'} className={thorax ? 'active' : ''} onClick={() => setThorax((v) => !v)}>
                <Bone size={15} />
              </IconButton>
              <IconButton label="自动旋转" className={autoRotate ? 'active' : ''} onClick={() => setAutoRotate((v) => !v)}>
                <Rotate3d size={15} />
              </IconButton>
              <span className="toolbar-divider" />
              <IconButton label="重置视角" onClick={() => engineRef.current?.resetCamera()}>
                <RotateCcw size={15} />
              </IconButton>
              <IconButton label="全屏视图" onClick={() => hostRef.current?.closest('.viewer')?.requestFullscreen?.()}>
                <Maximize2 size={15} />
              </IconButton>
            </div>
          </div>

          <div className="scene-topline">
            <span className="scene-code">{mode === 'chamber' ? 'SCHEMATIC 4-CHAMBER MODEL · TEACHING' : 'VOLUME RENDER / CARDIAC · 3D'}</span>
            <span className="scene-status"><i /> LIVE 30 FPS</span>
          </div>

          <div className="orientation-widget" aria-hidden="true">
            <div className="orientation-top">H</div>
            <div className="orientation-ring">
              <span className="axis axis-a">A</span>
              <span className="axis axis-l">L</span>
              <span className="axis axis-r">R</span>
              <span className="axis axis-p">P</span>
              <div className="orientation-cross" />
              <div className="orientation-dot" />
            </div>
            <div className="orientation-bottom">F</div>
            <small>ANTERIOR VIEW</small>
          </div>

          <div className="viewer-scale">
            <span>10 mm</span>
            <i />
            <span>ZOOM 1.0×</span>
          </div>

          <div className="transport-panel">
            <div className="transport-status">
              <span className="beat-orb" style={{ animationDuration: `${60 / bpm}s` }}>
                <HeartPulse size={14} />
              </span>
              <div>
                <small>CARDIAC CYCLE</small>
                <strong>{playing ? '实时同步' : '已暂停'}</strong>
              </div>
            </div>
            <button type="button" className="transport-button" onClick={() => setPlaying(!playing)} aria-label={playing ? '暂停' : '播放'}>
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <div className="transport-bpm">
              <div>
                <b>{bpm}</b>
                <span>BPM</span>
              </div>
              <input
                type="range"
                min="48"
                max="118"
                value={bpm}
                onChange={(event) => setBpm(Number(event.target.value))}
                aria-label="模拟心率"
                style={{ '--fill': `${((bpm - 48) / 70) * 100}%`, '--beat': `${60 / bpm}s` }}
              />
            </div>
            <div className="transport-phase">
              <span className="phase-bar"><i style={{ animationDuration: `${60 / bpm}s` }} /></span>
              <small>SYSTOLE / DIASTOLE</small>
            </div>
          </div>

          <div className="scene-tip">
            <Crosshair size={12} />
            单击结构识别 · 标签可交互
          </div>
        </div>

        <aside className="inspector anatomy-inspector">
          <div className="selection-hero">
            <div className="selection-eyebrow">
              <span>SELECTED STRUCTURE</span>
              <span className="selection-id">ID · {selected}</span>
            </div>
            <div className="selection-title">
              <span className={`structure-swatch swatch-${structure.group}`} />
              <div>
                <h2>{structure.name}</h2>
                <small>{structure.en}</small>
              </div>
              <span className="selection-index">03</span>
            </div>
            <p>{CLINICAL_TEXT[selected] || structure.description}</p>
            <div className="selection-stats">
              {metrics.slice(0, 3).map(([label, value, unit]) => (
                <Stat key={label} label={label} value={value} unit={unit} accent={label === '狭窄' && Number(value) >= 50 ? 'amber' : undefined} />
              ))}
            </div>
            {isLesion ? (
              <button className="lesion-callout" type="button" onClick={() => onNavigate('angio')}>
                <span className="lesion-pulse" />
                <div>
                  <b>责任病变 · LAD 中段</b>
                  <small>70% 直径狭窄 · QCA 待复核</small>
                </div>
                <ArrowUpRight size={15} />
              </button>
            ) : (
              <button className="structure-jump" type="button" onClick={() => onNavigate(selected === 'LAD' || selected === 'LCX' || selected === 'RCA' || selected === 'LM' ? 'angio' : 'cta')}>
                <ScanEye size={14} />
                在 {selected === 'LAD' || selected === 'LCX' || selected === 'RCA' || selected === 'LM' ? '冠脉造影' : 'CT 影像'}中继续观察
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>

          <Section title="结构导航" code="ANATOMY NAVIGATOR" right={<span className="section-hint">12 项</span>}>
            <div className="structure-grid">
              {STRUCTURE_LIST.map(([id, short]) => (
                <button
                  key={id}
                  type="button"
                  className={selected === id ? 'active' : ''}
                  onClick={() => setSelected(id)}
                >
                  <span>{short}</span>
                  <small>{id}</small>
                </button>
              ))}
            </div>
          </Section>

          <Section title="显示图层" code="VISIBILITY" right={<Eye size={13} />}>
            <div className="layer-list">
              {Object.entries(GROUP_LABELS).map(([group, label]) => (
                <Toggle
                  key={group}
                  label={label}
                  checked={layers[group]}
                  onChange={(value) => setLayers((current) => ({ ...current, [group]: value }))}
                />
              ))}
            </div>
          </Section>

          <Section title="场景辅助" code="SCENE" right={<Sparkles size={13} />}>
            <div className="scene-toggle-grid">
              <Toggle label="结构标签" hint="解剖标注" checked={labels} onChange={setLabels} />
              <Toggle label="胸廓参考" hint="肋骨 / 脊柱" checked={thorax} onChange={setThorax} />
              <Toggle label="自动旋转" hint="展示模式" checked={autoRotate} onChange={setAutoRotate} />
            </div>
            <div className="quality-row">
              <span>渲染质量</span>
              <div className="quality-pills">
                <button type="button" className="active">高</button>
                <button type="button">中</button>
              </div>
              <small>PBR + BLOOM</small>
            </div>
          </Section>

          <div className="inspector-footer">
            <Button variant="outline" size="sm" icon={<Camera size={14} />} onClick={capture}>导出三维图</Button>
            <Button variant="primary" size="sm" icon={<ArrowUpRight size={14} />} onClick={onReport}>生成报告</Button>
          </div>
        </aside>
      </div>
    </div>
  )
}
