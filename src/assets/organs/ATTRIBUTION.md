# Organ model attribution

[中文](ATTRIBUTION.zh-CN.md)

The organ GLB files in this directory are adapted anatomical reference meshes.
They are **CC BY 4.0**, not MIT. The repository code remains MIT.

## BodyParts3D 4.0

- Source: BodyParts3D 4.0, Database Center for Life Science (DBCLS).
- Dataset: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- License: CC Attribution 4.0 International (CC BY 4.0).
  - Official license page (updated 2025-02-27): https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
  - The original OBJ headers reference the legacy CC BY-SA 2.1 Japan text; the
    current official database license supersedes it.
- Used for: heart, stomach, gallbladder, aorta, inferior vena cava, trachea,
  and the vertebral column.
- Adaptations: selected parts merged, simplified, axes/units converted to RAS
  millimetres, and the reference organ set centred at the origin.

## HuBMAP Human Reference Atlas v1.1

- Source: Human Reference Atlas (HRA), HuBMAP Consortium, v1.1 male reference
  organs: liver, lung, left/right kidney, spleen, pancreas.
- Dataset: https://github.com/hubmapconsortium/ccf-releases
- License: CC Attribution 4.0 International (CC BY 4.0).
- Adaptations: selected node surfaces merged, simplified, aligned to the
  BodyParts3D reference frame, and converted to RAS millimetres.

## Important

These models are reference anatomy for orientation, teaching, atlas display and
registration placeholders. They are not derived from the patient and must not be
used for diagnosis, measurement, or treatment decisions.
