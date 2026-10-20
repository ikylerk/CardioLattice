from __future__ import annotations

import hashlib
import io
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import numpy as np
import pydicom
import SimpleITK as sitk
from pydicom.dataset import Dataset
from pydicom.uid import generate_uid
from scipy import ndimage

# Headers we intentionally keep for research/QC. Everything else is removed or
# replaced by the de-identification profile below.
KEEP_ATTRIBUTES = {
    "SOPClassUID",
    "SOPInstanceUID",
    "StudyInstanceUID",
    "SeriesInstanceUID",
    "FrameOfReferenceUID",
    "InstanceNumber",
    "ImagePositionPatient",
    "ImageOrientationPatient",
    "PixelSpacing",
    "SliceThickness",
    "SpacingBetweenSlices",
    "Rows",
    "Columns",
    "BitsAllocated",
    "BitsStored",
    "HighBit",
    "PixelRepresentation",
    "SamplesPerPixel",
    "PhotometricInterpretation",
    "RescaleSlope",
    "RescaleIntercept",
    "RescaleType",
    "Modality",
    "SeriesNumber",
    "SeriesDescription",
    "ImageType",
    "KVP",
    "ConvolutionKernel",
    "ContrastBolusAgent",
    "ContrastBolusVolume",
    "Manufacturer",
    "ManufacturerModelName",
    "SoftwareVersions",
}

PHI_TO_REMOVE = {
    "PatientName",
    "PatientID",
    "IssuerOfPatientID",
    "OtherPatientIDs",
    "OtherPatientIDsSequence",
    "PatientBirthDate",
    "PatientBirthTime",
    "PatientAddress",
    "PatientTelephoneNumbers",
    "PatientMotherBirthName",
    "MilitaryRank",
    "BranchOfService",
    "AccessionNumber",
    "InstitutionName",
    "InstitutionAddress",
    "InstitutionalDepartmentName",
    "ReferringPhysicianName",
    "ReferringPhysicianAddress",
    "ReferringPhysicianTelephoneNumbers",
    "PerformingPhysicianName",
    "OperatorsName",
    "PhysiciansOfRecord",
    "RequestingPhysician",
    "StationName",
    "DeviceSerialNumber",
    "StudyID",
    "StudyDescription",
    "SeriesDescription",
}

UID_TAGS = (
    "StudyInstanceUID",
    "SeriesInstanceUID",
    "SOPInstanceUID",
    "FrameOfReferenceUID",
)


@dataclass
class SeriesInfo:
    series_uid: str
    modality: str
    description: str
    series_number: int | None
    slice_count: int
    rows: int | None
    cols: int | None
    pixel_spacing: list[float] | None
    slice_thickness: float | None
    spacing_between_slices: float | None
    image_orientation: list[float] | None
    image_position_first: list[float] | None
    kvp: float | None
    kernel: str | None
    contrast_agent: str | None
    files: list[Path] = field(default_factory=list)
    score: float = 0.0
    reasons: list[str] = field(default_factory=list)


@dataclass
class SubjectInfo:
    patient_id_hash: str
    pseudonym: str
    sex: str | None
    age_years: int | None
    study_date: str | None
    study_description: str | None


@dataclass
class LoadedSeries:
    array_hu: np.ndarray  # (z, y, x) float32 HU, RAS axis order
    spacing_mm: tuple[float, float, float]  # x, y, z
    origin: tuple[float, float, float]
    direction: tuple[float, ...]
    warnings: list[str]
    subject: SubjectInfo


@dataclass
class PreviewVolume:
    data: np.ndarray  # uint8, C-order (z, y, x)
    dims: list[int]  # nx, ny, nz
    spacing: list[float]  # sx, sy, sz (mm)
    bounds_min: list[float]
    bounds_max: list[float]
    hu_range: list[float]
    origin: list[float]
    direction: list[float]
    affine: list[list[float]]
    default_slices: dict
    stats: dict
    crop_box_zyx: list[int] = field(default_factory=list)
    source_spacing: list[float] = field(default_factory=list)


def _as_list(value) -> list[float] | None:
    if value is None:
        return None
    try:
        return [float(item) for item in value]
    except (TypeError, ValueError):
        return None


def _first(rows: Iterable[Dataset], name: str, default=None):
    for row in rows:
        value = getattr(row, name, None)
        if value not in (None, ""):
            return value
    return default


def collect_dicom_paths(root: Path) -> list[Path]:
    """Collect candidate DICOM part-10 files, rejecting zip traversal entries
    before extraction elsewhere."""
    return sorted(path for path in root.rglob("*") if path.is_file())


def inspect_files(paths: list[Path]) -> list[SeriesInfo]:
    groups: dict[str, list[tuple[Path, Dataset]]] = {}
    for path in paths:
        try:
            ds = pydicom.dcmread(str(path), stop_before_pixels=True, force=True)
        except Exception:
            continue
        uid = getattr(ds, "SeriesInstanceUID", None)
        modality = getattr(ds, "Modality", "")
        if not uid or modality not in {"CT", "MR", "XA", "US"}:
            continue
        groups.setdefault(str(uid), []).append((path, ds))

    series: list[SeriesInfo] = []
    for uid, rows in groups.items():
        datasets = [row[1] for row in rows]
        info = SeriesInfo(
            series_uid=uid,
            modality=str(_first(datasets, "Modality", "")),
            description=str(_first(datasets, "SeriesDescription", "") or ""),
            series_number=getattr(datasets[0], "SeriesNumber", None),
            slice_count=len(rows),
            rows=getattr(datasets[0], "Rows", None),
            cols=getattr(datasets[0], "Columns", None),
            pixel_spacing=_as_list(getattr(datasets[0], "PixelSpacing", None)),
            slice_thickness=_as_float(getattr(datasets[0], "SliceThickness", None)),
            spacing_between_slices=_as_float(getattr(datasets[0], "SpacingBetweenSlices", None)),
            image_orientation=_as_list(getattr(datasets[0], "ImageOrientationPatient", None)),
            image_position_first=_as_list(getattr(datasets[0], "ImagePositionPatient", None)),
            kvp=_as_float(_first(datasets, "KVP", None)),
            kernel=_first(datasets, "ConvolutionKernel", None),
            contrast_agent=_first(datasets, "ContrastBolusAgent", None),
            files=[row[0] for row in rows],
        )
        info.score, info.reasons = score_series(info)
        series.append(info)
    return sorted(series, key=lambda item: item.score, reverse=True)


def _as_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def score_series(info: SeriesInfo) -> tuple[float, list[str]]:
    score = 0.0
    reasons: list[str] = []
    text = f"{info.description} {' '.join(str(item) for item in (info.reasons or []))}".lower()

    if info.modality == "CT":
        score += 10
        reasons.append("CT modality")
    if info.image_orientation:
        score += 2
        reasons.append("axial geometry")
    if info.slice_thickness is not None and info.slice_thickness <= 1.25:
        score += 3
        reasons.append("thin slices")
    if any(keyword in info.description.lower() for keyword in ("ccta", "cardiac", "coronary", "heart", "冠脉", "心脏")):
        score += 4
        reasons.append("cardiac protocol description")
    if info.contrast_agent:
        score += 2
        reasons.append("contrast agent present")
    if info.slice_count >= 64:
        score += 2
        reasons.append(">=64 slices")
    if info.slice_count < 16:
        score -= 50
        reasons.append("too few slices")
    if any(keyword in info.description.lower() for keyword in ("scout", "topogram", "localizer", "dose", "report")):
        score -= 100
        reasons.append("excluded non-diagnostic series")
    if info.modality != "CT":
        score -= 50
        reasons.append("non-CT series")
    return score, reasons


def choose_series(series: list[SeriesInfo]) -> tuple[SeriesInfo | None, bool]:
    """Return (candidate, ambiguous)."""
    candidates = [item for item in series if item.modality == "CT" and item.slice_count >= 16]
    if not candidates:
        return None, False
    if len(candidates) == 1:
        return candidates[0], False
    best = candidates[0]
    runner_up = candidates[1]
    ambiguous = best.score < 20 or (best.score - runner_up.score) < max(2.0, abs(best.score) * 0.2)
    return best, ambiguous


def read_study_meta(paths: list[Path]) -> dict:
    for path in paths:
        try:
            header = pydicom.dcmread(str(path), stop_before_pixels=True, force=True)
        except Exception:
            continue
        if getattr(header, "StudyInstanceUID", None):
            return {
                "study_uid": str(header.StudyInstanceUID),
                "accession": str(getattr(header, "AccessionNumber", "") or ""),
                "study_date": str(getattr(header, "StudyDate", "") or ""),
                "description": str(getattr(header, "StudyDescription", "") or ""),
            }
    return {
        "study_uid": generate_uid(prefix="2.25."),
        "accession": "",
        "study_date": "",
        "description": "",
    }


def subject_from_headers(paths: list[Path], salt: str) -> SubjectInfo:
    headers = []
    for path in paths:
        try:
            headers.append(pydicom.dcmread(str(path), stop_before_pixels=True, force=True))
        except Exception:
            continue
    first = headers[0] if headers else Dataset()
    raw_id = str(getattr(first, "PatientID", "ANON"))
    digest = hashlib.sha256(f"{salt}:{raw_id}".encode("utf-8")).hexdigest()
    birth = str(getattr(first, "PatientBirthDate", "") or "")
    study_date = str(getattr(first, "StudyDate", "") or "")
    age = None
    if len(birth) >= 4 and len(study_date) >= 4:
        try:
            age = max(0, int(study_date[:4]) - int(birth[:4]))
        except ValueError:
            age = None
    return SubjectInfo(
        patient_id_hash=digest,
        pseudonym=f"SUBJ-{digest[:4].upper()}",
        sex=str(getattr(first, "PatientSex", "") or "") or None,
        age_years=age,
        study_date=study_date or None,
        study_description=str(getattr(first, "StudyDescription", "") or "") or None,
    )


def deidentify_series(files: list[Path], out_dir: Path, salt: str) -> dict[str, str]:
    """Write de-identified copies and return the old→new UID map. Raw PHI is
    never persisted in the business database."""
    out_dir.mkdir(parents=True, exist_ok=True)
    uid_map: dict[str, str] = {}

    def mapped(value) -> str:
        old = str(value)
        if old not in uid_map:
            uid_map[old] = generate_uid(prefix="2.25.")
        return uid_map[old]

    for index, path in enumerate(files):
        ds = pydicom.dcmread(str(path), force=True)
        source_patient_id = str(getattr(ds, "PatientID", "") or "")
        for tag in UID_TAGS:
            if hasattr(ds, tag):
                setattr(ds, tag, mapped(getattr(ds, tag)))
        for tag in PHI_TO_REMOVE:
            if hasattr(ds, tag):
                delattr(ds, tag)
        ds.PatientIdentityRemoved = "YES"
        ds.DeidentificationMethod = "CardioScope research de-id v1"
        # Keep only a research pseudonym, never the source identifier.
        ds.PatientID = hashlib.sha256(f"{salt}:{source_patient_id}".encode()).hexdigest()[:16]
        ds.PatientName = "ANONYMOUS"
        target = out_dir / f"{index:05d}.dcm"
        ds.save_as(str(target), enforce_file_format=True)
        # save_as may rewrite UIDs depending on write_like_original; ensure map stays on disk.
    return uid_map


def load_series(files: list[Path], *, resample_mm: float = 1.5, salt: str = "local-research-salt") -> LoadedSeries:
    datasets: list[tuple[float, Dataset]] = []
    warnings: list[str] = []
    orientation = None
    for path in files:
        ds = pydicom.dcmread(str(path), force=True)
        if "PixelData" not in ds:
            continue
        if orientation is None:
            orientation = _as_list(getattr(ds, "ImageOrientationPatient", None))
        position = _as_list(getattr(ds, "ImagePositionPatient", None))
        if orientation and position:
            row = np.asarray(orientation[:3], dtype=float)
            col = np.asarray(orientation[3:], dtype=float)
            normal = np.cross(row, col)
            key = float(np.dot(np.asarray(position, dtype=float), normal))
        else:
            key = float(getattr(ds, "InstanceNumber", len(datasets)))
            if not warnings:
                warnings.append("ImagePositionPatient missing; falling back to InstanceNumber order")
        datasets.append((key, ds))

    if len(datasets) < 2:
        raise ValueError("selected series has fewer than two slices with pixel data")
    datasets.sort(key=lambda item: item[0])
    first = datasets[0][1]

    rows = int(first.Rows)
    cols = int(first.Columns)
    pixel_spacing = _as_list(getattr(first, "PixelSpacing", None)) or [1.0, 1.0]
    orientation = _as_list(getattr(first, "ImageOrientationPatient", None)) or [1, 0, 0, 0, 1, 0]

    arrays = []
    for _, ds in datasets:
        if int(ds.Rows) != rows or int(ds.Columns) != cols:
            raise ValueError("inconsistent Rows/Columns within the selected series")
        raw = ds.pixel_array.astype(np.float32)
        slope = _as_float(getattr(ds, "RescaleSlope", 1)) or 1.0
        intercept = _as_float(getattr(ds, "RescaleIntercept", 0)) or 0.0
        arrays.append(raw * slope + intercept)
    volume = np.stack(arrays, axis=0)

    row_dir = np.asarray(orientation[:3], dtype=float)
    col_dir = np.asarray(orientation[3:], dtype=float)
    normal = np.cross(row_dir, col_dir)
    normal = normal / (np.linalg.norm(normal) or 1.0)

    positions = [key for key, _ in datasets]
    diffs = np.diff(positions)
    spacing_z = float(np.median(np.abs(diffs))) if len(diffs) else float(
        getattr(first, "SpacingBetweenSlices", getattr(first, "SliceThickness", 1.0)) or 1.0
    )
    if spacing_z <= 0:
        spacing_z = float(getattr(first, "SliceThickness", 1.0) or 1.0)
    if len(diffs) and np.max(np.abs(np.abs(diffs) - spacing_z)) > max(0.01, spacing_z * 0.01):
        warnings.append("non-uniform slice spacing detected; resampled to a uniform grid")

    spacing_x = float(pixel_spacing[1])
    spacing_y = float(pixel_spacing[0])
    origin = _as_list(getattr(first, "ImagePositionPatient", None)) or [0.0, 0.0, 0.0]

    image = sitk.GetImageFromArray(volume)
    image.SetSpacing((spacing_x, spacing_y, spacing_z))
    image.SetOrigin(tuple(float(v) for v in origin))
    direction = (
        row_dir[0], col_dir[0], normal[0],
        row_dir[1], col_dir[1], normal[1],
        row_dir[2], col_dir[2], normal[2],
    )
    image.SetDirection(direction)

    # Resample to an isotropic grid; linear interpolation is appropriate for CT.
    size_mm = np.array(image.GetSize(), dtype=float) * np.array(image.GetSpacing(), dtype=float)
    out_size = [max(1, int(round(value / resample_mm))) for value in size_mm]
    resampled = sitk.Resample(
        image,
        out_size,
        sitk.Transform(),
        sitk.sitkLinear,
        image.GetOrigin(),
        (resample_mm, resample_mm, resample_mm),
        image.GetDirection(),
        -1024.0,
        sitk.sitkFloat32,
    )
    canonical = _to_ras(resampled)
    array_ras = sitk.GetArrayFromImage(canonical).astype(np.float32)
    spacing = tuple(float(v) for v in canonical.GetSpacing())
    origin_ras = tuple(float(v) for v in canonical.GetOrigin())
    direction_ras = tuple(float(v) for v in canonical.GetDirection())

    return LoadedSeries(
        array_hu=array_ras,
        spacing_mm=spacing,
        origin=origin_ras,
        direction=direction_ras,
        warnings=warnings,
        subject=subject_from_headers(files, salt=salt),
    )


def _to_ras(image: sitk.Image) -> sitk.Image:
    """Reorder voxel axes toward RAS while preserving physical LPS coordinates."""
    return sitk.DICOMOrient(image, "RAS")


def _crop_center(
    array: np.ndarray, spacing: tuple[float, float, float], size_mm: float
) -> tuple[np.ndarray, list[int]]:
    # array is (z, y, x)
    target = [int(round(size_mm / value)) for value in (spacing[2], spacing[1], spacing[0])]
    z, y, x = array.shape
    z0 = max(0, (z - target[0]) // 2)
    y0 = max(0, (y - target[1]) // 2)
    x0 = max(0, (x - target[2]) // 2)
    z1 = z0 + min(target[0], z)
    y1 = y0 + min(target[1], y)
    x1 = x0 + min(target[2], x)
    return array[z0:z1, y0:y1, x0:x1], [z0, z1, y0, y1, x0, x1]


def build_preview(
    loaded: LoadedSeries,
    *,
    max_dim: int = 192,
    crop_mm: float | None = 280.0,
) -> PreviewVolume:
    if max_dim < 2:
        raise ValueError("max_dim must be at least 2")
    if crop_mm is None:
        array = loaded.array_hu
        nz0, ny0, nx0 = array.shape
        crop_box = [0, nz0, 0, ny0, 0, nx0]
    else:
        array, crop_box = _crop_center(loaded.array_hu, loaded.spacing_mm, crop_mm)
    # Downsample so that the largest axis is <= max_dim.
    dims_zyx = np.array(array.shape, dtype=np.float32)
    factor = max(1.0, float(dims_zyx.max()) / float(max_dim))
    spacing_xyz = tuple(float(value) for value in loaded.spacing_mm)
    if factor > 1.01:
        image = sitk.GetImageFromArray(array)
        image.SetSpacing(spacing_xyz)  # SimpleITK spacing is x,y,z
        new_size = [max(1, int(round(value / factor))) for value in image.GetSize()]
        new_spacing = tuple(value * factor for value in image.GetSpacing())
        image = sitk.Resample(
            image,
            new_size,
            sitk.Transform(),
            sitk.sitkLinear,
            image.GetOrigin(),
            new_spacing,
            image.GetDirection(),
            -1024.0,
            sitk.sitkFloat32,
        )
        array = sitk.GetArrayFromImage(image)
        spacing_xyz = tuple(float(value) for value in new_spacing)

    finite = array[np.isfinite(array)]
    lo = float(np.percentile(finite, 0.5)) if finite.size else -1024.0
    hi = float(np.percentile(finite, 99.5)) if finite.size else 1600.0
    lo = max(-1024.0, lo)
    hi = min(3071.0, hi)
    if hi - lo < 400:
        mid = (hi + lo) / 2
        lo = max(-1024.0, mid - 200)
        hi = min(3071.0, mid + 200)
    u8 = np.clip((array - lo) / (hi - lo), 0.0, 1.0)
    u8 = np.round(u8 * 255.0).astype(np.uint8)
    u8 = np.ascontiguousarray(u8)

    nz, ny, nx = u8.shape
    sx, sy, sz = spacing_xyz
    dims = [int(nx), int(ny), int(nz)]
    spacing_xyz = [float(sx), float(sy), float(sz)]
    size = [dims[0] * sx, dims[1] * sy, dims[2] * sz]
    # Display-centred scene coordinates; the affine is preserved separately.
    bounds_min = [-value / 2 for value in size]
    bounds_max = [value / 2 for value in size]

    direction = list(loaded.direction)
    matrix = np.asarray(direction, dtype=float).reshape(3, 3)
    offset_xyz = np.array([crop_box[4], crop_box[2], crop_box[0]], dtype=float)
    origin = (np.asarray(loaded.origin) + matrix @ (offset_xyz * loaded.spacing_mm)).tolist()
    affine_matrix = np.eye(4)
    affine_matrix[:3, :3] = matrix @ np.diag(spacing_xyz)
    affine_matrix[:3, 3] = origin
    affine = affine_matrix.tolist()
    default_slices = {"x": nx // 2, "y": ny // 2, "z": nz // 2}
    stats = {
        "min": float(array.min()) if array.size else None,
        "max": float(array.max()) if array.size else None,
        "p005": lo,
        "p995": hi,
        "physicalCoordinateSystem": "LPS",
        "affineConvention": "voxel_index_xyz_to_lps_mm",
    }
    return PreviewVolume(
        data=u8,
        dims=dims,
        spacing=spacing_xyz,
        bounds_min=bounds_min,
        bounds_max=bounds_max,
        hu_range=[lo, hi],
        origin=origin,
        direction=direction,
        affine=affine,
        default_slices=default_slices,
        stats=stats,
        crop_box_zyx=crop_box,
        source_spacing=list(loaded.spacing_mm),
    )


def safe_extract_zip(archive: Path, target: Path, max_total_bytes: int) -> list[Path]:
    target.mkdir(parents=True, exist_ok=True)
    total = 0
    extracted: list[Path] = []
    with zipfile.ZipFile(archive) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = Path(info.filename)
            if name.is_absolute() or ".." in name.parts:
                raise ValueError("zip entry path traversal rejected")
            if info.file_size > max_total_bytes:
                raise ValueError("zip entry exceeds size limit")
            total += info.file_size
            if total > max_total_bytes:
                raise ValueError("zip expands beyond the upload size limit")
        zf.extractall(target)
    extracted = [path for path in target.rglob("*") if path.is_file()]
    return extracted


def write_hu_nifti(loaded: LoadedSeries, path: Path) -> None:
    image = sitk.GetImageFromArray(loaded.array_hu)
    image.SetSpacing(loaded.spacing_mm)
    path.parent.mkdir(parents=True, exist_ok=True)
    sitk.WriteImage(image, str(path))


def load_label_image(path: Path, *, resample_mm: float = 1.5) -> tuple[np.ndarray, tuple[float, float, float]]:
    """Load a NIfTI label map on the same physical grid as the DICOM series."""
    image = sitk.Cast(sitk.ReadImage(str(path)), sitk.sitkUInt16)
    size_mm = np.array(image.GetSize(), dtype=float) * np.array(image.GetSpacing(), dtype=float)
    out_size = [max(1, int(round(value / resample_mm))) for value in size_mm]
    resampled = sitk.Resample(
        image,
        out_size,
        sitk.Transform(),
        sitk.sitkNearestNeighbor,
        image.GetOrigin(),
        (resample_mm, resample_mm, resample_mm),
        image.GetDirection(),
        0,
        sitk.sitkUInt16,
    )
    canonical = _to_ras(resampled)
    array = sitk.GetArrayFromImage(canonical).astype(np.uint16)
    spacing = tuple(float(v) for v in canonical.GetSpacing())
    return array, spacing


def align_labels_to_preview(label_array: np.ndarray, preview: PreviewVolume) -> np.ndarray:
    z0, z1, y0, y1, x0, x1 = preview.crop_box_zyx
    cropped = label_array[z0:z1, y0:y1, x0:x1]
    target = tuple(preview.dims[::-1])
    if cropped.shape == target and np.allclose(preview.source_spacing or preview.spacing, preview.spacing):
        return cropped.copy()
    image = sitk.GetImageFromArray(cropped)
    image.SetSpacing(preview.source_spacing or preview.spacing)
    image.SetOrigin(preview.origin)
    image.SetDirection(preview.direction)
    aligned = sitk.Resample(
        image, preview.dims, sitk.Transform(), sitk.sitkNearestNeighbor,
        preview.origin, preview.spacing, preview.direction, 0, image.GetPixelID(),
    )
    return sitk.GetArrayFromImage(aligned)


def load_volume_bytes(path: Path, dims: list[int]) -> np.ndarray:
    data = np.fromfile(path, dtype=np.uint8)
    expected = int(np.prod(dims))
    if data.size != expected:
        raise ValueError(f"volume byte size {data.size} does not match dims {dims}")
    return data.reshape((dims[2], dims[1], dims[0]))
