import base64
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import numpy as np
import pixeltable as pxt
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pixeltable.exceptions import AuthorizationError, ErrorCode

from pixelbot import config, functions
from pixelbot.app import app
from pixelbot.routers import chat, experiments, studio


@pxt.udf
def local_embedding(text: str) -> pxt.Array[(3,), pxt.Float]:
    return np.array([1.0, 2.0, float(len(text))], dtype=np.float32)


def test_pixeltable_errors_keep_public_details_and_omit_diagnostics(monkeypatch: pytest.MonkeyPatch) -> None:
    error = AuthorizationError(ErrorCode.MISSING_CREDENTIALS, "Set GEMINI_API_KEY and restart the daemon.")
    error.detail = "private diagnostic data"

    def fail(_: str):
        raise error

    monkeypatch.setattr("pixelbot.routers.history.pxt.get_table", fail)
    response = TestClient(app).get("/api/conversations")
    assert response.status_code == 403
    assert response.json() == {
        "detail": {"error_code": "MISSING_CREDENTIALS", "message": error.message, "retryable": False}
    }
    assert "private diagnostic" not in response.text


def test_chat_stores_one_pair_and_does_not_invent_tool_usage(monkeypatch: pytest.MonkeyPatch) -> None:
    agent = SimpleNamespace(
        insert=Mock(return_value=SimpleNamespace(rows=[{"answer": "Hello", "tool_output": {"news": None}}]))
    )
    history = SimpleNamespace(insert=Mock())
    monkeypatch.setattr(chat.pxt, "get_table", lambda path: agent if path.endswith(".tools") else history)
    result = chat.query(chat.QueryRequest(query="Hi", conversation_id="current-chat"))
    assert result.answer == "Hello"
    assert not result.metadata.has_tool_output
    assert agent.insert.call_args.args[0][0].conversation_id == "current-chat"
    assert history.insert.call_count == 1
    assert [row.role for row in history.insert.call_args.args[0]] == ["user", "assistant"]


def test_empty_answers_do_not_create_a_successful_history_turn(monkeypatch: pytest.MonkeyPatch) -> None:
    agent = SimpleNamespace(insert=Mock(return_value=SimpleNamespace(rows=[{"answer": None}])))
    monkeypatch.setattr(chat.pxt, "get_table", lambda _: agent)
    response = TestClient(app).post("/api/query", json={"query": "Hi"})
    assert response.status_code == 502
    assert agent.insert.call_count == 1


@pytest.mark.parametrize("count", [1, 2, 3, 4])
def test_embedding_map_handles_small_collections(count: int, monkeypatch: pytest.MonkeyPatch) -> None:
    def collect(_user_id, _limit, items, vectors):
        for i in range(count):
            items.append({"type": "document", "uuid": str(i), "label": str(i)})
            vectors.append(np.array([1, i + 1, i + 2], dtype=np.float32))

    monkeypatch.setattr(studio, "_collect_text_embeddings", collect)
    result = studio.get_embeddings(space="text", limit=10)
    assert result["count"] == count
    assert all(0 <= point[axis] <= 1 for point in result["points"] for axis in ("x", "y"))


def test_embedding_map_enforces_total_limit_and_filters_invalid_vectors(monkeypatch: pytest.MonkeyPatch) -> None:
    def collect(_user_id, _limit, items, vectors):
        items.extend({"uuid": str(i)} for i in range(5))
        vectors.extend([np.array([1.0, 2.0]), np.array([np.nan, 2.0])] + [np.ones(2)] * 3)

    monkeypatch.setattr(studio, "_collect_text_embeddings", collect)
    result = studio.get_embeddings(space="text", limit=2)
    assert result["count"] == 1
    assert result["points"][0]["x"] == result["points"][0]["y"] == 0.5


def test_gemini_prompt_lab_honors_documented_key(monkeypatch: pytest.MonkeyPatch) -> None:
    from google import genai

    for key in experiments._PROVIDER_ENV_KEYS["google"]:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    client = Mock()
    client.models.generate_content.return_value = SimpleNamespace(text="answer")
    constructor = Mock(return_value=client)
    monkeypatch.setattr(genai, "Client", constructor)
    assert experiments._call_gemini("model", "system", "question", 0.7, 100) == "answer"
    constructor.assert_called_once_with(api_key="test-key")


def test_current_claude_calls_omit_unsupported_sampling(monkeypatch: pytest.MonkeyPatch) -> None:
    import anthropic

    client = Mock()
    client.messages.create.return_value = SimpleNamespace(content=[SimpleNamespace(text="answer")])
    monkeypatch.setattr(anthropic, "Anthropic", lambda: client)
    assert experiments._call_anthropic("claude-sonnet-5-5", "system", "question", 0.7, 100) == "answer"
    assert "temperature" not in client.messages.create.call_args.kwargs


def test_generated_image_extraction_skips_text_and_thought_parts() -> None:
    image = Image.new("RGB", (8, 8))
    response = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"text": "Image:"},
                        {"thought": True, "inline_data": {"data": Image.new("RGB", (1, 1))}},
                        {"inline_data": {"data": image}},
                    ]
                }
            }
        ]
    }
    assert functions.extract_generated_image.py_fn(response) is image
    with pytest.raises(ValueError, match="no image"):
        functions.extract_generated_image.py_fn({"candidates": []})


def test_video_generation_uses_interactions_and_returns_a_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from google import genai

    client = Mock()
    client.__enter__ = Mock(return_value=client)
    client.__exit__ = Mock(return_value=False)
    client.interactions.create.return_value = SimpleNamespace(
        output_video=SimpleNamespace(data=base64.b64encode(b"test-video").decode())
    )
    monkeypatch.setattr(genai, "Client", lambda **_: client)
    monkeypatch.setattr(config, "UPLOAD_FOLDER", str(tmp_path))
    path = functions.generate_video.py_fn("A marble rolls", "gemini-omni-1.1-flash")
    assert Path(path).read_bytes() == b"test-video"
    client.interactions.create.assert_called_once_with(model="gemini-omni-1.1-flash", input="A marble rolls")


@pytest.mark.parametrize(
    "endpoint,body",
    [
        ("/api/generate_image", {"prompt": "   "}),
        ("/api/generate_video", {"prompt": ""}),
        ("/api/generate_flux_image", {"prompt": "a cat", "width": 100000}),
        ("/api/generate_speech", {"text": "hello", "voice": "unknown"}),
        ("/api/experiments/run", {"user_prompt": "hi", "models": [{"model_id": "x"}], "max_tokens": -1}),
    ],
)
def test_invalid_generation_requests_fail_before_provider_calls(endpoint: str, body: dict) -> None:
    assert TestClient(app).post(endpoint, json=body).status_code == 422


def test_recent_history_is_scoped_to_the_conversation() -> None:
    from pixelbot.schema import get_recent_chat_history

    pxt.create_dir("pixelbot_v3", if_exists="ignore")
    table = pxt.create_table(
        "pixelbot_v3.chat_history",
        {
            "role": pxt.String,
            "content": pxt.String,
            "conversation_id": pxt.String,
            "timestamp": pxt.Timestamp,
            "user_id": pxt.String,
        },
    )
    table.insert(
        [
            {
                "role": "user",
                "content": content,
                "conversation_id": conversation,
                "timestamp": datetime(2026, 1, day),
                "user_id": config.DEFAULT_USER_ID,
            }
            for day, content, conversation in [(1, "current", "a"), (2, "other conversation", "b")]
        ]
    )

    @pxt.query
    def bound_history(user_id: str, conversation_id: str | None, limit: int = 4):
        return get_recent_chat_history.template_query.bind("pixelbot_v3")

    probe = pxt.create_table("history_probe", {"user_id": pxt.String, "conversation_id": pxt.String})
    probe.add_computed_column(recent=bound_history(probe.user_id, probe.conversation_id))
    status = probe.insert(user_id=config.DEFAULT_USER_ID, conversation_id="a", return_rows=True)
    rows = status.rows[0]["recent"]
    assert [row["content"] for row in rows] == ["current"]


def test_embedding_map_reads_stored_index_vectors() -> None:
    pxt.create_dir("pixelbot_v3", if_exists="ignore")
    table = pxt.create_table(
        "pixelbot_v3.chunks",
        {
            "text": pxt.String,
            "uuid": pxt.String,
            "heading": pxt.String,
            "user_id": pxt.String,
        },
    )
    table.add_embedding_index("text", string_embed=local_embedding)
    table.insert(text="sample", uuid="sample", heading="Example", user_id=config.DEFAULT_USER_ID)
    items: list[dict] = []
    vectors: list[np.ndarray] = []
    studio._collect_text_embeddings(config.DEFAULT_USER_ID, 10, items, vectors)
    assert len(items) == 1
    np.testing.assert_allclose(vectors[0], [1, 2, 6])
