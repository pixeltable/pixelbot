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
    UserPersonas,
)
from pixelbot.schema import TableModel as TableModel  # noqa: F401

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger(__name__)


@pxt.query
def list_memory_rows():
    """List memory for the configured local user."""
    return (
        MemoryBank.where(MemoryBank.user_id == config.DEFAULT_USER_ID)
        .select(
            content=MemoryBank.content,
            type=MemoryBank.type,
            language=MemoryBank.language,
            context_query=MemoryBank.context_query,
            timestamp=MemoryBank.timestamp,
        )
        .order_by(MemoryBank.timestamp, asc=False)
        .limit(100)
    )


@pxt.query
def search_memory_rows(query_text: str):
    """Search memory for the configured local user."""
    similarity = MemoryBank.content.similarity(string=query_text)  # type: ignore[attr-defined]
    return (
        MemoryBank.where((MemoryBank.user_id == config.DEFAULT_USER_ID) & (similarity > 0.7))
        .order_by(similarity, asc=False)
        .select(
            content=MemoryBank.content,
            type=MemoryBank.type,
            language=MemoryBank.language,
            context_query=MemoryBank.context_query,
            timestamp=MemoryBank.timestamp,
            sim=similarity,
        )
        .limit(10)
    )


@pxt.query
def list_persona_rows():
    """List personas for the configured local user."""
    return (
        UserPersonas.where(UserPersonas.user_id == config.DEFAULT_USER_ID)
        .select(
            persona_name=UserPersonas.persona_name,
            initial_prompt=UserPersonas.initial_prompt,
            final_prompt=UserPersonas.final_prompt,
            llm_params=UserPersonas.llm_params,
            timestamp=UserPersonas.timestamp,
        )
        .order_by(UserPersonas.persona_name, asc=True)
        .limit(100)
    )


pixeltableRouter = FastAPIRouter(name="pixeltable", prefix="/api", tags=["pixeltable"])
pixeltableRouter.add_query_route(path="/memory", query=list_memory_rows, method="get")
pixeltableRouter.add_query_route(path="/memory/search", query=search_memory_rows, method="get")
pixeltableRouter.add_query_route(path="/personas", query=list_persona_rows, method="get")

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
    pixeltableRouter,
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
