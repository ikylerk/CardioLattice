// Demo study adapter. All values are synthetic and are labelled as such in the
// UI. Keeping them in one place removes the duplication that previously lived
// inside individual components.

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
      subject: { id: 'demo-subject', pseudonym: '陈立群', sex: 'M', ageYears: 58 },
      studyUid: 'DEMO-CCTA-2026-0417',
      studyDate: '2026-10-17',
      description: 'CCTA + ICA + TTE · 冠状动脉综合评估',
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
        description: 'CCTA 75% R-R',
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
        reasons: ['演示数据'],
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
            label: 'LAD 中段 70% 狭窄',
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
      demoMeasurement('STENOSIS_LAD', 'LAD 中段狭窄', 70, '%'),
      demoMeasurement('FFR_CT', 'FFR-CT（远端）', 0.78, null),
      demoMeasurement('CALCIUM_SCORE', 'Agatston 钙化积分', 286, null),
      demoMeasurement('LV_VOLUME', '左心室腔容积（舒张期）', 142, 'mL'),
      demoMeasurement('LV_EF', '左心室射血分数', 54, '%'),
      demoMeasurement('LV_MASS', '左心室心肌质量', 112, 'g'),
      demoMeasurement('GLS', '整体纵向应变', -16.8, '%'),
      notComputed('AHA_SEGMENTS', 'AHA 17 段灌注/存活心肌', '演示数据仅作界面展示。'),
    ],
    reports: [],
    jobs: [],
  }
}
