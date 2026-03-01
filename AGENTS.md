# AGENTS.md

Instructions for AI coding agents working with this project.

## Pixeltable Resources

Before modifying this codebase, familiarize yourself with Pixeltable:

- **Core AGENTS.md** — [pixeltable/pixeltable/AGENTS.md](https://github.com/pixeltable/pixeltable/blob/main/AGENTS.md) covers the full SDK: tables, computed columns, views, iterators, UDFs, embedding indexes, and all AI provider integrations.
- **Claude Code Skill** — [pixeltable/pixeltable-skill](https://github.com/pixeltable/pixeltable-skill) gives Claude deep Pixeltable expertise via progressive disclosure (`SKILL.md` → `API_REFERENCE.md`).
- **MCP Server** — [pixeltable/mcp-server-pixeltable-developer](https://github.com/pixeltable/mcp-server-pixeltable-developer) exposes Pixeltable as an MCP server for interactive exploration (tables, queries, Python REPL).
- **Docs** — [docs.pixeltable.com](https://docs.pixeltable.com/) · [SDK Reference](https://docs.pixeltable.com/sdk/latest/pixeltable)

## What Pixelbot Is

A full-featured multimodal AI agent built on Pixeltable + FastAPI + React. Ten pages, 10 routers, ~50 API endpoints.

## Files to Read First

1. `backend/setup_pixeltable.py` — the core. Defines every table, view, computed column, embedding index, and the 11-step agent pipeline. (~570 lines)
2. `backend/models.py` — Pydantic row models (validated before every insert), API response models, and LLM structured output schemas.
3. `backend/functions.py` — `@pxt.udf` definitions used by the agent pipeline.
4. `backend/config.py` — all model IDs, prompts, env-driven settings, and `CORS_ORIGINS` in one place.
5. `backend/utils.py` — `@pxt_retry` decorator (critical for production stability).
6. `backend/routers/chat.py` — the main agent endpoint, shows insert-triggers-pipeline pattern.

## Conventions

- **Naming**: files/dirs lowercase-with-dashes, components PascalCase, logic camelCase
- **Exports**: named exports only (no default exports)
- **Styling**: Tailwind CSS with theme variables in `index.css`; use `cn()` from `lib/utils.ts` for conditional classes
- **State**: React hooks + local state; no global state manager
- **API calls**: all go through `frontend/src/lib/api.ts`; backend prefixed with `/api`
- **Types**: shared in `frontend/src/types/index.ts`
- **User isolation**: all Pixeltable queries filter by `user_id` (currently `config.DEFAULT_USER_ID`)
- **UI components**: Radix primitives wrapped with Tailwind in `frontend/src/components/ui/` — use these instead of importing Radix directly

## Backend Routers

All routers use prefix `/api` (except `database.py` → `/api/db`, `studio.py` → `/api/studio`, `experiments.py` → `/api/experiments`, `export.py` → `/api/export`).

| Router | Key Endpoints |
|---|---|
| `chat.py` | `POST /query` — 11-step agent workflow |
| `files.py` | `POST /upload`, `POST /add_url`, `DELETE /delete_file/{uuid}/{type}`, `GET /context_info` |
| `history.py` | `GET /conversations`, `GET /conversations/{id}`, `DELETE /conversations/{id}`, `GET /workflow_detail/{ts}`, `GET /debug_export` |
| `images.py` | `POST /generate_image`, `GET /image_history`, `POST /generate_video`, `GET /video_history`, `POST /generate_speech`, `POST /save_generated_image`, `POST /save_generated_video` |
| `memory.py` | `POST /memory`, `POST /memory/manual`, `GET /memory`, `DELETE /memory/{ts}` |
| `personas.py` | CRUD on `/personas` |
| `studio.py` | `/api/studio/` — file browsing, image/video transforms, embeddings, CSV CRUD with undo, AI detection, Reve AI editing |
| `database.py` | `/api/db/` — table listing, paginated rows, schema, sampling, timeline, cross-table join, pipeline DAG |
| `experiments.py` | `/api/experiments/` — multi-model prompt comparison, parallel execution via ThreadPoolExecutor |
| `export.py` | `/api/export/` — JSON/CSV/Parquet export, JSON column serialization, preview |
| `integrations.py` | `/api/integrations/` — notification service status, test send, activity log |

## Frontend Routes

| Route | Component | Description |
|---|---|---|
| `/` | `ChatPage` | Chat with greeting, action chips, multi-conversation, image/video/voice generation modes |
| `/history` | `HistoryPage` | Conversations list + unified timeline feed |
| `/memory` | `MemoryPage` | Memory bank with semantic search |
| `/images` | `ImagesPage` | Media Library — generated images/videos gallery, Reve AI editing |
| `/studio` | `StudioPage` | File explorer, transforms, CSV CRUD with undo/versioning, embedding map, AI detection |
| `/experiments` | `ExperimentsPage` | Prompt Lab — multi-model side-by-side comparison |
| `/database` | `DatabasePage` | Pixeltable catalog browser, pipeline DAG inspector, sampling, joins |
| `/developer` | `DeveloperPage` | Data export, API reference, SDK snippets, MCP config |
| `/integrations` | `IntegrationsPage` | Notification services (Slack, Discord, webhook), test send, activity log |
| `/architecture` | `ArchitecturePage` | Interactive React Flow pipeline diagram |
| `/settings` | `SettingsPage` | Persona editor |

## Architectural Decisions

Each decision below is intentional. Don't change it without understanding why.

### Pixeltable IS the data layer

There is no ORM, no SQLAlchemy, no direct PostgreSQL client. Pixeltable handles storage, indexing, transformation, and retrieval. `setup_pixeltable.py` defines the entire data model declaratively. All routers interact with Pixeltable directly via `pxt.get_table()`, `.insert()`, `.select()`, `.collect()`.

### Sync endpoints (`def`, not `async def`)

All FastAPI endpoints use `def`, not `async def`. Pixeltable operations are synchronous and thread-safe. Uvicorn runs sync endpoints in a thread pool automatically. Using `async def` would block the event loop since Pixeltable calls are blocking.

### Schema-as-code (`setup_pixeltable.py`)

Run once to initialize or reset the schema. Uses `drop_dir("agents", force=True)` for a clean slate, then creates everything idempotently. The schema defines:

1. **Document pipeline** — table → `DocumentSplitter` view → Gemini embedding → auto-summarization via Gemini structured output
2. **Image pipeline** — table → thumbnail → CLIP visual embedding index → Gemini captioner (table-as-UDF)
3. **Video pipeline** — table → `FrameIterator` view (keyframes + CLIP) → audio extraction → Whisper transcription → `StringSplitter` view → Gemini embedding
4. **Audio pipeline** — table → `AudioSplitter` → Whisper transcription → `StringSplitter` → Gemini embedding
5. **Chat history** — table with Gemini embedding index for memory retrieval
6. **Memory bank** — user-managed knowledge base with Gemini embedding search
7. **Personas** — customizable agent behavior profiles
8. **Image generation** — Gemini Imagen
9. **Video generation** — Gemini Veo
10. **Speech generation** — OpenAI TTS
11. **CSV registry** — tracks user-uploaded tabular data
12. **Prompt experiments** — multi-model comparison workspace
13. **Agent pipeline** — 11 chained computed columns on `agents.tools` (all Gemini)

### Agent pipeline as computed columns

The entire tool-calling agent is a chain of `add_computed_column()` calls. Inserting a row triggers the full pipeline: history retrieval → tool-selection message assembly → tool planning → execution → multimodal RAG → context assembly → final answer → follow-up generation. The router just inserts and reads back.

**Critical**: the tool-selection LLM call (step 1) receives recent chat history via `build_tool_selection_messages()` so it has conversational context. Without this, follow-up requests like "send that to Slack" would lose track of what "that" refers to.

### Pydantic row models for ALL inserts

Every `table.insert()` goes through a validated Pydantic model from `models.py`. This catches schema mismatches before they hit Pixeltable. Pixeltable's `insert()` accepts `Iterable[BaseModel]` natively.

### Structured LLM outputs

`FollowUpResponse` and `DocumentSummary` in `models.py` define the JSON shapes enforced by Gemini's `response_schema`. The LLM returns validated, parseable JSON instead of free-form text. Gemini's `response_mime_type: "application/json"` + `response_schema` is the native way to get structured output.

### `@pxt_retry` for production resilience

Every router function that touches Pixeltable is wrapped with `@pxt_retry(max_attempts=3, delay=0.5, backoff=2.0)` from `utils.py`. This retries on transient connection errors (psycopg `INTRANS`, closed connections, assertion guards) that occur under concurrent load.

### Gemini-first LLM strategy

All LLM calls use `gemini.generate_content()` and `gemini.generate_embedding()`. Only exceptions: Whisper (transcription), TTS (speech), CLIP (visual embeddings). Claude/Mistral/OpenAI models are still available in the Prompt Lab for multi-model comparison, but the agent pipeline is all-Gemini. Message format uses `role: "user"/"model"` with `parts: [{text: "..."}]`.

### Single-user local mode

No authentication. `DEFAULT_USER_ID = "local_user"` in `config.py`. All queries filter by `user_id` so adding auth later only requires replacing this constant.

### On-demand ML inference (not computed columns)

Object detection (DETR), segmentation, and classification (ViT) in `studio.py` use HuggingFace `transformers` directly with lazy model loading and an in-memory `_model_cache`. These are NOT computed columns because they're interactive/on-demand operations.

### SPA fallback

`npm run build` outputs to `backend/static/`. FastAPI's catch-all `/{full_path:path}` serves the built frontend. One process, one port in production. In development, Vite's proxy forwards `/api` to the backend.

## Pixeltable Patterns

Operational knowledge for working with Pixeltable in this codebase:

- **Table introspection**: Use `tbl.get_metadata()` — returns columns (with `type_`, `computed_with`, `is_stored`), `is_view`, `base`, `indices`, `version`. Do NOT call `tbl.column_types()` (Pixeltable's `__getattr__` intercepts it as a column name).
- **Catalog browsing**: `pxt.list_tables(namespace, recursive=True)` lists all tables/views. `tbl.columns()` returns column names. `tbl.count()` returns row count.
- **Table revert**: `tbl.revert()` undoes the last operation. Can be called repeatedly for infinite undo.
- **Table versioning**: `tbl.get_versions(n?)` returns `list[VersionMetadata]` with change_type, inserts, updates, deletes, errors, schema_change.
- **Server-side pagination**: `query.limit(n, offset=)` for proper page skipping (not client-side slicing).
- **Data sampling**: `query.sample(n=, fraction=, stratify_by=, seed=)` for random or stratified subsets.
- **Cross-table joins**: `table1.join(table2, on=col1 == col2, how='inner'|'left'|'cross')`.
- **Views + Iterators**: `DocumentSplitter` (separators `"page, sentence"`), `FrameIterator` (`keyframes_only=True`), `AudioSplitter` (`duration=`) for data transformation.
- **Video UDFs**: `pixeltable.functions.video` — `get_metadata`, `get_duration`, `extract_frame`, `clip`, `overlay_text`, `crop`, `scene_detect_content`.
- **Column metadata**: `get_metadata()['columns'][name]` may include `comment` (string) and `custom_metadata` (dict).
- **JSON `dumps()` UDF**: `pixeltable.functions.json.dumps(column)` serializes complex columns to JSON strings.
- **Reve AI**: `pixeltable.functions.reve` — `create(prompt)`, `edit(image, instruction)`, `remix(prompt, images)`. Requires `REVE_API_KEY`.
- **Notification UDFs**: `send_slack_message`, `send_discord_message`, `send_webhook` in `functions.py`. Each wraps a simple `requests.post()` (~10 lines). Registered as agent tools so the chat agent can send notifications autonomously. Activity logged to `agents.notifications` table. Configure via `SLACK_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL`, `WEBHOOK_URL` in `.env`.
- **Table-as-UDF**: `agents.captioner` encapsulates a Gemini vision pipeline (image → caption text). `pxt.udf(captioner, return_value=captioner.caption)` converts the table into a callable function. Used as a computed column on `agents.images` so every uploaded image gets auto-captioned. Captions are included in `search_images` results.
- **Event loop**: `main.py` omits `loop=` in `uvicorn.run()` so uvicorn auto-detects uvloop. Pixeltable ≥ 0.5.19 has native uvloop compatibility (#1164).

## Key Patterns to Follow

When extending this codebase:

**Adding a new data type:**
1. Add a table in `setup_pixeltable.py` with `pxt.create_table()`
2. Add views/iterators for processing (`create_view` + iterator)
3. Add embedding indexes for search (`add_embedding_index`)
4. Add a `@pxt.query` function for similarity search
5. Add a Pydantic row model in `models.py`
6. Add router endpoints with `response_model=`
7. Wrap router functions with `@pxt_retry()`

**Adding a computed column:**
```python
table.add_computed_column(
    new_col=some_function(table.existing_col),
    if_exists="ignore",
)
```

**Adding a tool to the agent:**
1. Define the function with `@pxt.udf` or `@pxt.query`
2. Add it to the `pxt.tools()` call in `setup_pixeltable.py`
3. Re-run `python setup_pixeltable.py`

**Using a table as a UDF (pipeline reuse):**
```python
# 1. Create a table with computed columns (the pipeline)
agent_table = pxt.create_table('ns.agent', {'input': pxt.String})
agent_table.add_computed_column(step1=llm_call(agent_table.input))
agent_table.add_computed_column(result=extract(agent_table.step1))

# 2. Wrap as a callable UDF
agent_fn = pxt.udf(agent_table, return_value=agent_table.result)

# 3. Use in any other table's computed column
other_table.add_computed_column(output=agent_fn(input=other_table.col))
```
See `agents.captioner` in `setup_pixeltable.py` for a working example.

**Table introspection:**
Use `tbl.get_metadata()` — returns columns (with `type_`, `computed_with`, `is_stored`), `is_view`, `base`, `indices`, `version`. Do NOT call `tbl.column_types()` (Pixeltable's `__getattr__` intercepts it as a column name).

## What's Intentionally Omitted

- **Docker / deployment infra** — `python main.py` + `npm run dev` is the right DX for a demo app
- **JWT auth / sessions** — Single-user local mode is intentional
- **Global state manager** — React hooks + local state is sufficient
- **ORM / SQLAlchemy** — Replaced entirely by Pixeltable
- **API versioning (`/api/v1/`)** — Unnecessary complexity for a demo
