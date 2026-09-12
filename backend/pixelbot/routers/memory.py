import logging
from datetime import datetime

import pixeltable as pxt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pixelbot import config
from pixelbot.models import DeleteMemoryResponse, MemoryBankRow, MessageResponse
from pixelbot.utils import pxt_retry

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

    memory_table = pxt.get_table("pixelbot_v3.memory_bank")
    memory_table.insert(
        [
            MemoryBankRow(
                content=body.content,
                type=body.type,
                language=language,
                context_query=body.context_query,
                timestamp=datetime.now(),
                user_id=user_id,
            )
        ]
    )
    return {"message": "Memory item saved successfully"}


@router.post("/memory", status_code=201, response_model=MessageResponse)
@pxt_retry()
def save_memory(body: SaveMemoryRequest):
    """Save a memory item (code or text)."""
    return _insert_memory(body)


# ── Delete Memory ─────────────────────────────────────────────────────────────


@router.delete("/memory/{timestamp_str}", response_model=DeleteMemoryResponse)
@pxt_retry()
def delete_memory(timestamp_str: str):
    """Delete a memory item by timestamp."""
    user_id = config.DEFAULT_USER_ID

    try:
        target_timestamp = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S.%f")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid timestamp format")

    try:
        memory_table = pxt.get_table("pixelbot_v3.memory_bank")
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
