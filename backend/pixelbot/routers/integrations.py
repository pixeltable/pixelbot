"""Integrations router — manage notification services and view activity log."""

import logging
from datetime import datetime

import pixeltable as pxt
from fastapi import APIRouter, Query

from pixelbot import config
from pixelbot.models import (
    IntegrationInfo,
    IntegrationsStatusResponse,
    NotificationLogEntry,
    NotificationLogResponse,
    NotificationRow,
    TestNotificationRequest,
    TestNotificationResponse,
)
from pixelbot.notifications import deliver_notification, redacted_destination
from pixelbot.utils import pxt_retry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


@router.get("/status", response_model=IntegrationsStatusResponse)
def get_integrations_status():
    """List all available integrations and their configuration state."""
    items = [
        IntegrationInfo(id=k, **{kk: vv for kk, vv in v.items() if kk != "configured"}, configured=v["configured"])
        for k, v in config.INTEGRATIONS.items()
    ]
    return IntegrationsStatusResponse(
        integrations=items,
        total_configured=sum(1 for i in items if i.configured),
    )


@router.post("/test", response_model=TestNotificationResponse)
def test_notification(req: TestNotificationRequest):
    """Send a test notification and log it to the notifications table."""
    service = req.service.lower()
    now = datetime.now()

    delivery = deliver_notification(service, req.message)
    if delivery is None:
        return TestNotificationResponse(
            service=service,
            status="error",
            result=f"Unknown service: {service}",
            timestamp=now.isoformat(),
        )

    notifications = pxt.get_table("pixelbot_v3.notifications")
    row = NotificationRow(
        service=service,
        destination=redacted_destination(service),
        message=req.message,
        status="success" if delivery.success else "error",
        response_code=delivery.response_code,
        timestamp=now,
    )
    notifications.insert([row])

    return TestNotificationResponse(
        service=service,
        status="success" if delivery.success else "error",
        result=delivery.message,
        timestamp=now.isoformat(),
    )


_TOOL_SERVICE_MAP = {
    "send_slack_message": "slack",
    "send_discord_message": "discord",
    "send_webhook": "webhook",
}


@router.get("/log", response_model=NotificationLogResponse)
@pxt_retry()
def get_notification_log(limit: int = Query(default=50, ge=1, le=100)):
    """Get recent notification activity from both manual tests and agent tool calls."""
    entries: list[NotificationLogEntry] = []

    # Source 1: explicit notification table (manual test sends)
    notifications = pxt.get_table("pixelbot_v3.notifications")
    manual_rows = (
        notifications.where(notifications.user_id == config.DEFAULT_USER_ID)
        .select(
            notifications.service,
            notifications.message,
            notifications.status,
            notifications.response_code,
            notifications.timestamp,
        )
        .order_by(notifications.timestamp, asc=False)
        .limit(limit)
        .collect()
    )
    for row in manual_rows:
        timestamp = row["timestamp"]
        entries.append(
            NotificationLogEntry(
                service=row["service"],
                message=row["message"],
                status=row["status"],
                response_code=int(row["response_code"]) if row["response_code"] is not None else 0,
                timestamp=timestamp.isoformat() if hasattr(timestamp, "isoformat") else str(timestamp),
                source="manual",
            )
        )

    # Source 2: agent tool calls that invoked notification tools
    try:
        tools_table = pxt.get_table("pixelbot_v3.tools")
        agent_rows = (
            tools_table.where(tools_table.user_id == config.DEFAULT_USER_ID)
            .select(tools_table.prompt, tools_table.tool_output, tools_table.timestamp)
            .order_by(tools_table.timestamp, asc=False)
            .limit(limit)
            .collect()
        )
        for r in agent_rows:
            tool_output = r.get("tool_output")
            if not isinstance(tool_output, dict):
                continue
            for tool_name, service in _TOOL_SERVICE_MAP.items():
                result = tool_output.get(tool_name)
                if not result:
                    continue
                result_str = result[0] if isinstance(result, list) and result else str(result)
                is_success = "successfully" in result_str.lower() or "delivered" in result_str.lower()
                entries.append(
                    NotificationLogEntry(
                        service=service,
                        message=r.get("prompt", "")[:200],
                        status="success" if is_success else "error",
                        response_code=200 if is_success else 0,
                        timestamp=r["timestamp"].isoformat()
                        if hasattr(r["timestamp"], "isoformat")
                        else str(r["timestamp"]),
                        source="agent",
                    )
                )
    except Exception as e:
        logger.warning("Could not read agent tool calls: %s", e)

    entries.sort(key=lambda e: e.timestamp, reverse=True)
    return NotificationLogResponse(notifications=entries[:limit], total=len(entries))
