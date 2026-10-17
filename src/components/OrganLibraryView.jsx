import React from 'react'
import {
  Boxes,
  Camera,
  CircleAlert,
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

const SYSTEM_MAP = Object.fromEntries(ORGAN_LIBRARY.systems.map((system) => [system.id, system]))
const RENDERABLE = ORGAN_LIBRARY.organs.filter((organ) => organ.renderable)

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
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!hostRef.current) return undefined
    try {
      const engine = new OrganLibraryEngine(hostRef.current, {
        autoRotate,
        opacity,
        onSelect: (code) => setSelected(code),
        onReady: () => setLoading(false),
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

  const selectedOrgan = ORGAN_LIBRARY.organs.find((organ) => organ.code === selected) || RENDERABLE[0]
  const selectedSystem = SYSTEM_MAP[selectedOrgan.system]
  const visibleCount = RENDERABLE.filter((organ) => {
    const systemVisible = activeSystem === 'all' || organ.system === activeSystem
    return visible[organ.code] && systemVisible
  }).length

  const focusOrgan = (code) => {
    setSelected(code)
    engineRef.current?.focus(code)
    engineRef.current?.setSelected(code)
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

  return (
    <div className="module-view organ-view">
      <ViewHeader
        index="06"
        eyebrow="ORGAN ATLAS"
        title="器官模型库"
        titleSuffix="STANDARD REFERENCE"
        description="内置标准化器官参考模型与统一编码，用于方位、教学、配准占位与界面标准化。"
        meta={
          <>
            <span>{ORGAN_LIBRARY.version}</span>
            <i />
            <span>{RENDERABLE.length} 个器官</span>
            <i />
            <span>{ORGAN_LIBRARY.frame.name} · mm</span>
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
            <span>RAS_BODY_CENTER · MILLIMETRES</span>
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
              <Stat label="尺寸" value={selectedOrgan.sizeMm.join('×')} unit="mm" />
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
              <div><span>几何来源</span><b>{selectedOrgan.mesh?.type === 'glb' ? '演示 GLB' : '标准参考几何'}</b></div>
            </div>
            <p className="organ-frame-note">{ORGAN_LIBRARY.frame.description}</p>
          </Section>

          <div className="cta-disclaimer">
            <CircleAlert size={12} />
            标准参考几何用于方位、教学、配准占位与界面标准化；不是患者解剖，不用于临床诊断或治疗决策。
          </div>
        </aside>
      </div>
    </div>
  )
}
