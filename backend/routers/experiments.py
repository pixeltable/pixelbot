# routers/experiments.py - Prompt Lab: multi-model prompt experimentation
import logging
import os
import time
import uuid as uuid_mod
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import pixeltable as pxt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import config
from utils import pxt_retry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/experiments", tags=["experiments"])

# ── Supported Models ─────────────────────────────────────────────────────────

# Multiple env keys checked per provider (any match = available)
_PROVIDER_ENV_KEYS: dict[str, list[str]] = {
    "anthropic": ["ANTHROPIC_API_KEY"],
    "google": ["GOOGLE_API_KEY", "GOOGLE_GENAI_API_KEY", "GEMINI_API_KEY"],
    "mistral": ["MISTRAL_API_KEY"],
    "openai": ["OPENAI_API_KEY"],
}


def _provider_available(provider: str) -> bool:
    """Check if any of the env keys for a provider are set."""
    for key in _PROVIDER_ENV_KEYS.get(provider, []):
        if os.environ.get(key):
            return True
    return False


SUPPORTED_MODELS = [
    {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "provider": "anthropic"},
    {"id": "claude-haiku-4-20250514", "name": "Claude Haiku 4", "provider": "anthropic"},
    {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "provider": "google"},
    {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "provider": "google"},
    {"id": "mistral-small-latest", "name": "Mistral Small", "provider": "mistral"},
    {"id": "mistral-large-latest", "name": "Mistral Large", "provider": "mistral"},
    {"id": "gpt-4o", "name": "GPT-4o", "provider": "openai"},
    {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "provider": "openai"},
]

# Infer provider from model ID prefix
_PREFIX_TO_PROVIDER = {
    "claude": "anthropic",
    "gemini": "google",
    "mistral": "mistral",
    "open-mistral": "mistral",
    "gpt": "openai",
    "o1": "openai",
    "o3": "openai",
    "o4": "openai",
}

# ── Pydantic Models ──────────────────────────────────────────────────────────


class ModelConfig(BaseModel):
    """A model to run — either a preset or any custom model ID."""
    model_id: str
    provider: str | None = None  # inferred from model_id if not provided
    display_name: str | None = None


class RunExperimentRequest(BaseModel):
    task: str = ""
    system_prompt: str = "You are a helpful assistant."
    user_prompt: str
    models: list[ModelConfig]
    temperature: float = 0.7
    max_tokens: int = 1024


class ExperimentResult(BaseModel):
    model_id: str
    model_name: str
    provider: str
    response: str | None = None
    response_time_ms: float = 0.0
    word_count: int = 0
    char_count: int = 0
    error: str | None = None


class RunExperimentResponse(BaseModel):
    experiment_id: str
    task: str
    system_prompt: str
    user_prompt: str
    temperature: float
    max_tokens: int
    timestamp: str
    results: list[ExperimentResult]


class ExperimentSummary(BaseModel):
    experiment_id: str
    task: str
    user_prompt: str
    model_ids: list[str]
    results_count: int
    timestamp: str


class ModelInfo(BaseModel):
    id: str
    name: str
    provider: str
    available: bool


# ── Pixeltable Table ─────────────────────────────────────────────────────────

_TABLE_PATH = "agents.prompt_experiments"


# ── Model Calling Functions ──────────────────────────────────────────────────


def _get_model_info(model_id: str) -> dict | None:
    """Look up a preset model by ID."""
    for m in SUPPORTED_MODELS:
        if m["id"] == model_id:
            return m
    return None


def _infer_provider(model_id: str) -> str | None:
    """Infer provider from a model ID string."""
    model_lower = model_id.lower()
    for prefix, provider in _PREFIX_TO_PROVIDER.items():
        if model_lower.startswith(prefix):
            return provider
    return None


def _resolve_model(mc: ModelConfig) -> dict:
    """Resolve a ModelConfig into {id, name, provider} — works for presets and custom models."""
    preset = _get_model_info(mc.model_id)
    if preset:
        return {
            "id": mc.model_id,
            "name": mc.display_name or preset["name"],
            "provider": mc.provider or preset["provider"],
        }
    provider = mc.provider or _infer_provider(mc.model_id)
    if not provider:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot infer provider for model '{mc.model_id}'. Specify the provider explicitly.",
        )
    return {
        "id": mc.model_id,
        "name": mc.display_name or mc.model_id,
        "provider": provider,
    }


def _call_anthropic(model_id: str, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int) -> str:
    import anthropic

    client = anthropic.Anthropic()
    response = client.messages.create(
        model=model_id,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return response.content[0].text


def _call_gemini(model_id: str, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int) -> str:
    from google import genai
    from google.genai import types

    client = genai.Client()
    response = client.models.generate_content(
        model=model_id,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
            max_output_tokens=max_tokens,
        ),
    )
    return response.text


def _call_mistral(model_id: str, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int) -> str:
    from mistralai import Mistral

    client = Mistral(api_key=os.environ.get("MISTRAL_API_KEY", ""))
    response = client.chat.complete(
        model=model_id,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content


def _call_openai(model_id: str, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int) -> str:
    import openai

    client = openai.OpenAI()
    response = client.chat.completions.create(
        model=model_id,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content


_PROVIDER_CALLERS = {
    "anthropic": _call_anthropic,
    "google": _call_gemini,
    "mistral": _call_mistral,
    "openai": _call_openai,
}


def _call_model(
    model_id: str,
    provider: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> tuple[str, float]:
    """Call a model and return (response_text, elapsed_ms)."""
    caller = _PROVIDER_CALLERS.get(provider)
    if not caller:
        raise ValueError(f"Unsupported provider: {provider}")
    start = time.perf_counter()
    text = caller(model_id, system_prompt, user_prompt, temperature, max_tokens)
    elapsed_ms = (time.perf_counter() - start) * 1000
    return text, elapsed_ms


# ── Metrics ──────────────────────────────────────────────────────────────────


def _compute_metrics(text: str) -> dict:
    """Compute simple text metrics."""
    if not text:
        return {"word_count": 0, "char_count": 0}
    words = text.split()
    return {"word_count": len(words), "char_count": len(text)}


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/models", response_model=list[ModelInfo])
@pxt_retry()
def get_available_models():
    """Return the list of supported models with availability status."""
    result = []
    for m in SUPPORTED_MODELS:
        available = _provider_available(m["provider"])
        result.append(ModelInfo(id=m["id"], name=m["name"], provider=m["provider"], available=available))
    return result


@router.post("/run", response_model=RunExperimentResponse)
@pxt_retry()
def run_experiment(body: RunExperimentRequest):
    """Run a prompt against multiple models in parallel and store results."""
    if not body.user_prompt.strip():
        raise HTTPException(status_code=400, detail="User prompt is required")
    if not body.models:
        raise HTTPException(status_code=400, detail="At least one model must be selected")

    experiment_id = str(uuid_mod.uuid4())[:8]
    now = datetime.now()
    user_id = config.DEFAULT_USER_ID

    # Resolve and validate all models
    resolved: dict[str, dict] = {}
    for mc in body.models:
        info = _resolve_model(mc)
        if not _provider_available(info["provider"]):
            env_keys = ", ".join(_PROVIDER_ENV_KEYS.get(info["provider"], []))
            raise HTTPException(
                status_code=400,
                detail=f"API key not configured for {info['provider']}. Set one of: {env_keys}",
            )
        resolved[info["id"]] = info

    # Run all models in parallel
    results: list[ExperimentResult] = []
    model_ids_ordered = [mc.model_id for mc in body.models]
    with ThreadPoolExecutor(max_workers=min(len(resolved), 4)) as executor:
        futures = {
            executor.submit(
                _call_model,
                mid,
                info["provider"],
                body.system_prompt,
                body.user_prompt,
                body.temperature,
                body.max_tokens,
            ): mid
            for mid, info in resolved.items()
        }
        for future in as_completed(futures):
            mid = futures[future]
            info = resolved[mid]
            try:
                response_text, time_ms = future.result()
                metrics = _compute_metrics(response_text)
                results.append(
                    ExperimentResult(
                        model_id=mid,
                        model_name=info["name"],
                        provider=info["provider"],
                        response=response_text,
                        response_time_ms=round(time_ms, 1),
                        word_count=metrics["word_count"],
                        char_count=metrics["char_count"],
                    )
                )
            except Exception as e:
                logger.error(f"Model {mid} failed: {e}", exc_info=True)
                results.append(
                    ExperimentResult(
                        model_id=mid,
                        model_name=info["name"],
                        provider=info["provider"],
                        error=str(e),
                    )
                )

    # Sort results to match input order
    order = {mid: i for i, mid in enumerate(model_ids_ordered)}
    results.sort(key=lambda r: order.get(r.model_id, 999))

    # Store results in Pixeltable
    try:
        table = pxt.get_table(_TABLE_PATH)
        rows_to_insert = []
        for r in results:
            rows_to_insert.append(
                {
                    "experiment_id": experiment_id,
                    "task": body.task or "Untitled",
                    "system_prompt": body.system_prompt,
                    "user_prompt": body.user_prompt,
                    "model_id": r.model_id,
                    "model_name": r.model_name,
                    "provider": r.provider,
                    "temperature": body.temperature,
                    "max_tokens": body.max_tokens,
                    "response": r.response or "",
                    "response_time_ms": r.response_time_ms,
                    "word_count": r.word_count,
                    "char_count": r.char_count,
                    "error": r.error or "",
                    "timestamp": now,
                    "user_id": user_id,
                }
            )
        table.insert(rows_to_insert)
        logger.info(f"Stored {len(rows_to_insert)} experiment results for {experiment_id}")
    except Exception as e:
        logger.error(f"Failed to store experiment results: {e}", exc_info=True)

    return RunExperimentResponse(
        experiment_id=experiment_id,
        task=body.task or "Untitled",
        system_prompt=body.system_prompt,
        user_prompt=body.user_prompt,
        temperature=body.temperature,
        max_tokens=body.max_tokens,
        timestamp=now.isoformat(),
        results=results,
    )


@router.get("/history", response_model=list[ExperimentSummary])
@pxt_retry()
def get_experiment_history():
    """Return a list of past experiments, grouped by experiment_id."""
    try:
        table = pxt.get_table(_TABLE_PATH)
        rows = (
            table.where(table.user_id == config.DEFAULT_USER_ID)
            .select(
                table.experiment_id,
                table.task,
                table.user_prompt,
                table.model_id,
                table.timestamp,
            )
            .order_by(table.timestamp, asc=False)
            .collect()
        )

        # Group by experiment_id
        experiments: dict[str, dict] = {}
        for row in rows:
            eid = row["experiment_id"]
            if eid not in experiments:
                experiments[eid] = {
                    "experiment_id": eid,
                    "task": row["task"],
                    "user_prompt": row["user_prompt"],
                    "model_ids": [],
                    "timestamp": row["timestamp"].isoformat() if row["timestamp"] else "",
                }
            experiments[eid]["model_ids"].append(row["model_id"])

        summaries = []
        for exp in experiments.values():
            summaries.append(
                ExperimentSummary(
                    experiment_id=exp["experiment_id"],
                    task=exp["task"],
                    user_prompt=exp["user_prompt"][:120] + ("..." if len(exp["user_prompt"]) > 120 else ""),
                    model_ids=exp["model_ids"],
                    results_count=len(exp["model_ids"]),
                    timestamp=exp["timestamp"],
                )
            )

        return summaries

    except Exception as e:
        logger.error(f"Failed to get experiment history: {e}", exc_info=True)
        return []


@router.get("/{experiment_id}", response_model=RunExperimentResponse)
@pxt_retry()
def get_experiment(experiment_id: str):
    """Return full results for a specific experiment."""
    try:
        table = pxt.get_table(_TABLE_PATH)
        rows = (
            table.where(
                (table.experiment_id == experiment_id) & (table.user_id == config.DEFAULT_USER_ID)
            )
            .select(
                table.experiment_id,
                table.task,
                table.system_prompt,
                table.user_prompt,
                table.model_id,
                table.model_name,
                table.provider,
                table.temperature,
                table.max_tokens,
                table.response,
                table.response_time_ms,
                table.word_count,
                table.char_count,
                table.error,
                table.timestamp,
            )
            .collect()
        )

        if not rows:
            raise HTTPException(status_code=404, detail="Experiment not found")

        first = rows[0]
        results = []
        for row in rows:
            error_val = row.get("error") or ""
            results.append(
                ExperimentResult(
                    model_id=row["model_id"],
                    model_name=row["model_name"],
                    provider=row["provider"],
                    response=row["response"] if not error_val else None,
                    response_time_ms=row.get("response_time_ms", 0),
                    word_count=row.get("word_count", 0),
                    char_count=row.get("char_count", 0),
                    error=error_val if error_val else None,
                )
            )

        return RunExperimentResponse(
            experiment_id=experiment_id,
            task=first["task"],
            system_prompt=first["system_prompt"],
            user_prompt=first["user_prompt"],
            temperature=first["temperature"],
            max_tokens=first["max_tokens"],
            timestamp=first["timestamp"].isoformat() if first["timestamp"] else "",
            results=results,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get experiment {experiment_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{experiment_id}")
def delete_experiment(experiment_id: str):
    """Delete all results for an experiment."""
    try:
        table = pxt.get_table(_TABLE_PATH)
        table.delete(where=(table.experiment_id == experiment_id) & (table.user_id == config.DEFAULT_USER_ID))
        return {"message": f"Experiment {experiment_id} deleted"}
    except Exception as e:
        logger.error(f"Failed to delete experiment {experiment_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
