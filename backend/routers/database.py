"""Database introspection router — browse the Pixeltable catalog."""

import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pixeltable as pxt

from utils import pxt_retry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/db", tags=["database"])

NAMESPACE = "agents"


def _safe_value(val: object) -> object:
    """Convert a Pixeltable value to a JSON-safe representation."""
    if val is None or isinstance(val, (str, int, float, bool)):
        return val
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, bytes):
        return f"<binary {len(val)} bytes>"
    if isinstance(val, dict):
        return {k: _safe_value(v) for k, v in val.items()}
    if isinstance(val, (list, tuple)):
        return [_safe_value(item) for item in val]
    s = str(val)
    if len(s) > 300:
        return s[:300] + "..."
    return s


def _column_info(tbl) -> list[dict]:
    """Extract column info from a table using the public get_metadata() API."""
    meta = tbl.get_metadata()
    col_meta = meta.get("columns", {})

    columns = []
    for name in tbl.columns():
        info = col_meta.get(name, {})
        columns.append({
            "name": name,
            "type": info.get("type_", "unknown"),
            "is_computed": info.get("computed_with") is not None,
        })
    return columns


@router.get("/tables")
@pxt_retry()
def list_all_tables():
    """List all tables and views in the agents namespace with schema info."""
    try:
        table_paths = pxt.list_tables(NAMESPACE, recursive=True)

        tables = []
        for path in sorted(table_paths):
            try:
                tbl = pxt.get_table(path)
                row_count = tbl.count()
                meta = tbl.get_metadata()
                base_path = meta.get("base")

                tables.append({
                    "path": path,
                    "type": "view" if meta.get("is_view") else "table",
                    "base_table": base_path,
                    "columns": _column_info(tbl),
                    "row_count": row_count,
                })
            except Exception as e:
                logger.warning(f"Could not inspect table {path}: {e}")
                tables.append({
                    "path": path,
                    "type": "unknown",
                    "base_table": None,
                    "columns": [],
                    "row_count": 0,
                    "error": str(e),
                })

        return {"namespace": NAMESPACE, "tables": tables, "count": len(tables)}

    except Exception as e:
        logger.error(f"Error listing tables: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/table/{path:path}/rows")
@pxt_retry()
def get_table_rows(path: str, limit: int = 50, offset: int = 0):
    """Fetch rows from a table with pagination."""
    try:
        tbl = pxt.get_table(path)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table '{path}' not found")

    try:
        total = tbl.count()
        col_names = tbl.columns()

        raw_rows = tbl.select().limit(limit).collect()
        # Apply offset manually (Pixeltable collect doesn't have skip)
        # Actually we can use head/tail but let's keep it simple with limit for now

        rows = []
        for raw in raw_rows:
            row: dict = {}
            for col in col_names:
                val = raw.get(col)
                row[col] = _safe_value(val)
            rows.append(row)

        return {
            "path": path,
            "columns": col_names,
            "rows": rows,
            "total": total,
            "offset": offset,
            "limit": limit,
        }

    except Exception as e:
        logger.error(f"Error fetching rows from {path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/table/{path:path}/schema")
@pxt_retry()
def get_table_schema(path: str):
    """Get detailed schema for a specific table."""
    try:
        tbl = pxt.get_table(path)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table '{path}' not found")

    try:
        meta = tbl.get_metadata()
        base_path = meta.get("base")
        return {
            "path": path,
            "type": "view" if meta.get("is_view") else "table",
            "base_table": base_path,
            "columns": _column_info(tbl),
            "row_count": tbl.count(),
        }

    except Exception as e:
        logger.error(f"Error getting schema for {path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/timeline")
@pxt_retry()
def get_timeline(limit: int = 100):
    """Unified chronological feed across all timestamped tables."""
    events: list[dict] = []

    # Tables with timestamp columns that represent meaningful activity
    TIMELINE_SOURCES = [
        ("agents/tools", "prompt", "Query"),
        ("agents/chat_history", "content", "Chat"),
        ("agents/memory_bank", "content", "Memory"),
        ("agents/collection", "document", "Document"),
        ("agents/images", "image", "Image"),
        ("agents/videos", "video", "Video"),
        ("agents/audios", "audio", "Audio"),
        ("agents/image_generation_tasks", "prompt", "ImageGen"),
        ("agents/video_generation_tasks", "prompt", "VideoGen"),
        ("agents/speech_tasks", "input_text", "Speech"),
        ("agents/csv_registry", "display_name", "CSV"),
        ("agents/user_personas", "persona_name", "Persona"),
    ]

    for table_path, label_col, event_type in TIMELINE_SOURCES:
        try:
            tbl = pxt.get_table(table_path)
            cols = tbl.columns()
            if "timestamp" not in cols:
                continue

            # Select timestamp + label column + any role column
            select_cols = {"timestamp": tbl.timestamp}
            if label_col in cols:
                select_cols["label"] = getattr(tbl, label_col)
            if "role" in cols:
                select_cols["role"] = tbl.role
            if "user_id" in cols:
                select_cols["user_id"] = tbl.user_id

            rows = tbl.select(**select_cols).limit(limit).collect()

            for row in rows:
                ts = row.get("timestamp")
                label_val = row.get("label", "")
                role = row.get("role")

                # Build display label
                display = str(label_val) if label_val else "(no label)"
                if len(display) > 150:
                    display = display[:150] + "..."

                events.append({
                    "table": table_path,
                    "type": event_type,
                    "role": role,
                    "label": display,
                    "timestamp": ts.isoformat() if ts else None,
                    "user_id": row.get("user_id"),
                })

        except Exception as e:
            logger.warning(f"Timeline: could not read {table_path}: {e}")

    # Sort by timestamp descending (most recent first)
    events.sort(key=lambda e: e.get("timestamp") or "", reverse=True)

    return {"events": events[:limit], "total": len(events)}


# ── Cross-Table Join ─────────────────────────────────────────────────────────

class JoinRequest(BaseModel):
    left_table: str
    right_table: str
    left_column: str
    right_column: str
    join_type: str = "inner"  # inner, left, cross
    limit: int = 50


@router.post("/join")
@pxt_retry()
def join_tables(body: JoinRequest):
    """Join two Pixeltable tables and return the combined result."""
    try:
        left = pxt.get_table(body.left_table)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table not found: {body.left_table}")
    try:
        right = pxt.get_table(body.right_table)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table not found: {body.right_table}")

    # Validate columns exist
    left_cols = left.columns()
    right_cols = right.columns()
    if body.left_column not in left_cols:
        raise HTTPException(status_code=400, detail=f"Column '{body.left_column}' not in {body.left_table}")
    if body.right_column not in right_cols:
        raise HTTPException(status_code=400, detail=f"Column '{body.right_column}' not in {body.right_table}")

    if body.join_type not in ("inner", "left", "cross"):
        raise HTTPException(status_code=400, detail=f"Unsupported join type: {body.join_type}")

    try:
        left_col_ref = getattr(left, body.left_column)
        right_col_ref = getattr(right, body.right_column)

        # Build join
        if body.join_type == "cross":
            joined = left.join(right, how="cross")
        else:
            joined = left.join(right, on=left_col_ref == right_col_ref, how=body.join_type)

        # Select all columns from both tables (prefix to avoid collisions)
        select_kwargs = {}
        for col in left_cols:
            key = f"l_{col}"
            try:
                select_kwargs[key] = getattr(left, col)
            except Exception:
                pass
        for col in right_cols:
            key = f"r_{col}"
            try:
                select_kwargs[key] = getattr(right, col)
            except Exception:
                pass

        raw_rows = joined.select(**select_kwargs).limit(body.limit).collect()

        rows = []
        for raw in raw_rows:
            row = {}
            for k, v in raw.items():
                row[k] = _safe_value(v)
            rows.append(row)

        return {
            "left_table": body.left_table,
            "right_table": body.right_table,
            "join_type": body.join_type,
            "left_column": body.left_column,
            "right_column": body.right_column,
            "columns": list(select_kwargs.keys()),
            "rows": rows,
            "count": len(rows),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Join error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
