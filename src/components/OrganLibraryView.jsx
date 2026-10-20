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
import { useI18n } from '../i18n.js'

const SYSTEM_MAP = Object.fromEntries(ORGAN_LIBRARY.systems.map((system) => [system.id, system]))
const RENDERABLE = ORGAN_LIBRARY.organs.filter((organ) => organ.renderable)
const TARGETS = ORGAN_TARGETS.targets || []
const APPROACH_LABELS = { anterior: '前面入路', posterior: '后面入路', left: '左侧入路', right: '右侧入路' }
const KIND_LABELS = {
  capsule: '包膜', segment: '段/叶', lobe: '叶', ligament: '韧带/压迹', surface: '表面',
  chamber: '心腔', valve: '瓣膜', coronary: '冠脉', muscle: '乳头肌', cortex: '皮质',
  medulla: '髓质', calyx: '肾盏', pelvis: '肾盂', hilum: '肾门', vertebra: '椎体',
  nucleus: '核团', ventricle: '脑室', white_matter: '白质', commissure: '连合/胼胝体',
  organ: '整体', other: '其他',
}
const KIND_ORDER = ['chamber', 'valve', 'coronary', 'muscle', 'capsule', 'segment', 'lobe', 'surface', 'ligament', 'cortex', 'medulla', 'calyx', 'pelvis', 'hilum', 'vertebra', 'nucleus', 'ventricle', 'white_matter', 'commissure', 'organ', 'other']
const PART_KIND_COLORS = {
  chamber: '#c45258', valve: '#e0b07a', coronary: '#d46a5a', muscle: '#a85b50',
  capsule: '#8f4a43', segment: '#b06a5a', lobe: '#a65a50', surface: '#8a5a6a',
  ligament: '#8a7a60', cortex: '#b06a7a', medulla: '#d0a0a8', calyx: '#e0c8a0',
  pelvis: '#e8d8b8', hilum: '#c0a080', vertebra: '#b8b0a0', nucleus: '#c9a06a',
  ventricle: '#7fc4d8', white_matter: '#d8d0c0', commissure: '#b8a080', organ: '#a08a70', other: '#9aa8b0',
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
  const { lang, t } = useI18n()
  // Missing translations retain the catalog's original wording and identifiers.
  const tr = (key, fallback, vars) => {
    const translated = t(key, vars)
    return translated === key
      ? fallback.replace(/\{(\w+)\}/g, (match, name) => String(vars?.[name] ?? match))
      : translated
  }
  const catalogName = (item) => item
    ? tr(`codes.${item.code || item.id}`, lang === 'en' ? (item.en || item.name) : item.name)
    : '—'
  const partName = (part) => tr(`organ.partNames.${part.code}`, lang === 'en' ? (part.en || part.name) : part.name)
  const approachName = (value) => tr(`organ.approaches.${value}`, APPROACH_LABELS[value] || value)
  const kindName = (kind) => tr(`organ.partKinds.${kind}`, KIND_LABELS[kind] || kind)
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
      setError('organ.webgl')
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
      notify?.(t('organ.exportedPng'))
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
    (code) => {
      const organ = ORGAN_LIBRARY.organs.find((item) => item.code === code)
      return organ ? catalogName(organ) : code
    },
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
        eyebrow={t('organ.eyebrow')}
        title={t('organ.title')}
        titleSuffix={t('organ.titleSuffix')}
        description={tr('organ.detailDescription', '内置解剖参考模型、详细子结构与标准靶点，用于方位、教学、配准占位与流程演练。')}
        meta={
          <>
            <span>{ORGAN_LIBRARY.version}</span>
            <i />
            <span>{t('organ.count', { count: RENDERABLE.length })}</span>
            <i />
            <span>{ORGAN_LIBRARY.frame.name} · mm</span>
            <i />
            <span>{tr('organ.targetCount', '{count} 个参考靶点', { count: TARGETS.length })}</span>
          </>
        }
        actions={
          <>
            <Badge tone="amber" dot>{t('organ.badge')}</Badge>
            <Button variant="outline" size="sm" icon={<RotateCcw size={14} />} onClick={() => engineRef.current?.resetView()}>
              {t('organ.reset')}
            </Button>
            <Button variant="outline" size="sm" icon={<Camera size={14} />} onClick={capture}>
              {t('organ.capture')}
            </Button>
            <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={() => {
              downloadCatalog()
              notify?.(t('organ.exportedJson'))
            }}>
              {t('organ.export')}
            </Button>
          </>
        }
      />

      <div className="module-body">
        <div className="viewer organ-viewer">
          <div className="three-host" ref={hostRef} />
          {loading ? <div className="webgl-error">{t('organ.loading')}</div> : null}
          {error ? <div className="webgl-error">{t(error)}</div> : null}
          <div className="volume-overlay-top">
            <span>{ORGAN_LIBRARY.frame.name} · mm</span>
            <span>{t('organ.visible', { visible: visibleCount, total: RENDERABLE.length })}</span>
          </div>
          <div className="organ-axis-legend">
            <span className="axis-r">R</span>
            <span className="axis-a">A</span>
            <span className="axis-s">S</span>
            <em>+x R / +y A / +z S</em>
          </div>
          <div className="volume-tip">
            <Focus size={11} /> {t('organ.tip')}
          </div>
          <div className="organ-scalebar">
            <i />
            <span>100 mm</span>
          </div>
        </div>

        <aside className="inspector organ-inspector">
          <div className="selection-hero organ-hero">
            <div className="selection-eyebrow">
              <span>{t('organ.standardOrgan')}</span>
              <span className="selection-id">{selectedOrgan.code}</span>
            </div>
            <div className="selection-title">
              <span
                className="structure-swatch organ-swatch"
                style={{ background: selectedOrgan.color }}
              />
              <div>
                <h2>{catalogName(selectedOrgan)}</h2>
                <small>{selectedOrgan.en} · {selectedSystem?.en}</small>
              </div>
            </div>
            <p>{t('codes.NOTE_ANATOMICAL_REFERENCE')}</p>
            <div className="selection-stats">
              <Stat label={t('organ.system')} value={catalogName(selectedSystem)} />
              <div className="organ-size-stat">
                <Stat label={t('organ.size')} value={selectedOrgan.sizeMm.join(' × ')} unit="mm" />
              </div>
              <Stat label={t('organ.code')} value={selectedOrgan.code} />
            </div>
            <div className="organ-actions">
              <Button size="sm" icon={<Focus size={13} />} onClick={() => focusOrgan(selectedOrgan.code)}>
                {t('organ.focus')}
              </Button>
              <Button size="sm" icon={<Boxes size={13} />} onClick={showOnlySelected}>
                {t('organ.only')}
              </Button>
              <Button size="sm" icon={<Layers size={13} />} onClick={showAll}>
                {t('organ.showAll')}
              </Button>
            </div>
          </div>

          <Section title={t('organ.filter')} code="SYSTEMS" right={<Layers size={13} />}>
            <div className="organ-filter">
              <button
                type="button"
                className={activeSystem === 'all' ? 'active' : ''}
                onClick={() => setActiveSystem('all')}
              >
                {t('organ.all')}
              </button>
              {ORGAN_LIBRARY.systems.map((system) => (
                <button
                  key={system.id}
                  type="button"
                  className={activeSystem === system.id ? 'active' : ''}
                  onClick={() => setActiveSystem(system.id)}
                >
                  <i style={{ background: system.color }} />
                  {catalogName(system)}
                </button>
              ))}
            </div>
          </Section>

          <Section title={t('organ.list')} code="ORGANS" right={<Boxes size={13} />}>
            <div className="organ-list">
              {grouped.map((group) => (
                <div className="organ-group" key={group.id}>
                  <div className="organ-group-title">
                    <i style={{ background: group.color }} />
                    <span>{catalogName(group)}</span>
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
                        <b>{catalogName(organ)}</b>
                        <small>{organ.code}</small>
                      </span>
                      <button
                        type="button"
                        className={`organ-visibility ${visible[organ.code] ? 'on' : ''}`}
                        aria-label={t(visible[organ.code] ? 'organ.hide' : 'organ.show', { name: catalogName(organ) })}
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

          <Section title={tr('organ.detailTitle', '详细结构')} code="SUB-STRUCTURES" right={<Boxes size={13} />}>
            {selectedOrgan.parts?.length ? (
              <>
                <Toggle
                  label={tr('organ.detailShow', '显示详细结构')}
                  hint={tr('organ.detailCount', '{count} 个子结构 · 点击行聚焦', { count: selectedOrgan.parts.length })}
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
                          <span>{kindName(group.kind)}</span>
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
                              <b>{partName(part)}</b>
                              <small>{part.code}</small>
                            </span>
                            <button
                              type="button"
                              className={`organ-visibility ${partVisible(part.code) ? 'on' : ''}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                togglePart(part.code)
                              }}
                              aria-label={t(partVisible(part.code) ? 'organ.hide' : 'organ.show', { name: partName(part) })}
                            >
                              {partVisible(part.code) ? <Eye size={13} /> : <EyeOff size={13} />}
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="wb-empty-line">{tr('organ.detailHint', '开启后显示器官内部结构、分段和可独立选择的子结构。')}</div>
                )}
              </>
            ) : (
              <div className="wb-empty-line">{tr('organ.detailUnavailable', '该器官当前仅提供整体表面；详细结构将在后续版本补充。')}</div>
            )}
          </Section>

          <Section title={tr('organ.targetTitle', '靶点与模拟')} code="TARGET / SIMULATION" right={<Crosshair size={13} />}>
            <div className="organ-mode-row">
              <button type="button" className={!targetMode ? 'active' : ''} onClick={() => { if (targetMode) toggleTargetMode(false) }}>{tr('organ.targetBrowse', '浏览')}</button>
              <button type="button" className={targetMode ? 'active' : ''} onClick={() => { if (!targetMode) toggleTargetMode(true) }}>{tr('organ.targetSimulation', '靶点模拟')}</button>
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
                        <b>{tr(`organ.targetNames.${target.id}`, target.name)}</b>
                        <small>{target.id} · {kindName(target.category)}</small>
                      </span>
                      <em>{approachName(target.approach)}</em>
                    </button>
                  )) : <div className="wb-empty-line">{tr('organ.targetUnavailable', '该器官暂无标准靶点')}</div>}
                </div>
                {selectedTarget ? (
                  <>
                    <div className="scan-params organ-target-info">
                      <div><span>{tr('organ.targetCoordinates', '靶点坐标')}</span><b>{selectedTarget.coordinateMm.join(' / ')} mm</b></div>
                      <div><span>{tr('organ.targetReference', '参考来源')}</span><b>{selectedTarget.reference}</b></div>
                      <div><span>{tr('organ.targetPathLength', '路径长度')}</span><b>{pathInfo ? `${pathInfo.pathLength.toFixed(1)} mm` : '—'}</b></div>
                      <div><span>{tr('organ.targetDepth', '进针深度')}</span><b>{depth.toFixed(1)} mm</b></div>
                      <div><span>{tr('organ.targetRemaining', '距靶点')}</span><b>{remaining !== null ? `${remaining.toFixed(1)} mm` : '—'}</b></div>
                      <div><span>{tr('organ.targetApproach', '入路')}</span><b>{approachName(approach)}</b></div>
                    </div>
                    <div className="organ-view-grid">
                      {['anterior', 'posterior', 'left', 'right'].map((item) => (
                        <button
                          key={item}
                          type="button"
                          className={approach === item ? 'active' : ''}
                          onClick={() => changeApproach(item)}
                        >
                          {approachName(item)}
                        </button>
                      ))}
                    </div>
                    <Slider
                      label={tr('organ.targetDepth', '进针深度 DEPTH')}
                      value={depth}
                      min={0}
                      max={depthMax}
                      step={0.5}
                      onChange={changeDepth}
                      format={(value) => `${value.toFixed(1)} mm`}
                    />
                    <div className="organ-view-grid">
                      <button type="button" className={clipMode === 'off' ? 'active' : ''} onClick={() => setClipMode('off')}>{tr('organ.targetClipOff', '关闭切面')}</button>
                      <button type="button" className={clipMode === 'axial' ? 'active' : ''} onClick={() => setClipMode('axial')}>{tr('organ.targetClipAxial', '轴位切面')}</button>
                      <button type="button" className={clipMode === 'coronal' ? 'active' : ''} onClick={() => setClipMode('coronal')}>{tr('organ.targetClipCoronal', '冠状切面')}</button>
                      <button type="button" className={clipMode === 'sagittal' ? 'active' : ''} onClick={() => setClipMode('sagittal')}>{tr('organ.targetClipSagittal', '矢状切面')}</button>
                    </div>
                    <Toggle label={tr('organ.targetClipFlip', '翻转裁剪')} hint={tr('organ.targetClipFlipHint', '显示切面另一侧')} checked={clipFlip} onChange={setClipFlip} />
                    <div className="organ-actions">
                      <Button size="sm" icon={<Activity size={13} />} onClick={startSimulation} disabled={simulating || !pathInfo}>
                        {simulating ? tr('organ.targetSimulating', '模拟进针中…') : tr('organ.targetSimulate', '模拟进针')}
                      </Button>
                      <Button size="sm" icon={<RotateCcw size={13} />} onClick={resetNeedle}>{tr('organ.targetResetNeedle', '复位针尖')}</Button>
                    </div>
                    <p className="organ-frame-note">
                      {tr('organ.targetCollisions', '路径经过：{names}', {
                        names: collisionNames.length
                          ? collisionNames.join(lang === 'en' ? ', ' : '、')
                          : tr('organ.targetNoCollisions', '未检出其他参考器官（近似）'),
                      })}
                    </p>
                    <p className="organ-target-warning">
                      <CircleAlert size={12} /> {tr('organ.targetWarning', '教学 / 流程演示，不是手术规划或导航系统；不能用于真实穿刺、消融或介入操作。')}
                    </p>
                  </>
                ) : <div className="wb-empty-line">{tr('organ.targetSelect', '选择上方靶点开始')}</div>}
              </>
            ) : <div className="wb-empty-line">{tr('organ.targetHint', '切换到「靶点模拟」查看标准靶点、正交切面与进针演示。')}</div>}
          </Section>

          <Section title={t('organ.display')} code="RENDERING" right={<ShieldCheck size={13} />}>
            <div className="organ-mode-row">
              <button
                type="button"
                className={mode === 'solid' ? 'active' : ''}
                onClick={() => { setMode('solid'); setOpacity(1) }}
              >
                {t('organ.solid')}
              </button>
              <button
                type="button"
                className={mode === 'ghost' ? 'active' : ''}
                onClick={() => { setMode('ghost'); setOpacity(0.42) }}
              >
                {t('organ.ghost')}
              </button>
            </div>
            <div className="organ-view-grid">
              <button type="button" className={view === 'anterior' ? 'active' : ''} onClick={() => selectView('anterior')}>{t('organ.viewAnterior')}</button>
              <button type="button" className={view === 'posterior' ? 'active' : ''} onClick={() => selectView('posterior')}>{t('organ.viewPosterior')}</button>
              <button type="button" className={view === 'left' ? 'active' : ''} onClick={() => selectView('left')}>{t('organ.viewLeft')}</button>
              <button type="button" className={view === 'right' ? 'active' : ''} onClick={() => selectView('right')}>{t('organ.viewRight')}</button>
            </div>
            <p className="organ-frame-note">{t('organ.radiology')}</p>
            <Slider
              label={t('organ.opacity')}
              value={opacity}
              min={0.15}
              max={1}
              step={0.05}
              onChange={setOpacity}
              format={(value) => `${Math.round(value * 100)}%`}
            />
            <Toggle label={t('organ.autoRotate')} hint={t('organ.showMode')} checked={autoRotate} onChange={setAutoRotate} />
          </Section>

          <Section title={t('organ.info')} code="STANDARD" right={<ShieldCheck size={13} />}>
            <div className="scan-params">
              <div><span>{t('organ.catalogVersion')}</span><b>{ORGAN_LIBRARY.version}</b></div>
              <div><span>{t('organ.frame')}</span><b>{ORGAN_LIBRARY.frame.name}</b></div>
              <div><span>{t('organ.units')}</span><b>{ORGAN_LIBRARY.frame.units}</b></div>
              <div><span>{t('organ.standardCodes')}</span><b>{t('organ.codeCount', { count: ORGAN_LIBRARY.organs.length + Object.keys(ORGAN_LIBRARY.standardCodes).length })}</b></div>
              <div><span>{t('organ.heartParts')}</span><b>{Object.keys(ORGAN_LIBRARY.segLabelMap).join(', ')}</b></div>
              <div><span>{t('organ.geometry')}</span><b>{t(selectedOrgan.mesh?.type === 'glb' ? 'organ.sourceGlb' : 'organ.sourceReference')}</b></div>
            </div>
            <p className="organ-frame-note">{t('organ.frameDescription')}</p>
            <p className="organ-source-note">{
              selectedOrgan.source?.startsWith('BodyParts3D')
                ? t('codes.SOURCE_BODYPARTS3D')
                : selectedOrgan.source?.startsWith('HuBMAP')
                  ? t('codes.SOURCE_HUBMAP_HRA')
                  : selectedOrgan.source
            }</p>
          </Section>

          <div className="cta-disclaimer">
            <CircleAlert size={12} />
            {tr('organ.detailDisclaimer', '解剖参考模型与标准靶点用于方位、教学和流程演练；不是患者解剖，不用于诊断、测量或真实操作。')}
          </div>
        </aside>
      </div>
    </div>
  )
}
