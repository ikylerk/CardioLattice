import React from 'react'
import { Activity, Box, CircleHelp, FileText, FolderOpen, Layers, Orbit, ScanLine, Settings2, Waves } from 'lucide-react'
import { useI18n } from '../i18n.js'

export const MODULES = [
  { id: 'workbench', labelKey: 'nav.workbench', en: 'WORKBENCH', icon: FolderOpen, key: '0' },
  { id: 'anatomy', labelKey: 'nav.anatomy', en: 'ANATOMY', icon: Orbit, key: '01' },
  { id: 'angio', labelKey: 'nav.angio', en: 'ANGIO', icon: ScanLine, key: '02' },
  { id: 'cta', labelKey: 'nav.cta', en: 'CCTA', icon: Layers, key: '03' },
  { id: 'echo', labelKey: 'nav.echo', en: 'ECHO', icon: Waves, key: '04' },
  { id: 'analysis', labelKey: 'nav.analysis', en: 'ANALYSIS', icon: Activity, key: '05' },
  { id: 'organs', labelKey: 'nav.organs', en: 'ORGAN ATLAS', icon: Box, key: '6' },
]

export default function SideRail({ active, onChange, onReport }) {
  const { t } = useI18n()
  return (
    <nav className="side-rail" aria-label={t('nav.aria')}>
      <div className="rail-index">CV<br />SUITE</div>
      <div className="rail-items">
        {MODULES.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              className={`rail-item ${active === item.id ? 'active' : ''}`}
              onClick={() => onChange(item.id)}
              aria-current={active === item.id ? 'page' : undefined}
            >
              <span className="rail-icon">
                <Icon size={20} strokeWidth={1.65} />
              </span>
              <span>{t(item.labelKey)}</span>
              <em>{item.en}</em>
              <kbd>{item.key}</kbd>
            </button>
          )
        })}
      </div>
      <div className="rail-bottom">
        <button className="rail-mini" type="button" onClick={onReport} title={t('nav.reportTitle')}>
          <FileText size={17} />
          <span>{t('nav.report')}</span>
        </button>
        <button className="rail-mini" type="button" title={t('nav.settings')}>
          <Settings2 size={17} />
          <span>{t('nav.settings')}</span>
        </button>
        <button className="rail-mini" type="button" title={t('nav.help')}>
          <CircleHelp size={17} />
        </button>
        <div className="rail-version">v2.0</div>
      </div>
    </nav>
  )
}
