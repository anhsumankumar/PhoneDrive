import os
import re
import cv2
import json
import hashlib
import subprocess
import shutil
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from PIL import Image
from config import THUMBNAILS_DIR

MAX_CACHE_BYTES = 5 * 1024 * 1024 * 1024 # 5 GB cache quota

def find_binary(binary_name: str) -> str:
    """Discovers binary across environment, project directories, and common Windows locations."""
    env_var = f"{binary_name.upper()}_PATH"
    if env_var in os.environ and Path(os.environ[env_var]).is_file():
        return os.environ[env_var]

    which_path = shutil.which(binary_name)
    if which_path:
        return which_path

    base_dir = Path(__file__).resolve().parent
    local_candidates = [
        base_dir / f"{binary_name}.exe",
        base_dir / "bin" / f"{binary_name}.exe",
        base_dir.parent / "bin" / f"{binary_name}.exe",
    ]
    for c in local_candidates:
        if c.is_file():
            return str(c)

    program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    system_candidates = [
        Path(r"C:\ffmpeg\bin") / f"{binary_name}.exe",
        Path(program_files) / "ffmpeg" / "bin" / f"{binary_name}.exe",
        Path(r"C:\ProgramData\chocolatey\bin") / f"{binary_name}.exe",
    ]
    if local_app_data:
        system_candidates.append(Path(local_app_data) / "Microsoft" / "WinGet" / "Links" / f"{binary_name}.exe")

    for sc in system_candidates:
        if sc.is_file():
            return str(sc)

    return binary_name

def prune_thumbnails_cache(max_bytes: int = MAX_CACHE_BYTES):
    """Purges oldest thumbnails if total cache exceeds max_bytes."""
    try:
        if not THUMBNAILS_DIR.exists():
            return
        files = list(THUMBNAILS_DIR.glob("*.jpg"))
        total_size = sum(f.stat().st_size for f in files)
        if total_size > max_bytes:
            files.sort(key=lambda f: f.stat().st_mtime)
            for f in files:
                sz = f.stat().st_size
                try:
                    f.unlink()
                    total_size -= sz
                    if total_size <= max_bytes * 0.75:
                        break
                except Exception:
                    pass
    except Exception as e:
        print(f"Error pruning thumbnails cache: {e}")

class MediaEngine:
    _PROBE_CACHE: Dict[str, Dict[str, Any]] = {}

    @staticmethod
    def get_ffmpeg_cmd() -> str:
        return find_binary("ffmpeg")

    @staticmethod
    def get_ffprobe_cmd() -> str:
        return find_binary("ffprobe")

    @staticmethod
    def probe_media(file_path: Path) -> Dict[str, Any]:
        """Probes video and audio streams using ffprobe with in-memory caching."""
        if not file_path.exists() or not file_path.is_file():
            return {
                "durationMs": 0,
                "width": 0,
                "height": 0,
                "resolution": "",
                "fps": 24.0,
                "videoCodec": "",
                "audioCodec": "",
                "isBrowserNative": False,
                "audioTracks": [],
                "subtitleTracks": [],
            }

        try:
            stat = file_path.stat()
            cache_key = f"{file_path.resolve()}_{stat.st_mtime}_{stat.st_size}"
            if cache_key in MediaEngine._PROBE_CACHE:
                return MediaEngine._PROBE_CACHE[cache_key]
        except Exception:
            cache_key = None

        result = {
            "durationMs": 0,
            "width": 0,
            "height": 0,
            "resolution": "",
            "fps": 24.0,
            "videoCodec": "",
            "audioCodec": "",
            "isBrowserNative": False,
            "audioTracks": [],
            "subtitleTracks": [],
        }

        try:
            cmd = [
                MediaEngine.get_ffprobe_cmd(),
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

                video_codec = ""
                audio_codec = ""
                has_incompatible_audio = False

                audio_idx = 0
                for s in data.get("streams", []):
                    stype = s.get("codec_type")
                    cname = s.get("codec_name", "").lower()
                    tags = s.get("tags", {})
                    lang = tags.get("language") or tags.get("LANGUAGE") or "Default"
                    title = tags.get("title") or tags.get("TITLE") or f"Track {s.get('index')}"

                    if stype == "video" and not video_codec and cname not in ("png", "jpeg", "mjpeg", "bmp"):
                        video_codec = cname
                        result["videoCodec"] = cname
                        result["width"] = int(s.get("width") or 0)
                        result["height"] = int(s.get("height") or 0)
                        fps_eval = s.get("r_frame_rate", "24/1")
                        try:
                            num, den = fps_eval.split("/")
                            result["fps"] = round(float(num) / float(den), 2)
                        except Exception:
                            result["fps"] = 24.0

                    elif stype == "audio":
                        if not audio_codec:
                            audio_codec = cname
                            result["audioCodec"] = cname
                        channels = int(s.get("channels") or 2)
                        if cname in ("ac3", "eac3", "dts", "truehd", "flac") or channels > 2:
                            has_incompatible_audio = True

                        result["audioTracks"].append({
                            "index": s.get("index"),
                            "audioIndex": audio_idx,
                            "codec": cname,
                            "language": lang.capitalize(),
                            "title": title,
                            "channels": channels,
                        })
                        audio_idx += 1

                    elif stype == "subtitle":
                        result["subtitleTracks"].append({
                            "id": f"embedded_{s.get('index')}",
                            "name": f"{lang.capitalize()} - {title} (Embedded)",
                            "language": lang,
                            "type": "SUBTITLE",
                            "isDefault": len(result["subtitleTracks"]) == 0,
                            "isEmbedded": True,
                            "streamIndex": s.get("index"),
                        })

                # Resolution label
                h = result["height"]
                w = result["width"]
                if h >= 2160 or w >= 3840:
                    result["resolution"] = "4K UHD"
                elif h >= 1080 or w >= 1920:
                    result["resolution"] = "1080p FHD"
                elif h >= 720 or w >= 1280:
                    result["resolution"] = "720p HD"
                elif h > 0:
                    result["resolution"] = f"{h}p"

                # Check if natively browser playable (MP4 with H.264 and stereo AAC/MP3)
                is_mp4 = file_path.suffix.lower() in (".mp4", ".m4v", ".webm")
                is_h264 = video_codec in ("h264", "avc1")
                is_stereo_aac = (audio_codec in ("aac", "mp3", "opus") and not has_incompatible_audio)
                result["isBrowserNative"] = is_mp4 and is_h264 and is_stereo_aac

        except Exception as e:
            print(f"ffprobe error on {file_path}: {e}")

        # Add sidecar subtitle files
        sidecars = MediaEngine.find_sidecar_subtitles(file_path)
        for sc in sidecars:
            result["subtitleTracks"].append(sc)

        if cache_key:
            MediaEngine._PROBE_CACHE[cache_key] = result

        return result

    get_media_metadata = probe_media

    @staticmethod
    def get_video_thumbnail(file_path: Path, max_size: int = 480) -> Optional[bytes]:
        """Extracts a video frame at 10% duration or first second and caches it."""
        if not file_path.exists() or not file_path.is_file():
            return None

        stat = file_path.stat()
        raw = f"video_{file_path.resolve()}_{stat.st_mtime}_{stat.st_size}_{max_size}"
        key = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        disk_file = THUMBNAILS_DIR / f"{key}.jpg"

        if disk_file.exists():
            try:
                return disk_file.read_bytes()
            except Exception:
                pass

        try:
            cap = cv2.VideoCapture(str(file_path))
            if not cap.isOpened():
                return None

            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
            
            target_frame = min(int(fps * 3), max(0, int(frame_count * 0.10)))
            cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)

            success, frame = cap.read()
            if not success or frame is None:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                success, frame = cap.read()

            cap.release()

            if not success or frame is None:
                return None

            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            img = Image.fromarray(frame_rgb)
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

            import io
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=82, optimize=True)
            thumb_bytes = buf.getvalue()

            prune_thumbnails_cache()
            disk_file.write_bytes(thumb_bytes)
            return thumb_bytes
        except Exception as e:
            print(f"Error extracting video thumbnail from {file_path}: {e}")
            return None

    @staticmethod
    def create_transcode_process(
        file_path: Path,
        start_sec: float = 0.0,
        audio_stream_idx: Optional[int] = None,
        quality: Optional[str] = None
    ) -> subprocess.Popen:
        """
        Creates an FFmpeg subprocess that outputs browser-compliant fragmented MP4
        (H.264 + AAC Stereo) over stdout for real-time video playback.
        Optionally scales video resolution (4k/2160p, 1080p, 720p, 480p, 360p).
        """
        probe = MediaEngine.probe_media(file_path)
        video_codec = probe.get("videoCodec", "").lower()
        source_height = probe.get("height", 0)

        cmd = [MediaEngine.get_ffmpeg_cmd()]

        # Fast keyframe seek before input
        if start_sec > 0:
            cmd.extend(["-ss", f"{start_sec:.2f}"])

        cmd.extend([
            "-i", str(file_path.resolve()),
            "-map", "0:v:0",
        ])

        # Map audio track
        if audio_stream_idx is not None:
            cmd.extend(["-map", f"0:{audio_stream_idx}"])
        else:
            cmd.extend(["-map", "0:a:0?"])

        # Determine Quality Scaling Profile
        QUALITY_PROFILES = {
            "4k": {"height": 2160, "bitrate": "12000k", "maxrate": "16000k", "bufsize": "24000k", "crf": "20"},
            "2160p": {"height": 2160, "bitrate": "12000k", "maxrate": "16000k", "bufsize": "24000k", "crf": "20"},
            "1080p": {"height": 1080, "bitrate": "4200k", "maxrate": "5500k", "bufsize": "8000k", "crf": "22"},
            "720p": {"height": 720, "bitrate": "2000k", "maxrate": "2600k", "bufsize": "4000k", "crf": "23"},
            "480p": {"height": 480, "bitrate": "800k", "maxrate": "1100k", "bufsize": "1600k", "crf": "25"},
            "360p": {"height": 360, "bitrate": "400k", "maxrate": "550k", "bufsize": "800k", "crf": "27"},
        }

        q_key = quality.lower() if quality else None
        profile = QUALITY_PROFILES.get(q_key)

        # Video encoding strategy
        if profile is not None:
            # Explicit quality requested by user (e.g. 480p, 720p, 1080p, 4K)
            target_h = profile["height"]
            scale_filter = f"scale=-2:'min(ih,{target_h})'"
            cmd.extend([
                "-vf", scale_filter,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-tune", "zerolatency",
                "-crf", profile["crf"],
                "-b:v", profile["bitrate"],
                "-maxrate", profile["maxrate"],
                "-bufsize", profile["bufsize"],
                "-pix_fmt", "yuv420p",
            ])
        elif video_codec in ("h264", "avc", "avc1"):
            # Auto / Original resolution and native H.264: zero-CPU direct stream copy
            cmd.extend(["-c:v", "copy"])
        else:
            # Auto / Original resolution for non-native video codecs (HEVC, VP9, etc.)
            cmd.extend([
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-tune", "zerolatency",
                "-crf", "22",
                "-pix_fmt", "yuv420p",
            ])

        # Always convert audio to AAC stereo (compatible with all browsers & TVs)
        cmd.extend([
            "-c:a", "aac",
            "-ac", "2",
            "-b:a", "192k",
            "-f", "mp4",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof",
            "-"
        ])

        return subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=64 * 1024
        )

    @staticmethod
    def get_embedded_subtitle_vtt(file_path: Path, stream_index: int) -> str:
        """Extracts an embedded subtitle stream from MKV/MP4 as WebVTT format."""
        try:
            cmd = [
                MediaEngine.get_ffmpeg_cmd(),
                "-v", "quiet",
                "-i", str(file_path.resolve()),
                "-map", f"0:{stream_index}",
                "-f", "webvtt",
                "-"
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
            if res.returncode == 0 and res.stdout.strip():
                return res.stdout
        except Exception as e:
            print(f"Error extracting embedded subtitle from {file_path}: {e}")
        return "WEBVTT\n\n"

    @staticmethod
    def find_sidecar_subtitles(video_path: Path) -> List[Dict[str, Any]]:
        """Finds .srt and .vtt subtitle files in the same directory."""
        tracks = []
        parent = video_path.parent
        stem = video_path.stem.lower()

        if not parent.exists():
            return tracks

        for item in parent.iterdir():
            if item.is_file() and item.suffix.lower() in (".srt", ".vtt"):
                item_stem = item.stem.lower()
                if item_stem == stem or item_stem.startswith(stem):
                    parts = item.stem.split(".")
                    lang = "Default"
                    if len(parts) > 1:
                        suffix = parts[-1].lower()
                        if suffix in ("en", "eng", "english"):
                            lang = "English"
                        elif suffix in ("hi", "hin", "hindi"):
                            lang = "Hindi"
                        else:
                            lang = suffix.capitalize()

                    tracks.append({
                        "id": str(item.resolve()),
                        "name": f"{lang} ({item.suffix[1:].upper()})",
                        "language": lang,
                        "type": "SUBTITLE",
                        "isDefault": len(tracks) == 0,
                        "isEmbedded": False,
                    })

        return tracks

    @staticmethod
    def convert_srt_to_vtt(srt_content: str) -> str:
        """Converts SubRip (.srt) to WebVTT with UTF-8 support."""
        vtt = ["WEBVTT\n"]
        pattern = re.compile(r"(\d{2}:\d{2}:\d{2}),(\d{3})")
        converted = pattern.sub(r"\1.\2", srt_content)
        vtt.append(converted)
        return "\n".join(vtt)

    @staticmethod
    def parse_series_info(name: str) -> Tuple[Optional[str], Optional[int], Optional[int]]:
        clean_name = name.rsplit(".", 1)[0]
        match = re.search(r"^(.*?)[._ -]+[sS](\d+)[eE](\d+)", clean_name, re.IGNORECASE)
        if match:
            series_name = match.group(1).replace(".", " ").replace("_", " ").strip()
            season = int(match.group(2))
            episode = int(match.group(3))
            return series_name, season, episode

        match = re.search(r"^(.*?)[._ -]+(\d+)x(\d+)", clean_name, re.IGNORECASE)
        if match:
            series_name = match.group(1).replace(".", " ").replace("_", " ").strip()
            season = int(match.group(2))
            episode = int(match.group(3))
            return series_name, season, episode

        return None, None, None
