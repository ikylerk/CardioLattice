# Public imaging import (NIfTI)

The public-data path lets a researcher bring a public CCTA volume and its label
map into the same study viewer used by the DICOM pipeline. It is explicitly
marked `source=public_dataset` and is separate from the clinical upload path.

> Public data is assumed to be de-identified and licensed for the intended use.
> This path does **not** run DICOM de-identification and is not a clinical upload.

## Supported input

- Image: NIfTI `.nii` / `.nii.gz`, assumed to be CT in HU.
- Labels: NIfTI `.nii` / `.nii.gz` on the same anatomical grid.
- Typical datasets:
  - **ImageCAS**: CCTA volumes + coronary artery labels. Check the Kaggle /
    official repository licence before use; several catalogues list Apache-2.0.
  - **ASOCA**: CCTA volumes + coronary labels (NRRD/STL); the challenge data
    agreement restricts some uses, so check the exact terms.
  - Other organ-label datasets can be imported with a custom label map.

## UI

1. Start the API and frontend (`npm run server:dev`, `npm run dev:api`).
2. Open **检查工作台** → **公开数据导入（NIfTI）**.
3. Choose the image and label files, set a dataset name, and optionally provide
   a label map.
4. Click **导入公开病例**. The pipeline resamples the image, aligns the labels,
   builds a preview volume, extracts surfaces and writes a draft report.
5. Open **CT 影像**, **三维解剖**, **定量分析** and the report to inspect the
   imported case.

## API

```http
POST /api/public/import
Content-Type: multipart/form-data

image=@case.nii.gz
labels=@labels.nii.gz
dataset=ImageCAS
label_map={"1":{"code":"CORONARY_TREE","name":"冠脉树","color":[196,82,88]}}
```

The response is `202` with a study bundle and job. Poll the study/job or use the
existing workbench polling; when the job succeeds the study status is `ready`.

### Label map

- Omit `label_map` and a single label `1` is treated as `CORONARY_TREE`.
- For multiple labels, provide a JSON object keyed by integer label value:
  ```json
  {
    "1": { "code": "LAD", "name": "LAD", "color": [196, 82, 88] },
    "2": { "code": "LCX", "name": "LCX", "color": [86, 132, 190] }
  }
  ```
- Each label becomes a GLB node and a `*_VOLUME` measurement.

## What the import does

- Resamples the image to isotropic spacing and builds an 8-bit preview volume.
- Resamples labels with nearest-neighbour interpolation and aligns them to the
  preview grid.
- Extracts one surface per label with marching cubes and exports a GLB.
- Computes label volume (voxel count × voxel volume) with
  `validationStatus=public_dataset`.
- If a label is marked as coronary (for example `CORONARY_TREE`), runs a
  deterministic research analysis: 3D skeletonization, centerline length,
  diameter profile and radius-profile stenosis candidates. Results are stored as
  `CORONARY_*` measurements with `validationStatus=research`.
- Generates a template report with `not_computed` entries for stenosis, FFR-CT,
  EF, calcium score, AHA perfusion and other unsupported outputs.

## What it does not do

- It does not run a clinical de-identification or consent workflow.
- It does not validate the public labels against a model.
- Its coronary centerline analysis is a deterministic mask analysis, not a
  validated QCA; candidate lesions are not clinical stenosis measurements.
- It does not compute FFR-CT, EF, calcium score, perfusion or viability.
- It does not claim that a label map is a clinical segmentation.

## Research next steps

1. Add a validated coronary lumen/centerline model (ImageCAS/ASOCA training and
   external test set).
2. Compare model predictions with the imported reference labels (Dice/HD95,
   centerline distance).
3. Compute patient-specific centerline/lumen metrics only after validation and
   model-registry approval.
4. Keep public and clinical data paths separate, with explicit provenance.
