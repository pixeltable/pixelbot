# Codebase Guide

Quick reference for the Pixelbot project structure and conventions.

## Architecture

- **Backend**: FastAPI (Python) in `backend/`
- **Frontend**: React + TypeScript + Tailwind CSS in `frontend/`
- **Data Layer**: Pixeltable (schema defined in `backend/setup_pixeltable.py`)

### Backend (`backend/`)

| File | Purpose |
|---|---|
| `main.py` | FastAPI app entrypoint, CORS, lifespan (Pixeltable connection check), static file serving, SPA catch-all fallback for client-side routes |
| `config.py` | Central config: model IDs, default prompts, LLM params, upload settings. `IMAGE_GEN_PROVIDER` (`"gemini"` or `"openai"`) and `VIDEO_GEN_PROVIDER` control which generation backend is used. `SUMMARIZATION_MODEL_ID` (default `gemini-2.5-flash`) powers auto-summarization and structured follow-ups. Allowed extensions include Office formats via Pixeltable MarkdownIT support. |
| `models.py` | Pydantic row models for Pixeltable table inserts (validated before write). Also includes **LLM structured output schemas** (`FollowUpResponse`, `DocumentSummary`) used with Gemini's `response_schema` for validated JSON generation. |
| `functions.py` | `@pxt.udf` and `@pxt.query` functions (news, finance, context assembly, `extract_document_text` for auto-summarization). `query_csv_table` supports JSON-structured lookup params with `pxt.retrieval_udf()` for precise key-based CSV row retrieval, falling back to sample-based context for general questions. |
| `setup_pixeltable.py` | Pixeltable schema: tables, views, computed columns, embedding indexes |
| `requirements.txt` | Python dependencies |
| `routers/` | FastAPI route handlers (see below) |

### Backend Routers (`backend/routers/`)

All routers use prefix `/api` and accept `config.DEFAULT_USER_ID` for user isolation.

| Router | Prefix | Endpoints |
|---|---|---|
| `chat.py` | `/api` | `POST /query` — agent workflow |
| `files.py` | `/api` | `POST /upload`, `POST /add_url`, `DELETE /delete_file/{uuid}/{type}`, `POST /delete_all`, `GET /context_info` |
| `history.py` | `/api` | `GET /workflow_detail/{ts}`, `DELETE /delete_history/{ts}`, `GET /download_history`, `GET /debug_export` (full `agents.tools` table with all 21 columns for debugging) |
| `images.py` | `/api` | `GET /generation_config`, `POST /generate_image`, `GET /image_history`, `DELETE /delete_image/{ts}`, `POST /generate_video`, `GET /video_history`, `GET /serve_video`, `DELETE /delete_video/{ts}`, `POST /save_generated_image`, `POST /save_generated_video`, `POST /generate_speech` (TTS via OpenAI `tts-1`), `GET /serve_audio`, `GET /tts_voices` |
| `memory.py` | `/api` | `POST /memory`, `POST /memory/manual`, `GET /memory`, `DELETE /memory/{ts}`, `GET /download_memory` |
| `personas.py` | `/api` | `GET /personas`, `POST /personas`, `PUT /personas/{name}`, `DELETE /personas/{name}` |
| `studio.py` | `/api/studio` | `GET /files`, `GET /operations`, `POST /search`, `GET /embeddings?space=text\|visual`, `GET /image_preview/{uuid}`, `POST /transform/image`, `POST /save/image`, `POST /download/image`, `POST /transform/video` (metadata, extract_frame, clip_video, overlay_text, detect_scenes), `POST /save/video`, `POST /save/extracted_frame`, `GET /summary/{uuid}`, `GET /chunks/{uuid}`, `GET /frames/{uuid}`, `GET /transcription/{uuid}/{type}`, `POST /csv/rows`, `POST /csv/rows/add`, `PUT /csv/rows/update`, `DELETE /csv/rows/delete`, `POST /csv/revert` (infinite undo via `table.revert()`, returns `can_undo` + `current_version`), `GET /csv/versions?table_name=` (full version history via `table.get_versions()`), `DELETE /csv/{uuid}`, `GET /detect/models` (list available ML models), `POST /detect` (on-demand DETR object detection or ViT classification with in-memory model caching), `POST /reve/edit` (Reve AI image editing with natural language instructions via `pixeltable.functions.reve.edit()`), `POST /reve/remix` (Reve AI image remixing with creative prompts via `pixeltable.functions.reve.remix()`), `POST /reve/save` (persist Reve edit/remix temp results to `agents.images` collection) |
| `database.py` | `/api/db` | `GET /tables` (list all tables/views with schema + row counts), `GET /table/{path}/rows` (paginated row fetch), `GET /table/{path}/schema` (detailed column info), `GET /timeline` (unified chronological feed across all timestamped tables), `POST /join` (cross-table join with inner/left/cross modes) |
| `experiments.py` | `/api/experiments` | `GET /models` (list supported LLMs with availability based on env keys), `POST /run` (run prompt against N models in parallel via ThreadPoolExecutor, store results in Pixeltable), `GET /history` (list experiments grouped by ID), `GET /{id}` (full experiment detail), `DELETE /{id}` (delete experiment) |
| `export.py` | `/api/export` | `GET /tables` (list exportable tables), `GET /json/{table}` (JSON export), `GET /csv/{table}` (CSV export), `GET /parquet/{table}` (Parquet export via pandas), `GET /preview/{table}` (5-row preview for UI) |

### Frontend (`frontend/`)

| Path | Purpose |
|---|---|
| `vite.config.ts` | Dev proxy (`/api` → `:8000`), build output → `backend/static/` |
| `src/main.tsx` | React entry point |
| `src/App.tsx` | Routes (BrowserRouter): `/`, `/studio`, `/architecture`, `/history`, `/images`, `/memory`, `/database`, `/experiments`, `/developer`, `/settings` |
| `src/index.css` | Tailwind CSS theme (light/dark via `prefers-color-scheme`) |
| `src/types/index.ts` | Shared TypeScript interfaces |
| `src/lib/api.ts` | Typed fetch wrapper for all backend endpoints |
| `src/lib/utils.ts` | `cn()` helper (clsx + tailwind-merge) |

### Frontend Components (`frontend/src/components/`)

| Component | Path | Description |
|---|---|---|
| `AppLayout` | `app-layout.tsx` | Sidebar nav (collapsible, 200px/56px) with **grouped navigation** (Conversation: Chat/History/Memory, Workspace: Media Library/Studio/Database/Prompt Lab, System: Architecture) separated by thin dividers and uppercase group labels. Files toggle + Settings at bottom. No top bar — clean full-height content area. File panel slides in from right (272px). Footer links to Pixeltable GitHub with SVG icon. |
| `ChatPage` | `chat/chat-page.tsx` | Centered greeting ("What can I help with?"), suggestion chips, integrated input bar with persona selector + **Image mode**, **Video mode**, and **Voice mode** toggles in bottom toolbar. Chat is the sole creation hub: Image mode generates via Gemini Imagen, Video mode generates via Gemini Veo, Voice mode generates speech via OpenAI TTS — all inline. Proper markdown rendering via `marked` (bold, lists, code blocks, tables, blockquotes). Extracted `MessageBubble` component with memoized HTML; video messages render an inline `<video>` player, audio messages render an inline `<audio>` player. Sources shown as subtle inline icons+text ("Sources: Documents, Tools"). Follow-ups rendered as rounded chip buttons with arrow icons. Copy/save actions on hover. Deps: `marked`. |
| `StudioPage` | `studio/studio-page.tsx` | File explorer + data wrangler. **Left sidebar** (fixed 288px): vertical file-type filter list with labels + count badges (Documents, Images, Videos, Audio, Tables); auto-selects first non-empty type on load. Separated "Explore" section with cross-modal semantic search input and Embedding Map toggle. File names wrap up to 2 lines via `line-clamp-2`. **Workspace**: browse files, apply PIL transforms on images, view document chunks (with auto-generated summaries from Gemini), video keyframes, audio/video transcriptions. **Video operations**: metadata inspection (`get_metadata`/`get_duration`), frame extraction (`extract_frame`), clip creation (`clip`), text overlay (`overlay_text`), and scene detection (`scene_detect_content`) — all via Pixeltable's native video UDFs. Save transformed images/videos to Pixeltable or download. Interactive 2-D UMAP embedding map with Text/Visual space toggle, type filtering, click-to-select detail panel with nearest neighbors. **CSV CRUD**: inline cell editing (click-to-edit), add row form, row deletion, **infinite Undo** (repeated `table.revert()` until v0), **Version History** panel (collapsible, shows all versions with change stats via `table.get_versions()`) — all using Pixeltable `insert()`/`update()`/`delete()` primitives with automatic type coercion and registry `row_count` sync. **AI Analysis**: on-demand object detection (DETR) and image classification (ViT) with SVG bounding box overlay, confidence labels, and interactive hover — available on images and individual video frames. |
| `DetectionPanel` | `studio/detection-panel.tsx` | Reusable component for on-demand ML analysis. Model selector dropdown (DETR ResNet-50/101 for detection, DETR ResNet-50 Panoptic for segmentation, ViT Base for classification), confidence threshold slider (detection + segmentation), SVG bounding box overlay with color-coded labels (8-color palette), interactive hover (highlight box + label chip), segmentation overlay with translucent filled regions and "stuff" vs "thing" distinction, classification bar chart for ViT results. Used in both `ImageWorkspace` and `VideoWorkspace` (per-frame analysis). |
| `SearchResults` | `studio/search-results.tsx` | Displays cross-modal similarity search results with type badges, thumbnails, similarity scores, and click-to-select. |
| `EmbeddingMap` | `studio/embedding-map.tsx` | Interactive SVG scatter plot of UMAP-projected embeddings (Text space: sentence-transformer, Visual space: CLIP). Color-coded by type. **Type filter toggles** in legend (click to show/hide). **Click-to-select** opens a slide-in detail panel with label, UUID, position, and **nearest-neighbor list** (5 closest points by 2-D distance, clickable to navigate). Hover tooltip shows label preview. Badge shows visible/total count. Axis labels (UMAP-1, UMAP-2). Backend uses `umap-learn` with cosine metric for better global+local structure than t-SNE. |
| `FileSidebar` | `files/file-sidebar.tsx` | Drag-drop upload, URL input, file sections with thumbnails. Names cleaned of UUID/hash prefixes via `_clean_basename` (backend). Truncated with ellipsis + hover tooltip (frontend). |
| `HistoryPage` | `history/history-page.tsx` | Two-tab view: **Conversations** (searchable history list, detail dialog, export JSON, Debug Export for full `agents.tools` table) and **Timeline** (unified chronological feed across all timestamped Pixeltable tables with color-coded event types, date grouping, and role indicators). Toggled via Conversations/Timeline switcher in header. |
| `ImagesPage` | `images/images-page.tsx` | **Media Library** — gallery/editor for generated media (no generation prompt; generation happens in Chat). Tabbed (Images / Videos). Search, detail dialog with download/delete, provider badge. **Save to Collection**: generated images/videos can be saved to the main `agents.images`/`agents.videos` tables via dedicated buttons, triggering CLIP embedding, keyframe extraction, transcription, and RAG indexing automatically. **Reve AI Edit/Remix**: full-featured dialog with side-by-side original/result preview, edit/remix mode toggle (violet/amber accent), instruction textarea, loading animation, and Save to Library / Download / Try Again actions. Edit uses `reve.edit()` (natural language instructions on existing images), Remix uses `reve.remix()` (creative prompts referencing source images with `<img>0</img>` tags). Results are persisted via `/reve/save` which inserts into `agents.images` triggering CLIP + RAG. Video edit placeholder for future RunwayML integration. |
| `MemoryPage` | `memory/memory-page.tsx` | Memory list with semantic search, manual add dialog, export |
| `ArchitecturePage` | `architecture/architecture-page.tsx` | Interactive React Flow diagram (38 nodes, 40 edges). **Manual grid layout** with horizontal swim lanes (Documents, Images, Video, Audio, Agent Pipeline, Knowledge, Config, Generation) — replaced dagre auto-layout for structured, compact positioning. Lane labels as non-interactive annotation nodes. Compact nodes (140px wide, `line-clamp-1` descriptions). `fitView` auto-frames diagram. 7 node types: table, view, index, model, udf, output, external. Click-to-highlight with connected-node/edge emphasis and dimming. Full data flow coverage: document chunking + summarization, image CLIP + thumbnails, video dual pipeline (keyframes + transcription), audio transcription, Memory + Chat indexes, Personas, External APIs, CSV Registry, 11-step agent pipeline (Claude Sonnet 4 → tools → RAG → multimodal context → answer → Gemini follow-ups), Q&A write-back, generation (Imagen/DALL-E, Veo), Save to Collection feedback edges. Deps: `@xyflow/react`. |
| `ExperimentsPage` | `experiments/experiments-page.tsx` | **Prompt Lab** — multi-model prompt experimentation workspace. Left panel (360px): task label, system prompt, user prompt, model multi-select (color-coded checkboxes per provider: amber=Anthropic, blue=Google, cyan=Mistral, emerald=OpenAI), temperature and max_tokens sliders, Run Experiment button, collapsible History drawer. Right panel: side-by-side result cards per model with response text, metric badges (response time, word count, char count), copy button, "Fastest" highlight. Comparison bar chart (response time + word count normalized bars). Running state shows skeleton loading per model. History drawer lists past experiments grouped by experiment_id with model dots, click-to-load, delete. Backend runs models in parallel via `ThreadPoolExecutor`, stores results in `agents.prompt_experiments` Pixeltable table. |
| `DatabasePage` | `database/database-page.tsx` | Pixeltable catalog browser. Left panel lists all tables/views grouped by category with icons (green for tables, blue for views), column count, and row count — includes a **search input to filter tables** by name and a **Join** toggle button. Clicking a table shows schema header (column chips color-coded: gray for insertable, amber for computed), a **row filter** input for client-side text search across all columns, a **Download CSV** button (exports visible/filtered rows), and a scrollable data grid with pagination. **Cross-Table Join panel**: pick two tables, select matching columns, choose join type (INNER/LEFT/CROSS), view combined results in a data grid — uses Pixeltable's `table.join()` API. |
| `DeveloperPage` | `developer/developer-page.tsx` | **Developer** — data export, API reference, SDK snippets, and integration hub. **Export tab**: table picker (auto-lists all Pixeltable tables with column/row info), format selector (JSON/CSV/Parquet), row limit, 5-row live preview, download button + curl equivalent. **API tab**: categorized endpoint reference (Chat & Agent, Files, Generation, Prompt Lab, Data Export, Database, Memory) with method badges (color-coded GET/POST/PUT/DELETE), expandable curl examples with copy. **Python SDK tab**: curated code snippets (connect, query, semantic search, export to Pandas, image similarity, insert + computed columns, version control). **Connect tab**: MCP setup (JSON config for Claude/Cursor), Direct Python access, REST API curl, and external links (Pixeltable docs, GitHub, MCP server, LLMs.txt). |
| `SettingsPage` | `settings/settings-page.tsx` | Persona list + editor (prompts, temperature, max_tokens) |

### UI Components (`frontend/src/components/ui/`)

Radix UI primitives wrapped with Tailwind styling:

`badge.tsx`, `button.tsx`, `dialog.tsx` (flexbox-centered overlay, default `max-h-[85vh]` — pass `overflow-y-auto` for scrollable dialogs), `input.tsx`, `scroll-area.tsx`, `select.tsx`, `slider.tsx`, `tabs.tsx`, `textarea.tsx`, `toast.tsx`

## Conventions

- **Naming**: Files/dirs lowercase-with-dashes, components PascalCase, logic camelCase
- **Exports**: Named exports only (no default exports)
- **Styling**: Tailwind CSS with theme variables in `index.css`; use `cn()` for conditional classes
- **State**: React hooks + local state; no global state manager
- **API calls**: All go through `src/lib/api.ts`; backend prefixed with `/api`
- **Types**: Shared in `src/types/index.ts`
- **Backend user isolation**: All Pixeltable queries filter by `user_id` (currently `config.DEFAULT_USER_ID`)

## Development Workflow

```bash
# Backend (terminal 1)
cd backend && python main.py

# Frontend (terminal 2)
cd frontend && npm run dev

# Production build
cd frontend && npm run build  # → backend/static/
cd ../backend && python main.py  # serves both
```

## Key Pixeltable Patterns

- **Schema**: Defined once in `setup_pixeltable.py`, run to initialize
- **Pydantic row models**: All table inserts use validated Pydantic models from `models.py` (Pixeltable's `insert()` accepts `Iterable[BaseModel]` natively)
- **Computed columns**: Auto-trigger on insert (LLM calls, embeddings, thumbnails, auto-summarization)
- **Auto-summarization**: Documents get `document_text` (extracted via UDF) → `summary` (Gemini structured JSON output with title, summary, key_topics)
- **Structured outputs**: Gemini `response_mime_type: "application/json"` + `response_schema: Model.model_json_schema()` forces validated JSON from LLMs via Pydantic schemas (`FollowUpResponse`, `DocumentSummary` in `models.py`). Used for doc summaries and follow-up question generation.
- **Embedding indexes**: Enable `.similarity()` for semantic search
- **Tool calling**: `pxt.tools()` + `pxt.invoke_tools()` for agent tool use
- **Views + Iterators**: `DocumentSplitter` (separators `"page, sentence"` — works for PDFs, HTML, Markdown, etc.), `FrameIterator` (`keyframes_only=True`), `AudioSplitter` for data transformation
- **Event loop**: `main.py` uses `loop="asyncio"` in `uvicorn.run()` (not uvloop) so that Pixeltable's internal `nest_asyncio.apply()` works correctly
- **Video UDFs**: `pixeltable.functions.video` — `get_metadata`, `get_duration`, `extract_frame`, `clip`, `overlay_text`, `scene_detect_content` used on-demand in Studio transforms (not computed columns)
- **model_kwargs**: Anthropic LLM params that can be `None` (e.g. `top_k`, `top_p`, `stop_sequences`) must NOT be passed to the API — only include non-nullable values in `model_kwargs`
- **Table schema introspection**: Use `tbl._get_schema()` to get `{col_name: ColumnType}` — do NOT use `tbl.column_types()` (Pixeltable's `__getattr__` intercepts it as a column name). String representations: `Int`, `Float`, `Bool`, `String` (with `| None` suffix if nullable)
- **Catalog browsing**: `pxt.list_tables(namespace, recursive=True)` lists all tables/views. `tbl.columns()` returns column names. `tbl.get_base_table()` returns the parent table for views (None for base tables). `tbl.count()` returns row count.
- **Table revert**: `tbl.revert()` undoes the last operation (insert, update, delete) on a table. Can be called repeatedly for infinite undo. Used in the CSV workspace Undo button.
- **Table versioning**: `tbl.get_versions(n?)` returns `list[VersionMetadata]` (version, created_at, change_type, inserts, updates, deletes, errors, schema_change). `tbl.history(n?)` returns a pandas DataFrame for human-readable output. Used in the CSV workspace Version History panel.
- **Retrieval UDF**: `pxt.retrieval_udf(table, parameters=[...], limit=N)` creates a UDF for key-based lookups on structured tables. Used in `query_csv_table` for precise CSV row retrieval when the agent provides structured JSON lookup params.
- **On-demand ML inference**: `studio.py` uses HuggingFace `transformers` directly (not Pixeltable computed columns) for on-demand object detection (DETR), panoptic segmentation (DETR Panoptic), and image classification (ViT). Models are loaded lazily and cached in `_model_cache` dict for fast subsequent calls. Results include bounding boxes for detection, segment regions (with "thing" vs "stuff" distinction, pixel counts, and derived bounding boxes) for segmentation, and top-k class probabilities for classification.
- **Text-to-Speech**: `agents.speech_tasks` table with `input_text` and `voice` columns. `audio` computed column uses `openai.speech()` (model `tts-1`). Six voice options: alloy, echo, fable, onyx, nova, shimmer. Audio files cached by Pixeltable.
- **Cross-table joins**: `table1.join(table2, on=col1 == col2, how='inner'|'left'|'cross')` combines rows from two tables. Exposed via `POST /api/db/join` endpoint. UI in Database page allows selecting tables, columns, join type, and previewing results in a data grid.
- **Prompt experiments**: `agents.prompt_experiments` table stores multi-model experiment results (experiment_id groups rows from the same run). Defined in `setup_pixeltable.py` alongside all other tables. Models are called directly via provider SDKs (Anthropic, Google GenAI, Mistral, OpenAI) with `ThreadPoolExecutor` for parallel execution. Custom model IDs supported via provider inference from name prefix.
- **Reve AI image editing**: `pixeltable.functions.reve` provides three UDFs — `create(prompt)`, `edit(image, edit_instruction)`, `remix(prompt, images)`. Edit is used via Pixeltable `select()` on-demand (e.g., `gen_table.select(edited=reve.edit(gen_table.generated_image, instruction))`). Remix is called directly with collected PIL images. Results are saved to temp files, then persisted via `_save_reve_temp()` → `/reve/save` → `agents.images` insert. Requires `REVE_API_KEY` environment variable.
