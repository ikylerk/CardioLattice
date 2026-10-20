import React from 'react'
import { health } from '../api/client.js'
import { Badge, Button, Section } from './ui.jsx'

const REPORT_STATUSES = {
  template_only: '仅模板草稿',
  configured_unverified: '已配置 · 未验证',
}
const SEGMENTATION_STATUSES = {
  synthetic_only: '仅合成数据',
  dependency_missing: '依赖未安装',
  configured_unverified: '已配置 · 未验证',
  unsupported: '不受支持',
}

function CapabilityRow({ title, value, statuses, phase }) {
  const known = value
    && Object.prototype.hasOwnProperty.call(statuses, value.status)
    && typeof value.reason === 'string'
    && value.reason.trim()
  const label = phase === 'loading' ? '读取中' : known ? statuses[value.status] : '状态未知'
  const reason = phase === 'loading' ? '正在读取运行能力声明…'
    : phase === 'error' ? '读取失败，当前能力状态未知。请重试。'
      : known ? value.reason : '健康接口未返回可识别的能力状态，当前状态未知。'
  return (
    <div className="wb-empty-line">
      <div>
        <strong>{title}</strong>{' '}
        <Badge tone={known ? 'amber' : 'neutral'}>{label}</Badge>
        <p style={{ margin: '6px 0 0', lineHeight: 1.6 }}>{reason}</p>
      </div>
    </div>
  )
}

export default function RuntimeCapabilities() {
  const [attempt, setAttempt] = React.useState(0)
  const [state, setState] = React.useState({ phase: 'loading', capabilities: null })

  React.useEffect(() => {
    let active = true
    setState({ phase: 'loading', capabilities: null })
    // health() has no abort parameter. Ignore late responses after timeout,
    // retry or unmount without exposing transport/server errors to the UI.
    const timer = setTimeout(() => {
      if (active) {
        active = false
        setState({ phase: 'error', capabilities: null })
      }
    }, 8000)
    health().then((response) => {
      if (active) setState({ phase: 'ready', capabilities: response?.capabilities ?? null })
    }).catch(() => {
      if (active) setState({ phase: 'error', capabilities: null })
    }).finally(() => {
      active = false
      clearTimeout(timer)
    })
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [attempt])

  return (
    <Section
      title="当前运行能力"
      right={(
        <Button size="sm" disabled={state.phase === 'loading'} onClick={() => setAttempt((value) => value + 1)}>
          刷新能力状态
        </Button>
      )}
    >
      <div aria-live="polite" aria-busy={state.phase === 'loading'}>
        <CapabilityRow title="报告草稿" value={state.capabilities?.reportDraft} statuses={REPORT_STATUSES} phase={state.phase} />
        <CapabilityRow title="原始影像自动分割" value={state.capabilities?.imageSegmentation} statuses={SEGMENTATION_STATUSES} phase={state.phase} />
        <div className="wb-empty-line">
          原始影像自动分割未启用时，可导入已有分割标签进行三维重建。
        </div>
        <div className="wb-empty-line">
          此处仅显示配置与安装声明，“已配置”不代表已验证可用。
        </div>
      </div>
    </Section>
  )
}
