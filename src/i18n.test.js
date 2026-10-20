import test from 'node:test'
import assert from 'node:assert/strict'
import { getLang, setLang, subscribeLang, serverText, measurementLabel, requestLang, t } from './i18n.js'

test('language selection notifies presentation subscribers and keeps API generation language explicit', () => {
  const changes = []
  const unsubscribe = subscribeLang((language) => changes.push(language))
  setLang('zh')
  assert.equal(getLang(), 'zh')
  assert.equal(requestLang(), 'zh')
  assert.equal(t('nav.comparison'), '纵向对比')
  setLang('en')
  assert.equal(requestLang(), 'en')
  assert.equal(t('nav.comparison'), 'Comparison')
  unsubscribe()
  setLang('zh')
  assert.deepEqual(changes, ['zh', 'en'])
  setLang('en')
})

test('known labels translate, unknown research identifiers and actual failure prose remain traceable', () => {
  setLang('en')
  assert.equal(serverText({ code: 'BRAIN', params: {} }), 'Brain')
  assert.equal(serverText({ code: 'FUTURE_RESEARCH_METRIC', params: {} }), 'FUTURE_RESEARCH_METRIC')
  assert.equal(serverText('Disconnected mask: centerline coverage is insufficient.'), 'Disconnected mask: centerline coverage is insufficient.')
  assert.equal(measurementLabel({ code: 'CORONARY_LENGTH', label: 'Measured native centerline' }), 'Measured native centerline')
  setLang('zh')
  assert.equal(serverText({ code: 'BRAIN', params: {} }), '脑')
  setLang('en')
})


test('reference structure and simulation controls are available in both interface languages', () => {
  setLang('en')
  assert.notEqual(t('organ.targetSimulation'), 'organ.targetSimulation')
  assert.ok(!/[\u4e00-\u9fff]/.test(t('organ.detailDescription')))
  setLang('zh')
  assert.match(t('organ.targetSimulation'), /靶点/)
  setLang('en')
})
