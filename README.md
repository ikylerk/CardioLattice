# CardioLattice · CardioScope Pro

[中文](README.zh-CN.md)

An **open-source research prototype** for cardiovascular imaging: upload a raw CCTA DICOM series → de-identification and volume reconstruction → 3D segmentation and modeling → traceable quantitative measurements → a structured report draft → clinician review and audit.

> **Research prototype, not a medical device.** This project is not certified by NMPA / FDA / CE, and outputs must not be used for clinical diagnosis, treatment decisions, or medico-legal purposes. All data in demo mode is procedurally synthesized.

---

## What actually works now

M1 replaces the “demo” with a verifiable data path:

| Capability | Status | Notes |
| --- | --- | --- |
| DICOM upload (`.zip` / multiple files) | ✅ Implemented | Uncompressed and common compressed transfer syntaxes (pydicom + pylibjpeg/gdcm) |
| Series recognition and selection | ✅ Implemented | Scored by modality, slice thickness, slice count, and protocol description; ambiguous cases require a human choice |
| De-identification and UID remapping | ✅ Implemented | PS3.15-style basic profile; raw DICOM is not exposed through the API |
| HU decoding, slice order, and orientation | ✅ Implemented | RescaleSlope/Intercept, LPS→RAS, isotropic resampling |
| Volume preview and MPR/VRT | ✅ Implemented | Arbitrary dims/spacing/huRange; browser MPR + WebGL ray marching |
| Segmentation → marching cubes → GLB | ✅ Implemented | Synthetic-fixture ground truth; real uploads can optionally use TotalSegmentator |
| Chamber volume measurements | ✅ Implemented | Voxel count × voxel volume, with method / source / validation_status |
| Structured report draft | ✅ Implemented | Template-generated; every conclusion cites a measurement; clinician approval is written to the audit chain |
| Audit hash chain | ✅ Implemented | Events for de-identification, volume build, pipeline, and report approval |
| LLM-assisted reporting (Claude) | 🚧 M2 | Language over structured facts only; it does not diagnose on its own. Interface and checks are designed |
| Coronary lumen / stenosis / FFR-CT | 🚧 M3–M4 | No validated model is connected. The UI shows `not_computed` and does not invent a number |
| Longitudinal comparison / prediction | 🚧 M3 | Registration and delta first. No “future event probability” until a model is validated |
| Real angiography (XA) / echocardiography (TTE) | 🚧 Later | API mode states that the study is unavailable. Demo mode keeps the teaching views |

**The boundary that matters most:** a single-phase CCTA cannot compute EF/SV. The Agatston score requires a non-contrast calcium scan. AHA perfusion or viability cannot be inferred from CTA alone. A coronary stenosis percentage must come from an independently validated lumen model. The current code returns `not_computed` and a reason for these items.

---

## Quick start

### 1. Dependencies

- Node.js 20+
- Python 3.11+
- [uv](https://docs.astral.sh/uv/)

### 2. Start the local API and the frontend

```bash
npm install
npm run server:dev     # FastAPI: http://127.0.0.1:8000
npm run dev:api        # Vite:    http://127.0.0.1:5183
```

Open `http://127.0.0.1:5183` → sidebar “Study workbench” → “Generate synthetic CCTA study”.
That builds a real synthetic DICOM series and runs upload → de-identification → volume → segmentation → GLB → measurements → report.

You can also upload your own CCTA `.zip` (research use, authorized data only).

### 3. Offline demo (no backend)

```bash
npm run dev            # falls back to the offline demo when /api is unreachable
npm run build          # single-file dist/index.html; open it directly
```

Demo mode keeps the original five modules (3D anatomy, coronary angiography, CT, echocardiography, quantitative analysis). Every number is explicitly marked as synthetic.

### 4. Cloud build

```bash
npm run build:cloud    # normal code splitting; writes dist-cloud/
```

Deploy `dist-cloud/` to static hosting and reverse-proxy same-origin `/api/*` to FastAPI.

---

## Architecture

```
React + Vite + three.js
        │  /api (same origin; Vite proxy in development)
        ▼
FastAPI (server/)
  ├─ SQLite (local) / Postgres (production, planned)
  ├─ local filesystem (local) / S3-compatible object storage (production, planned)
  ├─ inline BackgroundTasks (local) / Redis + RQ worker (planned)
  ├─ pydicom + SimpleITK + scikit-image + trimesh
  ├─ TotalSegmentator (optional real segmentation)
  └─ Anthropic SDK (M2, server-side key)
```

### Pipeline stages

```
queued → validating → anonymizing → building_volume
       → segmenting → meshing → computing_metrics → drafting_report
       → succeeded | failed
```

`stage` stays this stable step id. `message` is `{"code": "STAGE_SUCCEEDED", "params": {}}` (and the same shape for the other steps). The server does not translate it.

### Coordinates and units

- Internal space is **RAS** (+x right, +y anterior, +z superior), in millimetres.
- DICOM input is LPS and is converted at the boundary.
- The frontend volume is stored in `(z, y, x)` C-order. MPR aspect ratio uses physical spacing.
- GLB meshes are already in scene units. `scene_transform` records the mm → scene scale and center.

### Data model (core)

`Subject → Study → Series → Volume / Segmentation / Mesh / Measurement / Report / Job / AuditEvent`

Every measurement includes:

```js
{
  code,                 // LV_EF, LV_VOLUME, ...
  label,                // {"code": "LV_EF", "params": {}}
  value, unit,
  method,               // voxel_count / model inference / ...
  source,               // synthetic_ground_truth / model id
  validationStatus,     // synthetic / research / validated
  status,               // computed / not_computed
  reason                // null, or {"code": "LV_EF_REQUIRES_TWO_PHASES", "params": {}}
}
```

`label`, `reason`, pipeline `message`, series-selection `reasons`, and error `detail` are `{code, params}` objects. The frontend owns the wording.

---

## API (M1)

The backend does not read `Accept-Language`.

Errors, `not_computed` reasons, pipeline messages, series-selection reasons, and measurement labels are objects such as `{"code": "LV_EF_REQUIRES_TWO_PHASES", "params": {}}`. Enums (`stage`, `status`, `method`, `source`) stay as they are.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Health check and the current segmentation adapter |
| GET | `/api/studies` | Study list |
| POST | `/api/studies` | Upload DICOM (multipart, `.zip` or multiple files) |
| POST | `/api/studies/demo` | Generate a synthetic DICOM study server-side and run the full pipeline |
| GET | `/api/studies/{id}` | Full study bundle |
| POST | `/api/studies/{id}/select-series` | Choose the CCTA series manually |
| POST | `/api/studies/{id}/pipeline` | Run again |
| GET | `/api/studies/{id}/events` | SSE progress |
| GET | `/api/studies/{id}/audit` | Audit events and hash-chain verification |
| DELETE | `/api/studies/{id}` | Delete the study and derived files |
| GET | `/api/volumes/{id}/data` | 8-bit volume |
| GET | `/api/meshes/{id}/glb` | Patient GLB |
| GET | `/api/models` | Model registry and licence status |
| POST | `/api/studies/{id}/reports/{reportId}/approve` | Clinician approves the report |

A structured report is created by `POST /api/studies`, `POST /api/studies/demo`, `POST /api/studies/{id}/select-series`, and `POST /api/studies/{id}/pipeline`. Pass the draft language as a query parameter: `lang=en` or `lang=zh`. Omitting it means `en`. Any other value is HTTP 400 `{"detail": {"code": "INVALID_LANG", "params": {"lang": "<value>"}}}`.

Example: `POST /api/studies/demo?lang=zh`.

The draft is stored with `content.lang` and is not rewritten on later reads or after approval. A stored report that has no `lang` field is returned as stored. The audit chain still records only the report id, actor, and action.

English disclaimer, stored when `lang=en`:

> Research prototype, not a medical device. This project is not certified by NMPA / FDA / CE, and outputs must not be used for clinical diagnosis, treatment decisions, or medico-legal purposes. All data in demo mode is procedurally synthesized.

Chinese disclaimer, stored when `lang=zh`, is the original wording:

> 研究原型，不是医疗器械。本项目未取得 NMPA / FDA / CE 认证，输出不得用于临床诊断、治疗决策或医疗法律用途。演示模式中的数据全部为程序化合成数据。

Interactive docs: after the backend is running, open `http://127.0.0.1:8000/docs`.

---

## Tests

```bash
npm run test:server    # pytest: DICOM, HU, orientation, de-identification, mesh, API, audit, languages
npm run build          # frontend single-file build regression
npm run build:cloud    # cloud build regression
```

Backend tests use a **procedurally synthesized DICOM** series. They do not download an external dataset and they do not touch real patient data.

Public-data checks (later milestones):

- **ImageCAS**: about 1000 CCTA cases with coronary voxel labels; training and validation for lumen segmentation. Check the Kaggle/official terms and redistribution limits before use.
- **ASOCA**: 40 annotated cases + 20 test cases. The challenge DUA restricts commercial use; check it item by item.
- **TotalSegmentator**: code is Apache-2.0, but task weights such as `heartchambers_highres` and `coronary_arteries` are not all cleared for commercial use. Review and license them before any commercial or clinical path.

Model licence and validation state are recorded in `/api/models` (`server/app/routes/assets.py`) and in [`docs/clinical-boundaries.md`](docs/clinical-boundaries.md).

---

## Project layout

```
src/                        React frontend
  api/                      fetch/upload/SSE client
  study/                    StudyContext, demo adapter
  components/               workbench, CTA/MPR/VRT, patient 3D, analysis, report
  three/                    HeartEngine / VolumeRenderer / AngioEngine
  data/heart-data.json      teaching anatomy for the demo
server/                     FastAPI backend
  app/imaging/              DICOM parsing, volumes, segmentation, marching cubes
  app/routes/               studies / assets / reports
  app/codes.py              stable {code, params} values
  app/reporting.py          report draft text (en / zh), frozen at generation
  app/pipeline.py           asynchronous pipeline
  app/audit.py              audit hash chain
  scripts/                  synthetic DICOM generator
  tests/                    pytest
docs/                       architecture, clinical boundaries, roadmap
```

---

## Security and compliance

- Local development has no authentication. Production must add OIDC, RBAC, TLS, encryption at rest, short-lived signed URLs, and log redaction.
- Raw DICOM is not exposed through the API. Only derived volumes and meshes are.
- De-identification keeps a salted hash for longitudinal linking. It cannot guarantee removal of burned-in PHI. Real data needs a human check and an ethics or data-use agreement.
- **M1/M2 must not receive real patient data** unless a governance review is complete.
- Any clinical release needs a separate assessment of NMPA software registration, data compliance, and clinical validation.

See [`docs/clinical-boundaries.md`](docs/clinical-boundaries.md).

---

## Roadmap

| Milestone | Contents |
| --- | --- |
| **M1 (current)** | Real DICOM → volume → segmentation/mesh → traceable measurements → report draft → audit |
| M2 | Claude-assisted structured reporting, report versions and per-claim confirmation, TotalSegmentator on real studies |
| M3 | Prior-study registration, longitudinal delta, comparability warnings |
| M4 | Coronary lumen/stenosis model, model registry, independent test-set validation |
| M5 | Cloud hardening, OIDC/RBAC, backup/monitoring, security review and governance gates |

See [`docs/roadmap.md`](docs/roadmap.md) and [`docs/architecture.md`](docs/architecture.md).

---

## Third-party licences

- Demo 3D heart surface: **“Realistic Human Heart”** by [neshallads](https://sketchfab.com/neshallads), CC BY 4.0. The licence text is in `src/assets/heart-license.txt`.
- Three.js (MIT), React (MIT), Lucide (ISC).
- Coronary centerlines follow the original CardioScope teaching model.
- Repository code: MIT (see `LICENSE`).

## Disclaimer

This project is a research prototype, is not a medical device, and does not provide clinical diagnosis or treatment advice. All demo data is synthetic; every model output must be reviewed by a physician.
