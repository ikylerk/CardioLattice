from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..codes import coded
from ..config import settings
from ..db import get_db
from ..models import MeshRecord, VolumeRecord
from ..organ_library import public_catalog
from ..schemas import volume_out
from ..storage import storage

router = APIRouter(prefix="/api")


@router.get("/volumes/{volume_id}")
def get_volume(volume_id: str, db: Session = Depends(get_db)):
    volume = db.get(VolumeRecord, volume_id)
    if volume is None:
        raise HTTPException(status_code=404, detail=coded("VOLUME_NOT_FOUND"))
    return volume_out(volume)


@router.get("/volumes/{volume_id}/data")
def get_volume_data(volume_id: str, db: Session = Depends(get_db)):
    volume = db.get(VolumeRecord, volume_id)
    if volume is None:
        raise HTTPException(status_code=404, detail=coded("VOLUME_NOT_FOUND"))
    path = storage.path_for(volume.data_path)
    if not path.exists():
        raise HTTPException(status_code=410, detail=coded("VOLUME_GONE"))
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
        raise HTTPException(status_code=404, detail=coded("MESH_NOT_FOUND"))
    path = storage.path_for(mesh.path)
    if not path.exists():
        raise HTTPException(status_code=410, detail=coded("MESH_GONE"))
    return FileResponse(
        path,
        media_type="model/gltf-binary",
        filename=f"{mesh.id}.glb",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.get("/organs")
def organ_atlas():
    """Standard organ catalogue. Names, notes, and sources are ``{code, params}``.

    These are reference models and codes, not patient anatomy. The response
    does not depend on Accept-Language.
    """
    return public_catalog()


@router.get("/models")
def list_models():
    return {
        "models": [
            {
                "id": "synthetic_ground_truth",
                "version": "fixture-v1",
                "task": "segmentation",
                "intendedUse": coded("MODEL_SYNTHETIC_INTENDED_USE"),
                "regulatoryStatus": "research_only",
                "enabled": True,
                "license": coded("MODEL_SYNTHETIC_LICENSE"),
            },
            {
                "id": "totalsegmentator",
                "version": "2.4.0",
                "task": "heartchambers_highres / coronary_arteries",
                "intendedUse": coded("MODEL_TOTALSEG_INTENDED_USE"),
                "regulatoryStatus": "research_only",
                "enabled": settings.segmentation_adapter == "totalsegmentator",
                "license": coded("MODEL_TOTALSEG_LICENSE"),
            },
            {
                "id": "coronary_lumen",
                "version": None,
                "task": "stenosis",
                "intendedUse": coded("MODEL_LUMEN_INTENDED_USE"),
                "regulatoryStatus": "not_computed",
                "enabled": False,
                "license": coded("MODEL_LUMEN_LICENSE"),
            },
        ]
    }
