import hashlib
import io
from pathlib import Path
from typing import Optional, Dict
from PIL import Image, ImageOps
from config import THUMBNAILS_DIR

# 16MB equivalent memory cache (storing up to 500 recent thumbnails)
_MEMORY_CACHE: Dict[str, bytes] = {}
_MAX_MEM_ENTRIES = 500

class ThumbnailEngine:
    @staticmethod
    def get_cache_key(file_path: Path, max_size: int = 320) -> str:
        stat = file_path.stat()
        raw = f"{file_path.resolve()}_{stat.st_mtime}_{stat.st_size}_{max_size}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    @classmethod
    def get_thumbnail(cls, file_path: Path, max_size: int = 320) -> Optional[bytes]:
        if not file_path.exists() or not file_path.is_file():
            return None

        key = cls.get_cache_key(file_path, max_size)

        # 1. In-memory LRU cache
        if key in _MEMORY_CACHE:
            return _MEMORY_CACHE[key]

        # 2. Disk cache
        disk_file = THUMBNAILS_DIR / f"{key}.jpg"
        if disk_file.exists():
            try:
                data = disk_file.read_bytes()
                if len(_MEMORY_CACHE) >= _MAX_MEM_ENTRIES:
                    _MEMORY_CACHE.pop(next(iter(_MEMORY_CACHE)))
                _MEMORY_CACHE[key] = data
                return data
            except Exception:
                pass

        # 3. Generate thumbnail
        try:
            with Image.open(file_path) as img:
                # Auto-orient based on EXIF
                img = ImageOps.exif_transpose(img)
                
                # Convert RGBA to RGB with black background if needed
                if img.mode in ("RGBA", "LA", "P"):
                    bg = Image.new("RGB", img.size, (20, 20, 25))
                    if img.mode == "P":
                        img = img.convert("RGBA")
                    bg.paste(img, mask=img.split()[-1] if "A" in img.mode else None)
                    img = bg
                elif img.mode != "RGB":
                    img = img.convert("RGB")

                # Thumbnail resize keeping aspect ratio
                img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

                # Save as compressed JPEG
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=82, optimize=True)
                thumb_bytes = buf.getvalue()

                # Persist to disk
                disk_file.write_bytes(thumb_bytes)

                # Store in memory
                if len(_MEMORY_CACHE) >= _MAX_MEM_ENTRIES:
                    _MEMORY_CACHE.pop(next(iter(_MEMORY_CACHE)))
                _MEMORY_CACHE[key] = thumb_bytes

                return thumb_bytes
        except Exception as e:
            print(f"Error generating thumbnail for {file_path}: {e}")
            return None
