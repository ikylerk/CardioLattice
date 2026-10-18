import React from 'react'
import {
  approveReport,
  createDemoStudy,
  getAudit,
  getStudy,
  importPublicCase,
  listStudies,
  resolveMode,
  selectSeries,
  uploadStudies,
} from '../api/client.js'
import { createDemoStudy as buildDemoStudy, DEMO_STUDY_ID } from './demoStudy.js'

const StudyContext = React.createContext(null)

export function useStudy() {
  const value = React.useContext(StudyContext)
  if (!value) throw new Error('useStudy must be used inside StudyProvider')
  return value
}

const ACTIVE_STATES = new Set(['queued', 'processing', 'uploaded'])

export function StudyProvider({ children }) {
  const [mode, setMode] = React.useState(null)
  const [studies, setStudies] = React.useState([])
  const [study, setStudy] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [uploading, setUploading] = React.useState(false)
  const [uploadProgress, setUploadProgress] = React.useState(0)
  const [audit, setAudit] = React.useState(null)

  const refreshStudies = React.useCallback(async (activeMode = mode) => {
    if (activeMode !== 'api') return []
    const data = await listStudies()
    setStudies(data.items || [])
    return data.items || []
  }, [mode])

  const loadStudy = React.useCallback(async (studyId) => {
    const bundle = await getStudy(studyId)
    setStudy(bundle)
    setAudit(null)
    return bundle
  }, [])

  const refreshCurrent = React.useCallback(async () => {
    if (mode !== 'api' || !study?.study?.id) return null
    const bundle = await getStudy(study.study.id)
    setStudy(bundle)
    return bundle
  }, [mode, study?.study?.id])

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const resolved = await resolveMode()
        if (cancelled) return
        setMode(resolved)
        if (resolved === 'demo') {
          const demo = buildDemoStudy()
          setStudy(demo)
          setStudies([demo.study])
        } else {
          const items = await listStudies()
          if (cancelled) return
          setStudies(items.items || [])
          const first = (items.items || [])[0]
          if (first) {
            const bundle = await getStudy(first.id)
            if (!cancelled) setStudy(bundle)
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Poll while the active study is being processed. SSE is available too, but
  // polling keeps the UI correct through background-tab and proxy edge cases.
  React.useEffect(() => {
    if (mode !== 'api' || !study) return undefined
    const status = study.study?.status
    if (!ACTIVE_STATES.has(status)) return undefined
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const bundle = await getStudy(study.study.id)
        if (cancelled) return
        setStudy(bundle)
        if (!ACTIVE_STATES.has(bundle.study.status)) {
          await refreshStudies()
        }
      } catch {
        // Keep the last known state; the next tick retries.
      }
    }, 1200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mode, study, refreshStudies])

  const selectStudy = React.useCallback(async (studyId) => {
    setError('')
    setLoading(true)
    try {
      if (studyId === DEMO_STUDY_ID) {
        setStudy(buildDemoStudy())
      } else {
        await loadStudy(studyId)
      }
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [loadStudy])

  const createServerDemoStudy = React.useCallback(async () => {
    setError('')
    setUploading(true)
    setUploadProgress(0)
    setStudy(null)
    try {
      const response = await createDemoStudy()
      setStudy(response.study)
      await refreshStudies()
      return response
    } catch (err) {
      setError(err.message || String(err))
      throw err
    } finally {
      setUploading(false)
    }
  }, [refreshStudies])

  const upload = React.useCallback(async (files) => {
    setError('')
    setUploading(true)
    setUploadProgress(0)
    setStudy(null)
    try {
      const response = await uploadStudies(files, setUploadProgress)
      setStudy(response.study)
      await refreshStudies()
      return response
    } catch (err) {
      setError(err.message || String(err))
      throw err
    } finally {
      setUploading(false)
    }
  }, [refreshStudies])

  const importPublic = React.useCallback(async (image, labels, dataset, labelMap = '') => {
    setError('')
    setUploading(true)
    setStudy(null)
    try {
      const response = await importPublicCase(image, labels, dataset, labelMap)
      setStudy(response.study)
      await refreshStudies()
      return response
    } catch (err) {
      setError(err.message || String(err))
      throw err
    } finally {
      setUploading(false)
    }
  }, [refreshStudies])

  const chooseSeries = React.useCallback(async (seriesId) => {
    if (!study?.study?.id) return null
    setError('')
    try {
      const response = await selectSeries(study.study.id, seriesId)
      setStudy(response.study)
      return response
    } catch (err) {
      setError(err.message || String(err))
      throw err
    }
  }, [study?.study?.id])

  const approve = React.useCallback(async (reportId, approvedBy) => {
    if (!study?.study?.id) return null
    const report = await approveReport(study.study.id, reportId, approvedBy)
    await refreshCurrent()
    return report
  }, [study?.study?.id, refreshCurrent])

  const loadAudit = React.useCallback(async () => {
    if (!study?.study?.id || mode !== 'api') return null
    const result = await getAudit(study.study.id)
    setAudit(result)
    return result
  }, [study?.study?.id, mode])

  const value = React.useMemo(() => ({
    mode,
    loading,
    error,
    studies,
    study,
    selectedVolume: study?.volumes?.[0] || null,
    selectedSeries: study?.series?.find((item) => item.isSelected) || study?.series?.[0] || null,
    measurements: study?.measurements || [],
    reports: study?.reports || [],
    audit,
    uploading,
    uploadProgress,
    isApi: mode === 'api',
    isDemo: mode === 'demo',
    selectStudy,
    refreshStudies,
    refreshCurrent,
    createServerDemoStudy,
    upload,
    importPublic,
    chooseSeries,
    approve,
    loadAudit,
    setError,
  }), [
    mode, loading, error, studies, study, audit, uploading, uploadProgress,
    selectStudy, refreshStudies, refreshCurrent, createServerDemoStudy, upload,
    importPublic, chooseSeries, approve, loadAudit,
  ])

  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>
}
