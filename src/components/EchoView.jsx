import React from 'react'
import {
  Activity,
  Camera,
  Check,
  ChevronRight,
  CircleAlert,
  Gauge,
  HeartPulse,
  Pause,
  Play,
  Ruler,
  SlidersHorizontal,
  Sparkles,
  Waves,
} from 'lucide-react'
import ViewHeader from './ViewHeader.jsx'
import EchoCanvas from './EchoCanvas.jsx'
import { Badge, Button, Section, Segmented, Slider, Stat, Toggle } from './ui.jsx'
import { useI18n } from '../i18n.js'

const VIEWS = [
  { id: 'a4c', labelKey: 'echo.a4c', en: 'A4C', sub: 'APICAL 4-CHAMBER' },
  { id: 'a2c', labelKey: 'echo.a2c', en: 'A2C', sub: 'APICAL 2-CHAMBER' },
  { id: 'plax', labelKey: 'echo.plax', en: 'PLAX', sub: 'PARASTERNAL LONG' },
  { id: 'psax', labelKey: 'echo.psax', en: 'PSAX', sub: 'PARASTERNAL SHORT' },
]

const VIEW_NAMES = {
  a4c: 'APICAL 4-CHAMBER',
  a2c: 'APICAL 2-CHAMBER',
  plax: 'PARASTERNAL LONG AXIS',
  psax: 'PARASTERNAL SHORT AXIS',
}

function DopplerTrace() {
  const { t } = useI18n()
  return (
    <svg className="doppler-trace" viewBox="0 0 260 92" role="img" aria-label={t('echo.dopplerAria')}>
      <defs>
        <linearGradient id="dopplerFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(110, 218, 194, .42)" />
          <stop offset="1" stopColor="rgba(110, 218, 194, .03)" />
        </linearGradient>
      </defs>
      <rect width="260" height="92" fill="#060d10" rx="3" />
      {[18, 36, 54, 72].map((y) => (
        <line key={y} x1="0" y1={y} x2="260" y2={y} stroke="rgba(85, 132, 137, .12)" strokeWidth="0.6" />
      ))}
      {[52, 104, 156, 208].map((x) => (
        <line key={x} x1={x} y1="0" x2={x} y2="92" stroke="rgba(85, 132, 137, .1)" strokeWidth="0.6" />
      ))}
      <line x1="0" y1="56" x2="260" y2="56" stroke="rgba(146, 187, 183, .34)" strokeWidth="0.8" />
      <path
        d="M10 56 C22 56 28 16 40 16 C52 16 56 50 68 54 C76 56 82 42 94 42 C104 42 108 54 118 55 L128 55 C140 55 146 48 158 48 C168 48 172 55 182 55 L260 56"
        fill="none"
        stroke="#8be0d0"
        strokeWidth="1.4"
      />
      <path
        d="M10 56 C22 56 28 16 40 16 C52 16 56 50 68 54 L68 56 Z"
        fill="url(#dopplerFill)"
        opacity=".8"
      />
      <text x="26" y="11" fill="#aeeade" fontFamily="SFMono-Regular, Menlo, monospace" fontSize="6">E 0.82</text>
      <text x="73" y="37" fill="#7fc4ba" fontFamily="SFMono-Regular, Menlo, monospace" fontSize="6">A 0.55</text>
      <text x="205" y="49" fill="#6e9899" fontFamily="SFMono-Regular, Menlo, monospace" fontSize="5.5">VTI 18.4</text>
      <text x="6" y="87" fill="#476573" fontFamily="SFMono-Regular, Menlo, monospace" fontSize="5">-</text>
      <text x="232" y="87" fill="#476573" fontFamily="SFMono-Regular, Menlo, monospace" fontSize="5">+</text>
    </svg>
  )
}

export default function EchoView({ bpm, playing, setPlaying, notify }) {
  const { t } = useI18n()
  const [view, setView] = React.useState('a4c')
  const [colorDoppler, setColorDoppler] = React.useState(true)
  const [calipers, setCalipers] = React.useState(true)
  const [gain, setGain] = React.useState(54)
  const [depth, setDepth] = React.useState(16)
  const [frame, setFrame] = React.useState(0)

  React.useEffect(() => {
    if (!playing) return undefined
    const timer = setInterval(() => setFrame((value) => (value + 1) % 10000), 66)
    return () => clearInterval(timer)
  }, [playing])

  const currentView = VIEWS.find((item) => item.id === view)

  return (
    <div className="module-view echo-view">
      <ViewHeader
        index="04"
        eyebrow="ECHOCARDIOGRAPHY"
        title={t('echo.title')}
        titleSuffix="DOPPLER · M-MODE"
        description={t('echo.description')}
        meta={
          <>
            <span>A4C</span>
            <i />
            <span>2.5 MHz</span>
            <i />
            <span>60 FPS</span>
          </>
        }
        actions={
          <>
            <Badge tone="teal" dot>{t('echo.live')}</Badge>
            <Button variant="outline" size="sm" icon={playing ? <Pause size={14} /> : <Play size={14} />} onClick={() => setPlaying(!playing)}>
              {playing ? t('echo.freeze') : t('echo.resume')}
            </Button>
          </>
        }
      />

      <div className="module-body">
        <div className="viewer echo-viewer">
          <div className="echo-toolbar">
            <div className="echo-view-tabs">
              {VIEWS.map((item) => (
                <button key={item.id} type="button" className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>
                  <span>{t(item.labelKey)}</span>
                  <small>{item.en}</small>
                </button>
              ))}
            </div>
            <div className="echo-toolbar-right">
              <button type="button" className={`echo-tool ${colorDoppler ? 'active' : ''}`} onClick={() => setColorDoppler((value) => !value)}>
                <span className="color-chip" />
                {t('echo.color')}
              </button>
              <button type="button" className={`echo-tool ${calipers ? 'active' : ''}`} onClick={() => setCalipers((value) => !value)}>
                <Ruler size={12} />
                {t('echo.measure')}
              </button>
            </div>
          </div>

          <div className="echo-screen-area">
            <div className="echo-monitor">
              <div className="echo-monitor-bezel">
                <div className="echo-screen">
                  <EchoCanvas
                    view={view}
                    colorDoppler={colorDoppler}
                    calipers={calipers}
                    playing={playing}
                    bpm={bpm}
                    gain={gain}
                    depth={depth}
                  />
                  <div className="echo-screen-overlay">
                    <div className="echo-screen-top">
                      <span className="echo-clinic">CARDIO · ECHO LAB</span>
                      <span className="echo-study">ADULT CARDIAC · {currentView.en}</span>
                      <span className="echo-acq">MI 0.9 · TIS 0.4</span>
                    </div>
                    <div className="echo-screen-left">
                      <span>{t('demo.pseudonym')}</span>
                      <span>ID CV-2026-0417</span>
                      <span>2026-10-17 09:52</span>
                    </div>
                    <div className="echo-screen-right">
                      <span>S5-1</span>
                      <span>{bpm} BPM</span>
                      <span>{(54 + (frame % 3)).toFixed(0)} FPS</span>
                    </div>
                    <div className="echo-view-label">{VIEW_NAMES[view]}</div>
                    {colorDoppler ? (
                      <div className="echo-colorbar">
                        <span className="color-high">+60</span>
                        <i />
                        <span className="color-low">-60</span>
                        <em>cm/s</em>
                      </div>
                    ) : null}
                    <div className="echo-screen-bottom">
                      <span>GAIN {gain}</span>
                      <span>DEPTH {depth} cm</span>
                      <span>FOCUS 8.4 cm</span>
                      <span>DR 62 dB</span>
                      <span className="echo-frame">FRAME {String(frame).padStart(4, '0')}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="echo-monitor-caption">
                <span>MONITOR 2 · ECHO CART</span>
                <span>SECTOR 76° · 60 FPS · HARMONIC</span>
              </div>
            </div>

            <div className="echo-console">
              <button type="button" className="console-play" onClick={() => setPlaying(!playing)}>
                {playing ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <div className="echo-console-copy">
                <b>{playing ? 'LIVE SCAN' : 'FROZEN'}</b>
                <small>{currentView.sub} · M-MODE 25 mm/s</small>
              </div>
              <div className="echo-console-sep" />
              <div className="echo-console-metrics">
                <span>HR <b>{bpm}</b></span>
                <span>GLS <b>-16.8%</b></span>
                <span>EF <b>54%</b></span>
              </div>
              <button type="button" className="echo-capture" onClick={() => notify(t('echo.captureToast'))}>
                <Camera size={11} /> {t('echo.capture')}
              </button>
            </div>
          </div>
        </div>

        <aside className="inspector echo-inspector">
          <div className="echo-hero">
            <div className="selection-eyebrow">
              <span>2D ECHOCARDIOGRAPHY</span>
              <span className="selection-id">LOOP · 3.6 s</span>
            </div>
            <div className="echo-hero-value">
              <div>
                <span>LVEF</span>
                <strong>54<small>%</small></strong>
                <em>SIMPSON · BIPLANE</em>
              </div>
              <div className="echo-hero-side">
                <span>GLS</span>
                <b>-16.8%</b>
                <em>{t('echo.glsMild')}</em>
              </div>
            </div>
            <p>{t('echo.hero')}</p>
          </div>

          <Section title={t('echo.windows')} code="ACOUSTIC WINDOWS" right={<Waves size={13} />}>
            <div className="echo-view-grid">
              {VIEWS.map((item) => (
                <button key={item.id} type="button" className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>
                  <b>{item.en}</b>
                  <span>{t(item.labelKey)}</span>
                  <small>{item.sub}</small>
                </button>
              ))}
            </div>
          </Section>

          <Section title={t('echo.imaging')} code="IMAGE PARAMETERS" right={<SlidersHorizontal size={13} />}>
            <div className="echo-param-sliders">
              <Slider label={t('echo.gain')} value={gain} min={20} max={80} onChange={setGain} unit=" dB" />
              <Slider label={t('echo.depth')} value={depth} min={8} max={24} onChange={setDepth} unit=" cm" />
            </div>
            <div className="echo-toggles">
              <Toggle label={t('echo.color')} hint="Nyquist 60 cm/s" checked={colorDoppler} onChange={setColorDoppler} />
              <Toggle label={t('echo.calipers')} hint="LVEDD / LVEF" checked={calipers} onChange={setCalipers} />
            </div>
          </Section>

          <Section title={t('echo.lv')} code="LEFT VENTRICULAR" right={<HeartPulse size={13} />}>
            <div className="echo-metric-grid">
              <Stat label="LVEDV" value="142" unit="mL" />
              <Stat label="LVESV" value="65" unit="mL" />
              <Stat label="LVEF" value="54" unit="%" accent="amber" />
              <Stat label="GLS" value="-16.8" unit="%" accent="amber" />
              <Stat label="E/e'" value="9.4" hint={t('echo.diastolic')} />
              <Stat label="TAPSE" value="22" unit="mm" />
            </div>
            <div className="echo-findings-inline">
              <span><Check size={10} /> {t('echo.wall')}</span>
              <span><Check size={10} /> {t('echo.rvOk')}</span>
            </div>
          </Section>

          <Section title={t('echo.mitral')} code="MITRAL DOPPLER" right={<Activity size={13} />}>
            <DopplerTrace />
            <div className="doppler-metrics">
              <div><span>{t('echo.e')}</span><b>0.82 m/s</b></div>
              <div><span>{t('echo.a')}</span><b>0.55 m/s</b></div>
              <div><span>E/A</span><b>1.49</b></div>
              <div><span>TR Vmax</span><b>2.4 m/s</b></div>
            </div>
          </Section>

          <Section title={t('echo.valves')} code="VALVULAR" right={<Gauge size={13} />}>
            <div className="valve-list">
              <div><span>{t('echo.mr')}</span><b>{t('echo.mrValue')}</b></div>
              <div><span>{t('echo.av')}</span><b>{t('echo.avValue')}</b></div>
              <div><span>{t('echo.tr')}</span><b>{t('echo.trValue')}</b></div>
              <div><span>RVSP</span><b>28 mmHg</b></div>
            </div>
          </Section>

          <div className="echo-note">
            <Sparkles size={12} />
            <p>{t('echo.note')}</p>
            <ChevronRight size={13} />
          </div>
          <div className="echo-disclaimer">
            <CircleAlert size={11} /> {t('disclaimer.body')}
          </div>
        </aside>
      </div>
    </div>
  )
}
