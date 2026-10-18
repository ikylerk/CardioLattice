import React from 'react'
import { useI18n } from '../i18n.js'

export default function CarmDiagram({ rot, tilt }) {
  const { t } = useI18n()
  const rotation = rot * 0.14 + tilt * 0.08
  const tiltOffset = tilt * 0.18
  return (
    <svg className="carm-diagram" viewBox="0 0 292 172" role="img" aria-label={t('angio.carm')}>
      <defs>
        <linearGradient id="carmMetal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#66717b" />
          <stop offset="0.45" stopColor="#aab6bd" />
          <stop offset="1" stopColor="#4b555e" />
        </linearGradient>
        <linearGradient id="sourceGlow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0bc74" />
          <stop offset="1" stopColor="#9b6b35" />
        </linearGradient>
        <radialGradient id="beamGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="rgba(238, 181, 106, .22)" />
          <stop offset="1" stopColor="rgba(238, 181, 106, 0)" />
        </radialGradient>
      </defs>
      <rect width="292" height="172" fill="transparent" />
      <g className="carm-floor">
        {[36, 60, 84, 108, 132].map((y) => (
          <line key={y} x1="20" y1={y + 25} x2="272" y2={y + 25} />
        ))}
        {[50, 96, 142, 188, 234].map((x) => (
          <line key={x} x1={x} y1="60" x2={x - 26} y2="170" />
        ))}
      </g>

      <ellipse cx="145" cy="88" rx="80" ry="45" fill="url(#beamGlow)" />
      <g transform={`rotate(${rotation} 145 86) translate(0 ${tiltOffset * 0.2})`}>
        <path
          d="M 66 41 A 86 86 0 1 0 224 41"
          fill="none"
          stroke="url(#carmMetal)"
          strokeWidth="11"
          strokeLinecap="round"
          className="carm-arm"
        />
        <path
          d="M 66 41 A 86 86 0 1 0 224 41"
          fill="none"
          stroke="rgba(215, 235, 236, .18)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <g transform="translate(61 36) rotate(-24)">
          <rect x="-15" y="-10" width="31" height="22" rx="4" className="carm-source-box" />
          <rect x="-9" y="-5" width="19" height="12" rx="2" fill="url(#sourceGlow)" opacity=".8" />
          <text x="0" y="28" textAnchor="middle" className="carm-label">X-RAY</text>
        </g>
        <g transform="translate(229 36) rotate(24)">
          <rect x="-22" y="-13" width="44" height="27" rx="3" className="carm-detector" />
          <rect x="-17" y="-8" width="34" height="17" rx="1.5" className="carm-detector-screen" />
          <text x="0" y="31" textAnchor="middle" className="carm-label">DETECTOR</text>
        </g>
        <line x1="66" y1="41" x2="224" y2="41" stroke="rgba(238, 188, 120, .35)" strokeDasharray="3 5" />
      </g>

      <g className="carm-patient">
        <ellipse cx="145" cy="83" rx="30" ry="38" fill="rgba(89, 77, 76, .25)" stroke="rgba(168, 134, 126, .3)" />
        <path d="M131 79c8-12 22-11 27 1 4 11-2 20-10 24-8 3-17-3-19-12-1-5 0-9 2-13z" fill="rgba(159, 67, 69, .42)" stroke="rgba(214, 128, 119, .55)" />
        <path d="M146 59v-12M139 53h14" stroke="rgba(214, 190, 164, .5)" strokeWidth="1" />
      </g>

      <g transform="translate(16 148)">
        <circle cx="4" cy="4" r="2.4" fill="#efb36b" />
        <text x="12" y="7" className="carm-foot-label">SOURCE</text>
        <circle cx="87" cy="4" r="2.4" fill="#7196a1" />
        <text x="95" y="7" className="carm-foot-label">DETECTOR</text>
        <text x="166" y="7" className="carm-angle-label">
          {rot >= 0 ? 'LAO' : 'RAO'} {Math.abs(rot)}° · {tilt >= 0 ? 'CRA' : 'CAU'} {Math.abs(tilt)}°
        </text>
      </g>
    </svg>
  )
}
