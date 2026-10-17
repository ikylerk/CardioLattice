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
  Upload,
} from 'lucide-react'
import ViewHeader from './ViewHeader.jsx'
import { Badge, Button, Divider, Section } from './ui.jsx'
import { useStudy } from '../study/StudyContext.jsx'

const STATUS_LABEL = {
  uploaded: '已上传',
  needs_series_selection: '待选择序列',
  queued: '排队中',
  processing: '处理中',
  ready: '就绪',
  failed: '失败',
  running: '处理中',
  succeeded: '完成',
  canceled: '已取消',
}

const STATUS_TONE = {
  ready: 'teal',
  processing: 'amber',
  queued: 'amber',
  failed: 'red',
  needs_series_selection: 'amber',
}

function ProgressTimeline({ job }) {
  if (!job) {
    return (
      <div className="wb-empty-line">
        <CircleAlert size={13} /> 尚未启动处理流水线
      </div>
    )
  }
  const stages = [
    ['validating', '校验'],
    ['anonymizing', '去标识'],
    ['building_volume', '体数据'],
    ['segmenting', '分割'],
    ['meshing', '3D 建模'],
    ['computing_metrics', '测量'],
    ['drafting_report', '报告草稿'],
  ]
  const currentIndex = stages.findIndex(([key]) => key === job.stage)
  return (
    <div className="wb-progress">
      <div className="wb-progress-head">
        <span>{STATUS_LABEL[job.state] || job.state}</span>
        <b>{job.progress}%</b>
      </div>
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
      {job.error ? <p className="wb-error">{job.error}</p> : null}
    </div>
  )
}

export default function StudyWorkbench({ onNavigate, notify }) {
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
    chooseSeries,
    refreshCurrent,
    loadAudit,
    setError,
  } = useStudy()
  const [dragging, setDragging] = React.useState(false)
  const [selectedSeries, setSelectedSeries] = React.useState('')
  const fileInputRef = React.useRef(null)

  const latestJob = study?.jobs?.length ? study.jobs[study.jobs.length - 1] : null
  const current = study?.study

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
      notify?.('离线演示模式不能上传；请先启动本地 API 服务')
      return
    }
    try {
      const response = await upload(files)
      notify?.('上传完成，已进入处理流水线')
      if (response?.study?.study?.status === 'needs_series_selection') {
        notify?.('检测到多个候选序列，请人工选择')
      }
    } catch (err) {
      setError(err.message || String(err))
    }
  }

  const startSelectedSeries = async () => {
    if (!selectedSeries) return
    try {
      await chooseSeries(selectedSeries)
      notify?.('已选择序列，开始重建')
    } catch (err) {
      setError(err.message || String(err))
    }
  }

  return (
    <div className="module-view workbench-view">
      <ViewHeader
        index="00"
        eyebrow="STUDY WORKBENCH"
        title="检查工作台"
        titleSuffix="DICOM → 3D → AI → REPORT"
        description="上传原始 CCTA DICOM，服务端完成去标识、体数据重建、分割建模与结构化报告草稿。"
        meta={
          <>
            <span>{isApi ? 'API ONLINE' : 'OFFLINE DEMO'}</span>
            <i />
            <span>研究原型</span>
            <i />
            <span>非临床诊断依据</span>
          </>
        }
        actions={
          <>
            <Badge tone={isApi ? 'teal' : 'neutral'} dot>{isApi ? '服务端已连接' : '离线演示'}</Badge>
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={() => refreshCurrent().catch((err) => setError(err.message))}
            >
              刷新
            </Button>
          </>
        }
      />

      <div className="module-body workbench-body">
        <div className="workbench-main">
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
            <b>{isApi ? '拖入 DICOM 压缩包或文件夹' : '离线模式：上传需要启动 API 服务'}</b>
            <span>
              {isApi
                ? '支持 .zip 或多文件选择；单个 CCTA 序列通常 200–600 MB。原始 DICOM 不通过 API 暴露。'
                : '运行 npm run server:dev 后刷新页面，即可启用上传与真实重建流水线。'}
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
                  notify?.('已生成合成 DICOM 检查并开始重建')
                } catch (err) {
                  setError(err.message || String(err))
                }
              }}>
                {uploading ? '正在生成…' : '生成合成 CCTA 检查'}
              </Button>
              <span className="workbench-hint">
                合成检查会走真实 DICOM → 体数据 → 分割 → 网格链路，但所有测量标注为 synthetic。
              </span>
            </div>
          ) : null}

          {error ? (
            <div className="workbench-error"><CircleAlert size={14} /> {error}</div>
          ) : null}

          <Section title="检查列表" code="STUDIES" right={<Database size={13} />}>
            {loading ? (
              <div className="wb-empty-line">正在载入检查…</div>
            ) : studies.length === 0 ? (
              <div className="wb-empty-line">
                <FileStack size={14} /> 尚无检查。上传 DICOM 或生成一个合成检查。
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
                      <b>{item.subject?.pseudonym || '未命名'}</b>
                      <small>
                        {item.studyDate || '—'} · {item.description || item.modality}
                      </small>
                      <span>
                        <Badge tone={STATUS_TONE[item.status] || 'neutral'}>
                          {STATUS_LABEL[item.status] || item.status}
                        </Badge>
                        {item.source === 'demo' ? <Badge>DEMO · 合成</Badge> : null}
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
            <Section title="处理流水线" code="PIPELINE" right={<Activity size={13} />}>
              <ProgressTimeline job={latestJob} />
              {current.status === 'needs_series_selection' ? (
                <div className="series-select">
                  <Divider label="检测到多个候选序列，请选择 CCTA" />
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
                        <b>{item.description || `Series ${item.number ?? ''}`}</b>
                        <small>
                          {item.modality} · {item.sliceCount} 层 · {item.sliceThickness ?? '—'} mm · 评分 {item.candidateScore}
                        </small>
                      </span>
                    </label>
                  ))}
                  <Button variant="primary" size="sm" onClick={startSelectedSeries} disabled={!selectedSeries}>
                    开始重建
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
                <h2>{current?.subject?.pseudonym || '未选择检查'}</h2>
                <small>{current?.description || 'Upload a CCTA series to begin'}</small>
              </div>
            </div>
            <p>
              {isApi
                ? '本原型只输出可追溯的确定性测量与结构化报告草稿；未计算的狭窄、FFR-CT、EF 不会以数字形式出现。'
                : '当前为离线演示病例。所有数值均为合成数据，仅用于产品界面展示。'}
            </p>
            <div className="selection-stats">
              <div className="stat">
                <span>检查状态</span>
                <strong>{STATUS_LABEL[current?.status] || '—'}</strong>
                <em>{current?.source === 'demo' ? '合成夹具' : 'DICOM'}</em>
              </div>
              <div className="stat">
                <span>测量项</span>
                <strong>{study?.measurements?.length || 0}</strong>
                <em>含 not_computed</em>
              </div>
              <div className="stat">
                <span>3D 结构</span>
                <strong>{study?.meshes?.length || 0}</strong>
                <em>GLB nodes</em>
              </div>
            </div>
          </div>

          {current ? (
            <Section title="检查信息" code="STUDY" right={<ShieldCheck size={13} />}>
              <div className="scan-params">
                <div><span>检查号</span><b>{current.studyUid?.slice(-12) || current.id}</b></div>
                <div><span>日期</span><b>{current.studyDate || '—'}</b></div>
                <div><span>模态</span><b>{current.modality}</b></div>
                <div><span>来源</span><b>{current.source}</b></div>
                <div><span>序列</span><b>{study.series?.length || 0}</b></div>
                <div><span>模型</span><b>{study.segmentations?.[0]?.modelId || '未运行'}</b></div>
              </div>
              <div className="workbench-open-actions">
                <Button size="sm" icon={<ScanLine size={14} />} onClick={() => onNavigate?.('cta')} disabled={uploading || !study?.volumes?.length}>
                  查看 CT
                </Button>
                <Button size="sm" icon={<FolderOpen size={14} />} onClick={() => onNavigate?.('anatomy')} disabled={uploading || !study?.meshes?.length}>
                  查看 3D
                </Button>
                <Button size="sm" icon={<FileStack size={14} />} onClick={() => onNavigate?.('analysis')} disabled={uploading || !study?.measurements?.length}>
                  定量分析
                </Button>
              </div>
            </Section>
          ) : null}

          <Section title="能力边界" code="SCOPE" right={<CircleAlert size={13} />}>
            <ul className="scope-list">
              <li><CheckCircle2 size={13} /> 真实 DICOM 解析、去标识、体数据重建、MPR/VRT</li>
              <li><CheckCircle2 size={13} /> 分割掩膜 → marching cubes → GLB</li>
              <li><CheckCircle2 size={13} /> 体素级腔室容积（标注来源与验证状态）</li>
              <li><CircleAlert size={13} /> 冠脉狭窄、FFR-CT、单时相 EF：未接入验证模型，显示为 not_computed</li>
              <li><CircleAlert size={13} /> 非医疗器械，不用于临床诊断或治疗决策</li>
            </ul>
          </Section>

          {audit?.items?.length ? (
            <Section title="审计记录" code="AUDIT" right={<ShieldCheck size={13} />}>
              <div className="audit-list">
                {audit.items.slice(-6).reverse().map((item) => (
                  <div key={item.id}>
                    <b>{item.action}</b>
                    <small>{item.actor} · {new Date(item.at).toLocaleTimeString()}</small>
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
