import React from 'react'
import { useI18n } from '../i18n.js'

export default function AngleMap({ rot, tilt, presets = [], onPick }) {
  const { t } = useI18n()
  const width = 260
  const height = 138
  const padX = 30
  const padY = 18
  const xOf = (value) => padX + ((value + 90) / 180) * (width - padX * 2)
  const yOf = (value) => height - padY - ((value + 45) / 90) * (height - padY * 2)
  const x = xOf(rot)
  const y = yOf(tilt)

  return (
    <svg className="angle-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('angio.angleMap')}>
      <defs>
        <linearGradient id="angleMapBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0a121a" />
          <stop offset="1" stopColor="#070d13" />
        </linearGradient>
        <radialGradient id="angleGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="rgba(239, 179, 107, .35)" />
          <stop offset="1" stopColor="rgba(239, 179, 107, 0)" />
        </radialGradient>
      </defs>
      <rect width={width} height={height} fill="url(#angleMapBg)" rx="4" />
      {[-60, -30, 0, 30, 60].map((value) => (
        <line
          key={`vx-${value}`}
          x1={xOf(value)}
          y1={padY}
          x2={xOf(value)}
          y2={height - padY}
          className={value === 0 ? 'map-axis' : 'map-grid'}
        />
      ))}
      {[-30, 0, 30].map((value) => (
        <line
          key={`hy-${value}`}
          x1={padX}
          y1={yOf(value)}
          x2={width - padX}
          y2={yOf(value)}
          className={value === 0 ? 'map-axis' : 'map-grid'}
        />
      ))}
      <rect x={padX} y={padY} width={(width - padX * 2)} height={(height - padY * 2)} fill="none" className="map-border" />
      <text x={8} y={padY + 8} className="map-side-label">CRA</text>
      <text x={8} y={height - padY - 1} className="map-side-label">CAU</text>
      <text x={padX + 2} y={height - 4} className="map-side-label">RAO</text>
      <text x={width - padX - 2} y={height - 4} textAnchor="end" className="map-side-label">LAO</text>

      {presets.map((preset) => (
        <g key={preset.label} className="map-preset" onClick={() => onPick?.(preset)}>
          <circle cx={xOf(preset.rot)} cy={yOf(preset.tilt)} r="3.2" />
          <title>{`${preset.label} · ${preset.rot}° / ${preset.tilt}°`}</title>
        </g>
      ))}

      <circle cx={x} cy={y} r="22" fill="url(#angleGlow)" />
      <line x1={x} y1={padY} x2={x} y2={height - padY} className="map-crosshair" />
      <line x1={padX} y1={y} x2={width - padX} y2={y} className="map-crosshair" />
      <circle cx={x} cy={y} r="5.2" className="map-current-ring" />
      <circle cx={x} cy={y} r="2" className="map-current-dot" />
      <g transform={`translate(${Math.min(width - 78, Math.max(4, x + 8))}, ${Math.max(13, y - 17)})`}>
        <rect width="70" height="15" rx="2" className="map-tag-bg" />
        <text x="35" y="10.5" textAnchor="middle" className="map-tag">
          {rot >= 0 ? 'LAO' : 'RAO'} {Math.abs(rot)}° / {tilt >= 0 ? 'CRA' : 'CAU'} {Math.abs(tilt)}°
        </text>
      </g>
    </svg>
  )
}
