# Architecture

[简体中文](architecture.zh-CN.md)

## Scope and runtime

CardioScope Pro is a research imaging workstation. It implements DICOM ingestion,
public NIfTI image/label import, preview volumes, label-derived meshes and
measurements, research registration/comparison, and versioned structured reports.
Clinical diagnosis, validated stenosis grading, FFR-CT, single-phase EF,
perfusion and procedural navigation are outside demonstrated capabilities.

```text
React / Vite / three.js → same-origin /api → FastAPI
  ├── SQLite + local filesystem
  ├── in-process background jobs
  ├── DICOM / NIfTI / segmentation / mesh / measurement processing
  ├── research atlas registration and longitudinal comparison
  └── template reports + optional Claude drafts + review/version history
```

Postgres, S3-compatible storage, Redis/RQ workers and production identity/access
controls are deployment targets. The included Compose stack uses SQLite, local
storage and the synthetic segmentation adapter. A successful build does not
establish deployment readiness or a working model runtime.

## Processing paths

**DICOM:** inspect/group/score uploaded series → confirm selection when needed →
de-identify retained metadata/remap UIDs → decode pixels and rescale to HU →
reorient voxel axes/resample → preview → segmentation when available →
meshes/measurements → deterministic template draft.

Synthetic studies use fixture ground-truth masks, not inference. Real uploads
use the explicitly selected TotalSegmentator adapter or record segmentation as
skipped and unsupported measurements as `not_computed`. The adapter implements
`heartchambers_highres`, requires the upstream task license/runtime resources,
and checks required output masks. Installed package metadata does not establish
available weights, successful inference or clinical validation.

**Public NIfTI:** validate image/annotation geometry → preserve native labels and
geometry → resample for display → native-label surfaces/volumes → optional
explicitly named coronary-mask analysis → template draft. The importer records
input hashes and user-declared dataset provenance; it does not run DICOM
de-identification, verify dataset licensing or infer coronary anatomy from label
value 1. See [public-data.md](public-data.md).

**Reports:** both pipelines initially use templates. The separate
`POST /api/studies/{id}/ai/report-draft` endpoint implements optional Claude
language generation from structured facts. Missing configuration, service errors
or invalid output produce a labelled template fallback. Recorded mock-SDK tests
have not validated a real cloud/model call. Editing, AI regeneration and
approval append version snapshots. Both approval URLs use the same version/hash
and review-flag checks. See [ai-reporting.md](ai-reporting.md) and
[report versions](report-version-review-handoff.md).

Jobs expose state, stage, progress and errors. `202 Accepted` does not mean
processing succeeded; a ready study can still contain unavailable measurements.

## Report language and API text

HTTP requests that generate reports accept `?lang=en` or `?lang=zh`.
The default is `en`; `Accept-Language` does not
select the report language. This applies to upload, demo creation, series
selection, pipeline reruns, AI drafting and public NIfTI import. Jobs retain the
requested language. Values other than en/zh, including zh-CN, return HTTP 400
with detail `{"code":"INVALID_LANG","params":{"lang":"<value>"}}`.

New templates, AI drafts and template fallbacks store the selected language in
`content.lang` and `content.provenance.lang`. The saved report/version keeps that
language; reads, approval and UI-language changes do not translate the content.
Regeneration may select another language for a new version without translating
previous snapshots. Legacy `content.language` fields and documents without lang
are returned as stored, without automatic migration or language inference.

API presentation messages use `{"code","params"}` where mapped, for frontend
localization. Unknown legacy strings remain compatible. This presentation
localization is separate from the persisted report text; source metadata and
custom labels are not guaranteed to be translated.

## Data model

| Entity | Purpose |
| --- | --- |
| Subject / Study / Series | Pseudonymous subject, study source and series selection |
| VolumeRecord | Preview data, spacing, physical geometry and HU mapping |
| Segmentation / MeshRecord | Labels, structures, surfaces, transforms and provenance |
| Measurement | Value/unit/method/source, validation status, availability and reason |
| Report / ReportVersion | Current content/approval and appended snapshots |
| Comparison | Prior/current registration, comparability and warnings |
| Job / AuditEvent | Progress and per-study audit hash chain |

`not_computed` must not be replaced by a reference/demo number. Pipeline reruns
replace derived records, including Report; version snapshots are not a guarantee
of cross-rerun archival retention or a substitute for backups.

## Physical, preview and reference coordinates

- DICOM and SimpleITK physical metadata use **LPS millimetres**.
  `DICOMOrient(image, "RAS")` reorders/flips voxel axes toward RAS while preserving
  the physical LPS representation. It does not convert every stored coordinate
  into RAS.
- The stored affine maps XYZ voxel indices to LPS mm:
  `origin + direction @ (index_xyz * spacing_xyz)`. Arrays are ZYX; API dimensions
  and spacing are XYZ.
- Volume responses expose origin, direction, spacing, boundsMin/Max, huRange,
  stats and dataUrl. The affine is persisted server-side. Bounds are centred
  display extents, not patient physical bounding boxes.
- The browser uses a centred preview-index frame and scaled scene units. Public
  GLB vertices are transformed from native-label geometry into this preview
  frame before centring/scaling. Interpret them with sceneTransform and preview
  geometry, rather than treating them as native patient coordinates.
- Atlas targets use `patient_preview_centered_mm`:
  `(index_xyz + 0.5 - dims_xyz / 2) * spacing_xyz`. Patient origin/direction are
  not applied in this frame; it is neither native LPS nor native RAS.
- Reference organs use the separate `RAS_ORGAN_REFERENCE` frame.
- MPR uses physical spacing. The uint8 preview is clipped/quantized display
  data. Public label volumes and coronary analysis use native labels/spacing,
  not the downsampled display mask.

## Research registration and comparison

Atlas registration requires at least three explicit, non-collinear chamber
landmarks and fits reference targets to preview-mask centroids. RMS is an
in-sample fit residual; target accuracy is `not_evaluated`. Mapped targets are
reference anatomy, not detected lesions. Invalid inputs produce `not_computed`.

Longitudinal comparison requires different ready studies from the same subject
and a valid earlier acquisition date. It registers preview images using physical
LPS geometry, then checks measurement comparability. Optimizer/coverage checks
are engineering checks, not anatomical accuracy validation. Failed registration
quality or comparability checks withhold longitudinal deltas.

## Runtime capability declarations

`GET /api/health` includes `capabilities` from `server/app/capabilities.py`.
It reads configuration/package metadata only; it does not contact a provider,
load weights or execute inference.

| Field / configuration | Status | Meaning |
| --- | --- | --- |
| reportDraft, no nonblank credential | template_only | No report-service credential configured |
| reportDraft, credential present | configured_unverified | Connectivity/output unverified |
| imageSegmentation, synthetic_ground_truth | synthetic_only | Fixture truth, not raw-image inference |
| imageSegmentation, TotalSegmentator package absent | dependency_missing | Selected adapter dependency absent |
| imageSegmentation, TotalSegmentator package detected | configured_unverified | Weights/license/execution unverified |
| imageSegmentation, unknown adapter | unsupported | Adapter cannot be treated as available |

Actual per-run results and provenance remain necessary.

## Frontend, reference assets and deployment

`demo` uses procedural/reference content; `api` uses study bundles and server
results. Mode selection uses `?mode=demo|api`, `VITE_DATA_MODE` or a health probe.
`npm run build` creates the single-file artifact; `npm run build:cloud` creates
the separate-asset build.

Shared definitions live in `shared/organ_library.json`, `shared/organ_targets.json`
and `shared/coronary_model.json`: 19 organs, 109 targets, 17 coronary segments and
17 myocardial territories. Their teaching geometry/reference QCA values are
not patient measurements. See [asset attribution](../src/assets/organs/ATTRIBUTION.md).

Use `npm run server:dev` and `npm run dev:api` locally; `docker compose up --build`
describes the local API/web container stack. The current prototype lacks
production authentication/RBAC. Actor/reviewer names are supplied labels, not
authenticated signatures. Clinical deployment, production security, data
governance and validated model performance require separate acceptance.


## Existing SQLite databases

Startup runs a small additive schema upgrade before creating missing tables.
Older databases receive the nullable `jobs.payload` column; old rows remain null
and existing reports are not rewritten. Startup upgrades are idempotent and
serialized for SQLite. Back up local data before an upgrade; deployment to other
database engines still requires a dedicated migration/deployment review.
