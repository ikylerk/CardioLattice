import React from 'react'
import { Bell, ChevronDown, FileText, FolderOpen, Search, Share2 } from 'lucide-react'
import Brand from './Brand.jsx'
import { Badge, IconButton } from './ui.jsx'
import { useStudy } from '../study/StudyContext.jsx'

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

export default function TopBar({ onReport, onWorkbench }) {
  const { study, selectedSeries, isDemo, isApi } = useStudy()
  const current = study?.study
  const subject = current?.subject
  const series = selectedSeries || {}
  const pseudonym = subject?.pseudonym || '未选择检查'
  const avatar = pseudonym.slice(0, 1)
  const sexAge = [subject?.sex === 'M' ? '男' : subject?.sex === 'F' ? '女' : subject?.sex, subject?.ageYears ? `${subject.ageYears} 岁` : null]
    .filter(Boolean)
    .join(' · ')
  const statusBadge = (() => {
    if (!current) return { tone: 'neutral', label: '未选择检查' }
    if (current.status === 'processing' || current.status === 'queued') return { tone: 'amber', label: '处理中' }
    if (current.status === 'failed') return { tone: 'red', label: '流水线失败' }
    if (current.status === 'needs_series_selection') return { tone: 'amber', label: '待选择序列' }
    if (isDemo) return { tone: 'neutral', label: '演示数据' }
    return { tone: 'teal', label: '流水线完成' }
  })()

  return (
    <header className="topbar">
      <Brand />
      <div className="topbar-context">
        <button className="patient-chip" type="button" title="当前检查" onClick={onWorkbench}>
          <span className="patient-avatar">{avatar}</span>
          <span className="patient-copy">
            <strong>{pseudonym}</strong>
            <small>{sexAge || (isDemo ? '合成演示病例' : '匿名化研究受试者')}</small>
          </span>
          <ChevronDown size={13} />
        </button>
        <div className="topbar-divider" />
        <div className="study-meta">
          <span className="micro-label">STUDY / MODALITY</span>
          <strong>{current ? `${current.modality} · ${current.description || 'CCTA'}` : '—'}</strong>
          <small>{current?.studyDate || '—'} · {current?.source === 'demo' ? '合成数据' : current?.source || '—'}</small>
        </div>
        <div className="topbar-divider hide-md" />
        <div className="study-meta hide-md">
          <span className="micro-label">SERIES</span>
          <strong>{series.description || '—'}</strong>
          <small>
            {series.sliceThickness ? `${Number(series.sliceThickness).toFixed(2)} mm` : '—'} ·{' '}
            {series.kvp ? `${series.kvp} kV` : 'kV —'}
          </small>
        </div>
        <Badge tone={statusBadge.tone} dot>{statusBadge.label}</Badge>
      </div>
      <div className="topbar-actions">
        <IconButton label="检查工作台" onClick={onWorkbench}>
          <FolderOpen size={16} />
        </IconButton>
        <IconButton label="搜索病例">
          <Search size={16} />
        </IconButton>
        <IconButton label="共享研究" className="hide-sm">
          <Share2 size={16} />
        </IconButton>
        <Clock />
        <button className="btn btn-primary btn-sm top-report" onClick={onReport} type="button">
          <FileText size={14} />
          诊断报告
        </button>
        <IconButton label="通知">
          <Bell size={16} />
          <i className="notification-dot" />
        </IconButton>
        {isApi ? <span className="topbar-mode">API</span> : null}
      </div>
    </header>
  )
}
