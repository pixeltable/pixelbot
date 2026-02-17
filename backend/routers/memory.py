import io
import json
import logging
import time
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import pixeltable as pxt

import config
from utils import pxt_retry
import queries
from models import MemoryBankRow

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["memory"])


# ── Save Memory ───────────────────────────────────────────────────────────────

class SaveMemoryRequest(BaseModel):
    content: str
    type: str  # "code" or "text"
    context_query: str = "Manual Entry"
    language: str | None = None


def _insert_memory(body: SaveMemoryRequest) -> dict:
    """Shared logic for saving a memory item."""
    user_id = config.DEFAULT_USER_ID

    if body.type not in ("code", "text"):
        raise HTTPException(status_code=400, detail='type must be "code" or "text"')

    language = body.language
    if body.type == "text":
        language = None
    elif body.type == "code" and not language:
        language = "text"

    max_retries = 3
    last_error: Exception | None = None

    for attempt in range(max_retries):
        try:
            memory_table = pxt.get_table("agents.memory_bank")
            memory_table.insert([MemoryBankRow(
                content=body.content,
                type=body.type,
                language=language,
                context_query=body.context_query,
                timestamp=datetime.now(),
                user_id=user_id,
            )])
            return {"message": "Memory item saved successfully"}
        except (AssertionError, RuntimeError) as e:
            last_error = e
            logger.warning(f"Memory insert attempt {attempt + 1}/{max_retries} hit transaction conflict, retrying...")
            time.sleep(0.5 * (attempt + 1))
        except Exception as e:
            logger.error(f"Error saving memory: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    logger.error(f"Error saving memory after {max_retries} retries: {last_error}", exc_info=True)
    raise HTTPException(status_code=500, detail=str(last_error))


@router.post("/memory", status_code=201)
def save_memory(body: SaveMemoryRequest):
    """Save a memory item (code or text)."""
    return _insert_memory(body)


@router.post("/memory/manual", status_code=201)
def add_memory_manual(body: SaveMemoryRequest):
    """Save a manually added memory item (backward-compatible alias)."""
    return _insert_memory(body)


# ── Get Memory ────────────────────────────────────────────────────────────────

@router.get("/memory")
@pxt_retry()
def get_memory(search: str | None = Query(default=None)):
    """Retrieve memory items, optionally filtering by semantic search.

    Uses shared query functions from queries.py (mirrors the @pxt.query
    definitions in setup_pixeltable.py) and direct ResultSet iteration.
    """
    user_id = config.DEFAULT_USER_ID

    try:
        if search:
            rows = queries.search_memory(search, user_id)
        else:
            rows = queries.get_all_memory(user_id)

        # Format timestamps for JSON serialization
        for row in rows:
            ts = row.get("timestamp")
            if ts:
                row["timestamp"] = ts.strftime("%Y-%m-%d %H:%M:%S.%f")

        return rows

    except Exception as e:
        logger.error(f"Error fetching memory: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Delete Memory ─────────────────────────────────────────────────────────────

class DeleteMemoryResponse(BaseModel):
    message: str
    num_deleted: int


@router.delete("/memory/{timestamp_str}", response_model=DeleteMemoryResponse)
def delete_memory(timestamp_str: str):
    """Delete a memory item by timestamp."""
    user_id = config.DEFAULT_USER_ID

    try:
        target_timestamp = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S.%f")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid timestamp format")

    try:
        memory_table = pxt.get_table("agents.memory_bank")
        status = memory_table.delete(
            where=(memory_table.timestamp == target_timestamp) & (memory_table.user_id == user_id)
        )

        if status.num_rows == 0:
            raise HTTPException(status_code=404, detail="No memory item found with that timestamp")

        return DeleteMemoryResponse(message="Memory item deleted", num_deleted=status.num_rows)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting memory: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Download Memory ───────────────────────────────────────────────────────────

@router.get("/download_memory")
def download_memory():
    """Download all memory bank items as JSON."""
    user_id = config.DEFAULT_USER_ID

    try:
        rows = queries.get_all_memory(user_id)
        for row in rows:
            ts = row.get("timestamp")
            if ts:
                row["timestamp"] = ts.strftime("%Y-%m-%d %H:%M:%S.%f")

        json_bytes = json.dumps(rows, indent=2).encode("utf-8")

        return StreamingResponse(
            io.BytesIO(json_bytes),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=memory_bank.json"},
        )

    except Exception as e:
        logger.error(f"Error downloading memory: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
