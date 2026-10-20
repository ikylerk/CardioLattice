import { t, useI18n, serverText } from '../i18n.js'
import { tImaging, imagingLegacyText } from '../i18n-imaging.js'
import React from 'react'
import { health } from '../api/client.js'
import { Badge, Button, Section } from './ui.jsx'

const reportStatuses = () => ({
  template_only: tImaging('capability.templateOnly'),
  configured_unverified: tImaging('capability.unverified'),
})
const segmentationStatuses = () => ({
  synthetic_only: tImaging('capability.syntheticOnly'),
  dependency_missing: tImaging('capability.dependencyMissing'),
  configured_unverified: tImaging('capability.unverified'),
  unsupported: tImaging('capability.unsupported'),
})

function CapabilityRow({ title, value, statuses, phase }) {
  const suppliedReason = value?.reason
  const reasonPresent = typeof suppliedReason === 'string' ? Boolean(suppliedReason.trim())
    : suppliedReason && typeof suppliedReason.code === 'string' && Boolean(suppliedReason.code.trim())
  const decodedReason = serverText(suppliedReason)
  const known = phase === 'ready' && value
    && Object.prototype.hasOwnProperty.call(statuses, value.status)
    && reasonPresent && Boolean(decodedReason.trim())
  const label = phase === 'loading' ? tImaging('capability.loading') : known ? statuses[value.status] : tImaging('capability.unknown')
  const reason = phase === 'loading' ? tImaging('capability.loadingReason')
    : phase === 'error' ? tImaging('capability.errorReason')
      : known ? imagingLegacyText(decodedReason) : tImaging('capability.unknownReason')
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
  useI18n()
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
      title={tImaging('capability.title')}
      right={(
        <Button size="sm" disabled={state.phase === 'loading'} onClick={() => setAttempt((value) => value + 1)}>{tImaging('capability.refresh')}</Button>
      )}
    >
      <div aria-live="polite" aria-busy={state.phase === 'loading'}>
        <CapabilityRow title={t('stage.drafting_report')} value={state.capabilities?.reportDraft} statuses={reportStatuses()} phase={state.phase} />
        <CapabilityRow title={tImaging('capability.segmentation')} value={state.capabilities?.imageSegmentation} statuses={segmentationStatuses()} phase={state.phase} />
        <div className="wb-empty-line">{tImaging('capability.importHint')}</div>
        <div className="wb-empty-line">{tImaging('capability.scope')}</div>
      </div>
    </Section>
  )
}
