# config.py - Centralized configuration for the application
import os

# --- App Namespace ---
APP_NAMESPACE = "agents"

# --- LLM & Model IDs ---
# Primary LLM — all generation, reasoning, and structured output
GEMINI_MODEL_ID = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
# Multimodal embeddings — Gemini embed_content handles text, images, video, audio
GEMINI_EMBEDDING_MODEL_ID = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
# Visual embeddings for cross-modal image/video search (text → image)
CLIP_MODEL_ID = os.getenv("CLIP_MODEL", "openai/clip-vit-base-patch32")
# FLUX image generation (BFL)
FLUX_MODEL_ID = os.getenv("FLUX_MODEL", "flux-2-pro")
# Audio transcription (OpenAI Whisper — Gemini audio handling not yet in pxt)
WHISPER_MODEL_ID = os.getenv("WHISPER_MODEL", "whisper-1")
# Kept for Prompt Lab multi-model comparison
CLAUDE_MODEL_ID = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")
MISTRAL_MODEL_ID = os.getenv("MISTRAL_MODEL", "mistral-small-latest")

# --- Generation Model IDs (all Gemini) ---
IMAGEN_MODEL_ID = os.getenv("IMAGEN_MODEL", "imagen-4.0-generate-001")
VEO_MODEL_ID = os.getenv("VEO_MODEL", "veo-3.0-generate-001")

# --- Default System Prompts ---
INITIAL_SYSTEM_PROMPT = """Identify the best tool(s) to answer the user's query based on the available data sources (documents, images, news, financial data)."""
FINAL_SYSTEM_PROMPT = """Based on the provided context and the user's query, provide a very concise answer, ideally just a few words."""

# --- Default LLM Parameters ---
DEFAULT_MAX_TOKENS: int = 1024
DEFAULT_TEMPERATURE: float = 0.7

# --- File Upload Configuration ---
UPLOAD_FOLDER = "data"
MAX_UPLOAD_SIZE_MB = 100
ALLOWED_EXTENSIONS = {
    # Documents (native + Office via MarkdownIT)
    "pdf", "txt", "md", "html", "xml",
    "doc", "docx", "ppt", "pptx", "xls", "xlsx",
    "csv", "rtf",
    # Images
    "jpg", "jpeg", "png", "gif", "webp", "heic",
    # Video
    "mp4", "mov", "avi",
    # Audio
    "mp3", "wav", "m4a",
}

# --- Default User (local mode) ---
DEFAULT_USER_ID = "local_user"
DEFAULT_USER_NAME = "Pierre"

# --- Integrations (webhook URLs for notification UDFs) ---
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL", "")
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "")

INTEGRATIONS = {
    "slack": {
        "name": "Slack",
        "env_var": "SLACK_WEBHOOK_URL",
        "configured": bool(os.getenv("SLACK_WEBHOOK_URL", "")),
        "description": "Send messages to a Slack channel via incoming webhook",
    },
    "discord": {
        "name": "Discord",
        "env_var": "DISCORD_WEBHOOK_URL",
        "configured": bool(os.getenv("DISCORD_WEBHOOK_URL", "")),
        "description": "Send messages to a Discord channel via webhook",
    },
    "webhook": {
        "name": "Generic Webhook",
        "env_var": "WEBHOOK_URL",
        "configured": bool(os.getenv("WEBHOOK_URL", "")),
        "description": "POST JSON to any URL — connects to n8n, Zapier, Make, or custom endpoints",
    },
}

# --- CORS ---
CORS_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]
