#!/usr/bin/env python3
"""Validate a prediction against a public cardiovascular NIfTI annotation.

The script loads a prediction and a ground-truth NIfTI with SimpleITK, extracts
one binary label, verifies that both inputs share the same grid, and computes
research overlap/surface metrics.  It never resamples silently: if the grids
differ, it exits with an explanatory error so the researcher can align the
prediction externally and document that step.

Research use only.  See docs/public-validation.md.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import SimpleITK as sitk

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from app.metrics import (  # noqa: E402
    assd,
    centroid_distance_mm,
    dice,
    hd95,
    jaccard,
    volume_error_ml,
)

DISCLAIMER = (
    "RESEARCH USE ONLY. This report compares an automated prediction with a "
    "reference annotation on a public research dataset. It is not a medical "
    "device, has not been reviewed or cleared by any regulator, and must not "
    "be used for diagnosis, treatment planning, or any other clinical "
    "decision. These metrics do not establish clinical safety or effectiveness."
)

MODEL_NOTES = (
    "Placeholder: record the exact model checkpoint, training data, "
    "preprocessing, and inference settings used for this case."
)
DATASET_NOTES = (
    "Placeholder: record the dataset release/version, case identifier, label "
    "definition, and the license or data-use agreement you accepted."
)


class ValidationError(RuntimeError):
    """Raised for user-facing input or grid-validation errors."""


def _parse_spacing(raw: str | None) -> tuple[float, ...] | None:
    """Parse a comma/space-separated spacing string in NIfTI (x, y, z) order."""

    if raw is None:
        return None
    parts = [part for part in re.split(r"[,\s]+", raw.strip()) if part]
    if not parts:
        raise ValidationError("--spacing was provided but contains no numbers")
    try:
        values = tuple(float(part) for part in parts)
    except ValueError as exc:
        raise ValidationError(
            f"could not parse --spacing {raw!r}; use e.g. 1.0,0.5,0.5"
        ) from exc
    if any(not np.isfinite(value) or value <= 0 for value in values):
        raise ValidationError("--spacing values must be finite and greater than zero")
    return values


def _load_label(path: Path, label: int) -> tuple[sitk.Image, np.ndarray]:
    if not path.is_file():
        raise ValidationError(f"input file does not exist: {path}")
    try:
        image = sitk.ReadImage(str(path))
    except RuntimeError as exc:
        raise ValidationError(f"SimpleITK could not read {path}: {exc}") from exc

    array = sitk.GetArrayFromImage(image)
    if array.ndim not in (2, 3):
        raise ValidationError(
            f"{path} has {array.ndim} dimensions; only 2D/3D NIfTI masks are supported"
        )
    if array.size == 0:
        raise ValidationError(f"{path} contains an empty image array")
    if np.issubdtype(array.dtype, np.floating):
        if not np.all(np.isfinite(array)):
            raise ValidationError(f"{path} contains NaN or infinite values")
        mask = np.isclose(array, float(label), rtol=0.0, atol=1e-4)
    else:
        mask = array == label
    return image, mask


def _check_same_grid(pred_image: sitk.Image, gt_image: sitk.Image) -> None:
    """Require identical geometry; never resample on the user's behalf."""

    if pred_image.GetDimension() != gt_image.GetDimension():
        raise ValidationError(
            "grids differ: prediction and ground truth have different "
            f"dimensions ({pred_image.GetDimension()} vs {gt_image.GetDimension()})"
        )

    pred_size = tuple(pred_image.GetSize())
    gt_size = tuple(gt_image.GetSize())
    if pred_size != gt_size:
        raise ValidationError(
            "grids differ: image sizes do not match "
            f"(pred={pred_size}, gt={gt_size}). Resample the prediction "
            "externally to the ground-truth grid; this harness does not "
            "resample silently."
        )

    checks: tuple[tuple[str, str, float], ...] = (
        ("spacing", "GetSpacing", 1e-4),
        ("origin", "GetOrigin", 1e-3),
        ("direction", "GetDirection", 1e-4),
    )
    for name, getter, atol in checks:
        pred_value = np.asarray(getattr(pred_image, getter)(), dtype=float)
        gt_value = np.asarray(getattr(gt_image, getter)(), dtype=float)
        if not np.allclose(pred_value, gt_value, rtol=1e-4, atol=atol):
            raise ValidationError(
                f"grids differ: {name} does not match "
                f"(pred={pred_value.tolist()}, gt={gt_value.tolist()}). "
                "Resample the prediction externally to the ground-truth grid; "
                "this harness does not resample silently."
            )


def _spacing_for_metrics(
    gt_image: sitk.Image,
    override: tuple[float, ...] | None,
    warnings: list[str],
) -> tuple[tuple[float, ...], np.ndarray, str]:
    """Return spacing in NumPy array order plus its NIfTI-order source."""

    header_xyz = np.asarray(gt_image.GetSpacing(), dtype=float)
    if not np.all(np.isfinite(header_xyz)) or np.any(header_xyz <= 0):
        raise ValidationError(
            f"ground-truth NIfTI has invalid spacing {header_xyz.tolist()}"
        )

    if override is not None:
        if len(override) != header_xyz.size:
            raise ValidationError(
                f"--spacing needs {header_xyz.size} values for this image "
                f"(got {len(override)})"
            )
        spacing_xyz = np.asarray(override, dtype=float)
        source = "cli_override"
        if not np.allclose(spacing_xyz, header_xyz, rtol=1e-4, atol=1e-4):
            warnings.append(
                "The --spacing override differs from the ground-truth NIfTI "
                f"header ({spacing_xyz.tolist()} vs {header_xyz.tolist()}). "
                "Make sure the override is documented and justified."
            )
    else:
        spacing_xyz = header_xyz
        source = "nifti_header"

    # SimpleITK uses (x, y, z); NumPy arrays are indexed (z, y, x).
    spacing_zyx = tuple(float(value) for value in spacing_xyz[::-1])
    return spacing_zyx, spacing_xyz, source


def _git_metadata() -> tuple[str | None, bool | None]:
    repo_root = SERVER_ROOT.parent
    try:
        commit = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=False,
        )
        if commit.returncode != 0:
            return None, None
        status = subprocess.run(
            [
                "git",
                "-C",
                str(repo_root),
                "status",
                "--porcelain",
                "--untracked-files=no",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        dirty = bool(status.stdout.strip()) if status.returncode == 0 else None
        return commit.stdout.strip(), dirty
    except (OSError, subprocess.SubprocessError):
        return None, None


def _optional_float(value: float | None) -> float | None:
    return None if value is None else float(value)


def build_report(args: argparse.Namespace) -> tuple[dict, Path]:
    if args.label == 0:
        raise ValidationError(
            "--label 0 selects the background; pass the foreground label value"
        )

    pred_path = args.pred.expanduser()
    gt_path = args.gt.expanduser()
    pred_image, pred_mask = _load_label(pred_path, args.label)
    gt_image, gt_mask = _load_label(gt_path, args.label)

    _check_same_grid(pred_image, gt_image)
    if pred_mask.shape != gt_mask.shape:
        raise ValidationError(
            "grids differ: NumPy array shapes do not match "
            f"({pred_mask.shape} vs {gt_mask.shape})"
        )
    if not np.any(gt_mask):
        raise ValidationError(
            f"label {args.label} is not present in the ground truth {gt_path}; "
            "check --label against the dataset's label convention"
        )

    warnings: list[str] = []
    if not np.any(pred_mask):
        warnings.append(
            "The prediction mask is empty. Dice/Jaccard are 0 and surface/"
            "centroid distances are null; verify that --label and the output "
            "label convention are correct."
        )

    override = _parse_spacing(args.spacing)
    spacing_zyx, header_xyz, spacing_source = _spacing_for_metrics(
        gt_image, override, warnings
    )

    metrics = {
        "dice": float(dice(pred_mask, gt_mask)),
        "jaccard": float(jaccard(pred_mask, gt_mask)),
        "hd95_mm": _optional_float(hd95(pred_mask, gt_mask, spacing_mm=spacing_zyx)),
        "assd_mm": _optional_float(assd(pred_mask, gt_mask, spacing_mm=spacing_zyx)),
        "volume_error_ml": float(
            volume_error_ml(pred_mask, gt_mask, spacing_mm=spacing_zyx)
        ),
        "centroid_distance_mm": _optional_float(
            centroid_distance_mm(pred_mask, gt_mask, spacing_mm=spacing_zyx)
        ),
    }

    pred_voxels = int(np.count_nonzero(pred_mask))
    gt_voxels = int(np.count_nonzero(gt_mask))
    voxel_volume_mm3 = float(np.prod(np.asarray(spacing_zyx, dtype=float)))
    git_commit, git_dirty = _git_metadata()

    report = {
        "disclaimer": DISCLAIMER,
        "research_only": True,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "git_commit": git_commit,
        "git_dirty": git_dirty,
        "model": {
            "name": args.model_name,
            "version": args.model_version,
            "notes": MODEL_NOTES,
        },
        "dataset": {
            "name": args.dataset_name,
            "case_id": args.case_id,
            "license": args.dataset_license,
            "notes": DATASET_NOTES,
        },
        "inputs": {
            "prediction": str(pred_path.resolve()),
            "ground_truth": str(gt_path.resolve()),
            "label": args.label,
            "shape_zyx": list(gt_mask.shape),
            "spacing_zyx_mm": list(spacing_zyx),
            "header_spacing_xyz_mm": [float(value) for value in header_xyz],
            "spacing_source": spacing_source,
            "prediction_voxels": pred_voxels,
            "ground_truth_voxels": gt_voxels,
            "prediction_volume_ml": pred_voxels * voxel_volume_mm3 / 1000.0,
            "ground_truth_volume_ml": gt_voxels * voxel_volume_mm3 / 1000.0,
        },
        "metrics": metrics,
        "warnings": warnings,
    }

    out_path = args.out.expanduser()
    return report, out_path


def _format_mm(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.3f} mm"


def _print_summary(report: dict, out_path: Path) -> None:
    inputs = report["inputs"]
    metrics = report["metrics"]
    print("Research validation summary")
    print(
        f"  model: {report['model']['name']} "
        f"({report['model']['version'] or 'version unset'})"
    )
    print(
        f"  dataset: {report['dataset']['name']} "
        f"case: {report['dataset']['case_id']} label: {inputs['label']}"
    )
    print(
        f"  grid: {inputs['shape_zyx']} spacing (z,y,x): "
        f"{inputs['spacing_zyx_mm']} mm ({inputs['spacing_source']})"
    )
    print(
        f"  Dice: {metrics['dice']:.4f}  Jaccard: {metrics['jaccard']:.4f}  "
        f"HD95: {_format_mm(metrics['hd95_mm'])}  "
        f"ASSD: {_format_mm(metrics['assd_mm'])}"
    )
    print(
        f"  volume error: {metrics['volume_error_ml']:.4f} mL  "
        f"centroid distance: {_format_mm(metrics['centroid_distance_mm'])}"
    )
    for warning in report["warnings"]:
        print(f"  warning: {warning}")
    print(f"  report: {out_path.resolve()}")
    print("  Research use only; not for clinical diagnosis or treatment decisions.")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Compute research segmentation metrics for one public NIfTI case. "
            "The prediction and ground truth must already share the same grid."
        ),
        epilog=DISCLAIMER,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--pred", type=Path, required=True, help="prediction .nii/.nii.gz")
    parser.add_argument(
        "--gt", type=Path, required=True, help="ground-truth .nii/.nii.gz"
    )
    parser.add_argument(
        "--spacing",
        default=None,
        help=(
            "optional voxel spacing in NIfTI (x,y,z) order, comma- or "
            "space-separated, e.g. 1.0,0.5,0.5; defaults to the GT header"
        ),
    )
    parser.add_argument(
        "--label",
        type=int,
        default=1,
        help="foreground label value to extract from both files (default: 1)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("validation_report.json"),
        help="output JSON report path (default: validation_report.json)",
    )
    parser.add_argument(
        "--model-name", default="<set-model-name>", help="model name placeholder"
    )
    parser.add_argument(
        "--model-version", default=None, help="model version/checkpoint identifier"
    )
    parser.add_argument(
        "--dataset-name", default="<set-dataset-name>", help="dataset name placeholder"
    )
    parser.add_argument(
        "--case-id", default="<set-case-id>", help="dataset case identifier"
    )
    parser.add_argument(
        "--dataset-license",
        default="<verify-dataset-license>",
        help="dataset license or data-use-agreement identifier",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        report, out_path = build_report(args)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(
            json.dumps(report, indent=2, allow_nan=False) + "\n",
            encoding="utf-8",
        )
    except ValidationError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"error: could not write report: {exc}", file=sys.stderr)
        return 1

    _print_summary(report, out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
