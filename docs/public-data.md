# Public imaging import (NIfTI)

This research path accepts an image and an existing annotation mask and marks
the study `source=public_dataset`. It does not automatically segment the image
or run DICOM de-identification. Dataset names and label semantics are user
declarations; `dataset_verification=user_declared` does not verify public origin,
consent, licensing or clinical validity.

## Input requirements

- Both files must be scalar 3D `.nii` or `.nii.gz`.
- Image intensities are interpreted as CT HU; this assumption is not verified
  for arbitrary images.
- Geometry requires finite origin/direction, positive finite spacing and an
  orthonormal direction matrix. Label-grid corners must fit within the image
  field of view.
- Labels are finite integer IDs in [0, 65535], with at least one nonzero voxel;
  0 is background.
- Equal array shape is not required. Reversed axes and cropped label grids can
  be accepted when physically aligned. Resampling uses physical coordinates.

ImageCAS or converted ASOCA cases are possible inputs, not verified integrations.
This endpoint does not directly import NRRD/STL; conversion must preserve
geometry and semantics. Verify the actual source's data-use terms separately.

## UI and API

Open **检查工作台 → 公开数据导入（NIfTI）**, select the image/labels, enter a
dataset name and optionally a label map. Use **使用冠脉标签 1 映射** only when the
source documentation confirms label 1 means coronary anatomy. Leaving it blank
imports ordinary numbered structures.

```http
POST /api/public/import?lang=zh
Content-Type: multipart/form-data

image=@case.nii.gz
labels=@labels.nii.gz
dataset=ImageCAS
label_map={"1":{"code":"CORONARY_TREE","name":"冠脉树","color":[196,82,88]}}
```

The `202` response contains a study bundle and job. Poll
`GET /api/jobs/{job_id}` or reload `GET /api/studies/{study_id}` to check completion;
geometry/label errors may appear as failed background jobs. Input files are
stored separately even when their upload filenames match, and SHA-256 hashes
are retained in provenance.

## Report language

The generation query accepts `lang=en` or `lang=zh`; omission defaults to en.
The example above requests Chinese explicitly. lang is a URL query parameter,
not a multipart field, and `Accept-Language` does not select it. Values other than
en/zh (including zh-CN) return HTTP 400 `INVALID_LANG` before import is queued.

The import job retains the requested language and uses it for its template
report. New reports store `content.lang` and `content.provenance.lang`. The saved
text/language stays fixed when read or approved; changing the UI language does
not translate a stored report. Later AI generation can explicitly choose either
language for a new version, including its template fallback. Historical snapshots
and legacy `content.language` fields remain as stored; reads do not migrate them.
Dataset titles, custom label names and other source metadata are not necessarily
translated by report generation. See [AI reporting](ai-reporting.md).

## Label semantics

Without a mapping, every nonzero ID becomes `LABEL_<id>`: label 1 is **LABEL_1,
not CORONARY_TREE**. The dataset title never changes this behavior.

Mappings use present, nonzero integer label IDs as JSON keys. Values can be code
strings or objects with code/name and optional RGB color. Codes are uppercased
and must be unique; RGB components must be integers in [0, 255]. Unmapped IDs
receive numbered defaults. For two verified coronary branches:

```json
{
  "1": {"code": "CORONARY_LAD", "name": "LAD", "color": [196, 82, 88]},
  "2": {"code": "CORONARY_LCX", "name": "LCX", "color": [86, 132, 190]}
}
```

The current analysis selects codes containing `CORONARY`; `LAD` or `LCX` alone
does not trigger it. Selected coronary labels are analyzed as one union for
global metrics, while each structure retains its own surface/volume. These
codes are caller assertions, not anatomy detection.

## Native measurements and display outputs

Native labels and their spacing/origin/direction are preserved in
`native_labels.npy` and provenance. Separately, the importer produces an
isotropically resampled image, a bounded-resolution uint8 preview and
nearest-neighbour display labels.

- `<CODE>_VOLUME` uses native voxel count × native voxel volume, in mL, with
  `measurement_grid=native_label`.
- GLB surfaces come from native labels and retain disconnected annotated
  components. Extraction pads image borders; complex surfaces may be decimated.
- Thin structures missing from the preview mask generate warnings; their native
  measurements and surfaces are retained.
- Physical metadata remains LPS mm. Surfaces are transformed into the preview
  display frame before centring/scaling; see [architecture.md](architecture.md).

## Research outputs and limits

Explicit coronary masks enable deterministic skeleton/centerline analysis:
longest-path length, total skeleton length, longest-path diameter statistics
and radius-profile stenosis candidates. Diameter statistics do not cover every
branch. These outputs have `validationStatus=research`. Analysis failures create
a reasoned `not_computed` entry; valid label surfaces/volumes may remain available.

Atlas registration is attempted using explicit chamber semantics. Missing or
invalid chamber landmarks yield `not_computed`. A coronary-only mask does not
establish chamber landmarks; mapped reference targets and fit RMS do not
establish lesion localization or independent target accuracy.

The pipeline generates a template report. Clinical stenosis degree, FFR-CT,
EF, Agatston score and AHA perfusion/viability remain `not_computed`. Stenosis
candidates are not validated QCA. Optional [AI drafts](ai-reporting.md) verbalize
existing facts only.

`validationStatus=public_dataset` describes the import path, not validation of
the annotation or a model. The repository has synthetic import/geometry tests
and `server/scripts/validate_public_case.py` for comparing prediction/reference
masks. Having these tools does not establish completed external-dataset
evaluation or clinical readiness.
