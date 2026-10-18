# Standard organ library

The organ library is the shared, versioned reference catalog used by both the
React frontend and the FastAPI backend. It provides:

- a common coordinate frame and units;
- stable organ codes for UI, measurements, segmentation labels and exports;
- anatomically derived reference meshes for orientation, teaching and atlas
  placeholders.

The single source of truth is [`shared/organ_library.json`](../shared/organ_library.json).
The backend exposes it at `GET /api/organs`; the frontend imports it and loads
the GLBs in `src/assets/organs/`.

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
| **BodyParts3D 4.0** (DBCLS) | brain, heart, stomach, gallbladder, small/large intestine, urinary bladder, esophagus, aorta, IVC, trachea, vertebral column | CC BY 4.0 |
| **HuBMAP Human Reference Atlas v1.1 male** | liver, left/right lung, left/right kidney, spleen, pancreas | CC BY 4.0 |

Adaptations: selected parts/nodes were merged, simplified, converted to RAS
millimetres, and the HRA organs were aligned to the BodyParts3D frame with a
uniform scale + translation solved from shared landmarks (heart LV, kidneys,
spleen, pancreas, trachea). The organ GLBs are **not** covered by the repository
MIT licence. See [`src/assets/organs/ATTRIBUTION.md`](../src/assets/organs/ATTRIBUTION.md).

## Built-in organs

| Code | Organ | System | Source |
| --- | --- | --- | --- |
| `BRAIN` | 脑 | nervous | BodyParts3D |
| `HEART` | 心脏 | cardiovascular | BodyParts3D |
| `LUNG_R` | 右肺 | respiratory | HRA |
| `LUNG_L` | 左肺 | respiratory | HRA |
| `TRACHEA` | 气管 | respiratory | BodyParts3D |
| `SMALL_INTESTINE` | 小肠 | digestive | BodyParts3D |
| `LARGE_INTESTINE` | 大肠 | digestive | BodyParts3D |
| `URINARY_BLADDER` | 膀胱 | urinary | BodyParts3D |
| `ESOPHAGUS` | 食管 | digestive | BodyParts3D |
| `LIVER` | 肝脏 | digestive | HRA |
| `GALLBLADDER` | 胆囊 | digestive | BodyParts3D |
| `STOMACH` | 胃 | digestive | BodyParts3D |
| `SPLEEN` | 脾脏 | digestive | HRA |
| `PANCREAS` | 胰腺 | digestive | HRA |
| `KIDNEY_R` | 右肾 | urinary | HRA |
| `KIDNEY_L` | 左肾 | urinary | HRA |
| `AORTA` | 主动脉 | cardiovascular | BodyParts3D |
| `IVC` | 下腔静脉 | cardiovascular | BodyParts3D |
| `SPINE` | 脊柱 | skeletal | BodyParts3D |

## Detailed sub-structures

Each organ has a `<CODE>_detail.glb` with named sub-structures. The frontend
loads it on demand, exposes a structure tree, and lets the user toggle or focus
individual parts.

| Organ | Detail parts | Examples |
| --- | --- | --- |
| BRAIN | 15 groups | frontal/parietal/temporal/occipital lobes, insula, cingulate, cerebellum, brainstem, thalamus, basal ganglia, hippocampus, ventricles, white matter, corpus callosum |
| HEART | 83 | chambers, valves, coronary branches, papillary muscles |
| LIVER | 12 | capsule, eight HRA segments, caudate, quadrate, ligaments |
| LUNG_L / LUNG_R | 10 each | bronchopulmonary segments |
| KIDNEY_L / KIDNEY_R | 7 each | capsule, cortex, column, medulla, calyces, pelvis, hilum |
| PANCREAS | 5 | head, neck, body, tail, uncinate process |
| SPLEEN | 5 | diaphragmatic, gastric, colic, renal, hilar surfaces |
| AORTA | 3 | ascending, arch, descending |
| IVC | 2 | proximal and abdominal segments |
| SPINE | 23 | cervical, thoracic, lumbar vertebrae and sacrum |
| SMALL_INTESTINE | 3 | duodenum, jejunum, ileum |
| LARGE_INTESTINE | 4 | ascending, transverse, descending colon, rectum |
| STOMACH / GALLBLADDER / TRACHEA / URINARY_BLADDER / ESOPHAGUS | 1 | whole-organ surface |

## Targets and simulation

`shared/organ_targets.json` defines 109 reference targets. Each target has:

```json
{
  "id": "CHAMBER_LV",
  "organ": "HEART",
  "name": "左心室腔",
  "category": "chamber",
  "partCode": "HEART_PART_006",
  "coordinateMm": [-45.3, 18.6, 99.0],
  "standardView": "anterior",
  "approach": "anterior",
  "reference": "BodyParts3D",
  "description": "参考心腔中心"
}
```

Targets cover brain lobes/cerebellum/brainstem/thalamus/basal ganglia/
hippocampus/ventricles, cardiac chambers/valves/coronaries, liver segments,
lung segments, kidney poles/hilum/pelvis, pancreas segments, spleen
poles/hilum, small/large bowel segments, bladder, esophagus, aortic segments,
IVC, trachea and selected vertebrae. Coordinates are in the
same `RAS_ORGAN_REFERENCE` frame as the meshes.

The **target simulation** view in the Organ Atlas provides:

- target selection and camera focus;
- anterior / posterior / left / right approach paths;
- an insertion-depth slider and simulated needle advance;
- axial / coronal / sagittal clipping planes through the target;
- path-length, distance-to-target and approximate structure-intersection
  readouts.

It is a teaching and workflow demonstration only. The collision check is a
simple ray cast against the reference surfaces, not tissue deformation or a
patient-specific plan. It is **not** a surgical navigation or biopsy-planning
system.

The backend exposes the same catalogue at `GET /api/organ-targets`.

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

The API exposes the mapping on each segmentation as `standardLabelMap`.

## JSON schema

```json
{
  "version": "organ-atlas/v2",
  "frame": {
    "name": "RAS_ORGAN_REFERENCE",
    "units": "mm",
    "description": "Origin at the centre of the reference organ set..."
  },
  "systems": [{ "id": "cardiovascular", "name": "心血管", "en": "Cardiovascular", "color": "#c45258" }],
  "organs": [{
    "code": "HEART",
    "name": "心脏",
    "en": "Heart",
    "system": "cardiovascular",
    "color": "#c45258",
    "centerMm": [-25.1, 21.2, 110.3],
    "sizeMm": [115.6, 106.3, 104.6],
    "mesh": { "type": "glb", "asset": "organs/HEART.glb" },
    "detailAsset": "organs/HEART_detail.glb",
    "parts": [{ "code": "HEART_PART_006", "name": "Cavity of left ventricle", "kind": "chamber", "node": "HEART_PART_006", "centerMm": [-45.3, 18.6, 99.0], "sizeMm": [64, 66, 72] }],
    "renderable": true,
    "segLabels": ["LV", "RV", "LA", "RA", "MYO"],
    "source": "BodyParts3D 4.0 (DBCLS, CC BY 4.0); selected surfaces, simplified",
    "note": "Anatomical reference surface; not patient-specific."
  }],
  "segLabelMap": { "LV": "HEART_LV" },
  "standardCodes": { "HEART_LV": { "name": "左心室腔", "system": "cardiovascular" } },
  "sources": [{ "id": "bodyparts3d", "license": "CC BY 4.0" }]
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

The script prints the alignment scale/translation and residual, writes the
outer and detail GLBs (`src/assets/organs/*.glb`, `*_detail.glb`), updates
`shared/organ_library.json`, writes `shared/organ_targets.json`, and writes the
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
- Patient-specific case linking: map measured lesions to the reference targets
  without ever presenting the reference anatomy as patient anatomy.
- Keep all additions licensed and provenance-tracked.
