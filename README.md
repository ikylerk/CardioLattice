# CardioLattice · CardioScope Pro

[简体中文](README.zh-CN.md) · [Documentation](docs/README.md) · [Clinical readiness](docs/clinical-readiness.md)

A research workstation for cardiovascular imaging: DICOM or public NIfTI input,
physical-coordinate reconstruction, segmentation-derived 3D surfaces and
measurements, reference anatomy, longitudinal comparison and versioned reports.

> Research prototype, not a medical device. This project is not certified by
> NMPA / FDA / CE. Outputs must not be used for clinical diagnosis, treatment
> decisions or medico-legal purposes. Offline demo data is synthetic.

## What is implemented

| Area | Current behavior | Evidence boundary |
| --- | --- | --- |
| Imaging | DICOM series selection, de-identification, HU volumes, direction-aware MPR/VRT | Research pipeline; synthetic regression coverage |
| Public data | NIfTI image/label import, original hashes, native label geometry and high label IDs | Dataset identity is user-declared; importing is not model validation |
| Segmentation | Synthetic fixture adapter and optional TotalSegmentator adapter | No model weights bundled; real inference must be configured and verified separately |
| Measurements | Mask volumes, coronary skeleton/diameter candidates, provenance and explicit failure reasons | No validated stenosis grading or FFR-CT |
| Reference anatomy | 19 organs, substructures, 109 reference targets and teaching simulation | Reference meshes/targets are not patient anatomy or procedural guidance |
| Angiography | Shared coronary reference model, segment selection and projection controls | Reference/synthetic demonstration; real XA processing is not implemented |
| Comparison | Same-subject, earlier-study selection, physical rigid registration and compatibility checks | Deltas are withheld when incompatible; no progression prediction |
| Reports | Templates, optional Claude drafts, evidence checks, immutable history, revision and exact-version approval | AI failure falls back visibly to a template; no clinical validation |
| Languages | English and Simplified Chinese UI, generation-time report language | Stored report text is not translated when UI language changes |

Health capabilities distinguish configured services from verified availability.
The latest local validation did **not** establish real cloud AI generation,
TotalSegmentator weight inference, public-case external validation or clinical
readiness. See the dated [validation records](docs/README.md#validation-records).

Single-phase CTA does not supply EF/SV. Calcium scoring requires an appropriate
non-contrast series; perfusion/viability and FFR-CT require additional validated
inputs/models. Unsupported results remain `not_computed`.

## Run locally

Prerequisites: Node.js 22 (CI baseline), Python 3.11+ and [uv](https://docs.astral.sh/uv/).
From the repository root:

```sh
npm ci
uv sync --directory server --frozen --extra dev
cp .env.example server/.env
```

Start the API and frontend in separate terminals:

```sh
npm run server:dev   # http://127.0.0.1:8000
npm run dev:api      # http://127.0.0.1:5183
```

Open the studies workbench and generate a synthetic CCTA study to exercise the
complete local pipeline. A real DICOM upload does not automatically enable a
real segmentation model. Configuration belongs in `server/.env`; keep service
keys server-side. See [architecture](docs/architecture.md) and
[public NIfTI import](docs/public-data.md) for data handling and label semantics.

For the offline synthetic/reference demonstration:

```sh
npm run dev
npm run build        # single-file dist/index.html
npm run build:cloud  # static bundle in dist-cloud/
```

`npm run dev` uses automatic backend detection; without an API it falls back to
the demo. `dev:api` explicitly selects API mode. Cloud builds need a same-origin
`/api` reverse proxy for backend features. Authentication, institutional RBAC,
backup and a production deployment review are still required for shared hosting.

## Validation

```sh
npm run test:frontend
npm run test:server
npm run build
npm run build:cloud
```

CI runs backend tests, frontend tests and both builds. Browser interaction checks
are recorded separately. Passing tests do not establish anatomical accuracy,
clinical validity, a configured external model or a production deployment.

## API and report contract

Interactive API reference: `http://127.0.0.1:8000/docs` after starting the API.
Core routes include `/api/health`, `/api/studies`, `/api/public/import`,
`/api/organs`, `/api/models`, `/api/reports/{id}` and study comparison routes.

- Generation requests accept `?lang=en` or `?lang=zh`, defaulting to `en`.
  This covers DICOM pipelines, public imports and AI drafts. Other values return
  HTTP 400; `Accept-Language` does not change stored reports.
- New reports store `content.lang` and `provenance.lang`. Reads preserve content,
  including legacy documents. Existing version hashes remain meaningful.
- Known API messages/labels use `{code, params}`. Unknown research labels and
  detailed failure reasons retain source text rather than being discarded.
- Editing requires `baseVersion`; approval also requires `baseContentHash`.
  Stale edits return 409. Approved content is revised through an amendment and
  requires a new approval. See [report review](docs/report-version-review-handoff.md).

Patient images use physical LPS coordinates; reference organs use their declared
RAS reference frame. Native labels drive quantification, while downsampled
previews drive display. See [geometry](docs/imaging-geometry.md).

## Data and licenses

Repository code is under [MIT](LICENSE). Embedded BodyParts3D and HuBMAP HRA
reference anatomy has separate attribution and CC BY 4.0 terms; see
[asset attribution](src/assets/organs/ATTRIBUTION.md). Third-party datasets and
model weights have their own access/license conditions. Public availability
alone does not authorize clinical or commercial use.

See [contribution workflow](CONTRIBUTING.md), [roadmap](docs/roadmap.md),
[clinical boundaries](docs/clinical-boundaries.md) and [change history](CHANGELOG.md).
