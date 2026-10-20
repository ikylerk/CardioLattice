# AI-assisted structured reporting (research)

The report layer verbalizes existing structured measurements. It does not
interpret raw images, create measurements or establish diagnoses. Both imaging
pipelines initially generate templates; Claude drafting is a separate optional
request implemented in the current server.

## Capability and configuration

`GET /api/health` exposes `capabilities.reportDraft`:

| Status | Meaning |
| --- | --- |
| template_only | No nonblank service credential configured |
| configured_unverified | Credential configured; connectivity/output unverified |

This endpoint reads configuration without contacting the provider. A credential,
an installed SDK and mocked tests do not establish a working cloud integration.
Recorded validation has **not performed a real cloud/model call**.

```bash
export ANTHROPIC_API_KEY=...
export ANTHROPIC_MODEL=claude-sonnet-5-5
```

The key stays server-side. The configured model is recorded on successful AI
drafts. Actual request outcomes determine whether a report is labelled `claude`
or `template`; capability declarations do not determine the result.

## Request and evidence flow

`POST /api/studies/{id}/ai/report-draft` requires an existing pipeline report;
otherwise it returns 409. It reads structured facts, requests a `submit_report`
tool output, validates it locally and appends a draft snapshot. Regeneration
clears current approval and retains the preceding snapshot.

Facts include study ID/date/description/modality/source, pseudonym, sex/age where
present, and measurement IDs/labels/values/units/methods/sources, validation and
availability statuses, and reasons. Uncomputed values are sent as null. Raw
DICOM/images and the DICOM PatientName field are not sent. Metadata strings still
come from upstream inputs; this step is not a free-text identifier detector or
an independent de-identification audit.

Generation metadata and a measurement snapshot are retained. The UI prefers
that snapshot for citations, preserving the evidence values from generation
time rather than substituting later measurements.

## Generation language

Use `POST /api/studies/{id}/ai/report-draft?lang=en` or `?lang=zh` to select the
language of the new draft. Omitting lang defaults to en, independently of the
previous report or `Accept-Language`. Only en and zh are accepted; other values
(including zh-CN) return HTTP 400 with `INVALID_LANG` in the coded error detail.

The selected language is sent to the model as `report_language` and used by the
local report structure and any template fallback. New content stores both
`content.lang` and `content.provenance.lang`. These fields and the saved text are
fixed for that report version: reads, approval and changing the interface
language do not translate them. A new generation may use another language and
creates a new version; prior snapshots retain their original content.

Legacy `content.language` fields are preserved when reading existing reports;
missing lang fields are not automatically filled or migrated. New generation
uses lang rather than adding the legacy language field. This language selection
covers generated wording, not automatic translation of arbitrary source metadata,
custom measurement labels or user edits.

The same HTTP query contract applies to initial template generation and public
NIfTI import. See [public-data.md](public-data.md) and the
[version/language contract](report-version-review-handoff.md).

## Validation and fallback

- The tool payload must contain exactly summary, findings, impression,
  recommendations and limitations with the expected types.
- Findings, impressions and recommendations require nonempty references to
  known, computed measurements with values. Summary/limitations are text fields
  without evidence references in this schema.
- Recommendation category must be `research_follow_up`.
- Numeric checks cover generated sections, impressions and recommendations.
  Unmatched numbers become `needs_review`. These checks do not guarantee correct
  semantics, units, clinical safety or complete evidence coverage.
- Missing credentials produce `fallback_code=not_configured`. Request failure,
  missing `submit_report`, or invalid schema/evidence produces
  `fallback_code=generation_or_validation_failed`.
- Both fallback paths use a template with `generator=template`, `model=null` and
  an explicit `fallback_reason`. Raw provider errors are not written into the
  report. Numeric flags in an otherwise valid AI draft remain visible for review.

Before generation the server records version/hash/status. Before saving it
rechecks them under a write lock and confirms that the report is still the
latest for the study. Concurrent changes return 409 without overwriting them.

## Sonnet 5.5 request contract

The request uses `tool_choice: {"type": "auto"}` and omits temperature, top_p and
top_k. The official [Sonnet 5.5 overview](https://platform.claude.com/docs/en/models/sonnet-5-5/overview)
documents the model and non-default sampling restrictions. The
[tool-choice documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#forcing-tool-use)
documents rejection of forced tool/any choices for this model.

Automatic selection does not guarantee a tool call. Plain text, unrelated tools
or empty output still produce the explicit template fallback. Local validation
also applies when the expected tool is returned.

`server/tests/test_ai_report.py` exercises actual SDK request serialization
through a mock HTTP transport, including the missing-tool cases and absence of
forbidden parameters. It verifies the local contract, not live account access,
provider availability, model output quality or clinical validity.

## Review and versions

The UI shows provenance, fallback reasons, citations and review flags. Editing
text does not automatically resolve a flag; the reviewer must explicitly address
it and save a revision before approval.

Both `POST /api/reports/{id}/approve` and the compatible study-scoped URL require
the displayed baseVersion/baseContentHash and reject unresolved needs_review
claims. Amendments clear current sign-off. See
[report versions and review](report-version-review-handoff.md) for the full API
contract and conflict handling.

Approval is a research workflow state, not clinical validation or an authenticated
electronic signature. AI reporting remains research-only.
