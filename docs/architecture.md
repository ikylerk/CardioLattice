# Architecture

[中文](architecture.zh-CN.md)

## 1. Goals and non-goals

**Goal:** make the path from a raw CCTA DICOM series to a traceable 3D model and structured report real and testable, without fabricating clinical AI outputs.

**Non-goals for M1:**

- autonomous diagnosis, stenosis grading or FFR-CT;
- real angiography/echo ingestion;
- multi-tenant cloud hardening;
- regulatory clearance.

## 2. Runtime components

```
Browser (React/Vite/three.js)
  │  same-origin /api
  ▼
FastAPI (server/app)
  ├── SQLite (local-lite)          → Postgres (production target)
  ├── local filesystem (local-lite) → S3/MinIO (production target)
  ├── inline BackgroundTasks        → Redis + RQ worker (production target)
  ├── imaging pipeline (pydicom/SimpleITK/scikit-image/trimesh)
  └── report generator (deterministic template now; Claude in M2)
```

The browser never receives raw DICOM. It receives a downsampled 8-bit volume,
GLB meshes, structured measurements and report content.

## 3. Data flow

```
upload (.zip / files)
  → safe extraction + magic/tag validation
  → series grouping and scoring
  → human confirmation if ambiguous
  → PHI removal + UID remap
  → pixel decode + rescale to HU
  → LPS→RAS + isotropic resampling
  → preview volume (uint8 + real huRange)
  → segmentation mask
  → marching cubes → GLB
  → deterministic measurements
  → template report draft
  → clinician approval + audit event
```

Job states are monotonic:

```
queued → validating → anonymizing → building_volume → segmenting
       → meshing → computing_metrics → drafting_report → succeeded | failed
```

## 4. Data model

| Entity | Purpose |
| --- | --- |
| `Subject` | pseudonymous research subject; no name in the database |
| `Study` | one uploaded study; `source = upload \| demo \| public_dataset` |
| `Series` | DICOM series metadata and candidate score |
| `VolumeRecord` | dims, spacing, affine, HU range, preview data path |
| `Segmentation` | label map, model id/version, validation status |
| `MeshRecord` | GLB per structure, scene transform, provenance |
| `Measurement` | value + unit + method + source + status + reason |
| `Report` | structured content, generator, approval |
| `Job` | pipeline state and progress |
| `AuditEvent` | append-only hash chain per study |

`Measurement.status === "not_computed"` is a first-class result. A missing value
must never be replaced by a demo number.

## 5. Volume contract

The frontend expects:

```js
{
  data: Uint8Array,          // length = nx*ny*nz, x-fastest
  dims: [nx, ny, nz],
  spacing: [sx, sy, sz],     // millimetres
  huRange: [lo, hi],         // linear mapping of uint8 → HU
  bounds: { min: [3], max: [3] }, // scene units for rendering
  defaultSlices: { x, y, z },
  markers: [{ voxel, worldMm, label, provenance }]
}
```

Quantitative work always uses the resampled HU volume server-side. The uint8
preview is for display only; its quantization error is roughly
`(hi - lo) / 255` HU.

## 6. Coordinates

- DICOM physical space is LPS.
- The backend canonicalises to **RAS** (`+x` right, `+y` anterior, `+z` superior).
- Volume and mesh share one affine. `bounds` in the API are millimetres; the
  frontend scales them to scene units for the existing camera framing.
- GLB coordinates are exported in scene units; `scene_transform` records the
  mm → scene mapping.
- MPR aspect ratios use physical spacing, not voxel counts.

## 7. Frontend modes

- `demo` — no network calls; local procedural volume and teaching anatomy.
- `api` — workbench, study context, server volume/mesh/report.
- Mode selection: `?mode=demo|api`, `VITE_DATA_MODE`, or `/api/health` probe.
- The single-file build (`npm run build`) remains the offline demo artifact.
- `npm run build:cloud` produces a normal, code-split cloud build.

## 8. Security posture

Local-lite is intentionally unauthenticated. Before real data:

- OIDC + PKCE, MFA, RBAC (`viewer/analyst/clinician/admin`);
- TLS/HSTS, same-origin API, httpOnly cookies;
- private object storage + short-lived signed URLs;
- encryption at rest and in transit;
- upload limits, zip traversal/bomb checks, quarantine;
- structured logs without PHI, request IDs;
- audit export, retention and deletion jobs;
- DPIA / IRB / data-use agreements and vendor DPAs.

## 9. Deployment path

1. **Local-lite** (current): `uv run uvicorn` + `npm run dev:api`.
2. **Container**: `docker compose up --build` (API + web, SQLite volume).
3. **Cloud**: managed Postgres, S3-compatible storage, Redis/RQ worker, GPU
   inference worker, CDN/static hosting, secrets manager, monitoring.

The storage/queue interfaces are deliberately narrow so the production
implementations can be added without changing the imaging pipeline.

## 10. Languages

The API does not read `Accept-Language`.

Errors, `not_computed` reasons, pipeline `message`s, series-selection reasons,
measurement labels, marker labels, segmentation warnings, and model
`intendedUse` / `license` are `{"code", "params"}` objects. The frontend owns
those strings. `stage` stays the step id (`validating`, `succeeded`, …).

A report draft is created by the upload, demo, select-series, and pipeline
requests. The query parameter is `lang=en` or `lang=zh`. Omitting it means
`en`. Any other value is HTTP 400
`{"detail": {"code": "INVALID_LANG", "params": {"lang": "<value>"}}}`.

The draft is stored with `content.lang` and is not rewritten on read or after
approval. A stored report with no `lang` field is returned as stored. The audit
chain still records the report id, actor, and action.

`lang=en` stores: "Research prototype, not a medical device. This project is
not certified by NMPA / FDA / CE, and outputs must not be used for clinical
diagnosis, treatment decisions, or medico-legal purposes. All data in demo mode
is procedurally synthesized."

`lang=zh` stores the original: "研究原型，不是医疗器械。本项目未取得 NMPA / FDA / CE 认证，输出不得用于临床诊断、治疗决策或医疗法律用途。演示模式中的数据全部为程序化合成数据。"
