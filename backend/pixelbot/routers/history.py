import io
import json
import logging
from datetime import datetime

import pixeltable as pxt
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from pixelbot import config
from pixelbot.models import ConversationDetail, ConversationSummary, DeleteResponse
from pixelbot.utils import pxt_retry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["history"])


# ── Conversations ─────────────────────────────────────────────────────────────


@router.get("/conversations", response_model=list[ConversationSummary])
@pxt_retry()
def list_conversations():
    """List all conversations, grouped by conversation_id."""
    user_id = config.DEFAULT_USER_ID
    table = pxt.get_table("pixelbot_v3.chat_history")
    rows = list(
        table.where(table.user_id == user_id)
        .select(
            role=table.role,
            content=table.content,
            conversation_id=table.conversation_id,
            timestamp=table.timestamp,
        )
        .order_by(table.timestamp, asc=True)
        .collect()
    )

    convos: dict[str, dict] = {}
    for row in rows:
        cid = row.get("conversation_id") or "default"
        if cid not in convos:
            convos[cid] = {
                "conversation_id": cid,
                "title": "",
                "created_at": row["timestamp"].isoformat()
                if isinstance(row["timestamp"], datetime)
                else str(row["timestamp"]),
                "updated_at": row["timestamp"].isoformat()
                if isinstance(row["timestamp"], datetime)
                else str(row["timestamp"]),
                "message_count": 0,
            }
        entry = convos[cid]
        entry["message_count"] += 1
        ts_iso = row["timestamp"].isoformat() if isinstance(row["timestamp"], datetime) else str(row["timestamp"])
        entry["updated_at"] = ts_iso
        if not entry["title"] and row["role"] == "user":
            entry["title"] = row["content"][:100]

    result = sorted(convos.values(), key=lambda c: c["updated_at"], reverse=True)
    return result


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
@pxt_retry()
def get_conversation(conversation_id: str):
    """Get all messages for a specific conversation."""
    user_id = config.DEFAULT_USER_ID
    table = pxt.get_table("pixelbot_v3.chat_history")
    rows = list(
        table.where((table.user_id == user_id) & (table.conversation_id == conversation_id))
        .select(role=table.role, content=table.content, timestamp=table.timestamp)
        .order_by(table.timestamp, asc=True)
        .collect()
    )

    messages = []
    for row in rows:
        messages.append(
            {
                "role": row["role"],
                "content": row["content"],
                "timestamp": row["timestamp"].isoformat()
                if isinstance(row["timestamp"], datetime)
                else str(row["timestamp"]),
            }
        )

    return {"conversation_id": conversation_id, "messages": messages}


@router.delete("/conversations/{conversation_id}", response_model=DeleteResponse)
def delete_conversation(conversation_id: str):
    """Delete all messages in a conversation."""
    user_id = config.DEFAULT_USER_ID
    table = pxt.get_table("pixelbot_v3.chat_history")
    status = table.delete(where=(table.user_id == user_id) & (table.conversation_id == conversation_id))
    return {"message": "Conversation deleted", "num_deleted": status.num_rows}


# ── Download History ──────────────────────────────────────────────────────────


@router.get("/download_history")
@pxt_retry()
def download_chat_history():
    """Download the full chat history as JSON (direct iteration, no pandas)."""
    user_id = config.DEFAULT_USER_ID
    wf_table = pxt.get_table("pixelbot_v3.tools")
    rows = list(
        wf_table.where(wf_table.user_id == user_id)
        .select(
            prompt=wf_table.prompt,
            timestamp=wf_table.timestamp,
            answer=wf_table.answer,
            initial_system_prompt=wf_table.initial_system_prompt,
            final_system_prompt=wf_table.final_system_prompt,
            max_tokens=wf_table.max_tokens,
            temperature=wf_table.temperature,
        )
        .order_by(wf_table.timestamp, asc=False)
        .collect()
    )

    for row in rows:
        ts = row.get("timestamp")
        if ts:
            row["timestamp"] = ts.isoformat()

    json_bytes = json.dumps(rows, indent=2, default=str).encode("utf-8")

    return StreamingResponse(
        io.BytesIO(json_bytes),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=chat_history_full.json"},
    )


# ── Debug Export (full pixelbot_v3.tools table) ────────────────────────────────────


def _safe_serialize(obj: object) -> object:
    """Recursively convert non-JSON-serializable values to strings."""
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _safe_serialize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_safe_serialize(item) for item in obj]
    if isinstance(obj, bytes):
        return f"<binary {len(obj)} bytes>"
    return str(obj)


@router.get("/debug_export")
@pxt_retry()
def debug_export():
    """Export the full pixelbot_v3.tools table with every column for debugging."""
    user_id = config.DEFAULT_USER_ID
    wf_table = pxt.get_table("pixelbot_v3.tools")

    rows = list(
        wf_table.where(wf_table.user_id == user_id)
        .select(
            prompt=wf_table.prompt,
            timestamp=wf_table.timestamp,
            user_id=wf_table.user_id,
            initial_system_prompt=wf_table.initial_system_prompt,
            final_system_prompt=wf_table.final_system_prompt,
            max_tokens=wf_table.max_tokens,
            temperature=wf_table.temperature,
            initial_response=wf_table.initial_response,
            tool_output=wf_table.tool_output,
            doc_context=wf_table.doc_context,
            image_context=wf_table.image_context,
            video_frame_context=wf_table.video_frame_context,
            memory_context=wf_table.memory_context,
            chat_memory_context=wf_table.chat_memory_context,
            history_context=wf_table.history_context,
            multimodal_context_summary=wf_table.multimodal_context_summary,
            final_prompt_messages=wf_table.final_prompt_messages,
            final_response=wf_table.final_response,
            answer=wf_table.answer,
            follow_up_input_message=wf_table.follow_up_input_message,
            follow_up_text=wf_table.follow_up_text,
        )
        .order_by(wf_table.timestamp, asc=False)
        .collect()
    )

    sanitized = [_safe_serialize(row) for row in rows]
    json_bytes = json.dumps(sanitized, indent=2, default=str).encode("utf-8")

    return StreamingResponse(
        io.BytesIO(json_bytes),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=agents_tools_debug_export.json"},
    )
