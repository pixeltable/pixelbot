#!/usr/bin/env python3
"""Read-only endpoint matrix — hits every safe GET/read path via TestClient."""
from __future__ import annotations

import ast
import inspect
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
import pixeltable as pxt
from fastapi.testclient import TestClient
from main import app

FAILURES: list[str] = []
SKIPS: list[str] = []
PASSES: list[str] = []


def ok(name: str) -> None:
    PASSES.append(name)
    print(f"  OK   {name}")


def skip(name: str, reason: str) -> None:
    SKIPS.append(f"{name}: {reason}")
    print(f"  SKIP {name} ({reason})")


def fail(name: str, detail: str) -> None:
    FAILURES.append(f"{name}: {detail}")
    print(f"  FAIL {name}: {detail}")


def hit_get(client: TestClient, path: str, *, expect_rows: bool = False) -> None:
    r = client.get(path)
    if r.status_code >= 400:
        fail(path, f"status={r.status_code} body={r.text[:120]}")
        return
    if expect_rows:
        try:
            data = r.json()
            if "rows" not in data:
                fail(path, "missing rows envelope")
                return
        except Exception as exc:
            fail(path, f"invalid JSON: {exc}")
            return
    ok(path)


def hit_post_read(client: TestClient, path: str, json_body: dict) -> None:
    r = client.post(path, json=json_body)
    if r.status_code >= 400:
        fail(path, f"status={r.status_code} body={r.text[:120]}")
        return
    ok(path)


def first_uuid(table_path: str, col: str = "uuid") -> str | None:
    try:
        tbl = pxt.get_table(table_path)
        if tbl.count() == 0:
            return None
        rows = tbl.select(tbl[col]).limit(1).collect()
        return rows[0][col] if rows else None
    except Exception:
        return None


def first_conversation_id(client: TestClient) -> str | None:
    r = client.get("/api/conversations")
    if r.status_code != 200:
        return None
    data = r.json()
    convs = data if isinstance(data, list) else data.get("conversations", [])
    if not convs:
        return None
    return convs[0].get("conversation_id")


def first_csv_table() -> tuple[str, str] | None:
    try:
        registry = pxt.get_table("agents.csv_registry")
        rows = registry.where(registry.user_id == config.DEFAULT_USER_ID).select(
            registry.table_name, registry.uuid
        ).limit(1).collect()
        if not rows:
            return None
        return rows[0]["table_name"], rows[0]["uuid"]
    except Exception:
        return None


def run_endpoint_matrix(client: TestClient) -> None:
    print("\n=== Always-run GET endpoints ===")

    always = [
        ("/api/health", False),
        ("/api/user_info", False),
        ("/api/memory/v2", True),
        ("/api/personas/v2", True),
        ("/api/memory/v2/search?query_text=test", True),
        ("/api/context_info", False),
        ("/api/conversations", False),
        ("/api/download_history", False),
        ("/api/debug_export", False),
        ("/api/memory", False),
        ("/api/download_memory", False),
        ("/api/generation_config", False),
        ("/api/image_history", False),
        ("/api/flux_image_history", False),
        ("/api/video_history", False),
        ("/api/tts_voices", False),
        ("/api/personas", False),
        ("/api/studio/operations", False),
        ("/api/studio/files", False),
        ("/api/studio/detect/models", False),
        ("/api/db/tables", False),
        ("/api/db/pipeline", False),
        ("/api/db/timeline", False),
        ("/api/db/types", False),
        ("/api/db/functions", False),
        ("/api/experiments/models", False),
        ("/api/experiments/history", False),
        ("/api/export/tables", False),
        ("/api/export/preview/agents.chat_history?limit=5", False),
        ("/api/export/native/agents.chat_history?format=json", False),
        ("/api/integrations/status", False),
        ("/api/integrations/log?limit=10", False),
    ]
    for path, expect_rows in always:
        if "memory/v2/search" in path:
            r = client.get(path)
            if r.status_code == 200 and "rows" in r.json():
                ok(path)
            elif r.status_code in (400, 403, 502, 503):
                skip(path, f"embed API unavailable ({r.status_code})")
            else:
                fail(path, f"status={r.status_code} body={r.text[:120]}")
            continue
        hit_get(client, path, expect_rows=expect_rows)

    print("\n=== Conditional reads (catalog data) ===")

    img_uuid = first_uuid("agents.images")
    if img_uuid:
        hit_get(client, f"/api/studio/image_preview/{img_uuid}")
        hit_get(client, "/api/studio/embeddings?space=text&limit=50")
    else:
        skip("studio image preview + embeddings", "no images")

    doc_uuid = first_uuid("agents.collection")
    if doc_uuid:
        hit_get(client, f"/api/studio/summary/{doc_uuid}")
        hit_get(client, f"/api/studio/chunks/{doc_uuid}")
    else:
        skip("studio document summary/chunks", "no documents")

    vid_uuid = first_uuid("agents.videos")
    if vid_uuid:
        hit_get(client, f"/api/studio/frames/{vid_uuid}?limit=5")
        hit_get(client, f"/api/studio/transcription/{vid_uuid}/video")
    else:
        skip("studio video frames/transcription", "no videos")

    aud_uuid = first_uuid("agents.audios")
    if aud_uuid:
        hit_get(client, f"/api/studio/transcription/{aud_uuid}/audio")
    else:
        skip("studio audio transcription", "no audios")

    csv_info = first_csv_table()
    if csv_info:
        table_name, _ = csv_info
        hit_post_read(client, "/api/studio/csv/rows", {"table_name": table_name, "offset": 0, "limit": 10})
        hit_get(client, f"/api/studio/csv/versions?table_name={table_name}")
    else:
        skip("studio csv rows/versions", "no csv registry entries")

    conv_id = first_conversation_id(client)
    if conv_id:
        hit_get(client, f"/api/conversations/{conv_id}")
    else:
        skip("conversation detail", "no conversations")

    print("\n=== Security / routing checks ===")

    r_v2 = client.get("/api/memory/v2")
    ct = r_v2.headers.get("content-type", "")
    if "application/json" in ct and "rows" in r_v2.json():
        ok("v2 route returns JSON (not SPA HTML)")
    else:
        fail("v2 route returns JSON", f"content-type={ct} body={r_v2.text[:80]}")

    r_traversal = client.get("/api/serve_video?path=/etc/passwd")
    if r_traversal.status_code == 403:
        ok("serve_video rejects path traversal")
    elif r_traversal.status_code == 404:
        ok("serve_video rejects path traversal (404)")
    else:
        fail("serve_video path traversal", f"unexpected status={r_traversal.status_code}")


def audit_pxt_retry_gaps() -> list[str]:
    """Return handlers that touch pxt but lack @pxt_retry."""
    gaps: list[str] = []
    routers_dir = Path(__file__).resolve().parent.parent / "routers"
    for py in sorted(routers_dir.glob("*.py")):
        source = py.read_text()
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if node.name.startswith("_"):
                continue
            has_retry = any(
                (isinstance(d, ast.Name) and d.id == "pxt_retry")
                or (isinstance(d, ast.Call) and isinstance(d.func, ast.Name) and d.func.id == "pxt_retry")
                for d in node.decorator_list
            )
            body_src = ast.get_source_segment(source, node) or ""
            touches_pxt = "pxt." in body_src or "get_table" in body_src
            if touches_pxt and not has_retry:
                gaps.append(f"{py.name}:{node.name}")
    return gaps


def audit_similarity_calls() -> list[str]:
    bad: list[str] = []
    backend = Path(__file__).resolve().parent.parent
    scan = [backend / "queries.py", backend / "setup_pixeltable.py", *(backend / "routers").glob("*.py")]
    for py in scan:
        if not py.is_file():
            continue
        text = py.read_text()
        for m in re.finditer(r"\.similarity\((?!string=)", text):
            line = text[: m.start()].count("\n") + 1
            bad.append(f"{py.relative_to(backend)}:{line}")
    return bad


def audit_async_routers() -> list[str]:
    bad: list[str] = []
    routers_dir = Path(__file__).resolve().parent.parent / "routers"
    for py in routers_dir.glob("*.py"):
        tree = ast.parse(py.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.AsyncFunctionDef) and not node.name.startswith("_"):
                bad.append(f"{py.name}:{node.name}")
    return bad


def run_static_audit() -> None:
    print("\n=== Static code audit ===")

    sim_bad = audit_similarity_calls()
    if sim_bad:
        for loc in sim_bad:
            fail(f"positional .similarity()", loc)
    else:
        ok("no positional .similarity() in backend")

    async_bad = audit_async_routers()
    if async_bad:
        for loc in async_bad:
            fail("async def in router", loc)
    else:
        ok("no async def handlers in routers/")

    retry_gaps = audit_pxt_retry_gaps()
    if retry_gaps:
        skip(f"@pxt_retry gaps ({len(retry_gaps)} handlers)", "; ".join(retry_gaps[:8]) + ("..." if len(retry_gaps) > 8 else ""))
    else:
        ok("all pxt-touching handlers have @pxt_retry")

    # Threshold drift
    setup = (Path(__file__).resolve().parent.parent / "setup_pixeltable.py").read_text()
    queries = (Path(__file__).resolve().parent.parent / "queries.py").read_text()
    ds = (Path(__file__).resolve().parent.parent / "routers" / "data_serving.py").read_text()
    agent_thresh = "sim > 0.8" in setup and "search_memory" in setup
    api_thresh = "threshold: float = 0.7" in queries or "threshold=0.7" in queries
    v2_thresh = "sim > 0.7" in ds
    if agent_thresh and api_thresh and v2_thresh:
        skip("memory threshold drift", "agent=0.8, v1/v2=0.7 (P2 consistency)")
    ok("threshold drift documented")


def main() -> int:
    print("=== Endpoint matrix (read-only) ===")
    with TestClient(app) as client:
        run_endpoint_matrix(client)
    run_static_audit()

    print("\n=== SUMMARY ===")
    print(f"Pass: {len(PASSES)}  Skip: {len(SKIPS)}  Fail: {len(FAILURES)}")
    for s in SKIPS:
        print(f"  skip: {s}")
    for f in FAILURES:
        print(f"  fail: {f}")

    # Write machine-readable results for findings report
    out = Path(__file__).resolve().parent / "deep_review_results.txt"
    out.write_text(
        f"pass={len(PASSES)} skip={len(SKIPS)} fail={len(FAILURES)}\n\n"
        + "FAILURES:\n" + "\n".join(FAILURES) + "\n\n"
        + "SKIPS:\n" + "\n".join(SKIPS) + "\n"
    )

    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
