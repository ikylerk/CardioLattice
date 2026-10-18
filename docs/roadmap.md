# Roadmap

## M1 — Real data chain (current)

- DICOM upload, safe extraction, series scoring and selection.
- PHI removal, UID remapping, HU decoding, LPS→RAS, isotropic resampling.
- Preview volume + MPR/VRT with arbitrary dims/spacing/huRange.
- Synthetic ground-truth segmentation, marching cubes, GLB export.
- Deterministic chamber-volume measurements and a template report draft.
- Study workbench, patient 3D view, traceable analysis view, structured report.
- Audit hash chain, report approval, deletion.
- Backend tests and Playwright E2E; offline demo build preserved.

## Atlas-based normalization (next)

- Register the standard organ atlas to the patient volume/mesh for orientation
  and left/right sanity checks.
- Use the atlas as a coordinate/reference layer only; never derive patient
  measurements from the reference geometry.
- Require registration QC (landmark error / overlap) and do not claim
  normalization when quality is low.

## M2 — Real segmentation and AI-assisted reporting

- TotalSegmentator integration with pinned version and label-map snapshots.
- Claude report drafting from structured facts only, with:
  - strict JSON schema;
  - evidence refs for every numeric claim;
  - numeric cross-check against measurements;
  - template fallback when the API is unavailable;
  - clinician accept/edit/reject and immutable report versions.
- Report editing UI, PDF export, report comparison.
- Model registry and task-level licence review.

## M2.5 — Public data validation

- Import ImageCAS/ASOCA cases through the public NIfTI path.
- Run a coronary centerline/lumen model and compare against the public labels.
- Report Dice/HD95/centerline distance; keep the model research-only until the
  external validation is complete.
- Add patient-specific coronary metrics only after model-registry approval.

## M3 — Longitudinal comparison

- Prior-study selection by pseudonymous subject.
- Rigid/affine registration with quality metrics (Dice, centroid distance,
  transform magnitude); low-quality registration requires manual review.
- Delta metrics with comparability warnings (slice thickness, kernel, kV,
  contrast timing, model version).
- UI named “纵向对比”, not “预测”.

## M4 — Coronary AI

- Dedicated coronary lumen/stenosis model (for example trained/validated on
  ImageCAS), behind a research flag.
- Centerline extraction, cross-sectional lumen measurement, plaque
  characterization.
- Independent validation: Dice/HD95, stenosis agreement vs QCA, external test
  set, failure analysis.
- Optional FFR-CT research integration only with a validated solver.

## M5 — Production hardening

- OIDC/RBAC, audit export, retention jobs.
- Postgres, S3-compatible storage, Redis/RQ worker, GPU inference worker.
- Monitoring, backups, disaster recovery, penetration test.
- Clinical safety review, data-protection assessment, regulatory planning.

## Explicitly out of scope until validated

- autonomous diagnosis;
- stenosis percentages from unvalidated models;
- single-phase EF;
- FFR-CT from anatomy alone;
- individual event prediction;
- real patient data without governance approval.
