# Pixelbot

Pixelbot 3.0 is a local multimodal AI application built on Pixeltable 0.7.7. One application module, `backend/pixelbot/app.py`, exposes the declarative `TableModel` schema, Pixeltable query routes, the custom FastAPI API, and the bundled React interface.

Pixelbot keeps documents, images, video, audio, memory, chat history, generation jobs, prompt experiments, notifications, and tool calls in Pixeltable. Stored computed columns run extraction, chunking, transcription, captioning, generation, retrieval, and tool invocation when rows are inserted. Provider calls require the matching keys; local schema and API checks do not call paid providers.

The HTTP layer demonstrates a practical Pixeltable and FastAPI split. Table-backed reads such as `GET /api/memory`, `GET /api/memory/search`, and `GET /api/personas` are declared as `@pxt.query` functions and exposed through `FastAPIRouter`. Custom FastAPI handlers own validation-heavy writes, application defaults, and the SPA shell.

## Requirements

- Python 3.11–3.14
- Node.js 22.12 or newer
- `uv`
- Local media tools required by Pixeltable for the media pipelines

Pixelbot 3.0 uses a fresh local catalog. Set `PIXELTABLE_HOME` to `backend/.pixeltable-v3`. The application target is `pixelbot_v3`; CSV workspaces use the separate `pixelbot_scratch` namespace. The former `agents` catalog is never opened or migrated by this workflow.

## Install and run

```bash
cp .env.example backend/.env
cd backend
uv sync --locked --group dev
export PIXELTABLE_HOME="$PWD/.pixeltable-v3"

uv run --env-file .env pxt schema check pixelbot/app.py
uv run --env-file .env pxt schema diff pixelbot/app.py pixelbot_v3
uv run --env-file .env pxt schema update pixelbot/app.py pixelbot_v3 -f
uv run --env-file .env pxt service update pixelbot/app.py pixelbot_v3 app --port 8000 -f
```

Build the interface before producing a wheel:

```bash
cd ../frontend
npm ci
npm run lint
npm run build
```

Open `http://127.0.0.1:8000`. The Vite development server runs on port 5173 and proxies `/api` to port 8000.

## Operate and debug

```bash
cd backend
export PIXELTABLE_HOME="$PWD/.pixeltable-v3"

uv run pxt service list
uv run pxt service logs pixelbot_v3/app --since 10m --tail 50
uv run pxt errors pixelbot_v3/collection
uv run pxt recompute pixelbot_v3/collection summary --errors-only -f
uv run pxt service stop pixelbot_v3/app
```

`--errors-only` accepts exactly one computed column. A computed expression cannot be migrated in place: rename the column, or drop and re-add it in separate schema changes. `--allow-destructive` does not make that migration supported.

The Database page is an inspector for catalog rows, schemas, lineage, history, samples, joins, and computation errors. Schema and index changes are made in `pixelbot/schema.py` and applied with `pxt schema update`. CSV uploads remain editable only through their registry UUIDs in `pixelbot_scratch`.

## Safety boundaries

- Uploads are streamed to disk and capped by `MAX_UPLOAD_SIZE_MB`.
- Remote ingestion accepts public HTTP(S) destinations only.
- Media reads are confined to the upload root and configured `PIXELTABLE_HOME`, including resolved symlinks.
- Database inspection and exports are confined to `pixelbot_v3` and registered scratch tables, with result caps.
- The agent webhook tool can send only to `WEBHOOK_URL` configured at process startup.
- HTTP routes and agent tools share one notification transport, and catalog logs store only the destination origin.
- There is no runtime expression evaluation or general catalog mutation API.

## Validation

```bash
cd backend
uv run ruff format --check pixelbot tests
uv run ruff check pixelbot tests
uv run mypy pixelbot
uv run pytest
uv build

cd ../frontend
npm run lint
npm run build
```

See [`docs/pixeltable-0.7.7-upgrade.md`](docs/pixeltable-0.7.7-upgrade.md) for reviewed versions, reproduced failures, verification evidence, and live-test limits.
