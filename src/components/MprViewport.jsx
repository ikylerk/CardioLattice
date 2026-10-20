import React from 'react'
import { renderMPR } from '../three/volume.js'
import {
  getMprGeometry,
  getMprLesionMarker,
  getMprSliceIndex,
  mprScreenToSlices,
  mprVoxelToScreen,
} from '../three/mprGeometry.js'

const PLANE_META = {
  axial: { title: '轴位', en: 'AXIAL', tone: 'amber' },
  coronal: { title: '冠状位', en: 'CORONAL', tone: 'teal' },
  sagittal: { title: '矢状位', en: 'SAGITTAL', tone: 'blue' },
}

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
  const canvasRef = React.useRef(null)
  const stageRef = React.useRef(null)
  const dragging = React.useRef(false)
  const meta = PLANE_META[plane]
  const geometry = React.useMemo(() => getMprGeometry(volume, plane), [volume, plane])
  const { total, aspect, labels } = geometry
  const sliceIndex = getMprSliceIndex(geometry, slices)
  const title = geometry.oblique ? `斜${meta.title}` : geometry.orientation === 'unknown' ? '原生切面' : meta.title
  const orientationNote = geometry.oblique
    ? '原生斜切面，未重采样为患者正交面；边缘复合字母按 LPS 方向分量从大到小排列'
    : geometry.orientation === 'unknown' ? '方向元数据缺失或无效，患者方向未知'
      : geometry.orientation === 'legacy' ? '演示索引方向'
        : '放射学方向：R 右、L 左、A 前、P 后、S 上、I 下'

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
          <canvas ref={canvasRef} className="mpr-canvas" aria-label={`${title} CT 重建；${orientationNote}`} />
          <div className="mpr-crosshair-v" style={{ left: `${crosshair.left}%` }} />
          <div className="mpr-crosshair-h" style={{ top: `${crosshair.top}%` }} />
          <span className="mpr-orientation top">{labels.top}</span>
          <span className="mpr-orientation bottom">{labels.bottom}</span>
          <span className="mpr-orientation left">{labels.left}</span>
          <span className="mpr-orientation right">{labels.right}</span>
          {lesionMarker ? (
            <div className="mpr-lesion" style={{ left: `${lesionMarker.left}%`, top: `${lesionMarker.top}%` }}>
              <span />
              <b>{lesionLabel || '标记'}</b>
            </div>
          ) : null}
          <div className="mpr-render-tag">
            {renderTag}{geometry.oblique ? ' · 原生斜切' : geometry.orientation === 'unknown' ? ' · 方向未知' : ''}
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
