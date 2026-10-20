from __future__ import annotations

from pathlib import Path

import numpy as np
import SimpleITK as sitk
from fastapi.testclient import TestClient

from app.main import app


def _write_case(root: Path) -> tuple[Path, Path]:
    array = np.full((64, 64, 64), -500.0, dtype=np.float32)
    z, y, x = np.indices(array.shape)
    mask = (((z - 32) ** 2 + (y - 32) ** 2) < 8**2) & (x > 6) & (x < 58)
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
                data={"dataset": "synthetic_public", "label_map": '{"1":"CORONARY_TREE"}'},
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
        assert measurements["CORONARY_CENTERLINE_LENGTH"]["status"] == "computed"
        assert measurements["CORONARY_CENTERLINE_LENGTH"]["value"] > 0
        assert measurements["CORONARY_MIN_DIAMETER"]["value"] > 0
        assert measurements["CORONARY_STENOSIS_CANDIDATES"]["status"] == "computed"
        assert measurements["STENOSIS"]["status"] == "not_computed"
        assert len(bundle["reports"]) == 1


def test_same_filename_upload_preserves_native_label_and_input_hashes(tmp_path):
    import hashlib
    import json
    from app.db import SessionLocal
    from app.models import Study
    from app.storage import storage

    labels = np.zeros((18, 24, 32), dtype=np.uint16)
    labels[3:14, 6:18, 7:22] = 300
    image = sitk.GetImageFromArray(np.where(labels, 330, -800).astype(np.float32))
    image.SetSpacing((0.5, 0.75, 1.25))
    image.SetOrigin((33, -22, 11))
    mask = sitk.GetImageFromArray(labels)
    mask.CopyInformation(image)
    image_path, mask_path = tmp_path / "image.nii.gz", tmp_path / "mask.nii.gz"
    sitk.WriteImage(image, str(image_path))
    sitk.WriteImage(mask, str(mask_path))
    with TestClient(app) as client:
        response = client.post("/api/public/import", files={
            "image": ("case.nii.gz", image_path.read_bytes(), "application/gzip"),
            "labels": ("case.nii.gz", mask_path.read_bytes(), "application/gzip"),
        }, data={"dataset": "synthetic_geometry_validation",
                 "label_map": json.dumps({"300": "TEST_STRUCTURE"})})
        assert response.status_code == 202
        bundle = response.json()["study"]
        assert bundle["study"]["status"] == "ready"
        measurement = next(m for m in bundle["measurements"] if m["code"] == "TEST_STRUCTURE_VOLUME")
        expected = round(np.count_nonzero(labels) * 0.5 * 0.75 * 1.25 / 1000, 2)
        assert measurement["value"] == expected
        assert measurement["provenance"]["measurement_grid"] == "native_label"
        with SessionLocal() as db:
            study = db.get(Study, bundle["study"]["id"])
            meta = study.fixture_meta
            assert meta["image_path"] != meta["labels_path"]
            assert storage.path_for(meta["image_path"]).read_bytes() == image_path.read_bytes()
            assert storage.path_for(meta["labels_path"]).read_bytes() == mask_path.read_bytes()
            assert meta["input_hashes"]["image"] == hashlib.sha256(image_path.read_bytes()).hexdigest()
            assert meta["input_hashes"]["labels"] == hashlib.sha256(mask_path.read_bytes()).hexdigest()
        assert not any(m["code"].startswith("CORONARY_") for m in bundle["measurements"])


def test_unmapped_binary_mask_is_not_automatically_a_coronary_tree(tmp_path):
    image_path, labels_path = _write_case(tmp_path)
    with TestClient(app) as client:
        response = client.post("/api/public/import", files={
            "image": ("image.nii.gz", image_path.read_bytes(), "application/gzip"),
            "labels": ("labels.nii.gz", labels_path.read_bytes(), "application/gzip"),
        }, data={"dataset": "synthetic_unmapped"})
        bundle = response.json()["study"]
        assert bundle["study"]["status"] == "ready"
        assert bundle["meshes"][0]["structureCode"] == "LABEL_1"
        assert not any(m["code"].startswith("CORONARY_") for m in bundle["measurements"])


def test_skeleton_component_loss_preserves_models_but_suppresses_analysis(tmp_path):
    import json

    labels = np.zeros((40, 40, 40), dtype=np.uint16)
    labels[5:35, 5:9, 5:9] = 1  # Lee thinning removes this even-width component.
    labels[5:35, 25:30, 25:30] = 300
    image = sitk.GetImageFromArray(np.where(labels, 320, -800).astype(np.float32))
    image.SetSpacing((0.5, 0.75, 1.25))
    mask = sitk.GetImageFromArray(labels)
    mask.CopyInformation(image)
    image_path, mask_path = tmp_path / "image.nii.gz", tmp_path / "labels.nii.gz"
    sitk.WriteImage(image, str(image_path))
    sitk.WriteImage(mask, str(mask_path))

    with TestClient(app) as client:
        response = client.post("/api/public/import", files={
            "image": ("image.nii.gz", image_path.read_bytes(), "application/gzip"),
            "labels": ("labels.nii.gz", mask_path.read_bytes(), "application/gzip"),
        }, data={"dataset": "synthetic_skeleton_loss_validation",
                 "label_map": json.dumps({"1": "CORONARY_LEFT", "300": "CORONARY_RIGHT"})})
        assert response.status_code == 202, response.text
        bundle = response.json()["study"]
        assert bundle["study"]["status"] == "ready"
        assert {m["structureCode"] for m in bundle["meshes"]} == {
            "CORONARY_LEFT", "CORONARY_RIGHT",
        }
        measurements = {m["code"]: m for m in bundle["measurements"]}
        for code in ("CORONARY_LEFT_VOLUME", "CORONARY_RIGHT_VOLUME"):
            assert measurements[code]["status"] == "computed"
            assert measurements[code]["value"] > 0
        failed = measurements["CORONARY_TREE_CENTERLINE"]
        assert failed["status"] == "not_computed"
        assert failed["value"] is None
        assert "component 1 uncovered" in failed["reason"]
        assert "CORONARY_CENTERLINE_LENGTH" not in measurements
        assert "CORONARY_MIN_DIAMETER" not in measurements
        assert "CORONARY_STENOSIS_CANDIDATES" not in measurements
