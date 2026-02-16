import base64
import io
import logging
import os
import re
import uuid as uuid_mod
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image, ImageFilter, ImageEnhance, ImageOps
from pydantic import BaseModel
from umap import UMAP
import pixeltable as pxt
from pixeltable.functions.huggingface import sentence_transformer, clip
from pixeltable.functions import image as pxt_image
from pixeltable.functions import video as pxt_video

import config
from models import ImageRow, VideoRow
from utils import encode_image_base64, create_thumbnail_base64

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/studio", tags=["studio"])

PREVIEW_SIZE = (512, 512)
THUMB_SIZE = (128, 128)

TABLE_MAP = {
    "document": "agents.collection",
    "image": "agents.images",
    "video": "agents.videos",
    "audio": "agents.audios",
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_pxt_table(table_key: str):
    table_name = TABLE_MAP.get(table_key)
    if not table_name:
        raise ValueError(f"Invalid table key: {table_key}")
    return pxt.get_table(table_name)


_UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE
)
_HEX_HASH_RE = re.compile(r"^[0-9a-f]{20,64}$", re.IGNORECASE)


def _clean_basename(raw: str) -> str:
    """Strip UUID/hash prefixes from a filename for clean display.

    Mirrors the logic in ``files.py`` so Studio shows the same names as the sidebar.
    """
    name = os.path.basename(raw)
    if not name:
        return "Untitled"

    base, ext = os.path.splitext(name)

    # Entire basename is a hex hash — show a short version
    if _HEX_HASH_RE.match(base):
        return f"{base[:8]}…{ext}" if ext else f"{base[:8]}…"

    # Entire basename is a UUID — show a short version
    if _UUID_RE.match(base) and not _UUID_RE.sub("", base).lstrip("_-"):
        return f"{base[:8]}…{ext}" if ext else f"{base[:8]}…"

    # Strip a leading UUID prefix followed by _ or -
    stripped = _UUID_RE.sub("", name)
    if stripped.startswith(("_", "-")):
        stripped = stripped[1:]
    if stripped and stripped != ext:
        return stripped

    return name or "Untitled"


def _source_to_filename(source) -> str:
    """Extract a human-readable filename from various Pixeltable source types."""
    if isinstance(source, str):
        if source.startswith("http"):
            return _clean_basename(urlparse(source).path) or "Web Resource"
        return _clean_basename(source)
    if hasattr(source, "filename") and isinstance(getattr(source, "filename", None), str):
        return _clean_basename(source.filename)
    if hasattr(source, "fileurl") and isinstance(getattr(source, "fileurl", None), str):
        if source.fileurl.startswith("http"):
            return _clean_basename(urlparse(source.fileurl).path) or "Web Resource"
        return _clean_basename(source.fileurl)
    return "Unknown"


def _pil_image_to_data_uri(img: Image.Image, max_size: tuple[int, int] | None = None) -> str:
    """Convert a PIL Image to a data-URI PNG string, optionally constraining size."""
    if max_size:
        img = img.copy()
        img.thumbnail(max_size, Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


# ── Operations Catalog ───────────────────────────────────────────────────────

OPERATIONS_CATALOG = {
    "image": [
        {"id": "resize", "label": "Resize", "description": "Resize image to specific dimensions", "category": "transform",
         "params": [{"name": "width", "type": "number", "default": 256, "min": 16, "max": 4096}, {"name": "height", "type": "number", "default": 256, "min": 16, "max": 4096}]},
        {"id": "rotate", "label": "Rotate", "description": "Rotate image by degrees", "category": "transform",
         "params": [{"name": "angle", "type": "number", "default": 90, "min": -360, "max": 360}]},
        {"id": "flip_horizontal", "label": "Flip Horizontal", "description": "Mirror image horizontally", "category": "transform", "params": []},
        {"id": "flip_vertical", "label": "Flip Vertical", "description": "Mirror image vertically", "category": "transform", "params": []},
        {"id": "grayscale", "label": "Grayscale", "description": "Convert to grayscale", "category": "filter", "params": []},
        {"id": "blur", "label": "Blur", "description": "Apply Gaussian blur", "category": "filter",
         "params": [{"name": "radius", "type": "number", "default": 2, "min": 1, "max": 20}]},
        {"id": "sharpen", "label": "Sharpen", "description": "Enhance sharpness", "category": "filter", "params": []},
        {"id": "edge_detect", "label": "Edge Detect", "description": "Detect edges in the image", "category": "filter", "params": []},
        {"id": "emboss", "label": "Emboss", "description": "Apply emboss effect", "category": "filter", "params": []},
        {"id": "brightness", "label": "Brightness", "description": "Adjust brightness level", "category": "adjust",
         "params": [{"name": "factor", "type": "number", "default": 1.5, "min": 0.1, "max": 3.0, "step": 0.1}]},
        {"id": "contrast", "label": "Contrast", "description": "Adjust contrast level", "category": "adjust",
         "params": [{"name": "factor", "type": "number", "default": 1.5, "min": 0.1, "max": 3.0, "step": 0.1}]},
        {"id": "saturation", "label": "Saturation", "description": "Adjust color saturation", "category": "adjust",
         "params": [{"name": "factor", "type": "number", "default": 1.5, "min": 0.0, "max": 3.0, "step": 0.1}]},
        {"id": "auto_contrast", "label": "Auto Contrast", "description": "Automatically adjust contrast", "category": "adjust", "params": []},
        {"id": "equalize", "label": "Equalize", "description": "Equalize image histogram", "category": "adjust", "params": []},
        {"id": "invert", "label": "Invert", "description": "Invert image colors", "category": "filter", "params": []},
    ],
    "document": [
        {"id": "view_chunks", "label": "View Chunks", "description": "See extracted text chunks from the document", "category": "analyze", "params": []},
    ],
    "audio": [
        {"id": "view_transcription", "label": "View Transcription", "description": "See audio transcription", "category": "analyze", "params": []},
    ],
    "video": [
        {"id": "view_metadata", "label": "Metadata", "description": "Show resolution, duration, fps, codec info", "category": "analyze", "params": []},
        {"id": "view_frames", "label": "View Keyframes", "description": "See extracted video keyframes", "category": "analyze",
         "params": [{"name": "limit", "type": "number", "default": 12, "min": 1, "max": 50}]},
        {"id": "view_transcription", "label": "View Transcription", "description": "See video audio transcription", "category": "analyze", "params": []},
        {"id": "detect_scenes", "label": "Detect Scenes", "description": "Find scene cuts with timestamps", "category": "analyze",
         "params": [{"name": "threshold", "type": "number", "default": 27.0, "min": 5.0, "max": 80.0, "step": 1.0}]},
        {"id": "extract_frame", "label": "Extract Frame", "description": "Extract a single frame at a timestamp", "category": "transform",
         "params": [{"name": "timestamp", "type": "number", "default": 0.0, "min": 0.0, "max": 9999, "step": 0.1}]},
        {"id": "clip_video", "label": "Clip Video", "description": "Extract a portion of the video", "category": "transform",
         "params": [{"name": "start", "type": "number", "default": 0.0, "min": 0.0, "max": 9999, "step": 0.1},
                    {"name": "duration", "type": "number", "default": 10.0, "min": 0.5, "max": 9999, "step": 0.5}]},
        {"id": "overlay_text", "label": "Overlay Text", "description": "Add text overlay to the video", "category": "transform",
         "params": [{"name": "text", "type": "string", "default": "Hello World"},
                    {"name": "font_size", "type": "number", "default": 32, "min": 8, "max": 128},
                    {"name": "position", "type": "string", "default": "bottom"}]},
    ],
}


@router.get("/operations")
def get_operations():
    """Return the catalog of available operations per file type."""
    return OPERATIONS_CATALOG


# ── File Listing ─────────────────────────────────────────────────────────────

@router.get("/files")
def get_studio_files():
    """Get all uploaded files with preview thumbnails for the studio."""
    user_id = config.DEFAULT_USER_ID
    result: dict[str, list[dict]] = {"documents": [], "images": [], "videos": [], "audios": []}

    # Documents (with auto-generated summaries)
    try:
        doc_table = _get_pxt_table("document")
        select_cols = dict(
            doc_source=doc_table.document,
            uuid_col=doc_table.uuid,
            ts=doc_table.timestamp,
        )
        if hasattr(doc_table, "summary"):
            select_cols["summary_json"] = doc_table.summary
        for row in doc_table.where(doc_table.user_id == user_id).select(
            **select_cols,
        ).order_by(doc_table.timestamp, asc=False).collect():
            doc_entry: dict = {
                "uuid": row["uuid_col"],
                "name": _source_to_filename(row["doc_source"]),
                "type": "document",
                "timestamp": row["ts"].strftime("%Y-%m-%d %H:%M") if row.get("ts") else None,
            }
            raw_summary = row.get("summary_json")
            if raw_summary:
                doc_entry["summary"] = _parse_summary(raw_summary)
            result["documents"].append(doc_entry)
    except Exception as e:
        logger.error(f"Studio: error fetching documents: {e}")

    # Images (with thumbnail previews)
    try:
        img_table = _get_pxt_table("image")
        from pixeltable.functions import image as pxt_image

        for row in img_table.where(img_table.user_id == user_id).select(
            img_source=img_table.image, uuid_col=img_table.uuid, ts=img_table.timestamp,
            thumb=img_table.thumbnail,
        ).order_by(img_table.timestamp, asc=False).collect():
            thumbnail = None
            raw_thumb = row.get("thumb")
            if raw_thumb:
                if isinstance(raw_thumb, bytes):
                    raw_thumb = raw_thumb.decode("utf-8")
                if isinstance(raw_thumb, str) and raw_thumb:
                    thumbnail = raw_thumb if raw_thumb.startswith("data:") else f"data:image/png;base64,{raw_thumb}"

            result["images"].append({
                "uuid": row["uuid_col"],
                "name": _source_to_filename(row["img_source"]),
                "type": "image",
                "thumbnail": thumbnail,
                "timestamp": row["ts"].strftime("%Y-%m-%d %H:%M") if row.get("ts") else None,
            })
    except Exception as e:
        logger.error(f"Studio: error fetching images: {e}")

    # Videos
    try:
        vid_table = _get_pxt_table("video")
        video_frames_view = pxt.get_table("agents.video_frames")

        first_frames_map: dict[str, str | None] = {}
        try:
            for row in video_frames_view.where(video_frames_view.frame_idx == 0).select(
                video_uuid=video_frames_view.uuid, frame=video_frames_view.frame,
            ).collect():
                frame = row.get("frame")
                if isinstance(frame, Image.Image):
                    first_frames_map[row["video_uuid"]] = create_thumbnail_base64(frame, THUMB_SIZE)
        except Exception as e:
            logger.error(f"Studio: error fetching video first frames: {e}")

        for row in vid_table.where(vid_table.user_id == user_id).select(
            video_col=vid_table.video, uuid_col=vid_table.uuid, ts=vid_table.timestamp,
        ).order_by(vid_table.timestamp, asc=False).collect():
            result["videos"].append({
                "uuid": row["uuid_col"],
                "name": _source_to_filename(row["video_col"]),
                "type": "video",
                "thumbnail": first_frames_map.get(row["uuid_col"]),
                "timestamp": row["ts"].strftime("%Y-%m-%d %H:%M") if row.get("ts") else None,
            })
    except Exception as e:
        logger.error(f"Studio: error fetching videos: {e}")

    # Audios
    try:
        audio_table = _get_pxt_table("audio")
        for row in audio_table.where(audio_table.user_id == user_id).select(
            audio_col=audio_table.audio, uuid_col=audio_table.uuid, ts=audio_table.timestamp,
        ).order_by(audio_table.timestamp, asc=False).collect():
            result["audios"].append({
                "uuid": row["uuid_col"],
                "name": _source_to_filename(row["audio_col"]),
                "type": "audio",
                "timestamp": row["ts"].strftime("%Y-%m-%d %H:%M") if row.get("ts") else None,
            })
    except Exception as e:
        logger.error(f"Studio: error fetching audios: {e}")

    # CSV tables
    try:
        csv_tables = _get_csv_tables(user_id)
        result["csv_tables"] = csv_tables
    except Exception as e:
        logger.error(f"Studio: error fetching CSV tables: {e}")
        result["csv_tables"] = []

    return result


# ── CSV Table Browsing ────────────────────────────────────────────────────────

def _get_csv_tables(user_id: str) -> list[dict]:
    """Fetch the list of imported CSV tables from the registry."""
    try:
        registry = pxt.get_table("agents.csv_registry")
        tables: list[dict] = []
        for row in registry.where(registry.user_id == user_id).select(
            registry.table_name, registry.display_name, registry.uuid,
            registry.row_count, registry.col_names, registry.timestamp,
        ).order_by(registry.timestamp, asc=False).collect():
            tables.append({
                "uuid": row["uuid"],
                "name": row["display_name"],
                "table_name": row["table_name"],
                "type": "csv",
                "row_count": row["row_count"],
                "columns": row["col_names"],
                "timestamp": row["timestamp"].strftime("%Y-%m-%d %H:%M") if row.get("timestamp") else None,
            })
        return tables
    except Exception as e:
        logger.error(f"Error fetching CSV registry: {e}")
        return []


class CsvRowsRequest(BaseModel):
    table_name: str
    offset: int = 0
    limit: int = 50


@router.post("/csv/rows")
def get_csv_rows(body: CsvRowsRequest):
    """Return paginated rows from a CSV table."""
    user_id = config.DEFAULT_USER_ID

    if not body.table_name.startswith("agents.csv_"):
        raise HTTPException(status_code=400, detail="Invalid CSV table name")

    try:
        # Verify the table belongs to this user via the registry
        registry = pxt.get_table("agents.csv_registry")
        check = registry.where(
            (registry.table_name == body.table_name) & (registry.user_id == user_id)
        ).select(registry.col_names, registry.row_count).collect()
        if not check:
            raise HTTPException(status_code=404, detail="CSV table not found")

        col_names = check[0]["col_names"]
        total_rows = check[0]["row_count"]

        # Fetch rows from the actual CSV table
        tbl = pxt.get_table(body.table_name)
        rows_data: list[dict] = []
        all_rows = list(tbl.select().limit(body.limit + body.offset).collect())

        for row in all_rows[body.offset:]:
            row_dict: dict = {}
            for col in col_names:
                val = row.get(col)
                # Ensure JSON-serializable values
                if val is None:
                    row_dict[col] = None
                elif isinstance(val, (int, float, bool, str)):
                    row_dict[col] = val
                else:
                    row_dict[col] = str(val)
            rows_data.append(row_dict)

        return {
            "table_name": body.table_name,
            "columns": col_names,
            "rows": rows_data,
            "total": total_rows,
            "offset": body.offset,
            "limit": body.limit,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching CSV rows: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/csv/lookup")
def csv_lookup(body: dict):
    """Look up rows in a CSV table using a retrieval UDF."""
    user_id = config.DEFAULT_USER_ID
    table_name = body.get("table_name", "")
    lookup_params = body.get("params", {})
    limit = body.get("limit", 10)

    if not table_name.startswith("agents.csv_"):
        raise HTTPException(status_code=400, detail="Invalid CSV table name")

    try:
        # Verify ownership
        registry = pxt.get_table("agents.csv_registry")
        check = registry.where(
            (registry.table_name == table_name) & (registry.user_id == user_id)
        ).select(registry.col_names).collect()
        if not check:
            raise HTTPException(status_code=404, detail="CSV table not found")

        col_names = check[0]["col_names"]
        tbl = pxt.get_table(table_name)

        # Build lookup UDF on the fly
        lookup_cols = [k for k in lookup_params.keys() if k in col_names]
        if not lookup_cols:
            raise HTTPException(status_code=400, detail="No valid lookup columns provided")

        udf = pxt.retrieval_udf(
            tbl,
            name=f"lookup_{table_name.split('.')[-1]}",
            description=f"Look up rows in {table_name}",
            parameters=lookup_cols,
            limit=limit,
        )

        result = tbl.select(udf(**lookup_params)).limit(1).collect()
        if result:
            return {"rows": result[0].get(f"lookup_{table_name.split('.')[-1]}", [])}
        return {"rows": []}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in CSV lookup: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/csv/{csv_uuid}")
def delete_csv_table(csv_uuid: str):
    """Delete a CSV table and its registry entry."""
    user_id = config.DEFAULT_USER_ID

    try:
        registry = pxt.get_table("agents.csv_registry")
        check = registry.where(
            (registry.uuid == csv_uuid) & (registry.user_id == user_id)
        ).select(registry.table_name).collect()
        if not check:
            raise HTTPException(status_code=404, detail="CSV table not found")

        table_name = check[0]["table_name"]

        # Drop the actual CSV table
        try:
            pxt.drop_table(table_name, force=True)
        except Exception as e:
            logger.warning(f"Could not drop CSV table {table_name}: {e}")

        # Remove from registry
        registry.delete(where=(registry.uuid == csv_uuid) & (registry.user_id == user_id))

        return {"message": f"CSV table '{table_name}' deleted"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting CSV table: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── CSV Row CRUD ─────────────────────────────────────────────────────────────

def _verify_csv_ownership(table_name: str, user_id: str):
    """Verify the CSV table exists and belongs to the user. Returns registry row."""
    if not table_name.startswith("agents.csv_"):
        raise HTTPException(status_code=400, detail="Invalid CSV table name")
    registry = pxt.get_table("agents.csv_registry")
    check = registry.where(
        (registry.table_name == table_name) & (registry.user_id == user_id)
    ).select(registry.col_names, registry.row_count, registry.uuid).collect()
    if not check:
        raise HTTPException(status_code=404, detail="CSV table not found")
    return check[0]


def _build_row_where(tbl, col_names: list[str], row_values: dict):
    """Build a Pixeltable where clause matching a specific row by all its column values."""
    from functools import reduce

    conditions = []
    for col in col_names:
        val = row_values.get(col)
        col_ref = getattr(tbl, col)
        if val is None:
            conditions.append(col_ref == None)  # noqa: E711 — Pixeltable uses == None
        else:
            conditions.append(col_ref == val)

    if not conditions:
        raise HTTPException(status_code=400, detail="No column values provided to identify row")
    return reduce(lambda a, b: a & b, conditions)


def _sync_registry_row_count(table_name: str, user_id: str):
    """Recount actual rows and update the registry."""
    tbl = pxt.get_table(table_name)
    actual_count = len(list(tbl.select().collect()))
    registry = pxt.get_table("agents.csv_registry")
    registry.update(
        {"row_count": actual_count},
        where=(registry.table_name == table_name) & (registry.user_id == user_id),
    )
    return actual_count


def _get_col_schema(tbl) -> dict[str, object]:
    """Get column name → ColumnType mapping from a Pixeltable table."""
    return tbl._get_schema()


def _coerce_value(val, col_name: str, schema: dict[str, object]):
    """Coerce a JSON value to the Pixeltable column's expected type.

    Args:
        schema: pre-fetched dict from _get_col_schema(tbl)
    """
    if val is None:
        return None
    col_type = schema.get(col_name)
    if col_type is None:
        return val
    type_name = str(col_type)
    if "Int" in type_name:
        try:
            return int(val)
        except (ValueError, TypeError):
            return val
    if "Float" in type_name:
        try:
            return float(val)
        except (ValueError, TypeError):
            return val
    if "Bool" in type_name:
        if isinstance(val, str):
            return val.lower() in ("true", "1", "yes")
        return bool(val)
    return str(val) if not isinstance(val, str) else val


class CsvAddRowsRequest(BaseModel):
    table_name: str
    rows: list[dict]


@router.post("/csv/rows/add")
def csv_add_rows(body: CsvAddRowsRequest):
    """Add one or more rows to a CSV table."""
    user_id = config.DEFAULT_USER_ID
    reg = _verify_csv_ownership(body.table_name, user_id)
    col_names: list[str] = reg["col_names"]

    if not body.rows:
        raise HTTPException(status_code=400, detail="No rows provided")

    try:
        tbl = pxt.get_table(body.table_name)
        schema = _get_col_schema(tbl)

        coerced_rows = []
        for row in body.rows:
            coerced = {}
            for col in col_names:
                coerced[col] = _coerce_value(row.get(col), col, schema)
            coerced_rows.append(coerced)

        tbl.insert(coerced_rows)
        new_count = _sync_registry_row_count(body.table_name, user_id)

        return {
            "message": f"Added {len(coerced_rows)} row(s)",
            "rows_added": len(coerced_rows),
            "new_total": new_count,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding CSV rows: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class CsvUpdateRowRequest(BaseModel):
    table_name: str
    original_row: dict
    updated_values: dict


@router.put("/csv/rows/update")
def csv_update_row(body: CsvUpdateRowRequest):
    """Update a specific row in a CSV table.

    `original_row` identifies which row to update (matched on all columns).
    `updated_values` contains only the columns to change.
    """
    user_id = config.DEFAULT_USER_ID
    reg = _verify_csv_ownership(body.table_name, user_id)
    col_names: list[str] = reg["col_names"]

    if not body.updated_values:
        raise HTTPException(status_code=400, detail="No updated values provided")

    try:
        tbl = pxt.get_table(body.table_name)
        schema = _get_col_schema(tbl)

        # Coerce original row values
        coerced_original: dict = {}
        for col in col_names:
            coerced_original[col] = _coerce_value(body.original_row.get(col), col, schema)

        where = _build_row_where(tbl, col_names, coerced_original)

        # Coerce updated values
        update_dict: dict = {}
        for col, val in body.updated_values.items():
            if col in col_names:
                update_dict[col] = _coerce_value(val, col, schema)

        if not update_dict:
            raise HTTPException(status_code=400, detail="No valid columns to update")

        status = tbl.update(update_dict, where=where)

        return {
            "message": f"Updated {status.num_rows} row(s)",
            "rows_updated": status.num_rows,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating CSV row: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class CsvDeleteRowsRequest(BaseModel):
    table_name: str
    row_values: dict


@router.delete("/csv/rows/delete")
def csv_delete_rows(body: CsvDeleteRowsRequest):
    """Delete row(s) matching the given column values from a CSV table."""
    user_id = config.DEFAULT_USER_ID
    reg = _verify_csv_ownership(body.table_name, user_id)
    col_names: list[str] = reg["col_names"]

    try:
        tbl = pxt.get_table(body.table_name)
        schema = _get_col_schema(tbl)

        coerced: dict = {}
        for col in col_names:
            coerced[col] = _coerce_value(body.row_values.get(col), col, schema)

        where = _build_row_where(tbl, col_names, coerced)
        status = tbl.delete(where=where)
        new_count = _sync_registry_row_count(body.table_name, user_id)

        return {
            "message": f"Deleted {status.num_rows} row(s)",
            "rows_deleted": status.num_rows,
            "new_total": new_count,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting CSV rows: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class CsvRevertRequest(BaseModel):
    table_name: str


@router.post("/csv/revert")
def csv_revert(body: CsvRevertRequest):
    """Revert a CSV table to its previous version (single undo)."""
    user_id = config.DEFAULT_USER_ID
    _verify_csv_ownership(body.table_name, user_id)

    try:
        tbl = pxt.get_table(body.table_name)
        tbl.revert()
        new_count = _sync_registry_row_count(body.table_name, user_id)

        return {
            "message": "Reverted to previous version",
            "new_total": new_count,
        }

    except Exception as e:
        logger.error(f"Error reverting CSV table: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Cross-modal Similarity Search ────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str
    types: list[str] = ["document", "image", "video", "audio"]
    limit: int = 20
    threshold: float = 0.2


@router.post("/search")
def search_studio(body: SearchRequest):
    """Cross-modal semantic search across all file types using embedding indexes."""
    user_id = config.DEFAULT_USER_ID
    results: list[dict] = []

    # ── Documents (sentence-transformer on text chunks) ──
    if "document" in body.types:
        try:
            chunks_view = pxt.get_table("agents.chunks")
            sim = chunks_view.text.similarity(body.query)
            for row in (
                chunks_view
                .where((chunks_view.user_id == user_id) & (sim > body.threshold))
                .select(
                    text=chunks_view.text,
                    uuid_col=chunks_view.uuid,
                    sim=sim,
                    title=chunks_view.title,
                    heading=chunks_view.heading,
                    page=chunks_view.page,
                )
                .order_by(sim, asc=False)
                .limit(body.limit)
                .collect()
            ):
                results.append({
                    "type": "document",
                    "uuid": row["uuid_col"],
                    "text": (row.get("text") or "")[:300],
                    "similarity": round(float(row["sim"]), 4),
                    "metadata": {
                        "title": row.get("title"),
                        "heading": row.get("heading"),
                        "page": row.get("page"),
                    },
                })
        except Exception as e:
            logger.error(f"Studio search: document error: {e}")

    # ── Images (CLIP text-to-image) ──
    if "image" in body.types:
        try:
            img_table = _get_pxt_table("image")
            sim = img_table.image.similarity(body.query)
            for row in (
                img_table
                .where((img_table.user_id == user_id) & (sim > body.threshold))
                .select(uuid_col=img_table.uuid, sim=sim, thumb=img_table.thumbnail)
                .order_by(sim, asc=False)
                .limit(body.limit)
                .collect()
            ):
                thumbnail = _normalize_thumbnail(row.get("thumb"))
                results.append({
                    "type": "image",
                    "uuid": row["uuid_col"],
                    "similarity": round(float(row["sim"]), 4),
                    "thumbnail": thumbnail,
                })
        except Exception as e:
            logger.error(f"Studio search: image error: {e}")

    # ── Video frames (CLIP text-to-frame) ──
    if "video" in body.types:
        try:
            frames_view = pxt.get_table("agents.video_frames")
            sim = frames_view.frame.similarity(body.query)
            seen_videos: set[str] = set()
            for row in (
                frames_view
                .where((frames_view.user_id == user_id) & (sim > body.threshold))
                .select(
                    uuid_col=frames_view.uuid,
                    frame=frames_view.frame,
                    pos_msec=frames_view.pos_msec,
                    sim=sim,
                )
                .order_by(sim, asc=False)
                .limit(body.limit * 2)
                .collect()
            ):
                vid_uuid = row["uuid_col"]
                if vid_uuid in seen_videos:
                    continue
                seen_videos.add(vid_uuid)
                thumb = None
                frame = row.get("frame")
                if isinstance(frame, Image.Image):
                    thumb = create_thumbnail_base64(frame, THUMB_SIZE)
                pos_sec = round(row.get("pos_msec", 0) / 1000, 1)
                results.append({
                    "type": "video",
                    "uuid": vid_uuid,
                    "similarity": round(float(row["sim"]), 4),
                    "thumbnail": thumb,
                    "metadata": {"frame_position": pos_sec},
                })
                if len(seen_videos) >= body.limit:
                    break
        except Exception as e:
            logger.error(f"Studio search: video frame error: {e}")

        # Also search video transcripts
        try:
            vt_view = pxt.get_table("agents.video_transcript_sentences")
            sim = vt_view.text.similarity(body.query)
            for row in (
                vt_view
                .where((vt_view.user_id == user_id) & (sim > body.threshold))
                .select(text=vt_view.text, uuid_col=vt_view.uuid, sim=sim)
                .order_by(sim, asc=False)
                .limit(body.limit)
                .collect()
            ):
                results.append({
                    "type": "video_transcript",
                    "uuid": row["uuid_col"],
                    "text": (row.get("text") or "")[:300],
                    "similarity": round(float(row["sim"]), 4),
                })
        except Exception as e:
            logger.error(f"Studio search: video transcript error: {e}")

    # ── Audio transcripts (sentence-transformer) ──
    if "audio" in body.types:
        try:
            at_view = pxt.get_table("agents.audio_transcript_sentences")
            sim = at_view.text.similarity(body.query)
            for row in (
                at_view
                .where((at_view.user_id == user_id) & (sim > body.threshold))
                .select(text=at_view.text, uuid_col=at_view.uuid, sim=sim)
                .order_by(sim, asc=False)
                .limit(body.limit)
                .collect()
            ):
                results.append({
                    "type": "audio_transcript",
                    "uuid": row["uuid_col"],
                    "text": (row.get("text") or "")[:300],
                    "similarity": round(float(row["sim"]), 4),
                })
        except Exception as e:
            logger.error(f"Studio search: audio transcript error: {e}")

    results.sort(key=lambda x: x["similarity"], reverse=True)
    return {"query": body.query, "results": results[:body.limit]}


def _parse_summary(raw: str | None) -> dict | None:
    """Parse the structured JSON summary from the Gemini auto-summarization column."""
    if not raw:
        return None
    try:
        import json
        data = json.loads(raw)
        return {
            "title": data.get("title", ""),
            "summary": data.get("summary", ""),
            "key_topics": data.get("key_topics", []),
        }
    except (json.JSONDecodeError, TypeError):
        return {"title": "", "summary": str(raw)[:300], "key_topics": []}


def _normalize_thumbnail(raw_thumb) -> str | None:
    """Normalize a Pixeltable thumbnail value into a data-URI string."""
    if not raw_thumb:
        return None
    if isinstance(raw_thumb, bytes):
        raw_thumb = raw_thumb.decode("utf-8")
    if isinstance(raw_thumb, str) and raw_thumb:
        return raw_thumb if raw_thumb.startswith("data:") else f"data:image/png;base64,{raw_thumb}"
    return None


# ── Embedding Visualization ──────────────────────────────────────────────────

EMBED_TEXT_FN = sentence_transformer.using(model_id=config.EMBEDDING_MODEL_ID)
EMBED_CLIP_FN = clip.using(model_id=config.CLIP_MODEL_ID)


@router.get("/embeddings")
def get_embeddings(space: str = "text", limit: int = 200):
    """
    Return 2-D UMAP-projected embeddings for visualization.

    space='text'   → document chunks + audio/video transcript sentences
    space='visual' → images + video frames (CLIP)
    """
    user_id = config.DEFAULT_USER_ID
    items: list[dict] = []
    vectors: list[np.ndarray] = []

    if space == "text":
        _collect_text_embeddings(user_id, limit, items, vectors)
    elif space == "visual":
        _collect_visual_embeddings(user_id, limit, items, vectors)
    else:
        raise HTTPException(status_code=400, detail="space must be 'text' or 'visual'")

    if len(vectors) < 2:
        return {"space": space, "points": items, "count": len(items)}

    matrix = np.array(vectors, dtype=np.float32)

    # Drop rows with NaN/Inf (corrupt embeddings)
    valid_mask = np.isfinite(matrix).all(axis=1)
    if not valid_mask.all():
        matrix = matrix[valid_mask]
        items = [item for item, ok in zip(items, valid_mask) if ok]
        if len(matrix) < 2:
            return {"space": space, "points": items, "count": len(items)}

    # Project to 2-D with UMAP (preserves global + local structure)
    n_neighbors = max(2, min(15, len(matrix) - 1))
    coords = UMAP(
        n_components=2,
        n_neighbors=n_neighbors,
        min_dist=0.1,
        metric="cosine",
        random_state=42,
    ).fit_transform(matrix)

    # Normalize to 0-1 range
    mins = coords.min(axis=0)
    maxs = coords.max(axis=0)
    span = maxs - mins
    span[span == 0] = 1
    normed = (coords - mins) / span

    for i, item in enumerate(items):
        item["x"] = round(float(normed[i, 0]), 4)
        item["y"] = round(float(normed[i, 1]), 4)

    return {"space": space, "points": items, "count": len(items)}


def _collect_text_embeddings(
    user_id: str, limit: int, items: list[dict], vectors: list[np.ndarray],
):
    """Collect text embeddings from document chunks and transcript sentences."""
    per_type_limit = max(10, limit // 3)

    # Document chunks
    try:
        chunks_view = pxt.get_table("agents.chunks")
        for row in (
            chunks_view
            .where(chunks_view.user_id == user_id)
            .select(
                text=chunks_view.text,
                uuid_col=chunks_view.uuid,
                emb=EMBED_TEXT_FN(chunks_view.text),
                heading=chunks_view.heading,
            )
            .limit(per_type_limit)
            .collect()
        ):
            emb = row.get("emb")
            if emb is not None:
                vectors.append(np.asarray(emb, dtype=np.float32))
                items.append({
                    "type": "document",
                    "uuid": row["uuid_col"],
                    "label": (row.get("heading") or (row.get("text") or "")[:60]),
                })
    except Exception as e:
        logger.error(f"Embedding viz: document error: {e}")

    # Video transcript sentences
    try:
        vt_view = pxt.get_table("agents.video_transcript_sentences")
        for row in (
            vt_view
            .where(vt_view.user_id == user_id)
            .select(
                text=vt_view.text,
                uuid_col=vt_view.uuid,
                emb=EMBED_TEXT_FN(vt_view.text),
            )
            .limit(per_type_limit)
            .collect()
        ):
            emb = row.get("emb")
            if emb is not None:
                vectors.append(np.asarray(emb, dtype=np.float32))
                items.append({
                    "type": "video_transcript",
                    "uuid": row["uuid_col"],
                    "label": (row.get("text") or "")[:60],
                })
    except Exception as e:
        logger.error(f"Embedding viz: video transcript error: {e}")

    # Audio transcript sentences
    try:
        at_view = pxt.get_table("agents.audio_transcript_sentences")
        for row in (
            at_view
            .where(at_view.user_id == user_id)
            .select(
                text=at_view.text,
                uuid_col=at_view.uuid,
                emb=EMBED_TEXT_FN(at_view.text),
            )
            .limit(per_type_limit)
            .collect()
        ):
            emb = row.get("emb")
            if emb is not None:
                vectors.append(np.asarray(emb, dtype=np.float32))
                items.append({
                    "type": "audio_transcript",
                    "uuid": row["uuid_col"],
                    "label": (row.get("text") or "")[:60],
                })
    except Exception as e:
        logger.error(f"Embedding viz: audio transcript error: {e}")


def _collect_visual_embeddings(
    user_id: str, limit: int, items: list[dict], vectors: list[np.ndarray],
):
    """Collect CLIP embeddings from images and video frames."""
    per_type_limit = max(10, limit // 2)

    # Images
    try:
        img_table = _get_pxt_table("image")
        for row in (
            img_table
            .where(img_table.user_id == user_id)
            .select(
                uuid_col=img_table.uuid,
                thumb=img_table.thumbnail,
                emb=EMBED_CLIP_FN(img_table.image),
            )
            .limit(per_type_limit)
            .collect()
        ):
            emb = row.get("emb")
            if emb is not None:
                vectors.append(np.asarray(emb, dtype=np.float32))
                thumbnail = _normalize_thumbnail(row.get("thumb"))
                items.append({
                    "type": "image",
                    "uuid": row["uuid_col"],
                    "label": f"Image {row['uuid_col'][:8]}",
                    "thumbnail": thumbnail,
                })
    except Exception as e:
        logger.error(f"Embedding viz: image error: {e}")

    # Video frames
    try:
        frames_view = pxt.get_table("agents.video_frames")
        for row in (
            frames_view
            .where(frames_view.user_id == user_id)
            .select(
                uuid_col=frames_view.uuid,
                frame=frames_view.frame,
                pos_msec=frames_view.pos_msec,
                emb=EMBED_CLIP_FN(frames_view.frame),
            )
            .limit(per_type_limit)
            .collect()
        ):
            emb = row.get("emb")
            if emb is not None:
                vectors.append(np.asarray(emb, dtype=np.float32))
                thumb = None
                frame = row.get("frame")
                if isinstance(frame, Image.Image):
                    thumb = create_thumbnail_base64(frame, (64, 64))
                pos_sec = round(row.get("pos_msec", 0) / 1000, 1)
                items.append({
                    "type": "video_frame",
                    "uuid": row["uuid_col"],
                    "label": f"Keyframe @{pos_sec}s",
                    "thumbnail": thumb,
                })
    except Exception as e:
        logger.error(f"Embedding viz: video frame error: {e}")


# ── Image Preview ────────────────────────────────────────────────────────────

@router.get("/image_preview/{uuid}")
def get_image_preview(uuid: str):
    """Get a larger preview of an image for the studio workspace."""
    user_id = config.DEFAULT_USER_ID
    try:
        img_table = _get_pxt_table("image")
        rows = img_table.where(
            (img_table.uuid == uuid) & (img_table.user_id == user_id)
        ).select(img=img_table.image).collect()

        if len(rows) == 0:
            raise HTTPException(status_code=404, detail="Image not found")

        img = rows[0]["img"]
        if not isinstance(img, Image.Image):
            raise HTTPException(status_code=500, detail="Could not load image")

        width, height = img.size
        preview = _pil_image_to_data_uri(img, max_size=PREVIEW_SIZE)
        return {
            "preview": preview,
            "width": width,
            "height": height,
            "mode": img.mode,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Studio: error getting image preview: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Image Transform ──────────────────────────────────────────────────────────

class TransformRequest(BaseModel):
    uuid: str
    operation: str
    params: dict = {}


@router.post("/transform/image")
def transform_image(body: TransformRequest):
    """Apply a PIL transform to an image and return the preview (no storage)."""
    user_id = config.DEFAULT_USER_ID
    try:
        img_table = _get_pxt_table("image")
        rows = img_table.where(
            (img_table.uuid == body.uuid) & (img_table.user_id == user_id)
        ).select(img=img_table.image).collect()

        if len(rows) == 0:
            raise HTTPException(status_code=404, detail="Image not found")

        img = rows[0]["img"]
        if not isinstance(img, Image.Image):
            raise HTTPException(status_code=500, detail="Could not load image")

        result = _apply_image_operation(img, body.operation, body.params)
        preview = _pil_image_to_data_uri(result, max_size=PREVIEW_SIZE)

        return {
            "preview": preview,
            "width": result.size[0],
            "height": result.size[1],
            "mode": result.mode,
            "operation": body.operation,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Studio: image transform error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _get_full_res_transform(body: TransformRequest) -> Image.Image:
    """Load an image from Pixeltable and apply the operation at full resolution."""
    user_id = config.DEFAULT_USER_ID
    img_table = _get_pxt_table("image")
    rows = img_table.where(
        (img_table.uuid == body.uuid) & (img_table.user_id == user_id)
    ).select(img=img_table.image).collect()

    if len(rows) == 0:
        raise HTTPException(status_code=404, detail="Image not found")

    img = rows[0]["img"]
    if not isinstance(img, Image.Image):
        raise HTTPException(status_code=500, detail="Could not load image")

    return _apply_image_operation(img, body.operation, body.params)


def _derive_filename(original_name: str, operation: str) -> str:
    """Create a descriptive filename for a transformed image."""
    base, ext = os.path.splitext(original_name)
    if not ext:
        ext = ".png"
    return f"{base}_{operation}{ext}"


# ── Save Transformed Image ───────────────────────────────────────────────────

class SaveImageResponse(BaseModel):
    message: str
    uuid: str
    filename: str


@router.post("/save/image", response_model=SaveImageResponse)
def save_transformed_image(body: TransformRequest):
    """Apply transform at full resolution and save as a new image in Pixeltable."""
    user_id = config.DEFAULT_USER_ID
    try:
        # Get original filename for naming the derivative
        img_table = _get_pxt_table("image")
        name_rows = img_table.where(
            (img_table.uuid == body.uuid) & (img_table.user_id == user_id)
        ).select(img_source=img_table.image).collect()

        original_name = "image"
        if len(name_rows) > 0:
            original_name = _source_to_filename(name_rows[0]["img_source"])

        result = _get_full_res_transform(body)

        # Ensure the result is RGB/RGBA (save as PNG)
        derived_name = _derive_filename(original_name, body.operation)
        if not derived_name.lower().endswith(".png"):
            derived_name = os.path.splitext(derived_name)[0] + ".png"

        # Write to the upload folder
        os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)
        file_uuid = str(uuid_mod.uuid4())
        save_path = os.path.join(config.UPLOAD_FOLDER, f"{file_uuid}_{derived_name}")

        if result.mode == "L":
            result = result.convert("RGB")
        result.save(save_path, format="PNG")

        # Insert into Pixeltable images table
        row = ImageRow(
            image=save_path,
            uuid=file_uuid,
            timestamp=datetime.now(),
            user_id=user_id,
        )
        img_table.insert([row])

        return SaveImageResponse(
            message=f"Saved {body.operation} result as new image",
            uuid=file_uuid,
            filename=derived_name,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Studio: save image error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Download Transformed Image ───────────────────────────────────────────────

@router.post("/download/image")
def download_transformed_image(body: TransformRequest):
    """Apply transform at full resolution and return as a downloadable PNG."""
    try:
        # Get original filename for the download name
        user_id = config.DEFAULT_USER_ID
        img_table = _get_pxt_table("image")
        name_rows = img_table.where(
            (img_table.uuid == body.uuid) & (img_table.user_id == user_id)
        ).select(img_source=img_table.image).collect()

        original_name = "image"
        if len(name_rows) > 0:
            original_name = _source_to_filename(name_rows[0]["img_source"])

        result = _get_full_res_transform(body)

        derived_name = _derive_filename(original_name, body.operation)
        if not derived_name.lower().endswith(".png"):
            derived_name = os.path.splitext(derived_name)[0] + ".png"

        if result.mode == "L":
            result = result.convert("RGB")

        buf = io.BytesIO()
        result.save(buf, format="PNG")
        buf.seek(0)

        return StreamingResponse(
            buf,
            media_type="image/png",
            headers={"Content-Disposition": f'attachment; filename="{derived_name}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Studio: download image error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Video Transform ──────────────────────────────────────────────────────────

@router.post("/transform/video")
def transform_video(body: TransformRequest):
    """Apply a Pixeltable video UDF and return the result (metadata, frame, clip, overlay, scenes)."""
    user_id = config.DEFAULT_USER_ID
    try:
        vid_table = _get_pxt_table("video")
        match = vid_table.where(
            (vid_table.uuid == body.uuid) & (vid_table.user_id == user_id)
        )

        if body.operation == "view_metadata":
            rows = match.select(
                meta=pxt_video.get_metadata(vid_table.video),
                dur=pxt_video.get_duration(vid_table.video),
            ).collect()
            if not rows:
                raise HTTPException(status_code=404, detail="Video not found")
            meta = rows[0].get("meta", {})
            dur = rows[0].get("dur")
            streams = meta.get("streams", [])
            video_stream = next((s for s in streams if s.get("type") == "video"), {})
            return {
                "operation": "view_metadata",
                "duration": round(dur, 2) if dur else None,
                "metadata": {
                    "format_size": meta.get("size"),
                    "bit_rate": meta.get("bit_rate"),
                    "width": video_stream.get("width"),
                    "height": video_stream.get("height"),
                    "fps": video_stream.get("average_rate"),
                    "total_frames": video_stream.get("frames"),
                    "codec": video_stream.get("codec_context", {}).get("name"),
                    "profile": video_stream.get("codec_context", {}).get("profile"),
                    "pix_fmt": video_stream.get("codec_context", {}).get("pix_fmt"),
                },
            }

        elif body.operation == "extract_frame":
            ts = float(body.params.get("timestamp", 0.0))
            rows = match.select(
                frame=pxt_video.extract_frame(vid_table.video, timestamp=ts),
            ).collect()
            if not rows:
                raise HTTPException(status_code=404, detail="Video not found")
            frame = rows[0].get("frame")
            if not isinstance(frame, Image.Image):
                raise HTTPException(status_code=400, detail="No frame at that timestamp (may be past end of video)")
            preview = _pil_image_to_data_uri(frame, max_size=PREVIEW_SIZE)
            return {
                "operation": "extract_frame",
                "frame": preview,
                "width": frame.size[0],
                "height": frame.size[1],
                "timestamp": ts,
            }

        elif body.operation == "clip_video":
            start = float(body.params.get("start", 0.0))
            duration = float(body.params.get("duration", 10.0))
            rows = match.select(
                clipped=pxt_video.clip(vid_table.video, start_time=start, duration=duration),
            ).collect()
            if not rows:
                raise HTTPException(status_code=404, detail="Video not found")
            clipped = rows[0].get("clipped")
            if clipped is None:
                raise HTTPException(status_code=400, detail="Clip start is past end of video")
            video_path = str(clipped)
            clip_dur = round(duration, 2)
            return {
                "operation": "clip_video",
                "video_url": f"/api/serve_video?path={video_path}",
                "video_path": video_path,
                "duration": clip_dur,
            }

        elif body.operation == "overlay_text":
            text = str(body.params.get("text", "Hello World"))
            font_size = int(body.params.get("font_size", 32))
            position = str(body.params.get("position", "bottom"))
            v_align = "bottom" if position == "bottom" else "top" if position == "top" else "center"
            rows = match.select(
                result=pxt_video.overlay_text(
                    vid_table.video,
                    text,
                    font_size=font_size,
                    color="white",
                    vertical_align=v_align,
                    vertical_margin=40,
                    horizontal_align="center",
                    box=True,
                    box_color="black",
                    box_opacity=0.7,
                    box_border=[8, 16],
                ),
            ).collect()
            if not rows:
                raise HTTPException(status_code=404, detail="Video not found")
            result = rows[0].get("result")
            video_path = str(result)
            return {
                "operation": "overlay_text",
                "video_url": f"/api/serve_video?path={video_path}",
                "video_path": video_path,
            }

        elif body.operation == "detect_scenes":
            threshold = float(body.params.get("threshold", 27.0))
            rows = match.select(
                scenes=pxt_video.scene_detect_content(vid_table.video, threshold=threshold),
                dur=pxt_video.get_duration(vid_table.video),
            ).collect()
            if not rows:
                raise HTTPException(status_code=404, detail="Video not found")
            scenes = rows[0].get("scenes", [])
            dur = rows[0].get("dur")
            return {
                "operation": "detect_scenes",
                "scenes": scenes,
                "total_duration": round(dur, 2) if dur else None,
                "scene_count": len(scenes),
            }

        else:
            raise HTTPException(status_code=400, detail=f"Unknown video operation: {body.operation}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Studio: video transform error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Save Video Transform Result ──────────────────────────────────────────────

class SaveVideoRequest(BaseModel):
    uuid: str
    operation: str
    params: dict = {}


@router.post("/save/video")
def save_video_result(body: SaveVideoRequest):
    """Save a video transform result (clip or overlay) as a new video in Pixeltable."""
    user_id = config.DEFAULT_USER_ID
    try:
        # Re-run the transform to get the result video
        result = transform_video(TransformRequest(uuid=body.uuid, operation=body.operation, params=body.params))
        video_path = result.get("video_path")
        if not video_path or not os.path.exists(video_path):
            raise HTTPException(status_code=400, detail="Operation did not produce a video file")

        import shutil
        os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)
        file_uuid = str(uuid_mod.uuid4())
        dest = os.path.join(config.UPLOAD_FOLDER, f"{file_uuid}_{body.operation}.mp4")
        shutil.copy2(video_path, dest)

        vid_table = _get_pxt_table("video")
        vid_table.insert([VideoRow(video=dest, uuid=file_uuid, timestamp=datetime.now(), user_id=user_id)])

        return {"message": f"Saved {body.operation} result as new video", "uuid": file_uuid}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Studio: save video error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Save Extracted Frame as Image ─────────────────────────────────────────────

@router.post("/save/extracted_frame")
def save_extracted_frame(body: TransformRequest):
    """Extract a frame and save it as a new image in Pixeltable."""
    user_id = config.DEFAULT_USER_ID
    try:
        vid_table = _get_pxt_table("video")
        ts = float(body.params.get("timestamp", 0.0))
        rows = vid_table.where(
            (vid_table.uuid == body.uuid) & (vid_table.user_id == user_id)
        ).select(frame=pxt_video.extract_frame(vid_table.video, timestamp=ts)).collect()

        if not rows:
            raise HTTPException(status_code=404, detail="Video not found")
        frame = rows[0].get("frame")
        if not isinstance(frame, Image.Image):
            raise HTTPException(status_code=400, detail="No frame at that timestamp")

        os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)
        file_uuid = str(uuid_mod.uuid4())
        save_path = os.path.join(config.UPLOAD_FOLDER, f"{file_uuid}_frame_{ts}s.png")
        frame.save(save_path, format="PNG")

        img_table = _get_pxt_table("image")
        img_table.insert([ImageRow(image=save_path, uuid=file_uuid, timestamp=datetime.now(), user_id=user_id)])

        return {"message": f"Saved frame at {ts}s as new image", "uuid": file_uuid}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Studio: save extracted frame error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Image Operations ─────────────────────────────────────────────────────────

def _apply_image_operation(img: Image.Image, operation: str, params: dict) -> Image.Image:
    """Apply a single image operation and return the transformed image."""
    if operation == "resize":
        w = int(params.get("width", 256))
        h = int(params.get("height", 256))
        return img.resize((w, h), Image.Resampling.LANCZOS)

    elif operation == "rotate":
        angle = float(params.get("angle", 90))
        return img.rotate(angle, expand=True, fillcolor=(0, 0, 0, 0) if img.mode == "RGBA" else None)

    elif operation == "flip_horizontal":
        return img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

    elif operation == "flip_vertical":
        return img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)

    elif operation == "grayscale":
        return ImageOps.grayscale(img)

    elif operation == "blur":
        radius = float(params.get("radius", 2))
        return img.filter(ImageFilter.GaussianBlur(radius=radius))

    elif operation == "sharpen":
        return img.filter(ImageFilter.SHARPEN)

    elif operation == "edge_detect":
        return img.filter(ImageFilter.FIND_EDGES)

    elif operation == "emboss":
        return img.filter(ImageFilter.EMBOSS)

    elif operation == "brightness":
        factor = float(params.get("factor", 1.5))
        return ImageEnhance.Brightness(img).enhance(factor)

    elif operation == "contrast":
        factor = float(params.get("factor", 1.5))
        return ImageEnhance.Contrast(img).enhance(factor)

    elif operation == "saturation":
        factor = float(params.get("factor", 1.5))
        return ImageEnhance.Color(img).enhance(factor)

    elif operation == "auto_contrast":
        if img.mode not in ("L", "RGB"):
            img = img.convert("RGB")
        return ImageOps.autocontrast(img)

    elif operation == "equalize":
        if img.mode not in ("L", "RGB"):
            img = img.convert("RGB")
        return ImageOps.equalize(img)

    elif operation == "invert":
        if img.mode == "RGBA":
            r, g, b, a = img.split()
            rgb = Image.merge("RGB", (r, g, b))
            inverted = ImageOps.invert(rgb)
            ir, ig, ib = inverted.split()
            return Image.merge("RGBA", (ir, ig, ib, a))
        if img.mode != "RGB":
            img = img.convert("RGB")
        return ImageOps.invert(img)

    else:
        raise ValueError(f"Unknown operation: {operation}")


# ── Document Summary ─────────────────────────────────────────────────────────

@router.get("/summary/{uuid}")
def get_document_summary(uuid: str):
    """Get the auto-generated summary for a document."""
    user_id = config.DEFAULT_USER_ID
    try:
        doc_table = _get_pxt_table("document")
        select_cols = dict(uuid_col=doc_table.uuid)
        if hasattr(doc_table, "summary"):
            select_cols["summary_json"] = doc_table.summary
        if hasattr(doc_table, "document_text"):
            select_cols["doc_text"] = doc_table.document_text

        rows = (
            doc_table.where((doc_table.uuid == uuid) & (doc_table.user_id == user_id))
            .select(**select_cols)
            .collect()
        )

        if len(rows) == 0:
            raise HTTPException(status_code=404, detail="Document not found")

        row = rows[0]
        summary = _parse_summary(row.get("summary_json"))
        doc_text_preview = (row.get("doc_text") or "")[:500]

        return {
            "uuid": uuid,
            "summary": summary,
            "text_preview": doc_text_preview,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Studio: error fetching document summary: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Document Chunks ──────────────────────────────────────────────────────────

@router.get("/chunks/{uuid}")
def get_document_chunks(uuid: str, limit: int = 50):
    """Get extracted text chunks for a document."""
    user_id = config.DEFAULT_USER_ID
    try:
        chunks_view = pxt.get_table("agents.chunks")
        results = []
        for row in chunks_view.where(
            (chunks_view.uuid == uuid) & (chunks_view.user_id == user_id)
        ).select(
            text=chunks_view.text,
            title=chunks_view.title,
            heading=chunks_view.heading,
            page=chunks_view.page,
        ).limit(limit).collect():
            results.append({
                "text": row.get("text", ""),
                "title": row.get("title"),
                "heading": row.get("heading"),
                "page": row.get("page"),
            })

        return {"uuid": uuid, "chunks": results, "total": len(results)}

    except Exception as e:
        logger.error(f"Studio: error fetching chunks: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Video Frames ─────────────────────────────────────────────────────────────

@router.get("/frames/{uuid}")
def get_video_frames(uuid: str, limit: int = 12):
    """Get extracted frames from a video as base64 thumbnails."""
    user_id = config.DEFAULT_USER_ID
    try:
        frames_view = pxt.get_table("agents.video_frames")
        results = []
        for row in frames_view.where(
            (frames_view.uuid == uuid) & (frames_view.user_id == user_id)
        ).select(
            frame=frames_view.frame, pos_msec=frames_view.pos_msec,
        ).order_by(frames_view.pos_msec).limit(limit).collect():
            frame = row.get("frame")
            if isinstance(frame, Image.Image):
                thumb = create_thumbnail_base64(frame, (192, 192))
                if thumb:
                    pos_sec = round(row.get("pos_msec", 0) / 1000, 1)
                    results.append({
                        "frame": thumb,
                        "position": pos_sec,
                    })

        return {"uuid": uuid, "frames": results, "total": len(results)}

    except Exception as e:
        logger.error(f"Studio: error fetching frames: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Transcription ────────────────────────────────────────────────────────────

@router.get("/transcription/{uuid}/{media_type}")
def get_transcription(uuid: str, media_type: str):
    """Get transcription for an audio or video file."""
    user_id = config.DEFAULT_USER_ID

    if media_type not in ("audio", "video"):
        raise HTTPException(status_code=400, detail="media_type must be 'audio' or 'video'")

    try:
        if media_type == "audio":
            view_name = "agents.audio_transcript_sentences"
        else:
            view_name = "agents.video_transcript_sentences"

        view = pxt.get_table(view_name)
        sentences = []
        for row in view.where(
            (view.uuid == uuid) & (view.user_id == user_id)
        ).select(text=view.text).collect():
            text = row.get("text", "")
            if text and text.strip():
                sentences.append(text.strip())

        return {
            "uuid": uuid,
            "media_type": media_type,
            "sentences": sentences,
            "full_text": " ".join(sentences),
        }

    except Exception as e:
        logger.error(f"Studio: error fetching transcription: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
