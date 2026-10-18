# Atlas-to-patient registration (research)

This module maps the **reference heart atlas and its reference targets** into a
patient study's preview coordinate frame. It is the first step from a reference
atlas toward patient-specific targeting, but it is **not a validated
registration and not a navigation system**.

## Method

1. Read the patient segmentation label map (`LV`, `RV`, `LA`, `RA` values).
2. Compute each chamber centroid in the preview-centered millimetre frame.
3. Read the reference chamber targets (`CHAMBER_LV`, `CHAMBER_RV`,
   `CHAMBER_LA`, `CHAMBER_RA`) from `shared/organ_targets.json`.
4. Solve an Umeyama similarity transform (scale + rotation + translation) from
   the reference chamber points to the patient chamber points.
5. Map every reference `HEART` target into the patient frame.
6. Store:
   - `ATLAS_REGISTRATION_RMS` (mm), `ATLAS_REGISTERED_TARGETS` (count)
   - `derived/atlas_registration.json` with the transform, landmarks, residuals
     and mapped targets
   - an audit event.

The endpoint `GET /api/studies/{id}/registration` returns the JSON artifact.

## Quality and provenance

- The residual (`RMS`) is the root-mean-square distance between the mapped
  reference chambers and the patient chamber centroids. It is a fit metric, not
  a clinical registration accuracy.
- The artifact records the scale, rotation, translation, landmark residuals and
  the reference/mapped target coordinates.
- Without at least three chamber labels, registration is `not_computed` with a
  reason.

## Limitations

- Only four chamber centroids are used; there is no intensity-based or
  deformable registration.
- Reference targets are **reference anatomy**, not patient lesions or
  pathology.
- The method is not externally validated; there is no clinical accuracy claim.
- It must not be used for surgical navigation, biopsy planning or treatment
  decisions.
- The patient preview frame is centered and may differ from the original DICOM
  patient coordinates; use the recorded transform for traceability.

## Next steps

- Add more landmarks (aortic root, valves, great vessels) and assess landmark
  error on public data.
- Add intensity-based refinement and a registration QC score.
- Link validated patient-specific lesions to registered targets; never present
  reference anatomy as patient pathology.
- Validate on public cohorts and document accuracy before any clinical use.
