"""Pixelbot 3.0 Pixeltable application and FastAPI service."""

from __future__ import annotations

import logging
from pathlib import Path

import pixeltable as pxt
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pixeltable.serving import FastAPIRouter

from pixelbot import __version__, config
from pixelbot.routers import (
    chat,
    database,
    experiments,
    export,
    files,
    history,
    images,
    integrations,
    memory,
    personas,
    studio,
)
from pixelbot.schema import (
    MemoryBank,
    get_all_memory,
    get_all_personas,
    search_memory,
)
from pixelbot.schema import TableModel as TableModel  # noqa: F401

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger(__name__)

dataServingRouter = FastAPIRouter(name="data_serving", prefix="/api", tags=["data-serving"])
dataServingRouter.add_query_route(path="/memory/v2", query=get_all_memory, method="get")
dataServingRouter.add_query_route(path="/memory/v2/search", query=search_memory, method="get")
dataServingRouter.add_delete_route(MemoryBank, path="/memory/v2/delete", match_columns=["timestamp"])
dataServingRouter.add_query_route(path="/personas/v2", query=get_all_personas, method="get")

app = FastAPI(
    title="Pixelbot",
    description="Multimodal AI Agent powered by Pixeltable",
    version=__version__,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled API failure for %s", request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


for apiRouter in (
    chat.router,
    files.router,
    history.router,
    memory.router,
    images.router,
    personas.router,
    studio.router,
    database.router,
    experiments.router,
    export.router,
    integrations.router,
    dataServingRouter,
):
    app.include_router(apiRouter)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "pixelbot": __version__, "pixeltable": pxt.__version__}


@app.get("/api/user_info")
def user_info() -> dict[str, str]:
    return {"user_name": config.DEFAULT_USER_NAME}


@app.api_route(
    "/api/{unmatched_path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    include_in_schema=False,
)
async def unmatched_api_route(unmatched_path: str) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "Not Found"})


staticDir = Path(__file__).resolve().parent / "static"

if staticDir.is_dir():

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        candidate = (staticDir / full_path).resolve()
        try:
            candidate.relative_to(staticDir)
        except ValueError:
            candidate = staticDir / "index.html"
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(staticDir / "index.html")
