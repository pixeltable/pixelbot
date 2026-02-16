<div align="center">

<img src="https://github.com/user-attachments/assets/29c6b22c-60cf-4d5e-8e72-58c6ca746dac" alt="Pixelbot" width="600"/>

**A vibe-coded playground for exploring everything [Pixeltable](https://github.com/pixeltable/pixeltable) can do**

[![License](https://img.shields.io/badge/License-Apache%202.0-0530AD.svg)](https://opensource.org/licenses/Apache-2.0) [![Discord](https://img.shields.io/badge/Discord-%235865F2.svg)](https://discord.gg/QPyqFYx2UN)

[Live Demo](http://agent.pixeltable.com/) · [Pixeltable Docs](https://docs.pixeltable.com/) · [Cookbooks](https://docs.pixeltable.com/docs/howto/cookbooks)

</div>

---

Pixelbot is an open-source sandbox built to explore, stress-test, and iterate on [Pixeltable](https://github.com/pixeltable/pixeltable) features. It's intentionally vibe-coded — we build fast, break things, and use the result to figure out what works, what's missing, and how to make Pixeltable better.

The app itself combines a **multimodal AI agent**, an interactive **data studio**, and **media generation** — all powered end-to-end by Pixeltable's declarative data infrastructure. Upload documents, images, videos, and audio, then chat with an agent that reasons across all of them, transform files hands-on in the Studio, or generate images and video with state-of-the-art models.

![Overview](docs/images/overview.gif)

## Why This Exists

Pixeltable is building open-source AI data infrastructure that handles storage, indexing, transformation, and model orchestration declaratively. Pixelbot exists to:

- **Exercise every feature** — tables, views, computed columns, iterators, embedding indexes, UDFs, tool calling, `@pxt.query`, similarity search, version control — all wired up in one app
- **Discover rough edges** — if something is awkward to use, we find it here first
- **Prototype use cases** — each feature in Pixelbot maps to a real Pixeltable use case (RAG, agents, media processing, data wrangling) that we can refine and document
- **Ship cookbooks** — patterns that work here become [official cookbooks](https://docs.pixeltable.com/docs/howto/cookbooks) and [use-case guides](https://docs.pixeltable.com/docs/use-cases/ai-applications)

## What We're Exploring

### Pixeltable Features Exercised

| Pixeltable Feature | How Pixelbot Uses It | Cookbook Reference |
|---|---|---|
| **Tables & multimodal types** | `pxt.Document`, `pxt.Image`, `pxt.Video`, `pxt.Audio`, `pxt.Json` for all uploads | [Tables & Data Ops](https://docs.pixeltable.com/docs/tutorials/tables-and-data-operations) |
| **Computed columns** | 11-step agent pipeline, thumbnails, audio extraction, auto-summarization — all triggered on insert | [Computed Columns](https://docs.pixeltable.com/docs/tutorials/computed-columns) |
| **Views & iterators** | `DocumentSplitter` (page+sentence), `FrameIterator` (keyframes), `AudioSplitter` (30s/60s chunks), `StringSplitter` | [Iterators](https://docs.pixeltable.com/docs/platform/iterators) |
| **Embedding indexes** | E5-large-instruct (text), CLIP (images, video frames) — `.similarity()` across all media | [Embedding Indexes](https://docs.pixeltable.com/docs/platform/embedding-indexes) |
| **`@pxt.udf` functions** | News API, financial data, context assembly, text extraction, multimodal message building | [UDFs](https://docs.pixeltable.com/docs/platform/udfs-in-pixeltable) |
| **`@pxt.query` functions** | `search_documents`, `search_images`, `search_video_frames`, `search_memory`, `search_chat_history` | [RAG Pipeline](https://docs.pixeltable.com/docs/howto/cookbooks/agents/pattern-rag-pipeline) |
| **`pxt.tools()` + `invoke_tools()`** | Agent tool selection with Claude Sonnet 4, automatic tool execution | [Tool Calling](https://docs.pixeltable.com/docs/howto/cookbooks/agents/llm-tool-calling) |
| **Agent memory** | Chat history table + memory bank with semantic search over past conversations | [Agent Memory](https://docs.pixeltable.com/docs/howto/cookbooks/agents/pattern-agent-memory) |
| **LLM integrations** | Anthropic (Claude Sonnet 4), Google (Gemini 2.5 Flash, Imagen 4.0, Veo 3.0), OpenAI (Whisper, DALL-E 3) | [Integrations](https://docs.pixeltable.com/docs/integrations/frameworks) |
| **PIL image transforms** | Resize, rotate, flip, blur, sharpen, edge detect, grayscale, brightness, contrast, saturation | [PIL Transforms](https://docs.pixeltable.com/docs/howto/cookbooks/images/img-pil-transforms) |
| **Video UDFs** | `get_metadata`, `extract_frame`, `clip`, `overlay_text`, `scene_detect_content` | [Video Cookbooks](https://docs.pixeltable.com/docs/howto/cookbooks/video/video-extract-frames) |
| **Document processing** | Auto-summarization (Gemini structured JSON), chunking, text extraction from Office formats | [Doc Chunking](https://docs.pixeltable.com/docs/howto/cookbooks/text/doc-chunk-for-rag) |
| **CSV/tabular data** | Dynamic table creation, inline CRUD, type coercion via `tbl._get_schema()` | [Import CSV](https://docs.pixeltable.com/docs/howto/cookbooks/data/data-import-csv) |

### What's Still on the Roadmap

Pixeltable features and cookbook patterns we haven't wired up yet — contributions welcome:

- [ ] **Object detection** — YOLOX / DETR on images and video frames ([cookbook](https://docs.pixeltable.com/docs/howto/cookbooks/images/img-detect-objects))
- [ ] **Image captioning** — auto-generate descriptions ([cookbook](https://docs.pixeltable.com/docs/howto/cookbooks/images/img-generate-captions))
- [ ] **Vision structured output** — extract structured data from images ([cookbook](https://docs.pixeltable.com/docs/howto/cookbooks/images/vision-structured-output))
- [ ] **Image-to-image** — style transfer and editing ([cookbook](https://docs.pixeltable.com/docs/howto/cookbooks/images/img-image-to-image))
- [ ] **Text-to-speech** — audio generation from text ([cookbook](https://docs.pixeltable.com/docs/howto/cookbooks/audio/audio-text-to-speech))
- [ ] **Podcast summarization** — transcribe + summarize long audio ([cookbook](https://docs.pixeltable.com/docs/howto/cookbooks/audio/audio-summarize-podcast))
- [ ] **Data export** — PyTorch DataLoader, Parquet, S3 push ([cookbooks](https://docs.pixeltable.com/docs/howto/cookbooks/data/data-export-pytorch))
- [ ] **Version control** — snapshots and history tracking ([guide](https://docs.pixeltable.com/docs/howto/cookbooks/core/version-control-history))
- [ ] **MCP integration** — expose Pixeltable tables as MCP tools ([guide](https://docs.pixeltable.com/docs/use-cases/agents-mcp))
- [ ] **Label Studio / FiftyOne** — annotation workflows ([guide](https://docs.pixeltable.com/docs/howto/using-label-studio-with-pixeltable))
- [ ] **Custom embedding models** — Voyage, Jina, OpenAI embeddings ([guide](https://docs.pixeltable.com/docs/integrations/embedding-model))
- [ ] **Local models** — Ollama, Llama.cpp, WhisperX ([guide](https://docs.pixeltable.com/docs/howto/providers/working-with-ollama))

## The App

### Chat — Multimodal AI Agent

Ask questions and get answers grounded in your uploaded files. The agent searches across documents, images, video frames, and audio transcripts, calls external tools, and assembles multimodal context before responding.

- Semantic search across all media types (text, image, video, audio)
- Tool calling with external APIs (NewsAPI, yfinance, DuckDuckGo)
- Image & video generation (Imagen 4.0 / DALL-E 3, Veo 3.0)
- Follow-up suggestions via Gemini 2.5 Flash
- Persistent chat history and selective memory bank
- Customizable personas with adjustable system prompts and LLM parameters
- Markdown rendering with code blocks, tables, and lists

### Studio — Interactive Data Wrangler

Browse uploaded files and apply operations powered by Pixeltable UDFs:

- **Documents**: Auto-generated summaries (Gemini structured JSON), sentence-level chunks with metadata
- **Images**: PIL transforms with live before/after preview, save back to Pixeltable or download
- **Videos**: Keyframe extraction, clip creation, text overlay, scene detection, metadata inspection, transcriptions
- **Audio**: Transcriptions with sentence-level breakdown
- **CSV**: Inline cell editing, add/delete rows — all via Pixeltable `insert()`/`update()`/`delete()` primitives
- **Cross-modal search**: Semantic search across all file types via `.similarity()` on embedding indexes
- **Embedding map**: Interactive 2D t-SNE visualization of text and visual embedding spaces

### Media — Image & Video Generation

- Tabbed generation UI for images (Imagen 4.0 / DALL-E 3) and videos (Veo 3.0)
- Gallery with search, detail view, download
- "Save to Collection" — push generated media into the main tables for automatic CLIP embedding, keyframe extraction, transcription, and RAG indexing

### Architecture — Interactive Diagram

A full React Flow diagram of the Pixeltable schema (38 nodes, 40 edges) showing every table, view, index, model, UDF, and data flow. Click any node to highlight its connections. Organized into swim lanes: Documents, Images, Video, Audio, Agent Pipeline, Knowledge, Config, Generation.

### History — Debug & Export

- Workflow history with search and detail view
- **Debug Export** — download the full `agents.tools` table with all 21 columns (prompts, tool outputs, LLM responses, contexts, follow-ups) for row-level pipeline inspection

## How Pixeltable Powers Everything

Pixeltable replaces the need for separate vector databases, object stores, ETL pipelines, and orchestration frameworks:

- **Declarative workflows** — The entire pipeline (ingestion → processing → LLM calls → tool execution → answer) is defined with tables, views, and computed columns in `setup_pixeltable.py`. Pixeltable manages execution order automatically.
- **Unified multimodal storage** — Documents, images, videos, and audio live in native Pixeltable tables with first-class type support.
- **Automated processing** — Computed columns trigger on insert: thumbnail generation, audio extraction, Whisper transcription, embedding computation, auto-summarization.
- **Views & iterators** — `DocumentSplitter`, `FrameIterator`, `AudioSplitter`, `StringSplitter` transform data without duplicating it.
- **Built-in vector search** — Embedding indexes enable `.similarity()` queries across text (E5-large-instruct), images (CLIP), and video frames (CLIP).
- **Tool integration** — `@pxt.udf` and `@pxt.query` functions registered as LLM tools via `pxt.tools()`.
- **Persistent state** — All data survives restarts. Files, chat history, memory, generated media, workflow runs — everything is in managed tables at `~/.pixeltable/`.

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- API keys:
  - [Anthropic](https://console.anthropic.com/) — reasoning & tool use (Claude Sonnet 4)
  - [Google AI](https://ai.google.dev/) — summarization, follow-ups, image & video generation (Gemini 2.5 Flash, Imagen 4.0, Veo 3.0)
  - [OpenAI](https://platform.openai.com/api-keys) — transcription & optional image gen (Whisper, DALL-E 3)
  - [NewsAPI](https://newsapi.org/) — optional, 100 req/day free

> All LLM providers are swappable. Pixeltable supports [local runtimes](https://docs.pixeltable.com/docs/howto/providers/working-with-ollama) (Ollama, Llama.cpp, WhisperX) and [20+ integrations](https://docs.pixeltable.com/docs/integrations/frameworks). You can make this entirely local.

### Installation

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### Environment Setup

Create `backend/.env`:

```dotenv
# Required
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Optional
NEWS_API_KEY=...

# Generation provider ("gemini" or "openai")
IMAGE_GEN_PROVIDER=gemini
VIDEO_GEN_PROVIDER=gemini
```

### Running

```bash
# 1. Initialize schema (first time only)
cd backend && python setup_pixeltable.py

# 2. Start backend
python main.py                # http://localhost:8000

# 3. Start frontend (dev)
cd ../frontend && npm run dev  # http://localhost:5173 → proxies /api to :8000
```

**Production build:**

```bash
cd frontend && npm run build   # → backend/static/
cd ../backend && python main.py # serves everything at :8000
```

## Tech Stack

| Layer | Technology |
|---|---|
| Data infrastructure | [Pixeltable](https://github.com/pixeltable/pixeltable) |
| Backend | FastAPI (Python) |
| Frontend | React, TypeScript, Tailwind CSS, Radix UI |
| Reasoning & tools | Anthropic Claude Sonnet 4 |
| Summarization & follow-ups | Google Gemini 2.5 Flash |
| Transcription | OpenAI Whisper |
| Image generation | Google Imagen 4.0 / OpenAI DALL-E 3 (configurable) |
| Video generation | Google Veo 3.0 |
| Text embeddings | E5-large-instruct (multilingual) |
| Visual embeddings | CLIP ViT-B/32 |

## Project Structure

```
.
├── backend/                   # FastAPI backend
│   ├── main.py                # App entrypoint (FastAPI, CORS, lifespan, static serving)
│   ├── config.py              # Model IDs, prompts, LLM params, generation providers
│   ├── models.py              # Pydantic row models for Pixeltable inserts
│   ├── functions.py           # @pxt.udf and @pxt.query functions
│   ├── queries.py             # Reusable Pixeltable query helpers
│   ├── setup_pixeltable.py    # Pixeltable schema (tables, views, computed columns, indexes)
│   └── routers/
│       ├── chat.py            # POST /api/query — agent workflow
│       ├── files.py           # Upload, URL import, delete, context info
│       ├── history.py         # Workflow detail, export, debug export
│       ├── images.py          # Image/video generation, save to collection
│       ├── memory.py          # Memory bank CRUD + export
│       ├── personas.py        # Persona CRUD
│       └── studio.py          # File browsing, transforms, chunks, frames, transcripts, CSV CRUD
├── frontend/                  # React + TypeScript + Tailwind
│   └── src/
│       ├── components/
│       │   ├── chat/          # Chat page (messages, personas, follow-ups, markdown rendering)
│       │   ├── studio/        # Studio (file browser, transforms, search, embedding map, CSV editor)
│       │   ├── architecture/  # React Flow architecture diagram (manual grid layout, swim lanes)
│       │   ├── history/       # Workflow history + debug export
│       │   ├── images/        # Media generation (images + videos) with save to collection
│       │   ├── memory/        # Memory bank with semantic search
│       │   └── settings/      # Persona editor
│       ├── lib/api.ts         # Typed API client
│       └── types/index.ts     # Shared TypeScript interfaces
└── CODEGASE_GUIDE.md          # Internal codebase reference (auto-maintained)
```

## Related Pixeltable Projects

- [**Pixeltable**](https://github.com/pixeltable/pixeltable) — the core library
- [**Pixelagent**](https://github.com/pixeltable/pixelagent) — lightweight agent framework with built-in memory
- [**Pixelmemory**](https://github.com/pixeltable/pixelmemory) — persistent memory layer for AI apps
- [**MCP Server**](https://github.com/pixeltable/mcp-server-pixeltable-developer) — Model Context Protocol server for Claude, Cursor, and AI IDEs

## Contributing

This is a playground — rough edges are expected. If you find a Pixeltable feature that's missing or awkward, that's exactly the kind of thing we want to know about. Open an issue or PR.

## License

Apache 2.0 — see [LICENSE](LICENSE).
