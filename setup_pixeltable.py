# Third-party library imports
from dotenv import load_dotenv

# Import centralized configuration **before** Pixeltable/UDF imports that might use it
import config

# Pixeltable core imports
import pixeltable as pxt

# Pixeltable function imports - organized by category
# - Image and video processing
from pixeltable.functions import image as pxt_image
from pixeltable.functions.video import extract_audio

# - LLM and AI model integrations
from pixeltable.functions.anthropic import invoke_tools, messages
from pixeltable.functions.huggingface import sentence_transformer, clip
from pixeltable.functions import openai
from pixeltable.functions.mistralai import chat_completions as mistral

# - Data transformation tools
from pixeltable.iterators import (
    DocumentSplitter,
    FrameIterator,
    AudioSplitter,
    StringSplitter,
)
from pixeltable.functions import string as pxt_str

# Custom function imports (UDFs)
import functions

# Load environment variables
load_dotenv()

# Initialize the Pixeltable directory structure
# This provides a clean, hierarchical organization for related tables and views.

# WARNING: The following line will DELETE ALL DATA (TABLES, VIEWS, INDEXES) in the 'agents' directory.
pxt.drop_dir("agents", force=True)
pxt.create_dir("agents", if_exists="ignore")  # Use if_exists='ignore' to avoid errors if the directory already exists

# === DOCUMENT PROCESSING ===
# Create a table to store uploaded documents.
# Pixeltable tables manage schema and efficiently store references to data.
documents = pxt.create_table(
    "agents.collection",
    {"document": pxt.Document, "uuid": pxt.String, "timestamp": pxt.Timestamp, "user_id": pxt.String},
    if_exists="ignore",
)
print("Created/Loaded 'agents.collection' table")

# Create a view to chunk documents using a Pixeltable Iterator.
# Views transform data on-demand without duplicating storage.
# Iterators like DocumentSplitter handle the generation of new rows (chunks).
chunks = pxt.create_view(
    "agents.chunks",
    documents,
    iterator=DocumentSplitter.create(
        document=documents.document,
        separators="paragraph",
        metadata="title, heading, page" # Include metadata from the document
    ),
    if_exists="ignore",
)

# Add an embedding index to the 'text' column of the chunks view.
# This enables fast semantic search using vector similarity.
chunks.add_embedding_index(
    "text",  # The column containing text to index
    string_embed=sentence_transformer.using( # Specify the embedding function
        model_id=config.EMBEDDING_MODEL_ID
    ),  # Use model from config
    if_exists="ignore",
)


# Define a reusable search query function using the @pxt.query decorator.
# This allows calling complex search logic easily from other parts of the application.
@pxt.query
def search_documents(query_text: str, user_id: str):
    # Calculate semantic similarity between the query and indexed text chunks.
    sim = chunks.text.similarity(query_text)
    # Use Pixeltable's fluent API (similar to SQL) to filter, order, and select results.
    return (
        chunks.where(
            (chunks.user_id == user_id)
            & (sim > 0.5)  # Filter by similarity threshold
            & (pxt_str.len(chunks.text) > 30) # Filter by minimum length
        )
        .order_by(sim, asc=False)
        .select(
            chunks.text,
            source_doc=chunks.document,  # Include reference to the original document
            sim=sim,
            title=chunks.title,
            heading=chunks.heading,
            page_number=chunks.page
        )
        .limit(20)
    )

# === IMAGE PROCESSING ===
# Create a table for images using Pixeltable's built-in Image type.
images = pxt.create_table(
    "agents.images",
    {"image": pxt.Image, "uuid": pxt.String, "timestamp": pxt.Timestamp, "user_id": pxt.String},
    if_exists="ignore",
)
print("Created/Loaded 'agents.images' table")

# Add a computed column to automatically generate image thumbnails.
# Pixeltable runs the specified function(s) whenever new data is added or dependencies change.
THUMB_SIZE_SIDEBAR = (96, 96)
images.add_computed_column(
    thumbnail=pxt_image.b64_encode( # Encode the resized image as Base64
        pxt_image.resize(images.image, size=THUMB_SIZE_SIDEBAR) # Resize the image
    ),
    if_exists="ignore",
)
print("Added/verified thumbnail computed column for images.")

# Add an embedding index for images using CLIP.
# This enables cross-modal search (text-to-image and image-to-image).
images.add_embedding_index(
    "image",
    embedding=clip.using(model_id=config.CLIP_MODEL_ID), # Use CLIP model from config
    if_exists="ignore",
)


# Define an image search query.
@pxt.query
def search_images(query_text: str, user_id: str):
    # Calculate similarity between the query text embedding and image embeddings.
    sim = images.image.similarity(query_text)  # Cross-modal similarity search
    print(f"Image search query: {query_text} for user: {user_id}")
    return (
        images.where((images.user_id == user_id) & (sim > 0.25))
        .order_by(sim, asc=False)
        .select(
            # Return Base64 encoded, resized images for direct display in the UI.
            encoded_image=pxt_image.b64_encode(
                pxt_image.resize(images.image, size=(224, 224)), "png"
            ),
            sim=sim,
        )
        .limit(5)
    )


# === VIDEO PROCESSING ===
# Create a table for videos.
videos = pxt.create_table(
    "agents.videos",
    {"video": pxt.Video, "uuid": pxt.String, "timestamp": pxt.Timestamp, "user_id": pxt.String},
    if_exists="ignore",
)
print("Created/Loaded 'agents.videos' table")

# Create a view to extract frames from videos using FrameIterator.
print("Creating video frames view...")
video_frames_view = pxt.create_view(
    "agents.video_frames",
    videos,
    iterator=FrameIterator.create(video=videos.video, fps=1), # Extract 1 frame per second
    if_exists="ignore",
)
print("Created/Loaded 'agents.video_frames' view")

# Add an embedding index to video frames using CLIP.
print("Adding video frame embedding index (CLIP)...")
video_frames_view.add_embedding_index(
    column="frame",
    embedding=clip.using(model_id=config.CLIP_MODEL_ID),
    if_exists="ignore",
)
print("Video frame embedding index created/verified.")


# Define a video frame search query.
@pxt.query
def search_video_frames(query_text: str, user_id: str):
    sim = video_frames_view.frame.similarity(query_text)
    print(f"Video Frame search query: {query_text} for user: {user_id}")
    return (
        video_frames_view.where((video_frames_view.user_id == user_id) & (sim > 0.25))
        .order_by(sim, asc=False)
        .select(
            encoded_frame=pxt_image.b64_encode(video_frames_view.frame, "png"),
            source_video=video_frames_view.video, # Link back to the original video
            sim=sim,
        )
        .limit(5)
    )


# Add a computed column to automatically extract audio from videos.
videos.add_computed_column(
    audio=extract_audio(videos.video, format="mp3"), if_exists="ignore"
)

# === AUDIO TRANSCRIPTION AND SEARCH ===
# Create a view to chunk audio extracted from videos using AudioSplitter.
video_audio_chunks_view = pxt.create_view(
    "agents.video_audio_chunks",
    videos,
    iterator=AudioSplitter.create(
        audio=videos.audio,          # Input column with extracted audio
        chunk_duration_sec=30.0
    ),
    if_exists="ignore",
)

# Add a computed column to transcribe video audio chunks using OpenAI Whisper.
print("Adding/Computing video audio transcriptions (OpenAI Whisper API)...")
video_audio_chunks_view.add_computed_column(
    transcription=openai.transcriptions(
        audio=video_audio_chunks_view.audio,
        model=config.WHISPER_MODEL_ID,
    ),
    if_exists="replace", # 'replace' ensures updates if the function or model changes
)
print("Video audio transcriptions column added/updated.")

# Create a view to split video transcriptions into sentences using StringSplitter.
video_transcript_sentences_view = pxt.create_view(
    "agents.video_transcript_sentences",
    video_audio_chunks_view.where(
        video_audio_chunks_view.transcription != None # Process only chunks with transcriptions
    ),
    iterator=StringSplitter.create(
        text=video_audio_chunks_view.transcription.text, # Access the 'text' field from the JSON result
        separators="sentence",
    ),
    if_exists="ignore",
)

# Define the embedding model once for reuse.
sentence_embed_model = sentence_transformer.using(
    model_id=config.EMBEDDING_MODEL_ID
)

# Add an embedding index to video transcript sentences.
print("Adding video transcript sentence embedding index...")
video_transcript_sentences_view.add_embedding_index(
    column="text",
    string_embed=sentence_embed_model,
    if_exists="ignore",
)
print("Video transcript sentence embedding index created/verified.")


# Define video transcript search query.
@pxt.query
def search_video_transcripts(query_text: str):
    """ Search for video transcripts by text query.
    Args:
        query_text (str): The text query to search for.
    Returns:
        A list of video transcript sentences and their source video files.
    """
    sim = video_transcript_sentences_view.text.similarity(query_text)
    return (
        video_transcript_sentences_view.where((video_transcript_sentences_view.user_id == 'local_user') & (sim > 0.7))
        .order_by(sim, asc=False)
        .select(
            video_transcript_sentences_view.text,
            source_video=video_transcript_sentences_view.video, # Link back to the video
            sim=sim,
        )
        .limit(20)
    )


# === DIRECT AUDIO FILE PROCESSING ===
# Create a table for directly uploaded audio files.
audios = pxt.create_table(
    "agents.audios",
    {"audio": pxt.Audio, "uuid": pxt.String, "timestamp": pxt.Timestamp, "user_id": pxt.String},
    if_exists="ignore",
)
print("Created/Loaded 'agents.audios' table")

# Sample data insertion (disabled by default)
print("Sample audio insertion is disabled.")

# Create view to chunk directly uploaded audio files.
audio_chunks_view = pxt.create_view(
    "agents.audio_chunks",
    audios,
    iterator=AudioSplitter.create(
        audio=audios.audio,
        chunk_duration_sec=60.0
    ),
    if_exists="ignore",
)

# Add computed column to transcribe direct audio chunks.
print("Adding/Computing direct audio transcriptions (OpenAI Whisper API)...")
audio_chunks_view.add_computed_column(
    transcription=openai.transcriptions(
        audio=audio_chunks_view.audio,
        model=config.WHISPER_MODEL_ID,
    ),
    if_exists="replace",
)
print("Direct audio transcriptions column added/updated.")

# Create view to split direct audio transcriptions into sentences.
audio_transcript_sentences_view = pxt.create_view(
    "agents.audio_transcript_sentences",
    audio_chunks_view.where(audio_chunks_view.transcription != None),
    iterator=StringSplitter.create(
        text=audio_chunks_view.transcription.text, separators="sentence"
    ),
    if_exists="ignore",
)

# Add embedding index to direct audio transcript sentences.
print("Adding direct audio transcript sentence embedding index...")
audio_transcript_sentences_view.add_embedding_index(
    column="text",
    string_embed=sentence_embed_model, # Reuse the same sentence model
    if_exists="ignore",
)
print("Direct audio transcript sentence embedding index created/verified.")


# Define direct audio transcript search query.
@pxt.query
def search_audio_transcripts(query_text: str):
    """ Search for audio transcripts by text query.
    Args:
        query_text (str): The text query to search for.
    Returns:
        A list of audio transcript sentences and their source audio files.
    """
    sim = audio_transcript_sentences_view.text.similarity(query_text)
    print(f"Direct Audio Transcript search query: {query_text}")
    return (
        audio_transcript_sentences_view.where((audio_transcript_sentences_view.user_id == 'local_user') & (sim > 0.6))
        .order_by(sim, asc=False)
        .select(
            audio_transcript_sentences_view.text,
            source_audio=audio_transcript_sentences_view.audio, # Link back to the audio file
            sim=sim,
        )
        .limit(30)
    )


# === SELECTIVE MEMORY BANK (Code & Text) ===
# Create table for storing user-saved text or code snippets.
memory_bank = pxt.create_table(
    "agents.memory_bank",
    {
        "content": pxt.String,          # The saved text or code
        "type": pxt.String,             # 'code' or 'text'
        "language": pxt.String,         # Programming language (if type='code')
        "context_query": pxt.String,    # User note or query that generated the content
        "timestamp": pxt.Timestamp,
        "user_id": pxt.String
    },
    if_exists="ignore",
)

# Add embedding index for semantic search on memory bank content.
print("Adding memory bank content embedding index...")
memory_bank.add_embedding_index(
    column="content",
    string_embed=sentence_embed_model, # Reuse the sentence model
    if_exists="ignore",
)
print("Memory bank content embedding index created/verified.")


# Query to retrieve all memory items for a user.
@pxt.query
def get_all_memory(user_id: str):
    return memory_bank.where(memory_bank.user_id == user_id).select(
        content=memory_bank.content,
        type=memory_bank.type,
        language=memory_bank.language,
        context_query=memory_bank.context_query,
        timestamp=memory_bank.timestamp,
    ).order_by(memory_bank.timestamp, asc=False)


# Query for semantic search on memory bank content.
@pxt.query
def search_memory(query_text: str, user_id: str):
    sim = memory_bank.content.similarity(query_text)
    print(f"Memory Bank search query: {query_text} for user: {user_id}")
    return (
        memory_bank.where((memory_bank.user_id == user_id) & (sim > 0.8))
        .order_by(sim, asc=False)
        .select(
            content=memory_bank.content,
            type=memory_bank.type,
            language=memory_bank.language,
            context_query=memory_bank.context_query,
            sim=sim,
        )
        .limit(10)
    )


# === CHAT HISTORY TABLE & QUERY ===
# Create table specifically for storing conversation turns.
chat_history = pxt.create_table(
    "agents.chat_history",
    {
        "role": pxt.String,          # 'user' or 'assistant'
        "content": pxt.String,
        "timestamp": pxt.Timestamp,
        "user_id": pxt.String
    },
    if_exists="ignore",
)

# Add embedding index to chat history content for semantic search over conversations.
print("Adding chat history content embedding index...")
chat_history.add_embedding_index(
    column="content",
    string_embed=sentence_embed_model, # Reuse sentence model
    if_exists="ignore",
)
print("Chat history content embedding index created/verified.")


# Query to retrieve the N most recent chat messages for context.
@pxt.query
def get_recent_chat_history(user_id: str, limit: int = 4): # Default to last 4 messages
    return (
        chat_history.where(chat_history.user_id == user_id)
        .order_by(chat_history.timestamp, asc=False)
        .select(role=chat_history.role, content=chat_history.content)
        .limit(limit)
    )


# Query for semantic search across the entire chat history.
@pxt.query
def search_chat_history(query_text: str, user_id: str):
    sim = chat_history.content.similarity(query_text)
    print(f"Chat History search query: {query_text} for user: {user_id}")
    return (
        chat_history.where((chat_history.user_id == user_id) & (sim > 0.8))
        .order_by(sim, asc=False)
        .select(role=chat_history.role, content=chat_history.content, sim=sim)
        .limit(10)
    )


# === USER PERSONAS TABLE ===
# Create table to store user-defined agent personas (prompts + parameters).
user_personas = pxt.create_table(
    "agents.user_personas",
    {
        "user_id": pxt.String,
        "persona_name": pxt.String,
        "initial_prompt": pxt.String, # System prompt for tool selection stage
        "final_prompt": pxt.String,   # System prompt for final answer generation stage
        "llm_params": pxt.Json,       # LLM parameters (temperature, max_tokens, etc.)
        "timestamp": pxt.Timestamp,
    },
    if_exists="ignore",
)
print("Created/Loaded 'agents.user_personas' table")


# === IMAGE GENERATION PIPELINE ===
# Create table to store image generation requests.
image_gen_tasks = pxt.create_table(
    "agents.image_generation_tasks",
    {"prompt": pxt.String, "timestamp": pxt.Timestamp, "user_id": pxt.String},
    if_exists="ignore",
)

# Add computed column to generate image using OpenAI DALL-E 3.
# This column calls the Pixeltable OpenAI integration function.
image_gen_tasks.add_computed_column(
    generated_image=openai.image_generations(
        prompt=image_gen_tasks.prompt,
        model=config.DALLE_MODEL_ID,
        size="1024x1024",
        # Add other DALL-E parameters like quality, style if desired
    ),
    if_exists="ignore",
)
print("Image generation table and computed column created/verified.")

# === AGENT WORKFLOW DEFINITION ===
# Register User-Defined Functions (UDFs) from functions.py AND reusable @pxt.query functions as tools.
# Pixeltable's `pxt.tools()` helper facilitates this integration.
tools = pxt.tools(
    # UDFs - External API Calls
    functions.get_latest_news,
    functions.fetch_financial_data,
    functions.search_news,
    # Query Functions registered as Tools - Agentic RAG
    search_video_transcripts,
    search_audio_transcripts
)

# Create the main workflow table (`agents.tools`).
# Rows are inserted here when a user submits a query.
# Computed columns define the agent's reasoning and action sequence.
tool_agent = pxt.create_table(
    "agents.tools",
    {
        # Input fields from the user query
        "prompt": pxt.String,
        "timestamp": pxt.Timestamp,
        "user_id": pxt.String,
        "initial_system_prompt": pxt.String, # Persona-specific or default
        "final_system_prompt": pxt.String,   # Persona-specific or default
        # LLM parameters (from persona or defaults)
        "max_tokens": pxt.Int,
        "stop_sequences": pxt.Json,
        "temperature": pxt.Float,
        "top_k": pxt.Int,
        "top_p": pxt.Float,
    },
    if_exists="ignore",
)

# === DECLARATIVE WORKFLOW WITH COMPUTED COLUMNS ===
# Define the agent's processing pipeline declaratively.
# Pixeltable automatically executes these steps based on data dependencies.

# Step 1: Initial LLM Reasoning (Tool Selection)
# Calls Claude via the Pixeltable `messages` function, providing available tools.
tool_agent.add_computed_column(
    initial_response=messages(
        model=config.CLAUDE_MODEL_ID,
        system=tool_agent.initial_system_prompt,
        messages=[{"role": "user", "content": tool_agent.prompt}],
        tools=tools, # Pass the registered tools
        tool_choice=tools.choice(required=True), # Force the LLM to choose a tool
        # Pass LLM parameters from the input row
        max_tokens=tool_agent.max_tokens,
        stop_sequences=tool_agent.stop_sequences,
        temperature=tool_agent.temperature,
        top_k=tool_agent.top_k,
        top_p=tool_agent.top_p,
    ),
    if_exists="replace", # Replace if the function definition changes
)

# Step 2: Tool Execution
# Calls the tool selected by the LLM in the previous step using `invoke_tools`.
tool_agent.add_computed_column(
    tool_output=invoke_tools(tools, tool_agent.initial_response), if_exists="replace"
)

# Step 3: Context Retrieval (Parallel Execution)
# These computed columns call the @pxt.query functions defined earlier.
# Pixeltable can execute these searches in parallel if resources allow.

tool_agent.add_computed_column(
    doc_context=search_documents(tool_agent.prompt, tool_agent.user_id),
    if_exists="replace",
)

tool_agent.add_computed_column(
    image_context=search_images(tool_agent.prompt, tool_agent.user_id), if_exists="replace"
)

# Add Video Frame Search Context
tool_agent.add_computed_column(
    video_frame_context=search_video_frames(tool_agent.prompt, tool_agent.user_id), if_exists="ignore"
)

tool_agent.add_computed_column(
    memory_context=search_memory(tool_agent.prompt, tool_agent.user_id), if_exists="ignore"
)

tool_agent.add_computed_column(
    chat_memory_context=search_chat_history(tool_agent.prompt, tool_agent.user_id), if_exists="ignore"
)

# Step 4: Retrieve Recent Chat History
tool_agent.add_computed_column(
    history_context=get_recent_chat_history(tool_agent.user_id),
    if_exists="ignore",
)

# Step 5: Assemble Multimodal Context Summary (Text Only)
# Calls a UDF to combine text-based context. Video/Audio transcript context
# will now be part of tool_output if the LLM chose to call those tools.
tool_agent.add_computed_column(
    multimodal_context_summary=functions.assemble_multimodal_context(
        tool_agent.prompt,
        tool_agent.tool_output,
        tool_agent.doc_context,
        tool_agent.memory_context,
        tool_agent.chat_memory_context,
    ),
    if_exists="replace",
)

# Step 6: Assemble Final LLM Messages
# Calls a UDF to create the structured message list, including image/frame data.
tool_agent.add_computed_column(
    final_prompt_messages=functions.assemble_final_messages(
        tool_agent.history_context,
        tool_agent.multimodal_context_summary,
        image_context=tool_agent.image_context,
        video_frame_context=tool_agent.video_frame_context,
    ),
    if_exists="replace",
)

# Step 7: Final LLM Reasoning (Answer Generation)
# Calls Claude again with the fully assembled context and history.
tool_agent.add_computed_column(
    final_response=messages(
        model=config.CLAUDE_MODEL_ID,
        system=tool_agent.final_system_prompt,
        messages=tool_agent.final_prompt_messages, # Use the assembled message list
        max_tokens=tool_agent.max_tokens,
        stop_sequences=tool_agent.stop_sequences,
        temperature=tool_agent.temperature,
        top_k=tool_agent.top_k,
        top_p=tool_agent.top_p,
    ),
    if_exists="replace",
)

# Step 8: Extract Final Answer Text
# Simple transformation using Pixeltable expressions.
tool_agent.add_computed_column(
    answer=tool_agent.final_response.content[0].text,
    if_exists="replace",
)

# Step 9: Prepare Prompt for Follow-up LLM
# Calls a UDF to format the input for Mistral.
tool_agent.add_computed_column(
    follow_up_input_message=functions.assemble_follow_up_prompt(
        original_prompt=tool_agent.prompt, answer_text=tool_agent.answer
    ),
    if_exists="replace",
)

# Step 10: Generate Follow-up Suggestions (Mistral)
# Calls Mistral via the Pixeltable integration.
tool_agent.add_computed_column(
    follow_up_raw_response=mistral(
        model=config.MISTRAL_MODEL_ID,
        messages=[
            {
                "role": "user",
                "content": tool_agent.follow_up_input_message,
            }
        ],
        max_tokens=150,
        temperature=0.6,
    ),
    if_exists="replace",
)

# Step 11: Extract Follow-up Text
# Simple transformation using Pixeltable expressions.
tool_agent.add_computed_column(
    follow_up_text=tool_agent.follow_up_raw_response.choices[0].message.content,
    if_exists="replace",
)
