# Clinical boundaries and safety

[中文](clinical-boundaries.zh-CN.md)

> **Research prototype, not a medical device.** This project is not certified by NMPA / FDA / CE, and outputs must not be used for clinical diagnosis, treatment decisions, or medico-legal purposes. All data in demo mode is procedurally synthesized.

## Implemented software and evidence status

As of the 2026-10-20 integration, DICOM/NIfTI ingest, original-label geometry,
reference anatomy, research registration, longitudinal comparison, AI report
interfaces, and report revision/approval workflows are implemented. Synthetic
known-answer tests and mocked SDK/model calls verify software contracts. They
are not external accuracy studies or clinical validation. No real AI API key
has been connected for acceptance, and real cloud calls and model-weight
inference remain unverified in this environment.

## 1. Human review and report integrity

- Measurements record `method`, `source`, `validationStatus` and provenance.
- Template and AI reports begin as drafts. Evidence/numeric checks and the
  `needs_review` gate are implemented; unresolved review flags block approval.
- Editing, amendment, restoration and approval append report versions.
  Approval requires both `baseVersion` and `baseContentHash`; stale submissions
  are rejected. Edits and AI regeneration invalidate the current approval.
- The SHA-256 `contentHash` identifies the report body; approval binds the
  reviewed version and hash and records an actor/time audit event. A hash is
  not a digital signature, and the research actor label is not authenticated
  clinician identity.
- History is preserved within the report workflow. Pipeline reprocessing can
  replace derived reports; this is not permanent archival or tamper-proof storage.
- Report language is captured as `lang=en|zh` when a job/draft is created and
  retained in `content.lang` and `content.provenance.lang`. Reading a report
  does not translate or rewrite it. API status/label messages use stable codes.

See [report version and approval contract](report-version-review-handoff.md)
and [AI reporting](ai-reporting.md).

## 2. What can and cannot be computed

| Output | Current status | Basis / limit |
| --- | --- | --- |
| Chamber or supplied-label volume | Implemented research measurement | Voxel count × voxel volume; acquisition phase must be explicit for comparison |
| Public NIfTI label volume and coronary mask analysis | Implemented on original label grid | Original geometry and hashes retained; display downsampling does not define the measurement grid |
| DICOM model-derived volume | Implemented on its segmentation grid | Do not describe every input path as native-grid quantification |
| Coronary length, branches and diameter summaries | Descriptive research output | All original components must retain connected skeletons; displayed centerline/diameters describe the longest path, not full clinical QCA |
| LV myocardial mass | No validated output | A myocardium label and an assumed density alone do not establish a validated measurement |
| EDV / ESV / EF / SV | Not from single-phase CTA | Requires appropriate ED/ES phases |
| Agatston calcium score | Not from contrast CCTA | Requires a non-contrast calcium-scoring series |
| Aortic / pulmonary-artery diameters | Further implementation/validation needed | Requires suitable centerlines and normal cross-sections |
| Stenosis percentage / MLA / FFR-CT | Not provided as validated outputs | Requires validated lumen/pressure models and independent reference measurements |
| AHA perfusion / viability, SYNTAX / MACE risk | Not computed | Required data and validated models are absent |
| Longitudinal comparison | Implemented research workflow | Same subject, valid ordered study dates, registration QC and measurement comparability gates; failed gates suppress deltas |
| Individual event prediction | Not implemented | Comparison is not prediction |

Invalid, empty or semantically unmapped masks cannot establish successful
registration. Coronary skeleton loss or fragmentation produces an explicit
failure instead of partial-success analysis. See [imaging geometry](imaging-geometry.md)
and [comparison contract](longitudinal-comparison.md).

## 3. Reference atlas, coordinates and registration

The library contains **19 reference organs**, named detail structures and
**109 reference targets**, adapted from BodyParts3D 4.0 and HuBMAP HRA v1.1.
They are not patient anatomy or lesions. Patient meshes come from supplied or
model-derived patient masks and carry their own provenance. Internal codes
such as `HEART_LV` are catalogue identifiers, not certified SNOMED/RadLex/FMA
bindings. `GET /api/organs` exposes stable identifiers and `code`/`params`
display fields; the bundled catalogue retains frontend display names.

Patient image metadata uses **LPS physical millimetres**. The reference library
uses **RAS_ORGAN_REFERENCE**. RAS voxel-axis ordering does not convert SITK
physical metadata into RAS. The centered patient preview is a separate display
frame: `center_mm = (dims - 1) * spacing / 2`. None of these frames may be
substituted for another without an explicit transform.

Cardiac atlas registration is implemented as a research similarity fit using
explicit chamber semantics, with separate observed landmarks and mapped
reference points. Missing/duplicate labels and degenerate geometry fail closed.
The fitted landmark RMS is an in-sample residual, **not target accuracy**;
`targetAccuracyStatus` remains `not_evaluated`. A displayed mapped target is
still a reference target. See [registration contract](atlas-registration.md).

The target-simulation view supports reference targets, approach directions,
needle/depth animation, clipping planes and simple ray/surface intersections.
It models neither tissue deformation, respiration nor validated safety margins.
It is not surgical navigation, biopsy/ablation planning or robotic guidance and
must not guide a real procedure.

## 4. Model governance and licences

Research calculations may be shown with their research status. Unsupported
clinical outputs remain `not_computed`. Clinical use would separately require
model/version/weights provenance, task licensing, external validation,
robustness assessment, a model card and the applicable review process.

The optional TotalSegmentator adapter requires explicit selection, checks
supported output names and nonempty masks, preserves physical geometry and
records the installed package version. That version is not a verified weights
version. Mock calls with real NIfTI files verify the adapter contract only.
TotalSegmentator code is Apache-2.0; its official documentation lists
`heartchambers_highres` and `coronary_arteries` as licensed tasks. Follow the
[official task licence requirements](https://github.com/wasserth/TotalSegmentator#subtasks).
Do not infer commercial rights from the software licence.

ASOCA/ImageCAS imports do not establish dataset provenance or redistribution
permission; retain the actual source and comply with its distribution agreement.
Reference organ meshes, details and derived targets retain CC BY 4.0 attribution,
separate from repository MIT code: see [full attribution](../src/assets/organs/ATTRIBUTION.md).

## 5. Data governance and regulatory status

- Identifiable patient data requires an approved protocol, ethics/IRB review
  and data-use agreement; the prototype does not supply that governance.
- De-identification removes common PHI tags and remaps UIDs, but does not
  reliably remove burned-in annotations. Operator review is still required.
- Original uploads are retained for reprocessing. Shared deployment needs
  retention/deletion rules, access control, backups and audit review.
- Logs must not contain PHI or raw DICOM tags.

Clinical deployment requires its own software lifecycle, risk management,
clinical evaluation and applicable regulatory process. Test success, report
approval and a research QC pass do not establish certification or clinical safety.
The full disclaimer above is retained in English reports; Chinese reports retain
the full Chinese wording in the [Chinese edition](clinical-boundaries.zh-CN.md).
