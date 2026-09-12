"""Pixeltable 0.7 application schema for Pixelbot.

This module is safe to import: it declares models and queries but never mutates a
catalog. Apply it through ``pxt schema update pixelbot/app.py pixelbot_v3``.
"""

from __future__ import annotations

import pixeltable as pxt
from pixeltable.functions import bfl, gemini, openai
from pixeltable.functions import image as pxt_image
from pixeltable.functions import string as pxt_string
from pixeltable.functions.audio import audio_splitter
from pixeltable.functions.document import document_splitter
from pixeltable.functions.gemini import invoke_tools
from pixeltable.functions.huggingface import clip
from pixeltable.functions.string import string_splitter
from pixeltable.functions.video import extract_audio, frame_iterator

from pixelbot import config, functions
from pixelbot.models import DocumentSummary, FollowUpResponse

TableModel = pxt.model_base()

geminiEmbed = gemini.embed_content.using(model=config.GEMINI_EMBEDDING_MODEL_ID)
clipEmbed = clip.using(model_id=config.CLIP_MODEL_ID)


class Documents(TableModel, name="collection", has_default_idxs=False):
    document: pxt.Document
    uuid = pxt.Column(type=pxt.String, primary_key=True)
    timestamp: pxt.Timestamp
    user_id: pxt.String
    document_text = functions.extract_document_text(document)
    summary_response = gemini.generate_content(
        contents=document_text,
        model=config.GEMINI_MODEL_ID,
        config={
            "system_instruction": "Analyze the document text and return a structured summary.",
            "response_mime_type": "application/json",
            "response_schema": DocumentSummary.model_json_schema(),
        },
    )
    summary = summary_response.candidates[0].content.parts[0].text
    __indexes__ = [pxt.BtreeIndex(user_id), pxt.BtreeIndex(timestamp)]


class Chunks(
    TableModel,
    name="chunks",
    base=Documents,
    iterator=document_splitter(
        Documents.document,
        separators="page, sentence",
        metadata="title, heading, page",
    ),
    has_default_idxs=False,
):
    __indexes__ = [
        pxt.EmbeddingIndex(text, string_embed=geminiEmbed, name="chunks_text_gemini"),  # type: ignore[name-defined]
    ]


@pxt.query
def search_documents(query_text: str, user_id: str):
    sim = Chunks.text.similarity(string=query_text)
    return (
        Chunks.where((Chunks.user_id == user_id) & (sim > 0.5) & (pxt_string.len(Chunks.text) > 30))
        .order_by(sim, asc=False)
        .select(
            Chunks.text,
            source_doc=Chunks.document,
            sim=sim,
            title=Chunks.title,
            heading=Chunks.heading,
            page_number=Chunks.page,
        )
        .limit(20)
    )


class Images(TableModel, name="images", has_default_idxs=False):
    image: pxt.Image
    uuid = pxt.Column(type=pxt.String, primary_key=True)
    timestamp: pxt.Timestamp
    user_id: pxt.String
    thumbnail = pxt_image.b64_encode(pxt_image.resize(image, size=(96, 96)))
    caption_response = gemini.generate_content(
        contents=[image, "Describe this image in one detailed sentence."],
        model=config.GEMINI_MODEL_ID,
    )
    caption = caption_response.candidates[0].content.parts[0].text
    __indexes__ = [
        pxt.EmbeddingIndex(image, embedding=clipEmbed, name="images_clip"),
        pxt.BtreeIndex(user_id),
        pxt.BtreeIndex(timestamp),
    ]


@pxt.query
def search_images(query_text: str, user_id: str):
    sim = Images.image.similarity(string=query_text)  # type: ignore[attr-defined]
    return (
        Images.where((Images.user_id == user_id) & (sim > 0.25))
        .order_by(sim, asc=False)
        .select(
            encoded_image=pxt_image.b64_encode(pxt_image.resize(Images.image, size=(224, 224)), "png"),
            sim=sim,
            caption=Images.caption,
        )
        .limit(5)
    )


class Videos(TableModel, name="videos", has_default_idxs=False):
    video: pxt.Video
    uuid = pxt.Column(type=pxt.String, primary_key=True)
    timestamp: pxt.Timestamp
    user_id: pxt.String
    audio = extract_audio(video, format="mp3")
    __indexes__ = [pxt.BtreeIndex(user_id), pxt.BtreeIndex(timestamp)]


class VideoFrames(
    TableModel,
    name="video_frames",
    base=Videos,
    iterator=frame_iterator(Videos.video, keyframes_only=True),
    has_default_idxs=False,
):
    frame_thumbnail = pxt_image.b64_encode(pxt_image.resize(frame, size=(192, 192)))  # type: ignore[name-defined]
    __indexes__ = [
        pxt.EmbeddingIndex(frame, embedding=clipEmbed, name="video_frames_clip"),  # type: ignore[name-defined]
    ]


@pxt.query
def search_video_frames(query_text: str, user_id: str):
    sim = VideoFrames.frame.similarity(string=query_text)
    return (
        VideoFrames.where((VideoFrames.user_id == user_id) & (sim > 0.25))
        .order_by(sim, asc=False)
        .select(
            encoded_frame=pxt_image.b64_encode(VideoFrames.frame, "png"),
            source_video=VideoFrames.video,
            sim=sim,
        )
        .limit(5)
    )


class VideoAudioChunks(
    TableModel,
    name="video_audio_chunks",
    base=Videos,
    iterator=audio_splitter(Videos.audio, duration=30.0),
    has_default_idxs=False,
):
    transcription = openai.transcriptions(audio=audio, model=config.WHISPER_MODEL_ID)  # type: ignore[name-defined]


class VideoTranscriptSentences(
    TableModel,
    name="video_transcript_sentences",
    base=VideoAudioChunks.where(VideoAudioChunks.transcription != None),  # noqa: E711
    iterator=string_splitter(VideoAudioChunks.transcription.text, separators="sentence"),
    has_default_idxs=False,
):
    __indexes__ = [
        pxt.EmbeddingIndex(text, string_embed=geminiEmbed, name="video_sentences_gemini"),  # type: ignore[name-defined]
    ]


@pxt.query
def search_video_transcripts(query_text: str, user_id: str = config.DEFAULT_USER_ID):
    sim = VideoTranscriptSentences.text.similarity(string=query_text)
    return (
        VideoTranscriptSentences.where((VideoTranscriptSentences.user_id == user_id) & (sim > 0.7))
        .order_by(sim, asc=False)
        .select(VideoTranscriptSentences.text, source_video=VideoTranscriptSentences.video, sim=sim)
        .limit(20)
    )


class Audios(TableModel, name="audios", has_default_idxs=False):
    audio: pxt.Audio
    uuid = pxt.Column(type=pxt.String, primary_key=True)
    timestamp: pxt.Timestamp
    user_id: pxt.String
    __indexes__ = [pxt.BtreeIndex(user_id), pxt.BtreeIndex(timestamp)]


class AudioChunks(
    TableModel,
    name="audio_chunks",
    base=Audios,
    iterator=audio_splitter(Audios.audio, duration=60.0),
    has_default_idxs=False,
):
    transcription = openai.transcriptions(audio=audio, model=config.WHISPER_MODEL_ID)  # type: ignore[name-defined]


class AudioTranscriptSentences(
    TableModel,
    name="audio_transcript_sentences",
    base=AudioChunks.where(AudioChunks.transcription != None),  # noqa: E711
    iterator=string_splitter(AudioChunks.transcription.text, separators="sentence"),
    has_default_idxs=False,
):
    __indexes__ = [
        pxt.EmbeddingIndex(text, string_embed=geminiEmbed, name="audio_sentences_gemini"),  # type: ignore[name-defined]
    ]


@pxt.query
def search_audio_transcripts(query_text: str, user_id: str = config.DEFAULT_USER_ID):
    sim = AudioTranscriptSentences.text.similarity(string=query_text)
    return (
        AudioTranscriptSentences.where((AudioTranscriptSentences.user_id == user_id) & (sim > 0.6))
        .order_by(sim, asc=False)
        .select(AudioTranscriptSentences.text, source_audio=AudioTranscriptSentences.audio, sim=sim)
        .limit(30)
    )


class MemoryBank(TableModel, name="memory_bank", has_default_idxs=False):
    content: pxt.String
    type: pxt.String
    language: pxt.String | None
    context_query: pxt.String
    timestamp: pxt.Timestamp
    user_id: pxt.String
    __indexes__ = [
        pxt.EmbeddingIndex(content, string_embed=geminiEmbed, name="memory_gemini"),
        pxt.BtreeIndex(user_id),
        pxt.BtreeIndex(timestamp),
    ]


@pxt.query
def get_all_memory(user_id: str):
    return (
        MemoryBank.where(MemoryBank.user_id == user_id)
        .select(
            content=MemoryBank.content,
            type=MemoryBank.type,
            language=MemoryBank.language,
            context_query=MemoryBank.context_query,
            timestamp=MemoryBank.timestamp,
        )
        .order_by(MemoryBank.timestamp, asc=False)
    )


@pxt.query
def search_memory(query_text: str, user_id: str):
    sim = MemoryBank.content.similarity(string=query_text)  # type: ignore[attr-defined]
    return (
        MemoryBank.where((MemoryBank.user_id == user_id) & (sim > 0.7))
        .order_by(sim, asc=False)
        .select(
            content=MemoryBank.content,
            type=MemoryBank.type,
            language=MemoryBank.language,
            context_query=MemoryBank.context_query,
            sim=sim,
        )
        .limit(10)
    )


class ChatHistory(TableModel, name="chat_history", has_default_idxs=False):
    role: pxt.String
    content: pxt.String
    conversation_id: pxt.String
    timestamp: pxt.Timestamp
    user_id: pxt.String
    __indexes__ = [
        pxt.EmbeddingIndex(content, string_embed=geminiEmbed, name="chat_history_gemini"),
        pxt.BtreeIndex(user_id),
        pxt.BtreeIndex(conversation_id),
        pxt.BtreeIndex(timestamp),
    ]


@pxt.query
def get_recent_chat_history(user_id: str, limit: int = 4):
    return (
        ChatHistory.where(ChatHistory.user_id == user_id)
        .order_by(ChatHistory.timestamp, asc=False)
        .select(role=ChatHistory.role, content=ChatHistory.content)
        .limit(limit)
    )


@pxt.query
def search_chat_history(query_text: str, user_id: str):
    sim = ChatHistory.content.similarity(string=query_text)  # type: ignore[attr-defined]
    return (
        ChatHistory.where((ChatHistory.user_id == user_id) & (sim > 0.8))
        .order_by(sim, asc=False)
        .select(role=ChatHistory.role, content=ChatHistory.content, sim=sim)
        .limit(10)
    )


class UserPersonas(TableModel, name="user_personas", has_default_idxs=False):
    user_id = pxt.Column(type=pxt.String, primary_key=True)
    persona_name = pxt.Column(type=pxt.String, primary_key=True)
    initial_prompt: pxt.String
    final_prompt: pxt.String
    llm_params: pxt.Json
    timestamp: pxt.Timestamp
    __indexes__ = [pxt.BtreeIndex(timestamp)]


@pxt.query
def get_all_personas(user_id: str):
    return (
        UserPersonas.where(UserPersonas.user_id == user_id)
        .select(
            persona_name=UserPersonas.persona_name,
            initial_prompt=UserPersonas.initial_prompt,
            final_prompt=UserPersonas.final_prompt,
            llm_params=UserPersonas.llm_params,
            timestamp=UserPersonas.timestamp,
        )
        .order_by(UserPersonas.persona_name, asc=True)
    )


class ImageGenerationTasks(TableModel, name="image_generation_tasks", has_default_idxs=False):
    prompt: pxt.String
    timestamp: pxt.Timestamp
    user_id: pxt.String
    generated_image = gemini.generate_images(prompt=prompt, model=config.IMAGEN_MODEL_ID)
    thumbnail = pxt_image.b64_encode(pxt_image.resize(generated_image, size=(128, 128)))
    __indexes__ = [pxt.BtreeIndex(user_id), pxt.BtreeIndex(timestamp)]


class FluxGenerationTasks(TableModel, name="flux_generation_tasks", has_default_idxs=False):
    prompt: pxt.String
    width: pxt.Int
    height: pxt.Int
    timestamp: pxt.Timestamp
    user_id: pxt.String
    generated_image = bfl.generate(
        prompt=prompt,
        model=config.FLUX_MODEL_ID,
        width=width,
        height=height,
    )
    thumbnail = pxt_image.b64_encode(pxt_image.resize(generated_image, size=(128, 128)))
    __indexes__ = [pxt.BtreeIndex(user_id), pxt.BtreeIndex(timestamp)]


class VideoGenerationTasks(TableModel, name="video_generation_tasks", has_default_idxs=False):
    prompt: pxt.String
    timestamp: pxt.Timestamp
    user_id: pxt.String
    generated_video = gemini.generate_videos(prompt=prompt, model=config.VEO_MODEL_ID)
    __indexes__ = [pxt.BtreeIndex(user_id), pxt.BtreeIndex(timestamp)]


class SpeechTasks(TableModel, name="speech_tasks", has_default_idxs=False):
    input_text: pxt.String
    voice: pxt.String
    timestamp: pxt.Timestamp
    user_id: pxt.String
    audio = openai.speech(input=input_text, model="tts-1", voice=voice)
    __indexes__ = [pxt.BtreeIndex(user_id), pxt.BtreeIndex(timestamp)]


class CsvRegistry(TableModel, name="csv_registry", has_default_idxs=False):
    table_name: pxt.String
    display_name: pxt.String
    uuid = pxt.Column(type=pxt.String, primary_key=True)
    row_count: pxt.Int
    col_names: pxt.Json
    timestamp: pxt.Timestamp
    user_id: pxt.String
    __indexes__ = [pxt.BtreeIndex(user_id), pxt.BtreeIndex(timestamp)]


class PromptExperiments(TableModel, name="prompt_experiments", has_default_idxs=False):
    experiment_id: pxt.String
    task: pxt.String
    system_prompt: pxt.String
    user_prompt: pxt.String
    model_id: pxt.String
    model_name: pxt.String
    provider: pxt.String
    temperature: pxt.Float
    max_tokens: pxt.Int
    response: pxt.String
    response_time_ms: pxt.Float
    word_count: pxt.Int
    char_count: pxt.Int
    error: pxt.String
    timestamp: pxt.Timestamp
    user_id: pxt.String
    __indexes__ = [
        pxt.BtreeIndex(experiment_id),
        pxt.BtreeIndex(user_id),
        pxt.BtreeIndex(timestamp),
    ]


class Notifications(TableModel, name="notifications", has_default_idxs=False):
    service: pxt.String
    destination: pxt.String
    message: pxt.String
    status: pxt.String
    response_code: pxt.Int
    timestamp: pxt.Timestamp
    user_id: pxt.String
    __indexes__ = [pxt.BtreeIndex(user_id), pxt.BtreeIndex(timestamp)]


agentTools = pxt.tools(
    functions.get_latest_news,
    functions.fetch_financial_data,
    functions.search_news,
    functions.send_slack_message,
    functions.send_discord_message,
    functions.send_webhook,
    search_video_transcripts,
    search_audio_transcripts,
)


class ToolAgent(TableModel, name="tools", has_default_idxs=False):
    prompt: pxt.String
    timestamp: pxt.Timestamp
    user_id: pxt.String
    initial_system_prompt: pxt.String
    final_system_prompt: pxt.String
    max_tokens: pxt.Int
    temperature: pxt.Float
    history_context = get_recent_chat_history(user_id)
    tool_selection_messages = functions.build_tool_selection_messages(prompt, history_context)
    initial_response = gemini.generate_content(
        contents=tool_selection_messages,
        model=config.GEMINI_MODEL_ID,
        tools=agentTools,
        config={"system_instruction": initial_system_prompt, "temperature": temperature},
    )
    tool_output = invoke_tools(agentTools, initial_response)
    doc_context = search_documents(prompt, user_id)
    image_context = search_images(prompt, user_id)
    video_frame_context = search_video_frames(prompt, user_id)
    memory_context = search_memory(prompt, user_id)
    chat_memory_context = search_chat_history(prompt, user_id)
    multimodal_context_summary = functions.assemble_multimodal_context(
        prompt,
        tool_output,
        doc_context,
        memory_context,
        chat_memory_context,
    )
    final_prompt_messages = functions.assemble_final_messages(
        history_context,
        multimodal_context_summary,
        image_context=image_context,
        video_frame_context=video_frame_context,
    )
    final_response = gemini.generate_content(
        contents=final_prompt_messages,
        model=config.GEMINI_MODEL_ID,
        config={"system_instruction": final_system_prompt, "temperature": temperature},
    )
    answer = final_response.candidates[0].content.parts[0].text
    follow_up_input_message = functions.assemble_follow_up_prompt(original_prompt=prompt, answer_text=answer)
    follow_up_raw_response = gemini.generate_content(
        contents=follow_up_input_message,
        model=config.GEMINI_MODEL_ID,
        config={
            "system_instruction": "Generate exactly 3 relevant follow-up questions based on the conversation.",
            "response_mime_type": "application/json",
            "response_schema": FollowUpResponse.model_json_schema(),
        },
    )
    follow_up_text = follow_up_raw_response.candidates[0].content.parts[0].text
    __indexes__ = [pxt.BtreeIndex(user_id), pxt.BtreeIndex(timestamp)]
