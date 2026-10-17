# Standard organ library

[中文](organ-library.zh-CN.md)

The organ library is the shared, versioned reference catalog used by both the
React frontend and the FastAPI backend. It provides:

- a common coordinate frame and units;
- stable organ codes for UI, measurements, segmentation labels and exports;
- a set of built-in 3D reference models for orientation, teaching and atlas
  placeholders.

The single source of truth is [`shared/organ_library.json`](../shared/organ_library.json).
That file still carries display names for the frontend bundle. `GET /api/organs`
returns the same geometry and identifiers, with every human-readable field
replaced by `{"code", "params"}`. The route ignores `Accept-Language`.

> These are **standard reference models**, not patient anatomy. They must not be
> used to diagnose, measure a patient, or replace a validated segmentation model.

## Coordinate frame

`RAS_BODY_CENTER`, millimetres:

- `+x` = right
- `+y` = anterior
- `+z` = superior
- origin = body centre

Every organ has `centerMm` and `sizeMm`. For tube/stack meshes, the explicit
geometry in `mesh.pointsMm` is authoritative; `centerMm`/`sizeMm` remain the
catalog metadata used by the UI and export.

## Built-in organs

| Code | Organ | System | Reference geometry |
| --- | --- | --- | --- |
| `HEART` | Heart | cardiovascular | Demo heart GLB, normalised to catalog size |
| `LUNG_R` | Right lung | respiratory | Ellipsoid with medial indent |
| `LUNG_L` | Left lung | respiratory | Ellipsoid with medial indent |
| `TRACHEA` | Trachea | respiratory | Tube |
| `LIVER` | Liver | digestive | Deformed ellipsoid |
| `GALLBLADDER` | Gallbladder | digestive | Ellipsoid |
| `STOMACH` | Stomach | digestive | Curved tube |
| `SPLEEN` | Spleen | digestive | Ellipsoid |
| `PANCREAS` | Pancreas | digestive | Curved tube |
| `KIDNEY_R` | Right kidney | urinary | Bean-shaped ellipsoid |
| `KIDNEY_L` | Left kidney | urinary | Bean-shaped ellipsoid |
| `AORTA` | Aorta | cardiovascular | Curved tube |
| `IVC` | Inferior vena cava | cardiovascular | Tube |
| `SPINE` | Spine | skeletal | Vertebra/disc stack |

## Cardiac label mapping

The cardiac segmentation adapter uses the existing 1–7 label map. The catalog
maps those labels to stable standard codes:

| Label | Standard code | Structure |
| --- | --- | --- |
| `LV` | `HEART_LV` | Left ventricular cavity |
| `RV` | `HEART_RV` | Right ventricular cavity |
| `LA` | `HEART_LA` | Left atrial cavity |
| `RA` | `HEART_RA` | Right atrial cavity |
| `AO` | `AORTA` | Aorta |
| `MYO` | `HEART_MYOCARDIUM` | Myocardium |
| `CALC` | `CORONARY_CALCIFICATION` | Coronary calcification |

The API exposes the mapping on each segmentation as `standardLabelMap`, and the
frontend shows the standard codes alongside the local labels.

## JSON file and API

The file keeps display strings for the frontend import. `GET /api/organs`
replaces them. A system name uses the system id as `code`. An organ name uses
the organ code. A standard-structure name uses that structure code. Notes and
sources use their own codes. `params` is `{}` unless a field has no dedicated
code, in which case `params.code` is the organ code.

```json
{
  "version": "organ-atlas/v1",
  "frame": {
    "name": "RAS_BODY_CENTER",
    "units": "mm",
    "description": {"code": "FRAME_RAS_BODY_CENTER", "params": {}}
  },
  "systems": [{
    "id": "cardiovascular",
    "name": {"code": "cardiovascular", "params": {}},
    "color": "#c45258"
  }],
  "organs": [{
    "code": "HEART",
    "name": {"code": "HEART", "params": {}},
    "system": "cardiovascular",
    "color": "#c45258",
    "centerMm": [-20, 20, 10],
    "sizeMm": [110, 90, 110],
    "mesh": {"type": "glb", "asset": "heart.glb"},
    "renderable": true,
    "segLabels": ["LV", "RV", "LA", "RA", "MYO"],
    "source": {"code": "SOURCE_DEMO_HEART_GLB", "params": {}},
    "note": {"code": "NOTE_HEART_NORMALIZED_SURFACE", "params": {}}
  }],
  "segLabelMap": {"LV": "HEART_LV"},
  "standardCodes": {
    "HEART_LV": {"name": {"code": "HEART_LV", "params": {}}, "system": "cardiovascular"}
  }
}
```

Supported `mesh.type` values in the current viewer:

- `ellipsoid` — optional `deform: lung | liver | kidney`
- `tube` — `pointsMm[]` and `radiusMm`
- `stack` — `segments`, `radiusMm`, `gapMm`
- `glb` — `asset` (currently the bundled demo heart)

## Adding or replacing an organ

1. Add an entry to `shared/organ_library.json`, keeping the code stable.
2. Choose a reference mesh type, or add a licensed GLB under `src/assets/`.
3. Record the source/licence in `source`. Do not add a model whose licence does
   not allow the intended use.
4. Run `npm run test:server` — the catalog validator checks unique codes, known
   systems, 3-value coordinates and label mappings.
5. Bump `version` when the published catalog changes; downstream exports and
   reports can then be tied to a specific atlas version.

## Using the library in code

Frontend:

```js
import ORGAN_LIBRARY from '../../shared/organ_library.json'
```

Backend:

```python
from app.organ_library import ORGAN_LIBRARY, standard_label_map
```

API:

```http
GET /api/organs
```

The response uses `public_catalog()` and does not include `name`/`en`/`note`/`source` sentences from the file.

## Roadmap

The current non-cardiac organs are intentionally simple reference geometry. A
future version can replace them one-by-one with open-licensed anatomical GLB
models (for example BodyParts3D or Z-Anatomy) without changing the codes,
coordinate frame or frontend contract. Any replacement must carry its licence
and provenance in the catalog.
