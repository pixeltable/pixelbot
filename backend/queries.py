# queries.py - Reusable query functions for Pixeltable tables.
#
# These mirror the @pxt.query functions in setup_pixeltable.py but are designed
# for direct use in API routers. They use pxt.get_table() for lazy table
# resolution (safe to import before schema is initialized).
#
# The @pxt.query versions in setup_pixeltable.py remain for computed columns.

from __future__ import annotations

import pixeltable as pxt


# ── Memory ───────────────────────────────────────────────────────────────────

def get_all_memory(user_id: str) -> list[dict]:
    """Return all memory items for a user, newest first."""
    t = pxt.get_table("agents.memory_bank")
    return list(
        t.where(t.user_id == user_id)
        .select(
            content=t.content, type=t.type, language=t.language,
            context_query=t.context_query, timestamp=t.timestamp,
        )
        .order_by(t.timestamp, asc=False)
        .collect()
    )


def search_memory(query_text: str, user_id: str, threshold: float = 0.7, limit: int = 10) -> list[dict]:
    """Semantic search over memory items."""
    t = pxt.get_table("agents.memory_bank")
    sim = t.content.similarity(query_text)
    return list(
        t.where((t.user_id == user_id) & (sim > threshold))
        .select(
            content=t.content, type=t.type, language=t.language,
            context_query=t.context_query, timestamp=t.timestamp, sim=sim,
        )
        .order_by(sim, asc=False)
        .limit(limit)
        .collect()
    )


# ── Personas ─────────────────────────────────────────────────────────────────

def get_all_personas(user_id: str) -> list[dict]:
    """Return all personas for a user, alphabetically."""
    t = pxt.get_table("agents.user_personas")
    return list(
        t.where(t.user_id == user_id)
        .select(
            persona_name=t.persona_name, initial_prompt=t.initial_prompt,
            final_prompt=t.final_prompt, llm_params=t.llm_params,
            timestamp=t.timestamp,
        )
        .order_by(t.persona_name, asc=True)
        .collect()
    )
