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
import { apiGet } from '../api/client.js'
import { serverText, useI18n } from '../i18n.js'
import ORGAN_LIBRARY from '../../shared/organ_library.json'
import ORGAN_TARGETS from '../../shared/organ_targets.json'

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

const SOURCE_META = {
  bodyparts3d: {
    name: 'SOURCE_NAME_BODYPARTS3D',
    institution: 'INSTITUTION_DBCLS',
    license: 'LICENSE_CC_BY_4_0',
    source: 'SOURCE_BODYPARTS3D',
  },
  hra: {
    name: 'SOURCE_NAME_HUBMAP_HRA',
    institution: 'INSTITUTION_HUBMAP',
    license: 'LICENSE_CC_BY_4_0',
    source: 'SOURCE_HUBMAP_HRA',
  },
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

function codedText(value, fallbackCode) {
  if (value && typeof value === 'object' && typeof value.code === 'string') return serverText(value)
  if (typeof value === 'string' && /^[A-Z][A-Z0-9_]*$/.test(value)) return serverText(value)
  if (fallbackCode) return serverText({ code: fallbackCode, params: {} })
  return typeof value === 'string' ? value : ''
}

function sourceValue(organ) {
  if (organ.source && typeof organ.source === 'object' && organ.source.code) return organ.source
  const known = SOURCE_META[organ.sourceId]
  if (known) return { code: known.source, params: {} }
  const text = typeof organ.source === 'string' ? organ.source : ''
  if (text.startsWith('BodyParts3D')) return { code: 'SOURCE_BODYPARTS3D', params: {} }
  if (text.startsWith('HuBMAP')) return { code: 'SOURCE_HUBMAP_HRA', params: {} }
  return { code: 'SOURCE_ORGAN', params: { code: organ.code } }
}

function noteValue(organ) {
  if (organ.note && typeof organ.note === 'object' && organ.note.code) return organ.note
  if (typeof organ.note === 'string' && organ.note.startsWith('Anatomical reference surface')) {
    return { code: 'NOTE_ANATOMICAL_REFERENCE', params: {} }
  }
  return { code: 'NOTE_ORGAN', params: { code: organ.code } }
}

function catalogField(source, field) {
  const value = source?.[field]
  if (value && typeof value === 'object' && typeof value.code === 'string') return serverText(value)
  const known = SOURCE_META[source?.id]
  if (known?.[field]) return serverText({ code: known[field], params: {} })
  const fallback = { name: 'SOURCE_NAME', institution: 'INSTITUTION', license: 'LICENSE' }[field]
  return serverText({ code: fallback, params: { id: source?.id || '' } })
}

export default function OrganLibraryView({ notify }) {
  const { t } = useI18n()
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
  const [remote, setRemote] = React.useState(null)

  React.useEffect(() => {
    let cancelled = false
    apiGet('/organs')
      .then((data) => {
        if (!cancelled && data?.organs) setRemote(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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
      setError(t('organ.webgl'))
      setLoading(false)
    }
    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
    // The engine is created once. Language changes re-render the DOM labels.
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

  const selectedLocal = ORGAN_LIBRARY.organs.find((organ) => organ.code === selected) || RENDERABLE[0]
  const selectedRemote = remote?.organs?.find((organ) => organ.code === selected)
  const selectedOrgan = selectedRemote ? { ...selectedLocal, ...selectedRemote, sizeMm: selectedLocal.sizeMm } : selectedLocal
  const systems = remote?.systems || ORGAN_LIBRARY.systems
  const sources = remote?.sources || ORGAN_LIBRARY.sources
  const visibleCount = RENDERABLE.filter((organ) => {
    const systemVisible = activeSystem === 'all' || organ.system === activeSystem
    return visible[organ.code] && systemVisible
  }).length
  const selectedName = codedText(selectedOrgan.name, selectedOrgan.code)
  const selectedSystemName = codedText(null, selectedOrgan.system)

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

  const grouped = systems.map((system) => ({
    ...system,
    organs: ORGAN_LIBRARY.organs.filter((organ) => organ.renderable && organ.system === system.id),
  }))

  const views = [
    ['anterior', 'organ.viewAnterior'],
    ['posterior', 'organ.viewPosterior'],
    ['left', 'organ.viewLeft'],
    ['right', 'organ.viewRight'],
  ]

  return (
    <div className="module-view organ-view">
      <ViewHeader
        index="06"
        eyebrow={t('organ.eyebrow')}
        title={t('organ.title')}
        titleSuffix={t('organ.titleSuffix')}
        description={t('organ.description')}
        meta={
          <>
            <span>{ORGAN_LIBRARY.version}</span>
            <i />
            <span>{t('organ.count', { count: RENDERABLE.length })}</span>
            <i />
            <span>{ORGAN_LIBRARY.frame.name} · mm</span>
            <i />
            <span>{TARGETS.length} 个参考靶点</span>
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
          {error ? <div className="webgl-error">{error}</div> : null}
          <div className="volume-overlay-top">
            <span>{ORGAN_LIBRARY.frame.name} · MILLIMETRES</span>
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
                <h2>{selectedName}</h2>
                <small>{selectedOrgan.code} · {selectedSystemName}</small>
              </div>
            </div>
            <p>{codedText(noteValue(selectedOrgan))}</p>
            <div className="selection-stats">
              <Stat label={t('organ.system')} value={selectedSystemName} />
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
              {systems.map((system) => (
                <button
                  key={system.id}
                  type="button"
                  className={activeSystem === system.id ? 'active' : ''}
                  onClick={() => setActiveSystem(system.id)}
                >
                  <i style={{ background: system.color }} />
                  {codedText(system.name, system.id)}
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
                    <span>{codedText(group.name, group.id)}</span>
                    <em>{group.id}</em>
                  </div>
                  {group.organs.map((organ) => {
                    const name = codedText(organ.name, organ.code)
                    return (
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
                          <b>{name}</b>
                          <small>{organ.code}</small>
                        </span>
                        <button
                          type="button"
                          className={`organ-visibility ${visible[organ.code] ? 'on' : ''}`}
                          aria-label={t(visible[organ.code] ? 'organ.hide' : 'organ.show', { name })}
                          onClick={(event) => {
                            event.stopPropagation()
                            toggleOrgan(organ.code)
                          }}
                        >
                          {visible[organ.code] ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
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
              {views.map(([id, key]) => (
                <button
                  key={id}
                  type="button"
                  className={view === id ? 'active' : ''}
                  onClick={() => selectView(id)}
                >
                  {t(key)}
                </button>
              ))}
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
              <div><span>{t('organ.heartParts')}</span><b>{Object.keys(ORGAN_LIBRARY.standardCodes).map((code) => serverText({ code, params: {} })).join(' · ')}</b></div>
              <div><span>{t('organ.geometry')}</span><b>{selectedOrgan.mesh?.type === 'glb' ? t('organ.sourceGlb') : t('organ.sourceReference')}</b></div>
            </div>
            <p className="organ-frame-note">{codedText(remote?.frame?.description, 'FRAME_RAS_ORGAN_REFERENCE')}</p>
            <p className="organ-source-note">{codedText(sourceValue(selectedOrgan))}</p>
            {sources.map((source) => (
              <p className="organ-source-note" key={source.id}>
                {catalogField(source, 'name')} · {catalogField(source, 'institution')} · {catalogField(source, 'license')}
              </p>
            ))}
          </Section>

          <div className="cta-disclaimer">
            <CircleAlert size={12} />
            <span>{t('organ.disclaimer')} {t('disclaimer.body')}</span>
          </div>
        </aside>
      </div>
    </div>
  )
}
