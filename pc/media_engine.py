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

MAX_CACHE_BYTES = 5 * 1024 * 1024 * 1024  # 5 GB cache quota

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
        """
        Deep capability analysis using ffprobe:
        Extracts container, video/audio codecs, resolution, frame rate, duration,
        bitrates, bit depth (8/10-bit), HDR information, multi-audio tracks,
        embedded and sidecar subtitles, and evaluates optimal playback strategy.
        """
        if not file_path.exists() or not file_path.is_file():
            return {
                "container": "",
                "containerLongName": "",
                "durationMs": 0,
                "fileSize": 0,
                "overallBitrate": 0,
                "width": 0,
                "height": 0,
                "resolution": "",
                "fps": 24.0,
                "aspectRatio": "16:9",
                "pixFmt": "",
                "bitDepth": 8,
                "isHdr": False,
                "hdrType": "SDR",
                "videoCodec": "",
                "videoCodecLongName": "",
                "videoBitrate": 0,
                "audioCodec": "",
                "audioCodecLongName": "",
                "audioBitrate": 0,
                "isBrowserNative": False,
                "playbackStrategy": "transcode_full",
                "strategyReason": "File not found",
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

        ext = file_path.suffix.lower()
        is_mp4_family = ext in (".mp4", ".m4v", ".webm", ".mov")

        result: Dict[str, Any] = {
            "container": ext.lstrip("."),
            "containerLongName": "",
            "durationMs": 0,
            "fileSize": stat.st_size if 'stat' in locals() else 0,
            "overallBitrate": 0,
            "width": 0,
            "height": 0,
            "resolution": "",
            "fps": 24.0,
            "aspectRatio": "16:9",
            "pixFmt": "yuv420p",
            "bitDepth": 8,
            "isHdr": False,
            "hdrType": "SDR",
            "videoCodec": "",
            "videoCodecLongName": "",
            "videoBitrate": 0,
            "audioCodec": "",
            "audioCodecLongName": "",
            "audioBitrate": 0,
            "isBrowserNative": is_mp4_family,
            "playbackStrategy": "direct" if is_mp4_family else "transcode_full",
            "strategyReason": "Standard browser direct play",
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
                result["container"] = fmt.get("format_name", ext.lstrip("."))
                result["containerLongName"] = fmt.get("format_long_name", "")
                result["overallBitrate"] = int(fmt.get("bit_rate", 0))

                video_codec = ""
                audio_codec = ""
                has_incompatible_audio = False
                audio_idx = 0

                for s in data.get("streams", []):
                    stype = s.get("codec_type")
                    cname = s.get("codec_name", "").lower()
                    clong = s.get("codec_long_name", "")
                    tags = s.get("tags", {})
                    lang = tags.get("language") or tags.get("LANGUAGE") or "Default"
                    title = tags.get("title") or tags.get("TITLE") or f"Track {s.get('index')}"

                    if stype == "video" and not video_codec and cname not in ("png", "jpeg", "mjpeg", "bmp"):
                        video_codec = cname
                        result["videoCodec"] = cname
                        result["videoCodecLongName"] = clong
                        result["width"] = int(s.get("width") or 0)
                        result["height"] = int(s.get("height") or 0)
                        result["pixFmt"] = s.get("pix_fmt", "yuv420p")
                        result["videoBitrate"] = int(s.get("bit_rate") or 0)

                        # Aspect Ratio
                        dar = s.get("display_aspect_ratio")
                        if dar and ":" in dar:
                            result["aspectRatio"] = dar
                        elif result["width"] > 0 and result["height"] > 0:
                            ratio = result["width"] / result["height"]
                            if abs(ratio - 16/9) < 0.05:
                                result["aspectRatio"] = "16:9"
                            elif abs(ratio - 2.39) < 0.15 or abs(ratio - 2.35) < 0.15:
                                result["aspectRatio"] = "21:9"
                            elif abs(ratio - 4/3) < 0.05:
                                result["aspectRatio"] = "4:3"
                            else:
                                result["aspectRatio"] = f"{result['width']}:{result['height']}"

                        # Bit Depth
                        bits = s.get("bits_per_raw_sample")
                        if bits:
                            try:
                                result["bitDepth"] = int(bits)
                            except Exception:
                                pass
                        elif "10le" in result["pixFmt"] or "10be" in result["pixFmt"] or "p10" in result["pixFmt"]:
                            result["bitDepth"] = 10
                        elif "12le" in result["pixFmt"] or "p12" in result["pixFmt"]:
                            result["bitDepth"] = 12

                        # HDR Detection
                        color_primaries = s.get("color_primaries", "")
                        color_transfer = s.get("color_transfer", "")
                        if color_primaries in ("bt2020", "arib-std-b67") or color_transfer in ("smpte2084", "arib-std-b67"):
                            result["isHdr"] = True
                            if color_transfer == "smpte2084":
                                result["hdrType"] = "HDR10"
                            elif color_transfer == "arib-std-b67":
                                result["hdrType"] = "HLG"
                            else:
                                result["hdrType"] = "HDR (BT.2020)"
                        elif "dovi" in s or "dvhe" in cname:
                            result["isHdr"] = True
                            result["hdrType"] = "Dolby Vision"

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
                            result["audioCodecLongName"] = clong
                            result["audioBitrate"] = int(s.get("bit_rate") or 0)
                        channels = int(s.get("channels") or 2)
                        channel_layout = s.get("channel_layout", "stereo" if channels == 2 else f"{channels} channels")
                        sample_rate = int(s.get("sample_rate") or 44100)

                        if cname in ("ac3", "eac3", "dts", "truehd", "flac") or channels > 2:
                            has_incompatible_audio = True

                        result["audioTracks"].append({
                            "index": s.get("index"),
                            "audioIndex": audio_idx,
                            "codec": cname,
                            "codecLongName": clong,
                            "language": lang.capitalize(),
                            "title": title,
                            "channels": channels,
                            "channelLayout": channel_layout,
                            "sampleRate": sample_rate,
                        })
                        audio_idx += 1

                    elif stype == "subtitle":
                        result["subtitleTracks"].append({
                            "id": f"embedded_{s.get('index')}",
                            "name": f"{lang.capitalize()} - {title} (Embedded {cname.upper()})",
                            "language": lang,
                            "type": "SUBTITLE",
                            "isDefault": len(result["subtitleTracks"]) == 0,
                            "isEmbedded": True,
                            "streamIndex": s.get("index"),
                            "format": cname,
                        })

                # Human-friendly Resolution label
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

                # ----------------- CAPABILITY & STRATEGY ASSIGNMENT -----------------
                # Browser-native video criteria: MP4/WebM/MOV container, H.264 / VP9 / AV1 codec, 8-bit SDR, stereo AAC/MP3/Opus audio
                is_native_container = ext in (".mp4", ".m4v", ".webm", ".mov")
                is_native_video = video_codec in ("h264", "avc", "avc1") and result["bitDepth"] == 8 and not result["isHdr"]
                is_native_audio = audio_codec in ("aac", "mp3", "opus") and not has_incompatible_audio

                if is_native_container and is_native_video and is_native_audio:
                    result["isBrowserNative"] = True
                    result["playbackStrategy"] = "direct"
                    result["strategyReason"] = "Compatible container and codecs: instant direct HTTP range streaming"
                elif is_native_video and is_native_audio:
                    # Video and audio streams are natively compatible, but container is MKV, TS, AVI
                    result["isBrowserNative"] = False
                    result["playbackStrategy"] = "remux"
                    result["strategyReason"] = f"{ext.upper()[1:]} container: fast stream-copy remux into fragmented MP4 (0% CPU re-encoding)"
                elif is_native_video and not is_native_audio:
                    # Video is H.264 compatible, but audio is AC-3 / DTS / 5.1ch surround
                    result["isBrowserNative"] = False
                    result["playbackStrategy"] = "transcode_audio"
                    result["strategyReason"] = f"Video preserved via stream copy; {audio_codec.upper()} audio transcoded to AAC stereo"
                else:
                    # Incompatible video (HEVC, VC-1, MPEG2, 10-bit HDR, VP8)
                    result["isBrowserNative"] = False
                    result["playbackStrategy"] = "transcode_full"
                    result["strategyReason"] = f"Codec {video_codec.upper() or 'unknown'} ({result['resolution']}) requires real-time H.264 transcoding"

        except Exception as e:
            print(f"ffprobe error on {file_path}: {e}")

        # Add sidecar subtitle files (.srt, .vtt)
        sidecars = MediaEngine.find_sidecar_subtitles(file_path)
        for sc in sidecars:
            result["subtitleTracks"].append(sc)

        if cache_key:
            MediaEngine._PROBE_CACHE[cache_key] = result

        return result

    get_media_metadata = probe_media

    @staticmethod
    def create_transcode_process(
        file_path: Path,
        start_sec: float = 0.0,
        audio_stream_idx: Optional[int] = None,
        quality: Optional[str] = None,
        strategy_override: Optional[str] = None
    ) -> subprocess.Popen:
        """
        Creates an asynchronous FFmpeg process streaming fragmented MP4 (fMP4) to stdout.
        Uses capability-based streaming:
          - 'remux': Stream-copy video and audio (0% CPU, instant start)
          - 'transcode_audio': Stream-copy video, transcode audio to AAC stereo
          - 'transcode_full': Full x264 video transcode + AAC audio with hardware-assisted zero latency
        """
        probe = MediaEngine.probe_media(file_path)
        video_codec = probe.get("videoCodec", "").lower()
        strategy = strategy_override or probe.get("playbackStrategy", "transcode_full")

        cmd = [
            MediaEngine.get_ffmpeg_cmd(),
            "-hide_banner",
            "-loglevel", "error",
            "-y",
        ]

        # Fast keyframe seek before input
        if start_sec > 0:
            cmd.extend(["-ss", f"{start_sec:.2f}"])

        cmd.extend([
            "-i", str(file_path.resolve()),
            "-map", "0:v:0",
        ])

        # Map audio track
        if audio_stream_idx is not None and audio_stream_idx >= 0:
            cmd.extend(["-map", f"0:{audio_stream_idx}"])
        else:
            cmd.extend(["-map", "0:a:0?"])

        # Determine if scaling or quality is requested
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

        if profile is not None:
            # Explicit scaling requested
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
                "-c:a", "aac",
                "-ac", "2",
                "-b:a", "192k",
            ])
        elif strategy == "remux":
            # Fast container remux without any re-encoding (e.g. MKV with H.264 + AAC)
            cmd.extend([
                "-c:v", "copy",
                "-c:a", "copy",
            ])
        elif strategy == "transcode_audio":
            # Copy compatible video, transcode only audio
            cmd.extend([
                "-c:v", "copy",
                "-c:a", "aac",
                "-ac", "2",
                "-b:a", "256k",
            ])
        else:
            # Full transcode for incompatible codecs (HEVC, VC-1, MPEG2, 10-bit, HDR)
            cmd.extend([
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-tune", "zerolatency",
                "-crf", "22",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-ac", "2",
                "-b:a", "192k",
            ])

        # Output fragmented MP4 over stdout
        cmd.extend([
            "-f", "mp4",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof",
            "pipe:1"
        ])

        return subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=64 * 1024
        )

    @staticmethod
    def get_video_thumbnail(file_path: Path, max_size: int = 480) -> Optional[bytes]:
        """Extracts a video frame at 10% duration or first 3 seconds and caches it."""
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
        """Converts SubRip (.srt) to WebVTT with Unicode UTF-8 support (English, Hindi, etc.)."""
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
