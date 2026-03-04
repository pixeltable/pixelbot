"""Database introspection + management router — browse and modify the Pixeltable catalog."""

import logging
import re
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pixeltable as pxt

import config
from utils import pxt_retry
from models import (
    CreateTableRequest, DropTableRequest, RenameTableRequest,
    InsertRowsRequest, DeleteRowsRequest, RevertTableRequest,
    AddColumnRequest, AddComputedColumnRequest, DropColumnRequest, RenameColumnRequest,
    CreateViewRequest,
    AddEmbeddingIndexRequest, DropEmbeddingIndexRequest,
    CreateDirRequest, DropDirRequest,
    MgmtResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/db", tags=["database"])

NAMESPACE = "agents"


# ── Type & Expression Helpers ─────────────────────────────────────────────────

_TYPE_MAP: dict[str, object] = {
    "string": pxt.String,
    "int": pxt.Int,
    "float": pxt.Float,
    "bool": pxt.Bool,
    "timestamp": pxt.Timestamp,
    "json": pxt.Json,
    "image": pxt.Image,
    "video": pxt.Video,
    "audio": pxt.Audio,
    "document": pxt.Document,
}


def _resolve_type(type_name: str) -> object:
    """Convert a string type name to a Pixeltable column type."""
    key = type_name.lower().strip()
    if key.startswith("array[") and key.endswith("]"):
        inner = key[6:-1].strip()
        inner_type = _TYPE_MAP.get(inner)
        if inner_type is None:
            raise ValueError(f"Unknown array element type: {inner}")
        return pxt.Array(inner_type)
    if key in _TYPE_MAP:
        return _TYPE_MAP[key]
    raise ValueError(
        f"Unknown type '{type_name}'. Available: {', '.join(sorted(_TYPE_MAP))} or Array[<type>]"
    )


def _resolve_schema(schema_dict: dict[str, str]) -> dict:
    """Convert {column_name: type_string} to {column_name: pxt_type}."""
    return {col: _resolve_type(t) for col, t in schema_dict.items()}


def _build_expression_namespace(tbl) -> dict:
    """Build a namespace for safely evaluating Pixeltable column expressions.

    The namespace provides:
      - ``table`` / ``tbl``: the table object (so ``table.col`` works)
      - Pixeltable function modules: ``gemini``, ``openai``, ``image``, ``video``, ``string``
      - Direct column name references for convenience
    """
    from pixeltable.functions import gemini as gemini_fn
    from pixeltable.functions import openai as openai_fn
    from pixeltable.functions import image as image_fn
    from pixeltable.functions import video as video_fn
    from pixeltable.functions import string as string_fn

    ns: dict = {
        "table": tbl,
        "tbl": tbl,
        "pxt": pxt,
        "gemini": gemini_fn,
        "openai": openai_fn,
        "image": image_fn,
        "video": video_fn,
        "string": string_fn,
    }

    safe_builtins = {
        "str": str, "int": int, "float": float, "bool": bool, "len": len,
        "min": min, "max": max, "abs": abs, "round": round, "list": list,
        "dict": dict, "tuple": tuple, "set": set, "True": True, "False": False,
        "None": None,
    }
    ns["__builtins__"] = safe_builtins

    for col_name in tbl.columns():
        try:
            ns[col_name] = getattr(tbl, col_name)
        except Exception:
            pass

    return ns


def _resolve_embedding_function(name: str):
    """Map a shorthand name to a Pixeltable embedding function.

    Supported shorthands: "gemini", "clip".
    Falls back to eval with the expression namespace for custom expressions.
    """
    key = name.lower().strip()
    if key == "gemini":
        from pixeltable.functions import gemini as gemini_fn
        return gemini_fn.generate_embedding.using(model=config.GEMINI_EMBEDDING_MODEL_ID)
    if key == "clip":
        from pixeltable.functions.huggingface import clip
        return clip.using(model_id=config.CLIP_MODEL_ID)
    raise ValueError(
        f"Unknown embedding function '{name}'. Use 'gemini' or 'clip'."
    )


_ITERATOR_COL_ARGS: dict[str, str] = {
    "DocumentSplitter": "document",
    "FrameIterator": "video",
    "AudioSplitter": "audio",
    "StringSplitter": "text",
}


def _resolve_iterator(iterator_type: str, iterator_args: dict, base_tbl):
    """Build an iterator create() call from type name, args, and base table."""
    from pixeltable.iterators import (
        DocumentSplitter, FrameIterator, AudioSplitter, StringSplitter,
    )

    iterators = {
        "DocumentSplitter": DocumentSplitter,
        "FrameIterator": FrameIterator,
        "AudioSplitter": AudioSplitter,
        "StringSplitter": StringSplitter,
    }

    cls = iterators.get(iterator_type)
    if cls is None:
        raise ValueError(
            f"Unknown iterator type '{iterator_type}'. "
            f"Available: {', '.join(sorted(iterators))}"
        )

    col_arg_name = _ITERATOR_COL_ARGS.get(iterator_type)
    kwargs: dict = {}
    for k, v in iterator_args.items():
        if k == col_arg_name:
            kwargs[k] = getattr(base_tbl, v)
        else:
            kwargs[k] = v

    return cls.create(**kwargs)


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
        entry: dict = {
            "name": name,
            "type": info.get("type_", "unknown"),
            "is_computed": info.get("computed_with") is not None,
        }
        comment = info.get("comment")
        if comment:
            entry["comment"] = comment
        custom_meta = info.get("custom_metadata")
        if custom_meta:
            entry["custom_metadata"] = custom_meta
        columns.append(entry)
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

        raw_rows = tbl.select().limit(limit, offset=offset).collect()

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


class SampleRequest(BaseModel):
    path: str
    n: int | None = None
    fraction: float | None = None
    stratify_by: str | None = None
    seed: int | None = 42
    limit: int = 100


@router.post("/sample")
@pxt_retry()
def sample_table(body: SampleRequest):
    """Sample rows from a table using Pixeltable's query.sample().

    Supports fixed count (n), percentage (fraction), stratified sampling
    (stratify_by column), and reproducible seeds.
    """
    try:
        tbl = pxt.get_table(body.path)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table '{body.path}' not found")

    if not body.n and not body.fraction:
        raise HTTPException(status_code=400, detail="Provide either 'n' or 'fraction'")

    try:
        total = tbl.count()
        query = tbl.select()

        sample_kwargs: dict = {}
        if body.n is not None:
            sample_kwargs["n"] = min(body.n, total)
        elif body.fraction is not None:
            sample_kwargs["fraction"] = max(0.0, min(1.0, body.fraction))

        if body.seed is not None:
            sample_kwargs["seed"] = body.seed

        if body.stratify_by:
            col_names = tbl.columns()
            if body.stratify_by not in col_names:
                raise HTTPException(
                    status_code=400,
                    detail=f"Column '{body.stratify_by}' not found in {body.path}",
                )
            sample_kwargs["stratify_by"] = getattr(tbl, body.stratify_by)

        raw_rows = query.sample(**sample_kwargs).collect()

        col_names = tbl.columns()
        rows = []
        for raw in raw_rows:
            row = {col: _safe_value(raw.get(col)) for col in col_names}
            rows.append(row)

        return {
            "path": body.path,
            "columns": col_names,
            "rows": rows,
            "sample_count": len(rows),
            "total": total,
            "params": {
                "n": body.n,
                "fraction": body.fraction,
                "stratify_by": body.stratify_by,
                "seed": body.seed,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sample error for {body.path}: {e}", exc_info=True)
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

                    col_entry: dict = {
                        "name": col_name,
                        "type": info.get("type_", "unknown"),
                        "is_computed": is_computed,
                        "computed_with": cw_str,
                        "defined_in": defined_in,
                        "defined_in_self": defined_in == short_name,
                        "func_name": func_name,
                        "func_type": func_type,
                    }
                    comment = info.get("comment")
                    if comment:
                        col_entry["comment"] = comment
                    custom_meta = info.get("custom_metadata")
                    if custom_meta:
                        col_entry["custom_metadata"] = custom_meta
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


# ══════════════════════════════════════════════════════════════════════════════
#  Pipeline Management Endpoints
# ══════════════════════════════════════════════════════════════════════════════


# ── Directory Management ──────────────────────────────────────────────────────

@router.post("/create_dir", response_model=MgmtResponse)
@pxt_retry()
def create_directory(body: CreateDirRequest):
    """Create a new Pixeltable directory (namespace)."""
    try:
        if body.parents:
            parts = body.path.split("/")
            for i in range(1, len(parts) + 1):
                pxt.create_dir("/".join(parts[:i]), if_exists="ignore")
        else:
            pxt.create_dir(body.path, if_exists="ignore")
        return MgmtResponse(success=True, message=f"Directory '{body.path}' created", path=body.path)
    except Exception as e:
        logger.error(f"create_dir error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/drop_dir", response_model=MgmtResponse)
@pxt_retry()
def drop_directory(body: DropDirRequest):
    """Drop a Pixeltable directory and optionally all contents."""
    try:
        pxt.drop_dir(body.path, force=body.force)
        return MgmtResponse(success=True, message=f"Directory '{body.path}' dropped", path=body.path)
    except Exception as e:
        logger.error(f"drop_dir error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Table Management ──────────────────────────────────────────────────────────

@router.post("/create_table", response_model=MgmtResponse)
@pxt_retry()
def create_table(body: CreateTableRequest):
    """Create a new Pixeltable base table."""
    try:
        schema = _resolve_schema(body.columns)

        kwargs: dict = {"if_exists": "error"}
        if body.primary_key:
            kwargs["primary_key"] = body.primary_key

        tbl = pxt.create_table(body.path, schema, **kwargs)
        col_count = len(tbl.columns())

        return MgmtResponse(
            success=True,
            message=f"Table '{body.path}' created with {col_count} column(s)",
            path=body.path,
            detail={"columns": list(schema.keys()), "row_count": 0},
        )
    except Exception as e:
        logger.error(f"create_table error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/drop_table", response_model=MgmtResponse)
@pxt_retry()
def drop_table(body: DropTableRequest):
    """Drop (delete) a Pixeltable table or view."""
    try:
        pxt.drop_table(body.path, force=body.force)
        return MgmtResponse(success=True, message=f"Table '{body.path}' dropped", path=body.path)
    except Exception as e:
        logger.error(f"drop_table error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/rename_table", response_model=MgmtResponse)
@pxt_retry()
def rename_table(body: RenameTableRequest):
    """Rename or move a table to a new path."""
    try:
        pxt.move(body.path, body.new_path)
        return MgmtResponse(
            success=True,
            message=f"Table moved: '{body.path}' → '{body.new_path}'",
            path=body.new_path,
        )
    except Exception as e:
        logger.error(f"rename_table error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/revert_table", response_model=MgmtResponse)
@pxt_retry()
def revert_table(body: RevertTableRequest):
    """Undo the last operation on a table (insert, update, delete, or schema change)."""
    try:
        tbl = pxt.get_table(body.path)
        tbl.revert()
        new_count = tbl.count()
        return MgmtResponse(
            success=True,
            message=f"Reverted last operation on '{body.path}'",
            path=body.path,
            detail={"row_count": new_count},
        )
    except Exception as e:
        logger.error(f"revert_table error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/insert_rows", response_model=MgmtResponse)
@pxt_retry()
def insert_rows(body: InsertRowsRequest):
    """Insert rows into a table."""
    try:
        tbl = pxt.get_table(body.path)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table '{body.path}' not found")

    if not body.rows:
        raise HTTPException(status_code=400, detail="No rows provided")

    try:
        status = tbl.insert(body.rows)
        return MgmtResponse(
            success=True,
            message=f"Inserted {len(body.rows)} row(s) into '{body.path}'",
            path=body.path,
            detail={
                "rows_inserted": len(body.rows),
                "errors": status.num_excs if hasattr(status, "num_excs") else 0,
            },
        )
    except Exception as e:
        logger.error(f"insert_rows error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/delete_rows", response_model=MgmtResponse)
@pxt_retry()
def delete_rows(body: DeleteRowsRequest):
    """Delete rows matching a simple equality filter.

    The ``where`` dict maps column names to values.  All conditions are ANDed.
    Example: ``{"user_id": "local_user", "role": "assistant"}``
    """
    try:
        tbl = pxt.get_table(body.path)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table '{body.path}' not found")

    if not body.where:
        raise HTTPException(status_code=400, detail="Empty where clause — refusing to delete all rows")

    try:
        col_names = set(tbl.columns())
        condition = None
        for col_name, value in body.where.items():
            if col_name not in col_names:
                raise HTTPException(status_code=400, detail=f"Column '{col_name}' not found in {body.path}")
            col_ref = getattr(tbl, col_name)
            clause = col_ref == value
            condition = clause if condition is None else (condition & clause)

        count_before = tbl.count()
        tbl.delete(where=condition)
        count_after = tbl.count()
        deleted = count_before - count_after

        return MgmtResponse(
            success=True,
            message=f"Deleted {deleted} row(s) from '{body.path}'",
            path=body.path,
            detail={"rows_deleted": deleted, "remaining": count_after},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_rows error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


# ── Column Management ─────────────────────────────────────────────────────────

@router.post("/add_column", response_model=MgmtResponse)
@pxt_retry()
def add_column(body: AddColumnRequest):
    """Add a plain (non-computed) column to an existing table."""
    try:
        tbl = pxt.get_table(body.path)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table '{body.path}' not found")

    try:
        col_type = _resolve_type(body.column_type)
        tbl.add_column(**{body.column_name: col_type})

        return MgmtResponse(
            success=True,
            message=f"Column '{body.column_name}' ({body.column_type}) added to '{body.path}'",
            path=body.path,
            detail={"column": body.column_name, "type": body.column_type},
        )
    except Exception as e:
        logger.error(f"add_column error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/add_computed_column", response_model=MgmtResponse)
@pxt_retry()
def add_computed_column(body: AddComputedColumnRequest):
    """Add a computed column to an existing table.

    The ``expression`` is a Python expression evaluated with access to:
      - ``table.col_name`` — column references
      - ``gemini``, ``openai``, ``image``, ``video``, ``string`` — Pixeltable function modules
      - ``pxt`` — the Pixeltable module itself

    Examples::

        table.col1 + table.col2
        gemini.generate_content(table.prompt, model='gemini-2.5-flash')
        image.resize(table.image, width=256, height=256)
    """
    try:
        tbl = pxt.get_table(body.path)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table '{body.path}' not found")

    try:
        ns = _build_expression_namespace(tbl)
        expr = eval(body.expression, ns)  # noqa: S307

        tbl.add_computed_column(**{body.column_name: expr}, if_exists=body.if_exists)

        return MgmtResponse(
            success=True,
            message=f"Computed column '{body.column_name}' added to '{body.path}'",
            path=body.path,
            detail={"column": body.column_name, "expression": body.expression},
        )
    except SyntaxError as e:
        raise HTTPException(status_code=400, detail=f"Invalid expression syntax: {e}")
    except NameError as e:
        raise HTTPException(status_code=400, detail=f"Unknown name in expression: {e}")
    except Exception as e:
        logger.error(f"add_computed_column error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/drop_column", response_model=MgmtResponse)
@pxt_retry()
def drop_column(body: DropColumnRequest):
    """Remove a column from a table."""
    try:
        tbl = pxt.get_table(body.path)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table '{body.path}' not found")

    try:
        tbl.drop_column(body.column_name)
        return MgmtResponse(
            success=True,
            message=f"Column '{body.column_name}' dropped from '{body.path}'",
            path=body.path,
            detail={"column": body.column_name},
        )
    except Exception as e:
        logger.error(f"drop_column error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/rename_column", response_model=MgmtResponse)
@pxt_retry()
def rename_column(body: RenameColumnRequest):
    """Rename a column in a table."""
    try:
        tbl = pxt.get_table(body.path)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table '{body.path}' not found")

    try:
        tbl.rename_column(body.old_name, body.new_name)
        return MgmtResponse(
            success=True,
            message=f"Column renamed: '{body.old_name}' → '{body.new_name}' in '{body.path}'",
            path=body.path,
            detail={"old_name": body.old_name, "new_name": body.new_name},
        )
    except Exception as e:
        logger.error(f"rename_column error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


# ── View Management ───────────────────────────────────────────────────────────

@router.post("/create_view", response_model=MgmtResponse)
@pxt_retry()
def create_view(body: CreateViewRequest):
    """Create a view of an existing table, optionally with an iterator.

    Supported ``iterator_type`` values: DocumentSplitter, FrameIterator,
    AudioSplitter, StringSplitter.

    ``iterator_args`` example for DocumentSplitter::

        {
            "document": "document",
            "separators": "page, sentence",
            "metadata": "title, heading, page"
        }

    Column-reference args (e.g. "document") are resolved against the base table.
    """
    try:
        base_tbl = pxt.get_table(body.base_table)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Base table '{body.base_table}' not found")

    try:
        kwargs: dict = {"if_exists": "error"}

        if body.iterator_type:
            if not body.iterator_args:
                raise HTTPException(
                    status_code=400,
                    detail="iterator_args required when iterator_type is specified",
                )
            iterator = _resolve_iterator(body.iterator_type, body.iterator_args, base_tbl)
            kwargs["iterator"] = iterator

        view = pxt.create_view(body.path, base_tbl, **kwargs)
        col_count = len(view.columns())

        return MgmtResponse(
            success=True,
            message=f"View '{body.path}' created on '{body.base_table}'",
            path=body.path,
            detail={
                "base_table": body.base_table,
                "iterator_type": body.iterator_type,
                "columns": col_count,
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_view error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


# ── Embedding Index Management ────────────────────────────────────────────────

@router.post("/add_embedding_index", response_model=MgmtResponse)
@pxt_retry()
def add_embedding_index(body: AddEmbeddingIndexRequest):
    """Add an embedding index to a column for similarity search.

    ``embedding_function``: use ``"gemini"`` for text or ``"clip"`` for images.
    ``metric``: ``"cosine"`` (default) or ``"ip"`` (inner product).
    """
    try:
        tbl = pxt.get_table(body.path)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table '{body.path}' not found")

    col_names = tbl.columns()
    if body.column not in col_names:
        raise HTTPException(status_code=400, detail=f"Column '{body.column}' not in {body.path}")

    try:
        embed_fn = _resolve_embedding_function(body.embedding_function)

        idx_kwargs: dict = {"column": body.column, "if_exists": "ignore", "metric": body.metric}
        # Gemini embeds text (string_embed), CLIP embeds images (image_embed)
        key = body.embedding_function.lower().strip()
        if key == "clip":
            idx_kwargs["image_embed"] = embed_fn
        else:
            idx_kwargs["string_embed"] = embed_fn

        tbl.add_embedding_index(**idx_kwargs)

        return MgmtResponse(
            success=True,
            message=f"Embedding index added on '{body.column}' in '{body.path}'",
            path=body.path,
            detail={
                "column": body.column,
                "embedding": body.embedding_function,
                "metric": body.metric,
            },
        )
    except Exception as e:
        logger.error(f"add_embedding_index error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/drop_embedding_index", response_model=MgmtResponse)
@pxt_retry()
def drop_embedding_index(body: DropEmbeddingIndexRequest):
    """Remove an embedding index from a column."""
    try:
        tbl = pxt.get_table(body.path)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table '{body.path}' not found")

    try:
        tbl.drop_embedding_index(column=body.column)
        return MgmtResponse(
            success=True,
            message=f"Embedding index dropped from '{body.column}' in '{body.path}'",
            path=body.path,
            detail={"column": body.column},
        )
    except Exception as e:
        logger.error(f"drop_embedding_index error: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


# ── Version History ───────────────────────────────────────────────────────────

@router.get("/table/{path:path}/versions")
@pxt_retry()
def get_table_versions(path: str, limit: int = 20):
    """Get the version history for a specific table."""
    try:
        tbl = pxt.get_table(path)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table '{path}' not found")

    try:
        raw_versions = tbl.get_versions()
        versions = []
        for v in raw_versions[:limit]:
            versions.append({
                "version": v["version"],
                "created_at": v["created_at"].isoformat() if v.get("created_at") else None,
                "change_type": v.get("change_type"),
                "inserts": v.get("inserts", 0),
                "updates": v.get("updates", 0),
                "deletes": v.get("deletes", 0),
                "errors": v.get("errors", 0),
                "schema_change": v.get("schema_change"),
            })

        return {
            "path": path,
            "current_version": versions[0]["version"] if versions else 0,
            "can_revert": len(versions) > 1,
            "versions": versions,
        }
    except Exception as e:
        logger.error(f"get_versions error for {path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Discovery ─────────────────────────────────────────────────────────────────

@router.get("/types")
def list_available_types():
    """List all Pixeltable column types available for schema definitions."""
    types = [
        {"name": "String", "key": "string", "description": "Text data"},
        {"name": "Int", "key": "int", "description": "Integer numbers"},
        {"name": "Float", "key": "float", "description": "Floating-point numbers"},
        {"name": "Bool", "key": "bool", "description": "True/False values"},
        {"name": "Timestamp", "key": "timestamp", "description": "Date and time"},
        {"name": "Json", "key": "json", "description": "Arbitrary JSON data"},
        {"name": "Image", "key": "image", "description": "Image files (PIL)"},
        {"name": "Video", "key": "video", "description": "Video files"},
        {"name": "Audio", "key": "audio", "description": "Audio files"},
        {"name": "Document", "key": "document", "description": "Document files (PDF, etc.)"},
        {"name": "Array[T]", "key": "array", "description": "Typed arrays, e.g. Array[Float]"},
    ]
    return {"types": types}


@router.get("/functions")
def list_available_functions():
    """List Pixeltable functions available for computed column expressions."""
    functions = [
        {
            "category": "gemini",
            "functions": [
                {"name": "gemini.generate_content", "description": "Generate text with Gemini", "example": "gemini.generate_content(table.prompt, model='gemini-2.5-flash')"},
                {"name": "gemini.generate_embedding", "description": "Generate text embedding", "example": "gemini.generate_embedding(table.text, model='gemini-embedding-001')"},
                {"name": "gemini.generate_images", "description": "Generate images with Imagen", "example": "gemini.generate_images(table.prompt)"},
                {"name": "gemini.generate_videos", "description": "Generate videos with Veo", "example": "gemini.generate_videos(table.prompt)"},
            ],
        },
        {
            "category": "openai",
            "functions": [
                {"name": "openai.chat_completions", "description": "OpenAI chat completion", "example": "openai.chat_completions(messages=table.messages, model='gpt-4o')"},
                {"name": "openai.transcriptions", "description": "Whisper transcription", "example": "openai.transcriptions(table.audio, model='whisper-1')"},
                {"name": "openai.speech", "description": "Text-to-speech", "example": "openai.speech(table.text, model='tts-1')"},
            ],
        },
        {
            "category": "image",
            "functions": [
                {"name": "image.resize", "description": "Resize an image", "example": "image.resize(table.image, width=256, height=256)"},
                {"name": "image.b64_encode", "description": "Base64-encode an image", "example": "image.b64_encode(table.image)"},
            ],
        },
        {
            "category": "video",
            "functions": [
                {"name": "video.extract_audio", "description": "Extract audio track from video", "example": "video.extract_audio(table.video, format='mp3')"},
                {"name": "video.get_metadata", "description": "Get video metadata", "example": "video.get_metadata(table.video)"},
                {"name": "video.extract_frame", "description": "Extract a single frame", "example": "video.extract_frame(table.video, timestamp=1.0)"},
            ],
        },
        {
            "category": "string",
            "functions": [
                {"name": "string.format", "description": "Format a string template", "example": "string.format('{} - {}', table.title, table.author)"},
            ],
        },
        {
            "category": "custom_udf",
            "functions": [
                {"name": n, "description": "Custom UDF", "example": ""}
                for n in sorted(_CUSTOM_UDFS)
            ],
        },
    ]

    iterators = [
        {
            "name": "DocumentSplitter",
            "description": "Split documents into pages/sentences",
            "column_arg": "document",
            "example_args": {"document": "document", "separators": "page, sentence", "metadata": "title, heading, page"},
        },
        {
            "name": "FrameIterator",
            "description": "Extract video frames",
            "column_arg": "video",
            "example_args": {"video": "video", "keyframes_only": True},
        },
        {
            "name": "AudioSplitter",
            "description": "Split audio into chunks",
            "column_arg": "audio",
            "example_args": {"audio": "audio", "duration": 30},
        },
        {
            "name": "StringSplitter",
            "description": "Split text into segments",
            "column_arg": "text",
            "example_args": {"text": "transcript", "separators": "sentence"},
        },
    ]

    embedding_functions = [
        {"name": "gemini", "description": "Gemini text embedding (gemini-embedding-001)", "modality": "text"},
        {"name": "clip", "description": "CLIP visual embedding (openai/clip-vit-base-patch32)", "modality": "image"},
    ]

    return {
        "functions": functions,
        "iterators": iterators,
        "embedding_functions": embedding_functions,
    }
