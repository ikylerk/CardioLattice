import React from 'react'
import { Activity, Box, CircleHelp, FileText, FolderOpen, GitCompare, Layers, Orbit, ScanLine, Settings2, Waves } from 'lucide-react'

export const MODULES = [
  { id: 'workbench', label: '检查工作台', en: 'WORKBENCH', icon: FolderOpen, key: '0' },
  { id: 'anatomy', label: '三维解剖', en: 'ANATOMY', icon: Orbit, key: '01' },
  { id: 'angio', label: '冠脉造影', en: 'ANGIO', icon: ScanLine, key: '02' },
  { id: 'cta', label: 'CT 影像', en: 'CCTA', icon: Layers, key: '03' },
  { id: 'echo', label: '心脏超声', en: 'ECHO', icon: Waves, key: '04' },
  { id: 'analysis', label: '定量分析', en: 'ANALYSIS', icon: Activity, key: '05' },
  { id: 'organs', label: '器官模型库', en: 'ORGAN ATLAS', icon: Box, key: '6' },
  { id: 'comparison', label: '纵向对比', en: 'LONGITUDINAL', icon: GitCompare, key: '7' },
]

export default function SideRail({ active, onChange, onReport }) {
  return (
    <nav className="side-rail" aria-label="影像模块">
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
              <span>{item.label}</span>
              <em>{item.en}</em>
              <kbd>{item.key}</kbd>
            </button>
          )
        })}
      </div>
      <div className="rail-bottom">
        <button className="rail-mini" type="button" onClick={onReport} title="结构化报告">
          <FileText size={17} />
          <span>报告</span>
        </button>
        <button className="rail-mini" type="button" title="设置">
          <Settings2 size={17} />
          <span>设置</span>
        </button>
        <button className="rail-mini" type="button" title="帮助">
          <CircleHelp size={17} />
        </button>
        <div className="rail-version">v2.0</div>
      </div>
    </nav>
  )
}
