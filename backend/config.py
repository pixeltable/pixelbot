# config.py - Centralized configuration for the application
import os

# --- App Namespace ---
APP_NAMESPACE = "agents"

# --- LLM & Model IDs ---
EMBEDDING_MODEL_ID = os.getenv("EMBEDDING_MODEL", "intfloat/multilingual-e5-large-instruct")
CLIP_MODEL_ID = os.getenv("CLIP_MODEL", "openai/clip-vit-base-patch32")
WHISPER_MODEL_ID = os.getenv("WHISPER_MODEL", "whisper-1")
CLAUDE_MODEL_ID = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")
MISTRAL_MODEL_ID = os.getenv("MISTRAL_MODEL", "mistral-small-latest")
SUMMARIZATION_MODEL_ID = os.getenv("SUMMARIZATION_MODEL", "gemini-2.5-flash")

# --- Generation Providers ("openai" | "gemini") ---
IMAGE_GEN_PROVIDER = os.getenv("IMAGE_GEN_PROVIDER", "gemini")
VIDEO_GEN_PROVIDER = os.getenv("VIDEO_GEN_PROVIDER", "gemini")

# Provider-specific model IDs
DALLE_MODEL_ID = os.getenv("DALLE_MODEL", "dall-e-3")
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
