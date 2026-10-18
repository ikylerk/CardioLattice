import { requestLang, serverText, t } from '../i18n.js'

const API_BASE = '/api'

// Report drafts are generated inside the pipeline. Those requests carry `lang`
// (`en` or `zh`). Other requests do not send a language header or parameter.
function withLang(path) {
  const join = path.includes('?') ? '&' : '?'
  return `${path}${join}lang=${encodeURIComponent(requestLang())}`
}

function failResponse(body, status) {
  const detail = body?.detail ?? body?.message ?? null
  const err = new Error(detail == null ? `HTTP ${status}` : serverText(detail))
  err.detail = detail == null ? `HTTP ${status}` : detail
  err.status = status
  return err
}

async function parseResponse(response) {
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { detail: text }
  }
  if (!response.ok) throw failResponse(body, response.status)
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
  return apiPost(withLang('/studies/demo'))
}

export async function selectSeries(studyId, seriesId) {
  return apiPost(withLang(`/studies/${studyId}/select-series`), { seriesId })
}

export async function rerunPipeline(studyId) {
  return apiPost(withLang(`/studies/${studyId}/pipeline`))
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

export async function importPublicCase(image, labels, dataset, labelMap = '') {
  const form = new FormData()
  form.append('image', image)
  form.append('labels', labels)
  form.append('dataset', dataset || 'public_dataset')
  form.append('label_map', labelMap || '')
  const response = await fetch(`${API_BASE}/public/import`, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  })
  return parseResponse(response)
}

export function uploadStudies(files, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    for (const file of files) form.append('files', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}${withLang('/studies')}`)
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
      else if (body?.detail != null || body?.message != null) reject(failResponse(body, xhr.status))
      else reject(new Error(t('api.uploadFailed', { status: xhr.status })))
    }
    xhr.onerror = () => reject(new Error(t('api.networkError')))
    xhr.send(form)
  })
}

export async function getVolumeData(volume) {
  if (!volume?.dataUrl) throw new Error(t('api.noVolumeUrl'))
  const response = await fetch(volume.dataUrl, { credentials: 'same-origin' })
  if (!response.ok) throw new Error(t('api.volumeDownloadFailed', { status: response.status }))
  return new Uint8Array(await response.arrayBuffer())
}

export function subscribeStudyEvents(studyId, { onProgress, onDone, onError } = {}) {
  const controller = new AbortController()
  ;(async () => {
    try {
      const response = await fetch(`${API_BASE}/studies/${studyId}/events`, {
        credentials: 'same-origin',
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        onError?.()
        return
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() || ''
        for (const chunk of chunks) {
          let eventName = 'message'
          const dataLines = []
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim()
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
          }
          let payload = null
          try {
            payload = dataLines.length ? JSON.parse(dataLines.join('\n')) : null
          } catch {
            payload = null
          }
          if (eventName === 'progress') onProgress?.(payload)
          else if (eventName === 'done') onDone?.(payload)
        }
      }
    } catch (err) {
      if (err?.name !== 'AbortError') onError?.()
    }
  })()
  return () => controller.abort()
}
