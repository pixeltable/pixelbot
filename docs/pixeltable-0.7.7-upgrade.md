# Pixelbot 3.0 / Pixeltable 0.7.7 upgrade evidence

Retrieved 2026-09-11.

| Item | Evidence |
|---|---|
| Pixelbot baseline | commit `ef73dc01e0461574d94ca34867924019a142bf7a` |
| Pixeltable release | tag `v0.7.7`, commit `8d14e6c88d3dcd749d71ef5799447454470f68f9`, released 2026-09-10 |
| Published wheel | `pixeltable-0.7.7-py3-none-any.whl`, SHA-256 `0642d78d3f90766cc6cec60c587b9e19682df1241dde8000d8e1856a2838610f` |
| Guidance reviewed | Canonical Pixeltable skill `2.10.1`, commit `cd5705537bd2cbc95269706e9092d623e754b05d`, reviewed 2026-09-11 |
| Python support | Pixeltable 0.7.7 requires Python 3.11+ |
| Skill baseline | bundled Pixeltable skill 2.10.0 |

## Reproduced baseline defects

- The isolated Pixeltable 0.6.5 smoke suite passed.
- With 0.7.7, four smoke assertions failed because public metadata renamed `indices` to `indexes`.
- Existing code called `recompute_columns(columns=...)`; 0.7.7 accepts positional columns and `errors_only=`.
- `pixeltable.functions.reve` is absent from 0.7.7.
- A 0.7.7 model with non-nullable columns and targeted indexes produced fatal differences against the nullable, default-indexed 0.6.5 catalog. Version 3 therefore has no in-place catalog migration.
- Editable backend installation failed because the flat repository layout exposed multiple top-level packages.
- The original frontend build passed, while lint reported eight errors and four warnings. The initial JavaScript chunk was 981 kB.

## Implemented contract

The backend is one installable `pixelbot` package. `pixelbot/app.py` and `pixelbot/schema.py` define an import-safe app, typed schema, queries, routes, and custom API. Endpoint-facing reads use `@pxt.query` with `FastAPIRouter`; custom FastAPI handlers remain for validation-heavy writes and HTTP-specific behavior. The local target is `pixelbot_v3`; scratch CSVs use `pixelbot_scratch`. Startup no longer creates schema or falls back to an unusable service.

The database UI/API is read-only. Reve and its three routes are removed. Pipeline metadata exposes `indexes`. Uploads, remote URLs, catalog paths, exports, media paths, and webhook destinations have explicit boundaries. The frontend loads routes lazily and packages its build under `pixelbot/static`.

## Reproduction

```bash
cd backend
export PIXELTABLE_HOME="$(mktemp -d)"
uv sync --locked --group dev
uv run pxt schema check pixelbot/app.py
uv run pxt schema update pixelbot/app.py pixelbot_v3 --dry-run --json  # exit 2 when pending
uv run pxt schema update pixelbot/app.py pixelbot_v3 -f
uv run pxt schema diff pixelbot/app.py pixelbot_v3 --json             # exit 0 when clean
uv run pxt service update pixelbot/app.py pixelbot_v3 app --port 8000 -f
uv run pxt service list --json
curl --fail http://127.0.0.1:8000/api/health
uv run pxt service logs pixelbot_v3/app --tail 50
uv run pxt service stop pixelbot_v3/app
```

## Test boundaries

Verified locally on 2026-09-11:

- Pixeltable 0.7.7 accepted the application file, and a fresh isolated catalog dry run reported 19 creates with zero unsupported or destructive operations (the documented pending-diff exit code was 2).
- Ruff check/format and mypy passed all 21 backend source files; pytest passed the deterministic contract suite.
- The wheel and sdist built, and a clean Python 3.11 environment imported the 3.0.0 wheel and found its bundled SPA.
- Frontend tests and lint passed. The production build had no 500 kB chunk warning: the initial chunk was 271.64 kB and the largest route chunk was 146.57 kB.

A fresh local schema apply completed with 19 models. A second diff reported all 19 models up to date, and the managed service started on port 8000 with working health, SPA, and read-only catalog routes. Pixeltable currently reorders JSON objects through PostgreSQL JSONB during catalog persistence, so response schemas and tool declarations are declared in the same deterministic key order to keep subsequent schema diffs clean. Video and audio transcript text and embedding indexes live directly on their iterator views; this avoids a 0.7.7 schema-apply stall observed when creating redundant filtered sentence views.

On September 12, 2026, the read API was simplified against the canonical Pixeltable app guidance. The duplicated `pixelbot/queries.py` execution layer and versioned memory/persona reads were removed. `pixelbot/app.py` now declares the endpoint queries and exposes them through `FastAPIRouter`; custom FastAPI handlers retain the validation-heavy writes. A catalog created from the merged 3.0 schema remained fully in agreement (19 of 19 models, zero schema operations), and a real managed service returned 200 from the canonical memory and persona reads while the removed versioned routes returned 404.

A second simplification removed unused file-wide deletion, per-entry workflow, TTS voice-list, and standalone database schema/version endpoints. Duplicate route-level exception wrappers now fall through to the application's sanitized error handler, while expected validation and missing-resource responses remain explicit. Retries remain only on read-only operations so provider calls and catalog writes cannot be repeated after partial success. Notification delivery is implemented once for both HTTP tests and Pixeltable tools, returns typed delivery status, and stores a redacted destination origin.

The pytest fixture now reuses one isolated Pixeltable catalog and stops its PostgreSQL server when the session ends. Two consecutive full backend runs passed with 15 tests and left no Pixelbot test database process running.

Torch and Transformers remain base dependencies because the declared CLIP indexes power core image and video-frame retrieval. Making Studio detection optional would not reduce the installation until those indexes move to another embedding model; that change requires retrieval-quality evaluation and similarity-threshold retuning and is outside this behavior-preserving cleanup.

Provider calls are mocked and establish wiring only. Paid provider calls, hosted deployment, Cloud behavior, and the 48 agent trials were not run. Validation used a separate temporary `PIXELTABLE_HOME`; the old `agents` catalog was not changed.
