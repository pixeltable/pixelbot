<div align="center">

**Open-source sandbox for exploring everything [Pixeltable](https://github.com/pixeltable/pixeltable) can do**

[![License](https://img.shields.io/badge/License-Apache%202.0-0530AD.svg)](https://opensource.org/licenses/Apache-2.0) [![Discord](https://img.shields.io/badge/Discord-%235865F2.svg)](https://discord.gg/QPyqFYx2UN)

[Pixeltable Docs](https://docs.pixeltable.com/) · [Cookbooks](https://docs.pixeltable.com/howto/cookbooks) · [Use Cases](https://docs.pixeltable.com/use-cases/ml-data-wrangling)

</div>

---

Pixelbot is a vibe-coded playground that wires up tables, views, computed columns, embedding indexes, UDFs, tool calling, similarity search, version control, and model orchestration into a single app — so we can stress-test Pixeltable's declarative AI data infrastructure and ship what we learn as [cookbooks](https://docs.pixeltable.com/howto/cookbooks) and [use-case guides](https://docs.pixeltable.com/use-cases/ai-applications).

![Overview](docs/images/overview.png)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  React / TypeScript / Tailwind CSS                                                  │
│                                                                                     │
│  ┌─────────┐ ┌───────────┐ ┌────────┐ ┌───────┐ ┌──────────┐ ┌─────┐ ┌─────────┐  │
│  │  Chat   │ │ Prompt Lab│ │ Studio │ │ Media │ │ Database │ │ Dev │ │  Arch   │  │
│  │         │ │           │ │        │ │Library│ │ Explorer │ │     │ │ Diagram │  │
│  └────┬────┘ └─────┬─────┘ └───┬────┘ └───┬───┘ └────┬─────┘ └──┬──┘ └─────────┘  │
│       │             │           │          │          │          │                   │
├───────┴─────────────┴───────────┴──────────┴──────────┴──────────┴───────────────────┤
│  FastAPI  /api/*                                                                    │
│                                                                                     │
│  chat.py → 11-step agent pipeline      images.py → Imagen/DALL-E/Veo generation    │
│  files.py → upload, URL import         studio.py → transforms, detection, CSV, Reve │
│  experiments.py → parallel LLM calls   database.py → catalog introspection          │
│  export.py → JSON/CSV/Parquet          history.py, memory.py, personas.py           │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  Pixeltable  (~/.pixeltable/)                                                       │
│                                                                                     │
│  agents.tools ──────────── 11 computed cols (tool select → RAG → answer → follow-up)│
│  agents.chunks ─────────── DocumentSplitter + E5-large embedding index              │
│  agents.images ─────────── CLIP embedding + 96×96 thumbnail (computed)              │
│  agents.video_frames ───── FrameIterator + CLIP embedding index                     │
│  agents.audio_sentences ── AudioSplitter + E5-large embedding index                 │
│  agents.memory ─────────── E5-large embedding index for semantic recall             │
│  agents.generated_images ─ Imagen 4.0 / DALL-E 3 outputs                           │
│  agents.generated_videos ─ Veo 3.0 outputs                                         │
│  agents.prompt_experiments  multi-model comparison results                          │
│  agents.csv_registry ───── dynamic CSV table tracking                               │
│  + views, snapshots, user-uploaded CSV tables                                       │
│                                                                                     │
│  Storage │ Versioning │ Computed Columns │ Embedding Indexes │ UDFs │ @pxt.query    │
└─────────────────────────────────────────────────────────────────────────────────────┘
     │              │                │                │
     ▼              ▼                ▼                ▼
  ┌──────┐   ┌───────────┐   ┌────────────┐   ┌──────────────┐
  │Claude│   │  Gemini   │   │   OpenAI   │   │   Mistral    │
  │Sonnet│   │2.5 Flash  │   │  Whisper   │   │ Small/Large  │
  │  4   │   │Imagen/Veo │   │  DALL-E 3  │   │              │
  └──────┘   └───────────┘   └────────────┘   └──────────────┘
  reasoning   summarization    transcription    prompt lab
  tool calls  image/video gen  image gen        experiments
              follow-ups       embeddings
```

## Features

| Page | What it does |
|---|---|
| **Chat** | Multimodal RAG agent — semantic search across docs, images, video frames, audio; tool calling (NewsAPI, yfinance, DuckDuckGo); inline image gen (Imagen 4.0 / DALL-E 3) and video gen (Veo 3.0); follow-up suggestions via Gemini structured output; personas; persistent history + memory bank |
| **Prompt Lab** | Side-by-side multi-model comparison — Claude, Gemini, Mistral, GPT-4o with editable model IDs, parallel execution via `ThreadPoolExecutor`, response time / word count / char count metrics, normalized comparison bars, experiment history stored in Pixeltable |
| **Studio** | File explorer + data wrangler — document summaries and chunks, PIL image transforms, video ops (keyframes, clips, overlay, scene detect), audio transcriptions, CSV workspace with inline CRUD + infinite undo (`table.revert()`) + version history (`table.get_versions()`), on-demand DETR object detection and ViT classification with SVG overlays, cross-modal semantic search, interactive 2D UMAP embedding map |
| **Media Library** | Gallery for generated images/videos — save to collection (triggers CLIP + RAG indexing), Reve AI edit (`reve.edit()`) and remix (`reve.remix()`) with side-by-side preview |
| **Database** | Catalog explorer — tables/views grouped by type with schema inspection, paginated rows, client-side search + filter, CSV download |
| **Developer** | Data export (JSON/CSV/Parquet for any table), categorized API reference with curl examples, Python SDK snippets, MCP server config for Claude/Cursor |
| **Architecture** | Interactive React Flow diagram — 38 nodes, 40 edges, swim-lane layout, click-to-highlight connections |
| **History & Memory** | Searchable conversation history, unified timeline across all tables, memory bank with semantic search |

## Pixeltable Coverage

Every row maps to a Pixeltable feature exercised in this app:

| Feature | Usage | Docs |
|---|---|---|
| Tables + multimodal types | `Document`, `Image`, `Video`, `Audio`, `Json` columns | [Tables](https://docs.pixeltable.com/tutorials/tables-and-data-operations) |
| Computed columns | 11-step agent pipeline, thumbnails, audio extraction, summarization | [Computed Columns](https://docs.pixeltable.com/tutorials/computed-columns) |
| Views + iterators | `DocumentSplitter`, `FrameIterator`, `AudioSplitter`, `StringSplitter` | [Iterators](https://docs.pixeltable.com/platform/iterators) |
| Embedding indexes | E5-large-instruct (text), CLIP ViT-B/32 (visual) → `.similarity()` | [Embedding Indexes](https://docs.pixeltable.com/platform/embedding-indexes) |
| `@pxt.udf` | News API, financial data, context assembly, text extraction | [UDFs](https://docs.pixeltable.com/platform/udfs-in-pixeltable) |
| `@pxt.query` | `search_documents`, `search_images`, `search_video_frames`, `search_memory` | [RAG](https://docs.pixeltable.com/howto/cookbooks/agents/pattern-rag-pipeline) |
| `pxt.tools()` + `invoke_tools()` | Agent tool selection + execution (Claude Sonnet 4) | [Tool Calling](https://docs.pixeltable.com/howto/cookbooks/agents/llm-tool-calling) |
| Agent memory | Chat history + memory bank with embedding search | [Memory](https://docs.pixeltable.com/howto/cookbooks/agents/pattern-agent-memory) |
| LLM integrations | Anthropic, Google, OpenAI, Mistral — agent + Prompt Lab | [Integrations](https://docs.pixeltable.com/integrations/frameworks) |
| Reve AI | `reve.edit()` / `reve.remix()` for image editing | [Reve](https://docs.pixeltable.com/howto/providers/working-with-reve) |
| PIL transforms | Resize, rotate, flip, blur, sharpen, edge detect, grayscale | [PIL](https://docs.pixeltable.com/howto/cookbooks/images/img-pil-transforms) |
| Video UDFs | `get_metadata`, `extract_frame`, `clip`, `overlay_text`, `scene_detect_content` | [Video](https://docs.pixeltable.com/howto/cookbooks/video/video-extract-frames) |
| Document processing | Gemini structured-JSON summarization, sentence-level chunking | [Chunking](https://docs.pixeltable.com/howto/cookbooks/text/doc-chunk-for-rag) |
| CSV / tabular data | Dynamic table creation, inline CRUD, type coercion | [CSV Import](https://docs.pixeltable.com/howto/cookbooks/data/data-import-csv) |
| Object detection | On-demand DETR (ResNet-50/101) with bounding box overlay | [Detection](https://docs.pixeltable.com/howto/cookbooks/images/img-detect-objects) |
| Table versioning | `tbl.revert()` for undo, `tbl.get_versions()` for history | [Versioning](https://docs.pixeltable.com/howto/cookbooks/core/version-control-history) |
| Structured output | Gemini `response_schema` with Pydantic models | [Structured Output](https://docs.pixeltable.com/howto/cookbooks/agents/llm-tool-calling) |
| Catalog introspection | `pxt.list_tables()`, `tbl.columns()`, `tbl._get_schema()`, `tbl.count()` | [Tables](https://docs.pixeltable.com/tutorials/tables-and-data-operations) |
| Data export | JSON, CSV, Parquet via `/api/export/` | [Export](https://docs.pixeltable.com/howto/cookbooks/data/data-export-pytorch) |
| MCP | Developer page config for Claude, Cursor, AI IDEs | [MCP](https://docs.pixeltable.com/use-cases/agents-mcp) |

### Not Yet Wired Up

- [ ] Image captioning ([cookbook](https://docs.pixeltable.com/howto/cookbooks/images/img-generate-captions))
- [ ] Vision structured output ([cookbook](https://docs.pixeltable.com/howto/cookbooks/images/vision-structured-output))
- [ ] Text-to-speech ([cookbook](https://docs.pixeltable.com/howto/cookbooks/audio/audio-text-to-speech))
- [ ] Podcast summarization ([cookbook](https://docs.pixeltable.com/howto/cookbooks/audio/audio-summarize-podcast))
- [ ] Label Studio / FiftyOne annotation ([guide](https://docs.pixeltable.com/howto/using-label-studio-with-pixeltable))
- [ ] Local models — Ollama, Llama.cpp, WhisperX ([guide](https://docs.pixeltable.com/howto/providers/working-with-ollama))

## Getting Started

### Prerequisites

- Python 3.10+, Node.js 18+
- Required: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`
- Optional: `MISTRAL_API_KEY`, `REVE_API_KEY`, `NEWS_API_KEY`

> All providers are swappable. Pixeltable supports [local runtimes](https://docs.pixeltable.com/howto/providers/working-with-ollama) (Ollama, Llama.cpp, WhisperX) and [20+ integrations](https://docs.pixeltable.com/integrations/frameworks).

### Install & Run

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend && npm install

# Configure
cat > backend/.env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
# MISTRAL_API_KEY=...
# REVE_API_KEY=...
# NEWS_API_KEY=...
IMAGE_GEN_PROVIDER=gemini
VIDEO_GEN_PROVIDER=gemini
EOF

# Run
cd backend && python setup_pixeltable.py   # first time only
python main.py                             # :8000
cd ../frontend && npm run dev              # :5173 → proxies /api to :8000
```

Production: `cd frontend && npm run build` outputs to `backend/static/`, then `python main.py` serves everything at `:8000`.

## Project Structure

```
backend/
├── main.py                 FastAPI app + CORS + static serving
├── config.py               model IDs, system prompts, LLM params
├── models.py               Pydantic request/response models
├── functions.py            @pxt.udf / @pxt.query definitions
├── setup_pixeltable.py     full schema: tables, views, columns, indexes
└── routers/
    ├── chat.py             POST /query         — 11-step agent workflow
    ├── files.py            POST /upload         — file + URL ingestion
    ├── studio.py           /api/studio/*        — transforms, detection, CSV, Reve, embeddings
    ├── images.py           /api/generate_*      — Imagen/DALL-E/Veo + save to collection
    ├── experiments.py      /api/experiments/*   — parallel multi-model prompt runs
    ├── export.py           /api/export/*        — JSON/CSV/Parquet for any table
    ├── database.py         /api/db/*            — catalog introspection + timeline
    ├── history.py          /api/history/*       — conversation detail + debug export
    ├── memory.py           /api/memory/*        — memory bank CRUD
    └── personas.py         /api/personas/*      — persona CRUD

frontend/src/
├── components/
│   ├── chat/               agent UI, personas, image/video modes
│   ├── experiments/        prompt lab: model select, metrics, history
│   ├── studio/             file browser, transforms, CSV, detection, embedding map
│   ├── developer/          export, API reference, SDK snippets, MCP config
│   ├── database/           catalog browser, search, filter, CSV download
│   ├── architecture/       React Flow diagram (38 nodes, swim lanes)
│   ├── images/             media library, Reve edit/remix dialog
│   ├── history/            conversations + timeline
│   ├── memory/             memory bank
│   └── settings/           persona editor
├── lib/api.ts              typed fetch wrapper
└── types/index.ts          shared interfaces
```

## Related Projects

- [**Pixeltable**](https://github.com/pixeltable/pixeltable) — the core library
- [**Pixelagent**](https://github.com/pixeltable/pixelagent) — lightweight agent framework with built-in memory
- [**Pixelmemory**](https://github.com/pixeltable/pixelmemory) — persistent memory layer for AI apps
- [**MCP Server**](https://github.com/pixeltable/mcp-server-pixeltable-developer) — Model Context Protocol server for Claude, Cursor, and AI IDEs

## Contributing

This is a playground — rough edges are expected. If you find a Pixeltable feature that's missing or awkward, open an issue or PR.

## License

Apache 2.0 — see [LICENSE](LICENSE).
