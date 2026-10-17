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
import { useI18n } from '../i18n.js'

const MODES = [
  { value: 'all', labelKey: 'anatomy.modeAll', sub: 'ANATOMY' },
  { value: 'chamber', labelKey: 'anatomy.modeChamber', sub: 'CHAMBER' },
  { value: 'coronary', labelKey: 'anatomy.modeCoronary', sub: 'VESSELS' },
  { value: 'xray', labelKey: 'anatomy.modeXray', sub: 'X-RAY' },
]

const STRUCTURE_LIST = [
  ['LV', 'anatomy.lv'],
  ['RV', 'anatomy.rv'],
  ['LA', 'anatomy.la'],
  ['RA', 'anatomy.ra'],
  ['AO', 'anatomy.ao'],
  ['PT', 'anatomy.pt'],
  ['MV', 'anatomy.mv'],
  ['AV', 'anatomy.av'],
  ['LM', 'anatomy.lm'],
  ['LAD', 'anatomy.lad'],
  ['LCX', 'anatomy.lcx'],
  ['RCA', 'anatomy.rca'],
]

const STRUCTURE_METRICS = {
  LV: [['anatomy.metricEdv', '142', 'mL'], ['anatomy.metricEf', '54', '%'], ['anatomy.metricWall', '9.4', 'mm']],
  RV: [['anatomy.metricEdv', '118', 'mL'], ['anatomy.metricEf', '58', '%'], ['anatomy.metricFreeWall', '4.1', 'mm']],
  LA: [['anatomy.metricLavi', '31', 'mL/m²'], ['anatomy.metricAp', '36', 'mm']],
  RA: [['anatomy.metricLavi', '27', 'mL/m²'], ['anatomy.metricWidth', '34', 'mm']],
  AO: [['anatomy.metricSinus', '32', 'mm'], ['anatomy.metricAscending', '29', 'mm']],
  PT: [['anatomy.metricTrunk', '24', 'mm'], ['anatomy.metricBifurcation', '68', '°']],
  MV: [['anatomy.metricArea', '4.2', 'cm²'], ['anatomy.metricRegurg', 'anatomy.metricTrace', '']],
  AV: [['anatomy.metricVmax', '1.4', 'm/s'], ['anatomy.metricCalcium', 'anatomy.metricMild', '']],
  LM: [['anatomy.metricRef', '4.7', 'mm'], ['anatomy.metricStenosis', '0', '%']],
  LAD: [['anatomy.metricRef', '3.7', 'mm'], ['anatomy.metricStenosis', '70', '%']],
  LCX: [['anatomy.metricRef', '3.4', 'mm'], ['anatomy.metricStenosis', '22', '%']],
  RCA: [['anatomy.metricRef', '4.0', 'mm'], ['anatomy.metricStenosis', '30', '%']],
}

const GROUP_LABELS = {
  chamber: 'anatomy.groupChamber',
  great: 'anatomy.groupGreat',
  valve: 'anatomy.groupValve',
  coronary: 'anatomy.groupCoronary',
}

const CLINICAL_KEYS = {
  LV: 'anatomy.clinicalLv',
  RV: 'anatomy.clinicalRv',
  LA: 'anatomy.clinicalLa',
  RA: 'anatomy.clinicalRa',
  AO: 'anatomy.clinicalAo',
  PT: 'anatomy.clinicalPt',
  LM: 'anatomy.clinicalLm',
  LAD: 'anatomy.clinicalLad',
  LCX: 'anatomy.clinicalLcx',
  RCA: 'anatomy.clinicalRca',
  MV: 'anatomy.clinicalMv',
  AV: 'anatomy.clinicalAv',
}

const HEART_NAME = {
  LV: 'heart.nameLv', RV: 'heart.nameRv', LA: 'heart.nameLa', RA: 'heart.nameRa', AO: 'heart.nameAo', PT: 'heart.namePt',
  LPA: 'heart.nameLpa', RPA: 'heart.nameRpa', SVC: 'heart.nameSvc', IVC: 'heart.nameIvc',
  PVLU: 'heart.namePvlu', PVLL: 'heart.namePvll', PVRU: 'heart.namePvru', PVRL: 'heart.namePvrl',
  MV: 'heart.nameMv', TV: 'heart.nameTv', AV: 'heart.nameAv', PV: 'heart.namePv',
  LM: 'heart.nameLm', LAD: 'heart.nameLad', LCX: 'heart.nameLcx', D1: 'heart.nameD1', D2: 'heart.nameD2',
  OM1: 'heart.nameOm1', OM2: 'heart.nameOm2', RCA: 'heart.nameRca', AM: 'heart.nameAm', PDA: 'heart.namePda', PL: 'heart.namePl',
}

const HEART_DESC = {
  LV: 'heart.lv', RV: 'heart.rv', LA: 'heart.la', RA: 'heart.ra', AO: 'heart.ao', PT: 'heart.pt',
  LPA: 'heart.lpa', RPA: 'heart.rpa', SVC: 'heart.svc', IVC: 'heart.ivc',
  PVLU: 'heart.pv', PVLL: 'heart.pv', PVRU: 'heart.pv', PVRL: 'heart.pv',
  MV: 'heart.mv', TV: 'heart.tv', AV: 'heart.av', PV: 'heart.pvValve',
  LM: 'heart.lm', LAD: 'heart.lad', LCX: 'heart.lcx', D1: 'heart.d1', D2: 'heart.d2',
  OM1: 'heart.om1', OM2: 'heart.om2', RCA: 'heart.rca', AM: 'heart.am', PDA: 'heart.pda', PL: 'heart.pl',
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
  const { t, lang } = useI18n()
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
      setError('webgl')
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

  React.useEffect(() => {
    engineRef.current?.applyLanguage()
  }, [lang])

  const structure = HEART_DATA.meshes.find((item) => item.id === selected) || HEART_DATA.meshes[0]
  const metrics = STRUCTURE_METRICS[selected] || []
  const isLesion = selected === 'LAD'

  const primaryName = t(HEART_NAME[structure.id] || 'heart.nameLv')
  const secondaryName = structure.id
  const modes = MODES.map((item) => ({ ...item, label: t(item.labelKey) }))
  const coronaryJump = selected === 'LAD' || selected === 'LCX' || selected === 'RCA' || selected === 'LM'
  const metricText = (value) => (String(value).startsWith('anatomy.') ? t(value) : value)

  const capture = () => {
    const url = engineRef.current?.exportImage()
    if (url) {
      downloadDataUrl(url, `CardioScope_${selected}_3D.png`)
      notify(t('anatomy.exportToast'))
    }
  }

  return (
    <div className="module-view anatomy-view">
      <ViewHeader
        index="01"
        eyebrow="ANATOMY"
        title={t('anatomy.title')}
        titleSuffix="ANATOMICAL MODEL"
        description={t('anatomy.description')}
        meta={
          <>
            <span>{t('anatomy.metaChambers')}</span>
            <i />
            <span>{t('anatomy.metaVessels')}</span>
            <i />
            <span>{t('anatomy.metaWebgl')}</span>
          </>
        }
        actions={
          <>
            <Badge tone="teal" dot>{t('anatomy.synced')}</Badge>
            <Button variant="outline" size="sm" icon={<Camera size={14} />} onClick={capture}>
              {t('anatomy.capture')}
            </Button>
          </>
        }
      />

      <div className="module-body">
        <div className="viewer anatomy-viewer">
          <div className="three-host" ref={hostRef} />
          {error ? <div className="webgl-error">{t('anatomy.webgl')}</div> : null}

          <div className="viewer-overlay top-left">
            <Segmented options={modes} value={mode} onChange={setMode} className="mode-segmented" ariaLabel={t('anatomy.modes')} />
          </div>

          <div className="viewer-overlay top-right">
            <div className="floating-toolbar">
              <IconButton label={labels ? t('anatomy.hideLabels') : t('anatomy.showLabels')} className={labels ? 'active' : ''} onClick={() => setLabels((v) => !v)}>
                <Tag size={15} />
              </IconButton>
              <IconButton label={thorax ? t('anatomy.hideThorax') : t('anatomy.showThorax')} className={thorax ? 'active' : ''} onClick={() => setThorax((v) => !v)}>
                <Bone size={15} />
              </IconButton>
              <IconButton label={t('anatomy.autoRotate')} className={autoRotate ? 'active' : ''} onClick={() => setAutoRotate((v) => !v)}>
                <Rotate3d size={15} />
              </IconButton>
              <span className="toolbar-divider" />
              <IconButton label={t('anatomy.resetView')} onClick={() => engineRef.current?.resetCamera()}>
                <RotateCcw size={15} />
              </IconButton>
              <IconButton label={t('anatomy.fullscreen')} onClick={() => hostRef.current?.closest('.viewer')?.requestFullscreen?.()}>
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
                <strong>{playing ? t('anatomy.live') : t('anatomy.paused')}</strong>
              </div>
            </div>
            <button type="button" className="transport-button" onClick={() => setPlaying(!playing)} aria-label={playing ? t('anatomy.pause') : t('anatomy.play')}>
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
                aria-label={t('anatomy.hr')}
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
            {t('anatomy.tip')}
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
                <h2>{primaryName}</h2>
                <small>{secondaryName}</small>
              </div>
              <span className="selection-index">03</span>
            </div>
            <p>{CLINICAL_KEYS[selected] ? t(CLINICAL_KEYS[selected]) : (HEART_DESC[selected] ? t(HEART_DESC[selected]) : '')}</p>
            <div className="selection-stats">
              {metrics.slice(0, 3).map(([label, value, unit]) => (
                <Stat
                  key={label}
                  label={t(label)}
                  value={metricText(value)}
                  unit={unit}
                  accent={label === 'anatomy.metricStenosis' && Number(value) >= 50 ? 'amber' : undefined}
                />
              ))}
            </div>
            {isLesion ? (
              <button className="lesion-callout" type="button" onClick={() => onNavigate('angio')}>
                <span className="lesion-pulse" />
                <div>
                  <b>{t('anatomy.culprit')}</b>
                  <small>{t('anatomy.culpritSub')}</small>
                </div>
                <ArrowUpRight size={15} />
              </button>
            ) : (
              <button className="structure-jump" type="button" onClick={() => onNavigate(coronaryJump ? 'angio' : 'cta')}>
                <ScanEye size={14} />
                {t('anatomy.jump', { target: coronaryJump ? t('anatomy.targetAngio') : t('anatomy.targetCta') })}
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>

          <Section title={t('anatomy.navigator')} code="ANATOMY NAVIGATOR" right={<span className="section-hint">{t('common.items', { count: 12 })}</span>}>
            <div className="structure-grid">
              {STRUCTURE_LIST.map(([id, short]) => (
                <button
                  key={id}
                  type="button"
                  className={selected === id ? 'active' : ''}
                  onClick={() => setSelected(id)}
                >
                  <span>{t(short)}</span>
                  <small>{id}</small>
                </button>
              ))}
            </div>
          </Section>

          <Section title={t('anatomy.layers')} code="VISIBILITY" right={<Eye size={13} />}>
            <div className="layer-list">
              {Object.entries(GROUP_LABELS).map(([group, label]) => (
                <Toggle
                  key={group}
                  label={t(label)}
                  checked={layers[group]}
                  onChange={(value) => setLayers((current) => ({ ...current, [group]: value }))}
                />
              ))}
            </div>
          </Section>

          <Section title={t('anatomy.scene')} code="SCENE" right={<Sparkles size={13} />}>
            <div className="scene-toggle-grid">
              <Toggle label={t('anatomy.labels')} hint={t('anatomy.labelsHint')} checked={labels} onChange={setLabels} />
              <Toggle label={t('anatomy.thorax')} hint={t('anatomy.thoraxHint')} checked={thorax} onChange={setThorax} />
              <Toggle label={t('anatomy.autoRotate')} hint={t('cta.showMode')} checked={autoRotate} onChange={setAutoRotate} />
            </div>
            <div className="quality-row">
              <span>{t('anatomy.quality')}</span>
              <div className="quality-pills">
                <button type="button" className="active">{t('common.high')}</button>
                <button type="button">{t('common.medium')}</button>
              </div>
              <small>PBR + BLOOM</small>
            </div>
          </Section>

          <div className="inspector-footer">
            <Button variant="outline" size="sm" icon={<Camera size={14} />} onClick={capture}>{t('anatomy.export3d')}</Button>
            <Button variant="primary" size="sm" icon={<ArrowUpRight size={14} />} onClick={onReport}>{t('anatomy.makeReport')}</Button>
          </div>
        </aside>
      </div>
    </div>
  )
}
