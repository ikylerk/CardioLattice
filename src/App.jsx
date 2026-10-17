import React from 'react'
import { CircleAlert } from 'lucide-react'
import TopBar from './components/TopBar.jsx'
import SideRail, { MODULES } from './components/SideRail.jsx'
import StatusBar from './components/StatusBar.jsx'
import Toast from './components/Toast.jsx'
import ReportDrawer from './components/ReportDrawer.jsx'
import AnatomyView from './components/AnatomyView.jsx'
import AngioView from './components/AngioView.jsx'
import CtaView from './components/CtaView.jsx'
import EchoView from './components/EchoView.jsx'
import AnalysisView from './components/AnalysisView.jsx'
import StudyWorkbench from './components/StudyWorkbench.jsx'
import OrganLibraryView from './components/OrganLibraryView.jsx'
import { StudyProvider, useStudy } from './study/StudyContext.jsx'

const VIEWS = {
  workbench: StudyWorkbench,
  anatomy: AnatomyView,
  angio: AngioView,
  cta: CtaView,
  echo: EchoView,
  analysis: AnalysisView,
  organs: OrganLibraryView,
}

const MODULE_IDS = new Set(MODULES.map((item) => item.id))
const API_ONLY_DISABLED = new Set(['angio', 'echo'])

function moduleFromHash() {
  const value = window.location.hash.replace(/^#\/?/, '')
  return MODULE_IDS.has(value) ? value : 'anatomy'
}

function UnavailableModule({ active, onNavigate }) {
  const label = active === 'angio' ? '冠脉造影' : '心脏超声'
  return (
    <div className="module-view">
      <div className="empty-module">
        <CircleAlert size={24} />
        <h2>{label}尚未接入该检查</h2>
        <p>
          当前 API 模式只接入了 CCTA DICOM。造影与超声的真实数据接入属于后续里程碑；
          演示模式仍可查看原有界面。
        </p>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onNavigate('workbench')}>
          返回检查工作台
        </button>
      </div>
    </div>
  )
}

function AppShell() {
  const { isApi, study } = useStudy()
  const [active, setActive] = React.useState(moduleFromHash)
  const [bpm, setBpm] = React.useState(72)
  const [playing, setPlaying] = React.useState(true)
  const [reportOpen, setReportOpen] = React.useState(false)
  const [toast, setToast] = React.useState('')
  const toastTimer = React.useRef(null)

  const notify = React.useCallback((message) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2600)
  }, [])

  React.useEffect(() => {
    const onKey = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const padded = event.key.length === 1 ? event.key.padStart(2, '0') : event.key
      const found = MODULES.find((item) => item.key === event.key || item.key === padded)
      if (found) setActive(found.id)
      if (event.key === 'Escape') setReportOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  React.useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  React.useEffect(() => {
    const nextHash = `#${active}`
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash)
    }
  }, [active])

  React.useEffect(() => {
    const onHashChange = () => {
      const next = moduleFromHash()
      setActive((current) => (current === next ? current : next))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const blocked = isApi && API_ONLY_DISABLED.has(active)
  const View = VIEWS[active]
  return (
    <div className={`app-shell module-${active}`}>
      <TopBar onReport={() => setReportOpen(true)} onWorkbench={() => setActive('workbench')} />
      <div className="workspace">
        <SideRail
          active={active}
          onChange={setActive}
          onReport={() => setReportOpen(true)}
        />
        <main className="stage">
          {blocked ? (
            <UnavailableModule active={active} onNavigate={setActive} />
          ) : (
            <View
              bpm={bpm}
              setBpm={setBpm}
              playing={playing}
              setPlaying={setPlaying}
              notify={notify}
              onReport={() => setReportOpen(true)}
              onNavigate={setActive}
            />
          )}
        </main>
      </div>
      <StatusBar
        active={active}
        bpm={bpm}
        playing={playing}
        onTogglePlaying={() => setPlaying((value) => !value)}
      />
      <ReportDrawer
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        notify={notify}
        studyReady={Boolean(study)}
      />
      <Toast message={toast} />
    </div>
  )
}

export default function App() {
  return (
    <StudyProvider>
      <AppShell />
    </StudyProvider>
  )
}
