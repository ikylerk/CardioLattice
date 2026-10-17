# Standard organ library

[中文](organ-library.zh-CN.md)

The organ library is the shared, versioned reference catalog used by both the
React frontend and the FastAPI backend. It provides:

- a common coordinate frame and units;
- stable organ codes for UI, measurements, segmentation labels and exports;
- anatomically derived reference meshes for orientation, teaching and atlas
  placeholders.

The single source of truth is [`shared/organ_library.json`](../shared/organ_library.json).
That file still carries display names for the frontend bundle, which loads the
GLBs in `src/assets/organs/`. `GET /api/organs` returns the same geometry and
identifiers, with every human-readable field replaced by `{"code", "params"}`.
The route ignores `Accept-Language`.

> These are **reference anatomy**, not patient anatomy. They must not be used to
> diagnose, measure a patient, or replace a validated segmentation model.

## Coordinate frame

`RAS_ORGAN_REFERENCE`, millimetres:

- `+x` = right
- `+y` = anterior
- `+z` = superior
- origin = centre of the reference organ set

The meshes are centred together; relative organ positions are preserved. The
frontend uses a z-up scene and standard views. In the anterior view, patient
right appears on the viewer's left (radiological convention).

## Sources and licence

| Source | Structures used | Licence |
| --- | --- | --- |
| **BodyParts3D 4.0** (DBCLS) | heart, stomach, gallbladder, aorta, IVC, trachea, vertebral column | CC BY 4.0 |
| **HuBMAP Human Reference Atlas v1.1 male** | liver, left/right lung, left/right kidney, spleen, pancreas | CC BY 4.0 |

Adaptations: selected parts/nodes were merged, simplified, converted to RAS
millimetres, and the HRA organs were aligned to the BodyParts3D frame with a
uniform scale + translation solved from shared landmarks (heart LV, kidneys,
spleen, pancreas, trachea). The organ GLBs are **not** covered by the repository
MIT licence. See [`src/assets/organs/ATTRIBUTION.md`](../src/assets/organs/ATTRIBUTION.md).

## Built-in organs

| Code | Organ | System | Source |
| --- | --- | --- | --- |
| `HEART` | Heart | cardiovascular | BodyParts3D |
| `LUNG_R` | Right lung | respiratory | HRA |
| `LUNG_L` | Left lung | respiratory | HRA |
| `TRACHEA` | Trachea | respiratory | BodyParts3D |
| `LIVER` | Liver | digestive | HRA |
| `GALLBLADDER` | Gallbladder | digestive | BodyParts3D |
| `STOMACH` | Stomach | digestive | BodyParts3D |
| `SPLEEN` | Spleen | digestive | HRA |
| `PANCREAS` | Pancreas | digestive | HRA |
| `KIDNEY_R` | Right kidney | urinary | HRA |
| `KIDNEY_L` | Left kidney | urinary | HRA |
| `AORTA` | Aorta | cardiovascular | BodyParts3D |
| `IVC` | Inferior vena cava | cardiovascular | BodyParts3D |
| `SPINE` | Spine | skeletal | BodyParts3D |

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

The API exposes the mapping on each segmentation as `standardLabelMap`.

## JSON file and API

The file keeps display strings for the frontend import. `GET /api/organs`
replaces them. A system name uses the system id as `code`. An organ name uses
the organ code. A standard-structure name uses that structure code. Notes and
sources, licences, and institutions use their own codes. `params` is `{}`
unless a field has no dedicated code, in which case `params.code` is the organ
code (or `params.id` is the source id). The response comes from
`public_catalog()` and does not include the file's display sentences.

```json
{
  "version": "organ-atlas/v2",
  "frame": {
    "name": "RAS_ORGAN_REFERENCE",
    "units": "mm",
    "description": {"code": "FRAME_RAS_ORGAN_REFERENCE", "params": {}}
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
    "mesh": {"type": "glb", "asset": "organs/HEART.glb"},
    "source": {"code": "SOURCE_BODYPARTS3D", "params": {}},
    "note": {"code": "NOTE_ANATOMICAL_REFERENCE", "params": {}}
  }],
  "standardCodes": {
    "HEART_LV": {"name": {"code": "HEART_LV", "params": {}}, "system": "cardiovascular"}
  },
  "sources": [{
    "id": "bodyparts3d",
    "name": {"code": "SOURCE_NAME_BODYPARTS3D", "params": {}},
    "institution": {"code": "INSTITUTION_DBCLS", "params": {}},
    "license": {"code": "LICENSE_CC_BY_4_0", "params": {}}
  }]
}
```

## Frontend

- `src/three/OrganLibraryEngine.js` loads every `organs/<CODE>.glb` from
  `src/assets/organs/` via `import.meta.glob`.
- GLB vertices are already in the shared RAS_ORGAN_REFERENCE frame, so no
  per-organ transform is applied.
- The engine assigns catalogue colours, provides visibility/opacity controls,
  standard views (anterior/posterior/left/right) and raycast selection.
- If a GLB is missing, the engine can fall back to the built-in procedural
  geometry in `src/three/organGeometry.js`, clearly labelled as reference
  geometry.

## Rebuilding the atlas

The source archives are large and are **not** committed. The generated GLBs are
committed so the app builds offline.

1. Download the BodyParts3D 4.0 OBJ archive:
   `https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip`
   (or the Human Atlas binary chunks from
   `https://github.com/ashemag/human-atlas/tree/main/public/models`).
2. Download the HRA v1.1 male reference organs from
   `https://github.com/hubmapconsortium/ccf-releases/tree/main/v1.1/models`:
   `VH_M_Liver.glb`, `VH_M_Lung.glb`, `VH_M_Kidney_L.glb`,
   `VH_M_Kidney_R.glb`, `VH_M_Spleen.glb`, `VH_M_Pancreas.glb`,
   `VH_M_Heart.glb` (used for alignment landmarks).
3. Run the maintainer script:

```bash
uv run --directory server python scripts/build_organ_atlas.py \
  --atlas-json /path/to/human-atlas/public/models/atlas.json \
  --chunks /path/to/human-atlas/public/models \
  --hra /path/to/hra/models
```

The script prints the alignment scale/translation and residual, writes
`src/assets/organs/*.glb`, updates `shared/organ_library.json`, and writes the
attribution file.

## Adding or replacing an organ

1. Add an entry to `shared/organ_library.json`, keeping the code stable.
2. Add a GLB under `src/assets/organs/` in the shared frame, or extend
   `build_organ_atlas.py` with the source geometry.
3. Record the source and licence in `source`; do not add a model whose licence
   does not allow the intended use.
4. Run `npm run test:server` (catalog and GLB validation) and the frontend build.
5. Bump `version` when the published catalog changes.

## Roadmap

- Add more reference structures (e.g., biliary tree, coronary tree, abdominal
  vessels) as separately labelled meshes.
- Atlas-to-patient registration for orientation and left/right sanity checks.
- More standard views and cross-sectional reference planes.
- Keep all additions licensed and provenance-tracked.
