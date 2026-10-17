import React from 'react'
import {
  Activity,
  Boxes,
  Camera,
  CircleAlert,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Focus,
  Layers,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import ViewHeader from './ViewHeader.jsx'
import { Badge, Button, Section, Slider, Stat, Toggle } from './ui.jsx'
import OrganLibraryEngine from '../three/OrganLibraryEngine.js'
import ORGAN_LIBRARY from '../../shared/organ_library.json'
import ORGAN_TARGETS from '../../shared/organ_targets.json'

const SYSTEM_MAP = Object.fromEntries(ORGAN_LIBRARY.systems.map((system) => [system.id, system]))
const RENDERABLE = ORGAN_LIBRARY.organs.filter((organ) => organ.renderable)
const TARGETS = ORGAN_TARGETS.targets || []
const APPROACH_LABELS = { anterior: '前面入路', posterior: '后面入路', left: '左侧入路', right: '右侧入路' }
const KIND_LABELS = {
  capsule: '包膜', segment: '段/叶', lobe: '叶', ligament: '韧带/压迹', surface: '表面',
  chamber: '心腔', valve: '瓣膜', coronary: '冠脉', muscle: '乳头肌', cortex: '皮质',
  medulla: '髓质', calyx: '肾盏', pelvis: '肾盂', hilum: '肾门', vertebra: '椎体',
  organ: '整体', other: '其他',
}
const KIND_ORDER = ['chamber', 'valve', 'coronary', 'muscle', 'capsule', 'segment', 'lobe', 'surface', 'ligament', 'cortex', 'medulla', 'calyx', 'pelvis', 'hilum', 'vertebra', 'organ', 'other']
const PART_KIND_COLORS = {
  chamber: '#c45258', valve: '#e0b07a', coronary: '#d46a5a', muscle: '#a85b50',
  capsule: '#8f4a43', segment: '#b06a5a', lobe: '#a65a50', surface: '#8a5a6a',
  ligament: '#8a7a60', cortex: '#b06a7a', medulla: '#d0a0a8', calyx: '#e0c8a0',
  pelvis: '#e8d8b8', hilum: '#c0a080', vertebra: '#b8b0a0', organ: '#a08a70', other: '#9aa8b0',
}

function downloadCatalog() {
  const blob = new Blob([JSON.stringify(ORGAN_LIBRARY, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `cardiolattice-organ-atlas-${ORGAN_LIBRARY.version.replace(/[^a-z0-9.-]/gi, '-')}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export default function OrganLibraryView({ notify }) {
  const hostRef = React.useRef(null)
  const engineRef = React.useRef(null)
  const [selected, setSelected] = React.useState('HEART')
  const [visible, setVisible] = React.useState(() => Object.fromEntries(RENDERABLE.map((organ) => [organ.code, true])))
  const [activeSystem, setActiveSystem] = React.useState('all')
  const [mode, setMode] = React.useState('ghost')
  const [opacity, setOpacity] = React.useState(0.42)
  const [autoRotate, setAutoRotate] = React.useState(true)
  const [view, setView] = React.useState('anterior')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [detailMode, setDetailMode] = React.useState(false)
  const [selectedPart, setSelectedPart] = React.useState(null)
  const [partVisibility, setPartVisibility] = React.useState({})
  const [targetMode, setTargetMode] = React.useState(false)
  const [selectedTargetId, setSelectedTargetId] = React.useState(null)
  const [approach, setApproach] = React.useState('anterior')
  const [depth, setDepth] = React.useState(0)
  const [pathInfo, setPathInfo] = React.useState(null)
  const [clipMode, setClipMode] = React.useState('off')
  const [clipFlip, setClipFlip] = React.useState(false)
  const [simulating, setSimulating] = React.useState(false)

  React.useEffect(() => {
    if (!hostRef.current) return undefined
    try {
      const engine = new OrganLibraryEngine(hostRef.current, {
        autoRotate,
        opacity,
        onSelect: (code) => {
          setSelected(code)
          setSelectedTargetId(null)
          setPathInfo(null)
          setDepth(0)
          engineRef.current?.clearTarget()
        },
        onReady: () => setLoading(false),
        onTargetUpdate: (info) => {
          setPathInfo(info)
          if (info && Number.isFinite(info.depth)) setDepth(info.depth)
        },
        onInsertionEnd: (finalDepth) => {
          setSimulating(false)
          if (Number.isFinite(finalDepth)) setDepth(finalDepth)
        },
      })
      engineRef.current = engine
    } catch (err) {
      console.error(err)
      setError('当前环境无法初始化器官模型库。请启用 WebGL 后重试。')
      setLoading(false)
    }
    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (!engineRef.current) return
    for (const organ of RENDERABLE) {
      const systemVisible = activeSystem === 'all' || organ.system === activeSystem
      engineRef.current.setVisibility(organ.code, Boolean(visible[organ.code]) && systemVisible)
    }
  }, [visible, activeSystem])

  React.useEffect(() => {
    engineRef.current?.setMode(mode)
  }, [mode])

  React.useEffect(() => {
    engineRef.current?.setOpacity(opacity)
  }, [opacity])

  React.useEffect(() => {
    engineRef.current?.setAutoRotate(autoRotate)
  }, [autoRotate])

  React.useEffect(() => {
    engineRef.current?.setSelected(selected)
  }, [selected])

  React.useEffect(() => {
    engineRef.current?.setDetailMode(selected, detailMode)
  }, [selected, detailMode])

  React.useEffect(() => {
    if (!targetMode) return
    engineRef.current?.setClip(clipMode, clipMode !== 'off', clipFlip)
  }, [clipMode, clipFlip, targetMode])

  const selectedOrgan = ORGAN_LIBRARY.organs.find((organ) => organ.code === selected) || RENDERABLE[0]
  const selectedSystem = SYSTEM_MAP[selectedOrgan.system]
  const visibleCount = RENDERABLE.filter((organ) => {
    const systemVisible = activeSystem === 'all' || organ.system === activeSystem
    return visible[organ.code] && systemVisible
  }).length

  const focusOrgan = (code) => {
    setSelected(code)
    setSelectedPart(null)
    setSelectedTargetId(null)
    setPathInfo(null)
    setDepth(0)
    engineRef.current?.clearTarget()
    engineRef.current?.focus(code)
    engineRef.current?.setSelected(code)
    if (targetMode) {
      const first = TARGETS.find((target) => target.organ === code)
      if (first) selectTarget(first)
    }
  }

  const selectView = (nextView) => {
    setView(nextView)
    setAutoRotate(false)
    engineRef.current?.setView(nextView)
  }

  const toggleOrgan = (code) => {
    setVisible((current) => ({ ...current, [code]: !current[code] }))
  }

  const showOnlySelected = () => {
    setVisible(Object.fromEntries(RENDERABLE.map((organ) => [organ.code, organ.code === selected])))
  }

  const showAll = () => {
    setVisible(Object.fromEntries(RENDERABLE.map((organ) => [organ.code, true])))
    setActiveSystem('all')
  }

  const capture = () => {
    const url = engineRef.current?.capture()
    if (url) {
      const link = document.createElement('a')
      link.href = url
      link.download = 'CardioScope_organ_atlas.png'
      link.click()
      notify?.('器官模型库视图已导出为 PNG')
    }
  }

  const grouped = ORGAN_LIBRARY.systems.map((system) => ({
    ...system,
    organs: ORGAN_LIBRARY.organs.filter((organ) => organ.renderable && organ.system === system.id),
  }))

  const selectedTarget = TARGETS.find((target) => target.id === selectedTargetId) || null
  const organTargets = TARGETS.filter((target) => target.organ === selected)
  const depthMax = Math.max(1, pathInfo?.pathLength || 200)
  const remaining = pathInfo ? Math.max(0, pathInfo.pathLength - depth) : null
  const collisionNames = (pathInfo?.collisions || []).map(
    (code) => ORGAN_LIBRARY.organs.find((organ) => organ.code === code)?.name || code,
  )
  const partGroups = React.useMemo(() => {
    const parts = selectedOrgan.parts || []
    const groups = new Map()
    for (const part of parts) {
      const kind = part.kind || 'other'
      if (!groups.has(kind)) groups.set(kind, [])
      groups.get(kind).push(part)
    }
    return [...groups.entries()]
      .sort((a, b) => KIND_ORDER.indexOf(a[0]) - KIND_ORDER.indexOf(b[0]))
      .map(([kind, items]) => ({ kind, label: KIND_LABELS[kind] || kind, parts: items }))
  }, [selectedOrgan])

  const partVisible = (code) => partVisibility[`${selected}:${code}`] !== false

  const selectTarget = (target) => {
    setSelected(target.organ)
    setSelectedTargetId(target.id)
    setApproach(target.approach || 'anterior')
    setDepth(0)
    setPathInfo(null)
    setSimulating(false)
    setSelectedPart(null)
    setDetailMode(true)
    engineRef.current?.setTarget(target)
  }

  const toggleTargetMode = (enabled) => {
    setTargetMode(enabled)
    if (!enabled) {
      setSelectedTargetId(null)
      setPathInfo(null)
      setDepth(0)
      setSimulating(false)
      setClipMode('off')
      setClipFlip(false)
      engineRef.current?.clearTarget()
      engineRef.current?.setClip('off', false)
      setDetailMode(false)
      engineRef.current?.setDetailMode(selected, false)
      return
    }
    setDetailMode(true)
    const first = TARGETS.find((target) => target.organ === selected)
    if (first) selectTarget(first)
  }

  const changeApproach = (next) => {
    setApproach(next)
    setDepth(0)
    setSimulating(false)
    engineRef.current?.setApproach(next)
  }

  const changeDepth = (value) => {
    setDepth(value)
    setSimulating(false)
    engineRef.current?.setNeedleDepth(value)
  }

  const startSimulation = () => {
    if (!selectedTarget || !pathInfo) return
    setSimulating(true)
    setDepth(0)
    engineRef.current?.startInsertion(1800)
  }

  const resetNeedle = () => {
    setDepth(0)
    setSimulating(false)
    engineRef.current?.setNeedleDepth(0)
  }

  const togglePart = (partCode) => {
    const key = `${selected}:${partCode}`
    const next = !partVisible(partCode)
    setPartVisibility((current) => ({ ...current, [key]: next }))
    engineRef.current?.setPartVisibility(selected, partCode, next)
  }

  const focusPart = (partCode) => {
    setSelectedPart(partCode)
    engineRef.current?.setPartSelected(selected, partCode)
    engineRef.current?.focusPart(selected, partCode)
  }

  return (
    <div className="module-view organ-view">
      <ViewHeader
        index="06"
        eyebrow="ORGAN ATLAS"
        title="器官模型库"
        titleSuffix="STANDARD REFERENCE"
        description="内置解剖参考模型、详细子结构与标准靶点，用于方位、教学、配准占位与流程演练。"
        meta={
          <>
            <span>{ORGAN_LIBRARY.version}</span>
            <i />
            <span>{RENDERABLE.length} 个器官</span>
            <i />
            <span>{ORGAN_LIBRARY.frame.name} · mm</span>
            <i />
            <span>{TARGETS.length} 个参考靶点</span>
          </>
        }
        actions={
          <>
            <Badge tone="amber" dot>标准参考 · 非患者解剖</Badge>
            <Button variant="outline" size="sm" icon={<RotateCcw size={14} />} onClick={() => engineRef.current?.resetView()}>
              重置视角
            </Button>
            <Button variant="outline" size="sm" icon={<Camera size={14} />} onClick={capture}>
              截取视图
            </Button>
            <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={() => {
              downloadCatalog()
              notify?.('标准器官目录已导出为 JSON')
            }}>
              导出目录
            </Button>
          </>
        }
      />

      <div className="module-body">
        <div className="viewer organ-viewer">
          <div className="three-host" ref={hostRef} />
          {loading ? <div className="webgl-error">正在加载标准器官模型…</div> : null}
          {error ? <div className="webgl-error">{error}</div> : null}
          <div className="volume-overlay-top">
            <span>{ORGAN_LIBRARY.frame.name} · MILLIMETRES</span>
            <span>{visibleCount} / {RENDERABLE.length} VISIBLE</span>
          </div>
          <div className="organ-axis-legend">
            <span className="axis-r">R</span>
            <span className="axis-a">A</span>
            <span className="axis-s">S</span>
            <em>+x R / +y A / +z S</em>
          </div>
          <div className="volume-tip">
            <Focus size={11} /> 单击器官选择 · 拖动旋转 · 滚轮缩放
          </div>
          <div className="organ-scalebar">
            <i />
            <span>100 mm</span>
          </div>
        </div>

        <aside className="inspector organ-inspector">
          <div className="selection-hero organ-hero">
            <div className="selection-eyebrow">
              <span>STANDARD ORGAN</span>
              <span className="selection-id">{selectedOrgan.code}</span>
            </div>
            <div className="selection-title">
              <span
                className="structure-swatch organ-swatch"
                style={{ background: selectedOrgan.color }}
              />
              <div>
                <h2>{selectedOrgan.name}</h2>
                <small>{selectedOrgan.en} · {selectedSystem?.en}</small>
              </div>
            </div>
            <p>{selectedOrgan.note}</p>
            <div className="selection-stats">
              <Stat label="系统" value={selectedSystem?.name || '—'} />
              <div className="organ-size-stat">
                <Stat label="尺寸" value={selectedOrgan.sizeMm.join(' × ')} unit="mm" />
              </div>
              <Stat label="编码" value={selectedOrgan.code} />
            </div>
            <div className="organ-actions">
              <Button size="sm" icon={<Focus size={13} />} onClick={() => focusOrgan(selectedOrgan.code)}>
                聚焦
              </Button>
              <Button size="sm" icon={<Boxes size={13} />} onClick={showOnlySelected}>
                只看选中
              </Button>
              <Button size="sm" icon={<Layers size={13} />} onClick={showAll}>
                全部显示
              </Button>
            </div>
          </div>

          <Section title="系统筛选" code="SYSTEMS" right={<Layers size={13} />}>
            <div className="organ-filter">
              <button
                type="button"
                className={activeSystem === 'all' ? 'active' : ''}
                onClick={() => setActiveSystem('all')}
              >
                全部
              </button>
              {ORGAN_LIBRARY.systems.map((system) => (
                <button
                  key={system.id}
                  type="button"
                  className={activeSystem === system.id ? 'active' : ''}
                  onClick={() => setActiveSystem(system.id)}
                >
                  <i style={{ background: system.color }} />
                  {system.name}
                </button>
              ))}
            </div>
          </Section>

          <Section title="器官清单" code="ORGANS" right={<Boxes size={13} />}>
            <div className="organ-list">
              {grouped.map((group) => (
                <div className="organ-group" key={group.id}>
                  <div className="organ-group-title">
                    <i style={{ background: group.color }} />
                    <span>{group.name}</span>
                    <em>{group.en}</em>
                  </div>
                  {group.organs.map((organ) => (
                    <div
                      key={organ.code}
                      className={`organ-row ${selected === organ.code ? 'active' : ''}`}
                      onClick={() => focusOrgan(organ.code)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') focusOrgan(organ.code)
                      }}
                    >
                      <i className="organ-dot" style={{ background: organ.color }} />
                      <span>
                        <b>{organ.name}</b>
                        <small>{organ.code}</small>
                      </span>
                      <button
                        type="button"
                        className={`organ-visibility ${visible[organ.code] ? 'on' : ''}`}
                        aria-label={`${visible[organ.code] ? '隐藏' : '显示'}${organ.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleOrgan(organ.code)
                        }}
                      >
                        {visible[organ.code] ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Section>

          <Section title="详细结构" code="SUB-STRUCTURES" right={<Boxes size={13} />}>
            {selectedOrgan.parts?.length ? (
              <>
                <Toggle
                  label="显示详细结构"
                  hint={`${selectedOrgan.parts.length} 个子结构 · 点击行聚焦`}
                  checked={detailMode}
                  onChange={(value) => {
                    setDetailMode(value)
                    engineRef.current?.setDetailMode(selected, value)
                  }}
                />
                {detailMode ? (
                  <div className="organ-part-list">
                    {partGroups.map((group) => (
                      <div className="organ-part-group" key={group.kind}>
                        <div className="organ-part-kind">
                          <span>{group.label}</span>
                          <em>{group.parts.length}</em>
                        </div>
                        {group.parts.map((part) => (
                          <div
                            key={part.code}
                            className={`organ-part-row ${selectedPart === part.code ? 'active' : ''}`}
                            onClick={() => focusPart(part.code)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') focusPart(part.code)
                            }}
                          >
                            <i style={{ background: PART_KIND_COLORS[group.kind] || selectedOrgan.color }} />
                            <span>
                              <b>{part.name}</b>
                              <small>{part.code}</small>
                            </span>
                            <button
                              type="button"
                              className={`organ-visibility ${partVisible(part.code) ? 'on' : ''}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                togglePart(part.code)
                              }}
                              aria-label={`${partVisible(part.code) ? '隐藏' : '显示'}${part.name}`}
                            >
                              {partVisible(part.code) ? <Eye size={13} /> : <EyeOff size={13} />}
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="wb-empty-line">开启后显示器官内部结构、分段和可独立选择的子结构。</div>
                )}
              </>
            ) : (
              <div className="wb-empty-line">该器官当前仅提供整体表面；详细结构将在后续版本补充。</div>
            )}
          </Section>

          <Section title="靶点与模拟" code="TARGET / SIMULATION" right={<Crosshair size={13} />}>
            <div className="organ-mode-row">
              <button type="button" className={!targetMode ? 'active' : ''} onClick={() => { if (targetMode) toggleTargetMode(false) }}>浏览</button>
              <button type="button" className={targetMode ? 'active' : ''} onClick={() => { if (!targetMode) toggleTargetMode(true) }}>靶点模拟</button>
            </div>
            {targetMode ? (
              <>
                <div className="organ-target-list">
                  {organTargets.length ? organTargets.map((target) => (
                    <button
                      type="button"
                      key={target.id}
                      className={`organ-target-row ${selectedTargetId === target.id ? 'active' : ''}`}
                      onClick={() => selectTarget(target)}
                    >
                      <span>
                        <b>{target.name}</b>
                        <small>{target.id} · {target.category}</small>
                      </span>
                      <em>{APPROACH_LABELS[target.approach] || target.approach}</em>
                    </button>
                  )) : <div className="wb-empty-line">该器官暂无标准靶点</div>}
                </div>
                {selectedTarget ? (
                  <>
                    <div className="scan-params organ-target-info">
                      <div><span>靶点坐标</span><b>{selectedTarget.coordinateMm.join(' / ')} mm</b></div>
                      <div><span>参考来源</span><b>{selectedTarget.reference}</b></div>
                      <div><span>路径长度</span><b>{pathInfo ? `${pathInfo.pathLength.toFixed(1)} mm` : '—'}</b></div>
                      <div><span>进针深度</span><b>{depth.toFixed(1)} mm</b></div>
                      <div><span>距靶点</span><b>{remaining !== null ? `${remaining.toFixed(1)} mm` : '—'}</b></div>
                      <div><span>入路</span><b>{APPROACH_LABELS[approach] || approach}</b></div>
                    </div>
                    <div className="organ-view-grid">
                      {['anterior', 'posterior', 'left', 'right'].map((item) => (
                        <button
                          key={item}
                          type="button"
                          className={approach === item ? 'active' : ''}
                          onClick={() => changeApproach(item)}
                        >
                          {APPROACH_LABELS[item]}
                        </button>
                      ))}
                    </div>
                    <Slider
                      label="进针深度 DEPTH"
                      value={depth}
                      min={0}
                      max={depthMax}
                      step={0.5}
                      onChange={changeDepth}
                      format={(value) => `${value.toFixed(1)} mm`}
                    />
                    <div className="organ-view-grid">
                      <button type="button" className={clipMode === 'off' ? 'active' : ''} onClick={() => setClipMode('off')}>关闭切面</button>
                      <button type="button" className={clipMode === 'axial' ? 'active' : ''} onClick={() => setClipMode('axial')}>轴位切面</button>
                      <button type="button" className={clipMode === 'coronal' ? 'active' : ''} onClick={() => setClipMode('coronal')}>冠状切面</button>
                      <button type="button" className={clipMode === 'sagittal' ? 'active' : ''} onClick={() => setClipMode('sagittal')}>矢状切面</button>
                    </div>
                    <Toggle label="翻转裁剪" hint="显示切面另一侧" checked={clipFlip} onChange={setClipFlip} />
                    <div className="organ-actions">
                      <Button size="sm" icon={<Activity size={13} />} onClick={startSimulation} disabled={simulating || !pathInfo}>
                        {simulating ? '模拟进针中…' : '模拟进针'}
                      </Button>
                      <Button size="sm" icon={<RotateCcw size={13} />} onClick={resetNeedle}>复位针尖</Button>
                    </div>
                    <p className="organ-frame-note">
                      路径经过：{collisionNames.length ? collisionNames.join('、') : '未检出其他参考器官（近似）'}
                    </p>
                    <p className="organ-target-warning">
                      <CircleAlert size={12} /> 教学 / 流程演示，不是手术规划或导航系统；不能用于真实穿刺、消融或介入操作。
                    </p>
                  </>
                ) : <div className="wb-empty-line">选择上方靶点开始</div>}
              </>
            ) : <div className="wb-empty-line">切换到「靶点模拟」查看标准靶点、正交切面与进针演示。</div>}
          </Section>

          <Section title="显示" code="RENDERING" right={<ShieldCheck size={13} />}>
            <div className="organ-mode-row">
              <button
                type="button"
                className={mode === 'solid' ? 'active' : ''}
                onClick={() => { setMode('solid'); setOpacity(1) }}
              >
                实体
              </button>
              <button
                type="button"
                className={mode === 'ghost' ? 'active' : ''}
                onClick={() => { setMode('ghost'); setOpacity(0.42) }}
              >
                半透明
              </button>
            </div>
            <div className="organ-view-grid">
              <button type="button" className={view === 'anterior' ? 'active' : ''} onClick={() => selectView('anterior')}>前面观</button>
              <button type="button" className={view === 'posterior' ? 'active' : ''} onClick={() => selectView('posterior')}>后面观</button>
              <button type="button" className={view === 'left' ? 'active' : ''} onClick={() => selectView('left')}>左侧观</button>
              <button type="button" className={view === 'right' ? 'active' : ''} onClick={() => selectView('right')}>右侧观</button>
            </div>
            <p className="organ-frame-note">放射学惯例：前面观时患者右侧位于图像左侧。</p>
            <Slider
              label="透明度 OPACITY"
              value={opacity}
              min={0.15}
              max={1}
              step={0.05}
              onChange={setOpacity}
              format={(value) => `${Math.round(value * 100)}%`}
            />
            <Toggle label="自动旋转" hint="展示模式" checked={autoRotate} onChange={setAutoRotate} />
          </Section>

          <Section title="标准信息" code="STANDARD" right={<ShieldCheck size={13} />}>
            <div className="scan-params">
              <div><span>目录版本</span><b>{ORGAN_LIBRARY.version}</b></div>
              <div><span>坐标系</span><b>{ORGAN_LIBRARY.frame.name}</b></div>
              <div><span>单位</span><b>{ORGAN_LIBRARY.frame.units}</b></div>
              <div><span>标准编码</span><b>{ORGAN_LIBRARY.organs.length + Object.keys(ORGAN_LIBRARY.standardCodes).length} 项</b></div>
              <div><span>心脏子结构</span><b>{Object.keys(ORGAN_LIBRARY.segLabelMap).join(', ')}</b></div>
              <div><span>几何来源</span><b>{selectedOrgan.mesh?.type === 'glb' ? '解剖 GLB' : '标准参考几何'}</b></div>
            </div>
            <p className="organ-frame-note">{ORGAN_LIBRARY.frame.description}</p>
            <p className="organ-source-note">{selectedOrgan.source}</p>
          </Section>

          <div className="cta-disclaimer">
            <CircleAlert size={12} />
            解剖参考模型与标准靶点用于方位、教学和流程演练；不是患者解剖，不用于诊断、测量或真实操作。
          </div>
        </aside>
      </div>
    </div>
  )
}
