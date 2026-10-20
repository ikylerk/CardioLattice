import { apiGet, apiPatch, apiPost } from './client.js'

export async function getReportVersions(reportId) {
  return apiGet(`/reports/${encodeURIComponent(reportId)}/versions`)
}

export async function patchReport(reportId, content, { baseVersion, baseContentHash, actor, reason } = {}) {
  return apiPatch(`/reports/${encodeURIComponent(reportId)}`, {
    content,
    baseVersion,
    baseContentHash,
    actor,
    reason,
  })
}

export async function amendReport(reportId, { content, actor = 'local-researcher', reason, baseVersion, baseContentHash }) {
  return apiPost(`/reports/${encodeURIComponent(reportId)}/amend`, {
    content,
    baseVersion,
    baseContentHash,
    actor,
    reason,
  })
}
