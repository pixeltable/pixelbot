# main.py — FastAPI application entrypoint
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import pixeltable as pxt

import config as app_config
from routers import chat, files, history, memory, images, personas, studio, database, experiments, export, integrations, data_serving

load_dotenv(override=True)

# Alias GEMINI_API_KEY → GOOGLE_API_KEY so the Google GenAI SDK (used by
# Pixeltable's gemini functions) picks it up automatically.
if os.environ.get("GEMINI_API_KEY") and not os.environ.get("GOOGLE_API_KEY"):
    os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize Pixeltable schema and validate connection on startup."""
    import setup_pixeltable
    from routers import data_serving
    try:
        setup_pixeltable.init_schema(force_reset=False)
        data_serving.register_data_serving_routes()
        if not getattr(data_serving, "_router_included", False):
            app.include_router(data_serving.router)
            data_serving._router_included = True
        tool_agent = pxt.get_table("agents.tools")
        if tool_agent is None:
            raise RuntimeError("agents.tools table not found")
        logger.info("Connected to Pixeltable agents.tools table")
    except Exception as exc:
        logger.warning(
            "⚠️  Pixeltable schema not initialized (%s). "
            "Run 'python setup_pixeltable.py' from the backend/ directory to reset. "
            "The server will start but API calls will fail until the schema is created.",
            exc,
        )
    _register_spa_fallback()
    yield


app = FastAPI(
    title="Pixelbot",
    description="Multimodal AI Agent powered by Pixeltable",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=app_config.CORS_ORIGINS,
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
app.include_router(integrations.router)
# data_serving.router is included in lifespan AFTER register_data_serving_routes()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/user_info")
def user_info():
    return {"user_name": app_config.DEFAULT_USER_NAME}


# Serve frontend static build (production) — registered in lifespan after API routers
STATIC_DIR = Path(__file__).resolve().parent / "static"
_spa_registered = False


def _register_spa_fallback() -> None:
    """Register SPA catch-all last so /api/* routes take precedence."""
    global _spa_registered
    if _spa_registered or not STATIC_DIR.is_dir():
        return
    from fastapi.responses import FileResponse

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")

    _spa_registered = True
    logger.info(f"Serving frontend from {STATIC_DIR}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_excludes=["data/*", "*.log"],
    )
