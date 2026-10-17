from __future__ import annotations

import shutil
from pathlib import Path

from .config import settings


class LocalStorage:
    """Local filesystem storage. The interface is intentionally narrow so an S3
    implementation can be added without touching the imaging pipeline."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def study_dir(self, study_id: str) -> Path:
        path = self.root / "studies" / study_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def path_for(self, relative: str) -> Path:
        path = (self.root / relative).resolve()
        if self.root.resolve() not in path.parents and path != self.root.resolve():
            raise ValueError("error.storage_escape")
        return path

    def relative(self, absolute: Path) -> str:
        return str(absolute.resolve().relative_to(self.root.resolve()))

    def save_upload(self, study_id: str, filename: str, stream) -> Path:
        safe_name = Path(filename).name or "upload.bin"
        target = self.study_dir(study_id) / "upload" / safe_name
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("wb") as handle:
            shutil.copyfileobj(stream, handle)
        return target

    def write_bytes(self, relative: str, data: bytes) -> Path:
        target = self.path_for(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return target

    def read_bytes(self, relative: str) -> bytes:
        return self.path_for(relative).read_bytes()

    def delete_study(self, study_id: str) -> None:
        target = self.root / "studies" / study_id
        if target.exists():
            shutil.rmtree(target)


storage = LocalStorage(settings.storage_dir)
