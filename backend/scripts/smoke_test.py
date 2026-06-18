#!/usr/bin/env python3
"""Post-upgrade A–Z smoke test — run from backend/ after setup_pixeltable.py."""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import setup_pixeltable

FAILURES: list[str] = []
SKIPS: list[str] = []


def ok(msg: str) -> None:
    print(f"  OK   {msg}")


def skip(msg: str) -> None:
    SKIPS.append(msg)
    print(f"  SKIP {msg}")


def fail(msg: str) -> None:
    FAILURES.append(msg)
    print(f"  FAIL {msg}")


def check(name: str, cond: bool, detail: str = "") -> bool:
    if cond:
        ok(name)
        return True
    fail(f"{name}: {detail}" if detail else name)
    return False


def main() -> int:
    print("=== Pixelbot 0.6.5 smoke test ===\n")

    # 1. Dependencies
    print("1. Dependencies")
    import pixeltable as pxt

    check("pixeltable >= 0.6.5", pxt.__version__ >= "0.6.5", pxt.__version__)

    # 2. Idempotent schema init
    print("\n2. Schema init (idempotent x2)")
    try:
        setup_pixeltable.init_schema(force_reset=False)
        setup_pixeltable.init_schema(force_reset=False)
        ok("init_schema idempotent")
    except Exception as exc:
        fail(f"init_schema: {exc}")

    # 3. Expected tables
    print("\n3. Catalog tables")
    expected = [
        "agents/collection",
        "agents/chunks",
        "agents/images",
        "agents/videos",
        "agents/video_frames",
        "agents/video_transcript_sentences",
        "agents/audios",
        "agents/audio_transcript_sentences",
        "agents/memory_bank",
        "agents/chat_history",
        "agents/user_personas",
        "agents/tools",
        "agents/captioner",
    ]
    tables = set(pxt.list_tables("agents", recursive=True))
    check("table count >= 20", len(tables) >= 20, str(len(tables)))
    for path in expected:
        dot = path.replace("/", ".")
        check(f"table {dot}", path in tables, "missing")

    # 4. Embedding indexes
    print("\n4. Embedding indexes")
    for path in ("agents.chunks", "agents.images", "agents.memory_bank", "agents.video_frames"):
        tbl = pxt.get_table(path)
        indices = tbl.get_metadata().get("indices") or []
        check(f"{path} has embedding index", len(indices) > 0, str(indices))

    # 5. Agent pipeline columns
    print("\n5. Agent pipeline (agents.tools)")
    tools = pxt.get_table("agents.tools")
    for col in ("prompt", "user_id", "initial_response", "tool_output", "answer", "follow_up_text"):
        check(f"agents.tools.{col}", col in tools.columns())

    # 6. Transcription schema (typed OpenAI return → .text accessor)
    print("\n6. Transcription pipeline schema")
    vac = pxt.get_table("agents.video_audio_chunks")
    check("video_audio_chunks.transcription", "transcription" in vac.columns())
    vts = pxt.get_table("agents.video_transcript_sentences")
    check("video_transcript_sentences.text", "text" in vts.columns())
    ac = pxt.get_table("agents.audio_chunks")
    check("audio_chunks.transcription", "transcription" in ac.columns())

    # 7. Similarity API (requires API key for Gemini indexes)
    print("\n7. Similarity search")
    has_gemini = bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))
    chunks = pxt.get_table("agents.chunks")
    if not has_gemini:
        skip("Gemini similarity (no GEMINI_API_KEY / GOOGLE_API_KEY)")
    elif chunks.count() == 0:
        skip("Gemini similarity (no chunk rows)")
    else:
        try:
            sim = chunks.text.similarity(string="test query")
            chunks.order_by(sim, asc=False).limit(1).select(chunks.text, sim=sim).collect()
            ok("Gemini similarity(string=) query")
        except Exception as exc:
            fail(f"Gemini similarity query: {exc}")

    images = pxt.get_table("agents.images")
    if images.count() == 0:
        skip("CLIP similarity (no image rows)")
    else:
        try:
            sim = images.image.similarity(string="test")
            images.order_by(sim, asc=False).limit(1).select(images.image, sim=sim).collect()
            ok("CLIP similarity(string=) query")
        except Exception as exc:
            fail(f"CLIP similarity query: {exc}")

    # 8. Router imports
    print("\n8. Router imports")
    for mod in (
        "chat",
        "files",
        "history",
        "memory",
        "images",
        "personas",
        "studio",
        "database",
        "experiments",
        "export",
        "integrations",
        "data_serving",
    ):
        try:
            __import__(f"routers.{mod}")
            ok(f"routers.{mod}")
        except Exception as exc:
            fail(f"routers.{mod}: {exc}")

    # 9. FastAPI endpoints
    print("\n9. HTTP endpoints")
    from fastapi.testclient import TestClient
    from main import app

    endpoint_checks = [
        ("GET", "/api/health", None),
        ("GET", "/api/user_info", None),
        ("GET", "/api/memory/v2", "rows"),
        ("GET", "/api/personas/v2", "rows"),
        ("GET", "/api/context_info", None),
        ("GET", "/api/db/tables", None),
        ("GET", "/api/export/tables", None),
        ("GET", "/api/export/native/agents.chat_history?format=json", None),
        ("GET", "/api/experiments/models", None),
        ("GET", "/api/integrations/status", None),
        ("GET", "/api/db/functions", None),
        ("GET", "/api/db/types", None),
    ]
    with TestClient(app) as client:
        for method, path, envelope_key in endpoint_checks:
            try:
                r = client.request(method, path)
                if r.status_code >= 400:
                    fail(f"{method} {path} -> {r.status_code}: {r.text[:100]}")
                    continue
                if envelope_key and envelope_key not in r.json():
                    fail(f"{method} {path} -> missing '{envelope_key}' envelope")
                    continue
                ok(f"{method} {path} -> {r.status_code}")
            except Exception as exc:
                fail(f"{method} {path}: {exc}")

        # SPA must not shadow API routes
        r_spa = client.get("/")
        r_v2 = client.get("/api/memory/v2")
        if "text/html" in r_v2.headers.get("content-type", "") and "rows" not in r_v2.text:
            fail("SPA catch-all shadows /api/memory/v2")
        else:
            ok("v2 routes not shadowed by SPA catch-all")

    # 10. Static code patterns (0.6.5 pitfalls)
    print("\n10. Code pattern audit")
    backend = Path(__file__).resolve().parent.parent
    scan_paths = [
        backend / "queries.py",
        backend / "setup_pixeltable.py",
        backend / "functions.py",
        * (backend / "routers").glob("*.py"),
    ]
    bad_similarity = []
    import re

    for py in scan_paths:
        if not py.is_file():
            continue
        text = py.read_text()
        for m in re.finditer(r"\.similarity\((?!string=)", text):
            line = text[: m.start()].count("\n") + 1
            bad_similarity.append(f"{py.relative_to(backend)}:{line}")
    if bad_similarity:
        for loc in bad_similarity[:5]:
            fail(f"positional .similarity() at {loc}")
    else:
        ok("no positional .similarity() calls")

    # Summary
    print("\n=== SUMMARY ===")
    print(f"Passed checks above")
    print(f"Skipped: {len(SKIPS)}")
    for s in SKIPS:
        print(f"  - {s}")
    print(f"Failures: {len(FAILURES)}")
    for f in FAILURES:
        print(f"  - {f}")

    if FAILURES:
        print("\nRESULT: FAIL")
        return 1
    print("\nRESULT: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
