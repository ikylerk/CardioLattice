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
      <span>{item.label}</span>
      <strong>
        {computed ? item.value : '—'}
        {computed && item.unit ? <small>{item.unit}</small> : null}
      </strong>
      <em>{computed ? `${item.method} · ${item.source || '来源未标注'} · ${item.validationStatus}` : '未计算'}</em>
      {!computed && item.reason ? <p>{item.reason}</p> : null}
    </div>
  )
}

export default function StudyAnalysisView({ onNavigate }) {
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
    ? '候选数尚未完成计算或不是有效的非负整数；标签体积已计算不代表中心线分析成功。'
    : '中心线分析状态或候选明细不一致，不能解读为零候选。'
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
        title="定量分析"
        titleSuffix="TRACEABLE METRICS"
        description="只展示由分割掩膜或已验证模型产生、带方法与来源的测量；未计算项保持为空。"
        meta={
          <>
            <span>{computed.length} 已计算</span>
            <i />
            <span>{notComputed.length} 未计算</span>
            <i />
            <span>{segmentation?.modelId || '无分割模型'}</span>
          </>
        }
        actions={
          <>
            <Badge tone={synthetic ? 'amber' : 'teal'} dot>
              {synthetic ? '含合成测量' : '研究测量'}
            </Badge>
            <Button variant="outline" size="sm" icon={<FolderOpen size={14} />} onClick={() => onNavigate?.('workbench')}>
              检查工作台
            </Button>
          </>
        }
      />

      <div className="module-body analysis-body">
        <div className="analysis-main">
          <div className="analysis-strip">
            <Stat label="可追溯测量" value={computed.length} hint="带 method / source" />
            <Stat label="未计算" value={notComputed.length} accent="amber" hint="不使用演示数值" />
            <Stat label="分割模型" value={segmentation?.modelId || '—'} hint={segmentation?.modelVersion || '未运行'} />
            <Stat label="验证状态" value={synthetic ? 'SYNTHETIC' : segmentation?.provenance?.validation_status || 'RESEARCH'} hint="非临床" />
          </div>

          <Section title="测量结果" code="MEASUREMENTS" right={<BarChart3 size={13} />}>
            {computed.length ? (
              <div className="analysis-metric-grid">
                {computed.map((item) => <MeasurementCard key={item.id} item={item} />)}
              </div>
            ) : (
              <div className="analysis-empty">
                <CircleAlert size={16} />
                <b>尚无已计算测量</b>
                <span>请先在检查工作台运行流水线。未计算项不会以数字形式出现。</span>
              </div>
            )}
          </Section>

          {hasCoronaryInput ? (
            <Section title="冠脉中心线分析（研究）" code="CORONARY MASK ANALYSIS" right={<Activity size={13} />}>
              <div className="analysis-metric-grid">
                {coronary.map((item) => <MeasurementCard key={item.id} item={item} />)}
              </div>
              <p className="analysis-research-note">
                基于冠脉标签掩膜的骨架化、距离变换和半径剖面计算；不是经过验证的 QCA，不能用于临床狭窄分级。
              </p>
              {!coronaryComplete ? (
                <div className="analysis-placeholder">
                  <CircleAlert size={16} />
                  <div>
                    <b>冠脉中心线分析未完成</b>
                    {coronaryFailures.length ? coronaryFailures.map((item, index) => (
                      <p key={item.id || `${item.code}-${index}`}>
                        {item.reason || '该中心线指标未完成计算或数值无效。'}
                        <br />
                        <small>{item.code} · {item.method || '方法未标注'} · {item.source || '来源未标注'}</small>
                      </p>
                    )) : <span>{coronaryIncompleteReason}</span>}
                  </div>
                </div>
              ) : candidateMeasurement.value > 0 ? (
                <div className="coronary-candidate-table">
                  <div className="coronary-candidate-head">
                    <span>候选狭窄（研究）</span>
                    <b>{candidateMeasurement.value} 个</b>
                  </div>
                  {stenosisCandidates.length !== candidateMeasurement.value ? (
                    <p className="analysis-research-note">候选明细未完整返回，不能把缺失明细解释为未检出；请复核原始分析结果。</p>
                  ) : null}
                  <table>
                    <thead>
                      <tr><th>位置 (mm)</th><th>管径</th><th>参考管径</th><th>管径减少</th><th>路径位置</th></tr>
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
                    <b>未检出半径剖面候选</b>
                    <span>本次已完成的主中心线路径分析返回 0 个候选；不代表整棵冠脉树或其他分支不存在病变。</span>
                  </div>
                </div>
              )}
            </Section>
          ) : null}

          <Section title="参考图谱配准" code="ATLAS REGISTRATION" right={<ShieldCheck size={13} />}>
            {registration?.status === 'computed' ? (
              <>
                <div className="analysis-metric-grid">
                  <div className="analysis-metric">
                    <span>配准残差</span>
                    <strong>{registration.value}<small>mm</small></strong>
                    <em>chamber_centroid_umeyama_similarity</em>
                  </div>
                  <div className="analysis-metric">
                    <span>尺度</span>
                    <strong>{registration.provenance?.scale ?? '—'}</strong>
                    <em>reference → patient</em>
                  </div>
                  <div className="analysis-metric">
                    <span>映射靶点</span>
                    <strong>{registrationTargets.length}<small>个</small></strong>
                    <em>参考解剖，不是病灶</em>
                  </div>
                </div>
                <p className="analysis-research-note">
                  基于四心腔质心的 Umeyama 相似配准（尺度 + 旋转 + 平移）；未做外部验证。映射靶点来自参考图谱，不是患者病灶，不能用于诊断或操作导航。
                </p>
                {registrationTargets.length ? (
                  <div className="coronary-candidate-table">
                    <div className="coronary-candidate-head">
                      <span>患者级参考靶点</span>
                      <b>{registrationTargets.length} 个</b>
                    </div>
                    <table>
                      <thead>
                        <tr><th>靶点</th><th>类别</th><th>参考坐标 (mm)</th><th>患者坐标 (mm)</th></tr>
                      </thead>
                      <tbody>
                        {registrationTargets.map((target) => (
                          <tr key={target.id}>
                            <td>{target.name}</td>
                            <td>{target.category}</td>
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
                <b>未完成配准</b>
                <span>{registration.reason || '需要至少 3 个心腔分割标签。'}</span>
              </div>
            ) : (
              <div className="analysis-placeholder">
                <ShieldCheck size={16} />
                <div>
                  <b>尚未运行参考图谱配准</b>
                  <span>运行带心腔标签的分割后，可将参考心腔与靶点映射到患者坐标系。</span>
                </div>
              </div>
            )}
          </Section>

          <Section title="未计算项与原因" code="NOT COMPUTED" right={<CircleAlert size={13} />}>
            <div className="analysis-not-computed">
              {notComputed.length ? notComputed.map((item) => (
                <div key={item.id}>
                  <b>{item.label}</b>
                  <span>{item.reason || '缺少已验证的输入或模型。'}</span>
                </div>
              )) : <div className="wb-empty-line">没有未计算项</div>}
            </div>
          </Section>

          <div className="analysis-grid">
            <Section title="AHA 17 段" code="MYOCARDIAL MAP" right={<Activity size={13} />}>
              <div className="analysis-placeholder">
                <div className="aha-placeholder-ring">
                  {Array.from({ length: 17 }, (_, index) => (
                    <i key={index} style={{ transform: `rotate(${index * (360 / 17)}deg)` }} />
                  ))}
                </div>
                <div>
                  <b>未计算</b>
                  <span>AHA 段灌注与存活心肌需要灌注/代谢数据，不能仅由 CTA 推断。</span>
                </div>
              </div>
            </Section>

            <Section title="FFR-CT 回撤" code="PHYSIOLOGY" right={<Activity size={13} />}>
              <div className="analysis-placeholder">
                <div className="ffr-placeholder">
                  <i /><i /><i /><i /><i /><i />
                </div>
                <div>
                  <b>未计算</b>
                  <span>需要经过验证的 CFD 或血流动力学模型；当前不绘制合成回撤曲线。</span>
                </div>
              </div>
            </Section>

            <Section title="纵向对比" code="LONGITUDINAL" right={<GitCompare size={13} />}>
              <div className="analysis-placeholder">
                <GitCompare size={22} />
                <div>
                  <b>既往检查配准与指标差值</b>
                  <span>需要同一受试者的两次已就绪检查，既往检查日期须有效且严格早于当前。配准质控未通过、测量来源或方法不一致时不显示差值；心腔容积还需一致且明确的采集时相。仅供研究，不预测病情进展。</span>
                  <Button size="sm" variant="outline" icon={<GitCompare size={14} />} onClick={() => onNavigate?.('comparison')}>
                    打开纵向对比
                  </Button>
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
                <h2>{current?.subject?.pseudonym || '未选择检查'}</h2>
                <small>{current?.description || '—'}</small>
              </div>
            </div>
            <p>
              每条测量都绑定分割模型、方法与验证状态。合成夹具的测量明确标记为 synthetic；
              研究模型的输出标记为 research，均需医生复核。
            </p>
          </div>

          <Section title="数据来源" code="PROVENANCE" right={<ShieldCheck size={13} />}>
            <div className="scan-params">
              <div><span>检查来源</span><b>{current?.source || '—'}</b></div>
              <div><span>分割任务</span><b>{segmentation?.task || '—'}</b></div>
              <div><span>模型版本</span><b>{segmentation?.modelVersion || '—'}</b></div>
              <div><span>标签</span><b>{segmentation?.labelMap ? Object.keys(segmentation.labelMap).join(', ') : '—'}</b></div>
              <div><span>测量数量</span><b>{measurements.length}</b></div>
              <div><span>审计</span><b>见工作台</b></div>
            </div>
          </Section>

          <Section title="快捷入口" code="NAVIGATION" right={<FileStack size={13} />}>
            <div className="workbench-open-actions">
              <Button size="sm" onClick={() => onNavigate?.('cta')} disabled={!study?.volumes?.length}>查看 CT</Button>
              <Button size="sm" onClick={() => onNavigate?.('anatomy')} disabled={!study?.meshes?.length}>查看 3D</Button>
              <Button size="sm" onClick={() => onNavigate?.('workbench')}>工作台</Button>
            </div>
          </Section>

          <div className="cta-disclaimer">
            <CircleAlert size={12} />
            研究原型。所有测量与模型输出需医生复核；不用于临床诊断或治疗决策。
          </div>
        </aside>
      </div>
    </div>
  )
}
