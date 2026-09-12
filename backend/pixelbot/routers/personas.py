import logging
from datetime import datetime

import pixeltable as pxt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pixelbot import config
from pixelbot.models import DeleteResponse, MessageResponse, UserPersonaRow

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["personas"])


class PersonaRequest(BaseModel):
    persona_name: str
    initial_prompt: str
    final_prompt: str
    llm_params: dict


class PersonaUpdateRequest(BaseModel):
    initial_prompt: str
    final_prompt: str
    llm_params: dict


# ── Create Persona ────────────────────────────────────────────────────────────


@router.post("/personas", status_code=201, response_model=MessageResponse)
def create_persona(body: PersonaRequest):
    """Create a new persona."""
    user_id = config.DEFAULT_USER_ID

    if not body.persona_name.strip():
        raise HTTPException(status_code=400, detail="Persona name cannot be empty")
    personas_table = pxt.get_table("pixelbot_v3.user_personas")

    try:
        personas_table.insert(
            [
                UserPersonaRow(
                    user_id=user_id,
                    persona_name=body.persona_name.strip(),
                    initial_prompt=body.initial_prompt,
                    final_prompt=body.final_prompt,
                    llm_params=body.llm_params,
                    timestamp=datetime.now(),
                )
            ]
        )
        return {"message": f"Persona '{body.persona_name}' created successfully"}

    except Exception as insert_err:
        err_str = str(insert_err).lower()
        if "unique constraint" in err_str or "primary key constraint" in err_str:
            raise HTTPException(status_code=409, detail=f"Persona '{body.persona_name}' already exists")
        raise insert_err


# ── Update Persona ────────────────────────────────────────────────────────────


@router.put("/personas/{persona_name:path}", response_model=MessageResponse)
def update_persona(persona_name: str, body: PersonaUpdateRequest):
    """Update an existing persona."""
    user_id = config.DEFAULT_USER_ID

    if not persona_name:
        raise HTTPException(status_code=400, detail="Persona name is required")
    personas_table = pxt.get_table("pixelbot_v3.user_personas")
    status = personas_table.update(
        {
            "initial_prompt": body.initial_prompt,
            "final_prompt": body.final_prompt,
            "llm_params": body.llm_params,
            "timestamp": datetime.now(),
        },
        where=(personas_table.user_id == user_id) & (personas_table.persona_name == persona_name),
    )

    if status.num_rows == 0:
        raise HTTPException(status_code=404, detail="Persona not found")

    return {"message": f"Persona '{persona_name}' updated successfully"}


# ── Delete Persona ────────────────────────────────────────────────────────────


@router.delete("/personas/{persona_name:path}", response_model=DeleteResponse)
def delete_persona(persona_name: str):
    """Delete a persona by name."""
    user_id = config.DEFAULT_USER_ID

    if not persona_name:
        raise HTTPException(status_code=400, detail="Persona name is required")
    personas_table = pxt.get_table("pixelbot_v3.user_personas")
    status = personas_table.delete(
        where=(personas_table.user_id == user_id) & (personas_table.persona_name == persona_name)
    )

    if status.num_rows == 0:
        raise HTTPException(status_code=404, detail="Persona not found")

    return {"message": f"Persona '{persona_name}' deleted successfully", "num_deleted": status.num_rows}
