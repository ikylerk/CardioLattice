import { t, useI18n, serverText, measurementLabel } from '../i18n.js'
import { tImaging } from '../i18n-imaging.js'
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

const CORONARY_ANALYSIS_CODES = new Set([
  'CORONARY_CENTERLINE_LENGTH',
  'CORONARY_TOTAL_LENGTH',
  'CORONARY_MEAN_DIAMETER',
  'CORONARY_MIN_DIAMETER',
  'CORONARY_REFERENCE_DIAMETER',
  'CORONARY_STENOSIS_CANDIDATES',
])

function isComputedNumber(item) {
  return item?.status === 'computed' && typeof item.value === 'number' && Number.isFinite(item.value)
}

function MeasurementCard({ item }) {
  const computed = isComputedNumber(item)
  return (
    <div className={`analysis-metric ${computed ? '' : 'not-computed'}`}>
      <span>{measurementLabel(item)}</span>
      <strong>
        {computed ? item.value : '—'}
        {computed && item.unit ? <small>{item.unit}</small> : null}
      </strong>
      <em>{computed ? `${item.method} · ${item.source || tImaging('common.sourceUnknown')} · ${item.validationStatus}` : t('common.notComputed')}</em>
      {!computed && item.reason ? <p>{serverText(item.reason)}</p> : null}
    </div>
  )
}

export default function StudyAnalysisView({ onNavigate }) {
  useI18n()
  const { study, measurements } = useStudy()
  const computed = measurements.filter(isComputedNumber)
  const notComputed = measurements.filter((item) => !isComputedNumber(item))
  const coronaryMeasurements = measurements.filter((item) => CORONARY_ANALYSIS_CODES.has(item.code))
  const coronary = coronaryMeasurements.filter(isComputedNumber)
  const coronaryFailures = measurements.filter((item) => (
    CORONARY_ANALYSIS_CODES.has(item.code) || /^CORONARY_(?:[A-Z0-9]+_)*CENTERLINE$/.test(item.code || '')
  ) && !isComputedNumber(item))
  const hasCoronaryInput = measurements.some((item) => /^CORONARY_/.test(item.code || ''))
  const candidateMeasurement = coronaryMeasurements.find((item) => item.code === 'CORONARY_STENOSIS_CANDIDATES')
  const stenosisCandidates = Array.isArray(candidateMeasurement?.provenance?.candidates)
    ? candidateMeasurement.provenance.candidates
    : []
  const candidateCountValid = isComputedNumber(candidateMeasurement)
    && Number.isInteger(candidateMeasurement.value) && candidateMeasurement.value >= 0
  const coronaryComplete = candidateCountValid && coronaryFailures.length === 0
    && (candidateMeasurement.value !== 0 || stenosisCandidates.length === 0)
  const coronaryIncompleteReason = !candidateCountValid
    ? tImaging('analysis.countIncomplete')
    : tImaging('analysis.inconsistent')
  const registration = measurements.find((item) => item.code === 'ATLAS_REGISTRATION_RMS')
  const registrationTargets = registration?.provenance?.targets || []
  const segmentation = study?.segmentations?.[0]
  const synthetic = measurements.some((item) => item.validationStatus === 'synthetic')
  const current = study?.study

  return (
    <div className="module-view analysis-view">
      <ViewHeader
        index="05"
        eyebrow="QUANTITATIVE ANALYSIS"
        title={t('nav.analysis')}
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
            <Button variant="outline" size="sm" icon={<FolderOpen size={14} />} onClick={() => onNavigate?.('workbench')}>{t('nav.workbench')}</Button>
          </>
        }
      />

      <div className="module-body analysis-body">
        <div className="analysis-main">
          <div className="analysis-strip">
            <Stat label={t('studyAnalysis.traceable')} value={computed.length} hint={t('studyAnalysis.withMethod')} />
            <Stat label={t('common.notComputed')} value={notComputed.length} accent="amber" hint={t('studyAnalysis.noDemoNumbers')} />
            <Stat label={t('studyAnalysis.model')} value={segmentation?.modelId || '—'} hint={segmentation?.modelVersion || t('workbench.modelNotRun')} />
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
                <b>{t('common.noComputedMeasurements')}</b>
                <span>{t('studyAnalysis.emptyBody')}</span>
              </div>
            )}
          </Section>

          {hasCoronaryInput ? (
            <Section title={tImaging('analysis.coronaryTitle')} code="CORONARY MASK ANALYSIS" right={<Activity size={13} />}>
              <div className="analysis-metric-grid">
                {coronary.map((item) => <MeasurementCard key={item.id} item={item} />)}
              </div>
              <p className="analysis-research-note">{tImaging('analysis.coronaryScope')}</p>
              {!coronaryComplete ? (
                <div className="analysis-placeholder">
                  <CircleAlert size={16} />
                  <div>
                    <b>{tImaging('analysis.incomplete')}</b>
                    {coronaryFailures.length ? coronaryFailures.map((item, index) => (
                      <p key={item.id || `${item.code}-${index}`}>
                        {serverText(item.reason) || tImaging('analysis.metricIncomplete')}
                        <br />
                        <small>{item.code} · {item.method || tImaging('common.methodUnknown')} · {item.source || tImaging('common.sourceUnknown')}</small>
                      </p>
                    )) : <span>{coronaryIncompleteReason}</span>}
                  </div>
                </div>
              ) : candidateMeasurement.value > 0 ? (
                <div className="coronary-candidate-table">
                  <div className="coronary-candidate-head">
                    <span>{tImaging('analysis.candidates')}</span>
                    <b>{candidateMeasurement.value}{' '}{tImaging('common.countUnit')}</b>
                  </div>
                  {stenosisCandidates.length !== candidateMeasurement.value ? (
                    <p className="analysis-research-note">{tImaging('analysis.missingCandidates')}</p>
                  ) : null}
                  <table>
                    <thead>
                      <tr><th>{tImaging('analysis.position')}</th><th>{tImaging('analysis.diameter')}</th><th>{tImaging('analysis.referenceDiameter')}</th><th>{tImaging('analysis.diameterReduction')}</th><th>{tImaging('analysis.pathPosition')}</th></tr>
                    </thead>
                    <tbody>
                      {stenosisCandidates.map((candidate, index) => (
                        <tr key={`${candidate.positionMm?.join('-') || index}`}>
                          <td>{candidate.positionMm?.join(' / ') || '—'}</td>
                          <td>{candidate.diameterMm} mm</td>
                          <td>{candidate.referenceDiameterMm} mm</td>
                          <td>{candidate.severityPct}%</td>
                          <td>{candidate.pathLengthMm} mm</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="analysis-placeholder">
                  <CircleAlert size={16} />
                  <div>
                    <b>{tImaging('analysis.zeroCandidates')}</b>
                    <span>{tImaging('analysis.zeroScope')}</span>
                  </div>
                </div>
              )}
            </Section>
          ) : null}

          <Section title={tImaging('registration.title')} code="ATLAS REGISTRATION" right={<ShieldCheck size={13} />}>
            {isComputedNumber(registration) ? (
              <>
                <div className="analysis-metric-grid">
                  <div className="analysis-metric">
                    <span>{tImaging('registration.residual')}</span>
                    <strong>{registration.value}<small>mm</small></strong>
                    <em>chamber_centroid_umeyama_similarity</em>
                  </div>
                  <div className="analysis-metric">
                    <span>{tImaging('registration.scale')}</span>
                    <strong>{registration.provenance?.scale ?? '—'}</strong>
                    <em>reference → patient</em>
                  </div>
                  <div className="analysis-metric">
                    <span>{tImaging('registration.targets')}</span>
                    <strong>{registrationTargets.length}<small>{tImaging('common.countUnit')}</small></strong>
                    <em>{tImaging('registration.referenceOnly')}</em>
                  </div>
                </div>
                <p className="analysis-research-note">{tImaging('registration.scope')}</p>
                {registrationTargets.length ? (
                  <div className="coronary-candidate-table">
                    <div className="coronary-candidate-head">
                      <span>{tImaging('registration.patientTargets')}</span>
                      <b>{registrationTargets.length}{' '}{tImaging('common.countUnit')}</b>
                    </div>
                    <table>
                      <thead>
                        <tr><th>{tImaging('registration.target')}</th><th>{tImaging('registration.category')}</th><th>{tImaging('registration.referenceCoords')}</th><th>{tImaging('registration.patientCoords')}</th></tr>
                      </thead>
                      <tbody>
                        {registrationTargets.map((target) => (
                          <tr key={target.id}>
                            <td>{serverText(target.name)}</td>
                            <td>{serverText(target.category)}</td>
                            <td>{target.referenceMm?.join(' / ')}</td>
                            <td>{target.patientMm?.join(' / ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : registration ? (
              <div className="analysis-empty">
                <CircleAlert size={16} />
                <b>{tImaging('registration.incomplete')}</b>
                <span>{serverText(registration.reason) || tImaging('registration.requiredLabels')}</span>
              </div>
            ) : (
              <div className="analysis-placeholder">
                <ShieldCheck size={16} />
                <div>
                  <b>{tImaging('registration.notRun')}</b>
                  <span>{tImaging('registration.runHint')}</span>
                </div>
              </div>
            )}
          </Section>

          <Section title={t('studyAnalysis.reasons')} code="NOT COMPUTED" right={<CircleAlert size={13} />}>
            <div className="analysis-not-computed">
              {notComputed.length ? notComputed.map((item) => (
                <div key={item.id}>
                  <b>{measurementLabel(item)}</b>
                  <span>{serverText(item.reason) || t('common.missingInput')}</span>
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
                  <b>{t('common.notComputed')}</b>
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
                  <b>{t('common.notComputed')}</b>
                  <span>{t('studyAnalysis.ffrBody')}</span>
                </div>
              </div>
            </Section>

            <Section title={t('nav.comparison')} code="LONGITUDINAL" right={<GitCompare size={13} />}>
              <div className="analysis-placeholder">
                <GitCompare size={22} />
                <div>
                  <b>{tImaging('analysis.comparisonTitle')}</b>
                  <span>{tImaging('analysis.comparisonScope')}</span>
                  <Button size="sm" variant="outline" icon={<GitCompare size={14} />} onClick={() => onNavigate?.('comparison')}>{tImaging('analysis.openComparison')}</Button>
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
                <h2>{current?.subject?.pseudonym || t('topbar.noStudy')}</h2>
                <small>{serverText(current?.description) || '—'}</small>
              </div>
            </div>
            <p>{tImaging('analysis.provenance')}</p>
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

          <Section title={t('studyAnalysis.shortcuts')} code="NAVIGATION" right={<FileStack size={13} />}>
            <div className="workbench-open-actions">
              <Button size="sm" onClick={() => onNavigate?.('cta')} disabled={!study?.volumes?.length}>{t('workbench.viewCt')}</Button>
              <Button size="sm" onClick={() => onNavigate?.('anatomy')} disabled={!study?.meshes?.length}>{t('workbench.view3d')}</Button>
              <Button size="sm" onClick={() => onNavigate?.('workbench')}>{t('patient.workbench')}</Button>
            </div>
          </Section>

          <div className="cta-disclaimer">
            <CircleAlert size={12} />{t('studyAnalysis.disclaimer')}</div>
        </aside>
      </div>
    </div>
  )
}
