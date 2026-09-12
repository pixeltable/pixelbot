"""Catalog path authorization for read-only inspection and exports."""

import pixeltable as pxt
from fastapi import HTTPException

from pixelbot import config


def require_allowed_table(path: str) -> str:
    """Allow application tables and scratch tables registered for the local user."""
    normalized = path.strip().replace("/", ".")
    if normalized == config.APP_NAMESPACE or normalized.startswith(f"{config.APP_NAMESPACE}."):
        return normalized
    if normalized.startswith(f"{config.SCRATCH_NAMESPACE}."):
        registry = pxt.get_table(f"{config.APP_NAMESPACE}.csv_registry")
        rows = (
            registry.where((registry.table_name == normalized) & (registry.user_id == config.DEFAULT_USER_ID))
            .select(registry.uuid)
            .limit(1)
            .collect()
        )
        if rows:
            return normalized
    raise HTTPException(status_code=403, detail="Table is outside the Pixelbot catalog")


def registered_scratch_tables() -> list[str]:
    registry = pxt.get_table(f"{config.APP_NAMESPACE}.csv_registry")
    return [
        row["table_name"]
        for row in registry.where(registry.user_id == config.DEFAULT_USER_ID).select(registry.table_name).collect()
        if str(row["table_name"]).startswith(f"{config.SCRATCH_NAMESPACE}.")
    ]
