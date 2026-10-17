from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .reporting import DISCLAIMER_EN
from .routes.assets import router as assets_router
from .routes.reports import router as reports_router
from .routes.studies import router as studies_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="CardioScope Pro Research API",
    version="0.1.0",
    description=(
        "Research prototype for DICOM ingestion, 3D reconstruction and human-reviewed "
        "structured reporting. "
        + DISCLAIMER_EN
        + " Errors, reasons, stage messages, series reasons, and measurement labels "
        "are {code, params} objects. A report draft is generated once from the lang "
        "query parameter (en or zh, default en) and stored as content.language. "
        "Stored reports are not rewritten on read."
    ),
    lifespan=lifespan,
)

origins = [
    item.strip()
    for item in os.getenv(
        "ALLOWED_ORIGINS", "http://127.0.0.1:5183,http://localhost:5183"
    ).split(",")
    if item.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(studies_router)
app.include_router(assets_router)
app.include_router(reports_router)


@app.get("/")
def root():
    return {
        "name": "CardioScope Pro Research API",
        "status": "ok",
        "docs": "/docs",
        "warning": DISCLAIMER_EN,
    }
