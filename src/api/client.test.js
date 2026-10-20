import test from 'node:test'
import assert from 'node:assert/strict'
import { setLang } from '../i18n.js'
import { approveReport, patchReport, createDemoStudy, generateAiReport, importPublicCase, getStudy } from './client.js'

function captureRequests(context) {
  const calls = []
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, ...options })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  })
  return calls
}

test('report approval and edits transmit the exact reviewed version and hash', async (context) => {
  const calls = captureRequests(context)
  const base = { baseVersion: 7, baseContentHash: 'a'.repeat(64) }
  await approveReport('study', 'report', 'reviewer', base)
  await patchReport('report', { lang: 'zh', sections: [] }, { ...base, reason: 'Review correction' })
  assert.deepEqual(JSON.parse(calls[0].body), { approvedBy: 'reviewer', ...base })
  assert.deepEqual(JSON.parse(calls[1].body), { content: { lang: 'zh', sections: [] }, ...base, reason: 'Review correction' })
})

test('all generation paths send language while reads leave the stored report unchanged', async (context) => {
  const calls = captureRequests(context)
  setLang('zh')
  await createDemoStudy()
  await generateAiReport('study')
  await importPublicCase(new Blob(['image']), new Blob(['labels']), 'synthetic')
  await getStudy('study')
  assert.deepEqual(calls.map((call) => call.url), [
    '/api/studies/demo?lang=zh', '/api/studies/study/ai/report-draft?lang=zh',
    '/api/public/import?lang=zh', '/api/studies/study',
  ])
  setLang('en')
})

test('structured API errors remain available for re-rendering after language changes', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    detail: { code: 'INVALID_LANG', params: { lang: 'fr' } },
  }), { status: 400 }))
  await assert.rejects(getStudy('missing'), (error) => {
    assert.equal(error.status, 400)
    assert.deepEqual(error.detail, { code: 'INVALID_LANG', params: { lang: 'fr' } })
    return true
  })
})
