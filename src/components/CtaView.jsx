import React from 'react'
import {
  Activity,
  Bone,
  Camera,
  CircleAlert,
  Crosshair,
  Eye,
  Layers,
  RotateCcw,
  Rotate3d,
  ScanLine,
  Sparkles,
} from 'lucide-react'
import ViewHeader from './ViewHeader.jsx'
import MprViewport from './MprViewport.jsx'
import { Badge, Button, Section, Segmented, Slider, Stat, Toggle } from './ui.jsx'
import VolumeRenderer from '../three/VolumeRenderer.js'
import { getCardiacVolume } from '../three/volume.js'
import { getVolumeData } from '../api/client.js'
import { useStudy } from '../study/StudyContext.jsx'
import { enumLabel, errorDetail, serverText, useI18n } from '../i18n.js'

const WINDOW_PRESETS = {
  cta: { labelKey: 'cta.windowCta', sub: 'CCTA', width: 800, level: 300 },
  mediastinum: { labelKey: 'cta.windowMediastinum', sub: 'MEDIASTINUM', width: 400, level: 40 },
  lung: { labelKey: 'cta.windowLung', sub: 'LUNG', width: 1500, level: -600 },
  bone: { labelKey: 'cta.windowBone', sub: 'BONE', width: 2000, level: 400 },
}

const SCENE_EXTENT = 3.0

function sceneVolume(meta, data) {
  const sizeMm = meta.dims.map((value, index) => value * meta.spacing[index])
  const scale = SCENE_EXTENT / Math.max(...sizeMm, 0.001)
  return {
    ...meta,
    data,
    bounds: {
      min: sizeMm.map((value) => (-value * scale) / 2),
      max: sizeMm.map((value) => (value * scale) / 2),
    },
    sceneScale: scale,
  }
}

function markerOrDefault(meta, volume) {
  const marker = meta?.markers?.[0]
  if (marker?.voxel) return { x: marker.voxel[0], y: marker.voxel[1], z: marker.voxel[2] }
  if (meta?.defaultSlices) return meta.defaultSlices
  if (!volume) return { x: 0, y: 0, z: 0 }
  return {
    x: Math.floor(volume.dims[0] / 2),
    y: Math.floor(volume.dims[1] / 2),
    z: Math.floor(volume.dims[2] / 2),
  }
}

function downloadDataUrl(dataUrl, name) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = name
  link.click()
}

export default function CtaView({ notify, bpm, playing }) {
  const { t } = useI18n()
  const {
    study,
    selectedVolume: volumeMeta,
    selectedSeries,
    measurements,
    isApi,
    isDemo,
  } = useStudy()
  const studyInfo = study?.study
  const latestJob = study?.jobs?.length ? study.jobs[study.jobs.length - 1] : null
  const [volume, setVolume] = React.useState(null)
  const [volumeLoading, setVolumeLoading] = React.useState(false)
  const [slices, setSlices] = React.useState({ x: 72, y: 90, z: 65 })
  const [windowWidth, setWindowWidth] = React.useState(800)
  const [windowLevel, setWindowLevel] = React.useState(300)
  const [activePreset, setActivePreset] = React.useState('cta')
  const [volumeOpacity, setVolumeOpacity] = React.useState(1)
  const [autoRotate, setAutoRotate] = React.useState(true)
  const [mip, setMip] = React.useState(false)
  const [error, setError] = React.useState('')
  const volumeHostRef = React.useRef(null)
  const volumeEngineRef = React.useRef(null)

  const volumeId = volumeMeta?.id
  const volumeDataUrl = volumeMeta?.dataUrl
  const marker = volumeMeta?.markers?.[0] || null
  const lesionVoxel = React.useMemo(() => {
    if (!volume) return null
    return markerOrDefault(volumeMeta, volume)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, volumeId])

  React.useEffect(() => {
    let cancelled = false
    setError('')
    if (!volumeMeta) {
      setVolume(null)
      setVolumeLoading(false)
      return undefined
    }
    setVolumeLoading(true)
    const timer = setTimeout(async () => {
      try {
        let next
        if (!volumeDataUrl) {
          // Offline demo adapter: the volume is generated locally.
          next = getCardiacVolume()
        } else {
          const data = await getVolumeData(volumeMeta)
          if (cancelled) return
          next = sceneVolume(volumeMeta, data)
        }
        if (cancelled) return
        setVolume(next)
        setSlices(markerOrDefault(volumeMeta, next))
      } catch (err) {
        console.error(err)
        if (!cancelled) setError(errorDetail(err))
      } finally {
        if (!cancelled) setVolumeLoading(false)
      }
    }, 30)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // The volume object is replaced on study refresh; re-fetch only by identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeId, volumeDataUrl])

  const measurementMap = React.useMemo(
    () => Object.fromEntries(measurements.map((item) => [item.code, item])),
    [measurements],
  )
  const measurementValue = (code, digits = 0) => {
    const item = measurementMap[code]
    if (!item || item.status !== 'computed' || item.value === null || item.value === undefined) return null
    return `${Number(item.value).toFixed(digits)}${item.unit ? ` ${item.unit}` : ''}`
  }
  const measurementItem = (code) => measurementMap[code] || null
  const selectedSeriesMeta = selectedSeries || {}
  const seriesLabel = selectedSeriesMeta.description || 'CARDIAC CTA'
  const matrixLabel = selectedSeriesMeta.rows && selectedSeriesMeta.cols
    ? `${selectedSeriesMeta.rows} × ${selectedSeriesMeta.cols} MATRIX`
    : 'MATRIX —'
  const thicknessLabel = selectedSeriesMeta.sliceThickness
    ? `${Number(selectedSeriesMeta.sliceThickness).toFixed(2)} mm`
    : '—'
  const kernelLabel = selectedSeriesMeta.kernel || '—'
  const hasApiStudy = isApi && studyInfo
  const isProcessing = hasApiStudy && ['queued', 'processing', 'uploaded'].includes(studyInfo.status)

  React.useEffect(() => {
    if (!volume || !volumeHostRef.current) return undefined
    try {
      volumeEngineRef.current = new VolumeRenderer(volumeHostRef.current, volume, {
        opacity: volumeOpacity,
        autoRotate,
      })
    } catch (err) {
      console.error(err)
      setError('webgl')
    }
    return () => {
      volumeEngineRef.current?.dispose()
      volumeEngineRef.current = null
    }
    // The renderer is created once per volume; settings are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume])

  React.useEffect(() => {
    volumeEngineRef.current?.setOpacity(volumeOpacity)
  }, [volumeOpacity])

  React.useEffect(() => {
    volumeEngineRef.current?.setAutoRotate(autoRotate)
  }, [autoRotate])

  React.useEffect(() => {
    volumeEngineRef.current?.setMip(mip)
  }, [mip])

  const pickPreset = (key) => {
    const preset = WINDOW_PRESETS[key]
    setActivePreset(key)
    setWindowWidth(preset.width)
    setWindowLevel(preset.level)
  }

  const adjustWindow = (setter) => (value) => {
    setter(value)
    setActivePreset('custom')
  }

  const resetSlices = () => {
    if (volume) setSlices(markerOrDefault(volumeMeta, volume))
    volumeEngineRef.current?.resetCamera()
    notify(t('cta.resetToast'))
  }

  const captureVolume = () => {
    const url = volumeEngineRef.current?.capture()
    if (url) {
      downloadDataUrl(url, 'CardioScope_CCTA_3D_VRT.png')
      notify(t('cta.exportToast'))
    }
  }

  return (
    <div className="module-view cta-view">
      <ViewHeader
        index="03"
        eyebrow="CARDIAC CT"
        title={t('cta.title')}
        titleSuffix="MULTI-PLANAR · VRT"
        description={t('cta.descriptionTail', {
          source: isDemo ? t('cta.descriptionDemo') : t('cta.descriptionServer'),
          thickness: thicknessLabel,
        })}
        meta={
          <>
            <span>{thicknessLabel}</span>
            <i />
            <span>{selectedSeriesMeta.kvp ? `${selectedSeriesMeta.kvp} kV` : 'kV —'}</span>
            <i />
            <span>{isDemo ? 'DEMO · SYNTHETIC' : 'DICOM · RESEARCH'}</span>
          </>
        }
        actions={
          <>
            <Badge tone={volume ? 'teal' : isProcessing ? 'amber' : 'neutral'} dot>
              {volume ? t('cta.ready') : isProcessing ? t('cta.rebuilding') : t('cta.noVolume')}
            </Badge>
            <Button variant="outline" size="sm" icon={<RotateCcw size={14} />} onClick={resetSlices}>
              {t('cta.reset')}
            </Button>
            <Button variant="outline" size="sm" icon={<Camera size={14} />} onClick={captureVolume}>
              {t('cta.export')}
            </Button>
          </>
        }
      />

      <div className="module-body">
        <div className="viewer cta-viewer">
          {error ? <div className="webgl-error">{error === 'webgl' ? t('cta.webgl') : t('cta.loadFailed', { message: serverText(error) })}</div> : null}
          <div className="cta-top-strip">
            <div>
              <span className="cta-series-label"><Layers size={12} /> SERIES {selectedSeriesMeta.number ?? '—'} · {seriesLabel}</span>
              <span className="cta-series-meta">{matrixLabel} · {thicknessLabel} · {kernelLabel}</span>
            </div>
            <div className="cta-phase">
              <span className="cta-phase-dot" />
              <span>ECG GATE · {isDemo ? `${bpm} BPM` : '—'}</span>
              <span className="cta-phase-progress"><i style={{ animationPlayState: playing ? 'running' : 'paused' }} /></span>
              <span>{playing ? 'CINE 4D READY' : 'PAUSED'}</span>
            </div>
          </div>

          <div className="cta-grid">
            {volume ? (
              <>
                <MprViewport
                  volume={volume}
                  plane="axial"
                  slices={slices}
                  setSlices={setSlices}
                  windowWidth={windowWidth}
                  windowLevel={windowLevel}
                  lesionVoxel={lesionVoxel}
                  lesionLabel={marker?.label || ''}
                  renderTag={isDemo ? 'DEMO · SYNTHETIC' : 'DICOM · RESEARCH'}
                />
                <MprViewport
                  volume={volume}
                  plane="coronal"
                  slices={slices}
                  setSlices={setSlices}
                  windowWidth={windowWidth}
                  windowLevel={windowLevel}
                  lesionVoxel={lesionVoxel}
                  lesionLabel={marker?.label || ''}
                  renderTag={isDemo ? 'DEMO · SYNTHETIC' : 'DICOM · RESEARCH'}
                />
                <MprViewport
                  volume={volume}
                  plane="sagittal"
                  slices={slices}
                  setSlices={setSlices}
                  windowWidth={windowWidth}
                  windowLevel={windowLevel}
                  lesionVoxel={lesionVoxel}
                  lesionLabel={marker?.label || ''}
                  renderTag={isDemo ? 'DEMO · SYNTHETIC' : 'DICOM · RESEARCH'}
                />
              </>
            ) : (
              <>
                <div className="cta-panel mpr-skeleton" />
                <div className="cta-panel mpr-skeleton" />
                <div className="cta-panel mpr-skeleton" />
              </>
            )}

            <div className="cta-panel cta-volume-panel">
              <header className="cta-panel-head">
                <div className="cta-panel-title">
                  <i className="plane-dot violet" />
                  <span>{t('cta.volume')}</span>
                  <em>VOLUME RENDERING</em>
                </div>
                <span className="cta-vrt-badge">CINEMATIC VRT</span>
              </header>
              <div className="volume-stage">
                <div className="volume-host" ref={volumeHostRef} />
                <div className="volume-grid-lines" />
                <div className="volume-overlay-top">
                  <span>CARDIAC VRT · 360°</span>
                  <span>{mip ? 'MIP' : 'COMPOSITE'}</span>
                </div>
                <div className="volume-legend">
                  <span><i className="legend-bone" />{t('cta.legendBone')}</span>
                  <span><i className="legend-contrast" />{t('cta.legendContrast')}</span>
                  <span><i className="legend-muscle" />{t('cta.legendMuscle')}</span>
                </div>
                <div className="volume-tip">
                  <Rotate3d size={11} /> {t('cta.drag')}
                </div>
              </div>
              <footer className="cta-panel-foot">
                <span>OPACITY {Math.round(volumeOpacity * 100)}% · {autoRotate ? 'AUTO ROTATE' : 'STATIC'}</span>
                <span>3D</span>
              </footer>
            </div>
          </div>

          <div className="cta-bottom-strip">
            <div className="cta-finding-chip">
              <CircleAlert size={12} />
              <span>
                {measurementValue('STENOSIS_LAD', 0)
                  ? t('cta.stenosisValue', { value: measurementValue('STENOSIS_LAD', 0) })
                  : t('cta.stenosisMissing')}
              </span>
              <b>{measurementValue('FFR_CT', 2) || t('cta.ffrMissing')}</b>
            </div>
            <div className="cta-scan-facts">
              {volumeMeta?.scanner ? (
                <>
                  <span>DLP {volumeMeta.scanner.dlp}</span>
                  <span>CTDIvol {volumeMeta.scanner.ctdivol}</span>
                  <span>EFFECTIVE DOSE {volumeMeta.scanner.effectiveDose}</span>
                </>
              ) : (
                <>
                  <span>SLICES {selectedSeriesMeta.sliceCount ?? '—'}</span>
                  <span>SPACING {thicknessLabel}</span>
                  <span>CONTRAST {selectedSeriesMeta.contrastAgent || '—'}</span>
                </>
              )}
            </div>
            <div className="cta-hint">
              <Crosshair size={11} /> {t('cta.crosshair')}
            </div>
          </div>

          {!volume && !error ? (
            <div className="cta-loading">
              <div className="cta-scan-anim">
                <span />
              </div>
              {isApi && !studyInfo ? (
                <>
                  <b>{t('cta.emptyTitle')}</b>
                  <small>{t('cta.emptyHint')}</small>
                </>
              ) : isProcessing ? (
                <>
                  <b>{t('cta.processingTitle')}</b>
                  <small>{enumLabel('stage', latestJob?.stage) || latestJob?.stage || enumLabel('status', 'queued')} · {latestJob?.progress ?? 0}%</small>
                </>
              ) : volumeLoading ? (
                <>
                  <b>{t('cta.loadingTitle')}</b>
                  <small>{t('cta.loadingHint')}</small>
                </>
              ) : (
                <>
                  <b>{t('cta.missingTitle')}</b>
                  <small>{t('cta.missingHint')}</small>
                </>
              )}
            </div>
          ) : null}
        </div>

        <aside className="inspector cta-inspector">
          <div className="selection-hero cta-hero">
            <div className="selection-eyebrow">
              <span>CARDIAC CTA</span>
              <span className="selection-id">SERIES · 03</span>
            </div>
            <div className="selection-title">
              <span className="structure-swatch swatch-great" />
              <div>
                <h2>{t('cta.heroTitle')}</h2>
                <small>Coronary computed tomography angiography</small>
              </div>
            </div>
            <p>{isDemo ? t('cta.heroDemo') : t('cta.heroApi')}</p>
            <div className="selection-stats">
              <Stat
                label={t('cta.calcium')}
                value={measurementItem('CALCIUM_SCORE')?.value ?? '—'}
                accent="amber"
                hint={measurementItem('CALCIUM_SCORE')?.status === 'computed' ? 'Agatston' : t('common.notComputed')}
              />
              <Stat
                label={t('cta.stenosis')}
                value={measurementItem('STENOSIS_LAD')?.value ?? '—'}
                unit={measurementItem('STENOSIS_LAD')?.unit || '%'}
                accent="amber"
                hint={measurementItem('STENOSIS_LAD')?.status === 'computed' ? 'LAD' : t('common.notComputed')}
              />
              <Stat
                label="FFR-CT"
                value={measurementItem('FFR_CT')?.value ?? '—'}
                hint={measurementItem('FFR_CT')?.status === 'computed' ? t('cta.hemodynamics') : t('common.notComputed')}
              />
            </div>
            {study?.measurements?.some((item) => item.validationStatus === 'synthetic') ? (
              <div className="provenance-note">
                <CircleAlert size={11} /> {t('cta.syntheticNote')}
              </div>
            ) : null}
          </div>

          <Section title={t('cta.window')} code="WINDOW / LEVEL" right={<Eye size={13} />}>
            <div className="cta-window-presets">
              {Object.entries(WINDOW_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  className={activePreset === key ? 'active' : ''}
                  onClick={() => pickPreset(key)}
                >
                  <span>{t(preset.labelKey)}</span>
                  <small>{preset.width} / {preset.level}</small>
                </button>
              ))}
            </div>
            <div className="cta-window-sliders">
              <Slider label={t('cta.ww')} value={windowWidth} min={100} max={2400} step={10} onChange={adjustWindow(setWindowWidth)} />
              <Slider label={t('cta.wl')} value={windowLevel} min={-800} max={800} step={5} onChange={adjustWindow(setWindowLevel)} />
            </div>
            <div className="cta-window-readout">
              <span>RANGE</span>
              <b>{windowLevel - windowWidth / 2} → {windowLevel + windowWidth / 2} HU</b>
            </div>
          </Section>

          <Section title={t('cta.mpr')} code="MPR LOCALIZER" right={<Crosshair size={13} />}>
            <div className="cta-slice-sliders">
              <Slider
                label={t('cta.axial')}
                value={slices.z}
                min={0}
                max={(volume?.dims[2] || 168) - 1}
                onChange={(value) => setSlices((current) => ({ ...current, z: value }))}
                format={(value) => `${String(value + 1).padStart(3, '0')} / ${volume?.dims[2] || 168}`}
              />
              <Slider
                label={t('cta.coronal')}
                value={slices.y}
                min={0}
                max={(volume?.dims[1] || 128) - 1}
                onChange={(value) => setSlices((current) => ({ ...current, y: value }))}
                format={(value) => `${String(value + 1).padStart(3, '0')} / ${volume?.dims[1] || 128}`}
              />
              <Slider
                label={t('cta.sagittal')}
                value={slices.x}
                min={0}
                max={(volume?.dims[0] || 128) - 1}
                onChange={(value) => setSlices((current) => ({ ...current, x: value }))}
                format={(value) => `${String(value + 1).padStart(3, '0')} / ${volume?.dims[0] || 128}`}
              />
            </div>
            <div className="cta-slice-note">
              <span className="cta-lesion-pin" />
              {marker ? t('cta.crosshairAt', { label: marker.label }) : t('cta.crosshairCenter')}
            </div>
          </Section>

          <Section title={t('cta.vrt')} code="3D VRT" right={<Sparkles size={13} />}>
            <Slider
              label={t('cta.opacity')}
              value={volumeOpacity}
              min={0.25}
              max={1.5}
              step={0.05}
              onChange={setVolumeOpacity}
              format={(value) => `${Math.round(value * 100)}%`}
            />
            <div className="cta-vrt-toggles">
              <Toggle label={t('cta.autoRotate')} hint={t('cta.showMode')} checked={autoRotate} onChange={setAutoRotate} />
              <Toggle label={t('cta.mip')} hint={t('cta.mipHint')} checked={mip} onChange={setMip} />
            </div>
          </Section>

          <Section title={t('cta.findings')} code="MEASUREMENTS" right={<Activity size={13} />}>
            {isDemo ? (
              <div className="cta-finding-list">
                <div className="cta-finding-row critical">
                  <span className="finding-index">01</span>
                  <div>
                    <b>{t('cta.finding1')}</b>
                    <small>{t('cta.finding1sub')}</small>
                  </div>
                  <Badge tone="red">{t('common.demo')}</Badge>
                </div>
                <div className="cta-finding-row mild">
                  <span className="finding-index">02</span>
                  <div>
                    <b>{t('cta.finding2')}</b>
                    <small>{t('cta.finding2sub')}</small>
                  </div>
                  <Badge tone="teal">{t('common.demo')}</Badge>
                </div>
                <div className="cta-finding-row">
                  <span className="finding-index">03</span>
                  <div>
                    <b>{t('cta.finding3')}</b>
                    <small>{t('cta.finding3sub')}</small>
                  </div>
                  <Badge>{t('common.demo')}</Badge>
                </div>
              </div>
            ) : study?.measurements?.length ? (
              <div className="cta-finding-list">
                {study.measurements.map((item, index) => (
                  <div key={item.id} className={`cta-finding-row ${item.status === 'computed' ? '' : 'muted'}`}>
                    <span className="finding-index">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <b>{item.label}</b>
                      <small>
                        {item.status === 'computed'
                          ? `${item.value ?? '—'}${item.unit ? ` ${item.unit}` : ''} · ${item.method} · ${item.validationStatus}`
                          : (item.reason ? serverText(item.reason) : t('common.notComputed'))}
                      </small>
                    </div>
                    <Badge tone={item.status === 'computed' ? 'teal' : 'neutral'}>
                      {item.status === 'computed'
                        ? item.validationStatus === 'synthetic' ? t('common.synthetic') : t('common.computed')
                        : t('common.notComputed')}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="wb-empty-line">{t('common.noMeasurements')}</div>
            )}
          </Section>

          <Section title={t('cta.scan')} code="ACQUISITION" right={<ScanLine size={13} />}>
            <div className="scan-params">
              <div><span>{t('cta.scanMode')}</span><b>{isDemo ? 'ECG-gated CCTA' : (selectedSeriesMeta.description || 'CCTA')}</b></div>
              <div><span>{t('cta.kernel')}</span><b>{kernelLabel} · {thicknessLabel}</b></div>
              <div><span>{t('cta.kvp')}</span><b>{selectedSeriesMeta.kvp ? `${selectedSeriesMeta.kvp} kV` : '—'}</b></div>
              <div><span>{t('cta.contrast')}</span><b>{selectedSeriesMeta.contrastAgent || '—'}</b></div>
              <div><span>{t('cta.hr')}</span><b>{isDemo ? `${bpm} BPM` : '—'}</b></div>
              <div><span>{t('cta.matrix')}</span><b>{selectedSeriesMeta.sliceCount ?? '—'} · {matrixLabel}</b></div>
            </div>
          </Section>

          <div className="cta-disclaimer">
            <CircleAlert size={12} />
            {t('disclaimer.body')}
          </div>
        </aside>
      </div>
    </div>
  )
}
