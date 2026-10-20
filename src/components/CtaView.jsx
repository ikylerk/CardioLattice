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
import { getCardiacVolume, VOLUME_DIMS } from '../three/volume.js'
import { getMprGeometry, getMprSliceIndex } from '../three/mprGeometry.js'
import { getVolumeData } from '../api/client.js'
import { useStudy } from '../study/StudyContext.jsx'

const WINDOW_PRESETS = {
  cta: { label: '冠脉 CTA', sub: 'CCTA', width: 800, level: 300 },
  mediastinum: { label: '纵隔', sub: 'MEDIASTINUM', width: 400, level: 40 },
  lung: { label: '肺窗', sub: 'LUNG', width: 1500, level: -600 },
  bone: { label: '骨窗', sub: 'BONE', width: 2000, level: 400 },
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
        if (!cancelled) setError(`体数据加载失败：${err.message || err}`)
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
      setError('当前环境无法初始化 3D 容积渲染。')
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
    notify('多平面定位与 3D 视角已重置')
  }

  const captureVolume = () => {
    const url = volumeEngineRef.current?.capture()
    if (url) {
      downloadDataUrl(url, 'CardioScope_CCTA_3D_VRT.png')
      notify('3D 容积渲染已导出为 PNG')
    }
  }

  return (
    <div className="module-view cta-view">
      <ViewHeader
        index="03"
        eyebrow="CARDIAC CT"
        title="CT 影像"
        titleSuffix="MULTI-PLANAR · VRT"
        description={`${isDemo ? '演示体数据' : '服务端重建体数据'} · ${thicknessLabel} · 同步多平面重建与容积渲染`}
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
              {volume ? '体数据就绪' : isProcessing ? '重建中' : '无体数据'}
            </Badge>
            <Button variant="outline" size="sm" icon={<RotateCcw size={14} />} onClick={resetSlices}>
              重置定位
            </Button>
            <Button variant="outline" size="sm" icon={<Camera size={14} />} onClick={captureVolume}>
              导出 VRT
            </Button>
          </>
        }
      />

      <div className="module-body">
        <div className="viewer cta-viewer">
          {error ? <div className="webgl-error">{error}</div> : null}
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
                  <span>三维容积</span>
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
                  <span><i className="legend-bone" />骨 / 钙化</span>
                  <span><i className="legend-contrast" />对比剂血池</span>
                  <span><i className="legend-muscle" />心肌</span>
                </div>
                <div className="volume-tip">
                  <Rotate3d size={11} /> 拖动旋转 · 滚轮缩放
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
                  ? `LAD ${measurementValue('STENOSIS_LAD', 0)} 狭窄`
                  : '狭窄分析未计算'}
              </span>
              <b>{measurementValue('FFR_CT', 2) || 'FFR-CT 未计算'}</b>
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
              <Crosshair size={11} /> 拖动图像联动 MPR 十字线
            </div>
          </div>

          {!volume && !error ? (
            <div className="cta-loading">
              <div className="cta-scan-anim">
                <span />
              </div>
              {isApi && !studyInfo ? (
                <>
                  <b>尚未选择检查</b>
                  <small>请先在「检查工作台」上传 DICOM 或选择已有检查</small>
                </>
              ) : isProcessing ? (
                <>
                  <b>正在处理检查</b>
                  <small>{latestJob?.stage || 'queued'} · {latestJob?.progress ?? 0}%</small>
                </>
              ) : volumeLoading ? (
                <>
                  <b>正在载入体数据</b>
                  <small>服务端重建结果加载中</small>
                </>
              ) : (
                <>
                  <b>该检查尚无体数据</b>
                  <small>请确认流水线已完成，或到检查工作台查看错误信息</small>
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
                <h2>冠状动脉 CTA</h2>
                <small>Coronary computed tomography angiography</small>
              </div>
            </div>
            <p>
              {isDemo
                ? '0.5 mm 演示重建，心率 72 BPM，LAD 中段可见模拟钙化斑块与管腔狭窄。所有数值均为合成数据，仅用于界面演示。'
                : '体数据由服务端从上传的 DICOM 重建。这里只展示已计算且带来源的测量；未接入验证模型的项目显示为未计算，不使用演示数值。'}
            </p>
            <div className="selection-stats">
              <Stat
                label="钙化积分"
                value={measurementItem('CALCIUM_SCORE')?.value ?? '—'}
                accent="amber"
                hint={measurementItem('CALCIUM_SCORE')?.status === 'computed' ? 'Agatston' : '未计算'}
              />
              <Stat
                label="狭窄"
                value={measurementItem('STENOSIS_LAD')?.value ?? '—'}
                unit={measurementItem('STENOSIS_LAD')?.unit || '%'}
                accent="amber"
                hint={measurementItem('STENOSIS_LAD')?.status === 'computed' ? 'LAD' : '未计算'}
              />
              <Stat
                label="FFR-CT"
                value={measurementItem('FFR_CT')?.value ?? '—'}
                hint={measurementItem('FFR_CT')?.status === 'computed' ? '血流动力学' : '未计算'}
              />
            </div>
            {study?.measurements?.some((item) => item.validationStatus === 'synthetic') ? (
              <div className="provenance-note">
                <CircleAlert size={11} /> 含合成 / 研究测量，不可用于临床决策
              </div>
            ) : null}
          </div>

          <Section title="窗宽窗位" code="WINDOW / LEVEL" right={<Eye size={13} />}>
            <div className="cta-window-presets">
              {Object.entries(WINDOW_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  className={activePreset === key ? 'active' : ''}
                  onClick={() => pickPreset(key)}
                >
                  <span>{preset.label}</span>
                  <small>{preset.width} / {preset.level}</small>
                </button>
              ))}
            </div>
            <div className="cta-window-sliders">
              <Slider label="窗宽 WW" value={windowWidth} min={100} max={2400} step={10} onChange={adjustWindow(setWindowWidth)} />
              <Slider label="窗位 WL" value={windowLevel} min={-800} max={800} step={5} onChange={adjustWindow(setWindowLevel)} />
            </div>
            <div className="cta-window-readout">
              <span>RANGE</span>
              <b>{windowLevel - windowWidth / 2} → {windowLevel + windowWidth / 2} HU</b>
            </div>
          </Section>

          <Section title="多平面定位" code="MPR LOCALIZER" right={<Crosshair size={13} />}>
            <div className="cta-slice-sliders">
              {[
                { plane: 'axial', label: '轴位 AXIAL' },
                { plane: 'coronal', label: '冠状 CORONAL' },
                { plane: 'sagittal', label: '矢状 SAGITTAL' },
              ].map(({ plane, label }) => {
                const geometry = getMprGeometry(volume || { dims: VOLUME_DIMS }, plane)
                const { sliceKey, total, oblique, orientation } = geometry
                const title = orientation === 'unknown' ? '原生切面 NATIVE' : `${oblique ? '斜' : ''}${label}`
                return (
                  <Slider
                    key={plane}
                    label={`${title} · ${sliceKey.toUpperCase()}`}
                    value={getMprSliceIndex(geometry, slices)}
                    min={0}
                    max={total - 1}
                    onChange={(value) => setSlices((current) => ({ ...current, [sliceKey]: value }))}
                    format={(value) => `${String(value + 1).padStart(3, '0')} / ${total}`}
                  />
                )
              })}
            </div>
            <div className="cta-slice-note">
              <span className="cta-lesion-pin" />
              {marker ? `十字线默认位于 ${marker.label}` : '十字线默认位于体数据中心'}
            </div>
          </Section>

          <Section title="容积渲染" code="3D VRT" right={<Sparkles size={13} />}>
            <Slider
              label="透明度 OPACITY"
              value={volumeOpacity}
              min={0.25}
              max={1.5}
              step={0.05}
              onChange={setVolumeOpacity}
              format={(value) => `${Math.round(value * 100)}%`}
            />
            <div className="cta-vrt-toggles">
              <Toggle label="自动旋转" hint="展示模式" checked={autoRotate} onChange={setAutoRotate} />
              <Toggle label="MIP 投影" hint="最大密度投影" checked={mip} onChange={setMip} />
            </div>
          </Section>

          <Section title="量化发现" code="MEASUREMENTS" right={<Activity size={13} />}>
            {isDemo ? (
              <div className="cta-finding-list">
                <div className="cta-finding-row critical">
                  <span className="finding-index">01</span>
                  <div>
                    <b>LAD 中段重度狭窄</b>
                    <small>混合斑块 · 18 mm · 70% DS · 合成</small>
                  </div>
                  <Badge tone="red">演示</Badge>
                </div>
                <div className="cta-finding-row mild">
                  <span className="finding-index">02</span>
                  <div>
                    <b>RCA 近段钙化斑块</b>
                    <small>非阻塞性 · 30% DS · 合成</small>
                  </div>
                  <Badge tone="teal">演示</Badge>
                </div>
                <div className="cta-finding-row">
                  <span className="finding-index">03</span>
                  <div>
                    <b>左心室心肌质量</b>
                    <small>112 g · 演示数值</small>
                  </div>
                  <Badge>演示</Badge>
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
                          : item.reason || '未计算'}
                      </small>
                    </div>
                    <Badge tone={item.status === 'computed' ? 'teal' : 'neutral'}>
                      {item.status === 'computed'
                        ? item.validationStatus === 'synthetic' ? '合成' : '已计算'
                        : '未计算'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="wb-empty-line">尚无测量结果</div>
            )}
          </Section>

          <Section title="扫描参数" code="ACQUISITION" right={<ScanLine size={13} />}>
            <div className="scan-params">
              <div><span>扫描模式</span><b>{isDemo ? 'ECG-gated CCTA' : (selectedSeriesMeta.description || 'CCTA')}</b></div>
              <div><span>重建算法</span><b>{kernelLabel} · {thicknessLabel}</b></div>
              <div><span>管电压</span><b>{selectedSeriesMeta.kvp ? `${selectedSeriesMeta.kvp} kV` : '—'}</b></div>
              <div><span>对比剂</span><b>{selectedSeriesMeta.contrastAgent || '—'}</b></div>
              <div><span>心率</span><b>{isDemo ? `${bpm} BPM` : '—'}</b></div>
              <div><span>层数 / 矩阵</span><b>{selectedSeriesMeta.sliceCount ?? '—'} · {matrixLabel}</b></div>
            </div>
          </Section>

          <div className="cta-disclaimer">
            <CircleAlert size={12} />
            {isDemo
              ? '程序化合成体数据与模拟测量，仅用于产品演示与教学，不用于临床诊断。'
              : '研究原型。分割与测量结果需医生复核；未计算项不显示数值。不用于临床诊断或治疗决策。'}
          </div>
        </aside>
      </div>
    </div>
  )
}
