# models.py - Pydantic row models for Pixeltable table inserts.
#
# These models serve as the contract between FastAPI routers and Pixeltable tables.
# Using Pydantic ensures validation before insert and keeps column schemas in one place.

from datetime import datetime

from pydantic import BaseModel, Field

import config


# ── Agent Workflow (agents.tools) ────────────────────────────────────────────

class ToolAgentRow(BaseModel):
    """Row model for the agents.tools table."""
    prompt: str
    timestamp: datetime
    user_id: str
    initial_system_prompt: str = config.INITIAL_SYSTEM_PROMPT
    final_system_prompt: str = config.FINAL_SYSTEM_PROMPT
    max_tokens: int = config.DEFAULT_MAX_TOKENS
    temperature: float = config.DEFAULT_TEMPERATURE


# ── Chat History (agents.chat_history) ───────────────────────────────────────

class ChatHistoryRow(BaseModel):
    """Row model for the agents.chat_history table."""
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime
    user_id: str


# ── Memory Bank (agents.memory_bank) ─────────────────────────────────────────

class MemoryBankRow(BaseModel):
    """Row model for the agents.memory_bank table."""
    content: str
    type: str  # "code" or "text"
    language: str | None = None
    context_query: str
    timestamp: datetime
    user_id: str


# ── User Personas (agents.user_personas) ─────────────────────────────────────

class UserPersonaRow(BaseModel):
    """Row model for the agents.user_personas table."""
    user_id: str
    persona_name: str
    initial_prompt: str
    final_prompt: str
    llm_params: dict = Field(default_factory=dict)
    timestamp: datetime


# ── Image Generation (agents.image_generation_tasks) ─────────────────────────

class ImageGenRow(BaseModel):
    """Row model for the agents.image_generation_tasks table."""
    prompt: str
    timestamp: datetime
    user_id: str


class VideoGenRow(BaseModel):
    """Row model for the agents.video_generation_tasks table."""
    prompt: str
    timestamp: datetime
    user_id: str


# ── Media Tables (agents.collection / images / videos / audios) ──────────────

class DocumentRow(BaseModel):
    """Row model for the agents.collection table."""
    document: str  # file path or URL
    uuid: str
    timestamp: datetime
    user_id: str


class ImageRow(BaseModel):
    """Row model for the agents.images table."""
    image: str  # file path or URL
    uuid: str
    timestamp: datetime
    user_id: str


class VideoRow(BaseModel):
    """Row model for the agents.videos table."""
    video: str  # file path or URL
    uuid: str
    timestamp: datetime
    user_id: str


class AudioRow(BaseModel):
    """Row model for the agents.audios table."""
    audio: str  # file path or URL
    uuid: str
    timestamp: datetime
    user_id: str


# Lookup map for dynamic media inserts (files.py)
MEDIA_ROW_MODELS = {
    "document": DocumentRow,
    "image": ImageRow,
    "video": VideoRow,
    "audio": AudioRow,
}


# ── LLM Structured Output Schemas ────────────────────────────────────────────
# These models define the expected output shape from LLM calls.
# Used with Gemini's response_schema to force validated JSON.

class FollowUpResponse(BaseModel):
    """Schema for follow-up question generation (Gemini structured output)."""
    questions: list[str] = Field(description="Exactly 3 relevant follow-up questions")


class DocumentSummary(BaseModel):
    """Schema for document auto-summarization (Gemini structured output)."""
    title: str = Field(description="Inferred document title")
    summary: str = Field(description="2-3 sentence summary of the document")
    key_topics: list[str] = Field(description="3-5 key topics covered")
