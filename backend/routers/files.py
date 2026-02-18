import inspect
import logging
import os
import re
import uuid
from datetime import datetime
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from PIL import Image
import pixeltable as pxt

from utils import pxt_retry

import config
import functions
from models import MEDIA_ROW_MODELS
from utils import create_thumbnail_base64

CSV_TABLE_PREFIX = "agents.csv_"


def _secure_filename(filename: str) -> str:
    """Sanitize a filename to prevent directory traversal and special chars."""
    filename = os.path.basename(filename)
    filename = re.sub(r"[^\w\s\-.]", "", filename).strip()
    filename = re.sub(r"\s+", "_", filename)
    return filename or "unnamed"

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["files"])

TABLE_MAP = {
    "document": "agents.collection",
    "image": "agents.images",
    "video": "agents.videos",
    "audio": "agents.audios",
}

THUMB_SIZE_SIDEBAR = (96, 96)


def get_pxt_table(table_key: str):
    table_name = TABLE_MAP.get(table_key)
    if not table_name:
        raise ValueError(f"Invalid table key: {table_key}")
    return pxt.get_table(table_name)


def _determine_table_key(file_ext: str) -> tuple[str, str] | None:
    """Return (table_key, data_col) based on file extension, or None."""
    ext_map: dict[str, tuple[str, str]] = {
        # Documents (native + Office via MarkdownIT)
        "pdf": ("document", "document"), "txt": ("document", "document"),
        "md": ("document", "document"), "html": ("document", "document"),
        "xml": ("document", "document"),
        "doc": ("document", "document"), "docx": ("document", "document"),
        "ppt": ("document", "document"), "pptx": ("document", "document"),
        "xls": ("document", "document"), "xlsx": ("document", "document"),
        "rtf": ("document", "document"),
        # Images
        "jpg": ("image", "image"), "jpeg": ("image", "image"), "png": ("image", "image"),
        "gif": ("image", "image"), "webp": ("image", "image"), "heic": ("image", "image"),
        # Video
        "mp4": ("video", "video"), "mov": ("video", "video"), "avi": ("video", "video"),
        # Audio
        "mp3": ("audio", "audio"), "wav": ("audio", "audio"), "m4a": ("audio", "audio"),
    }
    return ext_map.get(file_ext)


_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.IGNORECASE,
)

_HEX_HASH_RE = re.compile(r"^[0-9a-f]{20,64}$", re.IGNORECASE)


def _clean_basename(raw: str) -> str:
    """Strip UUID/hash prefixes and Pixeltable internal path noise from a filename.

    Handles patterns like:
      - ``<uuid>_original.png``  → ``original.png``
      - ``<sha1hash>.mov``       → short hash ``.mov``
      - ``<uuid>``               → short hash (last resort)
    """
    name = os.path.basename(raw)
    if not name:
        return "Untitled"

    base, ext = os.path.splitext(name)

    # Entire basename is a hex hash (SHA1, SHA256, etc.) — show short version
    if _HEX_HASH_RE.match(base):
        short = base[:8]
        return f"{short}…{ext}" if ext else f"{short}…"

    # Entire basename is a UUID (possibly with extension) — show short hash
    if _UUID_RE.match(base) and not _UUID_RE.sub("", base).lstrip("_-"):
        short = base[:8]
        return f"{short}…{ext}" if ext else f"{short}…"

    # Strip a leading UUID prefix followed by an underscore or dash
    stripped = _UUID_RE.sub("", name)
    if stripped.startswith(("_", "-")):
        stripped = stripped[1:]
    if stripped and stripped != ext:
        return stripped

    return name or "Untitled"


def _source_to_filename(source) -> str:
    """Extract a human-readable filename from various source types."""
    if isinstance(source, str):
        if source.startswith("http"):
            parsed = urlparse(source).path
            return _clean_basename(parsed) if parsed else "Web Resource"
        return _clean_basename(source)
    if hasattr(source, "filename") and isinstance(getattr(source, "filename", None), str):
        return _clean_basename(source.filename)
    if hasattr(source, "fileurl") and isinstance(getattr(source, "fileurl", None), str):
        if source.fileurl.startswith("http"):
            return _clean_basename(urlparse(source.fileurl).path) or "Web Resource"
        return _clean_basename(source.fileurl)
    return "Untitled"


# ── Upload ────────────────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    message: str
    filename: str
    uuid: str


@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    """Handle file uploads. CSVs are imported into their own Pixeltable table."""
    user_id = config.DEFAULT_USER_ID

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    file_ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if file_ext not in config.ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Allowed: {', '.join(config.ALLOWED_EXTENSIONS)}")

    # Save the file to disk first (needed for both regular and CSV flows)
    try:
        os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)
        safe_name = _secure_filename(file.filename)
        file_path = os.path.join(config.UPLOAD_FOLDER, safe_name)

        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        logger.error(f"Error saving file to disk: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    # CSV files get their own Pixeltable table
    if file_ext == "csv":
        return _import_csv(file_path, safe_name, user_id)

    mapping = _determine_table_key(file_ext)
    if mapping is None:
        raise HTTPException(status_code=400, detail=f"Unsupported file extension: {file_ext}")

    table_key, data_col = mapping

    try:
        file_uuid = str(uuid.uuid4())
        current_timestamp = datetime.now()

        table = get_pxt_table(table_key)
        RowModel = MEDIA_ROW_MODELS[table_key]
        row = RowModel(**{data_col: file_path, "uuid": file_uuid, "timestamp": current_timestamp, "user_id": user_id})
        table.insert([row])

        return UploadResponse(
            message=f"File successfully uploaded to {table_key} table",
            filename=safe_name,
            uuid=file_uuid,
        )

    except Exception as e:
        logger.error(f"Error uploading file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _import_csv(file_path: str, display_name: str, user_id: str) -> UploadResponse:
    """Import a CSV into its own Pixeltable table and register it."""
    import pandas as pd

    file_uuid = str(uuid.uuid4())
    short_id = file_uuid[:8]
    base_name = re.sub(r"[^a-z0-9]", "_", os.path.splitext(display_name)[0].lower()).strip("_")
    if not base_name:
        base_name = "data"
    table_path = f"{CSV_TABLE_PREFIX}{base_name}_{short_id}"

    try:
        df = pd.read_csv(file_path)
        row_count = len(df)
        col_names = list(df.columns)

        pxt.io.import_pandas(table_path, df)
        logger.info(f"Imported CSV '{display_name}' as table '{table_path}' ({row_count} rows, {len(col_names)} cols)")

        # Register in csv_registry
        registry = pxt.get_table("agents.csv_registry")
        registry.insert([{
            "table_name": table_path,
            "display_name": display_name,
            "uuid": file_uuid,
            "row_count": row_count,
            "col_names": col_names,
            "timestamp": datetime.now(),
            "user_id": user_id,
        }])

        return UploadResponse(
            message=f"CSV imported as table with {row_count} rows and {len(col_names)} columns",
            filename=display_name,
            uuid=file_uuid,
        )

    except Exception as e:
        # Clean up the partially-created table on failure
        try:
            pxt.drop_table(table_path, force=True)
        except Exception:
            pass
        logger.error(f"Error importing CSV: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Add URL ───────────────────────────────────────────────────────────────────

class AddUrlRequest(BaseModel):
    url: str


class AddUrlResponse(BaseModel):
    message: str
    url: str
    filename: str
    uuid: str


@router.post("/add_url", response_model=AddUrlResponse)
@pxt_retry()
def add_url(body: AddUrlRequest):
    """Add a URL as a data source."""
    user_id = config.DEFAULT_USER_ID

    parsed = urlparse(body.url)
    if not all([parsed.scheme, parsed.netloc]):
        raise HTTPException(status_code=400, detail="Invalid URL format")

    filename = os.path.basename(parsed.path)
    file_ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    mapping = _determine_table_key(file_ext)
    if mapping is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type or cannot determine type from URL extension",
        )

    table_key, data_col = mapping

    try:
        file_uuid = str(uuid.uuid4())
        current_timestamp = datetime.now()

        table = get_pxt_table(table_key)
        RowModel = MEDIA_ROW_MODELS[table_key]
        row = RowModel(**{data_col: body.url, "uuid": file_uuid, "timestamp": current_timestamp, "user_id": user_id})
        table.insert([row])

        return AddUrlResponse(
            message=f"URL successfully added to {table_key} table",
            url=body.url,
            filename=filename or body.url,
            uuid=file_uuid,
        )

    except ValueError as e:
        err_msg = str(e)
        if "exceeds maximum" in err_msg or "[E088]" in err_msg:
            logger.warning(f"Document too large for processing: {err_msg[:200]}")
            raise HTTPException(
                status_code=400,
                detail="Document is too large to process (exceeds 1M characters). Try a shorter document or a direct file upload.",
            )
        logger.error(f"Error adding URL: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error adding URL: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Delete File ───────────────────────────────────────────────────────────────

class DeleteFileResponse(BaseModel):
    message: str
    db_deleted: bool
    file_deleted: bool
    uuid: str


@router.delete("/delete_file/{file_uuid}/{file_type}", response_model=DeleteFileResponse)
@pxt_retry()
def delete_file(file_uuid: str, file_type: str):
    """Delete a file by UUID and type."""
    user_id = config.DEFAULT_USER_ID

    if file_type not in TABLE_MAP:
        raise HTTPException(status_code=400, detail=f"Invalid file type: {file_type}")

    try:
        table = get_pxt_table(file_type)
        data_col_map = {"document": "document", "image": "image", "video": "video", "audio": "audio"}
        data_col = data_col_map.get(file_type)
        if not data_col:
            raise HTTPException(status_code=400, detail=f"Cannot map file_type '{file_type}'")

        # Retrieve file path before deletion
        file_path_to_delete = None
        try:
            record = (
                table.where((table.uuid == file_uuid) & (table.user_id == user_id))
                .select(file_source=getattr(table, data_col))
                .collect()
            )
            if len(record) > 0:
                file_source = record[0].get("file_source")
                if isinstance(file_source, str) and not file_source.startswith(("http://", "https://")):
                    possible = os.path.abspath(os.path.join(config.UPLOAD_FOLDER, os.path.basename(file_source)))
                    if os.path.exists(possible):
                        file_path_to_delete = possible
        except Exception as e:
            logger.error(f"Error retrieving file path: {e}")

        # Delete from DB
        status = table.delete(where=(table.uuid == file_uuid) & (table.user_id == user_id))
        db_deleted = status.num_rows > 0

        file_deleted = False
        if db_deleted and file_path_to_delete:
            try:
                os.remove(file_path_to_delete)
                file_deleted = True
            except Exception as e:
                logger.error(f"Error deleting file from disk: {e}")

        if not db_deleted:
            raise HTTPException(status_code=404, detail=f"No {file_type} found with UUID {file_uuid}")

        return DeleteFileResponse(
            message=f"{file_type.capitalize()} deleted successfully",
            db_deleted=db_deleted,
            file_deleted=file_deleted,
            uuid=file_uuid,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Delete All ────────────────────────────────────────────────────────────────

class DeleteAllRequest(BaseModel):
    type: str


class DeleteAllResponse(BaseModel):
    message: str
    should_refresh: bool = True


@router.post("/delete_all", response_model=DeleteAllResponse)
@pxt_retry()
def delete_all(body: DeleteAllRequest):
    """Delete all items from a given table type."""
    user_id = config.DEFAULT_USER_ID

    if body.type not in TABLE_MAP:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {', '.join(TABLE_MAP.keys())}")

    try:
        table = get_pxt_table(body.type)
        status = table.delete(where=table.user_id == user_id)
        return DeleteAllResponse(message=f"Deleted {status.num_rows} {body.type} items")
    except Exception as e:
        logger.error(f"Error deleting all {body.type}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Context Info ──────────────────────────────────────────────────────────────

def _pxt_thumbnail_to_data_uri(raw: str | bytes | None) -> str | None:
    """Convert a Pixeltable b64_encode result to a browser-ready data URI."""
    if raw is None:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    if not isinstance(raw, str) or not raw:
        return None
    return raw if raw.startswith("data:") else f"data:image/png;base64,{raw}"


@router.get("/context_info")
@pxt_retry()
def get_context_info():
    """Get application context: files, tools, prompts, workflow history.

    Uses Pixeltable's precomputed `thumbnail` columns for images and
    direct ResultSet iteration (no pandas conversion).
    """
    user_id = config.DEFAULT_USER_ID

    try:
        # Available tools
        available_tools = [
            {"name": "get_latest_news", "description": inspect.getdoc(functions.get_latest_news)},
            {"name": "fetch_financial_data", "description": inspect.getdoc(functions.fetch_financial_data)},
            {"name": "search_news", "description": inspect.getdoc(functions.search_news)},
        ]

        # Documents — direct iteration over ResultSet
        document_list: list[dict] = []
        try:
            doc_table = get_pxt_table("document")
            for row in doc_table.where(doc_table.user_id == user_id).select(
                doc_source=doc_table.document, uuid_col=doc_table.uuid
            ).collect():
                document_list.append({"name": _source_to_filename(row["doc_source"]), "uuid": row["uuid_col"]})
        except Exception as e:
            logger.error(f"Error fetching documents: {e}")

        # Images — use precomputed `thumbnail` column from Pixeltable
        image_list: list[dict] = []
        try:
            img_table = get_pxt_table("image")
            for row in img_table.where(img_table.user_id == user_id).select(
                img_source=img_table.image, uuid_col=img_table.uuid, thumb=img_table.thumbnail,
            ).collect():
                thumbnail = _pxt_thumbnail_to_data_uri(row.get("thumb"))
                image_list.append({
                    "name": _source_to_filename(row["img_source"]),
                    "thumbnail": thumbnail,
                    "uuid": row["uuid_col"],
                })
        except Exception as e:
            logger.error(f"Error fetching images: {e}")

        # Videos (with thumbnails from first frame)
        video_list: list[dict] = []
        try:
            vid_table = get_pxt_table("video")
            video_frames_view = pxt.get_table("agents.video_frames")

            # Build a map of uuid → first-frame thumbnail
            first_frames_map: dict[str, str | None] = {}
            try:
                for row in video_frames_view.where(video_frames_view.pos == 0).select(
                    video_uuid=video_frames_view.uuid, frame=video_frames_view.frame,
                ).collect():
                    frame = row.get("frame")
                    if isinstance(frame, Image.Image):
                        first_frames_map[row["video_uuid"]] = create_thumbnail_base64(frame, THUMB_SIZE_SIDEBAR)
            except Exception as e:
                logger.error(f"Error fetching video first frames: {e}")

            for row in vid_table.where(vid_table.user_id == user_id).select(
                video_col=vid_table.video, uuid_col=vid_table.uuid,
            ).collect():
                video_list.append({
                    "name": _source_to_filename(row["video_col"]),
                    "thumbnail": first_frames_map.get(row["uuid_col"]),
                    "uuid": row["uuid_col"],
                })
        except Exception as e:
            logger.error(f"Error fetching videos: {e}")

        # Audios
        audio_list: list[dict] = []
        try:
            audio_table = get_pxt_table("audio")
            for row in audio_table.where(audio_table.user_id == user_id).select(
                audio_col=audio_table.audio, uuid_col=audio_table.uuid,
            ).collect():
                audio_list.append({"name": _source_to_filename(row["audio_col"]), "uuid": row["uuid_col"]})
        except Exception as e:
            logger.error(f"Error fetching audios: {e}")

        # CSV tables (from registry)
        csv_tables: list[dict] = []
        try:
            csv_registry = pxt.get_table("agents.csv_registry")
            for row in csv_registry.where(csv_registry.user_id == user_id).select(
                csv_registry.display_name, csv_registry.uuid,
                csv_registry.row_count, csv_registry.col_names,
            ).collect():
                csv_tables.append({
                    "name": row["display_name"],
                    "uuid": row["uuid"],
                    "row_count": row["row_count"],
                    "columns": row["col_names"],
                })
        except Exception as e:
            logger.error(f"Error fetching CSV tables: {e}")

        # Workflow history — direct iteration, no pandas
        workflow_data: list[dict] = []
        try:
            wf_table = pxt.get_table("agents.tools")
            for row in wf_table.where(wf_table.user_id == user_id).select(
                wf_table.timestamp, wf_table.prompt, wf_table.answer,
            ).order_by(wf_table.timestamp, asc=False).collect():
                ts = row.get("timestamp")
                workflow_data.append({
                    "timestamp": ts.strftime("%Y-%m-%d %H:%M:%S.%f") if ts else None,
                    "prompt": row.get("prompt"),
                    "answer": row.get("answer"),
                })
        except Exception as e:
            logger.error(f"Error fetching workflow data: {e}")

        return {
            "tools": available_tools,
            "documents": document_list,
            "images": image_list,
            "videos": video_list,
            "audios": audio_list,
            "csv_tables": csv_tables,
            "initial_prompt": config.INITIAL_SYSTEM_PROMPT,
            "final_prompt": config.FINAL_SYSTEM_PROMPT,
            "workflow_data": workflow_data,
            "parameters": {
                "max_tokens": config.DEFAULT_MAX_TOKENS,
                "temperature": config.DEFAULT_TEMPERATURE,
            },
        }

    except Exception as e:
        logger.error(f"Error fetching context info: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
