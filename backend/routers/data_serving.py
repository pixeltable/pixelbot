# routers/data_serving.py — Pixeltable 0.6+ FastAPIRouter declarative serving (v2 API)
import logging

import pixeltable as pxt
from pixeltable.serving import FastAPIRouter

import config

logger = logging.getLogger(__name__)
router = FastAPIRouter(prefix="/api", tags=["data-serving"])
_routes_registered = False
_router_included = False


def register_data_serving_routes() -> None:
    """Register table-backed routes after schema init (requires agents tables)."""
    global _routes_registered
    if _routes_registered:
        return

    memory_bank = pxt.get_table("agents.memory_bank")
    personas = pxt.get_table("agents.user_personas")
    user_id = config.DEFAULT_USER_ID

    @pxt.query
    def list_memory_v2():
        return (
            memory_bank.where(memory_bank.user_id == user_id)
            .select(
                content=memory_bank.content,
                type=memory_bank.type,
                language=memory_bank.language,
                context_query=memory_bank.context_query,
                timestamp=memory_bank.timestamp,
            )
            .order_by(memory_bank.timestamp, asc=False)
        )

    @pxt.query
    def search_memory_v2(query_text: str):
        sim = memory_bank.content.similarity(string=query_text)
        return (
            memory_bank.where((memory_bank.user_id == user_id) & (sim > 0.7))
            .order_by(sim, asc=False)
            .select(
                content=memory_bank.content,
                type=memory_bank.type,
                language=memory_bank.language,
                context_query=memory_bank.context_query,
                timestamp=memory_bank.timestamp,
                sim=sim,
            )
            .limit(10)
        )

    @pxt.query
    def list_personas_v2():
        return (
            personas.where(personas.user_id == user_id)
            .select(
                persona_name=personas.persona_name,
                initial_prompt=personas.initial_prompt,
                final_prompt=personas.final_prompt,
                llm_params=personas.llm_params,
                timestamp=personas.timestamp,
            )
            .order_by(personas.persona_name, asc=True)
        )

    router.add_query_route(path="/memory/v2", query=list_memory_v2, method="get")
    router.add_query_route(path="/memory/v2/search", query=search_memory_v2, method="get")
    router.add_delete_route(memory_bank, path="/memory/v2/delete", match_columns=["timestamp"])
    router.add_query_route(path="/personas/v2", query=list_personas_v2, method="get")

    _routes_registered = True
    logger.info("FastAPIRouter v2 routes registered (memory, personas)")
