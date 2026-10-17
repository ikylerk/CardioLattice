from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..i18n import Lang, t
from ..models import MeshRecord, VolumeRecord
from ..schemas import volume_out
from ..storage import storage

router = APIRouter(prefix="/api")


@router.get("/volumes/{volume_id}")
def get_volume(volume_id: str, lang: Lang, db: Session = Depends(get_db)):
    volume = db.get(VolumeRecord, volume_id)
    if volume is None:
        raise HTTPException(status_code=404, detail=t("http.volume_not_found", lang))
    return volume_out(volume, lang)


@router.get("/volumes/{volume_id}/data")
def get_volume_data(volume_id: str, lang: Lang, db: Session = Depends(get_db)):
    volume = db.get(VolumeRecord, volume_id)
    if volume is None:
        raise HTTPException(status_code=404, detail=t("http.volume_not_found", lang))
    path = storage.path_for(volume.data_path)
    if not path.exists():
        raise HTTPException(status_code=410, detail=t("http.volume_gone", lang))
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=f"{volume.id}.u8",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.get("/meshes/{mesh_id}/glb")
def get_mesh(mesh_id: str, lang: Lang, db: Session = Depends(get_db)):
    mesh = db.get(MeshRecord, mesh_id)
    if mesh is None:
        raise HTTPException(status_code=404, detail=t("http.mesh_not_found", lang))
    path = storage.path_for(mesh.path)
    if not path.exists():
        raise HTTPException(status_code=410, detail=t("http.mesh_gone", lang))
    return FileResponse(
        path,
        media_type="model/gltf-binary",
        filename=f"{mesh.id}.glb",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.get("/models")
def list_models(lang: Lang):
    return {
        "models": [
            {
                "id": "synthetic_ground_truth",
                "version": "fixture-v1",
                "task": "segmentation",
                "intendedUse": t("model.synthetic.intended_use", lang),
                "regulatoryStatus": "research_only",
                "enabled": True,
                "license": t("model.synthetic.license", lang),
            },
            {
                "id": "totalsegmentator",
                "version": "2.4.0",
                "task": "heartchambers_highres / coronary_arteries",
                "intendedUse": t("model.totalseg.intended_use", lang),
                "regulatoryStatus": "research_only",
                "enabled": settings.segmentation_adapter == "totalsegmentator",
                "license": t("model.totalseg.license", lang),
            },
            {
                "id": "coronary_lumen",
                "version": None,
                "task": "stenosis",
                "intendedUse": t("model.lumen.intended_use", lang),
                "regulatoryStatus": "not_computed",
                "enabled": False,
                "license": t("model.lumen.license", lang),
            },
        ]
    }
