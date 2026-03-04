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
    conversation_id: str
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


# ── API Response Models ──────────────────────────────────────────────────────
# Shared response models used by routers. Centralised here so the full API
# contract is discoverable in one file and reusable across endpoints.

class MessageResponse(BaseModel):
    message: str


class DeleteResponse(BaseModel):
    message: str
    num_deleted: int


# ── Chat ─────────────────────────────────────────────────────────────────────

class QueryMetadata(BaseModel):
    timestamp: str
    has_doc_context: bool
    has_image_context: bool
    has_tool_output: bool
    has_history_context: bool
    has_memory_context: bool
    has_chat_memory_context: bool


class QueryResponse(BaseModel):
    answer: str
    metadata: QueryMetadata
    image_context: list[dict]
    video_frame_context: list[dict]
    follow_up_text: str | None


# ── Files ────────────────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    message: str
    filename: str
    uuid: str


class AddUrlResponse(BaseModel):
    message: str
    url: str
    filename: str
    uuid: str


class DeleteFileResponse(BaseModel):
    message: str
    db_deleted: bool
    file_deleted: bool
    uuid: str


class DeleteAllResponse(BaseModel):
    message: str
    should_refresh: bool = True


# ── History ──────────────────────────────────────────────────────────────────

class ConversationSummary(BaseModel):
    conversation_id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int


class ChatMessageItem(BaseModel):
    role: str
    content: str
    timestamp: str


class ConversationDetail(BaseModel):
    conversation_id: str
    messages: list[ChatMessageItem]


# ── Images / Generation ──────────────────────────────────────────────────────

class GenerateImageResponse(BaseModel):
    generated_image_base64: str
    timestamp: str
    prompt: str
    provider: str


class SaveToCollectionResponse(BaseModel):
    message: str
    uuid: str


class GenerateSpeechResponse(BaseModel):
    audio_url: str
    audio_path: str
    timestamp: str
    voice: str


# ── Studio ───────────────────────────────────────────────────────────────────

class SaveImageToCollectionResponse(BaseModel):
    message: str
    uuid: str
    filename: str


# ── Memory ───────────────────────────────────────────────────────────────────

class DeleteMemoryResponse(BaseModel):
    message: str
    num_deleted: int


# ── Experiments ──────────────────────────────────────────────────────────────

class ModelInfo(BaseModel):
    id: str
    name: str
    provider: str
    available: bool


class ExperimentResult(BaseModel):
    model_id: str
    model_name: str
    provider: str
    response: str | None = None
    response_time_ms: float = 0.0
    word_count: int = 0
    char_count: int = 0
    error: str | None = None


class RunExperimentResponse(BaseModel):
    experiment_id: str
    task: str
    system_prompt: str
    user_prompt: str
    temperature: float
    max_tokens: int
    results: list[ExperimentResult]
    timestamp: str | None = None


class ExperimentSummary(BaseModel):
    experiment_id: str
    task: str
    user_prompt: str
    model_ids: list[str]
    results_count: int
    timestamp: str | None = None


# ── Database ─────────────────────────────────────────────────────────────────

class ColumnInfo(BaseModel):
    name: str
    type: str
    is_computed: bool
    comment: str | None = None
    custom_metadata: dict | None = None


class TableInfo(BaseModel):
    path: str
    display_name: str
    columns: list[ColumnInfo]
    row_count: int
    is_view: bool
    base_table: str | None = None


class TableListResponse(BaseModel):
    tables: list[TableInfo]


class TableRowsResponse(BaseModel):
    path: str
    columns: list[str]
    rows: list[dict]
    total: int
    offset: int
    limit: int


class SampleResponse(BaseModel):
    path: str
    rows: list[dict]
    count: int
    params: dict


# ── Database Management (CRUD) ───────────────────────────────────────────────

# Tables

class CreateTableRequest(BaseModel):
    path: str
    columns: dict[str, str] = Field(alias="schema")
    primary_key: str | list[str] | None = None
    comment: str = ""

    model_config = {"populate_by_name": True}

class DropTableRequest(BaseModel):
    path: str
    force: bool = False

class RenameTableRequest(BaseModel):
    path: str
    new_path: str

class InsertRowsRequest(BaseModel):
    path: str
    rows: list[dict]

class DeleteRowsRequest(BaseModel):
    path: str
    where: dict

class RevertTableRequest(BaseModel):
    path: str

# Columns

class AddColumnRequest(BaseModel):
    path: str
    column_name: str
    column_type: str

class AddComputedColumnRequest(BaseModel):
    path: str
    column_name: str
    expression: str
    if_exists: str = "error"

class DropColumnRequest(BaseModel):
    path: str
    column_name: str

class RenameColumnRequest(BaseModel):
    path: str
    old_name: str
    new_name: str

# Views

class CreateViewRequest(BaseModel):
    path: str
    base_table: str
    iterator_type: str | None = None
    iterator_args: dict | None = None
    comment: str = ""

# Embedding indexes

class AddEmbeddingIndexRequest(BaseModel):
    path: str
    column: str
    embedding_function: str
    metric: str = "cosine"

class DropEmbeddingIndexRequest(BaseModel):
    path: str
    column: str

# Directories

class CreateDirRequest(BaseModel):
    path: str
    parents: bool = False

class DropDirRequest(BaseModel):
    path: str
    force: bool = False

# Generic success response for management ops
class MgmtResponse(BaseModel):
    success: bool
    message: str
    path: str | None = None
    detail: dict | None = None


# ── Export ────────────────────────────────────────────────────────────────────

class ExportTableInfo(BaseModel):
    path: str
    columns: list[str]
    row_count: int


class ExportTablesResponse(BaseModel):
    tables: list[ExportTableInfo]


class JsonColumnResponse(BaseModel):
    path: str
    column: str
    rows: list[dict]
    count: int


class PreviewResponse(BaseModel):
    columns: list[str]
    rows: list[dict]
    count: int


# ── Integrations ─────────────────────────────────────────────────────────────

class NotificationRow(BaseModel):
    """Row model for the agents.notifications table."""
    service: str
    destination: str
    message: str
    status: str
    response_code: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    user_id: str = config.DEFAULT_USER_ID


class IntegrationInfo(BaseModel):
    id: str
    name: str
    description: str
    configured: bool
    env_var: str


class IntegrationsStatusResponse(BaseModel):
    integrations: list[IntegrationInfo]
    total_configured: int


class TestNotificationRequest(BaseModel):
    service: str
    message: str = "Test notification from Pixelbot"


class TestNotificationResponse(BaseModel):
    service: str
    status: str
    result: str
    timestamp: str


class NotificationLogEntry(BaseModel):
    service: str
    message: str
    status: str
    response_code: int
    timestamp: str
    source: str = "manual"  # "manual" (test button) or "agent" (tool call)


class NotificationLogResponse(BaseModel):
    notifications: list[NotificationLogEntry]
    total: int
