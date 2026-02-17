# routers/export.py - Data export for any Pixeltable table
import csv
import io
import json
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
import pixeltable as pxt

from utils import pxt_retry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/export", tags=["export"])


def _safe_value(v: object) -> object:
    """Convert non-JSON-serializable values for export."""
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, bytes):
        return f"<binary {len(v)} bytes>"
    if isinstance(v, dict):
        return {k: _safe_value(val) for k, val in v.items()}
    if isinstance(v, (list, tuple)):
        return [_safe_value(item) for item in v]
    return str(v)


def _collect_rows(table_path: str, limit: int, columns: list[str] | None) -> tuple[list[str], list[dict]]:
    """Collect rows from a Pixeltable table, returning (column_names, rows)."""
    try:
        tbl = pxt.get_table(table_path)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Table not found: {table_path}")

    col_names = columns if columns else tbl.columns()

    # Build select expression
    select_args = {}
    for col in col_names:
        try:
            select_args[col] = getattr(tbl, col)
        except Exception:
            continue

    if not select_args:
        raise HTTPException(status_code=400, detail="No valid columns found")

    rows = list(tbl.select(**select_args).limit(limit).collect())
    safe_rows = [{k: _safe_value(v) for k, v in row.items()} for row in rows]
    return list(select_args.keys()), safe_rows


# ── List exportable tables ───────────────────────────────────────────────────

@router.get("/tables")
@pxt_retry()
def list_exportable_tables():
    """Return all tables with their column info for the export picker."""
    try:
        tables_raw = pxt.list_tables("agents", recursive=True)
        result = []
        for path in tables_raw:
            try:
                tbl = pxt.get_table(path)
                col_names = tbl.columns()
                row_count = tbl.count()
                result.append({
                    "path": path,
                    "columns": col_names,
                    "row_count": row_count,
                })
            except Exception:
                result.append({"path": path, "columns": [], "row_count": 0})
        return {"tables": result}
    except Exception as e:
        logger.error(f"Failed to list tables: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Export as JSON ───────────────────────────────────────────────────────────

@router.get("/json/{table_path:path}")
@pxt_retry()
def export_json(
    table_path: str,
    limit: int = Query(default=1000, le=50000),
    columns: str | None = Query(default=None, description="Comma-separated column names"),
):
    """Export a table as a downloadable JSON file."""
    col_list = [c.strip() for c in columns.split(",")] if columns else None
    col_names, rows = _collect_rows(table_path, limit, col_list)

    json_bytes = json.dumps(rows, indent=2, ensure_ascii=False).encode("utf-8")
    filename = table_path.replace(".", "_") + ".json"

    return StreamingResponse(
        io.BytesIO(json_bytes),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Export as CSV ────────────────────────────────────────────────────────────

@router.get("/csv/{table_path:path}")
@pxt_retry()
def export_csv(
    table_path: str,
    limit: int = Query(default=1000, le=50000),
    columns: str | None = Query(default=None, description="Comma-separated column names"),
):
    """Export a table as a downloadable CSV file."""
    col_list = [c.strip() for c in columns.split(",")] if columns else None
    col_names, rows = _collect_rows(table_path, limit, col_list)

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=col_names, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        flat = {}
        for k, v in row.items():
            if isinstance(v, (dict, list)):
                flat[k] = json.dumps(v, default=str)
            else:
                flat[k] = v
        writer.writerow(flat)

    csv_bytes = output.getvalue().encode("utf-8")
    filename = table_path.replace(".", "_") + ".csv"

    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Export as Parquet ────────────────────────────────────────────────────────

@router.get("/parquet/{table_path:path}")
@pxt_retry()
def export_parquet(
    table_path: str,
    limit: int = Query(default=1000, le=50000),
    columns: str | None = Query(default=None, description="Comma-separated column names"),
):
    """Export a table as a downloadable Parquet file."""
    try:
        import pandas as pd
    except ImportError:
        raise HTTPException(status_code=501, detail="pandas is required for Parquet export")

    col_list = [c.strip() for c in columns.split(",")] if columns else None
    col_names, rows = _collect_rows(table_path, limit, col_list)

    df = pd.DataFrame(rows)

    # Flatten complex columns to JSON strings for Parquet compatibility
    for col in df.columns:
        if df[col].apply(lambda x: isinstance(x, (dict, list))).any():
            df[col] = df[col].apply(lambda x: json.dumps(x, default=str) if isinstance(x, (dict, list)) else x)

    buf = io.BytesIO()
    df.to_parquet(buf, index=False)
    buf.seek(0)

    filename = table_path.replace(".", "_") + ".parquet"

    return StreamingResponse(
        buf,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Preview (first N rows as JSON for the UI) ───────────────────────────────

@router.get("/preview/{table_path:path}")
@pxt_retry()
def preview_table(
    table_path: str,
    limit: int = Query(default=5, le=50),
    columns: str | None = Query(default=None),
):
    """Return a small preview of a table for the export UI."""
    col_list = [c.strip() for c in columns.split(",")] if columns else None
    col_names, rows = _collect_rows(table_path, limit, col_list)
    return {"columns": col_names, "rows": rows, "count": len(rows)}
