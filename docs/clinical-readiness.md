# Clinical readiness

> **Status: research prototype. Not a medical device. Not for clinical use.**

Adding more anatomical meshes, sub-structures or targets does **not** make the
system clinically usable. Clinical use requires patient-specific data,
validated algorithms, clinical evaluation and the applicable regulatory
pathway. This document records the current gap explicitly.

## Capability matrix

| Capability | Current state | Evidence / limitation | Needed for clinical use |
| --- | --- | --- | --- |
| DICOM upload, de-identification, volume build | Implemented (research profile) | Synthetic fixture E2E; PHI removal tested | Validated de-identification, DPA/ethics, audit |
| MPR / VRT / standard views | Implemented | Direction/spacing-aware; 48 signed axis permutations tested; synthetic browser checks | Display validation, diagnostic review |
| Segmentation | Synthetic ground truth; TotalSegmentator optional | No external validation; model licences task-specific | Validated, versioned model with external test set |
| Chamber volume measurements | Computed from masks | Method is deterministic, but not clinically validated | Validation vs reference standard, QC |
| Stenosis / plaque / FFR-CT | `not_computed` | No validated lumen/flow model | Dedicated validated model |
| LVEF / SV | `not_computed` for single-phase CTA | Requires ED + ES phases | Multi-phase acquisition or other modality |
| Calcium score | `not_computed` | Requires non-contrast calcium series | Correct acquisition + validated scoring |
| AHA perfusion / viability | `not_computed` | CTA alone cannot provide perfusion/viability | Perfusion/metabolism data |
| Reference organ atlas | Implemented (19 organs, detail parts) | BodyParts3D + HRA reference anatomy, CC BY 4.0 | Not a patient-specific atlas |
| Atlas-to-patient registration | Implemented (research) | Four-chamber Umeyama similarity; no external validation | Validated registration with error bounds |
| Reference targets and simulation | Implemented (109 targets) | Straight-ray teaching demo, no tissue model | Patient-specific planning, safety margins, validated instruments |
| Coronary reference model / QCA | Implemented | 17 reference segments, synthetic FFR, reference values | Patient-specific centerline/lumen model, QCA validation |
| Coronary label analysis | Implemented (research) | Skeleton centerline, diameter profile, candidate lesions | Validated QCA agreement, external test set |
| Public NIfTI import | Implemented (research) | Native labels preserved, physical-grid alignment, high label IDs and multi-component meshes; synthetic browser checks | Actual public-data inference and external validation |
| LLM report drafting | Implemented (research draft) | Structured facts only, evidence refs, numeric guardrail, template fallback, clinician approval | Clinical validation of workflow and wording |
| Longitudinal comparison | Implemented (research) | Rigid registration QC, dates/subject/provenance/phase checks; incompatible results suppress deltas; synthetic browser checks | Anatomical registration accuracy and acquisition-specific validation |
| Prediction | Not implemented | No validated longitudinal model | Validated risk/progression model |
| Regulatory status | None | Not NMPA/FDA/CE cleared | Clinical evaluation + registration |

## What "patient-specific" requires

1. **Registration:** align the reference atlas to the patient volume/mesh using
   validated landmarks or image registration; record and display registration
   error. Reference anatomy must never be shown as patient anatomy.
2. **Segmentation:** use a validated model for the relevant structures; pin the
   model version and weights; run QC and flag failures.
3. **Measurements:** compare against a reference standard (e.g., QCA/IVUS for
   stenosis, expert contours for volumes); report agreement and uncertainty.
4. **Targeting:** derive targets from patient imaging and clinician input, not
   from reference-mesh centroids; include approach safety margins, critical
   structures, and instrument constraints.
5. **Reporting:** clinician review, immutable versions, evidence references,
   audit trail, and approved export.
6. **Security/compliance:** authentication, authorization, encryption, PHI
   handling, retention/deletion, incident response.
7. **Clinical evaluation and regulatory:** prospective/retrospective validation,
   clinical safety review, and the applicable NMPA/FDA/CE pathway.

## Explicit non-claims

- Not a diagnostic device.
- Not a surgical navigation, biopsy-planning, ablation-planning or robotic
  guidance system.
- Not validated for any patient population.
- The organ atlas and targets are **reference anatomy**, not patient anatomy or
  pathology.

## Current safe uses

- Teaching and anatomy orientation.
- Software pipeline development and regression testing.
- Synthetic/public-data research.
- Demonstrating a human-in-the-loop report workflow with clearly labelled
  research data.
