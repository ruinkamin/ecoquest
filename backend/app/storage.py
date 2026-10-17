"""Фото на диске сервера (UPLOAD_DIR), раздаются через /uploads.
Перед сохранением фото перекодируется через Pillow: это проверяет, что файл — настоящая картинка,
убирает EXIF (в том числе GPS автора) и ограничивает размер."""
import io
import uuid
import warnings
from pathlib import Path

from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from PIL import Image, ImageOps, UnidentifiedImageError

from . import config

MAX_SIDE = 2560
Image.MAX_IMAGE_PIXELS = 50_000_000  # защита от «бомб» с огромным разрешением
_FORMATS = {"JPEG": (".jpg", "image/jpeg"), "PNG": (".png", "image/png"), "WEBP": (".webp", "image/webp")}


def _reencode(data: bytes) -> tuple[bytes, str]:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            # formats= — Pillow даже не пробует другие декодеры (PSD, FITS, PDF, шрифты...),
            # в которых чаще всего находят уязвимости.
            img = Image.open(io.BytesIO(data), formats=list(_FORMATS))
            fmt = img.format
            img = ImageOps.exif_transpose(img)  # повернуть по EXIF, раз сам EXIF выкидываем
    except (UnidentifiedImageError, OSError):
        raise HTTPException(415, "Нужно фото JPEG, PNG или WebP")
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(413, "Слишком большое разрешение")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    if fmt == "JPEG":
        img.convert("RGB").save(out, "JPEG", quality=88, optimize=True)
    elif fmt == "WEBP":
        img.save(out, "WEBP", quality=88)
    else:
        img.save(out, "PNG", optimize=True)
    return out.getvalue(), _FORMATS[fmt][0]


async def save_photo(upload: UploadFile) -> str:
    """Сохраняет фото, возвращает URL вида /uploads/<имя>."""
    data = await upload.read(config.MAX_PHOTO_MB * 1024 * 1024 + 1)
    if len(data) > config.MAX_PHOTO_MB * 1024 * 1024:
        raise HTTPException(413, f"Фото больше {config.MAX_PHOTO_MB} МБ")
    clean, ext = await run_in_threadpool(_reencode, data)
    config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    name = uuid.uuid4().hex + ext
    (config.UPLOAD_DIR / name).write_bytes(clean)
    return f"/uploads/{name}"


def load_photo(url: str):
    """(bytes, mime) для локального фото или None (например, у seed-квестов с внешним URL)."""
    if not url.startswith("/uploads/"):
        return None
    path = config.UPLOAD_DIR / Path(url).name
    if not path.is_file():
        return None
    mime = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}.get(path.suffix)
    return (path.read_bytes(), mime) if mime else None
