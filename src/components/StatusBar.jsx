import React from 'react'
import { CircleDot, Pause, Play, Volume2 } from 'lucide-react'
import EcgStrip from './EcgStrip.jsx'
import { useStudy } from '../study/StudyContext.jsx'
import { useI18n } from '../i18n.js'

const MODULE_HINTS = {
  workbench: 'statusBar.hintWorkbench',
  anatomy: 'statusBar.hintAnatomy',
  angio: 'statusBar.hintAngio',
  cta: 'statusBar.hintCta',
  echo: 'statusBar.hintEcho',
  analysis: 'statusBar.hintAnalysis',
  organs: 'statusBar.hintOrgans',
}

export default function StatusBar({ active, bpm = 72, playing = true, onTogglePlaying }) {
  const { isDemo, isApi, study } = useStudy()
  const { t } = useI18n()
  const phase = (Date.now() / (60000 / bpm)) % 1
  const systolic = phase < 0.35
  const vitalsAvailable = isDemo
  const disclaimer = t('disclaimer.body')

  return (
    <footer className="statusbar">
      <div className="vitals">
        {vitalsAvailable ? (
          <div className="ecg-block">
            <div className="ecg-label">
              <span>ECG II</span>
              <b>LEAD II · {bpm} BPM</b>
            </div>
            <EcgStrip bpm={bpm} playing={playing} />
          </div>
        ) : (
          <div className="ecg-block ecg-unavailable">
            <div className="ecg-label">
              <span>ECG</span>
              <b>{isApi && !study ? t('statusBar.ecgNoStudy') : t('statusBar.ecgUnavailable')}</b>
            </div>
            <div className="ecg-placeholder" />
          </div>
        )}
        <button type="button" className="transport-mini" onClick={onTogglePlaying} aria-label={playing ? t('statusBar.pauseCycle') : t('statusBar.playCycle')}>
          {playing ? <Pause size={11} /> : <Play size={11} />}
        </button>
        <div className="vital-cell"><span>HR</span><b>{vitalsAvailable ? bpm : '—'}</b><em>bpm</em></div>
        <div className="vital-cell"><span>BP</span><b>{vitalsAvailable ? '128/76' : '—'}</b><em>mmHg</em></div>
        <div className="vital-cell"><span>SpO₂</span><b>{vitalsAvailable ? '98' : '—'}</b><em>%</em></div>
        <div className="vital-cell phase-cell">
          <span>PHASE</span>
          <b>{systolic ? t('statusBar.systole') : t('statusBar.diastole')}</b>
          <em>{systolic ? 'SYSTOLE' : 'DIASTOLE'}</em>
        </div>
      </div>
      <div className="status-hint">
        <CircleDot size={11} />
        {t(MODULE_HINTS[active] || MODULE_HINTS.anatomy)}
      </div>
      <div className="status-legal">
        <span className="audio-icon"><Volume2 size={12} /></span>
        <span className="status-disclaimer">{disclaimer}</span>
        <span className="status-build" title="3D anatomical surface: Realistic Human Heart by neshallads, CC BY 4.0">MODEL CC BY 4.0</span>
        <span className="status-build">{isApi ? 'BUILD M1 · API' : 'BUILD 2026.10 · LOCAL DEMO'}</span>
      </div>
    </footer>
  )
}
