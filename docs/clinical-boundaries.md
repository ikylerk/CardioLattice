# Clinical boundaries and safety

> This is a research prototype. It is not a medical device and must not be used
> for diagnosis, treatment decisions, triage, or legal purposes.

## 1. Human-in-the-loop

Every clinically meaningful output is advisory:

- measurements carry `method`, `source` and `validationStatus`;
- the report is a **draft** until a clinician approves it;
- approval writes an audit event with actor and timestamp;
- AI-generated text (M2) must cite measurement IDs; numbers without a citation
  are forced to `needs_review`.

## 2. What can and cannot be computed

| Output | Status | Basis / caveat |
| --- | --- | --- |
| Chamber cavity volume at the acquired phase | Computable | voxel count × voxel volume; label the phase |
| LV myocardial mass | Conditional | only if a myocardium label exists; 1.05 g/mL assumption |
| EDV / ESV / EF / SV | **Not from single-phase CTA** | requires ED and ES phases |
| Agatston calcium score | **Not from contrast CCTA** | requires a non-contrast calcium-scoring series |
| Aortic / PA diameters | Later | requires centerline and normal cross-sections |
| Coronary centerline length / vessel mask volume | Descriptive only | coarse model; not stenosis |
| Diameter stenosis / MLA | **Not computed** | requires a validated lumen model |
| FFR-CT | **Not computed** | requires a validated CFD or ML pressure model |
| AHA 17-segment perfusion / viability | **Not computed** | requires perfusion/metabolism data, not CTA alone |
| SYNTAX / MACE risk | **Not computed** | requires a validated risk model and complete inputs |
| Longitudinal change | M3 | requires registration and comparable acquisitions |
| Individual event prediction | **Not provided** | no validated longitudinal model; show trends only |

## 3. Standard organ atlas

The built-in organ library (`shared/organ_library.json`) contains **anatomically
derived reference meshes** for orientation, teaching, registration placeholders
and UI standardisation. They come from BodyParts3D 4.0 and the HuBMAP Human
Reference Atlas (both CC BY 4.0), are not derived from the patient, and must
never be displayed as patient anatomy. The only patient-specific 3D mesh is the
one produced by the segmentation pipeline and stored in `MeshRecord`.

Standard codes such as `HEART_LV` or `AORTA` are internal catalogue identifiers,
not a certified terminology binding. Do not claim SNOMED/RadLex/FMA compliance
unless the mapping has been reviewed and licensed separately.

### Detailed sub-structures and targets

The sub-structure meshes and the 81 reference targets are **reference anatomy**,
not patient-specific anatomy or lesions. Target coordinates are derived from
reference part centroids or simple morphological landmarks (for example organ
poles); they do not represent a patient's pathology and must not be used for
diagnosis or targeting.

The target-simulation view is an educational workflow demonstration:

- the approach path is a straight ray, not a patient-specific trajectory;
- collision detection is a simple ray cast against reference surfaces, with no
  tissue deformation, respiration, motion or safety margins;
- it is **not** a surgical navigation, biopsy-planning, ablation-planning or
  robotic guidance system;
- it must not be used to plan or perform a real procedure.

Any future patient-specific targeting feature requires registered patient
imaging, validated registration accuracy, clinician review, and the applicable
regulatory pathway.

## 4. Model governance

A model may only produce a displayed clinical measurement after:

1. a model-registry entry (name, version, weights hash, intended use, training
   data, known failure modes, regulatory status);
2. an external validation set (segmentation: Dice/HD95; stenosis: agreement with
   QCA/IVUS; FFR-CT: agreement with invasive FFR);
3. robustness checks (calcium, motion, stents, grafts, contrast timing, scanner
   and kernel variation);
4. a documented model card and a research/clinical status flag.

Until then the output is `not_computed` and the UI explains why.

### Licensing note

- TotalSegmentator code is Apache-2.0, but task weights such as
  `heartchambers_highres` and `coronary_arteries` are not uniformly cleared for
  commercial use. Verify each task before commercial deployment.
- The ASOCA challenge data agreement restricts use (including commercial use);
  check the exact distribution terms.
- ImageCAS is catalogued as Apache-2.0 in several lists, but the download page
  terms must be verified before redistribution.

## 5. Data governance

- Do not upload identifiable patient data to this prototype without an approved
  protocol, ethics/IRB review, and data-use agreement.
- De-identification removes common PHI tags and remaps UIDs, but cannot reliably
  remove burned-in annotations. Real data requires an operator attestation.
- Raw uploads are retained locally under the study directory for reprocessing;
  add a retention/deletion policy before any shared deployment.
- Logs must not contain PHI or raw DICOM tags.

## 6. Regulatory

Clinical deployment requires a separate regulatory pathway (for example NMPA
software registration in China, or FDA/CE equivalent) including software life
cycle, risk management, clinical evaluation, and post-market surveillance.
Nothing in this repository substitutes for that process.
