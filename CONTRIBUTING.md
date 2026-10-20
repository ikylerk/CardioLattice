# Contributing

Keep changes scoped to a feature or defect and preserve the research boundaries.
Use a topic branch from current `main`; reconcile newer functionality before
merging an older branch. Do not resolve a whole component with an old version
merely to clear conflicts.

## Reproducible setup and checks

Use the locked dependencies and commands in [README](README.md#run-locally).
Run the relevant tests during development and backend/frontend tests plus both
builds before merging. For imaging or report UI changes, also exercise the
changed flow in a browser. Record exact data provenance and separate synthetic,
mock, actual inference and clinical evidence.

## Data and generated files

Never commit service credentials, local `.env`, patient data, databases,
downloaded restricted datasets, model weights, dependency directories or build
outputs. Use synthetic fixtures for tests. Preserve source attribution and
license notices for reference assets. Changes to labels or coordinates must
retain provenance, original geometry and explicit failure states.

## Review and documentation

Explain the trigger, resulting behavior and validation in each pull request.
Keep README language variants and relevant architecture/API docs aligned.
A report language choice is a generation parameter; viewing must not rewrite
stored clinical/research content or its version hash. Edits and approvals must
retain the optimistic-concurrency and immutable-history safeguards.

Known external-service, anatomy and clinical validation gaps belong in
[clinical readiness](docs/clinical-readiness.md), not in claims of completion.
