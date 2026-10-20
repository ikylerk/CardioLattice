// Demo study adapter. All values are synthetic and are labelled as such in the
// UI. Display strings follow the active language.

import { t } from '../i18n.js'

export const DEMO_STUDY_ID = 'demo-study'

const demoMeasurement = (code, label, value, unit, extra = {}) => ({
  id: `demo_${code}`,
  code,
  label,
  value,
  unit,
  method: 'demo_fixture',
  source: 'demo',
  validationStatus: 'synthetic',
  status: 'computed',
  reason: null,
  segmentAha: null,
  ...extra,
})

const notComputed = (code, label, reason) => ({
  id: `demo_${code}`,
  code,
  label,
  value: null,
  unit: null,
  method: 'not_available',
  source: 'none',
  validationStatus: 'not_computed',
  status: 'not_computed',
  reason,
  segmentAha: null,
})

export function createDemoStudy() {
  return {
    study: {
      id: DEMO_STUDY_ID,
      subject: { id: 'demo-subject', pseudonym: t('demo.pseudonym'), sex: 'M', ageYears: 58 },
      studyUid: 'DEMO-CCTA-2026-0417',
      studyDate: '2026-10-17',
      description: t('demo.description'),
      modality: 'CT',
      source: 'demo',
      status: 'ready',
      error: null,
      createdAt: '2026-10-17T09:42:00Z',
      availability: {
        cta: true,
        anatomy: true,
        analysis: true,
        report: true,
        angio: true,
        echo: true,
      },
    },
    series: [
      {
        id: 'demo-series',
        number: 3,
        modality: 'CT',
        description: t('demo.series'),
        sliceCount: 168,
        rows: 256,
        cols: 256,
        pixelSpacing: [0.5, 0.5],
        sliceThickness: 0.5,
        kvp: 70,
        kernel: 'B26f',
        contrastAgent: '320 mgI/mL · 60 mL',
        isSelected: true,
        candidateScore: 23,
        reasons: [t('demo.reasons')],
      },
    ],
    volumes: [
      {
        id: 'demo-volume',
        dims: [128, 128, 168],
        spacing: [0.0234375, 0.01875, 0.022619],
        huRange: [-1024, 1600],
        boundsMin: [-1.5, -1.2, -1.9],
        boundsMax: [1.5, 1.2, 1.9],
        defaultSlices: { x: 72, y: 89, z: 65 },
        markers: [
          {
            id: 'demo-lesion',
            label: t('demo.marker'),
            voxel: [72, 89, 65],
            worldMm: [0.19, 0.49, -0.42],
            findingId: 'demo_STENOSIS_LAD',
            provenance: 'demo_fixture',
          },
        ],
        dataUrl: null,
        scanner: {
          dlp: '412 mGy·cm',
          ctdivol: '38.4 mGy',
          effectiveDose: '5.8 mSv',
        },
      },
    ],
    segmentations: [],
    meshes: [],
    measurements: [
      demoMeasurement('STENOSIS_LAD', t('demo.stenosis'), 70, '%'),
      demoMeasurement('FFR_CT', t('demo.ffr'), 0.78, null),
      demoMeasurement('CALCIUM_SCORE', t('demo.calcium'), 286, null),
      demoMeasurement('LV_VOLUME', t('demo.lvVolume'), 142, 'mL'),
      demoMeasurement('LV_EF', t('demo.lvEf'), 54, '%'),
      demoMeasurement('LV_MASS', t('demo.lvMass'), 112, 'g'),
      demoMeasurement('GLS', t('demo.gls'), -16.8, '%'),
      notComputed('AHA_SEGMENTS', t('demo.aha'), t('demo.ahaReason')),
    ],
    reports: [],
    jobs: [],
  }
}
