from datetime import datetime
from pathlib import Path

import pixeltable as pxt
import pytest
from PIL import Image

from pixelbot import config
from pixelbot.routers import studio
from pixelbot.routers.images import _write_slideshow


@pytest.fixture(scope="module")
def local_videos(tmp_path_factory: pytest.TempPathFactory):
    path = tmp_path_factory.mktemp("video") / "example.mp4"
    _write_slideshow(
        [Image.new("RGB", (64, 64), color) for color in ("red", "blue")], str(path), fps=10, seconds_per_slide=1
    )
    table = pxt.create_table(
        "media_fixture", {"uuid": pxt.String, "video": pxt.Video, "user_id": pxt.String, "timestamp": pxt.Timestamp}
    )
    table.insert(
        [
            {"uuid": key, "video": str(path), "user_id": config.DEFAULT_USER_ID, "timestamp": datetime(2026, 1, i + 1)}
            for i, key in enumerate(("one", "two"))
        ]
    )
    return table


@pytest.mark.parametrize(
    "operation,params,field",
    [
        ("view_metadata", {}, "metadata"),
        ("extract_frame", {"timestamp": 0.5}, "frame"),
        ("clip_video", {"start": 0, "duration": 1}, "video_path"),
        ("overlay_text", {"text": "Pixelbot", "font_size": 12}, "video_path"),
        ("crop_video", {"x": 0, "y": 0, "width": 32, "height": 32}, "video_path"),
        ("resize_video", {"width": 32, "height": 32}, "video_path"),
        ("detect_scenes", {}, "scenes"),
        ("concat_videos", {"uuids": "one,two"}, "video_path"),
    ],
)
def test_local_video_operations(
    local_videos, operation: str, params: dict, field: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(studio, "_get_pxt_table", lambda _: local_videos)
    result = studio.transform_video(studio.TransformRequest(uuid="one", operation=operation, params=params))
    assert field in result
    if field == "video_path":
        assert Path(result[field]).is_file()
