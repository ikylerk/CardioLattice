# Architecture

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

## 9. Standard organ library

`shared/organ_library.json` is the single source of truth for reference organ
codes, systems, colours, canonical placement and cardiac label mappings.

- Frontend: `src/three/organGeometry.js` builds the reference meshes;
  `OrganLibraryEngine` renders them in a z-up RAS scene with millimetre units.
- Backend: `server/app/organ_library.py` loads and validates the same JSON;
  `GET /api/organs` exposes it; segmentation provenance includes
  `standard_label_map` (for example `LV → HEART_LV`).
- The catalog is versioned (`organ-atlas/v1`). Changing a published code is a
  breaking change; bump the version and keep the mapping stable.
- Non-cardiac organs are deliberately labelled as reference geometry. They can
  be replaced with licensed GLB models without changing the catalog contract.

## 10. Deployment path

1. **Local-lite** (current): `uv run uvicorn` + `npm run dev:api`.
2. **Container**: `docker compose up --build` (API + web, SQLite volume).
3. **Cloud**: managed Postgres, S3-compatible storage, Redis/RQ worker, GPU
   inference worker, CDN/static hosting, secrets manager, monitoring.

The storage/queue interfaces are deliberately narrow so the production
implementations can be added without changing the imaging pipeline.
