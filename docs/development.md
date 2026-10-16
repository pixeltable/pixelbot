# Developing Pixelbot

Run backend commands from `backend/` with the same catalog used at setup:

```bash
export PIXELTABLE_HOME="$PWD/.pixeltable-v3"
uv sync --locked --group dev
uv run --env-file .env pxt schema check pixelbot/app.py
uv run --env-file .env pxt schema diff pixelbot/app.py pixelbot_v3
uv run --env-file .env pxt schema update pixelbot/app.py pixelbot_v3 -f
uv run --env-file .env pxt service update pixelbot/app.py pixelbot_v3 app --port 8000 -f
```

Schema creation and HTTP serving are separate steps. After a schema change, refresh the service or its routes can return 409. `pxt service list` shows the assigned endpoint. Pixelbot requests port 8000 explicitly so the frontend's development proxy can find it; choose another port if that port is occupied and update `frontend/vite.config.ts` accordingly.

For frontend development, run `npm run dev` from `frontend/`. Its `/api` requests proxy to the local service. `npm run build` updates the production assets in `backend/pixelbot/static/`; rebuild before packaging or restarting the production service.

## Provider configuration

Keys in `backend/.env` are loaded by `uv run --env-file .env`. The Pixeltable daemon reads its environment at startup. After changing keys, restart it from `backend/`, then restart the service:

```bash
uv run --env-file .env pxt daemon restart
uv run --env-file .env pxt service restart pixelbot_v3/app
```

The defaults are Gemini Flash for chat and summaries, Nano Banana for images, Omni for video, Whisper for transcription, OpenAI TTS for speech, and local CLIP for visual retrieval. Model overrides are in `.env.example`. Changing a schema-bound model requires another schema update. Text embeddings remain `gemini-embedding-001` so existing indexes and similarity thresholds retain their meaning. Changing an embedding model requires rebuilding the indexes and evaluating retrieval quality.

Image generation uses `gemini.generate_content` with image output. Omni uses the Gemini Interactions SDK from a Pixeltable UDF; its output is stored in a native Video column. Prompt Lab uses provider SDKs directly and stores comparison results in Pixeltable. Current Claude presets use fixed sampling, so the temperature slider applies to the other providers.

## Upgrade an existing Pixelbot 3 catalog

Keep the same `PIXELTABLE_HOME`. Sync dependencies, inspect the schema diff, apply it, and refresh HTTP using the commands above. The 0.7.18 upgrade adds a nullable conversation ID and changes computed expressions without dropping existing rows or regenerating stored media.

Pixeltable 0.7.18 supports updating a computed expression through `pxt schema update`. Existing stored values are retained; use `pxt recompute TABLE COLUMN -f` only when you intentionally want to regenerate them, since this can repeat paid inference or tool side effects. Column type changes and changes between stored and computed columns still need a separate migration. Do not use destructive flags to force an unsupported change.

## Inspect and recover

```bash
uv run pxt service list
tail -50 "$PIXELTABLE_HOME/logs/services/pixelbot_v3/app.log"
uv run pxt errors pixelbot_v3/collection
uv run pxt recompute pixelbot_v3/collection summary --errors-only -f
uv run pxt service stop pixelbot_v3/app
```

Errors-only recomputation takes one column. Local `pxt service logs` reports the log path; read the file to see its contents. The Database page is an inspector; schema and index changes belong in the declarations. CSV workspace mutations use registered UUIDs under `pixelbot_scratch`.

Uploads and URL downloads are capped at 100 MB. URL ingestion permits public HTTP(S) destinations; media serving checks resolved paths against the upload directory and configured catalog. These limits support a local demo; the app has no multi-user authentication or hosted deployment configuration.

## Validation

```bash
# backend/
uv run ruff format --check pixelbot tests
uv run ruff check pixelbot tests
uv run mypy pixelbot
uv run pytest
uv build

# frontend/
npm ci
npm test
npm run lint
npm run build
npm audit
```

Tests use a temporary catalog. Component tests exercise pending requests, failures, and save state; provider mocks verify request wiring. Live paid inference is a separate check. See the [review evidence](pixeltable-0.7.18-review.md) for coverage and limits.
