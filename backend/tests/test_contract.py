import inspect
import io
import socket
from pathlib import Path

import pytest
from fastapi import HTTPException, UploadFile

from pixelbot import __version__, config
from pixelbot.app import app
from pixelbot.catalog_access import require_allowed_table
from pixelbot.functions import send_webhook
from pixelbot.routers.files import _validate_public_http_url, upload_file
from pixelbot.utils import resolve_served_media_path


def test_release_and_catalog_contract() -> None:
    assert __version__ == "3.0.0"
    assert config.APP_NAMESPACE == "pixelbot_v3"
    assert config.SCRATCH_NAMESPACE == "pixelbot_scratch"


def test_removed_routes_are_not_registered() -> None:
    routes = {(method, route.path) for route in app.routes for method in getattr(route, "methods", set())}
    removed = {
        "/api/studio/reve/edit",
        "/api/studio/reve/remix",
        "/api/studio/reve/save",
        "/api/db/create_dir",
        "/api/db/create_table",
        "/api/db/drop_table",
        "/api/db/add_computed_column",
        "/api/db/recompute_columns",
    }
    assert not any(path in removed for _, path in routes)


def test_webhook_destination_is_configuration_only() -> None:
    assert list(inspect.signature(send_webhook.py_fn).parameters) == ["message"]


def test_private_url_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *_: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))]
    )
    with pytest.raises(HTTPException) as error:
        _validate_public_http_url("http://example.test/file.pdf")
    assert error.value.status_code == 400


def test_public_url_is_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *_: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]
    )
    _validate_public_http_url("https://example.test/file.pdf")


def test_media_symlink_escape_is_rejected(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    upload_root = tmp_path / "uploads"
    upload_root.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("secret")
    link = upload_root / "escape.txt"
    link.symlink_to(outside)
    monkeypatch.setattr(config, "UPLOAD_FOLDER", str(upload_root))
    with pytest.raises(HTTPException) as error:
        resolve_served_media_path(str(link))
    assert error.value.status_code == 403


def test_upload_limit_is_enforced_while_streaming(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "UPLOAD_FOLDER", str(tmp_path / "uploads"))
    monkeypatch.setattr(config, "MAX_UPLOAD_SIZE_MB", 0)
    upload = UploadFile(filename="sample.txt", file=io.BytesIO(b"too large"))
    with pytest.raises(HTTPException) as error:
        upload_file(upload)
    assert error.value.status_code == 413
    assert list((tmp_path / "uploads").iterdir()) == []


def test_catalog_access_rejects_other_namespaces() -> None:
    assert require_allowed_table("pixelbot_v3.chat_history") == "pixelbot_v3.chat_history"
    with pytest.raises(HTTPException) as error:
        require_allowed_table("agents.chat_history")
    assert error.value.status_code == 403


def test_schema_has_no_import_time_catalog_mutations() -> None:
    schema_source = (Path(__file__).parents[1] / "pixelbot" / "schema.py").read_text()
    forbidden = ("pxt.create_table(", "pxt.create_view(", "pxt.create_dir(", "add_computed_column(", "eval(")
    assert not any(token in schema_source for token in forbidden)
    assert "TableModel = pxt.model_base()" in schema_source
    assert "has_default_idxs=False" in schema_source
