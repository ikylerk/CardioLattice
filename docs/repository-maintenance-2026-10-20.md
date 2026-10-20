# Repository maintenance — 2026-10-20

## Scope

Preserve the completed research-imaging/report work and reconcile two older
bilingual branches without removing newer features. Update setup, architecture,
report contracts, reference-asset attribution and the distinction between
implemented code and demonstrated clinical/model capability.

## Inputs

- Remote main baseline: `bd2a63e45c63312c597648332ce965706f2e4fec`.
- Preserved local research implementation: `aa8a648`.
- [Backend/docs PR #1](https://github.com/ikylerk/CardioLattice/pull/1),
  source `60c44ff09a1ac77e646195e08824ca2bb08d02c5`.
- [Frontend PR #2](https://github.com/ikylerk/CardioLattice/pull/2),
  source `95103a3ee3f271be2dc6ac4e8de8bf5eeb688934`.

## Integration decisions

- Retain native physical geometry, high label IDs, complete mesh components,
  MPR orientation and research registration/comparison behavior.
- Keep exact-version/hash approval, amendment history and AI evidence checks.
- Carry report language through DICOM, public NIfTI and AI generation. Reading
  or changing UI language must not rewrite a saved report.
- Translate stable known messages, retaining unknown labels and specific failure
  reasons. A generic measurement reason must not hide the actual failure.
- Preserve organ detail/target operations and the shared coronary model while
  integrating translation support.
- Use locked dependencies in CI and keep local datasets, databases, secrets,
  dependency folders and build outputs outside version control.

## Validation status

Integration validation is in progress. Final results will be recorded after
backend/frontend regression checks, builds and browser checks complete.

## Evidence limitations

All runtime acceptance data for this maintenance pass is synthetic. Mock model
responses test contracts, not real model performance. No new cloud AI request,
TotalSegmentator weight inference, patient validation or clinical validation is
claimed. See [clinical readiness](clinical-readiness.md).
