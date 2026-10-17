from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    """Environment-driven settings; deliberately small for the local-lite profile."""

    def __init__(self) -> None:
        self.root = Path(__file__).resolve().parent.parent
        self.var_dir = Path(os.getenv("CARDIOSCOPE_VAR_DIR", self.root / "var")).resolve()
        self.var_dir.mkdir(parents=True, exist_ok=True)

        self.db_url = os.getenv("DB_URL", f"sqlite:///{self.var_dir / 'cardioscope.db'}")
        self.storage_backend = os.getenv("STORAGE_BACKEND", "local")
        self.storage_dir = Path(os.getenv("STORAGE_DIR", self.var_dir / "storage")).resolve()
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        self.queue = os.getenv("QUEUE", "inline")
        self.run_pipeline_sync = _bool("RUN_PIPELINE_SYNC", False)

        self.segmentation_adapter = os.getenv("SEGMENTATION_ADAPTER", "synthetic_ground_truth")
        self.max_upload_mb = int(os.getenv("MAX_UPLOAD_MB", "2048"))
        self.max_voxels = int(os.getenv("MAX_VOXELS", "192"))
        self.resample_mm = float(os.getenv("RESAMPLE_MM", "1.5"))

        self.require_auth = _bool("REQUIRE_AUTH", False)
        self.default_actor = os.getenv("DEFAULT_ACTOR", "local-researcher")
        self.deid_salt = os.getenv("DEID_SALT", "local-research-salt")

        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.anthropic_model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")


settings = Settings()
