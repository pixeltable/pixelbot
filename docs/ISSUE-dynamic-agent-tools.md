# Dynamic Agent Tools Not Possible at Runtime

**Type**: Pixeltable Platform Limitation  
**Severity**: Medium  
**Status**: Won't Fix (app-side) — requires Pixeltable platform change

## Problem

Agent tools (`pxt.tools()`) must be declared at schema setup time in `setup_pixeltable.py`.
They cannot be added, removed, or modified at runtime without tearing down and rebuilding
the entire agent computed-column pipeline.

This means **dynamically-created tables** (e.g., user-uploaded CSV files) **cannot be
registered as proper agent tools** with typed parameters.

## Why It Can't Be Fixed App-Side

The tools are baked into the `initial_response` computed column:

```python
tool_agent.add_computed_column(
    initial_response=messages(
        model="claude-sonnet-4-...",
        tools=tools,          # ← frozen at schema time
        tool_choice=tools.choice(required=True),
        ...
    ),
    if_exists="replace",
)
```

To swap the tools list, you'd need to:

1. Drop `initial_response` — but it has dependents (`tool_output`)
2. Drop `tool_output` — but it has dependents (`multimodal_context_summary`)
3. Drop all 11 downstream computed columns in cascade order
4. Recreate all 11 columns with the new tools list
5. Pixeltable would recompute all existing rows (= expensive LLM calls on historical data)

`add_computed_column(if_exists='replace')` only works on columns with **no dependents**.
The agent pipeline is a chain of 11 dependent computed columns, so you can't replace any
upstream column without first dropping everything downstream.

## What We Tried

### `query_csv_table` UDF (removed)

A `@pxt.udf` registered as a static tool that internally:
- Listed all CSV tables from a registry
- Parsed the LLM's query string as JSON for lookup params
- Created a `pxt.retrieval_udf()` on the fly for key-based lookups
- Fell back to returning sample rows

**Why it was removed**: The LLM rarely formatted the JSON correctly. The
`retrieval_udf`-inside-a-UDF pattern was fragile and untestable. The fallback
(dumping sample rows) wasn't useful for large tables.

### Dynamic Tools Page (removed)

A "Tools & Integrations" UI that stored HTTP tool configs in Pixeltable tables
(`agents.custom_tools`, `agents.mcp_servers`) and executed them post-pipeline in
`chat.py`. Removed because it ran outside the Pixeltable agent pipeline (tools
couldn't influence the LLM's reasoning or tool selection).

## What Pixeltable Would Need

Any of these would unblock dynamic tools:

1. **Hot-swappable tools on computed columns** — allow `add_computed_column(tools=new_tools,
   if_exists='replace')` to update the tools list without dropping dependents or recomputing
   historical rows. Only new inserts would use the updated tools.

2. **Late-binding tool resolution** — instead of freezing the tools list into the computed
   column expression at definition time, resolve `tools` at execution time from a reference
   (e.g., a Pixeltable table or a callable that returns `Tools`).

3. **`replace_force` with selective recomputation** — allow replacing a column with dependents,
   only recomputing rows where the column value is `None` or where the expression changed.

## Current State

CSV data is still fully usable in the app:
- Upload, browse, edit, version, revert (Studio page)
- Export as JSON/CSV/Parquet (Developer page)
- Visible in Database browser

CSV data is just **not queryable by the chat agent**. The agent has access to:
documents (RAG), images (CLIP similarity), video transcripts, audio transcripts,
memory bank, chat history, and external APIs (news, finance) — but not CSV content.

## Related

- `pxt.retrieval_udf()` works correctly for static tables declared at setup time
- `pxt.tools()` accepts `retrieval_udf` results — the API is ready, the lifecycle isn't
- Pixeltable GitHub: https://github.com/pixeltable/pixeltable
