<div align="center">

**Open-source sandbox for exploring everything [Pixeltable](https://github.com/pixeltable/pixeltable) can do**

[![License](https://img.shields.io/badge/License-Apache%202.0-0530AD.svg)](https://opensource.org/licenses/Apache-2.0) [![Discord](https://img.shields.io/badge/Discord-%235865F2.svg)](https://discord.gg/QPyqFYx2UN)

[Pixeltable Docs](https://docs.pixeltable.com/) · [Cookbooks](https://docs.pixeltable.com/howto/cookbooks) · [Use Cases](https://docs.pixeltable.com/use-cases/ml-data-wrangling)

</div>

---

Pixelbot wires up tables, views, computed columns, embedding indexes, UDFs, tool calling, similarity search, version control, and model orchestration into a single full-stack app — so we can stress-test [Pixeltable](https://github.com/pixeltable/pixeltable) and ship what we learn as [cookbooks](https://docs.pixeltable.com/howto/cookbooks).

![Overview](docs/images/overview.png)

## Architecture

```
                          ┌─────────────────────────────────────┐
                          │     React · TypeScript · Tailwind    │
                          │                                     │
                          │  Chat · Prompt Lab · Studio · Media │
                          │  Database · Developer · Architecture│
                          └──────────────┬──────────────────────┘
                                         │ /api/*
                          ┌──────────────▼──────────────────────┐
                          │           FastAPI                    │
                          │                                     │
                          │  chat ─── 11-step agent pipeline    │
                          │  studio ─ transforms · detection    │
                          │           CSV · Reve · embeddings   │
                          │  images ─ Imagen · DALL-E · Veo     │
                          │  export ─ JSON · CSV · Parquet      │
                          │  experiments · database · memory    │
                          └──────────────┬──────────────────────┘
                                         │
              ┌──────────────────────────▼──────────────────────────────┐
              │                   Pixeltable                            │
              │                   ~/.pixeltable/                        │
              │                                                        │
              │  ┌─ Agent ────────────────────────────────────────┐    │
              │  │ tools          11 computed cols per row         │    │
              │  │                prompt → tool_select → RAG →     │    │
              │  │                context → answer → follow_ups    │    │
              │  │ chat_history   conversation log                 │    │
              │  │ memory_bank   E5-large embedding index          │    │
              │  └────────────────────────────────────────────────┘    │
              │                                                        │
              │  ┌─ Ingestion ────────────────────────────────────┐    │
              │  │ collection     → chunks (DocumentSplitter)     │    │
              │  │ images         → CLIP embedding + thumbnail    │    │
              │  │ videos         → video_frames (FrameIterator)  │    │
              │  │ audios         → audio_sentences (AudioSplitter│)   │
              │  └────────────────────────────────────────────────┘    │
              │                                                        │
              │  ┌─ Generation ───────────────────────────────────┐    │
              │  │ generated_images    Imagen 4.0 / DALL-E 3      │    │
              │  │ generated_videos    Veo 3.0                     │    │
              │  │ prompt_experiments  multi-model comparison       │    │
              │  └────────────────────────────────────────────────┘    │
              │                                                        │
              │  ┌─ Data ─────────────────────────────────────────┐    │
              │  │ csv_registry   dynamic CSV table tracking       │    │
              │  │ user_personas  system prompts + LLM params      │    │
              │  └────────────────────────────────────────────────┘    │
              │                                                        │
              │  Storage · Versioning · Computed Columns                │
              │  Embedding Indexes · UDFs · @pxt.query                 │
              └──────┬─────────┬───────────┬───────────┬───────────────┘
                     │         │           │           │
                     ▼         ▼           ▼           ▼
                  Claude    Gemini      OpenAI     Mistral
                  Sonnet 4  2.5 Flash   Whisper    Small/Large
                            Imagen/Veo  DALL-E 3
```

## Features

<details>
<summary><b>Chat</b> — Multimodal RAG agent</summary>
<br>

Semantic search across documents, images, video frames, and audio via `.similarity()` on embedding indexes. Tool calling with external APIs (NewsAPI, yfinance, DuckDuckGo). Inline image generation (Imagen 4.0 / DALL-E 3) and video generation (Veo 3.0). Follow-up suggestions via Gemini structured output with `response_schema`. Personas with adjustable system prompts and LLM parameters. Persistent chat history and memory bank.
</details>

<details>
<summary><b>Prompt Lab</b> — Multi-model experimentation</summary>
<br>

Run the same prompt against Claude, Gemini, Mistral, and GPT-4o in parallel via `ThreadPoolExecutor`. Editable model IDs — override presets or add custom models. Response time, word count, and character count metrics with "Fastest" highlight and normalized comparison bars. Every experiment stored in `agents.prompt_experiments` for replay.
</details>

<details>
<summary><b>Studio</b> — File explorer + data wrangler</summary>
<br>

- **Documents**: Auto-summaries (Gemini structured JSON), sentence-level chunks
- **Images**: PIL transforms with live preview, save or download
- **Videos**: Keyframe extraction, clip creation, text overlay, scene detection, transcriptions
- **Audio**: Transcriptions with sentence-level breakdown
- **CSV**: Inline CRUD, infinite undo via `table.revert()`, version history via `table.get_versions()`
- **Detection**: On-demand DETR (ResNet-50/101) with SVG bounding boxes, ViT classification with confidence bars
- **Search**: Cross-modal semantic search via `.similarity()` on embedding indexes
- **Embedding map**: Interactive 2D UMAP projection of text/visual embedding spaces
</details>

<details>
<summary><b>Media Library</b> — Gallery + AI editing</summary>
<br>

Gallery for generated images and videos. Save to collection triggers CLIP embedding, keyframe extraction, transcription, and RAG indexing automatically. Reve AI editing via `reve.edit()` (natural language instructions) and `reve.remix()` (creative blending) with side-by-side preview.
</details>

<details>
<summary><b>Developer</b> — Export, API reference, SDK, MCP</summary>
<br>

- **Export**: Download any table as JSON, CSV, or Parquet with row-limit control and live preview
- **API**: Categorized endpoint browser with method badges and expandable curl examples
- **SDK**: Python code snippets — connect, query, semantic search, export to Pandas, versioning
- **Connect**: MCP server config for Claude/Cursor, direct Python access, REST API examples
</details>

<details>
<summary><b>Database</b> — Catalog explorer</summary>
<br>

Tables and views grouped by type (Agent Pipeline, Documents, Images, Videos, Audio, Generation, Memory, Data Tables). Schema inspection with computed vs. insertable column badges. Paginated row browser with client-side search, row filter, and CSV download.
</details>

<details>
<summary><b>Architecture</b> — Interactive diagram</summary>
<br>

React Flow diagram with 38 nodes and 40 edges in swim-lane layout. Click any node to highlight its connections. Covers the full data flow: document chunking, image CLIP, video dual pipeline, audio transcription, 11-step agent pipeline, generation, and feedback edges.
</details>

<details>
<summary><b>History & Memory</b></summary>
<br>

Searchable conversation history with workflow detail dialog and JSON export. Unified timeline across all timestamped Pixeltable tables. Memory bank with semantic search and manual entry.
</details>

## Pixeltable Coverage

Every row maps to a Pixeltable feature exercised in this app:

| Feature | Usage | Docs |
|---|---|---|
| Tables + multimodal types | `Document`, `Image`, `Video`, `Audio`, `Json` | [Tables](https://docs.pixeltable.com/tutorials/tables-and-data-operations) |
| Computed columns | 11-step agent pipeline, thumbnails, summarization | [Computed Columns](https://docs.pixeltable.com/tutorials/computed-columns) |
| Views + iterators | `DocumentSplitter`, `FrameIterator`, `AudioSplitter` | [Iterators](https://docs.pixeltable.com/platform/iterators) |
| Embedding indexes | E5-large-instruct, CLIP ViT-B/32 → `.similarity()` | [Embedding Indexes](https://docs.pixeltable.com/platform/embedding-indexes) |
| `@pxt.udf` | News API, financial data, context assembly | [UDFs](https://docs.pixeltable.com/platform/udfs-in-pixeltable) |
| `@pxt.query` | `search_documents`, `search_images`, `search_video_frames` | [RAG](https://docs.pixeltable.com/howto/cookbooks/agents/pattern-rag-pipeline) |
| `pxt.tools()` + `invoke_tools()` | Agent tool selection + execution | [Tool Calling](https://docs.pixeltable.com/howto/cookbooks/agents/llm-tool-calling) |
| Agent memory | Chat history + memory bank with embedding search | [Memory](https://docs.pixeltable.com/howto/cookbooks/agents/pattern-agent-memory) |
| LLM integrations | Anthropic, Google, OpenAI, Mistral | [Integrations](https://docs.pixeltable.com/integrations/frameworks) |
| Reve AI | `reve.edit()` / `reve.remix()` for image editing | [Reve](https://docs.pixeltable.com/howto/providers/working-with-reve) |
| PIL transforms | Resize, rotate, blur, sharpen, edge detect | [PIL](https://docs.pixeltable.com/howto/cookbooks/images/img-pil-transforms) |
| Video UDFs | `extract_frame`, `clip`, `overlay_text`, `scene_detect_content` | [Video](https://docs.pixeltable.com/howto/cookbooks/video/video-extract-frames) |
| Document processing | Gemini structured-JSON summarization, chunking | [Chunking](https://docs.pixeltable.com/howto/cookbooks/text/doc-chunk-for-rag) |
| CSV / tabular data | Dynamic table creation, inline CRUD, type coercion | [CSV Import](https://docs.pixeltable.com/howto/cookbooks/data/data-import-csv) |
| Object detection | On-demand DETR with bounding box overlay | [Detection](https://docs.pixeltable.com/howto/cookbooks/images/img-detect-objects) |
| Table versioning | `tbl.revert()`, `tbl.get_versions()` | [Versioning](https://docs.pixeltable.com/howto/cookbooks/core/version-control-history) |
| Structured output | Gemini `response_schema` + Pydantic models | [Structured Output](https://docs.pixeltable.com/howto/cookbooks/agents/llm-tool-calling) |
| Catalog introspection | `pxt.list_tables()`, `tbl.columns()`, `tbl.count()` | [Tables](https://docs.pixeltable.com/tutorials/tables-and-data-operations) |
| Data export | JSON, CSV, Parquet via `/api/export/` | [Export](https://docs.pixeltable.com/howto/cookbooks/data/data-export-pytorch) |
| MCP | Config for Claude, Cursor, AI IDEs | [MCP](https://docs.pixeltable.com/use-cases/agents-mcp) |

### Not Yet Wired Up

- [ ] Image captioning ([cookbook](https://docs.pixeltable.com/howto/cookbooks/images/img-generate-captions))
- [ ] Vision structured output ([cookbook](https://docs.pixeltable.com/howto/cookbooks/images/vision-structured-output))
- [ ] Text-to-speech ([cookbook](https://docs.pixeltable.com/howto/cookbooks/audio/audio-text-to-speech))
- [ ] Label Studio / FiftyOne ([guide](https://docs.pixeltable.com/howto/using-label-studio-with-pixeltable))
- [ ] Local models — Ollama, Llama.cpp, WhisperX ([guide](https://docs.pixeltable.com/howto/providers/working-with-ollama))

## Getting Started

**Prerequisites:** Python 3.10+, Node.js 18+

**Required:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`
**Optional:** `MISTRAL_API_KEY`, `REVE_API_KEY`, `NEWS_API_KEY`

> All providers are swappable. Pixeltable supports [local runtimes](https://docs.pixeltable.com/howto/providers/working-with-ollama) and [20+ integrations](https://docs.pixeltable.com/integrations/frameworks).

```bash
# Install
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cd ../frontend && npm install

# Configure — create backend/.env with your API keys

# Run
cd backend && python setup_pixeltable.py   # first time only
python main.py                             # :8000
cd ../frontend && npm run dev              # :5173 → proxies /api to :8000
```

**Production:** `cd frontend && npm run build` → `backend/static/`, then `python main.py` serves at `:8000`.

## Project Structure

```
backend/
├── main.py                 FastAPI app, CORS, static serving
├── config.py               model IDs, system prompts, LLM parameters
├── models.py               Pydantic request/response schemas
├── functions.py            @pxt.udf and @pxt.query definitions
├── setup_pixeltable.py     full schema (tables, views, columns, indexes)
└── routers/
    ├── chat.py             11-step agent workflow
    ├── studio.py           transforms, detection, CSV, Reve, embeddings
    ├── images.py           Imagen/DALL-E/Veo generation
    ├── experiments.py      parallel multi-model prompt runs
    ├── export.py           JSON/CSV/Parquet for any table
    ├── database.py         catalog introspection, timeline
    ├── files.py            upload, URL import
    ├── history.py          conversation detail, debug export
    ├── memory.py           memory bank CRUD
    └── personas.py         persona CRUD

frontend/src/
├── components/
│   ├── chat/               agent UI, personas, image/video modes
│   ├── experiments/        prompt lab, model select, metrics
│   ├── studio/             file browser, transforms, CSV, detection, embedding map
│   ├── developer/          export, API reference, SDK snippets, MCP config
│   ├── database/           catalog browser, search, filter, download
│   ├── architecture/       React Flow diagram (38 nodes, swim lanes)
│   ├── images/             media library, Reve edit/remix
│   ├── history/            conversations, timeline
│   ├── memory/             memory bank
│   └── settings/           persona editor
├── lib/api.ts              typed fetch wrapper
└── types/index.ts          shared interfaces
```

## Related Projects

| Project | Description |
|:--------|:------------|
| [**Pixeltable**](https://github.com/pixeltable/pixeltable) | The core library — declarative AI data infrastructure |
| [**Pixelagent**](https://github.com/pixeltable/pixelagent) | Lightweight agent framework with built-in memory |
| [**Pixelmemory**](https://github.com/pixeltable/pixelmemory) | Persistent memory layer for AI apps |
| [**MCP Server**](https://github.com/pixeltable/mcp-server-pixeltable-developer) | Model Context Protocol server for Claude, Cursor, AI IDEs |

## Contributing

Rough edges are expected. If you find a Pixeltable feature that's missing or awkward, open an issue or PR.

## License

Apache 2.0 — see [LICENSE](LICENSE).
