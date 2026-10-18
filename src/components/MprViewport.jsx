import React from 'react'
import { renderMPR } from '../three/volume.js'
import { useI18n } from '../i18n.js'

const PLANE_META = {
  axial: { titleKey: 'mpr.axial', en: 'AXIAL', tone: 'amber', top: 'A', bottom: 'P', left: 'R', right: 'L' },
  coronal: { titleKey: 'mpr.coronal', en: 'CORONAL', tone: 'teal', top: 'H', bottom: 'F', left: 'R', right: 'L' },
  sagittal: { titleKey: 'mpr.sagittal', en: 'SAGITTAL', tone: 'blue', top: 'H', bottom: 'F', left: 'P', right: 'A' },
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
  const { t } = useI18n()
  const meta = PLANE_META[plane]
  const title = t(meta.titleKey)
  const [nx, ny, nz] = volume.dims
  const [sx = 1, sy = 1, sz = 1] = volume.spacing || [1, 1, 1]
  const sliceIndex = plane === 'axial' ? slices.z : plane === 'coronal' ? slices.y : slices.x
  const total = plane === 'axial' ? nz : plane === 'coronal' ? ny : nx
  const aspect = plane === 'axial'
    ? (nx * sx) / (ny * sy)
    : plane === 'coronal'
      ? (nx * sx) / (nz * sz)
      : (ny * sy) / (nz * sz)

  React.useEffect(() => {
    if (canvasRef.current && volume) {
      renderMPR(canvasRef.current, volume, plane, slices, windowWidth, windowLevel)
    }
  }, [volume, plane, slices, windowWidth, windowLevel])

  const crosshair = React.useMemo(() => {
    if (plane === 'axial') {
      return {
        left: (slices.x / (nx - 1)) * 100,
        top: (1 - slices.y / (ny - 1)) * 100,
      }
    }
    if (plane === 'coronal') {
      return {
        left: (slices.x / (nx - 1)) * 100,
        top: (1 - slices.z / (nz - 1)) * 100,
      }
    }
    return {
      left: (slices.y / (ny - 1)) * 100,
      top: (1 - slices.z / (nz - 1)) * 100,
    }
  }, [plane, slices, nx, ny, nz])

  const lesionMarker = React.useMemo(() => {
    if (!lesionVoxel) return null
    if (plane === 'axial' && Math.abs(slices.z - lesionVoxel.z) > 4) return null
    if (plane === 'coronal' && Math.abs(slices.y - lesionVoxel.y) > 4) return null
    if (plane === 'sagittal' && Math.abs(slices.x - lesionVoxel.x) > 4) return null
    if (plane === 'axial') {
      return {
        left: (lesionVoxel.x / (nx - 1)) * 100,
        top: (1 - lesionVoxel.y / (ny - 1)) * 100,
      }
    }
    if (plane === 'coronal') {
      return {
        left: (lesionVoxel.x / (nx - 1)) * 100,
        top: (1 - lesionVoxel.z / (nz - 1)) * 100,
      }
    }
    return {
      left: (lesionVoxel.y / (ny - 1)) * 100,
      top: (1 - lesionVoxel.z / (nz - 1)) * 100,
    }
  }, [lesionVoxel, plane, slices, nx, ny, nz])

  const updateSlices = (event) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return
    const fx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const fy = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    setSlices((prev) => {
      if (plane === 'axial') {
        return {
          ...prev,
          x: Math.round(fx * (nx - 1)),
          y: Math.round((1 - fy) * (ny - 1)),
        }
      }
      if (plane === 'coronal') {
        return {
          ...prev,
          x: Math.round(fx * (nx - 1)),
          z: Math.round((1 - fy) * (nz - 1)),
        }
      }
      return {
        ...prev,
        y: Math.round(fx * (ny - 1)),
        z: Math.round((1 - fy) * (nz - 1)),
      }
    })
  }

  return (
    <div className="cta-panel mpr-panel">
      <header className="cta-panel-head">
        <div className="cta-panel-title">
          <i className={`plane-dot ${meta.tone}`} />
          <span>{title}</span>
          <em>{meta.en}</em>
        </div>
        <span className="cta-slice-count">{String(sliceIndex + 1).padStart(3, '0')} / {String(total).padStart(3, '0')}</span>
      </header>
      <div className="mpr-body">
        <div
          ref={stageRef}
          className="mpr-stage"
          style={{ aspectRatio: `${aspect}` }}
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
          <canvas ref={canvasRef} className="mpr-canvas" aria-label={t('mpr.aria', { plane: title })} />
          <div className="mpr-crosshair-v" style={{ left: `${crosshair.left}%` }} />
          <div className="mpr-crosshair-h" style={{ top: `${crosshair.top}%` }} />
          <span className="mpr-orientation top">{meta.top}</span>
          <span className="mpr-orientation bottom">{meta.bottom}</span>
          <span className="mpr-orientation left">{meta.left}</span>
          <span className="mpr-orientation right">{meta.right}</span>
          {lesionMarker ? (
            <div className="mpr-lesion" style={{ left: `${lesionMarker.left}%`, top: `${lesionMarker.top}%` }}>
              <span />
              <b>{lesionLabel || t('common.marker')}</b>
            </div>
          ) : null}
          <div className="mpr-render-tag">{renderTag}</div>
        </div>
      </div>
      <footer className="cta-panel-foot">
        <span>WW {windowWidth} · WL {windowLevel}</span>
        <span>{plane === 'axial' ? 'Z' : plane === 'coronal' ? 'Y' : 'X'} {sliceIndex + 1}</span>
      </footer>
    </div>
  )
}
