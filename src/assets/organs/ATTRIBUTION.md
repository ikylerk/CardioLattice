# Organ model attribution

[中文](ATTRIBUTION.zh-CN.md)

The organ GLB files in this directory and the derived target catalogue
(`shared/organ_targets.json`) are adapted
anatomical reference data. They are **CC BY 4.0**, not MIT. Repository code
remains MIT.

## BodyParts3D 4.0

- Source: BodyParts3D 4.0, Database Center for Life Science (DBCLS).
- Dataset: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- Required attribution: “BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International”.
- License: CC Attribution 4.0 International (CC BY 4.0).
  - Official license page (updated 2025-02-27): https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
  - The original OBJ headers reference the legacy CC BY-SA 2.1 Japan text; the
    distribution follows the official database notice linked above.
- Used for: brain, heart, stomach, gallbladder, small and large intestine,
  urinary bladder, esophagus, aorta, inferior vena cava, trachea, and the
  vertebral column.
- Adaptations: selected parts merged or exported as named sub-structures,
  simplified, axes/units converted to RAS millimetres, and the reference organ
  set centred at the origin.

## HuBMAP Human Reference Atlas v1.1

- Source: Human Reference Atlas (HRA), HuBMAP Consortium, v1.1 male reference
  organs: liver, lung, left/right kidney, spleen, pancreas.
- Dataset: https://github.com/hubmapconsortium/ccf-releases
- Versioned models: https://github.com/hubmapconsortium/ccf-releases/tree/main/v1.1/models
- License: CC Attribution 4.0 International (CC BY 4.0).
- Adaptations: selected node surfaces merged or exported as named sub-structures,
  simplified, aligned to the BodyParts3D reference frame, and converted to RAS
  millimetres.

## Derived details and targets

The 19-organ catalogue includes 14 named-detail assets and 109 reference targets.
Targets are derived from reference part centroids or morphological landmarks;
they retain the source attribution and do not describe patient lesions. All
source-based outer surfaces, detail surfaces and target data retain the stated
CC BY 4.0 attribution. Licence text: https://creativecommons.org/licenses/by/4.0/.
HRA-to-BodyParts3D alignment is a reference-data adaptation, not validation of
patient registration. Reference simulation adds no clinical navigation approval.

## Important

These models and targets are reference anatomy for orientation, teaching,
atlas display, registration placeholders and workflow simulation. They are not
derived from the patient and must not be used for diagnosis, measurement, or
treatment decisions.
