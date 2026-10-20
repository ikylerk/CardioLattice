import { t, useI18n, serverText } from '../i18n.js'
import { tImaging } from '../i18n-imaging.js'
import React from 'react'
import { renderMPR } from '../three/volume.js'
import {
  getMprGeometry,
  getMprLesionMarker,
  getMprSliceIndex,
  mprScreenToSlices,
  mprVoxelToScreen,
} from '../three/mprGeometry.js'

const planeMeta = () => ({
  axial: { title: t('mpr.axial'), en: 'AXIAL', tone: 'amber' },
  coronal: { title: t('mpr.coronal'), en: 'CORONAL', tone: 'teal' },
  sagittal: { title: t('mpr.sagittal'), en: 'SAGITTAL', tone: 'blue' },
})

export default function MprViewport({
  volume,
  plane,
  slices,
  setSlices,
  windowWidth,
  windowLevel,
  lesionVoxel,
  lesionLabel = '',
  renderTag = 'CCTA',
}) {
  useI18n()
  const canvasRef = React.useRef(null)
  const stageRef = React.useRef(null)
  const dragging = React.useRef(false)
  const meta = planeMeta()[plane]
  const geometry = React.useMemo(() => getMprGeometry(volume, plane), [volume, plane])
  const { total, aspect, labels } = geometry
  const sliceIndex = getMprSliceIndex(geometry, slices)
  const title = geometry.oblique ? tImaging('mpr.obliqueTitle', { v0: meta.title }) : geometry.orientation === 'unknown' ? tImaging('mpr.native') : meta.title
  const orientationNote = geometry.oblique
    ? tImaging('mpr.obliqueNote')
    : geometry.orientation === 'unknown' ? tImaging('mpr.unknownNote')
      : geometry.orientation === 'legacy' ? tImaging('mpr.legacyNote')
        : tImaging('mpr.radiologyNote')

  React.useEffect(() => {
    if (canvasRef.current && volume) {
      renderMPR(canvasRef.current, volume, plane, slices, windowWidth, windowLevel)
    }
  }, [volume, plane, slices, windowWidth, windowLevel])

  const crosshair = mprVoxelToScreen(geometry, slices)
  const lesionMarker = getMprLesionMarker(geometry, slices, lesionVoxel)

  const updateSlices = (event) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return
    const fx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const fy = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    setSlices((prev) => mprScreenToSlices(geometry, fx, fy, prev))
  }

  return (
    <div className="cta-panel mpr-panel">
      <header className="cta-panel-head">
        <div className="cta-panel-title">
          <i className={`plane-dot ${meta.tone}`} />
          <span title={orientationNote}>{title}</span>
          <em>{geometry.oblique ? `OBLIQUE ${meta.en}` : geometry.orientation === 'unknown' ? 'NATIVE' : meta.en}</em>
        </div>
        <span className="cta-slice-count">{String(sliceIndex + 1).padStart(3, '0')} / {String(total).padStart(3, '0')}</span>
      </header>
      <div className="mpr-body">
        <div
          ref={stageRef}
          className="mpr-stage"
          style={{ aspectRatio: `${aspect}` }}
          title={orientationNote}
          onPointerDown={(event) => {
            dragging.current = true
            event.currentTarget.setPointerCapture?.(event.pointerId)
            updateSlices(event)
          }}
          onPointerMove={(event) => {
            if (dragging.current) updateSlices(event)
          }}
          onPointerUp={() => {
            dragging.current = false
          }}
          onPointerCancel={() => {
            dragging.current = false
          }}
        >
          <canvas ref={canvasRef} className="mpr-canvas" aria-label={tImaging('mpr.aria', { v0: title, v1: orientationNote })} />
          <div className="mpr-crosshair-v" style={{ left: `${crosshair.left}%` }} />
          <div className="mpr-crosshair-h" style={{ top: `${crosshair.top}%` }} />
          <span className="mpr-orientation top">{labels.top}</span>
          <span className="mpr-orientation bottom">{labels.bottom}</span>
          <span className="mpr-orientation left">{labels.left}</span>
          <span className="mpr-orientation right">{labels.right}</span>
          {lesionMarker ? (
            <div className="mpr-lesion" style={{ left: `${lesionMarker.left}%`, top: `${lesionMarker.top}%` }}>
              <span />
              <b>{serverText(lesionLabel) || t('common.marker')}</b>
            </div>
          ) : null}
          <div className="mpr-render-tag">
            {renderTag}{geometry.oblique ? tImaging('mpr.obliqueTag') : geometry.orientation === 'unknown' ? tImaging('mpr.unknownTag') : ''}
          </div>
        </div>
      </div>
      <footer className="cta-panel-foot">
        <span>WW {windowWidth} · WL {windowLevel}</span>
        <span>{geometry.sliceKey.toUpperCase()} {sliceIndex + 1}</span>
      </footer>
    </div>
  )
}
