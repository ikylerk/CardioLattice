from __future__ import annotations

from pathlib import Path

import numpy as np
import SimpleITK as sitk
from fastapi.testclient import TestClient

from app.main import app


def _write_case(root: Path) -> tuple[Path, Path]:
    array = np.full((64, 64, 64), -500.0, dtype=np.float32)
    z, y, x = np.indices(array.shape)
    mask = ((z - 32) ** 2 + (y - 32) ** 2 + (x - 32) ** 2) < 12**2
    array[mask] = 320.0
    image = sitk.GetImageFromArray(array)
    image.SetSpacing((1.5, 1.5, 1.5))
    image_path = root / "image.nii.gz"
    sitk.WriteImage(image, str(image_path))

    labels = np.zeros((64, 64, 64), dtype=np.uint8)
    labels[mask] = 1
    label_image = sitk.GetImageFromArray(labels)
    label_image.SetSpacing((1.5, 1.5, 1.5))
    labels_path = root / "labels.nii.gz"
    sitk.WriteImage(label_image, str(labels_path))
    return image_path, labels_path


def test_public_nifti_import(tmp_path):
    image_path, labels_path = _write_case(tmp_path)
    with TestClient(app) as client:
        with image_path.open("rb") as image, labels_path.open("rb") as labels:
            response = client.post(
                "/api/public/import",
                files={
                    "image": ("image.nii.gz", image, "application/gzip"),
                    "labels": ("labels.nii.gz", labels, "application/gzip"),
                },
                data={"dataset": "synthetic_public"},
            )
        assert response.status_code == 202, response.text
        payload = response.json()
        study_id = payload["study"]["study"]["id"]
        assert payload["study"]["study"]["source"] == "public_dataset"
        assert payload["study"]["study"]["status"] == "ready"

        bundle = client.get(f"/api/studies/{study_id}").json()
        assert bundle["study"]["status"] == "ready"
        assert len(bundle["volumes"]) == 1
        assert len(bundle["meshes"]) == 1
        assert bundle["meshes"][0]["structureCode"] == "CORONARY_TREE"
        measurements = {item["code"]: item for item in bundle["measurements"]}
        assert measurements["CORONARY_TREE_VOLUME"]["status"] == "computed"
        assert measurements["CORONARY_TREE_VOLUME"]["value"] > 0
        assert measurements["CORONARY_TREE_VOLUME"]["validationStatus"] == "public_dataset"
        assert measurements["STENOSIS"]["status"] == "not_computed"
        assert len(bundle["reports"]) == 1
