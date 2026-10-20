import React from 'react'
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  CloudUpload,
  Database,
  FileStack,
  FolderOpen,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import ViewHeader from './ViewHeader.jsx'
import { Badge, Button, Divider, Section } from './ui.jsx'
import { useStudy } from '../study/StudyContext.jsx'
import RuntimeCapabilities from './RuntimeCapabilities.jsx'
import { dicomLabel, enumLabel, errorDetail, serverText, useI18n } from '../i18n.js'
import { tReport } from '../i18n-report.js'

const STATUS_TONE = {
  ready: 'teal',
  processing: 'amber',
  queued: 'amber',
  failed: 'red',
  needs_series_selection: 'amber',
}

function ProgressTimeline({ job }) {
  const { t } = useI18n()
  if (!job) {
    return (
      <div className="wb-empty-line">
        <CircleAlert size={13} /> {t('workbench.pipelineNotStarted')}
      </div>
    )
  }
  const stages = [
    ['validating', t('stage.validating')],
    ['anonymizing', t('stage.anonymizing')],
    ['building_volume', t('stage.building_volume')],
    ['segmenting', job.type === 'public_import' ? tReport('alignLabels') : t('stage.segmenting')],
    ['meshing', t('stage.meshing')],
    ['computing_metrics', t('stage.computing_metrics')],
    ['drafting_report', t('stage.drafting_report')],
  ].filter(([key]) => job.type !== 'public_import' || key !== 'anonymizing')
  const currentIndex = stages.findIndex(([key]) => key === job.stage)
  return (
    <div className="wb-progress">
      <div className="wb-progress-head">
        <span>{enumLabel('status', job.state)}</span>
        <b>{job.progress}%</b>
      </div>
      {job.message ? <p className="wb-stage-message">{serverText(job.message)}</p> : null}
      <div className="wb-progress-track"><i style={{ width: `${job.progress}%` }} /></div>
      <div className="wb-progress-stages">
        {stages.map(([key, label], index) => (
          <span
            key={key}
            className={
              job.stage === key ? 'active' : currentIndex > index || job.state === 'succeeded' ? 'done' : ''
            }
          >
            {label}
          </span>
        ))}
      </div>
      {job.error ? <p className="wb-error">{serverText(job.error)}</p> : null}
    </div>
  )
}

export default function StudyWorkbench({ onNavigate, notify }) {
  const { t, lang } = useI18n()
  const {
    mode,
    loading,
    error,
    studies,
    study,
    audit,
    uploading,
    uploadProgress,
    isApi,
    selectStudy,
    createServerDemoStudy,
    upload,
    importPublic,
    chooseSeries,
    refreshCurrent,
    refreshStudies,
    loadAudit,
    setError,
  } = useStudy()
  const [dragging, setDragging] = React.useState(false)
  const [selectedSeries, setSelectedSeries] = React.useState('')
  const [publicImage, setPublicImage] = React.useState(null)
  const [publicLabels, setPublicLabels] = React.useState(null)
  const [publicDataset, setPublicDataset] = React.useState('')
  const [publicLabelMap, setPublicLabelMap] = React.useState('')
  const fileInputRef = React.useRef(null)

  const latestJob = study?.jobs?.length ? study.jobs[study.jobs.length - 1] : null
  const current = study?.study
  const coronaryLabelMap = JSON.stringify({ 1: { code: 'CORONARY_TREE', name: tReport('coronaryTree') } })
  const descriptionLabel = (value, source = current?.source) => typeof value === 'string'
    ? (isApi && source === 'upload' ? dicomLabel(value) : value)
    : serverText(value)

  React.useEffect(() => {
    if (current?.status === 'needs_series_selection' && !selectedSeries) {
      setSelectedSeries(study.series?.[0]?.id || '')
    }
  }, [current?.status, study?.series, selectedSeries])

  React.useEffect(() => {
    if (isApi && current?.id) {
      loadAudit().catch(() => {})
    }
  }, [isApi, current?.id, loadAudit])

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    if (!isApi) {
      notify?.(t('workbench.offlineUpload'))
      return
    }
    try {
      const response = await upload(files)
      notify?.(t('workbench.uploadDone'))
      if (response?.study?.study?.status === 'needs_series_selection') {
        notify?.(t('workbench.multiSeries'))
      }
    } catch (err) {
      setError(errorDetail(err))
    }
  }

  const handlePublicImport = async () => {
    if (!isApi || !publicImage || !publicLabels) return
    try {
      await importPublic(publicImage, publicLabels, publicDataset || 'public_dataset', publicLabelMap)
      notify?.(tReport('publicImported'))
    } catch (err) {
      setError(errorDetail(err))
    }
  }

  const startSelectedSeries = async () => {
    if (!selectedSeries) return
    try {
      await chooseSeries(selectedSeries)
      notify?.(t('workbench.seriesChosen'))
    } catch (err) {
      setError(errorDetail(err))
    }
  }

  return (
    <div className="module-view workbench-view">
      <ViewHeader
        index="00"
        eyebrow="STUDY WORKBENCH"
        title={t('workbench.title')}
        titleSuffix="DICOM → 3D → AI → REPORT"
        description={tReport('workbenchDescription')}
        meta={
          <>
            <span>{isApi ? 'API ONLINE' : 'OFFLINE DEMO'}</span>
            <i />
            <span>{t('workbench.prototype')}</span>
            <i />
            <span>{t('workbench.notClinical')}</span>
          </>
        }
        actions={
          <>
            <Badge tone={isApi ? 'teal' : 'neutral'} dot>{isApi ? t('workbench.apiOnline') : t('workbench.offlineDemo')}</Badge>
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={() => Promise.all([refreshStudies(), refreshCurrent()]).catch((err) => setError(errorDetail(err)))}
            >
              {t('workbench.refresh')}
            </Button>
          </>
        }
      />

      <div className="module-body workbench-body">
        <div className="workbench-main">
          {isApi ? <RuntimeCapabilities /> : null}
          <div
            className={`upload-zone ${dragging ? 'dragging' : ''} ${!isApi ? 'disabled' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              if (isApi) setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              if (isApi) handleFiles(event.dataTransfer.files)
            }}
            onClick={() => isApi && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && isApi) fileInputRef.current?.click()
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".zip,.dcm,application/dicom,application/zip"
              hidden
              onChange={(event) => handleFiles(event.target.files)}
            />
            <CloudUpload size={26} strokeWidth={1.5} />
            <b>{isApi ? t('workbench.drop') : t('workbench.dropOffline')}</b>
            <span>
              {isApi
                ? t('workbench.dropHint')
                : t('workbench.dropHintOffline')}
            </span>
            {uploading ? (
              <div className="upload-progress">
                <i style={{ width: `${uploadProgress}%` }} />
                <em>{uploadProgress}%</em>
              </div>
            ) : null}
          </div>

          {isApi ? (
            <div className="workbench-actions">
              <Button variant="primary" size="sm" icon={<Sparkles size={14} />} disabled={uploading} onClick={async () => {
                try {
                  await createServerDemoStudy()
                  notify?.(t('workbench.generated'))
                } catch (err) {
                  setError(errorDetail(err))
                }
              }}>
                {uploading ? t('workbench.generating') : t('workbench.generate')}
              </Button>
              <span className="workbench-hint">
                {t('workbench.generateHint')}
              </span>
            </div>
          ) : null}

          <Section title={tReport('publicTitle')} code="PUBLIC DATASET" right={<Database size={13} />}>
            <div className="public-import-grid">
              <label className="public-file">
                <span>{tReport('publicImage')}</span>
                <input type="file" accept=".nii,.nii.gz" onChange={(event) => setPublicImage(event.target.files?.[0] || null)} />
                <b>{publicImage?.name || tReport('notSelected')}</b>
              </label>
              <label className="public-file">
                <span>{tReport('publicLabels')}</span>
                <input type="file" accept=".nii,.nii.gz" onChange={(event) => setPublicLabels(event.target.files?.[0] || null)} />
                <b>{publicLabels?.name || tReport('notSelected')}</b>
              </label>
            </div>
            <div className="public-import-row">
              <label>
                {tReport('dataset')}
                <input value={publicDataset} onChange={(event) => setPublicDataset(event.target.value)} placeholder="ImageCAS / ASOCA" />
              </label>
              <label>
                {tReport('labelMap')}
                <input value={publicLabelMap} onChange={(event) => setPublicLabelMap(event.target.value)} placeholder={coronaryLabelMap} />
              </label>
            </div>
            <div className="workbench-actions">
              <Button size="sm" onClick={() => setPublicLabelMap(coronaryLabelMap)}>
                {tReport('coronaryPreset')}
              </Button>
              <span className="workbench-hint">{tReport('coronaryHint')}</span>
            </div>
            <div className="workbench-actions">
              <Button
                variant="primary"
                size="sm"
                icon={<CloudUpload size={14} />}
                disabled={!isApi || uploading || !publicImage || !publicLabels}
                onClick={handlePublicImport}
              >
                {uploading ? tReport('publicImporting') : tReport('publicImport')}
              </Button>
              <span className="workbench-hint">
                {tReport('publicHint')}
              </span>
            </div>
          </Section>

          {error ? (
            <div className="workbench-error"><CircleAlert size={14} /> {serverText(error)}</div>
          ) : null}

          <Section title={t('workbench.studies')} code="STUDIES" right={<Database size={13} />}>
            {loading ? (
              <div className="wb-empty-line">{t('workbench.loadingStudies')}</div>
            ) : studies.length === 0 ? (
              <div className="wb-empty-line">
                <FileStack size={14} /> {t('workbench.emptyStudies')}
              </div>
            ) : (
              <div className="study-list">
                {studies.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`study-card ${study?.study?.id === item.id ? 'active' : ''}`}
                    onClick={() => selectStudy(item.id)}
                  >
                    <div className="study-card-avatar">
                      {(item.subject?.pseudonym || '?').slice(0, 1)}
                    </div>
                    <div className="study-card-copy">
                      <b>{item.subject?.pseudonym || t('common.unnamed')}</b>
                      <small>
                        {item.studyDate || '—'} · {descriptionLabel(item.description, item.source) || item.modality}
                      </small>
                      <span>
                        <Badge tone={STATUS_TONE[item.status] || 'neutral'}>
                          {enumLabel('status', item.status)}
                        </Badge>
                        {item.source === 'demo' ? <Badge>{t('workbench.demoBadge')}</Badge> : null}
                        {item.source === 'upload' ? <Badge>UPLOAD</Badge> : null}
                      </span>
                    </div>
                    <FolderOpen size={15} />
                  </button>
                ))}
              </div>
            )}
          </Section>

          {current ? (
            <Section title={t('workbench.pipeline')} code="PIPELINE" right={<Activity size={13} />}>
              <ProgressTimeline job={latestJob} />
              {current.status === 'needs_series_selection' ? (
                <div className="series-select">
                  <Divider label={t('workbench.chooseSeries')} />
                  {study.series.map((item) => (
                    <label key={item.id} className={`series-option ${selectedSeries === item.id ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="series"
                        value={item.id}
                        checked={selectedSeries === item.id}
                        onChange={() => setSelectedSeries(item.id)}
                      />
                      <span>
                        <b>{descriptionLabel(item.description) || `Series ${item.number ?? ''}`}</b>
                        {Array.isArray(item.reasons) && item.reasons.length ? <small>{item.reasons.map((reason) => serverText(reason)).join(' · ')}</small> : null}
                        <small>
                          {t('workbench.seriesMeta', { modality: item.modality, slices: t('common.slices', { count: item.sliceCount }), thickness: item.sliceThickness ?? '—', score: item.candidateScore })}
                        </small>
                      </span>
                    </label>
                  ))}
                  <Button variant="primary" size="sm" onClick={startSelectedSeries} disabled={!selectedSeries}>
                    {t('workbench.startRebuild')}
                  </Button>
                </div>
              ) : null}
            </Section>
          ) : null}
        </div>

        <aside className="inspector workbench-inspector">
          <div className="selection-hero workbench-hero">
            <div className="selection-eyebrow">
              <span>RESEARCH WORKFLOW</span>
              <span className="selection-id">{mode?.toUpperCase()}</span>
            </div>
            <div className="selection-title">
              <span className="structure-swatch swatch-great" />
              <div>
                <h2>{current?.subject?.pseudonym || t('topbar.noStudy')}</h2>
                <small>{descriptionLabel(current?.description) || t('workbench.heroEmpty')}</small>
              </div>
            </div>
            <p>
              {isApi
                ? t('workbench.heroApi')
                : t('workbench.heroDemo')}
            </p>
            <div className="selection-stats">
              <div className="stat">
                <span>{t('workbench.studyStatus')}</span>
                <strong>{enumLabel('status', current?.status) || '—'}</strong>
                <em>{current?.source === 'demo' ? t('workbench.sourceFixture') : current?.source === 'public_dataset' ? tReport('niftiLabels') : 'DICOM'}</em>
              </div>
              <div className="stat">
                <span>{t('workbench.measurementCount')}</span>
                <strong>{study?.measurements?.length || 0}</strong>
                <em>{t('workbench.includesNotComputed')}</em>
              </div>
              <div className="stat">
                <span>{t('workbench.meshCount')}</span>
                <strong>{study?.meshes?.length || 0}</strong>
                <em>GLB nodes</em>
              </div>
            </div>
          </div>

          {current ? (
            <Section title={t('workbench.studyInfo')} code="STUDY" right={<ShieldCheck size={13} />}>
              <div className="scan-params">
                <div><span>{t('workbench.accession')}</span><b>{current.studyUid?.slice(-12) || current.id}</b></div>
                <div><span>{t('workbench.date')}</span><b>{current.studyDate || '—'}</b></div>
                <div><span>{t('workbench.modality')}</span><b>{current.modality}</b></div>
                <div><span>{t('report.colSource')}</span><b>{current.source}</b></div>
                <div><span>{t('workbench.series')}</span><b>{study.series?.length || 0}</b></div>
                <div><span>{t('workbench.model')}</span><b>{study.segmentations?.[0]?.modelId || t('workbench.modelNotRun')}</b></div>
              </div>
              <div className="workbench-open-actions">
                <Button size="sm" icon={<ScanLine size={14} />} onClick={() => onNavigate?.('cta')} disabled={uploading || !study?.volumes?.length}>
                  {t('workbench.viewCt')}
                </Button>
                <Button size="sm" icon={<FolderOpen size={14} />} onClick={() => onNavigate?.('anatomy')} disabled={uploading || !study?.meshes?.length}>
                  {t('workbench.view3d')}
                </Button>
                <Button size="sm" icon={<FileStack size={14} />} onClick={() => onNavigate?.('analysis')} disabled={uploading || !study?.measurements?.length}>
                  {t('workbench.viewAnalysis')}
                </Button>
              </div>
            </Section>
          ) : null}

          <Section title={tReport('readiness')} code="READINESS" right={<CircleAlert size={13} />}>
            <ul className="scope-list readiness-list">
              <li className="ok"><CheckCircle2 size={13} /> {tReport('readyDicom')}</li>
              <li className="ok"><CheckCircle2 size={13} /> {tReport('readyMeshes')}</li>
              <li className="ok"><CheckCircle2 size={13} /> {tReport('readyAtlas')}</li>
              <li className="warn"><CircleAlert size={13} /> {tReport('atlasLimit')}</li>
              <li className="warn"><CircleAlert size={13} /> {tReport('modelLimit')}</li>
              <li className="stop"><CircleAlert size={13} /> {tReport('metricsLimit')}</li>
              <li className="stop"><CircleAlert size={13} /> {tReport('navigationLimit')}</li>
              <li className="stop"><CircleAlert size={13} /> {tReport('clinicalLimit')}</li>
            </ul>
          </Section>

          {audit?.items?.length ? (
            <Section title={t('workbench.audit')} code="AUDIT" right={<ShieldCheck size={13} />}>
              <div className="audit-list">
                {audit.items.slice(-6).reverse().map((item) => (
                  <div key={item.id}>
                    <b>{item.action}</b>
                    <small>{item.actor} · {new Date(item.at).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en')}</small>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
