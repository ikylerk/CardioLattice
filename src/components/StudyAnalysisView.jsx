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

function MeasurementCard({ item }) {
  const computed = item.status === 'computed' && item.value !== null && item.value !== undefined
  return (
    <div className={`analysis-metric ${computed ? '' : 'not-computed'}`}>
      <span>{item.label}</span>
      <strong>
        {computed ? item.value : '—'}
        {computed && item.unit ? <small>{item.unit}</small> : null}
      </strong>
      <em>{computed ? `${item.method} · ${item.validationStatus}` : '未计算'}</em>
      {!computed && item.reason ? <p>{item.reason}</p> : null}
    </div>
  )
}

export default function StudyAnalysisView({ onNavigate }) {
  const { study, measurements } = useStudy()
  const computed = measurements.filter((item) => item.status === 'computed' && item.value !== null)
  const notComputed = measurements.filter((item) => item.status !== 'computed')
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
                  <b>M3 里程碑</b>
                  <span>既往检查配准与 delta 分析尚未实现；不会以「预测」名义展示无数据支撑的结论。</span>
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
