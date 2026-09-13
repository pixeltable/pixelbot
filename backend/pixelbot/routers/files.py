import inspect
import ipaddress
import logging
import os
import re
import socket
import uuid
from datetime import datetime
from urllib.parse import urljoin, urlparse

import pixeltable as pxt
import requests
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel, Field

from pixelbot import config, functions
from pixelbot.models import (
    MEDIA_ROW_MODELS,
    AddUrlResponse,
    CsvRegistryRow,
    UploadResponse,
)
from pixelbot.utils import create_thumbnail_base64, pxt_retry

CSV_TABLE_PREFIX = f"{config.SCRATCH_NAMESPACE}.csv_"


def _secure_filename(filename: str) -> str:
    """Sanitize a filename to prevent directory traversal and special chars."""
    filename = os.path.basename(filename)
    filename = re.sub(r"[^\w\s\-.]", "", filename).strip()
    filename = re.sub(r"\s+", "_", filename)
    return filename or "unnamed"


def _validate_public_http_url(raw_url: str) -> None:
    parsed = urlparse(raw_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="URL must use public HTTP(S)")
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(parsed.hostname, parsed.port)}
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail="URL hostname could not be resolved") from exc
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            raise HTTPException(status_code=400, detail="URL must resolve to a public address")


def _download_public_url(raw_url: str, filename: str) -> tuple[str, str]:
    """Download a public URL with redirect validation and a streaming size cap."""
    os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)
    destination = os.path.join(config.UPLOAD_FOLDER, f"{uuid.uuid4()}_{_secure_filename(filename)}")
    max_bytes = config.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    current_url = raw_url
    session = requests.Session()
    session.trust_env = False

    try:
        for _ in range(6):
            _validate_public_http_url(current_url)
            response = session.get(current_url, stream=True, allow_redirects=False, timeout=(5, 30))
            try:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        raise HTTPException(status_code=400, detail="URL redirect has no destination")
                    current_url = urljoin(current_url, location)
                    continue

                response.raise_for_status()
                content_length = response.headers.get("content-length")
                if content_length is not None and int(content_length) > max_bytes:
                    raise HTTPException(status_code=413, detail=f"URL exceeds {config.MAX_UPLOAD_SIZE_MB} MB")

                bytes_written = 0
                with open(destination, "xb") as output:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        if not chunk:
                            continue
                        bytes_written += len(chunk)
                        if bytes_written > max_bytes:
                            raise HTTPException(status_code=413, detail=f"URL exceeds {config.MAX_UPLOAD_SIZE_MB} MB")
                        output.write(chunk)
                return destination, current_url
            finally:
                response.close()
        raise HTTPException(status_code=400, detail="URL has too many redirects")
    except HTTPException:
        try:
            os.remove(destination)
        except FileNotFoundError:
            pass
        raise
    except (OSError, requests.RequestException, ValueError) as exc:
        try:
            os.remove(destination)
        except FileNotFoundError:
            pass
        raise HTTPException(status_code=400, detail="Unable to download URL") from exc
    finally:
        session.close()


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["files"])

TABLE_MAP = {
    "document": "pixelbot_v3.collection",
    "image": "pixelbot_v3.images",
    "video": "pixelbot_v3.videos",
    "audio": "pixelbot_v3.audios",
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
        # Documents supported by Pixeltable 0.7.7's DocumentType
        "pdf": ("document", "document"),
        "txt": ("document", "document"),
        "md": ("document", "document"),
        "html": ("document", "document"),
        "xml": ("document", "document"),
        "docx": ("document", "document"),
        "pptx": ("document", "document"),
        "xlsx": ("document", "document"),
        # Images
        "jpg": ("image", "image"),
        "jpeg": ("image", "image"),
        "png": ("image", "image"),
        "gif": ("image", "image"),
        "webp": ("image", "image"),
        "heic": ("image", "image"),
        # Video
        "mp4": ("video", "video"),
        "mov": ("video", "video"),
        "avi": ("video", "video"),
        # Audio
        "mp3": ("audio", "audio"),
        "wav": ("audio", "audio"),
        "m4a": ("audio", "audio"),
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


@router.post("/upload", response_model=UploadResponse)
def upload_file(file: UploadFile = File(...)):
    """Handle file uploads. CSVs are imported into their own Pixeltable table."""
    user_id = config.DEFAULT_USER_ID

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    file_ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if file_ext not in config.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, detail=f"File type not allowed. Allowed: {', '.join(config.ALLOWED_EXTENSIONS)}"
        )

    # Save the file to disk first (needed for both regular and CSV flows)
    try:
        os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)
        safe_name = _secure_filename(file.filename)
        file_path = os.path.join(config.UPLOAD_FOLDER, f"{uuid.uuid4()}_{safe_name}")
        max_bytes = config.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        bytes_written = 0
        with open(file_path, "xb") as output:
            while chunk := file.file.read(1024 * 1024):
                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    raise HTTPException(status_code=413, detail=f"Upload exceeds {config.MAX_UPLOAD_SIZE_MB} MB")
                output.write(chunk)
    except HTTPException:
        if "file_path" in locals():
            try:
                os.remove(file_path)
            except FileNotFoundError:
                pass
        raise

    # CSV files get their own Pixeltable table
    if file_ext == "csv":
        return _import_csv(file_path, safe_name, user_id)

    mapping = _determine_table_key(file_ext)
    if mapping is None:
        raise HTTPException(status_code=400, detail=f"Unsupported file extension: {file_ext}")

    table_key, data_col = mapping
    file_uuid = str(uuid.uuid4())
    current_timestamp = datetime.now()

    table = get_pxt_table(table_key)
    RowModel = MEDIA_ROW_MODELS[table_key]
    row = RowModel(**{data_col: file_path, "uuid": file_uuid, "timestamp": current_timestamp, "user_id": user_id})
    status = table.insert([row], return_rows=True)
    if status.errors:
        raise RuntimeError(f"Insert failed: {status.errors}")

    return UploadResponse(
        message=f"File successfully uploaded to {table_key} table",
        filename=safe_name,
        uuid=file_uuid,
    )


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

        pxt.create_dir(config.SCRATCH_NAMESPACE, if_exists="ignore")
        pxt.io.import_pandas(table_path, df)
        logger.info(f"Imported CSV '{display_name}' as table '{table_path}' ({row_count} rows, {len(col_names)} cols)")

        # Register in csv_registry
        registry = pxt.get_table("pixelbot_v3.csv_registry")
        registry.insert(
            [
                CsvRegistryRow(
                    table_name=table_path,
                    display_name=display_name,
                    uuid=file_uuid,
                    row_count=row_count,
                    col_names=col_names,
                    timestamp=datetime.now(),
                    user_id=user_id,
                )
            ]
        )

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
        raise


# ── Add URL ───────────────────────────────────────────────────────────────────


class AddUrlRequest(BaseModel):
    url: str = Field(max_length=2048)


@router.post("/add_url", response_model=AddUrlResponse)
def add_url(body: AddUrlRequest):
    """Add a URL as a data source."""
    user_id = config.DEFAULT_USER_ID

    parsed = urlparse(body.url)

    filename = os.path.basename(parsed.path)
    file_ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    mapping = _determine_table_key(file_ext)
    if mapping is None:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type or cannot determine type from URL extension",
        )

    table_key, data_col = mapping
    file_path, resolved_url = _download_public_url(body.url, filename)
    resolved_filename = os.path.basename(urlparse(resolved_url).path)
    resolved_ext = resolved_filename.rsplit(".", 1)[-1].lower() if "." in resolved_filename else ""
    if _determine_table_key(resolved_ext) != mapping:
        try:
            os.remove(file_path)
        except FileNotFoundError:
            pass
        raise HTTPException(status_code=400, detail="URL redirect changed the file type")

    try:
        file_uuid = str(uuid.uuid4())
        current_timestamp = datetime.now()

        table = get_pxt_table(table_key)
        RowModel = MEDIA_ROW_MODELS[table_key]
        row = RowModel(**{data_col: file_path, "uuid": file_uuid, "timestamp": current_timestamp, "user_id": user_id})
        status = table.insert([row], return_rows=True)
        if status.errors:
            raise RuntimeError(f"Insert failed: {status.errors}")

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
        raise


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
        for row in (
            doc_table.where(doc_table.user_id == user_id)
            .select(doc_source=doc_table.document, uuid_col=doc_table.uuid)
            .collect()
        ):
            document_list.append({"name": _source_to_filename(row["doc_source"]), "uuid": row["uuid_col"]})
    except Exception as e:
        logger.error(f"Error fetching documents: {e}")

    # Images — use precomputed `thumbnail` column from Pixeltable
    image_list: list[dict] = []
    try:
        img_table = get_pxt_table("image")
        for row in (
            img_table.where(img_table.user_id == user_id)
            .select(
                img_source=img_table.image,
                uuid_col=img_table.uuid,
                thumb=img_table.thumbnail,
            )
            .collect()
        ):
            thumbnail = _pxt_thumbnail_to_data_uri(row.get("thumb"))
            image_list.append(
                {
                    "name": _source_to_filename(row["img_source"]),
                    "thumbnail": thumbnail,
                    "uuid": row["uuid_col"],
                }
            )
    except Exception as e:
        logger.error(f"Error fetching images: {e}")

    # Videos (with thumbnails from first frame)
    video_list: list[dict] = []
    try:
        vid_table = get_pxt_table("video")
        video_frames_view = pxt.get_table("pixelbot_v3.video_frames")

        # Build a map of uuid → first-frame thumbnail
        first_frames_map: dict[str, str | None] = {}
        try:
            for row in (
                video_frames_view.where(video_frames_view.pos == 0)
                .select(
                    video_uuid=video_frames_view.uuid,
                    frame=video_frames_view.frame,
                )
                .collect()
            ):
                frame = row.get("frame")
                if isinstance(frame, Image.Image):
                    first_frames_map[row["video_uuid"]] = create_thumbnail_base64(frame, THUMB_SIZE_SIDEBAR)
        except Exception as e:
            logger.error(f"Error fetching video first frames: {e}")

        for row in (
            vid_table.where(vid_table.user_id == user_id)
            .select(
                video_col=vid_table.video,
                uuid_col=vid_table.uuid,
            )
            .collect()
        ):
            video_list.append(
                {
                    "name": _source_to_filename(row["video_col"]),
                    "thumbnail": first_frames_map.get(row["uuid_col"]),
                    "uuid": row["uuid_col"],
                }
            )
    except Exception as e:
        logger.error(f"Error fetching videos: {e}")

    # Audios
    audio_list: list[dict] = []
    try:
        audio_table = get_pxt_table("audio")
        for row in (
            audio_table.where(audio_table.user_id == user_id)
            .select(
                audio_col=audio_table.audio,
                uuid_col=audio_table.uuid,
            )
            .collect()
        ):
            audio_list.append({"name": _source_to_filename(row["audio_col"]), "uuid": row["uuid_col"]})
    except Exception as e:
        logger.error(f"Error fetching audios: {e}")

    # CSV tables (from registry)
    csv_tables: list[dict] = []
    try:
        csv_registry = pxt.get_table("pixelbot_v3.csv_registry")
        for row in (
            csv_registry.where(csv_registry.user_id == user_id)
            .select(
                csv_registry.display_name,
                csv_registry.uuid,
                csv_registry.row_count,
                csv_registry.col_names,
            )
            .collect()
        ):
            csv_tables.append(
                {
                    "name": row["display_name"],
                    "uuid": row["uuid"],
                    "row_count": row["row_count"],
                    "columns": row["col_names"],
                }
            )
    except Exception as e:
        logger.error(f"Error fetching CSV tables: {e}")

    # Workflow history — direct iteration, no pandas
    workflow_data: list[dict] = []
    try:
        wf_table = pxt.get_table("pixelbot_v3.tools")
        for row in (
            wf_table.where(wf_table.user_id == user_id)
            .select(
                wf_table.timestamp,
                wf_table.prompt,
                wf_table.answer,
            )
            .order_by(wf_table.timestamp, asc=False)
            .collect()
        ):
            ts = row.get("timestamp")
            workflow_data.append(
                {
                    "timestamp": ts.strftime("%Y-%m-%d %H:%M:%S.%f") if ts else None,
                    "prompt": row.get("prompt"),
                    "answer": row.get("answer"),
                }
            )
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
