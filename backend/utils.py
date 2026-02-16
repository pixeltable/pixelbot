# utils.py - Shared utility functions for the backend routers.

import base64
import io

from PIL import Image


def encode_image_base64(img: Image.Image) -> str | None:
    """Encode a PIL Image as a data-URI base64 PNG string."""
    if not isinstance(img, Image.Image):
        return None
    try:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/png;base64,{encoded}"
    except Exception:
        return None


def create_thumbnail_base64(img: Image.Image, size: tuple[int, int]) -> str | None:
    """Create a thumbnail of a PIL Image and return as a data-URI base64 string."""
    if img is None or not isinstance(img, Image.Image):
        return None
    try:
        copy = img.copy()
        copy.thumbnail(size, Image.Resampling.LANCZOS)
        return encode_image_base64(copy)
    except Exception:
        return None
