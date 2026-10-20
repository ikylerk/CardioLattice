# AI-assisted structured reporting (research)

The AI report layer turns **structured, traceable measurements** into a
structured report draft. It does not diagnose, measure or interpret raw pixels,
and it never bypasses clinician review.

## Flow

```text
measurements + study facts
  → Claude structured tool call (or template fallback)
  → evidence-ref validation + numeric guardrail
  → draft Report (status=draft)
  → clinician accepts/edits/rejects
  → approval + audit
```

Endpoint: `POST /api/studies/{id}/ai/report-draft`.

## Facts sent to the model

Only de-identified structured facts are sent:

- pseudonym, sex, age (if present), study date/description/modality/source;
- each measurement: id, code, label, value, unit, method, source, validation
  status, status, reason.

No DICOM, no images, no patient name, no free-text identifiers.

## Guardrails

- The model must return a `submit_report` tool call with the strict schema
  (`summary`, `findings`, `impression`, `recommendations`, `limitations`).
- Every claim must cite measurement IDs. A claim whose numbers cannot be matched
  to the referenced measurement values is marked `needs_review`.
- `not_computed` items are only described as limitations, never given a number.
- The prompt forbids diagnosis, treatment recommendations beyond research
  follow-up wording, probabilities and invented patient details.
- If the API key is absent or the call/schema fails, the deterministic template
  report is used and the fallback reason is recorded in provenance.
- Model, prompt version, generator, input measurement IDs and a measurement snapshot are recorded on the report. Regeneration appends report versions and clears current approval; prior approval snapshots are preserved.
- StructuredReport uses `/api/reports/{id}/approve` with a version and content hash. The legacy study-scoped approval route still needs migration by the integration owner; see [report-version-review-handoff.md](report-version-review-handoff.md).

## Configuration

```bash
export ANTHROPIC_API_KEY=...
export ANTHROPIC_MODEL=claude-sonnet-5-5   # selectable
```

The key stays server-side. The default model can be changed; the model used is
stored on each report.

## Sonnet 5.5 request compatibility

The request uses `tool_choice: {"type": "auto"}` and omits `temperature`,
`top_p`, and `top_k`. The configured model and installed SDK are unchanged.
The official [Sonnet 5.5 overview](https://platform.claude.com/docs/en/models/sonnet-5-5/overview)
documents the model ID and rejects non-default sampling parameters; the
[tool-choice compatibility documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#forcing-tool-use)
states that Sonnet 5.5 rejects forced `tool`/`any` choices with HTTP 400.

Automatic tool choice does not guarantee a tool call. A response without a
`submit_report` tool block (including plain text, an unrelated tool, or empty
content) remains a generation/validation failure and produces an explicitly
labelled template fallback. Local schema, evidence-reference and numeric checks
still apply when `submit_report` is present.

Regression tests exercise the installed Anthropic SDK with an HTTP mock
transport, inspecting the serialized request body for automatic tool choice and
absence of prohibited sampling parameters. They cover successful report output
and the missing-tool fallback cases. **No real cloud/model call was performed**;
these tests establish the local request contract, not live account access,
service availability, model output quality, or clinical validity.

## UI

In the report drawer, **AI 草稿** requests a draft. If Claude is not configured,
the UI states that a template draft was generated instead. The draft is shown
with evidence citations, a template/Claude provenance label, and a prominent
"AI 辅助 · 需医生复核" notice for Claude drafts. Approval is only available
through the existing clinician approval action.

## What this is not

- Not an autonomous diagnostic system.
- Not validated for report accuracy, wording or clinical safety.
- Not a substitute for radiologist/cardiologist review.
- Not a source of new measurements; it only verbalizes facts already computed.
