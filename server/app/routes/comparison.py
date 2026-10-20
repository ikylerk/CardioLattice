from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..comparison import comparison_out, prior_candidates, run_comparison
from ..comparison_models import Comparison
from ..db import get_db

router = APIRouter(prefix="/api")


class ComparisonRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    currentStudyId: str = Field(strict=True, min_length=1, max_length=64)
    priorStudyId: str = Field(strict=True, min_length=1, max_length=64)


@router.get("/studies/{study_id}/prior-candidates")
def get_prior_candidates(study_id: str, db: Session = Depends(get_db)):
    try:
        items = prior_candidates(db, study_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"studyId": study_id, "items": items}


@router.post("/comparisons")
def create_comparison(body: ComparisonRequest, db: Session = Depends(get_db)):
    try:
        return run_comparison(db, body.currentStudyId, body.priorStudyId)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/comparisons/{comparison_id}")
def get_comparison(comparison_id: str, db: Session = Depends(get_db)):
    comparison = db.get(Comparison, comparison_id)
    if comparison is None:
        raise HTTPException(status_code=404, detail="comparison not found")
    return comparison_out(comparison)
