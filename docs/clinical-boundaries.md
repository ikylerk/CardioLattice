# Clinical boundaries and safety

[中文](clinical-boundaries.zh-CN.md)

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

## 3. Model governance

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

## 4. Data governance

- Do not upload identifiable patient data to this prototype without an approved
  protocol, ethics/IRB review, and data-use agreement.
- De-identification removes common PHI tags and remaps UIDs, but cannot reliably
  remove burned-in annotations. Real data requires an operator attestation.
- Raw uploads are retained locally under the study directory for reprocessing;
  add a retention/deletion policy before any shared deployment.
- Logs must not contain PHI or raw DICOM tags.

## 5. Regulatory

Clinical deployment requires a separate regulatory pathway (for example NMPA
software registration in China, or FDA/CE equivalent) including software life
cycle, risk management, clinical evaluation, and post-market surveillance.
Nothing in this repository substitutes for that process.

API disclaimer text keeps this English sentence in full: "Research prototype.
Not for clinical diagnosis or treatment decisions." A Chinese response repeats
that sentence and then the Chinese equivalent. It does not replace the English
sentence or soften it.
