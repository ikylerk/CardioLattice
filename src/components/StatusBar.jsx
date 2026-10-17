import React from 'react'
import { CircleDot, Pause, Play, Volume2 } from 'lucide-react'
import EcgStrip from './EcgStrip.jsx'
import { useStudy } from '../study/StudyContext.jsx'

const MODULE_HINTS = {
  workbench: '上传 DICOM · 查看流水线 · 选择序列 · 进入工作站',
  anatomy: '拖动旋转 · 滚轮缩放 · 右键平移 · 单击结构识别',
  angio: '拖动 C 臂角度 · 切换造影期相 · QCA 定量狭窄',
  cta: '拖动十字线 · 滚轮切换层面 · 调整窗宽窗位',
  echo: '选择切面 · 播放动态 · 彩色多普勒叠加',
  analysis: '查看 AHA 17 段供血 · 点击热区查看缺血负荷',
}

export default function StatusBar({ active, bpm = 72, playing = true, onTogglePlaying }) {
  const { isDemo, isApi, study } = useStudy()
  const phase = (Date.now() / (60000 / bpm)) % 1
  const phaseName = phase < 0.35 ? '收缩期 SYSTOLE' : '舒张期 DIASTOLE'
  const vitalsAvailable = isDemo
  const disclaimer = isDemo
    ? '教学与研究演示 · 合成数据'
    : '研究原型 · 非临床诊断依据'

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
              <b>{isApi && !study ? '未选择检查' : '该检查未接入 ECG'}</b>
            </div>
            <div className="ecg-placeholder" />
          </div>
        )}
        <button type="button" className="transport-mini" onClick={onTogglePlaying} aria-label={playing ? '暂停心动周期' : '播放心动周期'}>
          {playing ? <Pause size={11} /> : <Play size={11} />}
        </button>
        <div className="vital-cell"><span>HR</span><b>{vitalsAvailable ? bpm : '—'}</b><em>bpm</em></div>
        <div className="vital-cell"><span>BP</span><b>{vitalsAvailable ? '128/76' : '—'}</b><em>mmHg</em></div>
        <div className="vital-cell"><span>SpO₂</span><b>{vitalsAvailable ? '98' : '—'}</b><em>%</em></div>
        <div className="vital-cell phase-cell"><span>PHASE</span><b>{phaseName.split(' ')[0]}</b><em>{phaseName.split(' ')[1]}</em></div>
      </div>
      <div className="status-hint">
        <CircleDot size={11} />
        {MODULE_HINTS[active] || MODULE_HINTS.anatomy}
      </div>
      <div className="status-legal">
        <span className="audio-icon"><Volume2 size={12} /></span>
        <span>{disclaimer}</span>
        <span className="status-build" title="3D anatomical surface: Realistic Human Heart by neshallads, CC BY 4.0">MODEL CC BY 4.0</span>
        <span className="status-build">{isApi ? 'BUILD M1 · API' : 'BUILD 2026.10 · LOCAL DEMO'}</span>
      </div>
    </footer>
  )
}
