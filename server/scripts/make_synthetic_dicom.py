#!/usr/bin/env python3
"""Generate a deterministic synthetic CCTA DICOM series with matching labels.

The fixture exists to verify the ingest -> volume -> segmentation -> mesh path.
It is not a patient and must not be presented as clinical data.
"""

from __future__ import annotations

import argparse
import json
import zipfile
from pathlib import Path

import numpy as np
import pydicom
import SimpleITK as sitk
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian, generate_uid

ROWS = 256
COLS = 256
SLICES = 160
SPACING = 1.25
ORIGIN = np.array([-160.0, -160.0, -100.0])

UID_PREFIX = "1.2.826.0.1.3680043.10.999."


def _grid() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    # Return arrays in (z, y, x) order to match the DICOM pixel layout.
    z = ORIGIN[2] + np.arange(SLICES) * SPACING
    y = ORIGIN[1] + np.arange(ROWS) * SPACING
    x = ORIGIN[0] + np.arange(COLS) * SPACING
    return np.meshgrid(z, y, x, indexing="ij")


def _ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) -> np.ndarray:
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2


def make_arrays() -> tuple[np.ndarray, np.ndarray]:
    z, y, x = _grid()
    # Arrays are (z, y, x), matching DICOM slice/row/column order.
    hu = np.full(x.shape, -1024.0, dtype=np.float32)
    labels = np.zeros(x.shape, dtype=np.uint8)

    body = _ellipsoid(x, y, z, 0, 0, 0, 135, 105, 190)
    hu[body <= 1] = 42

    for sign in (-1, 1):
        lung = _ellipsoid(x, y, z, sign * 62, 0, 10, 48, 64, 125)
        hu[lung <= 1] = -845

    # Blood-pool chambers (contrast-enhanced).
    chambers = [
        (1, 24, 8, -4, 32, 30, 48),   # LV
        (2, -24, 12, -4, 26, 28, 44), # RV
        (3, 18, -28, 38, 26, 22, 26), # LA
        (4, -22, -26, 38, 24, 20, 24),# RA
    ]
    for value, cx, cy, cz, rx, ry, rz in chambers:
        inside = _ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) <= 1
        hu[inside] = 330
        labels[inside] = value

    # Aortic root / ascending aorta.
    aorta = _ellipsoid(x, y, z, 0, -14, 52, 17, 17, 70)
    hu[aorta <= 1] = 340
    labels[aorta <= 1] = 5

    # Myocardial shell around the LV.
    lv = _ellipsoid(x, y, z, 24, 8, -4, 32, 30, 48)
    shell = (lv > 1.0) & (lv <= 1.32) & (body <= 1)
    hu[shell] = 62
    labels[shell] = 6

    # A calcified plaque in the proximal LAD territory.
    calc = _ellipsoid(x, y, z, 26, 42, -12, 3.5, 3.5, 7.0) <= 1
    hu[calc] = 640
    labels[calc] = 7

    # Spine and sternum for anatomical context.
    spine = _ellipsoid(x, y, z, 0, -82, 0, 15, 15, 180) <= 1
    hu[spine] = 880
    sternum = (np.abs(x) < 12) & (y > 88) & (y < 96) & (z > -80) & (z < 90)
    hu[sternum] = 760

    # Mild deterministic noise so the data behaves like a reconstructed CT.
    rng = np.random.default_rng(20261017)
    noise = rng.normal(0, 7.0, size=hu.shape).astype(np.float32)
    hu = np.where(hu > -900, hu + noise, hu).astype(np.float32)

    return hu.astype(np.float32), labels.astype(np.uint8)


def write_dicom(hu_zyx: np.ndarray, out_dir: Path, uids: dict) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    files: list[Path] = []
    for index in range(hu_zyx.shape[0]):
        sop_uid = generate_uid(prefix=UID_PREFIX)
        file_meta = FileMetaDataset()
        file_meta.MediaStorageSOPClassUID = CTImageStorage
        file_meta.MediaStorageSOPInstanceUID = sop_uid
        file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
        file_meta.ImplementationClassUID = "1.2.826.0.1.3680043.10.999.1"

        ds = FileDataset(
            str(out_dir / f"{index:04d}.dcm"),
            {},
            file_meta=file_meta,
            preamble=b"\0" * 128,
        )
        ds.SOPClassUID = CTImageStorage
        ds.SOPInstanceUID = sop_uid
        ds.StudyInstanceUID = uids["study_uid"]
        ds.SeriesInstanceUID = uids["series_uid"]
        ds.FrameOfReferenceUID = uids["frame_uid"]
        ds.StudyDate = "20261017"
        ds.StudyTime = "094200"
        ds.Modality = "CT"
        ds.SeriesNumber = 3
        ds.InstanceNumber = index + 1
        ds.ImageType = ["ORIGINAL", "PRIMARY", "AXIAL"]
        ds.SeriesDescription = "CCTA 75% R-R"
        ds.StudyDescription = "Cardiac CTA"
        ds.KVP = 70
        ds.ConvolutionKernel = "B26f"
        ds.ContrastBolusAgent = "Iopamidol 320"
        ds.ContrastBolusVolume = 60

        # Deliberate PHI: tests assert that it does not survive de-identification.
        ds.PatientName = "PHI^TEST^PATIENT"
        ds.PatientID = "PHI-TEST-001"
        ds.PatientBirthDate = "19680101"
        ds.PatientSex = "M"
        ds.AccessionNumber = "ACC-PHI-001"
        ds.InstitutionName = "PHI TEST HOSPITAL"
        ds.ReferringPhysicianName = "PHI^REFERRER"

        ds.Rows = hu_zyx.shape[1]
        ds.Columns = hu_zyx.shape[2]
        ds.PixelSpacing = [SPACING, SPACING]
        ds.SliceThickness = SPACING
        ds.SpacingBetweenSlices = SPACING
        ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
        ds.ImagePositionPatient = [
            float(ORIGIN[0]),
            float(ORIGIN[1]),
            float(ORIGIN[2] + index * SPACING),
        ]
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.BitsAllocated = 16
        ds.BitsStored = 16
        ds.HighBit = 15
        ds.PixelRepresentation = 0
        ds.RescaleSlope = 1
        ds.RescaleIntercept = -1024
        ds.RescaleType = "HU"

        stored = np.clip(hu_zyx[index] + 1024, 0, 65535).astype(np.uint16)
        ds.PixelData = stored.tobytes()
        ds.save_as(str(out_dir / f"{index:04d}.dcm"), enforce_file_format=True)
        files.append(out_dir / f"{index:04d}.dcm")
    return files


def write_labels(labels_zyx: np.ndarray, path: Path) -> None:
    image = sitk.GetImageFromArray(labels_zyx.astype(np.uint8))
    image.SetSpacing((SPACING, SPACING, SPACING))
    image.SetOrigin(tuple(float(v) for v in ORIGIN))
    image.SetDirection((1, 0, 0, 0, 1, 0, 0, 0, 1))
    sitk.WriteImage(image, str(path))


def generate_fixture(out_dir: Path, *, zip_output: bool = True) -> dict:
    out_dir = out_dir.resolve()
    dicom_dir = out_dir / "dicom"
    uids = {
        "study_uid": generate_uid(prefix=UID_PREFIX),
        "series_uid": generate_uid(prefix=UID_PREFIX),
        "frame_uid": generate_uid(prefix=UID_PREFIX),
    }
    hu, labels = make_arrays()
    files = write_dicom(hu, dicom_dir, uids)
    labels_path = out_dir / "labels.nii.gz"
    write_labels(labels, labels_path)
    meta = {
        "kind": "synthetic_ccta",
        "patient": {"pseudonym": "SYNTHETIC-001", "sex": "M", "age_years": 58},
        "dicom_dir": str(dicom_dir),
        "labels_path": str(labels_path),
        "study_uid": uids["study_uid"],
        "series_uid": uids["series_uid"],
        "rows": ROWS,
        "cols": COLS,
        "slices": SLICES,
        "spacing_mm": [SPACING, SPACING, SPACING],
        "origin_lps_mm": ORIGIN.tolist(),
        "expected_hu": {"air": -1024, "soft_tissue": 42, "blood_pool": 330, "bone": 880},
        "warning": "Synthetic phantom. Not patient data. Not for clinical use.",
    }
    meta_path = out_dir / "fixture.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    zip_path = out_dir / "synthetic_ccta.zip"
    if zip_output:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for path in files:
                zf.write(path, arcname=f"dicom/{path.name}")
        meta["zip_path"] = str(zip_path)
    return meta


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="server/var/fixtures/synthetic_ccta")
    args = parser.parse_args()
    meta = generate_fixture(Path(args.out))
    print(json.dumps(meta, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
