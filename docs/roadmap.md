# Roadmap

[中文](roadmap.zh-CN.md)

## Current implementation — 2026-10-20

This integration retains the `aa8a648` research capabilities and merges stable
API codes and report-language capture. Implemented means the software path
exists and has local contract/known-answer coverage; it does not mean clinical
validation or verified live model availability.

| Area | Implemented | Remaining validation / work |
| --- | --- | --- |
| DICOM and NIfTI | Upload, series selection, de-identification, HU decoding, physical alignment, preview/MPR/VRT, GLB and source provenance | External scanner/protocol coverage, governance and clinical review |
| Original public labels | UInt16 labels, explicit semantics, original-grid measurements, all-component surfaces and input hashes | External datasets and quantitative accuracy evaluation |
| Organ atlas | 19 organs, named detail structures, 109 reference targets, views and reference simulation | Further licensed structures; no patient-specific procedural planning |
| Atlas registration | Explicit chamber semantics, similarity fit, observed/mapped points, failure handling | External registration accuracy; fit RMS is not target accuracy |
| Coronary research analysis | Original-grid skeleton coverage/connectivity, branch count and descriptive metrics; optional model/evaluation interfaces | Real model-weight inference, external QCA/IVUS validation; no validated stenosis or FFR-CT |
| AI reporting | SDK/API path, schema/evidence/numeric gates and template fallback | Real API key not connected for acceptance; real cloud call and clinical quality unverified |
| Report review | Editing, amendment, restoration, version snapshots and approval tied to version + SHA-256 body hash | Authenticated clinical identity, durable archival and clinical signature requirements |
| Longitudinal comparison | Same-subject/date gates, rigid preview registration, provenance/comparability checks, delta suppression and UI | External accuracy and clinical interpretation; individual event prediction absent |

## M1 — Data and geometry maintenance

Preserve the working DICOM/synthetic path and the original-label NIfTI path.
Patient metadata is LPS; RAS voxel ordering and the RAS reference atlas are
separate concepts. Keep crop-adjusted origins, spacing-aware affines, nearest-
neighbor label alignment, original mask components and centered preview units.
DICOM model measurements still use their segmentation grid; do not generalize
public NIfTI native quantification to every input path.

## Atlas and normalization

The 19-organ/109-target catalogue, lazy detail loading and reference target
simulation are implemented. Cardiac atlas-to-patient research registration is
also implemented. Preserve semantic mapping and invalid/degenerate-input
rejection. Future work is external accuracy/QC evaluation and additional
licensed anatomy, not relabeling these existing features as unimplemented.
Reference ray-cast simulation remains educational; patient targeting is outside
the current validated scope.

## M2 — Model and reporting acceptance

- Keep TotalSegmentator opt-in and subject to task licensing. Preserve official
  output-name mapping, physical NIfTI geometry, required-mask checks, isolated
  run outputs and installed-package provenance. Real weights inference remains
  unverified; a package version does not identify verified weights.
- The AI interface and mock SDK tests are implemented. Connect an authorized
  real key and evaluate provider responses separately before claiming live use.
- Retain evidence IDs and numeric checks, explicit template fallback and human
  review. Missing model/provider availability must not produce fabricated claims.
- Preserve report revisions and approval's `baseVersion`/`baseContentHash` checks.
  `lang=en|zh` is captured for generation, stored in the draft and unchanged by
  reads. Version history within a report workflow is not permanent retention
  across pipeline reprocessing.
- PDF export, broader model governance and clinical deployment remain separate
  acceptance tasks.

## M2.5 — External public-data validation

Public NIfTI image/label import and evaluation plumbing are implemented.
Complete provenance/licence review and independent ImageCAS/ASOCA evaluation
before presenting dataset accuracy or clinical performance. Record Dice/HD95
and appropriate centerline/lumen references. Mock outputs and synthetic masks
are not real inference or an external validation cohort.

## M3 — Longitudinal comparison

The comparison workflow is implemented. It requires the same subject, ready
studies, valid strictly ordered acquisition dates, successful research registration
QC and compatible measurement provenance/phase/units. Missing dates, failed
registration and incompatible measurements suppress deltas. It currently uses
rigid preview-volume registration; deformable registration and external clinical
accuracy remain future work. The feature is comparison, not disease progression
interpretation or individual event prediction.

## M4 — Coronary AI validation

Retain fail-closed skeleton coverage checks and clearly scoped longest-path
diameter summaries. Integrate and validate an actual lumen model, quantify
failure modes, and compare stenosis against QCA/IVUS before any stenosis claim.
FFR-CT requires an independently validated pressure solver/model.

## M5 — Production and clinical readiness

Remaining work includes authenticated roles/OIDC, audit export, retention,
backups/disaster recovery, deployment monitoring, database/object-storage and
worker scaling, security assessment, clinical safety review and regulatory
planning. Local tests and a clinician-labelled approval event do not complete
these requirements.

## Acceptance references

- [Imaging geometry](imaging-geometry.md)
- [Atlas registration](atlas-registration.md)
- [Longitudinal comparison](longitudinal-comparison.md)
- [Report versions and approval](report-version-review-handoff.md)
- [AI reporting](ai-reporting.md)
- [Clinical boundaries](clinical-boundaries.md)

Autonomous diagnosis, single-phase EF, unvalidated stenosis/FFR-CT, individual
event prediction and real patient use without approved governance remain outside
the current scope.
