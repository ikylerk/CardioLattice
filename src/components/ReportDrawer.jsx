import React from 'react'
import { Copy, Download, Printer, Sparkles, X } from 'lucide-react'
import Brand from './Brand.jsx'
import StructuredReport from './report/StructuredReport.jsx'
import { useStudy } from '../study/StudyContext.jsx'

function MiniVrt() {
  return (
    <svg viewBox="0 0 150 92" className="report-thumb-svg">
      <rect width="150" height="92" fill="#071014" />
      {[18, 32, 46, 60, 74].map((y, index) => (
        <path key={y} d={`M10 ${y} C38 ${y - 8}, 48 ${y + 9}, 72 ${y + 2} S118 ${y - 4}, 142 ${y + 3}`} fill="none" stroke="rgba(204, 212, 191, .24)" strokeWidth="1" />
      ))}
      <path d="M72 20c10-12 31-6 30 11-1 15-17 26-28 38-3 4-7 3-9-1-8-13-26-23-26-39 0-17 20-22 33-9z" fill="rgba(171, 63, 55, .65)" stroke="rgba(224, 128, 112, .6)" />
      <path d="M74 21v46M58 38c10 4 17 3 26-2M90 33c-4 15-2 24 3 32" fill="none" stroke="rgba(242, 189, 114, .7)" strokeWidth="1.2" />
      <text x="7" y="87" fill="rgba(142, 165, 159, .5)" fontSize="4.6" fontFamily="SFMono-Regular, Menlo, monospace">CARDIAC VRT · 3D</text>
    </svg>
  )
}

function MiniQca() {
  return (
    <svg viewBox="0 0 150 92" className="report-thumb-svg">
      <rect width="150" height="92" fill="#101312" />
      <path d="M54 18c-3 16-11 24-11 38 0 8 7 13 12 19M74 18c-4 18-8 25-9 36-1 8 3 14 4 21M92 24c-3 12-7 18-6 28 0 6 4 10 4 16" fill="none" stroke="rgba(220, 222, 209, .62)" strokeWidth="3" strokeLinecap="round" />
      <path d="M50 48c8-1 14 1 20 1M22 58c15-5 27-6 46-5" fill="none" stroke="rgba(217, 218, 206, .45)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="72" cy="49" r="8" fill="none" stroke="#d9a368" strokeWidth="1" strokeDasharray="2 2" />
      <text x="84" y="46" fill="#d9a368" fontSize="5" fontFamily="SFMono-Regular, Menlo, monospace">70% DS</text>
      <text x="7" y="87" fill="rgba(142, 165, 159, .5)" fontSize="4.6" fontFamily="SFMono-Regular, Menlo, monospace">QCA · LAD MID</text>
    </svg>
  )
}

function MiniAha() {
  return (
    <svg viewBox="0 0 150 92" className="report-thumb-svg">
      <rect width="150" height="92" fill="#0b1415" />
      <g transform="translate(75 45)">
        <circle r="32" fill="none" stroke="rgba(65, 101, 104, .5)" />
        <path d="M0-32 A32 32 0 0 1 27.7-16 L21-12 A24 24 0 0 0 0-24Z" fill="rgba(165, 70, 62, .8)" />
        <path d="M-27.7-16 A32 32 0 0 0-32 0 L-24 0 A24 24 0 0 1-20.8-12Z" fill="rgba(148, 111, 57, .7)" />
        <path d="M32 0 A32 32 0 0 1 16 27.7 L12 21 A24 24 0 0 0 24 0Z" fill="rgba(45, 94, 90, .75)" />
        <path d="M0-24 A24 24 0 0 1 20.8-12 L14-8 A16 16 0 0 0 0-16Z" fill="rgba(177, 78, 67, .7)" />
        <circle r="8" fill="none" stroke="rgba(85, 128, 126, .8)" />
      </g>
      <text x="7" y="87" fill="rgba(142, 165, 159, .5)" fontSize="4.6" fontFamily="SFMono-Regular, Menlo, monospace">AHA 17 · PERFUSION</text>
    </svg>
  )
}

function MiniEcho() {
  return (
    <svg viewBox="0 0 150 92" className="report-thumb-svg">
      <rect width="150" height="92" fill="#030505" />
      <path d="M75 8 L30 82 Q75 92 120 82 Z" fill="rgba(40, 40, 34, .9)" stroke="rgba(134, 146, 130, .25)" />
      <path d="M76 20c-4 16-12 25-11 38 0 8 7 13 12 16 6-4 12-9 12-17 0-13-8-22-13-37z" fill="rgba(9, 10, 8, .9)" stroke="rgba(176, 180, 158, .5)" />
      <path d="M68 50c8-2 15-2 22 0" stroke="rgba(210, 213, 195, .4)" />
      <path d="M71 55c4 12 5 17 7 22 3-7 4-13 8-21" fill="url(#echoGrad)" opacity=".7" />
      <defs>
        <linearGradient id="echoGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e59c4d" />
          <stop offset="1" stopColor="#356db1" />
        </linearGradient>
      </defs>
      <text x="7" y="87" fill="rgba(142, 165, 159, .5)" fontSize="4.6" fontFamily="SFMono-Regular, Menlo, monospace">ECHO · A4C COLOR</text>
    </svg>
  )
}

export default function ReportDrawer({ open, onClose, notify }) {
  const { study, isApi, isDemo, reports, approve, generateAiDraft, refreshCurrent } = useStudy()
  const [approveBusy, setApproveBusy] = React.useState(false)
  const [aiBusy, setAiBusy] = React.useState(false)
  if (!open) return null

  const report = reports?.[0] || null
  const structured = isApi
  const subject = study?.study?.subject
  const content = report?.content

  const copySummary = async () => {
    const summary = structured && content
      ? `CardioScope Pro｜结构化影像报告（研究原型）
受试者：${content.subject?.pseudonym || '—'} ${content.subject?.sex || ''} ${content.subject?.age_years ?? ''}
检查：${content.study?.description || '—'}
生成方式：${report.generator}${report.model ? ` · ${report.model}` : ''} · 状态：${report.status}
${(content.sections || []).map((section) => `${section.title}：${(section.claims || []).map((claim) => claim.text).join(' ')}`).join('\n')}
（研究原型，非临床诊断依据。）`
      : `CardioScope Pro｜合成演示报告
患者：陈立群 男 58 岁（合成演示）
检查：CCTA + ICA/QCA + Echocardiography
核心发现：LAD 中段 70% 狭窄，MLD 0.96 mm，RVD 3.20 mm，病变长度 18 mm；FFR-CT 0.78。
左心室 EF 54%，GLS -16.8%；AHA 17 段显示前壁及心尖部可逆性缺血，缺血负荷 12%，存活心肌 91%。
结论：合成演示数据，不构成任何临床结论。
（教学与产品演示用途，非临床诊断。）`
    try {
      await navigator.clipboard.writeText(summary)
      notify('报告摘要已复制到剪贴板')
    } catch (error) {
      notify('当前环境禁止剪贴板访问，请使用打印 / PDF')
    }
  }

  const handleAiDraft = async () => {
    if (!isApi) return
    setAiBusy(true)
    try {
      const report = await generateAiDraft()
      notify(
        report?.generator === 'claude'
          ? 'Claude 草稿已生成，请医生逐条复核'
          : report?.content?.provenance?.fallback_reason || '已使用模板生成草稿，请复核',
      )
    } catch (error) {
      notify(error.message || 'AI 草稿生成失败')
    } finally {
      setAiBusy(false)
    }
  }

  const handleApprove = async () => {
    if (!report) return
    setApproveBusy(true)
    try {
      await approve(report.id, 'local-researcher', {
        baseVersion: report.version, baseContentHash: report.contentHash,
      })
      notify('报告已批准，批准动作已写入审计链')
    } catch (error) {
      notify(error.message || '批准失败')
    } finally {
      setApproveBusy(false)
    }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="report-drawer" aria-label="结构化诊断报告">
        <header className="report-toolbar">
          <div className="report-toolbar-title">
            <span>{structured ? 'STRUCTURED REPORT · RESEARCH' : 'SYNTHETIC DEMO REPORT'}</span>
            <b>{structured ? (subject?.pseudonym ? `${subject.pseudonym} · 结构化报告` : '结构化报告') : '冠状动脉综合影像评估报告'}</b>
          </div>
          <div className="report-toolbar-actions">
            {isApi ? (
              <button type="button" onClick={handleAiDraft} disabled={aiBusy} title="生成 AI 辅助报告草稿">
                <Sparkles size={14} /> {aiBusy ? '生成中…' : 'AI 草稿'}
              </button>
            ) : null}
            <button type="button" onClick={copySummary} title="复制摘要"><Copy size={14} /> 复制</button>
            <button type="button" onClick={() => window.print()} title="打印或导出 PDF"><Printer size={14} /> 打印 / PDF</button>
            <button type="button" className="report-close" onClick={onClose} aria-label="关闭报告"><X size={16} /></button>
          </div>
        </header>

        <div className="report-scroll">
          {structured ? (
            <StructuredReport
              report={report}
              study={study}
              onApprove={handleApprove}
              approveBusy={approveBusy}
              onRefresh={refreshCurrent}
              notify={notify}
            />
          ) : (
          <article className="report-document">
            <div className="report-letterhead">
              <div className="report-brand">
                <Brand compact />
                <span>CARDIOVASCULAR IMAGING CENTER</span>
              </div>
              <div className="report-number">
                <span>REPORT NO.</span>
                <b>CV-2026-0417-01</b>
                <em>SYNTHETIC DEMO · NOT CLINICAL</em>
              </div>
            </div>

            <div className="report-title">
              <span className="report-title-kicker">MULTIMODAL CARDIAC IMAGING</span>
              <h1>冠状动脉综合影像评估报告</h1>
              <p>Coronary CTA · Invasive Coronary Angiography · Transthoracic Echocardiography</p>
            </div>

            <div className="report-patient">
              <div><span>姓名</span><b>陈立群</b></div>
              <div><span>性别 / 年龄</span><b>男 / 58 岁</b></div>
              <div><span>检查号</span><b>CV-2026-0417</b></div>
              <div><span>检查日期</span><b>2026-10-17</b></div>
              <div><span>临床科室</span><b>心血管内科</b></div>
              <div><span>检查项目</span><b>CCTA + ICA + TTE</b></div>
              <div><span>心率</span><b>72 BPM · 窦性</b></div>
              <div><span>对比剂</span><b>320 mgI/mL · 60 mL</b></div>
            </div>

            <section className="report-section">
              <h2><span>01</span> 检查摘要</h2>
              <p>
                本页为程序化合成演示报告，不是真实检查，也不代表任何 AI 分析结果。演示界面中的
                冠脉、QCA、AHA 与超声数值均为预先编写的合成数据，仅用于展示报告排版与交互。
              </p>
              <div className="report-key-findings">
                <div><span>责任病变</span><b>LAD 中段</b><em>70% DS</em></div>
                <div><span>FFR-CT</span><b>0.78</b><em>血流动力学阳性</em></div>
                <div><span>缺血负荷</span><b>12%</b><em>AHA 17 段</em></div>
                <div><span>左室射血分数</span><b>54%</b><em>Simpson 双平面</em></div>
              </div>
            </section>

            <section className="report-section">
              <h2><span>02</span> 影像所见</h2>
              <div className="report-finding">
                <h3>冠状动脉 CTA 与造影</h3>
                <p>
                  冠状动脉右优势型。左主干管腔通畅。左前降支（LAD）中段可见混合性钙化斑块，管腔重度狭窄，
                  参考血管直径 3.20 mm，最小管腔直径 0.96 mm，直径狭窄 70%，面积狭窄 84%，病变长度 18 mm；
                  病变远端 TIMI 3 级血流。左回旋支（LCx）近段可见轻度钙化斑块，约 22% 狭窄。右冠状动脉
                  （RCA）近段可见非阻塞性钙化斑块，约 30% 狭窄。SYNTAX 评分 12。
                </p>
                <div className="report-severity-row">
                  <span className="report-sev severe">LAD 中段 · 重度</span>
                  <span className="report-sev mild">LCx 近段 · 轻度</span>
                  <span className="report-sev mild">RCA 近段 · 轻度</span>
                </div>
              </div>
              <div className="report-finding">
                <h3>心肌与心脏功能</h3>
                <p>
                  左心室舒张末容积 142 mL，收缩末容积 65 mL，每搏量 77 mL，LVEF 54%。二维斑点追踪
                  GLS -16.8%，心尖段及前壁中间段收缩期纵向应变轻度减低。AHA 17 段分析提示前壁及心尖部
                  可逆性灌注缺损，缺血负荷约 12%，存活心肌约 91%。右室收缩功能正常，TAPSE 22 mm，
                  RVSP 28 mmHg。
                </p>
              </div>
              <div className="report-finding">
                <h3>瓣膜与心腔结构</h3>
                <p>
                  二尖瓣微量反流，主动脉瓣三叶、轻度钙化，三尖瓣轻度反流（TR Vmax 2.4 m/s）。左房容积指数
                  正常，右房大小正常，未见心包积液。升主动脉及主动脉弓管径在正常范围。
                </p>
              </div>
            </section>

            <section className="report-section">
              <h2><span>03</span> 影像附件</h2>
              <div className="report-thumb-grid">
                <figure><MiniVrt /><figcaption>3D 心脏 VRT · 冠脉树</figcaption></figure>
                <figure><MiniQca /><figcaption>LAD 中段 QCA · 70% DS</figcaption></figure>
                <figure><MiniAha /><figcaption>AHA 17 段灌注图</figcaption></figure>
                <figure><MiniEcho /><figcaption>心尖四腔 · 彩色多普勒</figcaption></figure>
              </div>
            </section>

            <section className="report-section">
              <h2><span>04</span> 定量测量汇总</h2>
              <table className="report-table">
                <thead>
                  <tr><th>指标</th><th>测量值</th><th>参考 / 判读</th><th>来源</th></tr>
                </thead>
                <tbody>
                  <tr><td>LAD 直径狭窄</td><td>70%</td><td>重度</td><td>QCA</td></tr>
                  <tr><td>最小管腔直径 MLD</td><td>0.96 mm</td><td>&lt; 1.2 mm</td><td>QCA</td></tr>
                  <tr><td>参考血管直径 RVD</td><td>3.20 mm</td><td>—</td><td>QCA</td></tr>
                  <tr><td>FFR-CT</td><td>0.78</td><td>阳性（≤ 0.80）</td><td>AI CCTA</td></tr>
                  <tr><td>钙化积分</td><td>286</td><td>中等钙化</td><td>CCTA</td></tr>
                  <tr><td>LVEF</td><td>54%</td><td>正常下限</td><td>Echo</td></tr>
                  <tr><td>GLS</td><td>-16.8%</td><td>轻度减低</td><td>Echo</td></tr>
                  <tr><td>缺血负荷</td><td>12%</td><td>可逆性缺血</td><td>AHA 17 段</td></tr>
                </tbody>
              </table>
            </section>

            <section className="report-section report-conclusion">
              <h2><span>05</span> 诊断意见</h2>
              <ol>
                <li>左前降支中段重度狭窄（70%），FFR-CT 0.78，解剖学与血流动力学缺血一致；前壁及心尖部可逆性缺血。</li>
                <li>左回旋支近段、右冠状动脉近段轻度非阻塞性病变；右优势型冠脉分布。</li>
                <li>左心室收缩功能处于正常下限，GLS 轻度减低，存活心肌比例良好。</li>
              </ol>
            </section>

            <section className="report-section">
              <h2><span>06</span> 建议</h2>
              <ul className="report-recommendations">
                <li><b>有创 FFR 复核</b>：对 LAD 中段病变行压力导丝测量，目标 FFR ≤ 0.80。</li>
                <li><b>血运重建评估</b>：若 FFR 阳性，建议心脏团队讨论 LAD PCI（虚拟支架 3.0 × 18 mm）与 CABG 风险。</li>
                <li><b>优化药物治疗</b>：高强度他汀、抗血小板、β 受体阻滞剂及危险因素控制。</li>
                <li><b>随访</b>：3 个月临床随访，必要时复查负荷影像或冠脉 CTA。</li>
              </ul>
            </section>

            <div className="report-signatures">
              <div><span>报告医师</span><b>影像科 · 心血管组</b><em>电子签名</em></div>
              <div><span>审核医师</span><b>—</b><em>待审核</em></div>
              <div><span>报告时间</span><b>2026-10-17 10:18</b><em>合成演示 · 未复核</em></div>
            </div>

            <div className="report-disclaimer">
              <Sparkles size={12} />
              <p>
                本报告为 CardioScope Pro 教学与产品演示生成，采用程序化解剖模型与合成影像数据，非真实患者资料，
                不得用于临床诊断、治疗决策或医疗法律用途。3D 解剖表面基于 “Realistic Human Heart” by neshallads，
                依据 CC BY 4.0 使用。
              </p>
            </div>
            <div className="report-pagefoot">
              <span>CardioScope Pro · Cardiovascular Imaging Suite</span>
              <span>PAGE 1 / 1 · CONFIDENTIAL DEMO</span>
            </div>
          </article>
          )}
        </div>
      </aside>
    </>
  )
}
