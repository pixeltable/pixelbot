import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pixeltable as pxt

import config
import queries
from models import UserPersonaRow

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


# ── List Personas ─────────────────────────────────────────────────────────────

@router.get("/personas")
def get_personas():
    """Fetch all personas for the current user.

    Uses shared query function from queries.py and direct ResultSet iteration.
    """
    user_id = config.DEFAULT_USER_ID

    try:
        rows = queries.get_all_personas(user_id)
        for row in rows:
            ts = row.get("timestamp")
            if ts:
                row["timestamp"] = ts.strftime("%Y-%m-%d %H:%M:%S.%f")
        return rows

    except Exception as e:
        logger.error(f"Error fetching personas: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Create Persona ────────────────────────────────────────────────────────────

@router.post("/personas", status_code=201)
def create_persona(body: PersonaRequest):
    """Create a new persona."""
    user_id = config.DEFAULT_USER_ID

    if not body.persona_name.strip():
        raise HTTPException(status_code=400, detail="Persona name cannot be empty")

    try:
        personas_table = pxt.get_table("agents.user_personas")

        try:
            personas_table.insert([UserPersonaRow(
                user_id=user_id,
                persona_name=body.persona_name.strip(),
                initial_prompt=body.initial_prompt,
                final_prompt=body.final_prompt,
                llm_params=body.llm_params,
                timestamp=datetime.now(),
            )])
            return {"message": f"Persona '{body.persona_name}' created successfully"}

        except Exception as insert_err:
            err_str = str(insert_err).lower()
            if "unique constraint" in err_str or "primary key constraint" in err_str:
                raise HTTPException(status_code=409, detail=f"Persona '{body.persona_name}' already exists")
            raise insert_err

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating persona: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Update Persona ────────────────────────────────────────────────────────────

@router.put("/personas/{persona_name:path}")
def update_persona(persona_name: str, body: PersonaUpdateRequest):
    """Update an existing persona."""
    user_id = config.DEFAULT_USER_ID

    if not persona_name:
        raise HTTPException(status_code=400, detail="Persona name is required")

    try:
        personas_table = pxt.get_table("agents.user_personas")
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

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating persona: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Delete Persona ────────────────────────────────────────────────────────────

@router.delete("/personas/{persona_name:path}")
def delete_persona(persona_name: str):
    """Delete a persona by name."""
    user_id = config.DEFAULT_USER_ID

    if not persona_name:
        raise HTTPException(status_code=400, detail="Persona name is required")

    try:
        personas_table = pxt.get_table("agents.user_personas")
        status = personas_table.delete(
            where=(personas_table.user_id == user_id) & (personas_table.persona_name == persona_name)
        )

        if status.num_rows == 0:
            raise HTTPException(status_code=404, detail="Persona not found")

        return {"message": f"Persona '{persona_name}' deleted successfully", "num_deleted": status.num_rows}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting persona: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
