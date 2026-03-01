"""Integrations router — manage notification services and view activity log."""

import logging
from datetime import datetime

import requests as http_requests
import pixeltable as pxt
from fastapi import APIRouter

import config
from models import (
    IntegrationInfo,
    IntegrationsStatusResponse,
    NotificationLogEntry,
    NotificationLogResponse,
    NotificationRow,
    TestNotificationRequest,
    TestNotificationResponse,
)
from utils import pxt_retry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


@router.get("/status", response_model=IntegrationsStatusResponse)
def get_integrations_status():
    """List all available integrations and their configuration state."""
    items = [
        IntegrationInfo(id=k, **{kk: vv for kk, vv in v.items() if kk != "configured"},
                        configured=v["configured"])
        for k, v in config.INTEGRATIONS.items()
    ]
    return IntegrationsStatusResponse(
        integrations=items,
        total_configured=sum(1 for i in items if i.configured),
    )


@router.post("/test", response_model=TestNotificationResponse)
@pxt_retry()
def test_notification(req: TestNotificationRequest):
    """Send a test notification and log it to the notifications table."""
    service = req.service.lower()
    now = datetime.utcnow()

    result = _send_notification(service, req.message)
    if result is None:
        return TestNotificationResponse(
            service=service, status="error",
            result=f"Unknown service: {service}", timestamp=now.isoformat(),
        )

    is_success = "successfully" in result.lower() or "delivered" in result.lower()

    notifications = pxt.get_table("agents.notifications")
    row = NotificationRow(
        service=service,
        destination=_get_destination(service),
        message=req.message,
        status="success" if is_success else "error",
        response_code=200 if is_success else 0,
        timestamp=now,
    )
    notifications.insert([row])

    return TestNotificationResponse(
        service=service,
        status="success" if is_success else "error",
        result=result,
        timestamp=now.isoformat(),
    )


_NOTIFICATION_TOOLS = ("send_slack_message", "send_discord_message", "send_webhook")
_TOOL_SERVICE_MAP = {
    "send_slack_message": "slack",
    "send_discord_message": "discord",
    "send_webhook": "webhook",
}


@router.get("/log", response_model=NotificationLogResponse)
@pxt_retry()
def get_notification_log(limit: int = 50):
    """Get recent notification activity from both manual tests and agent tool calls."""
    entries: list[NotificationLogEntry] = []

    # Source 1: explicit notification table (manual test sends)
    notifications = pxt.get_table("agents.notifications")
    manual_rows = (
        notifications
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
        .to_pandas()
    )
    for _, r in manual_rows.iterrows():
        entries.append(NotificationLogEntry(
            service=r["service"],
            message=r["message"],
            status=r["status"],
            response_code=int(r["response_code"]) if r["response_code"] is not None else 0,
            timestamp=r["timestamp"].isoformat() if hasattr(r["timestamp"], "isoformat") else str(r["timestamp"]),
            source="manual",
        ))

    # Source 2: agent tool calls that invoked notification tools
    try:
        tools_table = pxt.get_table("agents.tools")
        agent_rows = (
            tools_table
            .select(tools_table.prompt, tools_table.tool_output, tools_table.timestamp)
            .order_by(tools_table.timestamp, asc=False)
            .limit(limit)
            .collect()
        )
        for r in agent_rows:
            tool_output = r.get("tool_output")
            if not isinstance(tool_output, dict):
                continue
            for tool_name in _NOTIFICATION_TOOLS:
                result = tool_output.get(tool_name)
                if not result:
                    continue
                result_str = result[0] if isinstance(result, list) and result else str(result)
                is_success = "successfully" in result_str.lower() or "delivered" in result_str.lower()
                entries.append(NotificationLogEntry(
                    service=_TOOL_SERVICE_MAP[tool_name],
                    message=r.get("prompt", "")[:200],
                    status="success" if is_success else "error",
                    response_code=200 if is_success else 0,
                    timestamp=r["timestamp"].isoformat() if hasattr(r["timestamp"], "isoformat") else str(r["timestamp"]),
                    source="agent",
                ))
    except Exception as e:
        logger.warning("Could not read agent tool calls: %s", e)

    entries.sort(key=lambda e: e.timestamp, reverse=True)
    return NotificationLogResponse(notifications=entries[:limit], total=len(entries))


def _send_notification(service: str, message: str) -> str | None:
    """Call the notification service directly (not via Pixeltable UDF)."""
    try:
        if service == "slack":
            url = config.SLACK_WEBHOOK_URL
            if not url:
                return "Error: SLACK_WEBHOOK_URL not configured."
            resp = http_requests.post(url, json={"text": message}, timeout=10)
            return "Slack message sent successfully." if resp.status_code == 200 else f"Slack error ({resp.status_code}): {resp.text}"

        if service == "discord":
            url = config.DISCORD_WEBHOOK_URL
            if not url:
                return "Error: DISCORD_WEBHOOK_URL not configured."
            resp = http_requests.post(url, json={"content": message}, timeout=10)
            return "Discord message sent successfully." if resp.status_code in (200, 204) else f"Discord error ({resp.status_code}): {resp.text}"

        if service == "webhook":
            url = config.WEBHOOK_URL
            if not url:
                return "Error: WEBHOOK_URL not configured."
            payload = {"text": message, "source": "pixelbot", "timestamp": datetime.utcnow().isoformat()}
            resp = http_requests.post(url, json=payload, timeout=10)
            return f"Webhook delivered ({resp.status_code})." if resp.status_code < 300 else f"Webhook error ({resp.status_code}): {resp.text}"

        return None
    except http_requests.RequestException as e:
        return f"{service} request failed: {e}"


def _get_destination(service: str) -> str:
    url_map = {
        "slack": config.SLACK_WEBHOOK_URL,
        "discord": config.DISCORD_WEBHOOK_URL,
        "webhook": config.WEBHOOK_URL,
    }
    url = url_map.get(service, "")
    if not url:
        return "(not configured)"
    if len(url) > 40:
        return url[:20] + "..." + url[-15:]
    return url
