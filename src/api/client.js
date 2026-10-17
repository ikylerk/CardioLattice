const API_BASE = '/api'

async function parseResponse(response) {
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { detail: text }
  }
  if (!response.ok) {
    const detail = body?.detail || body?.message || `HTTP ${response.status}`
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return body
}

export async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'same-origin' })
  return parseResponse(response)
}

export async function apiPost(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return parseResponse(response)
}

export async function apiPatch(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseResponse(response)
}

export async function health() {
  return apiGet('/health')
}

export async function resolveMode() {
  const params = new URLSearchParams(window.location.search)
  const explicit = params.get('mode') || import.meta.env.VITE_DATA_MODE
  if (explicit === 'demo' || explicit === 'api') return explicit
  if (window.location.protocol === 'file:') return 'demo'
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    const response = await fetch(`${API_BASE}/health`, {
      credentials: 'same-origin',
      signal: controller.signal,
    })
    clearTimeout(timer)
    return response.ok ? 'api' : 'demo'
  } catch {
    return 'demo'
  }
}

export async function listStudies() {
  return apiGet('/studies')
}

export async function getStudy(studyId) {
  return apiGet(`/studies/${studyId}`)
}

export async function createDemoStudy() {
  return apiPost('/studies/demo')
}

export async function selectSeries(studyId, seriesId) {
  return apiPost(`/studies/${studyId}/select-series`, { seriesId })
}

export async function rerunPipeline(studyId) {
  return apiPost(`/studies/${studyId}/pipeline`)
}

export async function approveReport(studyId, reportId, approvedBy = 'local-researcher') {
  return apiPost(`/studies/${studyId}/reports/${reportId}/approve`, { approvedBy })
}

export async function patchReport(reportId, content) {
  return apiPatch(`/reports/${reportId}`, { content })
}

export async function getAudit(studyId) {
  return apiGet(`/studies/${studyId}/audit`)
}

export function uploadStudies(files, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    for (const file of files) form.append('files', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/studies`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onload = () => {
      let body = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        body = { detail: xhr.responseText }
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body)
      else reject(new Error(body?.detail || `Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Network error while uploading'))
    xhr.send(form)
  })
}

export async function getVolumeData(volume) {
  if (!volume?.dataUrl) throw new Error('volume has no data URL')
  const response = await fetch(volume.dataUrl, { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`Volume download failed (${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}

export function subscribeStudyEvents(studyId, { onProgress, onDone, onError } = {}) {
  if (typeof EventSource === 'undefined') return () => {}
  const source = new EventSource(`${API_BASE}/studies/${studyId}/events`)
  source.addEventListener('progress', (event) => {
    try {
      onProgress?.(JSON.parse(event.data))
    } catch {
      // Ignore malformed event payloads.
    }
  })
  source.addEventListener('done', (event) => {
    source.close()
    try {
      onDone?.(JSON.parse(event.data))
    } catch {
      onDone?.(null)
    }
  })
  source.addEventListener('error', () => {
    onError?.()
  })
  return () => source.close()
}
