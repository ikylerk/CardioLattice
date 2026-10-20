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

## Validation results

Local code tree: integration merge `84b4205` (subsequent documentation-only
commits do not change the code validated below).

| Check | Result |
| --- | --- |
| Backend regression suite | 260 passed, Python 3.14 local environment |
| Frontend tests | 14 passed, including physical MPR, report version/hash requests and language handling |
| Single-file production build | Passed |
| Cloud/static production build | Passed |
| Source parsing and identifier scan | No unresolved identifiers |
| Documentation | Local links and conflict-marker/diff checks passed |
| Fresh browser navigation | 7 API views × 2 languages, zero new page/console errors |
| Report workflow | Language switch preserved text/version/hash; approval bound to current version; regeneration retained Chinese history and produced an English template draft with approval cleared |
| Reference anatomy | Brain detail toggle, isolated display and reference target/simulation controls exercised |
| Layout | Desktop screenshot inspected; 390px viewport had no horizontal overflow and language controls remained available |

The seven views were workbench, anatomy, CTA, analysis, comparison, organ atlas
and the angle-encoded coronary reference view. CTA rendered three MPR canvases
and VRT; API mode displayed a single acquired phase, without invented ECG/4D
availability. The reference angiography hash remained intact.

Old-database tests cover adding `jobs.payload`, preserving records and report
content, idempotence, concurrent SQLite startup and rollback. Existing null
payloads remain readable. The migration is additive; it does not rewrite
historical reports or hashes.

Known non-blocking diagnostics: 191 NumPy/scikit-image deprecation warnings in
the local backend suite; the cloud build warns about a JavaScript chunk of about
2.2 MB before gzip. Those are maintenance/performance follow-ups, not passed
clinical checks. GitHub PR checks provide the separate Linux/Python 3.11/Node 22
validation record and are required before merging this integration to main.

## Evidence limitations

All runtime acceptance data for this maintenance pass is synthetic. Mock model
responses test contracts, not real model performance. No new cloud AI request,
TotalSegmentator weight inference, patient validation or clinical validation is
claimed. See [clinical readiness](clinical-readiness.md).
