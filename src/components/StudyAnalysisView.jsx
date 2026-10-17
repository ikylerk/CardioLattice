import React from 'react'
import {
  Activity,
  BarChart3,
  CircleAlert,
  FileStack,
  FolderOpen,
  GitCompare,
  ShieldCheck,
} from 'lucide-react'
import ViewHeader from './ViewHeader.jsx'
import { Badge, Button, Section, Stat } from './ui.jsx'
import { useStudy } from '../study/StudyContext.jsx'
import { apiGet } from '../api/client.js'
import { dicomLabel, measurementLabel, serverText, useI18n } from '../i18n.js'

function MeasurementCard({ item }) {
  const { t } = useI18n()
  const computed = item.status === 'computed' && item.value !== null && item.value !== undefined
  return (
    <div className={`analysis-metric ${computed ? '' : 'not-computed'}`}>
      <span>{measurementLabel(item)}</span>
      <strong>
        {computed ? item.value : '—'}
        {computed && item.unit ? <small>{item.unit}</small> : null}
      </strong>
      <em>{computed ? `${item.method} · ${item.validationStatus}` : t('common.notComputed')}</em>
      {!computed && item.reason ? <p>{serverText(item.reason)}</p> : null}
    </div>
  )
}

export default function StudyAnalysisView({ onNavigate }) {
  const { t } = useI18n()
  const { study, measurements, isApi } = useStudy()
  const [models, setModels] = React.useState([])

  React.useEffect(() => {
    if (!isApi) {
      setModels([])
      return undefined
    }
    let cancelled = false
    apiGet('/models')
      .then((data) => {
        if (!cancelled) setModels(data?.models || [])
      })
      .catch(() => {
        if (!cancelled) setModels([])
      })
    return () => {
      cancelled = true
    }
  }, [isApi])
  const computed = measurements.filter((item) => item.status === 'computed' && item.value !== null)
  const notComputed = measurements.filter((item) => item.status !== 'computed')
  const segmentation = study?.segmentations?.[0]
  const synthetic = measurements.some((item) => item.validationStatus === 'synthetic')
  const current = study?.study
  const noteTexts = []
  const warnings = segmentation?.quality?.warnings
  if (Array.isArray(warnings)) noteTexts.push(...warnings.map((item) => serverText(item)))
  if (segmentation?.provenance?.note) noteTexts.push(serverText(segmentation.provenance.note))
  const meshNotes = new Set()
  for (const mesh of study?.meshes || []) {
    if (mesh.sceneTransform?.note) meshNotes.add(serverText(mesh.sceneTransform.note))
  }
  noteTexts.push(...meshNotes)

  return (
    <div className="module-view analysis-view">
      <ViewHeader
        index="05"
        eyebrow="QUANTITATIVE ANALYSIS"
        title={t('studyAnalysis.title')}
        titleSuffix="TRACEABLE METRICS"
        description={t('studyAnalysis.description')}
        meta={
          <>
            <span>{t('studyAnalysis.computedCount', { count: computed.length })}</span>
            <i />
            <span>{t('studyAnalysis.notComputedCount', { count: notComputed.length })}</span>
            <i />
            <span>{segmentation?.modelId || t('studyAnalysis.noModel')}</span>
          </>
        }
        actions={
          <>
            <Badge tone={synthetic ? 'amber' : 'teal'} dot>
              {synthetic ? t('studyAnalysis.syntheticBadge') : t('studyAnalysis.researchBadge')}
            </Badge>
            <Button variant="outline" size="sm" icon={<FolderOpen size={14} />} onClick={() => onNavigate?.('workbench')}>
              {t('studyAnalysis.workbench')}
            </Button>
          </>
        }
      />

      <div className="module-body analysis-body">
        <div className="analysis-main">
          <div className="analysis-strip">
            <Stat label={t('studyAnalysis.traceable')} value={computed.length} hint={t('studyAnalysis.withMethod')} />
            <Stat label={t('studyAnalysis.notComputed')} value={notComputed.length} accent="amber" hint={t('studyAnalysis.noDemoNumbers')} />
            <Stat label={t('studyAnalysis.model')} value={segmentation?.modelId || '—'} hint={segmentation?.modelVersion || t('studyAnalysis.notRun')} />
            <Stat label={t('studyAnalysis.validation')} value={synthetic ? 'SYNTHETIC' : segmentation?.provenance?.validation_status || 'RESEARCH'} hint={t('studyAnalysis.notClinical')} />
          </div>

          <Section title={t('studyAnalysis.results')} code="MEASUREMENTS" right={<BarChart3 size={13} />}>
            {computed.length ? (
              <div className="analysis-metric-grid">
                {computed.map((item) => <MeasurementCard key={item.id} item={item} />)}
              </div>
            ) : (
              <div className="analysis-empty">
                <CircleAlert size={16} />
                <b>{t('studyAnalysis.emptyTitle')}</b>
                <span>{t('studyAnalysis.emptyBody')}</span>
              </div>
            )}
          </Section>

          <Section title={t('studyAnalysis.reasons')} code="NOT COMPUTED" right={<CircleAlert size={13} />}>
            <div className="analysis-not-computed">
              {notComputed.length ? notComputed.map((item) => (
                <div key={item.id}>
                  <b>{measurementLabel(item)}</b>
                  <span>{item.reason ? serverText(item.reason) : t('common.missingInput')}</span>
                </div>
              )) : <div className="wb-empty-line">{t('studyAnalysis.noneMissing')}</div>}
            </div>
          </Section>

          <div className="analysis-grid">
            <Section title={t('studyAnalysis.aha')} code="MYOCARDIAL MAP" right={<Activity size={13} />}>
              <div className="analysis-placeholder">
                <div className="aha-placeholder-ring">
                  {Array.from({ length: 17 }, (_, index) => (
                    <i key={index} style={{ transform: `rotate(${index * (360 / 17)}deg)` }} />
                  ))}
                </div>
                <div>
                  <b>{t('studyAnalysis.ahaTitle')}</b>
                  <span>{t('studyAnalysis.ahaBody')}</span>
                </div>
              </div>
            </Section>

            <Section title={t('studyAnalysis.ffr')} code="PHYSIOLOGY" right={<Activity size={13} />}>
              <div className="analysis-placeholder">
                <div className="ffr-placeholder">
                  <i /><i /><i /><i /><i /><i />
                </div>
                <div>
                  <b>{t('studyAnalysis.ahaTitle')}</b>
                  <span>{t('studyAnalysis.ffrBody')}</span>
                </div>
              </div>
            </Section>

            <Section title={t('studyAnalysis.longitudinal')} code="LONGITUDINAL" right={<GitCompare size={13} />}>
              <div className="analysis-placeholder">
                <GitCompare size={22} />
                <div>
                  <b>{t('studyAnalysis.m3')}</b>
                  <span>{t('studyAnalysis.m3Body')}</span>
                </div>
              </div>
            </Section>
          </div>
        </div>

        <aside className="inspector analysis-inspector">
          <div className="selection-hero">
            <div className="selection-eyebrow">
              <span>TRACEABILITY</span>
              <span className="selection-id">SOURCE</span>
            </div>
            <div className="selection-title">
              <span className="structure-swatch swatch-great" />
              <div>
                <h2>{current?.subject?.pseudonym || t('studyAnalysis.noStudy')}</h2>
                <small>{current?.description ? (isApi ? dicomLabel(current.description) : current.description) : '—'}</small>
              </div>
            </div>
            <p>{t('studyAnalysis.traceBody')}</p>
          </div>

          <Section title={t('studyAnalysis.provenance')} code="PROVENANCE" right={<ShieldCheck size={13} />}>
            <div className="scan-params">
              <div><span>{t('studyAnalysis.studySource')}</span><b>{current?.source || '—'}</b></div>
              <div><span>{t('studyAnalysis.task')}</span><b>{segmentation?.task || '—'}</b></div>
              <div><span>{t('studyAnalysis.modelVersion')}</span><b>{segmentation?.modelVersion || '—'}</b></div>
              <div><span>{t('studyAnalysis.labels')}</span><b>{segmentation?.labelMap ? Object.keys(segmentation.labelMap).join(', ') : '—'}</b></div>
              <div><span>{t('studyAnalysis.count')}</span><b>{measurements.length}</b></div>
              <div><span>{t('studyAnalysis.audit')}</span><b>{t('studyAnalysis.seeWorkbench')}</b></div>
            </div>
          </Section>

          {noteTexts.length ? (
            <Section title={t('studyAnalysis.notes')} code="NOTES" right={<CircleAlert size={13} />}>
              <div className="analysis-not-computed">
                {noteTexts.map((text) => <div key={text}><span>{text}</span></div>)}
              </div>
            </Section>
          ) : null}

          {models.length ? (
            <Section title={t('studyAnalysis.models')} code="MODELS" right={<ShieldCheck size={13} />}>
              <div className="analysis-not-computed">
                {models.map((model) => (
                  <div key={model.id}>
                    <b>{model.id}</b>
                    <span>{serverText(model.intendedUse)}</span>
                    <span>{serverText(model.license)}</span>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          <Section title={t('studyAnalysis.shortcuts')} code="NAVIGATION" right={<FileStack size={13} />}>
            <div className="workbench-open-actions">
              <Button size="sm" onClick={() => onNavigate?.('cta')} disabled={!study?.volumes?.length}>{t('studyAnalysis.viewCt')}</Button>
              <Button size="sm" onClick={() => onNavigate?.('anatomy')} disabled={!study?.meshes?.length}>{t('studyAnalysis.view3d')}</Button>
              <Button size="sm" onClick={() => onNavigate?.('workbench')}>{t('patient.workbench')}</Button>
            </div>
          </Section>

          <div className="cta-disclaimer">
            <CircleAlert size={12} />
            {t('disclaimer.body')}
          </div>
        </aside>
      </div>
    </div>
  )
}
