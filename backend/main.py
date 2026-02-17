# main.py - FastAPI application entrypoint
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import pixeltable as pxt

from routers import chat, files, history, memory, images, personas, studio, database, experiments, export

load_dotenv(override=True)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate Pixeltable connection on startup."""
    try:
        tool_agent = pxt.get_table("agents.tools")
        if tool_agent is None:
            raise RuntimeError("agents.tools table not found")
        logger.info("Connected to Pixeltable agents.tools table")
    except Exception:
        logger.warning(
            "⚠️  Pixeltable schema not initialized. "
            "Run 'python setup_pixeltable.py' from the backend/ directory first. "
            "The server will start but API calls will fail until the schema is created."
        )
    yield


app = FastAPI(
    title="Pixelbot",
    description="Multimodal AI Agent powered by Pixeltable",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — allow Vite dev server and production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(chat.router)
app.include_router(files.router)
app.include_router(history.router)
app.include_router(memory.router)
app.include_router(images.router)
app.include_router(personas.router)
app.include_router(studio.router)
app.include_router(database.router)
app.include_router(experiments.router)
app.include_router(export.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve frontend static build (production)
STATIC_DIR = Path(__file__).resolve().parent / "static"
if STATIC_DIR.is_dir():
    from fastapi.responses import FileResponse

    # SPA catch-all: serve index.html for all non-API, non-asset paths
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        # If the requested path matches a real static file, serve it
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        # Otherwise serve index.html for client-side routing
        return FileResponse(STATIC_DIR / "index.html")

    logger.info(f"Serving frontend from {STATIC_DIR}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_excludes=["data/*", "*.log"],
        loop="asyncio",
    )
