import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pixeltable as pxt

import config
from models import ToolAgentRow, ChatHistoryRow

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["chat"])


class QueryRequest(BaseModel):
    query: str
    persona_id: str | None = None


class QueryMetadata(BaseModel):
    timestamp: str
    has_doc_context: bool
    has_image_context: bool
    has_tool_output: bool
    has_history_context: bool
    has_memory_context: bool
    has_chat_memory_context: bool


class QueryResponse(BaseModel):
    answer: str
    metadata: QueryMetadata
    image_context: list[dict]
    video_frame_context: list[dict]
    follow_up_text: str | None


@router.post("/query", response_model=QueryResponse)
def query(body: QueryRequest):
    """Process a user query through the Pixeltable agent workflow."""
    user_id = config.DEFAULT_USER_ID

    if not body.query:
        raise HTTPException(status_code=400, detail="Query text is required")

    try:
        tool_agent = pxt.get_table("agents.tools")

        # Determine prompts and parameters
        selected_initial_prompt = config.INITIAL_SYSTEM_PROMPT
        selected_final_prompt = config.FINAL_SYSTEM_PROMPT
        selected_max_tokens = config.DEFAULT_MAX_TOKENS
        selected_temperature = config.DEFAULT_TEMPERATURE

        if body.persona_id:
            try:
                personas_table = pxt.get_table("agents.user_personas")
                persona_result = (
                    personas_table.where(
                        (personas_table.user_id == user_id) & (personas_table.persona_name == body.persona_id)
                    )
                    .select(
                        initial_prompt=personas_table.initial_prompt,
                        final_prompt=personas_table.final_prompt,
                        llm_params=personas_table.llm_params,
                    )
                    .collect()
                )
                if len(persona_result) > 0:
                    custom_data = persona_result[0]
                    selected_initial_prompt = custom_data["initial_prompt"]
                    selected_final_prompt = custom_data["final_prompt"]
                    llm_params = custom_data.get("llm_params") or {}
                    selected_max_tokens = llm_params.get("max_tokens", selected_max_tokens)
                    selected_temperature = llm_params.get("temperature", selected_temperature)
                    logger.info(f"Loaded persona '{body.persona_id}' for user {user_id}")
            except Exception as db_err:
                logger.error(f"Error fetching persona '{body.persona_id}': {db_err}", exc_info=True)

        # Insert the query using a validated Pydantic model
        current_timestamp = datetime.now()
        row = ToolAgentRow(
            prompt=body.query,
            timestamp=current_timestamp,
            user_id=user_id,
            initial_system_prompt=selected_initial_prompt,
            final_system_prompt=selected_final_prompt,
            max_tokens=selected_max_tokens,
            temperature=selected_temperature,
        )
        # insert() is synchronous — blocks until all computed columns finish
        tool_agent.insert([row])

        # Retrieve computed results
        result = (
            tool_agent.where((tool_agent.timestamp == current_timestamp) & (tool_agent.user_id == user_id))
            .select(
                tool_agent.answer,
                tool_agent.doc_context,
                tool_agent.image_context,
                tool_agent.video_frame_context,
                tool_agent.tool_output,
                tool_agent.history_context,
                tool_agent.memory_context,
                tool_agent.chat_memory_context,
                follow_up_text=tool_agent.follow_up_text,
            )
            .collect()
        )

        if not result or len(result) == 0:
            raise HTTPException(status_code=500, detail="No results found after processing query")

        result_data = result[0]

        # Process image context
        processed_image_context: list[dict] = []
        if result_data.get("image_context"):
            for item in result_data["image_context"]:
                if isinstance(item, dict) and "encoded_image" in item and item["encoded_image"]:
                    encoded = item["encoded_image"]
                    if isinstance(encoded, bytes):
                        encoded = encoded.decode("utf-8")
                    if isinstance(encoded, str) and encoded:
                        processed_image_context.append({"encoded_image": encoded})

        # Process video frame context
        processed_video_frame_context: list[dict] = []
        if result_data.get("video_frame_context"):
            for item in result_data["video_frame_context"]:
                if isinstance(item, dict) and "encoded_frame" in item and item["encoded_frame"]:
                    frame_data = item["encoded_frame"]
                    if isinstance(frame_data, bytes):
                        frame_data = frame_data.decode("utf-8")
                    if isinstance(frame_data, str) and frame_data:
                        processed_video_frame_context.append({
                            "encoded_frame": frame_data,
                            "sim": item.get("sim"),
                            "timestamp": item.get("timestamp"),
                        })

        # Insert into chat history using validated Pydantic models
        try:
            chat_history_table = pxt.get_table("agents.chat_history")
            chat_history_table.insert([ChatHistoryRow(
                role="user",
                content=body.query,
                timestamp=current_timestamp,
                user_id=user_id,
            )])
            answer = result_data.get("answer", "Error: Answer not generated.")
            if answer and not answer.startswith("Error:"):
                chat_history_table.insert([ChatHistoryRow(
                    role="assistant",
                    content=answer,
                    timestamp=datetime.now(),
                    user_id=user_id,
                )])
        except Exception as history_err:
            logger.error(f"Error inserting into chat history: {history_err}")

        metadata = QueryMetadata(
            timestamp=current_timestamp.isoformat(),
            has_doc_context=bool(result_data.get("doc_context")),
            has_image_context=bool(result_data.get("image_context")),
            has_tool_output=bool(result_data.get("tool_output")),
            has_history_context=bool(result_data.get("history_context")),
            has_memory_context=bool(result_data.get("memory_context")),
            has_chat_memory_context=bool(result_data.get("chat_memory_context")),
        )

        return QueryResponse(
            answer=result_data.get("answer", "Error: Answer not generated."),
            metadata=metadata,
            image_context=processed_image_context,
            video_frame_context=processed_video_frame_context,
            follow_up_text=result_data.get("follow_up_text"),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing query: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
