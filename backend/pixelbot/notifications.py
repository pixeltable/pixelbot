"""Notification delivery shared by the HTTP API and Pixeltable agent tools."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlsplit

import requests

from pixelbot import config

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DeliveryResult:
    message: str
    success: bool
    response_code: int


def deliver_notification(service: str, message: str) -> DeliveryResult | None:
    """Deliver a message to one configured notification service."""
    service = service.lower()
    url = _service_url(service)
    if service not in config.INTEGRATIONS:
        return None
    if not url:
        env_var = config.INTEGRATIONS[service]["env_var"]
        return DeliveryResult(f"Error: {env_var} not configured.", False, 0)

    payload = _payload(service, message)
    try:
        response = requests.post(url, json=payload, timeout=10)
    except requests.RequestException:
        logger.exception("%s notification request failed", service)
        return DeliveryResult(f"{service.title()} request failed.", False, 0)

    success = response.status_code in _success_codes(service)
    if success:
        if service == "webhook":
            result_message = f"Webhook delivered ({response.status_code})."
        else:
            result_message = f"{service.title()} message sent successfully."
    else:
        result_message = f"{service.title()} delivery failed ({response.status_code})."
    return DeliveryResult(result_message, success, response.status_code)


def redacted_destination(service: str) -> str:
    """Return a display-safe form of the configured destination."""
    url = _service_url(service.lower())
    if not url:
        return "(not configured)"
    parsed = urlsplit(url)
    return f"{parsed.scheme}://{parsed.netloc}/..."


def _service_url(service: str) -> str:
    return {
        "slack": config.SLACK_WEBHOOK_URL,
        "discord": config.DISCORD_WEBHOOK_URL,
        "webhook": config.WEBHOOK_URL,
    }.get(service, "")


def _payload(service: str, message: str) -> dict[str, str]:
    if service == "discord":
        return {"content": message}
    if service == "webhook":
        return {
            "text": message,
            "source": "pixelbot",
            "timestamp": datetime.now(UTC).isoformat(),
        }
    return {"text": message}


def _success_codes(service: str) -> range | tuple[int, ...]:
    if service == "slack":
        return (200,)
    if service == "discord":
        return (200, 204)
    return range(200, 300)
