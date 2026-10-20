# Standard organ library

[中文](organ-library.zh-CN.md)

The organ library is the shared, versioned reference catalog used by both the
React frontend and the FastAPI backend. It provides:

- a common coordinate frame and units;
- stable organ codes for UI, measurements, segmentation labels and exports;
- anatomically derived reference meshes for orientation, teaching and research registration.

The single source of truth is [`shared/organ_library.json`](../shared/organ_library.json).
That file still carries display names for the frontend bundle, which loads the
GLBs in `src/assets/organs/`. `GET /api/organs` returns the same geometry and
identifiers, with stable `{"code", "params"}` display fields.
The route ignores `Accept-Language`.

> These are **reference anatomy**, not patient anatomy. They must not be used to
> diagnose, measure a patient, or replace a validated segmentation model.

The current catalogue contains **19 organs**, **14 named-detail assets** and
**109 reference targets**. These counts describe reference content, not patient
findings or validated clinical coverage.

## Coordinate frame

`RAS_ORGAN_REFERENCE`, millimetres:

- `+x` = right
- `+y` = anterior
- `+z` = superior
- origin = centre of the reference organ set

The meshes are centred together; relative organ positions are preserved. The
frontend uses a z-up scene and standard views. In the anterior view, patient
right appears on the viewer's left (radiological convention).

Patient image metadata instead uses **LPS physical millimetres**. Reordering
voxel axes toward RAS does not turn SITK metadata into RAS. Patient meshes use
a centered preview display frame, with `center_mm = (dims - 1) * spacing / 2`.
An explicit transform is required between patient LPS, centered preview and
`RAS_ORGAN_REFERENCE`; the atlas origin is not a patient image origin.

Cardiac atlas registration is implemented for research using explicit chamber
semantics. Observed landmarks and mapped reference points remain separate;
invalid/duplicate labels and degenerate geometry fail closed. Landmark fit RMS
is not target accuracy, which remains `not_evaluated`. A mapped target is still
a reference point, not a detected lesion. See [registration](atlas-registration.md).

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
| `BRAIN` | Brain | nervous | BodyParts3D |
| `HEART` | Heart | cardiovascular | BodyParts3D |
| `LUNG_R` | Right lung | respiratory | HRA |
| `LUNG_L` | Left lung | respiratory | HRA |
| `TRACHEA` | Trachea | respiratory | BodyParts3D |
| `SMALL_INTESTINE` | Small intestine | digestive | BodyParts3D |
| `LARGE_INTESTINE` | Large intestine | digestive | BodyParts3D |
| `URINARY_BLADDER` | Urinary bladder | urinary | BodyParts3D |
| `ESOPHAGUS` | Esophagus | digestive | BodyParts3D |
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

## Detailed sub-structures

Fourteen organs have a `<CODE>_detail.glb` with named sub-structures. The frontend
loads details on demand and supports part visibility and focus. Trachea, stomach,
gallbladder, urinary bladder and esophagus currently have whole-organ surfaces
without a separate named-detail catalogue.

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
| STOMACH / GALLBLADDER / TRACHEA / URINARY_BLADDER / ESOPHAGUS | no named details | whole-organ surface |

## Targets and simulation

`shared/organ_targets.json` defines 109 reference targets. The following illustrates target fields; display text is shown in English:

```json
{
  "id": "CHAMBER_LV",
  "organ": "HEART",
  "name": "Left ventricular cavity",
  "category": "chamber",
  "partCode": "HEART_PART_006",
  "coordinateMm": [-45.3, 18.6, 99.0],
  "standardView": "anterior",
  "approach": "anterior",
  "reference": "BodyParts3D",
  "description": "Reference chamber center"
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

The internal cardiac segmentation adapter retains its 1–7 project label map.
External label IDs do not imply anatomy: imported masks require explicit codes,
and TotalSegmentator filenames are mapped by semantic structure. Its
`pulmonary_artery` output must not become the project's `CALC` label. The catalog
maps semantic labels to stable standard codes:

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
    "color": "#c45258",
    "centerMm": [-25.1, 21.2, 110.3],
    "sizeMm": [115.6, 106.3, 104.6],
    "mesh": { "type": "glb", "asset": "organs/HEART.glb" },
    "detailAsset": "organs/HEART_detail.glb",
    "parts": [{ "code": "HEART_PART_006", "name": {"code": "HEART_PART_006", "params": {}}, "kind": "chamber", "node": "HEART_PART_006", "centerMm": [-45.3, 18.6, 99.0], "sizeMm": [64, 66, 72] }],
    "renderable": true,
    "segLabels": ["LV", "RV", "LA", "RA", "MYO"],
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
- Externally validate the implemented cardiac atlas-to-patient research registration; fit residual is not target accuracy.
- Patient-specific case linking: map measured lesions to the reference targets
  without ever presenting the reference anatomy as patient anatomy.
- Keep all additions licensed and provenance-tracked.

Implemented software and synthetic/mock acceptance do not establish clinical accuracy.
The AI report interface is implemented but acceptance has no real API key/cloud call;
real model-weight inference is also unverified. Report version/hash approval and
longitudinal comparison are implemented; individual event prediction is absent.
See [roadmap](roadmap.md) and [clinical boundaries](clinical-boundaries.md).
