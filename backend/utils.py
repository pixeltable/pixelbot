# utils.py - Shared utility functions for the backend routers.

import asyncio
import base64
import functools
import inspect
import io
import logging
import time
from pathlib import Path
from typing import TypeVar, Callable, ParamSpec

from PIL import Image

logger = logging.getLogger(__name__)

P = ParamSpec("P")
T = TypeVar("T")

# Transient Pixeltable/psycopg errors that resolve on retry
_TRANSIENT_MESSAGES = (
    "INTRANS",
    "This Connection is closed",
    "assert self._current_conn is not None",
    "not initialized",
)


def _is_transient(exc: Exception) -> bool:
    """Return True if the exception is a transient Pixeltable/psycopg error."""
    if isinstance(exc, AssertionError):
        return True
    try:
        from pixeltable.exceptions import Error as PxtError
        if isinstance(exc, PxtError):
            err_str = str(exc).lower()
            if any(k in err_str for k in ("connection", "intrans", "lock", "closed", "not initialized")):
                return True
    except ImportError:
        pass
    err_str = str(exc)
    return any(msg in err_str for msg in _TRANSIENT_MESSAGES)


def pxt_retry(
    max_attempts: int = 3,
    delay: float = 0.5,
    backoff: float = 2.0,
) -> Callable[[Callable[P, T]], Callable[P, T]]:
    """Decorator that retries a function on transient Pixeltable connection errors.

    Supports both sync and async functions. Catches AssertionError (bare
    assertions from Pixeltable's internal transaction guards),
    ProgrammingError, ResourceClosedError and similar transient errors that
    occur when concurrent requests hit the Pixeltable catalog.
    """
    def decorator(fn: Callable[P, T]) -> Callable[P, T]:
        if inspect.iscoroutinefunction(fn):
            @functools.wraps(fn)
            async def async_wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
                last_exc: Exception | None = None
                wait = delay
                for attempt in range(1, max_attempts + 1):
                    try:
                        return await fn(*args, **kwargs)
                    except Exception as exc:
                        if not _is_transient(exc) or attempt == max_attempts:
                            raise
                        last_exc = exc
                        logger.warning(
                            f"[pxt_retry] {fn.__name__} attempt {attempt}/{max_attempts} "
                            f"failed with transient error: {type(exc).__name__}: {str(exc)[:120]}. "
                            f"Retrying in {wait:.1f}s..."
                        )
                        await asyncio.sleep(wait)
                        wait *= backoff
                raise last_exc  # type: ignore[misc]
            return async_wrapper  # type: ignore[return-value]
        else:
            @functools.wraps(fn)
            def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
                last_exc: Exception | None = None
                wait = delay
                for attempt in range(1, max_attempts + 1):
                    try:
                        return fn(*args, **kwargs)
                    except Exception as exc:
                        if not _is_transient(exc) or attempt == max_attempts:
                            raise
                        last_exc = exc
                        logger.warning(
                            f"[pxt_retry] {fn.__name__} attempt {attempt}/{max_attempts} "
                            f"failed with transient error: {type(exc).__name__}: {str(exc)[:120]}. "
                            f"Retrying in {wait:.1f}s..."
                        )
                        time.sleep(wait)
                        wait *= backoff
                raise last_exc  # type: ignore[misc]
            return wrapper
    return decorator


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


def allowed_media_roots() -> list[Path]:
    """Directories from which serve_video/serve_audio may read files."""
    import config

    backend = Path(__file__).resolve().parent
    roots = [
        (backend / config.UPLOAD_FOLDER).resolve(),
        Path.home().joinpath(".pixeltable").resolve(),
    ]
    return [r for r in roots if r.is_dir()]


def resolve_served_media_path(path: str) -> str:
    """Resolve path and ensure it lies under an allowed media root."""
    from fastapi import HTTPException

    candidate = Path(path).expanduser()
    if not candidate.is_absolute():
        candidate = (Path.cwd() / candidate).resolve()
    else:
        candidate = candidate.resolve()

    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    for root in allowed_media_roots():
        try:
            candidate.relative_to(root)
            return str(candidate)
        except ValueError:
            continue

    raise HTTPException(status_code=403, detail="Access denied")
