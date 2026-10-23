import os
import io
import re
import json
import hashlib
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List
from PIL import Image

import mutagen
from mutagen.id3 import ID3, APIC
from mutagen.mp4 import MP4, MP4Cover
from mutagen.flac import FLAC
from mutagen.oggvorbis import OggVorbis
from mutagen.wave import WAVE

from config import ALBUM_ART_DIR
from media_engine import find_binary

class MusicEngine:
    _PROBE_CACHE: Dict[str, Dict[str, Any]] = {}

    @staticmethod
    def get_ffmpeg_cmd() -> str:
        return find_binary("ffmpeg")

    @staticmethod
    def get_ffprobe_cmd() -> str:
        return find_binary("ffprobe")

    @staticmethod
    def probe_audio(file_path: Path) -> Dict[str, Any]:
        """
        Parses high-speed ID3/Vorbis/MP4/FLAC metadata and audio stream specs.
        Returns: title, artist, album, albumArtist, genre, year, trackNumber,
                 durationMs, bitrate, sampleRate, channels, codec, lossless, hasArtwork.
        """
        if not file_path.exists() or not file_path.is_file():
            return {
                "title": file_path.stem,
                "artist": "Unknown Artist",
                "album": "Unknown Album",
                "albumArtist": "Unknown Artist",
                "genre": "Music",
                "year": None,
                "trackNumber": None,
                "discNumber": None,
                "durationMs": 0,
                "bitrate": 0,
                "sampleRate": 44100,
                "channels": 2,
                "codec": file_path.suffix.lower().lstrip("."),
                "lossless": False,
                "hasArtwork": False,
                "isBrowserPlayable": True,
            }

        try:
            stat = file_path.stat()
            cache_key = f"{file_path.resolve()}_{stat.st_mtime}_{stat.st_size}"
            if cache_key in MusicEngine._PROBE_CACHE:
                return MusicEngine._PROBE_CACHE[cache_key]
        except Exception:
            cache_key = None

        ext = file_path.suffix.lower()
        clean_stem = file_path.stem.replace("_", " ").replace(".", " ").strip()
        
        # Default fallback metadata
        result: Dict[str, Any] = {
            "title": clean_stem,
            "artist": "Unknown Artist",
            "album": "Unknown Album",
            "albumArtist": "Unknown Artist",
            "genre": "Music",
            "year": None,
            "trackNumber": None,
            "discNumber": None,
            "durationMs": 0,
            "bitrate": 0,
            "sampleRate": 44100,
            "channels": 2,
            "codec": ext.lstrip("."),
            "lossless": ext in (".flac", ".wav", ".alac", ".aif", ".aiff"),
            "hasArtwork": False,
            "isBrowserPlayable": ext in (".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".flac", ".webm"),
        }

        # Try parsing artist and title from filename if formatted like "Artist - Title"
        if " - " in clean_stem:
            parts = clean_stem.split(" - ", 1)
            result["artist"] = parts[0].strip()
            result["title"] = parts[1].strip()

        # 1. High-speed metadata parsing with mutagen
        try:
            audio = mutagen.File(str(file_path))
            if audio is not None:
                # Duration & Stream Info
                if audio.info:
                    if hasattr(audio.info, "length") and audio.info.length:
                        result["durationMs"] = int(audio.info.length * 1000)
                    if hasattr(audio.info, "bitrate") and audio.info.bitrate:
                        result["bitrate"] = int(audio.info.bitrate)
                    if hasattr(audio.info, "sample_rate") and audio.info.sample_rate:
                        result["sampleRate"] = int(audio.info.sample_rate)
                    if hasattr(audio.info, "channels") and audio.info.channels:
                        result["channels"] = int(audio.info.channels)

                # Format specific tags
                tags = getattr(audio, "tags", None)
                if tags:
                    # ID3 (MP3, AIFF, etc.)
                    if isinstance(tags, ID3):
                        if "TIT2" in tags:
                            result["title"] = str(tags["TIT2"].text[0]).strip()
                        if "TPE1" in tags:
                            result["artist"] = str(tags["TPE1"].text[0]).strip()
                        if "TALB" in tags:
                            result["album"] = str(tags["TALB"].text[0]).strip()
                        if "TPE2" in tags:
                            result["albumArtist"] = str(tags["TPE2"].text[0]).strip()
                        if "TCON" in tags:
                            result["genre"] = str(tags["TCON"].text[0]).strip()
                        if "TDRC" in tags:
                            result["year"] = str(tags["TDRC"].text[0])[:4]
                        elif "TYER" in tags:
                            result["year"] = str(tags["TYER"].text[0])[:4]
                        if "TRCK" in tags:
                            trck = str(tags["TRCK"].text[0]).split("/")[0]
                            try:
                                result["trackNumber"] = int(trck)
                            except Exception:
                                pass
                        if "TPOS" in tags:
                            pos = str(tags["TPOS"].text[0]).split("/")[0]
                            try:
                                result["discNumber"] = int(pos)
                            except Exception:
                                pass
                        # Artwork presence
                        for key in tags.keys():
                            if key.startswith("APIC"):
                                result["hasArtwork"] = True
                                break

                    # MP4 / M4A / ALAC
                    elif isinstance(audio, MP4):
                        mp4_tags = audio.tags or {}
                        if "\xa9nam" in mp4_tags:
                            result["title"] = str(mp4_tags["\xa9nam"][0]).strip()
                        if "\xa9ART" in mp4_tags:
                            result["artist"] = str(mp4_tags["\xa9ART"][0]).strip()
                        if "\xa9alb" in mp4_tags:
                            result["album"] = str(mp4_tags["\xa9alb"][0]).strip()
                        if "aART" in mp4_tags:
                            result["albumArtist"] = str(mp4_tags["aART"][0]).strip()
                        if "\xa9gen" in mp4_tags:
                            result["genre"] = str(mp4_tags["\xa9gen"][0]).strip()
                        if "\xa9day" in mp4_tags:
                            result["year"] = str(mp4_tags["\xa9day"][0])[:4]
                        if "trkn" in mp4_tags:
                            try:
                                result["trackNumber"] = int(mp4_tags["trkn"][0][0])
                            except Exception:
                                pass
                        if "disk" in mp4_tags:
                            try:
                                result["discNumber"] = int(mp4_tags["disk"][0][0])
                            except Exception:
                                pass
                        if "covr" in mp4_tags and mp4_tags["covr"]:
                            result["hasArtwork"] = True

                    # FLAC or OGG Vorbis
                    elif isinstance(audio, (FLAC, OggVorbis)):
                        f_tags = audio.tags or {}
                        def get_first(k: str) -> Optional[str]:
                            val = f_tags.get(k) or f_tags.get(k.lower()) or f_tags.get(k.upper())
                            return str(val[0]).strip() if val else None

                        t = get_first("title")
                        if t: result["title"] = t
                        a = get_first("artist")
                        if a: result["artist"] = a
                        alb = get_first("album")
                        if alb: result["album"] = alb
                        aa = get_first("albumartist")
                        if aa: result["albumArtist"] = aa
                        g = get_first("genre")
                        if g: result["genre"] = g
                        y = get_first("date") or get_first("year")
                        if y: result["year"] = y[:4]
                        tr = get_first("tracknumber")
                        if tr:
                            try:
                                result["trackNumber"] = int(tr.split("/")[0])
                            except Exception:
                                pass

                        if isinstance(audio, FLAC) and audio.pictures:
                            result["hasArtwork"] = True
                        elif "metadata_block_picture" in f_tags:
                            result["hasArtwork"] = True

        except Exception as e:
            # Mutagen could not read tags, fall back to FFprobe
            pass

        # 2. FFprobe fallback if duration or stream specs are missing
        if result["durationMs"] == 0:
            try:
                cmd = [
                    MusicEngine.get_ffprobe_cmd(),
                    "-v", "quiet",
                    "-print_format", "json",
                    "-show_format",
                    "-show_streams",
                    str(file_path.resolve())
                ]
                res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
                if res.returncode == 0 and res.stdout.strip():
                    data = json.loads(res.stdout)
                    fmt = data.get("format", {})
                    duration_sec = float(fmt.get("duration", 0))
                    result["durationMs"] = int(duration_sec * 1000)
                    result["bitrate"] = int(fmt.get("bit_rate", 0))
                    for s in data.get("streams", []):
                        if s.get("codec_type") == "audio":
                            result["codec"] = s.get("codec_name", result["codec"])
                            result["sampleRate"] = int(s.get("sample_rate", result["sampleRate"]))
                            result["channels"] = int(s.get("channels", result["channels"]))
                            break
                        elif s.get("codec_type") == "video" and s.get("codec_name") in ("png", "jpeg", "mjpeg", "bmp"):
                            result["hasArtwork"] = True
            except Exception:
                pass

        # Check for sidecar cover art if no embedded art was found
        if not result["hasArtwork"]:
            sidecar = MusicEngine.find_sidecar_artwork(file_path)
            if sidecar:
                result["hasArtwork"] = True

        if cache_key:
            MusicEngine._PROBE_CACHE[cache_key] = result

        return result

    @staticmethod
    def find_sidecar_artwork(file_path: Path) -> Optional[Path]:
        """Finds cover.jpg, folder.jpg, album.jpg, front.jpg in the same folder."""
        parent = file_path.parent
        if not parent.exists():
            return None

        candidates = [
            "cover.jpg", "cover.png", "cover.jpeg", "cover.webp",
            "folder.jpg", "folder.png", "folder.jpeg",
            "album.jpg", "album.png", "front.jpg", "front.png",
            f"{file_path.stem}.jpg", f"{file_path.stem}.png"
        ]
        for name in candidates:
            p = parent / name
            if p.is_file():
                return p

        # Check for any image file in folder
        for item in parent.iterdir():
            if item.is_file() and item.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
                return item

        return None

    @staticmethod
    def get_album_art(file_path: Path, max_size: int = 512) -> Optional[bytes]:
        """
        Extracts embedded cover artwork from audio file or local folder sidecar image.
        Caches the resized JPEG image in ALBUM_ART_DIR for instant serving.
        """
        if not file_path.exists() or not file_path.is_file():
            return None

        stat = file_path.stat()
        raw = f"art_{file_path.resolve()}_{stat.st_mtime}_{stat.st_size}_{max_size}"
        key = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        disk_file = ALBUM_ART_DIR / f"{key}.jpg"

        if disk_file.exists():
            try:
                return disk_file.read_bytes()
            except Exception:
                pass

        raw_bytes: Optional[bytes] = None

        # 1. Try Mutagen extraction
        try:
            audio = mutagen.File(str(file_path))
            if audio is not None:
                # ID3
                tags = getattr(audio, "tags", None)
                if isinstance(tags, ID3):
                    for k in tags.keys():
                        if k.startswith("APIC"):
                            raw_bytes = tags[k].data
                            break
                # MP4 / M4A
                elif isinstance(audio, MP4):
                    covr = audio.tags.get("covr") if audio.tags else None
                    if covr and len(covr) > 0:
                        raw_bytes = bytes(covr[0])
                # FLAC
                elif isinstance(audio, FLAC) and audio.pictures:
                    raw_bytes = audio.pictures[0].data
                # OGG
                elif isinstance(audio, OggVorbis) and audio.tags:
                    import base64
                    for pic_header in ("metadata_block_picture", "METADATA_BLOCK_PICTURE"):
                        if pic_header in audio.tags:
                            b64 = audio.tags[pic_header][0]
                            from mutagen.flac import Picture
                            pic = Picture(base64.b64decode(b64))
                            raw_bytes = pic.data
                            break
        except Exception:
            raw_bytes = None

        # 2. Try sidecar image if no embedded image found
        if not raw_bytes:
            sidecar = MusicEngine.find_sidecar_artwork(file_path)
            if sidecar:
                try:
                    raw_bytes = sidecar.read_bytes()
                except Exception:
                    pass

        # 3. Try FFmpeg extraction if still not found
        if not raw_bytes:
            try:
                cmd = [
                    MusicEngine.get_ffmpeg_cmd(),
                    "-v", "quiet",
                    "-i", str(file_path.resolve()),
                    "-an",
                    "-vcodec", "copy",
                    "-f", "image2pipe",
                    "-"
                ]
                res = subprocess.run(cmd, capture_output=True)
                if res.returncode == 0 and res.stdout:
                    raw_bytes = res.stdout
            except Exception:
                pass

        if not raw_bytes:
            return None

        # Resize and save optimized JPEG
        try:
            img = Image.open(io.BytesIO(raw_bytes))
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=88, optimize=True)
            art_bytes = buf.getvalue()

            disk_file.write_bytes(art_bytes)
            return art_bytes
        except Exception as e:
            print(f"Error processing album art for {file_path}: {e}")
            return None

    @staticmethod
    def create_audio_transcode_process(file_path: Path, format: str = "mp3") -> subprocess.Popen:
        """
        Transcodes non-browser compatible audio files (e.g. WMA, AIFF, high-res DSD)
        to MP3 or AAC in real-time over stdout.
        """
        cmd = [
            MusicEngine.get_ffmpeg_cmd(),
            "-hide_banner",
            "-loglevel", "error",
            "-y",
            "-i", str(file_path.resolve()),
            "-vn",
            "-c:a", "libmp3lame" if format == "mp3" else "aac",
            "-b:a", "320k",
            "-f", "mp3" if format == "mp3" else "adts",
            "pipe:1"
        ]
        return subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=32 * 1024
        )
