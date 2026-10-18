import React from 'react'
import { Bell, ChevronDown, FileText, FolderOpen, Search, Share2 } from 'lucide-react'
import Brand from './Brand.jsx'
import { Badge, IconButton } from './ui.jsx'
import { useStudy } from '../study/StudyContext.jsx'
import { dicomLabel, dictionaries, useI18n } from '../i18n.js'

function Clock() {
  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="clock">
      <strong>
        {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
      </strong>
      <span>
        {now.getFullYear()}.{String(now.getMonth() + 1).padStart(2, '0')}.{String(now.getDate()).padStart(2, '0')}
      </span>
    </div>
  )
}

function LanguageToggle() {
  const { lang, setLang, t } = useI18n()
  return (
    <div className="lang-toggle" role="group" aria-label={t('lang.group')}>
      <button type="button" className={lang === 'en' ? 'active' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
        EN
      </button>
      <button type="button" className={lang === 'zh' ? 'active' : ''} aria-pressed={lang === 'zh'} onClick={() => setLang('zh')}>
        {dictionaries.zh.lang.zh}
      </button>
    </div>
  )
}

export default function TopBar({ onReport, onWorkbench }) {
  const { study, selectedSeries, isDemo, isApi } = useStudy()
  const { t } = useI18n()
  const current = study?.study
  const subject = current?.subject
  const series = selectedSeries || {}
  const pseudonym = subject?.pseudonym || t('topbar.noStudy')
  const avatar = pseudonym.slice(0, 1)
  const sex = subject?.sex === 'M' ? t('sex.m') : subject?.sex === 'F' ? t('sex.f') : subject?.sex
  const age = subject?.ageYears ? t('sex.age', { age: subject.ageYears }) : null
  const sexAge = [sex, age].filter(Boolean).join(' · ')
  const statusBadge = (() => {
    if (!current) return { tone: 'neutral', label: t('topbar.noStudy') }
    if (current.status === 'processing' || current.status === 'queued') return { tone: 'amber', label: t('topbar.statusProcessing') }
    if (current.status === 'failed') return { tone: 'red', label: t('topbar.statusFailed') }
    if (current.status === 'needs_series_selection') return { tone: 'amber', label: t('topbar.statusNeedsSeries') }
    if (isDemo) return { tone: 'neutral', label: t('topbar.statusDemo') }
    return { tone: 'teal', label: t('topbar.statusReady') }
  })()

  return (
    <header className="topbar">
      <Brand />
      <div className="topbar-context">
        <button className="patient-chip" type="button" title={t('topbar.currentStudy')} onClick={onWorkbench}>
          <span className="patient-avatar">{avatar}</span>
          <span className="patient-copy">
            <strong>{pseudonym}</strong>
            <small>{sexAge || (isDemo ? t('topbar.demoCase') : t('topbar.anonSubject'))}</small>
          </span>
          <ChevronDown size={13} />
        </button>
        <div className="topbar-divider" />
        <div className="study-meta">
          <span className="micro-label">STUDY / MODALITY</span>
          <strong>{current ? `${current.modality} · ${current.description ? (isApi ? dicomLabel(current.description) : current.description) : 'CCTA'}` : '—'}</strong>
          <small>{current?.studyDate || '—'} · {current?.source === 'demo' ? t('topbar.synthetic') : current?.source || '—'}</small>
        </div>
        <div className="topbar-divider hide-md" />
        <div className="study-meta hide-md">
          <span className="micro-label">SERIES</span>
          <strong>{series.description ? (isApi ? dicomLabel(series.description) : series.description) : '—'}</strong>
          <small>
            {series.sliceThickness ? `${Number(series.sliceThickness).toFixed(2)} mm` : '—'} ·{' '}
            {series.kvp ? `${series.kvp} kV` : 'kV —'}
          </small>
        </div>
        <Badge tone={statusBadge.tone} dot>{statusBadge.label}</Badge>
      </div>
      <div className="topbar-actions">
        <IconButton label={t('topbar.workbench')} onClick={onWorkbench}>
          <FolderOpen size={16} />
        </IconButton>
        <IconButton label={t('topbar.search')}>
          <Search size={16} />
        </IconButton>
        <IconButton label={t('topbar.share')} className="hide-sm">
          <Share2 size={16} />
        </IconButton>
        <Clock />
        <button className="btn btn-primary btn-sm top-report" onClick={onReport} type="button">
          <FileText size={14} />
          {t('topbar.report')}
        </button>
        <IconButton label={t('topbar.notify')}>
          <Bell size={16} />
          <i className="notification-dot" />
        </IconButton>
        <LanguageToggle />
        {isApi ? <span className="topbar-mode">API</span> : null}
      </div>
    </header>
  )
}
