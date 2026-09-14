# Pixelbot design system

This document is the source of truth for Pixelbot's product and interface design. It describes the system that exists in `frontend/` and the rules that should guide new screens and components.

## Product character

Pixelbot is a local multimodal AI workbench. The interface should feel calm enough for conversation, dense enough for data work, and explicit enough for developers to understand what the AI pipeline is doing.

The design follows four principles:

1. **Quiet by default.** Use near-neutral surfaces, subtle borders, and whitespace. Reserve strong color for meaning and state.
2. **Reveal capability progressively.** Keep the primary chat flow simple; expose generation modes, sources, tools, lineage, and diagnostics when they are relevant.
3. **Show the work.** Long-running AI operations should identify their current stage, elapsed time, source types, and recoverable results.
4. **Keep the data model visible.** Database, architecture, and developer views should make Pixeltable's tables, computed columns, indexes, lineage, and services understandable without turning the chat interface into an admin console.

## Technical foundation

The frontend uses a deliberately small stack:

| Layer | Foundation | Role |
| --- | --- | --- |
| Application | React 19 and TypeScript | Component and state model |
| Navigation | React Router | Shared application shell and page routes |
| Build | Vite | Development server, production assets, and route-level chunks |
| Styling | Tailwind CSS 4 | CSS-first tokens and utility composition |
| Interaction primitives | Radix UI | Dialogs, menus, selects, sliders, tabs, toasts, tooltips, and scroll areas |
| Icons | Lucide React | One consistent outline icon family |
| Class composition | `clsx` and `tailwind-merge` | Conditional styles without conflicting utilities |
| Rich text | `marked` and DOMPurify | Sanitized assistant Markdown |
| Data diagrams | XYFlow and Dagre | Interactive lineage and architecture views |

The components under `frontend/src/components/ui/` are small, local wrappers around Radix and native elements. They use the project's tokens and expose only the variants Pixelbot needs. Add to these primitives before introducing another component system.

Routes are lazy-loaded in `frontend/src/App.tsx`. Vite writes the production bundle to `backend/pixelbot/static/`, which is package data served by the FastAPI application. Files in that generated directory are build artifacts; edit `frontend/src/`, then rebuild them.

## Kandinsky visual language

The design tokens live in `frontend/src/index.css` under **Kandinsky Design System**. The system supports light and dark appearances through `prefers-color-scheme`; the screenshots show the dark appearance.

### Brand colors

| Token | Value | Use |
| --- | --- | --- |
| `k-yellow` | `#F1AE03` | Pixelbot identity, primary AI state, active progress |
| `k-yellow-hover` | `#D99D02` | Hover state for yellow controls |
| `k-red` | `#DC2404` | Destructive actions and errors |
| `k-blue` | `#022A59` | Deep brand blue |
| `k-blue-light` | `#7DA8EF` | Links and document-related accents on dark surfaces |
| `k-black` | `#020704` | Brand black |

Feature colors communicate meaning rather than decoration:

- Yellow: Pixelbot and image generation
- Orange: tools and FLUX
- Violet: video
- Emerald: voice, memory, and successful completion
- Blue: documents
- Cyan or sky: context assembly and generated answers
- Red: errors, destructive actions, and active recording

Use semantic tokens such as `background`, `foreground`, `card`, `accent`, `muted`, `border`, and `destructive` for normal UI. Do not hard-code new neutral colors inside components.

### Surfaces and hierarchy

Dark mode uses `#0a0a0a` for the page, `#111111` for cards, `#161616` for secondary controls, and `#232323` for borders. Opacity variants create hierarchy without adding more colors. The shell relies on thin borders rather than shadows; shadows appear mainly on the focused composer.

The visual hierarchy is:

1. Primary content in `foreground`
2. Labels and secondary actions in `muted-foreground`
3. Section labels and tertiary metadata at reduced opacity
4. Brand or feature color for the current mode, status, or source

### Typography

Pixelbot uses the native system sans-serif stack and the native monospace stack for code and numeric timing. This keeps the application fast and familiar on every platform.

- Hero heading: `text-3xl`, semibold, tight tracking
- Page heading: `text-lg`, semibold, tight tracking
- Primary body and chat: `text-sm`
- Controls and chips: `text-xs` or 11px, medium weight
- Section labels and metadata: 9-10px, often uppercase with wider tracking
- Code: 13px monospace with a dedicated dark surface

Small text is reserved for metadata and compact controls. Instructions, errors, and content that users must read should remain at least `text-sm` where space permits.

### Geometry and spacing

- Expanded sidebar: 200px; collapsed sidebar: 56px
- Sidebar header: 56px high
- Main conversation measure: `max-w-3xl`
- Standard page padding: 24px; conversation padding: 16px on compact edges
- Chat bubbles and composer: 16px radius
- Cards: 8-12px radius
- Compact buttons and navigation: 6-8px radius
- Icon sizes: usually 12-16px; avatars: 28px

The narrow conversation measure is a major part of the interface quality. Do not stretch chat content across the viewport. Wide space around the conversation keeps the hierarchy clear and the composer easy to find.

## Application shell

`frontend/src/components/app-layout.tsx` owns the shared shell. The left rail organizes the product by user intent:

- **Conversation:** Chat, History, Memory
- **Workspace:** Media Library, Studio, Prompt Lab, Integrations
- **System:** Database, Developer, Architecture
- **Utility:** Settings and sidebar collapse

Navigation rows use a compact icon-label pattern. The active item gets one quiet accent surface; inactive items gain contrast on hover. Group labels and separators make a capable application scannable without oversized navigation.

The shell is desktop-first. It supports a manually collapsed rail but does not yet provide a small-screen drawer or mobile navigation. Treat responsive navigation as an explicit future design task rather than assuming the current shell is mobile-ready.

## Conversation experience

`frontend/src/components/chat/chat-page.tsx` is the primary product surface.

### Empty state

The empty state uses a personalized time-of-day greeting, one direct heading, one sentence of guidance, and six action chips. The chips reduce blank-page anxiety while keeping the textbox as the clear primary action.

### Composer

The composer remains pinned at the bottom and centered to the same width as the conversation. Its two-level layout separates text entry from mode and send controls. Modes use color only when selected. The send button remains visually quiet until input exists.

### Messages

- User messages are right-aligned in a muted bubble and capped at 75% width.
- Assistant messages use an identity marker and open content layout instead of another large bubble.
- Long user messages collapse after 280 characters.
- Assistant Markdown is sanitized before rendering.
- Images, video, audio, source pills, follow-up prompts, and save/copy actions appear only when present.
- Secondary actions become prominent on hover, reducing noise while remaining discoverable.

### Waiting and feedback

`frontend/src/components/chat/thinking-indicator.tsx` turns waiting into understandable progress. It advances through eight named stages, shows elapsed time, retains completed stages, and uses a segmented progress track. The post-response “Thought for …” line closes that loop without preserving the full animation.

The stage names describe the pipeline users can understand: question analysis, tool selection, document and media retrieval, memory, context assembly, answer generation, and follow-ups. If the backend pipeline changes, update this copy so it remains truthful.

Animation is restrained:

- Fade in: 300ms
- Sidebar and state transitions: about 200ms
- Progress transitions: about 500ms
- Pulsing is reserved for active work or recording

A reduced-motion media query is not currently implemented. Add one before expanding motion beyond these small state transitions.

## Workspace and developer views

The same visual grammar carries into the denser pages:

- A compact page header establishes title and primary action.
- Cards use low-contrast borders and translucent semantic surfaces.
- Filters and modes stay close to the content they affect.
- Empty, loading, error, and success states use the same icon, type, and color hierarchy as chat.
- Database and architecture diagrams use feature colors to explain lineage and state, not to decorate the canvas.
- Destructive catalog controls do not belong in the Database page; it is a read-only inspector with copyable CLI recovery guidance.

This balance is intentional: the chat area feels like a focused assistant, while Studio, Database, Developer, and Architecture make the underlying Pixeltable application inspectable.

## Content rules

- Use sentence case and short, direct labels.
- Name actions with verbs: “Create image,” “Generate speech,” “Save to Library.”
- Describe the current operation during a wait.
- Show the specific recoverable cause of a failure when the backend can classify it.
- Keep implementation details in Developer and Architecture views unless they help someone complete the current task.
- Never report a simulated pipeline stage as proof that backend work completed.

## Accessibility and interaction rules

- Prefer Radix primitives for focus management, keyboard behavior, overlays, and menus.
- Preserve visible `focus-visible` rings on interactive controls.
- Give icon-only buttons an accessible name; a visual tooltip alone is insufficient.
- Do not use color as the only signal for success, failure, selection, or progress.
- Keep touch and pointer targets large enough even when the glyph is 12-16px.
- Sanitize rendered Markdown and constrain user-provided media.
- Announce asynchronous errors through the shared toast system and keep actionable errors readable long enough to act on them.

## Design guardrails

When extending Pixelbot:

1. Reuse an existing page, card, control, chip, or empty-state pattern first.
2. Use semantic tokens and the established feature-color mapping.
3. Keep the main action obvious and defer advanced controls until they are relevant.
4. Preserve the 3xl conversation measure and compact sidebar rhythm.
5. Use one Lucide icon per concept; avoid mixed icon families.
6. Add motion only to communicate entry, progress, or state change.
7. Avoid decorative gradients, oversized shadows, glass effects, ornamental illustrations, and competing accent colors.
8. Keep generated assets out of source edits; rebuild `backend/pixelbot/static/` from the frontend.
9. Lazy-load new routes and verify the initial production chunk stays below Vite's 500 kB warning threshold.
10. Test light and dark appearance, keyboard focus, empty state, loading, populated state, and failure state.

## Review checklist

Before merging a UI change, verify:

- The feature has a clear primary action and a useful empty state.
- Loading text describes real work and completion is confirmed by the response.
- Errors identify the next action without exposing secrets or stack traces.
- New colors, spacing, radii, and type sizes come from this system.
- Icon-only controls have accessible names and keyboard focus.
- The layout works with the sidebar expanded and collapsed.
- Long text, media, and tables stay within their containers.
- The route is lazy-loaded when it is not part of the initial chat experience.
- `npm run lint`, `npm test`, and `npm run build` pass.

## Source map

| Concern | Source |
| --- | --- |
| Tokens, themes, motion, Markdown typography | `frontend/src/index.css` |
| Navigation and application shell | `frontend/src/components/app-layout.tsx` |
| Conversation, composer, modes, messages | `frontend/src/components/chat/chat-page.tsx` |
| Pipeline progress | `frontend/src/components/chat/thinking-indicator.tsx` |
| Shared controls | `frontend/src/components/ui/` |
| Routes and lazy loading | `frontend/src/App.tsx` |
| API client contracts | `frontend/src/lib/api.ts` |
| Data and architecture diagrams | `frontend/src/components/database/` and `frontend/src/components/architecture/` |
| Generated production assets | `backend/pixelbot/static/` |
