import base64
import io
import logging
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from PIL import Image
import pixeltable as pxt

import config
from models import AudioRow, ImageGenRow, ImageRow, VideoGenRow, VideoRow
from utils import encode_image_base64, create_thumbnail_base64, pxt_retry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["images"])

THUMB_SIZE = (128, 128)


# ── Provider Info ────────────────────────────────────────────────────────────

@router.get("/generation_config")
def get_generation_config():
    """Return the active image/video generation providers and model IDs."""
    return {
        "image_provider": config.IMAGE_GEN_PROVIDER,
        "image_model": config.IMAGEN_MODEL_ID if config.IMAGE_GEN_PROVIDER == "gemini" else config.DALLE_MODEL_ID,
        "video_provider": config.VIDEO_GEN_PROVIDER,
        "video_model": config.VEO_MODEL_ID,
    }


# ── Generate Image ───────────────────────────────────────────────────────────

class GenerateImageRequest(BaseModel):
    prompt: str


class GenerateImageResponse(BaseModel):
    generated_image_base64: str
    timestamp: str
    prompt: str
    provider: str


@router.post("/generate_image", response_model=GenerateImageResponse)
def generate_image(body: GenerateImageRequest):
    """Generate an image using the configured provider (Gemini Imagen or OpenAI DALL-E).

    Pixeltable's insert() is synchronous - it blocks until all computed columns
    (including the generated_image) finish, so no polling is needed.
    """
    user_id = config.DEFAULT_USER_ID
    current_timestamp = datetime.now()

    try:
        image_gen_table = pxt.get_table("agents.image_generation_tasks")
        image_gen_table.insert([ImageGenRow(prompt=body.prompt, timestamp=current_timestamp, user_id=user_id)])

        result = (
            image_gen_table.where(
                (image_gen_table.timestamp == current_timestamp) & (image_gen_table.user_id == user_id)
            )
            .select(generated_image=image_gen_table.generated_image)
            .collect()
        )

        if len(result) == 0 or result[0].get("generated_image") is None:
            raise HTTPException(status_code=500, detail="Image generation failed")

        img = result[0]["generated_image"]
        if not isinstance(img, Image.Image):
            raise HTTPException(status_code=500, detail=f"Expected PIL Image, got {type(img)}")

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        img_base64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        return GenerateImageResponse(
            generated_image_base64=img_base64,
            timestamp=current_timestamp.isoformat(),
            prompt=body.prompt,
            provider=config.IMAGE_GEN_PROVIDER,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating image: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Image History ────────────────────────────────────────────────────────────

@router.get("/image_history")
@pxt_retry()
def get_image_history():
    """Get history of generated images with provider metadata."""
    user_id = config.DEFAULT_USER_ID

    try:
        image_gen_table = pxt.get_table("agents.image_generation_tasks")

        has_thumbnail_col = hasattr(image_gen_table, "thumbnail")

        select_kwargs: dict = {
            "prompt": image_gen_table.prompt,
            "timestamp": image_gen_table.timestamp,
            "generated_image": image_gen_table.generated_image,
        }
        if has_thumbnail_col:
            select_kwargs["thumbnail"] = image_gen_table.thumbnail

        results = (
            image_gen_table.where(image_gen_table.user_id == user_id)
            .select(**select_kwargs)
            .order_by(image_gen_table.timestamp, asc=False)
            .limit(50)
            .collect()
        )

        image_history = []
        for entry in results:
            img_data = entry.get("generated_image")
            timestamp = entry.get("timestamp")

            if not isinstance(img_data, Image.Image):
                continue

            thumbnail_b64 = entry.get("thumbnail") if has_thumbnail_col else None
            if thumbnail_b64 and isinstance(thumbnail_b64, (str, bytes)):
                if isinstance(thumbnail_b64, bytes):
                    thumbnail_b64 = thumbnail_b64.decode("utf-8")
                if not thumbnail_b64.startswith("data:"):
                    thumbnail_b64 = f"data:image/png;base64,{thumbnail_b64}"
            else:
                thumbnail_b64 = create_thumbnail_base64(img_data, THUMB_SIZE)

            full_image_b64 = encode_image_base64(img_data)

            if thumbnail_b64 and full_image_b64:
                image_history.append({
                    "prompt": entry.get("prompt"),
                    "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S.%f") if timestamp else None,
                    "thumbnail_image": thumbnail_b64,
                    "full_image": full_image_b64,
                    "provider": config.IMAGE_GEN_PROVIDER,
                })

        return image_history

    except Exception as e:
        logger.error(f"Error fetching image history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Delete Generated Image ───────────────────────────────────────────────────

class DeleteResponse(BaseModel):
    message: str
    num_deleted: int


@router.delete("/delete_image/{timestamp_str}", response_model=DeleteResponse)
def delete_generated_image(timestamp_str: str):
    """Delete a generated image by timestamp."""
    user_id = config.DEFAULT_USER_ID

    try:
        target_timestamp = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S.%f")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid timestamp format")

    try:
        image_gen_table = pxt.get_table("agents.image_generation_tasks")
        status = image_gen_table.delete(
            where=(image_gen_table.timestamp == target_timestamp) & (image_gen_table.user_id == user_id)
        )

        if status.num_rows == 0:
            raise HTTPException(status_code=404, detail="No image found with that timestamp")

        return DeleteResponse(message="Image deleted", num_deleted=status.num_rows)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting image: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Generate Video (Gemini Veo) ──────────────────────────────────────────────

class GenerateVideoRequest(BaseModel):
    prompt: str


@router.post("/generate_video")
def generate_video(body: GenerateVideoRequest):
    """Generate a video using Gemini Veo.

    Pixeltable's insert() blocks until the generated_video computed column is ready.
    The result is a Pixeltable Video (file path). We return it as a servable URL.
    """
    user_id = config.DEFAULT_USER_ID
    current_timestamp = datetime.now()

    try:
        video_gen_table = pxt.get_table("agents.video_generation_tasks")
        video_gen_table.insert([VideoGenRow(prompt=body.prompt, timestamp=current_timestamp, user_id=user_id)])

        result = (
            video_gen_table.where(
                (video_gen_table.timestamp == current_timestamp) & (video_gen_table.user_id == user_id)
            )
            .select(generated_video=video_gen_table.generated_video)
            .collect()
        )

        if len(result) == 0 or result[0].get("generated_video") is None:
            raise HTTPException(status_code=500, detail="Video generation failed")

        video = result[0]["generated_video"]

        # Pixeltable Video columns resolve to a file path string
        video_path = str(video) if not isinstance(video, str) else video

        if not os.path.exists(video_path):
            raise HTTPException(status_code=500, detail="Generated video file not found on disk")

        return {
            "timestamp": current_timestamp.isoformat(),
            "prompt": body.prompt,
            "provider": config.VIDEO_GEN_PROVIDER,
            "video_path": video_path,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating video: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Video History ────────────────────────────────────────────────────────────

@router.get("/video_history")
@pxt_retry()
def get_video_history():
    """Get history of generated videos."""
    user_id = config.DEFAULT_USER_ID

    try:
        video_gen_table = pxt.get_table("agents.video_generation_tasks")

        results = (
            video_gen_table.where(video_gen_table.user_id == user_id)
            .select(
                prompt=video_gen_table.prompt,
                timestamp=video_gen_table.timestamp,
                generated_video=video_gen_table.generated_video,
            )
            .order_by(video_gen_table.timestamp, asc=False)
            .limit(50)
            .collect()
        )

        video_history = []
        for entry in results:
            timestamp = entry.get("timestamp")
            video = entry.get("generated_video")

            video_path = str(video) if video is not None else None
            if not video_path or not os.path.exists(video_path):
                continue

            video_history.append({
                "prompt": entry.get("prompt"),
                "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S.%f") if timestamp else None,
                "video_path": video_path,
                "provider": config.VIDEO_GEN_PROVIDER,
            })

        return video_history

    except Exception as e:
        logger.error(f"Error fetching video history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Serve Generated Video File ───────────────────────────────────────────────

@router.get("/serve_video")
def serve_generated_video(path: str):
    """Serve a generated video file by its path."""
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Video file not found")
    return FileResponse(path, media_type="video/mp4", filename=os.path.basename(path))


# ── Delete Generated Video ───────────────────────────────────────────────────

@router.delete("/delete_video/{timestamp_str}", response_model=DeleteResponse)
def delete_generated_video(timestamp_str: str):
    """Delete a generated video by timestamp."""
    user_id = config.DEFAULT_USER_ID

    try:
        target_timestamp = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S.%f")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid timestamp format")

    try:
        video_gen_table = pxt.get_table("agents.video_generation_tasks")
        status = video_gen_table.delete(
            where=(video_gen_table.timestamp == target_timestamp) & (video_gen_table.user_id == user_id)
        )

        if status.num_rows == 0:
            raise HTTPException(status_code=404, detail="No video found with that timestamp")

        return DeleteResponse(message="Video deleted", num_deleted=status.num_rows)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting video: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Save Generated Media to Collection ───────────────────────────────────────

class SaveToCollectionRequest(BaseModel):
    timestamp: str


class SaveToCollectionResponse(BaseModel):
    message: str
    uuid: str


@router.post("/save_generated_image", response_model=SaveToCollectionResponse)
def save_generated_image_to_collection(body: SaveToCollectionRequest):
    """Save a generated image into agents.images so it enters the CLIP embedding + RAG pipeline."""
    user_id = config.DEFAULT_USER_ID

    try:
        target_timestamp = datetime.strptime(body.timestamp, "%Y-%m-%d %H:%M:%S.%f")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid timestamp format")

    try:
        gen_table = pxt.get_table("agents.image_generation_tasks")
        result = (
            gen_table.where(
                (gen_table.timestamp == target_timestamp) & (gen_table.user_id == user_id)
            )
            .select(generated_image=gen_table.generated_image)
            .collect()
        )

        if len(result) == 0 or result[0].get("generated_image") is None:
            raise HTTPException(status_code=404, detail="Generated image not found")

        img = result[0]["generated_image"]
        if not isinstance(img, Image.Image):
            raise HTTPException(status_code=500, detail=f"Expected PIL Image, got {type(img)}")

        os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)
        file_uuid = str(uuid.uuid4())
        file_path = os.path.join(config.UPLOAD_FOLDER, f"{file_uuid}_generated.png")
        img.save(file_path, format="PNG")

        images_table = pxt.get_table("agents.images")
        images_table.insert([ImageRow(
            image=file_path,
            uuid=file_uuid,
            timestamp=datetime.now(),
            user_id=user_id,
        )])

        return SaveToCollectionResponse(
            message="Image saved to collection — CLIP embedding and RAG indexing will run automatically",
            uuid=file_uuid,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving generated image to collection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save_generated_video", response_model=SaveToCollectionResponse)
def save_generated_video_to_collection(body: SaveToCollectionRequest):
    """Save a generated video into agents.videos so it enters keyframe/transcription/RAG pipeline."""
    user_id = config.DEFAULT_USER_ID

    try:
        target_timestamp = datetime.strptime(body.timestamp, "%Y-%m-%d %H:%M:%S.%f")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid timestamp format")

    try:
        gen_table = pxt.get_table("agents.video_generation_tasks")
        result = (
            gen_table.where(
                (gen_table.timestamp == target_timestamp) & (gen_table.user_id == user_id)
            )
            .select(generated_video=gen_table.generated_video)
            .collect()
        )

        if len(result) == 0 or result[0].get("generated_video") is None:
            raise HTTPException(status_code=404, detail="Generated video not found")

        video = result[0]["generated_video"]
        video_path = str(video) if not isinstance(video, str) else video

        if not os.path.exists(video_path):
            raise HTTPException(status_code=500, detail="Generated video file not found on disk")

        file_uuid = str(uuid.uuid4())

        videos_table = pxt.get_table("agents.videos")
        videos_table.insert([VideoRow(
            video=video_path,
            uuid=file_uuid,
            timestamp=datetime.now(),
            user_id=user_id,
        )])

        return SaveToCollectionResponse(
            message="Video saved to collection — keyframe extraction, transcription, and RAG indexing will run automatically",
            uuid=file_uuid,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving generated video to collection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Text-to-Speech (OpenAI TTS) ──────────────────────────────────────────────

TTS_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]


class GenerateSpeechRequest(BaseModel):
    text: str
    voice: str = "alloy"


class GenerateSpeechResponse(BaseModel):
    audio_url: str
    audio_path: str
    timestamp: str
    voice: str


@router.post("/generate_speech", response_model=GenerateSpeechResponse)
@pxt_retry()
def generate_speech(body: GenerateSpeechRequest):
    """Generate speech from text using OpenAI TTS via Pixeltable computed column."""
    user_id = config.DEFAULT_USER_ID
    current_timestamp = datetime.now()

    voice = body.voice if body.voice in TTS_VOICES else "alloy"

    try:
        speech_table = pxt.get_table("agents.speech_tasks")
        speech_table.insert([{
            "input_text": body.text,
            "voice": voice,
            "timestamp": current_timestamp,
            "user_id": user_id,
        }])

        result = (
            speech_table.where(
                (speech_table.timestamp == current_timestamp) & (speech_table.user_id == user_id)
            )
            .select(audio=speech_table.audio)
            .collect()
        )

        if len(result) == 0 or result[0].get("audio") is None:
            raise HTTPException(status_code=500, detail="Speech generation failed")

        audio_path = str(result[0]["audio"])
        if not os.path.exists(audio_path):
            raise HTTPException(status_code=500, detail="Audio file not found on disk")

        return GenerateSpeechResponse(
            audio_url=f"/api/serve_audio?path={audio_path}",
            audio_path=audio_path,
            timestamp=current_timestamp.isoformat(),
            voice=voice,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating speech: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class SaveSpeechRequest(BaseModel):
    audio_path: str


@router.post("/save_generated_speech", response_model=SaveToCollectionResponse)
@pxt_retry()
def save_generated_speech_to_collection(body: SaveSpeechRequest):
    """Save a TTS audio file into agents.audios so it enters the transcription + RAG pipeline."""
    user_id = config.DEFAULT_USER_ID

    if not os.path.exists(body.audio_path):
        raise HTTPException(status_code=404, detail="Audio file not found on disk")

    try:
        file_uuid = str(uuid.uuid4())
        audios_table = pxt.get_table("agents.audios")
        audios_table.insert([AudioRow(
            audio=body.audio_path,
            uuid=file_uuid,
            timestamp=datetime.now(),
            user_id=user_id,
        )])

        return SaveToCollectionResponse(
            message="Audio saved to collection — transcription and RAG indexing will run automatically",
            uuid=file_uuid,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving speech to collection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/serve_audio")
def serve_audio(path: str):
    """Serve a generated audio file by path."""
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(path, media_type="audio/wav", filename=os.path.basename(path))


@router.get("/tts_voices")
def get_tts_voices():
    """Return available TTS voice options."""
    return [
        {"id": "alloy", "label": "Alloy", "style": "Neutral, balanced"},
        {"id": "echo", "label": "Echo", "style": "Warm, conversational"},
        {"id": "fable", "label": "Fable", "style": "Expressive, storytelling"},
        {"id": "onyx", "label": "Onyx", "style": "Deep, authoritative"},
        {"id": "nova", "label": "Nova", "style": "Friendly, upbeat"},
        {"id": "shimmer", "label": "Shimmer", "style": "Clear, professional"},
    ]
