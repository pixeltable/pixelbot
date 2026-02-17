# setup_pixeltable.py - Schema definition for the Pixeltable Agent
# Run this script once to initialize (or reset) the database schema.
from dotenv import load_dotenv

import config
import pixeltable as pxt

from pixeltable.functions import image as pxt_image
from pixeltable.functions.video import extract_audio
from pixeltable.functions.anthropic import invoke_tools, messages
from pixeltable.functions.huggingface import sentence_transformer, clip
from pixeltable.functions import openai
from pixeltable.functions import gemini
from pixeltable.iterators import (
    DocumentSplitter,
    FrameIterator,
    AudioSplitter,
    StringSplitter,
)
from pixeltable.functions import string as pxt_str

import functions
from models import FollowUpResponse, DocumentSummary

load_dotenv()

# WARNING: drops ALL data in 'agents' directory on each run
pxt.drop_dir("agents", force=True)
pxt.create_dir("agents", if_exists="ignore")

# ── Document Processing ──────────────────────────────────────────────────────

documents = pxt.create_table(
    "agents.collection",
    {"document": pxt.Document, "uuid": pxt.String, "timestamp": pxt.Timestamp, "user_id": pxt.String},
    if_exists="ignore",
)

# "page, sentence" ensures per-page extraction followed by sentence segmentation,
# which works for ALL document types including PDFs.
chunks = pxt.create_view(
    "agents.chunks",
    documents,
    iterator=DocumentSplitter.create(
        document=documents.document,
        separators="page, sentence",
        metadata="title, heading, page",
    ),
    if_exists="ignore",
)

chunks.add_embedding_index(
    "text",
    string_embed=sentence_transformer.using(model_id=config.EMBEDDING_MODEL_ID),
    if_exists="ignore",
)

# Auto-summarization: extract text then summarize via Gemini (structured JSON output)
documents.add_computed_column(
    document_text=functions.extract_document_text(documents.document),
    if_exists="ignore",
)

documents.add_computed_column(
    summary_response=gemini.generate_content(
        contents=documents.document_text,
        model=config.SUMMARIZATION_MODEL_ID,
        config={
            "system_instruction": "Analyze the document text and return a structured summary.",
            "response_mime_type": "application/json",
            "response_schema": DocumentSummary.model_json_schema(),
        },
    ),
    if_exists="ignore",
)

documents.add_computed_column(
    summary=documents.summary_response.candidates[0].content.parts[0].text,
    if_exists="ignore",
)
print(f"Document auto-summarization: Gemini ({config.SUMMARIZATION_MODEL_ID})")


@pxt.query
def search_documents(query_text: str, user_id: str):
    sim = chunks.text.similarity(query_text)
    return (
        chunks.where((chunks.user_id == user_id) & (sim > 0.5) & (pxt_str.len(chunks.text) > 30))
        .order_by(sim, asc=False)
        .select(chunks.text, source_doc=chunks.document, sim=sim, title=chunks.title, heading=chunks.heading, page_number=chunks.page)
        .limit(20)
    )


# ── Image Processing ─────────────────────────────────────────────────────────

images = pxt.create_table(
    "agents.images",
    {"image": pxt.Image, "uuid": pxt.String, "timestamp": pxt.Timestamp, "user_id": pxt.String},
    if_exists="ignore",
)

THUMB_SIZE_SIDEBAR = (96, 96)
images.add_computed_column(
    thumbnail=pxt_image.b64_encode(pxt_image.resize(images.image, size=THUMB_SIZE_SIDEBAR)),
    if_exists="ignore",
)

images.add_embedding_index(
    "image",
    embedding=clip.using(model_id=config.CLIP_MODEL_ID),
    if_exists="ignore",
)


@pxt.query
def search_images(query_text: str, user_id: str):
    sim = images.image.similarity(query_text)
    return (
        images.where((images.user_id == user_id) & (sim > 0.25))
        .order_by(sim, asc=False)
        .select(encoded_image=pxt_image.b64_encode(pxt_image.resize(images.image, size=(224, 224)), "png"), sim=sim)
        .limit(5)
    )


# ── Video Processing ─────────────────────────────────────────────────────────

videos = pxt.create_table(
    "agents.videos",
    {"video": pxt.Video, "uuid": pxt.String, "timestamp": pxt.Timestamp, "user_id": pxt.String},
    if_exists="ignore",
)

video_frames_view = pxt.create_view(
    "agents.video_frames",
    videos,
    iterator=FrameIterator.create(video=videos.video, keyframes_only=True),
    if_exists="ignore",
)

FRAME_THUMB_SIZE = (192, 192)
video_frames_view.add_computed_column(
    frame_thumbnail=pxt_image.b64_encode(pxt_image.resize(video_frames_view.frame, size=FRAME_THUMB_SIZE)),
    if_exists="ignore",
)

video_frames_view.add_embedding_index(
    column="frame",
    embedding=clip.using(model_id=config.CLIP_MODEL_ID),
    if_exists="ignore",
)


@pxt.query
def search_video_frames(query_text: str, user_id: str):
    sim = video_frames_view.frame.similarity(query_text)
    return (
        video_frames_view.where((video_frames_view.user_id == user_id) & (sim > 0.25))
        .order_by(sim, asc=False)
        .select(encoded_frame=pxt_image.b64_encode(video_frames_view.frame, "png"), source_video=video_frames_view.video, sim=sim)
        .limit(5)
    )


videos.add_computed_column(audio=extract_audio(videos.video, format="mp3"), if_exists="ignore")

# Video audio transcription pipeline
video_audio_chunks_view = pxt.create_view(
    "agents.video_audio_chunks",
    videos,
    iterator=AudioSplitter.create(audio=videos.audio, chunk_duration_sec=30.0),
    if_exists="ignore",
)

video_audio_chunks_view.add_computed_column(
    transcription=openai.transcriptions(audio=video_audio_chunks_view.audio, model=config.WHISPER_MODEL_ID),
    if_exists="replace",
)

video_transcript_sentences_view = pxt.create_view(
    "agents.video_transcript_sentences",
    video_audio_chunks_view.where(video_audio_chunks_view.transcription != None),
    iterator=StringSplitter.create(text=video_audio_chunks_view.transcription.text, separators="sentence"),
    if_exists="ignore",
)

sentence_embed_model = sentence_transformer.using(model_id=config.EMBEDDING_MODEL_ID)

video_transcript_sentences_view.add_embedding_index(
    column="text", string_embed=sentence_embed_model, if_exists="ignore"
)


@pxt.query
def search_video_transcripts(query_text: str):
    """Search video transcripts by semantic similarity to the query text."""
    sim = video_transcript_sentences_view.text.similarity(query_text)
    return (
        video_transcript_sentences_view.where((video_transcript_sentences_view.user_id == config.DEFAULT_USER_ID) & (sim > 0.7))
        .order_by(sim, asc=False)
        .select(video_transcript_sentences_view.text, source_video=video_transcript_sentences_view.video, sim=sim)
        .limit(20)
    )


# ── Audio Processing ─────────────────────────────────────────────────────────

audios = pxt.create_table(
    "agents.audios",
    {"audio": pxt.Audio, "uuid": pxt.String, "timestamp": pxt.Timestamp, "user_id": pxt.String},
    if_exists="ignore",
)

audio_chunks_view = pxt.create_view(
    "agents.audio_chunks",
    audios,
    iterator=AudioSplitter.create(audio=audios.audio, chunk_duration_sec=60.0),
    if_exists="ignore",
)

audio_chunks_view.add_computed_column(
    transcription=openai.transcriptions(audio=audio_chunks_view.audio, model=config.WHISPER_MODEL_ID),
    if_exists="replace",
)

audio_transcript_sentences_view = pxt.create_view(
    "agents.audio_transcript_sentences",
    audio_chunks_view.where(audio_chunks_view.transcription != None),
    iterator=StringSplitter.create(text=audio_chunks_view.transcription.text, separators="sentence"),
    if_exists="ignore",
)

audio_transcript_sentences_view.add_embedding_index(
    column="text", string_embed=sentence_embed_model, if_exists="ignore"
)


@pxt.query
def search_audio_transcripts(query_text: str):
    """Search audio transcripts by semantic similarity to the query text."""
    sim = audio_transcript_sentences_view.text.similarity(query_text)
    return (
        audio_transcript_sentences_view.where((audio_transcript_sentences_view.user_id == config.DEFAULT_USER_ID) & (sim > 0.6))
        .order_by(sim, asc=False)
        .select(audio_transcript_sentences_view.text, source_audio=audio_transcript_sentences_view.audio, sim=sim)
        .limit(30)
    )


# ── Memory Bank ──────────────────────────────────────────────────────────────

memory_bank = pxt.create_table(
    "agents.memory_bank",
    {
        "content": pxt.String,
        "type": pxt.String,
        "language": pxt.String,
        "context_query": pxt.String,
        "timestamp": pxt.Timestamp,
        "user_id": pxt.String,
    },
    if_exists="ignore",
)

memory_bank.add_embedding_index(column="content", string_embed=sentence_embed_model, if_exists="ignore")


@pxt.query
def get_all_memory(user_id: str):
    return (
        memory_bank.where(memory_bank.user_id == user_id)
        .select(content=memory_bank.content, type=memory_bank.type, language=memory_bank.language, context_query=memory_bank.context_query, timestamp=memory_bank.timestamp)
        .order_by(memory_bank.timestamp, asc=False)
    )


@pxt.query
def search_memory(query_text: str, user_id: str):
    sim = memory_bank.content.similarity(query_text)
    return (
        memory_bank.where((memory_bank.user_id == user_id) & (sim > 0.8))
        .order_by(sim, asc=False)
        .select(content=memory_bank.content, type=memory_bank.type, language=memory_bank.language, context_query=memory_bank.context_query, sim=sim)
        .limit(10)
    )


# ── Chat History ─────────────────────────────────────────────────────────────

chat_history = pxt.create_table(
    "agents.chat_history",
    {"role": pxt.String, "content": pxt.String, "timestamp": pxt.Timestamp, "user_id": pxt.String},
    if_exists="ignore",
)

chat_history.add_embedding_index(column="content", string_embed=sentence_embed_model, if_exists="ignore")


@pxt.query
def get_recent_chat_history(user_id: str, limit: int = 4):
    return (
        chat_history.where(chat_history.user_id == user_id)
        .order_by(chat_history.timestamp, asc=False)
        .select(role=chat_history.role, content=chat_history.content)
        .limit(limit)
    )


@pxt.query
def search_chat_history(query_text: str, user_id: str):
    sim = chat_history.content.similarity(query_text)
    return (
        chat_history.where((chat_history.user_id == user_id) & (sim > 0.8))
        .order_by(sim, asc=False)
        .select(role=chat_history.role, content=chat_history.content, sim=sim)
        .limit(10)
    )


# ── User Personas ────────────────────────────────────────────────────────────

user_personas = pxt.create_table(
    "agents.user_personas",
    {
        "user_id": pxt.String,
        "persona_name": pxt.String,
        "initial_prompt": pxt.String,
        "final_prompt": pxt.String,
        "llm_params": pxt.Json,
        "timestamp": pxt.Timestamp,
    },
    if_exists="ignore",
)

# ── Image Generation (provider-switchable) ───────────────────────────────────

image_gen_tasks = pxt.create_table(
    "agents.image_generation_tasks",
    {"prompt": pxt.String, "timestamp": pxt.Timestamp, "user_id": pxt.String},
    if_exists="ignore",
)

if config.IMAGE_GEN_PROVIDER == "gemini":
    image_gen_tasks.add_computed_column(
        generated_image=gemini.generate_images(
            prompt=image_gen_tasks.prompt,
            model=config.IMAGEN_MODEL_ID,
        ),
        if_exists="ignore",
    )
    print(f"Image generation: Gemini Imagen ({config.IMAGEN_MODEL_ID})")
else:
    image_gen_tasks.add_computed_column(
        generated_image=openai.image_generations(
            prompt=image_gen_tasks.prompt,
            model=config.DALLE_MODEL_ID,
            model_kwargs={"size": "1024x1024"},
        ),
        if_exists="ignore",
    )
    print(f"Image generation: OpenAI DALL-E ({config.DALLE_MODEL_ID})")

THUMB_SIZE_GEN = (128, 128)
image_gen_tasks.add_computed_column(
    thumbnail=pxt_image.b64_encode(pxt_image.resize(image_gen_tasks.generated_image, size=THUMB_SIZE_GEN)),
    if_exists="ignore",
)

# ── Video Generation (Gemini Veo) ────────────────────────────────────────────

video_gen_tasks = pxt.create_table(
    "agents.video_generation_tasks",
    {"prompt": pxt.String, "timestamp": pxt.Timestamp, "user_id": pxt.String},
    if_exists="ignore",
)

video_gen_tasks.add_computed_column(
    generated_video=gemini.generate_videos(
        prompt=video_gen_tasks.prompt,
        model=config.VEO_MODEL_ID,
    ),
    if_exists="ignore",
)
print(f"Video generation: Gemini Veo ({config.VEO_MODEL_ID})")

# ── Speech Generation (TTS) ───────────────────────────────────────────────────

speech_tasks = pxt.create_table(
    "agents.speech_tasks",
    {
        "input_text": pxt.String,
        "voice": pxt.String,
        "timestamp": pxt.Timestamp,
        "user_id": pxt.String,
    },
    if_exists="ignore",
)

speech_tasks.add_computed_column(
    audio=openai.speech(speech_tasks.input_text, model="tts-1", voice=speech_tasks.voice),
    if_exists="ignore",
)
print("Speech generation: OpenAI TTS (tts-1)")

# ── CSV Tables Registry ───────────────────────────────────────────────────────

csv_registry = pxt.create_table(
    "agents.csv_registry",
    {
        "table_name": pxt.String,       # Pixeltable path, e.g. "agents.csv_sales_abc123"
        "display_name": pxt.String,      # Human-readable name, e.g. "sales.csv"
        "uuid": pxt.String,
        "row_count": pxt.Int,
        "col_names": pxt.Json,           # List of column names
        "timestamp": pxt.Timestamp,
        "user_id": pxt.String,
    },
    if_exists="ignore",
)

# ── Prompt Experiments ─────────────────────────────────────────────────────────

prompt_experiments = pxt.create_table(
    "agents.prompt_experiments",
    {
        "experiment_id": pxt.String,
        "task": pxt.String,
        "system_prompt": pxt.String,
        "user_prompt": pxt.String,
        "model_id": pxt.String,
        "model_name": pxt.String,
        "provider": pxt.String,
        "temperature": pxt.Float,
        "max_tokens": pxt.Int,
        "response": pxt.String,
        "response_time_ms": pxt.Float,
        "word_count": pxt.Int,
        "char_count": pxt.Int,
        "error": pxt.String,
        "timestamp": pxt.Timestamp,
        "user_id": pxt.String,
    },
    if_exists="ignore",
)

# ── Agent Workflow ────────────────────────────────────────────────────────────

tools = pxt.tools(
    functions.get_latest_news,
    functions.fetch_financial_data,
    functions.search_news,
    search_video_transcripts,
    search_audio_transcripts,
)

tool_agent = pxt.create_table(
    "agents.tools",
    {
        "prompt": pxt.String,
        "timestamp": pxt.Timestamp,
        "user_id": pxt.String,
        "initial_system_prompt": pxt.String,
        "final_system_prompt": pxt.String,
        "max_tokens": pxt.Int,
        "temperature": pxt.Float,
    },
    if_exists="ignore",
)

# Step 1: Initial LLM reasoning (tool selection)
# Note: Only include non-nullable params in model_kwargs.
# The Anthropic API rejects None values for optional params like top_k, top_p, stop_sequences.
tool_agent.add_computed_column(
    initial_response=messages(
        model=config.CLAUDE_MODEL_ID,
        messages=[{"role": "user", "content": tool_agent.prompt}],
        tools=tools,
        tool_choice=tools.choice(required=True),
        max_tokens=tool_agent.max_tokens,
        model_kwargs={
            "system": tool_agent.initial_system_prompt,
            "temperature": tool_agent.temperature,
        },
    ),
    if_exists="replace",
)

# Step 2: Tool execution
tool_agent.add_computed_column(tool_output=invoke_tools(tools, tool_agent.initial_response), if_exists="replace")

# Step 3: Context retrieval
tool_agent.add_computed_column(doc_context=search_documents(tool_agent.prompt, tool_agent.user_id), if_exists="replace")
tool_agent.add_computed_column(image_context=search_images(tool_agent.prompt, tool_agent.user_id), if_exists="replace")
tool_agent.add_computed_column(video_frame_context=search_video_frames(tool_agent.prompt, tool_agent.user_id), if_exists="ignore")
tool_agent.add_computed_column(memory_context=search_memory(tool_agent.prompt, tool_agent.user_id), if_exists="ignore")
tool_agent.add_computed_column(chat_memory_context=search_chat_history(tool_agent.prompt, tool_agent.user_id), if_exists="ignore")

# Step 4: Recent chat history
tool_agent.add_computed_column(history_context=get_recent_chat_history(tool_agent.user_id), if_exists="ignore")

# Step 5: Assemble multimodal context
tool_agent.add_computed_column(
    multimodal_context_summary=functions.assemble_multimodal_context(
        tool_agent.prompt, tool_agent.tool_output, tool_agent.doc_context, tool_agent.memory_context, tool_agent.chat_memory_context,
    ),
    if_exists="replace",
)

# Step 6: Assemble final LLM messages
tool_agent.add_computed_column(
    final_prompt_messages=functions.assemble_final_messages(
        tool_agent.history_context, tool_agent.multimodal_context_summary,
        image_context=tool_agent.image_context, video_frame_context=tool_agent.video_frame_context,
    ),
    if_exists="replace",
)

# Step 7: Final LLM reasoning (answer generation)
tool_agent.add_computed_column(
    final_response=messages(
        model=config.CLAUDE_MODEL_ID,
        messages=tool_agent.final_prompt_messages,
        max_tokens=tool_agent.max_tokens,
        model_kwargs={
            "system": tool_agent.final_system_prompt,
            "temperature": tool_agent.temperature,
        },
    ),
    if_exists="replace",
)

# Step 8: Extract answer text
tool_agent.add_computed_column(answer=tool_agent.final_response.content[0].text, if_exists="replace")

# Step 9: Follow-up question prompt
tool_agent.add_computed_column(
    follow_up_input_message=functions.assemble_follow_up_prompt(original_prompt=tool_agent.prompt, answer_text=tool_agent.answer),
    if_exists="replace",
)

# Step 10: Generate follow-up suggestions (Gemini — Pydantic-enforced structured output)
tool_agent.add_computed_column(
    follow_up_raw_response=gemini.generate_content(
        contents=tool_agent.follow_up_input_message,
        model=config.SUMMARIZATION_MODEL_ID,
        config={
            "system_instruction": "Generate exactly 3 relevant follow-up questions based on the conversation.",
            "response_mime_type": "application/json",
            "response_schema": FollowUpResponse.model_json_schema(),
        },
    ),
    if_exists="replace",
)

# Step 11: Extract follow-up JSON text
tool_agent.add_computed_column(
    follow_up_text=tool_agent.follow_up_raw_response.candidates[0].content.parts[0].text,
    if_exists="replace",
)

print("Schema setup complete.")
