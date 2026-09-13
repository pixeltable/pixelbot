import inspect
import io
import socket
from pathlib import Path
from types import SimpleNamespace

import av
import pytest
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
from PIL import Image

from pixelbot import __version__, config, notifications
from pixelbot.app import app
from pixelbot.catalog_access import require_allowed_table
from pixelbot.functions import send_webhook
from pixelbot.routers.database import _detect_iterator, _index_info
from pixelbot.routers.files import _download_public_url, _validate_public_http_url, upload_file
from pixelbot.routers.images import SaveSpeechRequest, _write_slideshow, save_generated_speech_to_collection
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
        "/api/memory/v2",
        "/api/memory/v2/search",
        "/api/memory/v2/delete",
        "/api/memory/manual",
        "/api/download_memory",
        "/api/delete_file/{file_uuid}/{file_type}",
        "/api/delete_all",
        "/api/workflow_detail/{timestamp_str}",
        "/api/delete_history/{timestamp_str}",
        "/api/tts_voices",
        "/api/db/table/{path}/schema",
        "/api/db/table/{path}/versions",
    }
    assert not any(path in removed for _, path in routes)


def test_pixeltable_query_routes_are_canonical() -> None:
    routes = {(method, route.path) for route in app.routes for method in getattr(route, "methods", set())}
    assert {
        ("GET", "/api/memory"),
        ("GET", "/api/memory/search"),
        ("GET", "/api/personas"),
        ("POST", "/api/memory"),
        ("POST", "/api/personas"),
    } <= routes
    assert not (Path(__file__).parents[1] / "pixelbot" / "queries.py").exists()


def test_removed_api_routes_return_not_found() -> None:
    client = TestClient(app)
    removed_requests = (
        ("POST", "/api/studio/reve/edit"),
        ("POST", "/api/db/create_table"),
        ("DELETE", "/api/delete_file/example/image"),
        ("POST", "/api/delete_all"),
        ("GET", "/api/workflow_detail/2026-01-01"),
        ("DELETE", "/api/delete_history/2026-01-01"),
        ("GET", "/api/tts_voices"),
        ("GET", "/api/db/table/pixelbot_v3.images/schema"),
        ("GET", "/api/db/table/pixelbot_v3.images/versions"),
    )
    for method, path in removed_requests:
        assert client.request(method, path).status_code == 404


def test_unexpected_route_errors_are_sanitized(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_catalog_lookup(_: str):
        raise RuntimeError("secret catalog detail")

    monkeypatch.setattr("pixelbot.routers.history.pxt.get_table", fail_catalog_lookup)
    response = TestClient(app, raise_server_exceptions=False).get("/api/conversations")

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}


def test_webhook_destination_is_configuration_only() -> None:
    assert list(inspect.signature(send_webhook.py_fn).parameters) == ["message"]


def test_notification_delivery_is_shared_and_typed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "SLACK_WEBHOOK_URL", "https://example.test/secret-token")
    monkeypatch.setattr(
        notifications.requests,
        "post",
        lambda url, **kwargs: SimpleNamespace(status_code=200),
    )

    result = notifications.deliver_notification("slack", "hello")

    assert result == notifications.DeliveryResult("Slack message sent successfully.", True, 200)
    assert notifications.redacted_destination("slack") == "https://example.test/..."


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


class _UrlResponse:
    def __init__(self, status_code: int, *, headers: dict[str, str] | None = None, chunks: list[bytes] | None = None):
        self.status_code = status_code
        self.headers = headers or {}
        self._chunks = chunks or []

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError("request failed")

    def iter_content(self, chunk_size: int):
        del chunk_size
        yield from self._chunks

    def close(self) -> None:
        pass


class _UrlSession:
    trust_env = True

    def __init__(self, responses: list[_UrlResponse]):
        self.responses = iter(responses)

    def get(self, *args, **kwargs) -> _UrlResponse:
        return next(self.responses)

    def close(self) -> None:
        pass


def test_url_download_revalidates_redirects(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    session = _UrlSession([_UrlResponse(302, headers={"location": "http://127.0.0.1/private.pdf"})])
    monkeypatch.setattr("pixelbot.routers.files.requests.Session", lambda: session)
    monkeypatch.setattr(config, "UPLOAD_FOLDER", str(tmp_path))

    with pytest.raises(HTTPException) as error:
        _download_public_url("http://93.184.216.34/public.pdf", "public.pdf")

    assert error.value.status_code == 400
    assert list(tmp_path.iterdir()) == []
    assert session.trust_env is False


def test_url_download_limit_is_enforced_while_streaming(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    session = _UrlSession([_UrlResponse(200, chunks=[b"too large"])])
    monkeypatch.setattr("pixelbot.routers.files.requests.Session", lambda: session)
    monkeypatch.setattr(config, "UPLOAD_FOLDER", str(tmp_path))
    monkeypatch.setattr(config, "MAX_UPLOAD_SIZE_MB", 0)

    with pytest.raises(HTTPException) as error:
        _download_public_url("http://93.184.216.34/public.pdf", "public.pdf")

    assert error.value.status_code == 413
    assert list(tmp_path.iterdir()) == []


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


def test_unsupported_legacy_documents_are_rejected() -> None:
    assert {"doc", "ppt", "xls", "rtf"}.isdisjoint(config.ALLOWED_EXTENSIONS)
    assert {"docx", "pptx", "xlsx"} <= config.ALLOWED_EXTENSIONS


def test_slideshow_is_created_without_runtime_catalog_mutation(tmp_path: Path) -> None:
    output = tmp_path / "slideshow.mp4"
    images = [Image.new("RGB", (8, 8), color) for color in ("red", "blue")]

    _write_slideshow(images, str(output), fps=1, seconds_per_slide=1)

    with av.open(str(output)) as container:
        assert len(list(container.decode(video=0))) == 2
    images_source = (Path(__file__).parents[1] / "pixelbot" / "routers" / "images.py").read_text()
    assert "pxt.create_table(" not in images_source
    assert "pxt.drop_table(" not in images_source


def test_save_speech_rejects_paths_outside_media_roots(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    upload_root = tmp_path / "uploads"
    upload_root.mkdir()
    outside = tmp_path / "outside.wav"
    outside.write_bytes(b"not audio")
    monkeypatch.setattr(config, "UPLOAD_FOLDER", str(upload_root))

    with pytest.raises(HTTPException) as error:
        save_generated_speech_to_collection(SaveSpeechRequest(audio_path=str(outside)))

    assert error.value.status_code == 403


def test_read_and_scratch_result_limits_are_validated() -> None:
    client = TestClient(app)
    requests = (
        ("GET", "/api/db/timeline?limit=501", None),
        ("POST", "/api/db/sample", {"path": "pixelbot_v3.tools", "n": 1, "limit": 101}),
        (
            "POST",
            "/api/db/join",
            {
                "left_table": "pixelbot_v3.tools",
                "right_table": "pixelbot_v3.tools",
                "left_column": "user_id",
                "right_column": "user_id",
                "limit": 101,
            },
        ),
        ("POST", "/api/studio/csv/rows", {"csv_uuid": "missing", "limit": 101}),
        ("POST", "/api/studio/search", {"query": "test", "limit": 101}),
        ("GET", "/api/studio/embeddings?limit=501", None),
        ("GET", "/api/studio/chunks/missing?limit=101", None),
        ("GET", "/api/studio/frames/missing?limit=101", None),
        ("GET", "/api/export/json/pixelbot_v3.tools?limit=0", None),
    )
    for method, path, body in requests:
        assert client.request(method, path, json=body).status_code == 422


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


def test_transcript_routes_use_declared_iterator_views() -> None:
    studio_source = (Path(__file__).parents[1] / "pixelbot" / "routers" / "studio.py").read_text()
    assert "pixelbot_v3.video_transcript_sentences" not in studio_source
    assert "pixelbot_v3.audio_transcript_sentences" not in studio_source
    assert "pixelbot_v3.video_audio_chunks" in studio_source
    assert "pixelbot_v3.audio_chunks" in studio_source


def test_video_routes_use_pixeltable_077_frame_columns() -> None:
    studio_source = (Path(__file__).parents[1] / "pixelbot" / "routers" / "studio.py").read_text()
    assert "frames_view.frame_idx" not in studio_source
    assert "frames_view.pos_msec" not in studio_source
    assert "video_frames_view.frame_idx" not in studio_source
    assert "frames_view.pos" in studio_source
    assert "frames_view.frame_attrs" in studio_source


def test_pipeline_detects_pixeltable_iterators_from_metadata() -> None:
    def columns(*names: str) -> list[dict]:
        return [{"name": name, "is_iterator_col": True} for name in names]

    assert _detect_iterator(columns("pos", "frame", "frame_attrs")) == "FrameIterator"
    assert _detect_iterator(columns("pos", "segment_start", "segment_end", "audio_segment")) == "AudioSplitter"
    assert _detect_iterator(columns("pos", "text", "title", "heading", "page")) == "DocumentSplitter"
    assert _detect_iterator(columns("pos", "text")) == "StringSplitter"
    assert _detect_iterator([{"name": "pos", "is_iterator_col": False}]) is None


def test_pipeline_accepts_btree_indexes_without_parameters() -> None:
    assert _index_info("user_id_idx", {"columns": ["user_id"], "index_type": "BtreeIndex", "parameters": None}) == {
        "name": "user_id_idx",
        "columns": ["user_id"],
        "type": "BtreeIndex",
        "embedding": "",
    }
