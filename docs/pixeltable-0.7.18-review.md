# Pixelbot / Pixeltable 0.7.18 review

Reviewed October 16, 2026. Baseline: `28bb68523a9eee072a94ca64fdef02c324a09e21` (`main`). The change is intended for a developer evaluating Pixeltable through a runnable local app.

| Job | Success criterion | Evidence |
| --- | --- | --- |
| Set up and inspect the app | Apply the schema, serve the interface, inspect real tables | Fresh schema apply, managed service, HTTP smoke checks |
| Ask a question and return to it | Preserve the first response, use the right recent conversation, show failures honestly | React interaction tests, real local query test; paid answers mocked |
| Explore media | Run local transforms, inspect stored vectors, generate through computed columns | Synthetic-video tests, real CLIP search and DETR forward pass; cloud generation mocked |
| Understand the showcase | Connect each visible feature to a Pixeltable capability | Revised README, Architecture copy, live Database inspector |

## Findings corrected

| Priority | Baseline defect | Correction and evidence |
| --- | --- | --- |
| P1 | The first message changed the keyed component from `new` to a UUID, unmounting the pending response | Stable draft identity; a test failed on the baseline and now retains the first answer |
| P1 | Image/video defaults used retired Imagen/Veo endpoints, and Prompt Lab listed retired or nonexistent Claude models | Current documented Gemini and Claude defaults, image output through `generate_content`, Omni through a stored UDF; request wiring tested with mocks |
| P1 | Studio called `video.resize(size=...)`, which 0.7.18 rejects | Use `width=` and `height=`; reproduced on a generated MP4 and verified after the fix |
| P2 | Recent conversation context filtered by user only | Add a nullable conversation ID to agent rows and filter recent history by it; exercised in a real computed query |
| P2 | Persona token limits were recorded but omitted from Gemini requests | Bind `max_output_tokens` in the computed expressions |
| P2 | The embedding map constructed embedding calls on reads and failed on tiny collections | Read `.embedding()` from stored indexes; cover one through four points, invalid vectors, and total limits |
| P2 | A nonempty tool-output object with only null values appeared as tool usage | Count actual tool results; regression test |
| P2 | Failed speech saves resolved successfully to the button; failed prompts disappeared | Preserve errors and prompts; keep failed saves retryable; regression tests |
| P2 | Queue draining scheduled requests inside a React state updater and reused stale mode/persona settings | Drain requests outside state updaters, snapshot each job, and stop queued work after leaving; StrictMode test |
| P2 | Structured Pixeltable/FastAPI errors became unreadable client messages | Preserve public Pixeltable error fields and format validation messages; diagnostics stay out of responses |
| P2 | Studio's detection and scene tools lacked required dependencies | Include Torchvision, timm, and SceneDetect; real CLIP indexing/search, DETR forward pass, and scene detection passed |
| P2 | Desktop-only navigation and fixed panels obstructed compact screens | Navigation drawer, stacked panels, accessible names/focus, reduced motion, and wrapping composer controls |
| P2 | Frontend installation reported 20 dependency advisories | Compatible dependency updates; `npm audit` reports zero known vulnerabilities |
| P3 | README and product copy assumed contributor knowledge, a personal name, unavailable DALL-E support, and a nonexistent CSV agent tool | User-oriented tour and setup; configurable greeting; corrected capability claims and links to more examples |

The default final prompt now asks for useful, grounded answers instead of “just a few words.” Chat history writes both sides of a turn together and reports a save failure without discarding the answer. Empty-table sampling returns an empty result. CSV counts use `count()` instead of loading every row. Invalid boolean values, fractional integer edits, and non-finite numbers are rejected before they can silently change stored data.

## Compatibility and migration

[Pixeltable 0.7.18](https://pypi.org/project/pixeltable/0.7.18/) is pinned in the project and lockfile. Google GenAI 2.31+ supplies the current Interactions API. Model defaults were checked against [Google's deprecation schedule](https://ai.google.dev/gemini-api/docs/deprecations), [Omni's API guide](https://ai.google.dev/gemini-api/docs/omni), and [Claude's lifecycle and sampling guidance](https://platform.claude.com/docs/en/about-claude/model-deprecations).

The original schema was recreated in a separate temporary catalog using the 0.7.18 SDK, then updated to the final declarations. The plan had five additive table updates, zero unsupported changes, and zero destructive changes. The only added column is nullable `conversation_id`; no new computed column triggers a media backfill. Applying without destructive flags succeeded. A subsequent diff reported all 19 models up to date.

This checks application-schema reconciliation. It does not independently exercise an embedded database binary upgrade from a previously populated 0.7.7 home directory. The old `agents` catalog was never opened. Stored results remain in place; regenerating them requires an intentional `pxt recompute`.

## Verification

Local environment: macOS arm64, Python 3.14.7, Pixeltable 0.7.18.

- Ruff lint/format and mypy pass.
- Backend: 55 tests pass, including eight real local video operations: metadata, frame extraction, clipping, overlay, crop, resize, scene detection, and concatenation.
- Frontend: five contract tests and seven interaction/API tests pass; ESLint and TypeScript/Vite build pass. Initial production chunk is about 310 kB, below Vite's 500 kB warning threshold.
- Locked dependency sync and a fresh Python 3.11 dependency resolution pass. Component tests use a jsdom release compatible with the documented Node 22.12 minimum.
- Source and wheel distributions build; package contents and wheel import are checked separately.
- The real managed service returns 200 for health, memory/personas, media lists, Studio, catalog/lineage, experiment configuration, integrations, and export listings. Missing-key chat returns a typed 403 instead of a generic 500.
- CSV upload, read, append, update, undo, delete, and version history succeeded through HTTP in the isolated catalog.
- Desktop and 390px-wide dark-mode browser checks cover chat, navigation, and populated Studio without document overflow. Component tests cover pending, success, error, queue, and failed-save behavior. Light-mode styles were reviewed in source; no screen-reader audit was performed.
- The UI detector reported one existing Markdown blockquote border. This is a semantic quotation rule, not a new card accent; it was retained.

The first Linux CI run exposed a missing system prerequisite: FFmpeg was absent from the runners, so five real video-operation cases failed. The workflow now installs FFmpeg, and setup guidance names it explicitly. These cases are retained as real execution tests.

Provider mocks prove wiring, not model availability, output quality, billing, or account-specific access. No paid inference, actual notifications, hosted deployment, or Cloud service tests were run. Local model smoke checks use generated images; retrieval and detection quality were not evaluated. Python 3.11–3.13 and Linux are covered by the CI matrix, not claimed as local runs.

## Change map

| Area | Files | Review focus |
| --- | --- | --- |
| Schema and inference | `schema.py`, `config.py`, `functions.py`, `models.py` | Current API shape, model contracts, stored computation, conversation boundaries |
| HTTP | `app.py`, chat/experiments/images/studio/database routers | Error contracts, input bounds, persistence, local operations, stored vector reads |
| Interface | Shell, chat/progress, Studio, Settings, Database, Prompt Lab, media and developer views; shared dialog/toast/CSS | First use, request lifecycle, recovery, responsive access, truthful claims |
| Dependencies and distribution | Python/npm manifests and lockfiles, CI, generated SPA | Reproducibility, required runtimes, known frontend advisories, bundled assets |
| Documentation | README, contributor/design/development guides, historical upgrade note | Runnable sequence, accurate migration guidance, capability explanation |

Existing unrelated integrations, provider quality, all document formats, every detection preset, and every advanced panel were not exhaustively exercised. The checks above define the review's execution boundary.
