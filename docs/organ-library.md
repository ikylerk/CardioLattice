# Standard organ library

The organ library is the shared, versioned reference catalog used by both the
React frontend and the FastAPI backend. It provides:

- a common coordinate frame and units;
- stable organ codes for UI, measurements, segmentation labels and exports;
- a set of built-in 3D reference models for orientation, teaching and atlas
  placeholders.

The single source of truth is [`shared/organ_library.json`](../shared/organ_library.json).
The backend also exposes it at `GET /api/organs`.

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
| `HEART` | 心脏 | cardiovascular | Demo heart GLB, normalised to catalog size |
| `LUNG_R` | 右肺 | respiratory | Ellipsoid with medial indent |
| `LUNG_L` | 左肺 | respiratory | Ellipsoid with medial indent |
| `TRACHEA` | 气管 | respiratory | Tube |
| `LIVER` | 肝脏 | digestive | Deformed ellipsoid |
| `GALLBLADDER` | 胆囊 | digestive | Ellipsoid |
| `STOMACH` | 胃 | digestive | Curved tube |
| `SPLEEN` | 脾脏 | digestive | Ellipsoid |
| `PANCREAS` | 胰腺 | digestive | Curved tube |
| `KIDNEY_R` | 右肾 | urinary | Bean-shaped ellipsoid |
| `KIDNEY_L` | 左肾 | urinary | Bean-shaped ellipsoid |
| `AORTA` | 主动脉 | cardiovascular | Curved tube |
| `IVC` | 下腔静脉 | cardiovascular | Tube |
| `SPINE` | 脊柱 | skeletal | Vertebra/disc stack |

## Cardiac label mapping

The cardiac segmentation adapter uses the existing 1–7 label map. The catalog
maps those labels to stable standard codes:

| Label | Standard code | Structure |
| --- | --- | --- |
| `LV` | `HEART_LV` | 左心室腔 |
| `RV` | `HEART_RV` | 右心室腔 |
| `LA` | `HEART_LA` | 左心房腔 |
| `RA` | `HEART_RA` | 右心房腔 |
| `AO` | `AORTA` | 主动脉 |
| `MYO` | `HEART_MYOCARDIUM` | 心肌 |
| `CALC` | `CORONARY_CALCIFICATION` | 冠脉钙化 |

The API exposes the mapping on each segmentation as `standardLabelMap`, and the
frontend shows the standard codes alongside the local labels.

## JSON schema

```json
{
  "version": "organ-atlas/v1",
  "frame": { "name": "RAS_BODY_CENTER", "units": "mm", "description": "..." },
  "systems": [{ "id": "cardiovascular", "name": "心血管", "en": "Cardiovascular", "color": "#c45258" }],
  "organs": [{
    "code": "HEART",
    "name": "心脏",
    "en": "Heart",
    "system": "cardiovascular",
    "color": "#c45258",
    "centerMm": [-20, 20, 10],
    "sizeMm": [110, 90, 110],
    "mesh": { "type": "glb", "asset": "heart.glb" },
    "renderable": true,
    "segLabels": ["LV", "RV", "LA", "RA", "MYO"],
    "source": "Demo surface: ... CC BY 4.0; reference placement",
    "note": "..."
  }],
  "segLabelMap": { "LV": "HEART_LV" },
  "standardCodes": { "HEART_LV": { "name": "左心室腔", "system": "cardiovascular" } }
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

## Roadmap

The current non-cardiac organs are intentionally simple reference geometry. A
future version can replace them one-by-one with open-licensed anatomical GLB
models (for example BodyParts3D or Z-Anatomy) without changing the codes,
coordinate frame or frontend contract. Any replacement must carry its licence
and provenance in the catalog.
