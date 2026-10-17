import React from 'react'

export default function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'compact' : ''}`}>
      <div className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="18" stroke="currentColor" strokeOpacity=".28" />
          <circle cx="20" cy="20" r="12.5" stroke="currentColor" strokeOpacity=".12" strokeDasharray="2 3" />
          <path
            d="M7.8 20.6h5.3l2.5-6.2 4.1 12.7 4.6-17.1 4.1 14.2 2.2-3.6h4.2"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M31.2 7.2h3.2M32.8 5.6v3.2" stroke="#f1b56d" strokeWidth="1.2" opacity=".9" />
        </svg>
      </div>
      <div className="brand-copy">
        <div className="brand-name">
          CARDIO<span>SCOPE</span>
          <sup>PRO</sup>
        </div>
        <div className="brand-sub">CARDIOVASCULAR IMAGING SUITE</div>
      </div>
    </div>
  )
}
