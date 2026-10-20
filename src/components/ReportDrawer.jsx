import React from 'react'
import { Copy, Printer, Sparkles, X } from 'lucide-react'
import Brand from './Brand.jsx'
import StructuredReport from './report/StructuredReport.jsx'
import { useStudy } from '../study/StudyContext.jsx'
import { errorDetail, serverText, useI18n } from '../i18n.js'
import { tReport } from '../i18n-report.js'

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
  const { t } = useI18n()
  const { study, isApi, reports, approve, generateAiDraft, refreshCurrent } = useStudy()
  const [approveBusy, setApproveBusy] = React.useState(false)
  const [aiBusy, setAiBusy] = React.useState(false)
  if (!open) return null

  const report = reports?.[0] || null
  const structured = isApi
  const subject = study?.study?.subject
  const content = report?.content

  const copySummary = async () => {
    const sections = (content?.sections || []).map((section) => t('report.sectionJoin', {
      title: section.title,
      text: (section.claims || []).map((claim) => claim.text).join(' '),
    })).join('\n')
    const summary = structured && content
      ? t('report.copyStructured', {
        name: content.subject?.pseudonym || '—',
        sex: content.subject?.sex || '',
        age: content.subject?.age_years ?? '',
        description: typeof content.study?.description === 'string' ? content.study.description : serverText(content.study?.description) || '—',
        generator: report.generator,
        model: report.model ? ` · ${report.model}` : '',
        status: report.status,
        sections,
      })
      : t('report.copyDemo')
    try {
      await navigator.clipboard.writeText(summary)
      notify(t('report.copied'))
    } catch (error) {
      notify(t('report.clipboardBlocked'))
    }
  }

  const handleAiDraft = async () => {
    if (!isApi) return
    setAiBusy(true)
    try {
      const report = await generateAiDraft()
      notify(
        report?.generator === 'claude'
          ? tReport('aiGenerated')
          : serverText(report?.content?.provenance?.fallback_reason) || tReport('aiFallback'),
      )
    } catch (error) {
      notify(serverText(errorDetail(error)) || tReport('aiFailed'))
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
      notify(t('report.approvedToast'))
    } catch (error) {
      notify(serverText(errorDetail(error)) || t('report.approveFailed'))
    } finally {
      setApproveBusy(false)
    }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="report-drawer" aria-label={t('report.drawerAria')}>
        <header className="report-toolbar">
          <div className="report-toolbar-title">
            <span>{structured ? 'STRUCTURED REPORT · RESEARCH' : 'SYNTHETIC DEMO REPORT'}</span>
            <b>{structured ? (subject?.pseudonym ? t('report.structuredNamed', { name: subject.pseudonym }) : t('report.structuredTitle')) : t('report.demoTitle')}</b>
          </div>
          <div className="report-toolbar-actions">
            {isApi ? (
              <button type="button" onClick={handleAiDraft} disabled={aiBusy} title={tReport('aiGenerateTitle')}>
                <Sparkles size={14} /> {aiBusy ? tReport('aiGenerating') : tReport('aiGenerate')}
              </button>
            ) : null}

            <button type="button" onClick={copySummary} title={t('report.copyTitle')}><Copy size={14} /> {t('report.copy')}</button>
            <button type="button" onClick={() => window.print()} title={t('report.printTitle')}><Printer size={14} /> {t('report.print')}</button>
            <button type="button" className="report-close" onClick={onClose} aria-label={t('report.close')}><X size={16} /></button>
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
              <h1>{t('report.demoTitle')}</h1>
              <p>Coronary CTA · Invasive Coronary Angiography · Transthoracic Echocardiography</p>
            </div>

            <div className="report-patient">
              <div><span>{t('report.name')}</span><b>{t('report.nameValue')}</b></div>
              <div><span>{t('report.sexAge')}</span><b>{t('report.sexAgeValue')}</b></div>
              <div><span>{t('workbench.accession')}</span><b>CV-2026-0417</b></div>
              <div><span>{t('report.studyDate')}</span><b>2026-10-17</b></div>
              <div><span>{t('report.dept')}</span><b>{t('report.deptValue')}</b></div>
              <div><span>{t('report.exam')}</span><b>CCTA + ICA + TTE</b></div>
              <div><span>{t('report.rhythm')}</span><b>{t('report.rhythmValue')}</b></div>
              <div><span>{t('cta.contrast')}</span><b>{t('report.contrastValue')}</b></div>
            </div>

            <section className="report-section">
              <h2><span>01</span> {t('report.summary')}</h2>
              <p>{t('report.summaryBody')}</p>
              <div className="report-key-findings">
                <div><span>{t('report.culprit')}</span><b>{t('report.culpritValue')}</b><em>70% DS</em></div>
                <div><span>FFR-CT</span><b>0.78</b><em>{t('report.ffrHint')}</em></div>
                <div><span>{t('report.burden')}</span><b>12%</b><em>{t('report.ahaSource')}</em></div>
                <div><span>{t('report.ef')}</span><b>54%</b><em>{t('report.simpson')}</em></div>
              </div>
            </section>

            <section className="report-section">
              <h2><span>02</span> {t('report.findings')}</h2>
              <div className="report-finding">
                <h3>{t('report.coronaryTitle')}</h3>
                <p>{t('report.coronaryBody')}</p>
                <div className="report-severity-row">
                  <span className="report-sev severe">{t('report.sevLad')}</span>
                  <span className="report-sev mild">{t('report.sevLcx')}</span>
                  <span className="report-sev mild">{t('report.sevRca')}</span>
                </div>
              </div>
              <div className="report-finding">
                <h3>{t('report.functionTitle')}</h3>
                <p>{t('report.functionBody')}</p>
              </div>
              <div className="report-finding">
                <h3>{t('report.valveTitle')}</h3>
                <p>{t('report.valveBody')}</p>
              </div>
            </section>

            <section className="report-section">
              <h2><span>03</span> {t('report.attachments')}</h2>
              <div className="report-thumb-grid">
                <figure><MiniVrt /><figcaption>{t('report.capVrt')}</figcaption></figure>
                <figure><MiniQca /><figcaption>{t('report.capQca')}</figcaption></figure>
                <figure><MiniAha /><figcaption>{t('report.capAha')}</figcaption></figure>
                <figure><MiniEcho /><figcaption>{t('report.capEcho')}</figcaption></figure>
              </div>
            </section>

            <section className="report-section">
              <h2><span>04</span> {t('report.table')}</h2>
              <table className="report-table">
                <thead>
                  <tr><th>{t('report.colMetric')}</th><th>{t('report.colValue')}</th><th>{t('report.colRef')}</th><th>{t('report.colSource')}</th></tr>
                </thead>
                <tbody>
                  <tr><td>{t('report.rowDs')}</td><td>70%</td><td>{t('report.severe')}</td><td>QCA</td></tr>
                  <tr><td>{t('report.rowMld')}</td><td>0.96 mm</td><td>&lt; 1.2 mm</td><td>QCA</td></tr>
                  <tr><td>{t('report.rowRvd')}</td><td>3.20 mm</td><td>—</td><td>QCA</td></tr>
                  <tr><td>{t('report.rowFfr')}</td><td>0.78</td><td>{t('report.positive')}</td><td>AI CCTA</td></tr>
                  <tr><td>{t('report.rowCalcium')}</td><td>286</td><td>{t('report.moderateCalcium')}</td><td>CCTA</td></tr>
                  <tr><td>{t('report.rowEf')}</td><td>54%</td><td>{t('report.lowNormal')}</td><td>Echo</td></tr>
                  <tr><td>{t('report.rowGls')}</td><td>-16.8%</td><td>{t('report.mildlyReduced')}</td><td>Echo</td></tr>
                  <tr><td>{t('report.rowBurden')}</td><td>12%</td><td>{t('report.reversibleIschemia')}</td><td>{t('report.ahaSource')}</td></tr>
                </tbody>
              </table>
            </section>

            <section className="report-section report-conclusion">
              <h2><span>05</span> {t('report.impressionTitle')}</h2>
              <ol>
                <li>{t('report.imp1')}</li>
                <li>{t('report.imp2')}</li>
                <li>{t('report.imp3')}</li>
              </ol>
            </section>

            <section className="report-section">
              <h2><span>06</span> {t('report.recTitle')}</h2>
              <ul className="report-recommendations">
                <li>{t('report.rec1')}</li>
                <li>{t('report.rec2')}</li>
                <li>{t('report.rec3')}</li>
                <li>{t('report.rec4')}</li>
              </ul>
            </section>

            <div className="report-signatures">
              <div><span>{t('report.signReport')}</span><b>{t('report.signReportValue')}</b><em>{t('report.signElectronic')}</em></div>
              <div><span>{t('report.signReview')}</span><b>—</b><em>{t('report.signPending')}</em></div>
              <div><span>{t('report.signTime')}</span><b>2026-10-17 10:18</b><em>{t('report.signDemo')}</em></div>
            </div>

            <div className="report-disclaimer">
              <Sparkles size={12} />
              <p>{t('report.disclaimer')}</p>
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
