# Public-case validation harness

This document describes the research-only harness for scoring a predicted
coronary-artery (or other cardiovascular) label mask against a public reference
annotation, initially ImageCAS and ASOCA.

> **Research use only.** The harness and every report it produces are for
> research evaluation. They are not a medical device, have not been cleared or
> approved by any regulator, and must not be used for diagnosis, treatment
> planning, or any other clinical decision. A Dice score on a public dataset is
> not evidence of clinical safety, effectiveness, or fitness for use.

## Components

| Path | Purpose |
| --- | --- |
| `server/app/metrics.py` | NumPy/SciPy implementations of Dice, Jaccard, HD95, ASSD, volume error, and centroid distance. |
| `server/tests/test_metrics.py` | Known-answer synthetic tests, including empty-mask and anisotropic-spacing cases. |
| `server/scripts/validate_public_case.py` | CLI that loads two NIfTI files with SimpleITK, validates their grids, computes metrics, and writes a JSON report. |
| `docs/public-validation.md` | This usage, licensing, interpretation, and model-card guide. |

The metrics module treats any value greater than zero as foreground. The CLI
extracts exactly one label value (default `1`) from each file before computing
metrics, so it can be used with binary masks or multi-label maps.

## Quick start

Run from the `server` directory:

```bash
cd server

.venv/bin/python scripts/validate_public_case.py \
  --pred /data/imagecas/predictions/case_001.nii.gz \
  --gt /data/imagecas/annotations/case_001.nii.gz \
  --label 1 \
  --out reports/imagecas-case_001.json \
  --model-name cardioscope-coronary \
  --model-version 0.1.0 \
  --dataset-name ImageCAS \
  --case-id case_001 \
  --dataset-license Apache-2.0
```

The script prints a short summary and writes a JSON report. Exit code `0` means
the metrics were computed; exit code `1` means a validation error (missing file,
different grid, absent ground-truth label, and so on). The error is printed to
stderr.

### CLI reference

| Flag | Meaning |
| --- | --- |
| `--pred` | Prediction NIfTI (`.nii` or `.nii.gz`). Required. |
| `--gt` | Ground-truth NIfTI. Required. |
| `--label` | Foreground label value extracted from both files. Default `1`. |
| `--spacing` | Optional spacing override in **NIfTI `(x, y, z)` order**, comma- or space-separated, e.g. `0.5,0.5,1.0`. Defaults to the ground-truth header. |
| `--out` | JSON report path. Default `validation_report.json`. |
| `--model-name`, `--model-version` | Model metadata written into the report. |
| `--dataset-name`, `--case-id`, `--dataset-license` | Dataset metadata written into the report. |

`--spacing` changes only the metric computation; it does **not** resample any
image. Use it only when the NIfTI header is known to be wrong, and record why
in your experiment log.

### Grid rule: no silent resampling

The prediction and ground truth must have the same:

- image size / array shape,
- voxel spacing,
- origin,
- direction cosines.

If any of these differ, the CLI stops with an explanatory error. Resample the
prediction externally (for example with SimpleITK) and document the
interpolation method, target grid, and software version. This prevents a
prediction from being implicitly scored on a grid it was not generated on.

### Output report

The JSON report contains:

- a research-only disclaimer and `research_only: true`;
- UTC timestamp, git commit when available, and a dirty-tree flag;
- model and dataset metadata (placeholders by default);
- input paths, label, array shape, spacing and spacing source, voxel counts, and
  foreground volumes;
- Dice, Jaccard, HD95, ASSD, absolute volume error, and centroid distance;
- warnings (for example, an empty prediction).

Null (`null`) distance values mean the quantity was undefined, usually because
one mask was empty. They must not be interpreted as zero error.

## Running on ImageCAS

1. Obtain ImageCAS from its official distribution (the Kaggle release and the
   dataset repository linked from the paper) and record the release date,
   version, and file hashes.
2. Keep the data outside this repository. Do not commit images, labels, or
   derived patient data.
3. Make predictions on the same voxel grid as the reference labels. If your
   pipeline uses a different target grid, resample externally before running
   the harness.
4. Check the label convention in the release you downloaded. Use `--label 1` if
   the foreground is `1`; use the appropriate value (for example `255`) if the
   release encodes the mask differently.
5. Run the harness per case, then aggregate the JSON reports in your analysis
   script. Report per-case values and an aggregate with a stated statistic
   (mean, median, standard deviation, and confidence interval).

Example batch loop:

```bash
cd server

for gt in /data/imagecas/annotations/*.nii.gz; do
  case="$(basename "$gt" .nii.gz)"
  .venv/bin/python scripts/validate_public_case.py \
    --pred "/data/imagecas/predictions/${case}.nii.gz" \
    --gt "$gt" \
    --label 1 \
    --out "reports/imagecas-${case}.json" \
    --model-name cardioscope-coronary \
    --model-version 0.1.0 \
    --dataset-name ImageCAS \
    --case-id "$case" \
    --dataset-license Apache-2.0
done
```

ImageCAS is distributed as NIfTI in the commonly used release, so conversion is
usually unnecessary.

## Running on ASOCA

1. Request access through the official ASOCA distribution channel and accept
   its data-use terms. Access commonly requires evidence of ethics review or a
   waiver.
2. ASOCA distributions may provide NRRD (and STL) rather than NIfTI. Convert
   images and reference masks to NIfTI with SimpleITK **without changing the
   grid**, for example:

   ```python
   import SimpleITK as sitk

   image = sitk.ReadImage("case.nrrd")
   sitk.WriteImage(image, "case.nii.gz")
   ```

   Confirm that the converted prediction and reference have the same size,
   spacing, origin, and direction before scoring.
3. ASOCA includes normal and diseased cases. Record which subset a case belongs
   to and report results separately where relevant. Do not use the withheld
   test annotations in a way that violates the challenge terms.
4. Run the same CLI shown above, with `--dataset-name ASOCA` and the license
   identifier from the agreement you accepted.

## Dataset licensing and access caveats

This is a practical summary, not legal advice. Verify the terms of the exact
release you download and the agreement you accept.

### ImageCAS

- Multiple catalogues and the Kaggle listing describe ImageCAS as
  **Apache-2.0**. Verify this on the download page and in the files shipped with
  the release; catalogue metadata can lag behind the dataset owner's terms.
- Apache-2.0 permits broad reuse, but it does not automatically cover
  third-party source images or remove institutional obligations. Cite the
  ImageCAS paper and preserve the license notice.
- Do not redistribute source volumes or derived per-patient outputs unless the
  license and your institution's rules allow it.

### ASOCA

- ASOCA is governed by a **data-use agreement** and an access request process,
  commonly with an ethics-review/waiver requirement.
- **Commercial use is restricted unless the exact agreement you accepted
  explicitly permits it.** Some secondary summaries of ASOCA are more
  permissive than the access terms; do not rely on a paper abstract or a
  third-party catalogue entry. Treat ASOCA as research-only unless your
  institutional/legal review confirms otherwise.
- Do not redistribute ASOCA images, annotations, or derived patient data.
  Follow the challenge's rules for the withheld test set and for publication of
  results.

### General

- Public datasets are not automatically de-identified for your jurisdiction.
  Follow institutional data-governance and privacy requirements.
- Record dataset name, release/version, access date, file hashes, and the
  license or DUA identifier in every report.
- Keep public-data studies separate from the clinical upload path in this
  application.

## Metric interpretation

All distances are in millimetres and depend on voxel spacing. The CLI takes
spacing from the NIfTI header unless `--spacing` is supplied explicitly; the
metrics module expects spacing in NumPy array order, and the CLI converts the
SimpleITK `(x, y, z)` header order accordingly.

### Dice and Jaccard

- **Dice** = `2 |P ∩ G| / (|P| + |G|)`.
- **Jaccard** = `|P ∩ G| / |P ∪ G|`.
- Both measure voxel overlap and range from 0 to 1.
- Two empty masks return 1.0 by convention; one empty mask returns 0.0.
- They are sensitive to structure size. A high whole-tree Dice can coexist with
  missed thin branches, discontinuities, or a missed stenosis.
- Do not compare Dice across datasets with different annotation protocols,
  label definitions, or voxel sizes without stating those differences.

### HD95 and ASSD

- **HD95** is the 95th percentile of pooled bidirectional surface distances.
  It is a tail measure and is sensitive to small disconnected errors and
  outliers.
- **ASSD** is the mean of the pooled bidirectional surface distances. It is
  less tail-sensitive but still dominated by the surface-voxel distribution.
- The implementation uses `scipy.ndimage.distance_transform_edt` on the
  boundary voxels of each mask, with 6-connectivity in 3D.
- HD95/ASSD return `null`/`None` when exactly one mask is empty and 0.0 when
  both are empty. Never report a null distance as a perfect score.
- Surface metrics still do not capture centerline continuity, branch topology,
  or stenosis severity. Pair them with centerline/topology analyses when those
  are part of the research question.

### Volume error and centroid distance

- **Volume error** is the absolute difference in foreground volume, in
  millilitres (`1 mL = 1000 mm³`). It can be zero even when the shapes differ.
- **Centroid distance** is the distance between foreground centroids in
  millimetres. It is a coarse global-displacement check, not a local accuracy
  measure, and is `null` if either mask is empty.

### Reporting recommendations

- Report per-case metrics, not only the mean.
- State the dataset release, label definition, preprocessing, grid, spacing
  source, and whether any external resampling was performed.
- Use the same grid, spacing, and label extraction for every method compared.
- Consider subgroup results (normal vs diseased, vessel/branch level) and
  confidence intervals.
- Do not select a clinical threshold or claim clinical utility from these
  metrics alone.

## Model-card template

Copy this template into the experiment record or model registry entry. Replace
every placeholder; do not leave defaults in a published report.

```markdown
# Model card: <model name> <version>

## Intended use
- Research use only, not for clinical diagnosis or treatment planning.
- Target task: <coronary artery segmentation / other>.
- Intended users: <research engineers / data scientists>.
- Out-of-scope uses: <clinical decision-making, triage, screening, ...>.

## Model and provenance
- Architecture: <...>
- Checkpoint / commit: <...>
- Training data: <dataset names, versions, licenses, patient counts>.
- External validation data: <dataset names, versions, access dates>.
- Preprocessing: <HU windowing, resampling, orientation, normalization>.
- Inference grid and spacing: <...>.
- Output label definition: <e.g. binary coronary tree, label value 1>.

## Evaluation
- Reference annotation protocol: <...>.
- Dataset release and case list/hash: <...>.
- Metrics: Dice, Jaccard, HD95 (mm), ASSD (mm), volume error (mL),
  centroid distance (mm).
- Per-case and aggregate results: <table or report paths>.
- Empty-mask handling and any excluded cases: <...>.
- Resampling performed externally: <method and target grid, or "none">.

## Limitations
- <small-vessel performance, annotator variability, scanner/protocol shift,
  class imbalance, failure modes>.
- Metrics are not evidence of clinical safety or effectiveness.

## Ethics, licensing, and contacts
- Dataset license / DUA: <identifier and access date>.
- Data governance approval: <...>.
- No clinical claims are made.
- Contact: <...>.
```

## Rule: no clinical claims

No report, dashboard, README, paper, or model card produced from this harness
may claim that the model diagnoses disease, identifies a clinical stenosis,
predicts patient outcome, or is ready for clinical use. Public-dataset metrics
describe agreement with a research annotation on a specific dataset release.
They do not establish safety, effectiveness, generalizability, or regulatory
clearance. Any clinical use requires separate validation, regulatory review,
and prospective clinical evidence.

## Tests

Run the metrics tests and the full backend suite from `server`:

```bash
.venv/bin/python -m pytest tests/test_metrics.py -q
.venv/bin/python -m pytest -q
```
