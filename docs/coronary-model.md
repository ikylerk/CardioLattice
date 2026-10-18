# Coronary model and reference angiography analysis

The coronary model is a reference tree used by the angiography module for
segment-level teaching, projection selection and reference QCA analysis.

> It is **not** extracted from the patient and does not contain patient lesions.
> The QCA values are reference/synthetic; the FFR values are synthetic and must
> not be used for clinical decisions.

## Source

- Geometry/topology: the CardioScope reference coronary tree (teaching model).
- Segment diameters, lengths, projections and reference lesions: curated
  reference values for demonstration.
- No public patient imaging is bundled in this file.

## Segments

`shared/coronary_model.json` defines 17 segments:

| Segment | Vessel | Territory | Reference diameter | Reference length |
| --- | --- | --- | --- | --- |
| LM | LM | LAD/LCX | 4.5 mm | 12 mm |
| LAD_PROX | LAD | LAD | 3.5 mm | 25 mm |
| LAD_MID | LAD | LAD | 3.2 mm | 30 mm |
| LAD_DIST | LAD | LAD | 2.7 mm | 30 mm |
| D1 | D1 | LAD | 2.2 mm | 25 mm |
| D2 | D2 | LAD | 1.8 mm | 20 mm |
| LCX_PROX | LCX | LCX | 3.4 mm | 20 mm |
| LCX_MID | LCX | LCX | 3.0 mm | 25 mm |
| LCX_DIST | LCX | LCX | 2.6 mm | 30 mm |
| OM1 | OM1 | LCX | 2.2 mm | 25 mm |
| OM2 | OM2 | LCX | 1.8 mm | 20 mm |
| RCA_PROX | RCA | RCA | 4.0 mm | 30 mm |
| RCA_MID | RCA | RCA | 3.6 mm | 35 mm |
| RCA_DIST | RCA | RCA | 3.0 mm | 30 mm |
| AM | AM | RCA | 2.0 mm | 20 mm |
| PDA | PDA | RCA | 2.0 mm | 25 mm |
| PL | PL | RCA | 1.8 mm | 20 mm |

Each segment also lists the AHA 17-segment myocardial territories it supplies.

## Standard projections

The projection set follows the AngioView educational simulator standard:

| Left coronary | Angles |
| --- | --- |
| Spider | LAO 45 / CAU 35 |
| RAO caudal | RAO 30 / CAU 30 |
| AP caudal | RAO 10 / CAU 30 |
| AP cranial | RAO 10 / CRA 40 |
| LAO cranial | LAO 40 / CRA 35 |
| RAO cranial | RAO 30 / CRA 30 |
| Lateral | LAO 90 / 0 |
| AP | 0 / 0 |

| Right coronary | Angles |
| --- | --- |
| LAO | LAO 50 / 0 |
| RAO | RAO 30 / 0 |
| AP | 0 / 0 |
| AP cranial | 0 / CRA 30 |
| LAO cranial | LAO 40 / CRA 30 |

Each projection has an `optimalFor` segment list. Selecting a segment in the UI
automatically moves the C-arm to a recommended projection.

### Interaction layer

The AngioView module provides:

- a 3D heart + skeleton panel with Detector view, Foreshortening, Skeleton,
  See-through, Labels and Planes toggles;
- a 3D C-arm room with detector, X-ray tube, table and patient phantom that
  follows LAO/RAO and CRA/CAU;
- dominance (right / left / co), grafts (LIMA, SVG-OM, SVG-PDA) and Ramus
  intermedius controls;
- a Color overlay for the angiogram, cine/fluoro/DSA/bone modes;
- a segment explorer with reference diameter/length and AHA territories;
- support for the AngioView-style hash parameters
  `#a=-30&b=-30&sys=left`.

The reference interface standard is [AngioView](https://angioview.com); this
project is not affiliated with it.

## Reference analysis

The model contains two reference lesions:

- Left: LAD mid, 70% diameter stenosis, MLD 0.96 mm, RVD 3.20 mm, area stenosis
  84%, lesion length 18 mm, synthetic FFR 0.78.
- Right: RCA proximal, 30% diameter stenosis, MLD 2.80 mm, RVD 4.00 mm, area
  stenosis 42%, lesion length 10 mm, synthetic FFR 0.91.

These are **reference values**, not measurements from a patient. The UI labels
them as a reference model and shows `模型置信度 —` rather than inventing a
diagnostic confidence.

## Integration

- `src/components/AngioView.jsx` reads `shared/coronary_model.json`.
- The segment explorer highlights the selected vessel via
  `AngioEngine.setSelectedVessel(id)`, shows its reference diameter/length and
  AHA territories, and matches a recommended projection.
- "运行参考分析" drives the existing QCA-style panel from the model.
- Backend: `server/app/coronary_model.py` validates the JSON and
  `GET /api/coronary-model` exposes it.

## What is not implemented

- Centerline/lumen extraction from a patient's contrast-enhanced CCTA.
- Patient-specific QCA, plaque characterization or FFR-CT.
- Validation against QCA/IVUS or invasive FFR.
- Any clinical recommendation.

The next research step is to import a public annotated dataset (ImageCAS/ASOCA)
and run a validated coronary lumen/centerline model on the patient volume. See
[`public-data.md`](public-data.md).
