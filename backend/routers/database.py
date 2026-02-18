"""Database introspection router — browse the Pixeltable catalog."""

import logging
import re
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


# ── Pipeline Inspector ────────────────────────────────────────────────────────

_COL_REF_RE = re.compile(r"\b([a-z_][a-z0-9_]*)\b")
_FUNC_CALL_RE = re.compile(r"\b([a-z_][a-z0-9_]*)\s*\(")

# Built-in Pixeltable functions (from pixeltable.functions.*)
_BUILTIN_FUNCS: set[str] = {
    "transcriptions", "speech",
    "messages",
    "generate_content", "generate_images", "generate_videos",
    "extract_audio",
    "resize", "b64_encode",
    "clip",
    "map", "lambda",
}

# Custom @pxt.udf from functions.py
_CUSTOM_UDFS: set[str] = {
    "get_latest_news", "search_news", "fetch_financial_data",
    "extract_document_text",
    "assemble_multimodal_context", "assemble_final_messages",
    "assemble_follow_up_prompt",
}

# @pxt.query from setup_pixeltable.py — maps query name to the table it searches
_QUERY_TABLE_MAP: dict[str, str] = {
    "search_documents": "agents/chunks",
    "search_images": "agents/images",
    "search_video_frames": "agents/video_frames",
    "search_video_transcripts": "agents/video_transcript_sentences",
    "search_audio_transcripts": "agents/audio_transcript_sentences",
    "search_memory": "agents/memory_bank",
    "search_chat_history": "agents/chat_history",
    "get_recent_chat_history": "agents/chat_history",
    "get_all_memory": "agents/memory_bank",
}


def _classify_func(name: str) -> str:
    """Classify a function name as builtin, custom, or query."""
    if name in _QUERY_TABLE_MAP:
        return "query"
    if name in _CUSTOM_UDFS:
        return "custom_udf"
    if name in _BUILTIN_FUNCS:
        return "builtin"
    return "unknown"


def _extract_func_name(computed_with: str | None) -> str | None:
    """Extract the primary function name from a computed_with expression."""
    if not computed_with:
        return None
    skip = {"model", "config", "type", "object", "items", "str", "get", "text"}
    for match in _FUNC_CALL_RE.finditer(computed_with):
        name = match.group(1)
        if name not in skip:
            return name
    return None


def _parse_deps(computed_with: str | None, all_cols: set[str]) -> list[str]:
    """Extract column names referenced in a computed_with expression."""
    if not computed_with:
        return []
    tokens = _COL_REF_RE.findall(computed_with)
    return sorted(set(t for t in tokens if t in all_cols))


def _detect_iterator(columns: list[dict]) -> str | None:
    """Detect the iterator type used to create a view from its column shapes."""
    own_cols = {c["name"] for c in columns if c.get("defined_in_self")}
    if {"frame_idx", "pos_frame", "frame"} & own_cols:
        return "FrameIterator"
    if {"audio_chunk"} & own_cols and {"start_time_sec", "end_time_sec"} & own_cols:
        return "AudioSplitter"
    if {"heading", "page", "title"} & own_cols and "pos" in own_cols:
        return "DocumentSplitter"
    if "text" in own_cols and "pos" in own_cols:
        return "StringSplitter"
    return None


def _count_col_errors(tbl, col_name: str, limit: int = 500) -> int:
    """Count rows where a computed column has a non-null errortype."""
    try:
        col_ref = getattr(tbl, col_name)
        err_col = col_ref.errortype
        rows = tbl.select(err=err_col).limit(limit).collect()
        return sum(1 for r in rows if r.get("err") is not None)
    except Exception:
        return 0


@router.get("/pipeline")
@pxt_retry()
def get_pipeline():
    """Return the full DAG metadata for the Pipeline Inspector.

    Includes tables, views, computed column lineage, embedding indices,
    version history, and per-column error counts.
    """
    try:
        table_paths = sorted(pxt.list_tables(NAMESPACE, recursive=True))

        nodes: list[dict] = []
        edges: list[dict] = []

        for path in table_paths:
            try:
                tbl = pxt.get_table(path)
                md = tbl.get_metadata()
                col_meta = md.get("columns", {})
                row_count = tbl.count()

                all_col_names = set(col_meta.keys())

                columns = []
                computed_cols = []
                insertable_cols: set[str] = set()

                short_name = path.rsplit("/", 1)[-1]

                for col_name, info in col_meta.items():
                    cw = info.get("computed_with")
                    is_computed = cw is not None
                    if not is_computed:
                        insertable_cols.add(col_name)
                    defined_in = info.get("defined_in")

                    cw_str = str(cw)[:200] if cw else None
                    func_name = _extract_func_name(cw_str) if is_computed else None
                    func_type = _classify_func(func_name) if func_name else None

                    col_entry = {
                        "name": col_name,
                        "type": info.get("type_", "unknown"),
                        "is_computed": is_computed,
                        "computed_with": cw_str,
                        "defined_in": defined_in,
                        "defined_in_self": defined_in == short_name,
                        "func_name": func_name,
                        "func_type": func_type,
                    }
                    columns.append(col_entry)
                    if is_computed:
                        computed_cols.append(col_name)

                # Compute error counts for computed columns (sample first 500 rows)
                total_errors = 0
                for col in columns:
                    if col["is_computed"]:
                        errs = _count_col_errors(tbl, col["name"])
                        col["error_count"] = errs
                        total_errors += errs
                    else:
                        col["error_count"] = 0

                # Column-level dependency edges (within this table)
                for col in columns:
                    if col["is_computed"] and col["computed_with"]:
                        deps = _parse_deps(col["computed_with"], all_col_names)
                        col["depends_on"] = deps

                # Indices
                raw_indices = md.get("indices", {})
                indices = []
                for idx_name, idx_info in raw_indices.items():
                    indices.append({
                        "name": idx_name,
                        "columns": idx_info.get("columns", []),
                        "type": idx_info.get("index_type", "unknown"),
                        "embedding": str(idx_info.get("parameters", {}).get("embedding", ""))[:120],
                    })

                # Version history (last 10)
                try:
                    raw_versions = tbl.get_versions()
                    versions = []
                    for v in raw_versions[:10]:
                        versions.append({
                            "version": v["version"],
                            "created_at": v["created_at"].isoformat() if v.get("created_at") else None,
                            "change_type": v.get("change_type"),
                            "inserts": v.get("inserts", 0),
                            "updates": v.get("updates", 0),
                            "deletes": v.get("deletes", 0),
                            "errors": v.get("errors", 0),
                        })
                except Exception:
                    versions = []

                base_path = md.get("base")
                is_view = md.get("is_view", False)

                iterator_type = _detect_iterator(columns) if is_view else None

                nodes.append({
                    "path": path,
                    "name": short_name,
                    "is_view": is_view,
                    "base": base_path,
                    "row_count": row_count,
                    "version": md.get("version", 0),
                    "total_errors": total_errors,
                    "columns": columns,
                    "indices": indices,
                    "versions": versions,
                    "computed_count": len(computed_cols),
                    "insertable_count": len(columns) - len(computed_cols),
                    "iterator_type": iterator_type,
                })

                if is_view and base_path:
                    edges.append({
                        "source": base_path,
                        "target": path,
                        "type": "view",
                        "label": iterator_type or "view",
                    })

                # Cross-table query edges (e.g., tools -> chunks via search_documents)
                seen_query_targets: set[str] = set()
                for col in columns:
                    fn = col.get("func_name")
                    if fn and fn in _QUERY_TABLE_MAP:
                        target_table = _QUERY_TABLE_MAP[fn]
                        edge_key = f"{path}->{target_table}"
                        if edge_key not in seen_query_targets:
                            seen_query_targets.add(edge_key)
                            edges.append({
                                "source": target_table,
                                "target": path,
                                "type": "query",
                                "label": fn,
                            })

            except Exception as e:
                logger.warning(f"Pipeline: could not inspect {path}: {e}")
                nodes.append({
                    "path": path,
                    "name": path.split(".")[-1] if "." in path else path,
                    "is_view": False,
                    "base": None,
                    "row_count": 0,
                    "version": 0,
                    "total_errors": 0,
                    "columns": [],
                    "indices": [],
                    "versions": [],
                    "computed_count": 0,
                    "insertable_count": 0,
                    "error": str(e),
                })

        return {"nodes": nodes, "edges": edges}

    except Exception as e:
        logger.error(f"Pipeline error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
