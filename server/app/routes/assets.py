from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import MeshRecord, VolumeRecord
from ..organ_library import catalog
from ..organ_targets import catalog as target_catalog
from ..schemas import volume_out
from ..storage import storage

router = APIRouter(prefix="/api")


@router.get("/volumes/{volume_id}")
def get_volume(volume_id: str, db: Session = Depends(get_db)):
    volume = db.get(VolumeRecord, volume_id)
    if volume is None:
        raise HTTPException(status_code=404, detail="volume not found")
    return volume_out(volume)


@router.get("/volumes/{volume_id}/data")
def get_volume_data(volume_id: str, db: Session = Depends(get_db)):
    volume = db.get(VolumeRecord, volume_id)
    if volume is None:
        raise HTTPException(status_code=404, detail="volume not found")
    path = storage.path_for(volume.data_path)
    if not path.exists():
        raise HTTPException(status_code=410, detail="volume artifact no longer available")
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=f"{volume.id}.u8",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.get("/meshes/{mesh_id}/glb")
def get_mesh(mesh_id: str, db: Session = Depends(get_db)):
    mesh = db.get(MeshRecord, mesh_id)
    if mesh is None:
        raise HTTPException(status_code=404, detail="mesh not found")
    path = storage.path_for(mesh.path)
    if not path.exists():
        raise HTTPException(status_code=410, detail="mesh artifact no longer available")
    return FileResponse(
        path,
        media_type="model/gltf-binary",
        filename=f"{mesh.id}.glb",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.get("/organs")
def organ_atlas():
    """Standard organ catalogue shared by the frontend and backend.

    These are reference models and codes, not patient anatomy.
    """
    return catalog()


@router.get("/organ-targets")
def organ_targets():
    """Reference targets for teaching, orientation and workflow simulation."""
    return target_catalog()


@router.get("/models")
def list_models():
    return {
        "models": [
            {
                "id": "synthetic_ground_truth",
                "version": "fixture-v1",
                "task": "segmentation",
                "intendedUse": "Pipeline verification on synthetic fixtures only",
                "regulatoryStatus": "research_only",
                "enabled": True,
                "license": "Generated in-repo",
            },
            {
                "id": "totalsegmentator",
                "version": "2.4.0",
                "task": "heartchambers_highres / coronary_arteries",
                "intendedUse": "Research segmentation; not validated for stenosis or FFR",
                "regulatoryStatus": "research_only",
                "enabled": settings.segmentation_adapter == "totalsegmentator",
                "license": "Code Apache-2.0; task weights require per-task licence review",
            },
            {
                "id": "coronary_lumen",
                "version": None,
                "task": "stenosis",
                "intendedUse": "Not configured",
                "regulatoryStatus": "not_computed",
                "enabled": False,
                "license": "Pending validation and licence review",
            },
        ]
    }
