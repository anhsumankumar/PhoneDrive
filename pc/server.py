import os
import mimetypes
import base64
import platform
import shutil
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, Request, Response, HTTPException, Depends, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from config import WEB_DIST_DIR, get_local_ip
from database import Database
from thumbnail_engine import ThumbnailEngine
from media_engine import MediaEngine
from qr_generator import generate_qr_bytes

app = FastAPI(title="PhoneDrive PC Server", version="1.0.0")
db = Database()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- ID & PATH HELPERS & SECURITY -----------------
def is_path_authorized(path: Path) -> bool:
    """Verifies that a resolved path is within one of the user's authorized shared folders."""
    try:
        resolved = path.resolve()
        folders = db.get_authorized_folders()
        for f in folders:
            auth_root = Path(f["path"]).resolve()
            if resolved == auth_root or auth_root in resolved.parents:
                return True
        return False
    except Exception:
        return False

def encode_path_id(path: Path) -> str:
    """Encodes an absolute path to a URL-safe Base64 string."""
    return base64.urlsafe_b64encode(str(path.resolve()).encode("utf-8")).decode("utf-8").rstrip("=")

def decode_path_id(path_id: str) -> Optional[Path]:
    """Decodes a URL-safe Base64 string back to an absolute Path and strictly enforces shared folder boundaries."""
    try:
        # Add back padding
        padding = 4 - (len(path_id) % 4)
        if padding != 4:
            path_id += "=" * padding
        raw_path = base64.urlsafe_b64decode(path_id.encode("utf-8")).decode("utf-8")
        p = Path(raw_path).resolve()
        if not p.exists():
            return None
        # Strict boundary enforcement: must reside inside an authorized shared folder
        if not is_path_authorized(p):
            return None
        return p
    except Exception:
        return None

def is_image(p: Path) -> bool:
    return p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg")

def is_video(p: Path) -> bool:
    return p.suffix.lower() in (".mp4", ".mkv", ".webm", ".avi", ".mov", ".m4v", ".flv", ".wmv")

def is_audio(p: Path) -> bool:
    return p.suffix.lower() in (".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac", ".opus")

def is_document(p: Path) -> bool:
    return p.suffix.lower() in (".pdf", ".txt", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip", ".tar", ".gz")

# ----------------- AUTH DEPENDENCY -----------------
def get_current_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        return auth[7:].strip()
    return request.query_params.get("token")

def require_auth(request: Request) -> bool:
    if not db.is_password_set():
        return True

    token = get_current_token(request)
    if not token or not db.validate_session(token):
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid or expired session")
    return True

# ----------------- AUTH & PAIRING ENDPOINTS -----------------
@app.post("/api/v1/auth/login")
async def login(request: Request):
    data = await request.json()
    password = data.get("password", "")
    
    if db.is_password_set():
        if not db.verify_password(password):
            return JSONResponse(status_code=401, content={"success": False, "error": "Invalid password"})

    token = db.create_session("pc_browser", request.headers.get("User-Agent", "Browser"))
    return {"success": True, "data": {"token": token, "deviceId": "pc_browser"}}

@app.post("/api/v1/pairing/complete")
async def pairing_complete(request: Request):
    data = await request.json()
    pair_token = data.get("pairToken", "")
    device_name = data.get("deviceName", request.headers.get("User-Agent", "Browser Device"))

    if not pair_token or not db.consume_pairing_token(pair_token):
        return JSONResponse(status_code=403, content={"success": False, "error": "Invalid or expired pairing token"})

    session_token = db.create_session(device_name[:32], device_name)
    db.log_activity("QR Pairing", request.client.host if request.client else "unknown", "SUCCESS")
    return {"success": True, "data": {"token": session_token, "deviceId": device_name[:32]}}

@app.post("/api/v1/auth/logout")
async def logout(request: Request):
    token = get_current_token(request)
    if token:
        db.revoke_session(token)
    return {"success": True, "data": None}

@app.get("/api/v1/session")
async def get_session(request: Request):
    if not db.is_password_set():
        return {"success": True, "data": {"authenticated": True, "deviceId": "browser"}}
    token = get_current_token(request)
    is_valid = db.validate_session(token) if token else False
    return {"success": True, "data": {"authenticated": is_valid, "deviceId": "browser"}}

# ----------------- STORAGE & STATUS -----------------
@app.get("/api/v1/storage/status")
async def storage_status(request: Request):
    require_auth(request)
    try:
        # Get primary drive space
        root_path = Path.home().drive or "C:"
        total, used, free = shutil.disk_usage(root_path)
    except Exception:
        total, used, free = 1000000000000, 500000000000, 500000000000

    return {
        "success": True,
        "data": {
            "totalSpaceBytes": total,
            "freeSpaceBytes": free,
            "usedSpaceBytes": used,
            "deviceName": f"{platform.system()} PC ({platform.node()})",
            "serverVersion": "1.0.0-PC",
        }
    }

# ----------------- FOLDERS -----------------
@app.get("/api/v1/folders")
async def list_folders(request: Request):
    require_auth(request)
    folders = db.get_folders()
    # Check accessibility
    result = []
    for f in folders:
        p = Path(f["path"])
        result.append({
            "id": f["id"],
            "name": f["name"],
            "uri": f["path"],
            "createdAt": f["created_at"],
            "isAccessible": p.exists() and p.is_dir(),
        })
    return {"success": True, "data": result}

@app.post("/api/v1/folders")
async def add_folder(request: Request):
    require_auth(request)
    data = await request.json()
    name = data.get("name", "")
    path = data.get("path", "")
    p = Path(path)
    if not p.exists() or not p.is_dir():
        return JSONResponse(status_code=400, content={"success": False, "error": "Folder path does not exist on PC"})
    db.set_setting("folders_initialized", "1")
    folder = db.add_folder(name or p.name, str(p))
    return {"success": True, "data": folder}

@app.delete("/api/v1/folders/{folder_id}")
async def remove_folder(folder_id: str, request: Request):
    require_auth(request)
    db.set_setting("folders_initialized", "1")
    removed = db.remove_folder(folder_id)
    return {"success": removed, "data": None}

# ----------------- FILES LISTING -----------------
@app.get("/api/v1/files")
async def list_files(
    request: Request,
    folderId: Optional[str] = Query(None),
    parentId: Optional[str] = Query(None),
    category: Optional[str] = Query("all"),
    search: Optional[str] = Query(None),
    sort: Optional[str] = Query("name_asc"),
):
    require_auth(request)
    shared_folders = db.get_folders()
    if not shared_folders:
        return {"success": True, "data": {"files": [], "breadcrumbs": []}}

    # 1. Root level with multiple folders
    if not folderId and not parentId and category == "all" and not search:
        files = []
        for f in shared_folders:
            p = Path(f["path"])
            files.append({
                "id": f"folder_{f['id']}",
                "name": f["name"],
                "isDirectory": True,
                "mimeType": "resource/folder",
                "size": 0,
                "lastModified": f["created_at"],
                "folderId": f["id"],
            })
        return {
            "success": True,
            "data": {
                "files": files,
                "breadcrumbs": [{"id": "", "name": "All Files"}],
            }
        }

    # 2. Category view across all folders (photos, videos, audio, documents)
    if category and category != "all" and not folderId and not parentId:
        matched_files = []
        for f in shared_folders:
            base_p = Path(f["path"])
            if not base_p.exists():
                continue
            for root, _, filenames in os.walk(base_p):
                for fname in filenames:
                    file_p = Path(root) / fname
                    if category == "photos" and not is_image(file_p):
                        continue
                    if category == "videos" and not is_video(file_p):
                        continue
                    if category == "audio" and not is_audio(file_p):
                        continue
                    if category == "documents" and not is_document(file_p):
                        continue
                    if search and search.lower() not in fname.lower():
                        continue

                    stat = file_p.stat()
                    mime, _ = mimetypes.guess_type(str(file_p))
                    matched_files.append({
                        "id": encode_path_id(file_p),
                        "name": fname,
                        "isDirectory": False,
                        "mimeType": mime or "application/octet-stream",
                        "size": stat.st_size,
                        "lastModified": int(stat.st_mtime * 1000),
                        "folderId": f["id"],
                    })
                    if len(matched_files) >= 500:
                        break
                if len(matched_files) >= 500:
                    break

        cat_names = {
            "photos": "Photos",
            "videos": "Videos",
            "audio": "Audio",
            "documents": "Documents",
            "cinema": "Cinema & Shows",
        }
        return {
            "success": True,
            "data": {
                "files": matched_files,
                "breadcrumbs": [
                    {"id": "", "name": "All Files"},
                    {"id": f"cat_{category}", "name": cat_names.get(category, category.title())},
                ],
            }
        }

    # 3. Specific Folder / Subdirectory Navigation
    target_dir: Optional[Path] = None
    target_folder_id = folderId or ""
    breadcrumbs = [{"id": "", "name": "All Files"}]

    if parentId:
        target_dir = decode_path_id(parentId)
    elif folderId:
        f_info = db.get_folder_by_id(folderId)
        if f_info:
            target_dir = Path(f_info["path"])
            breadcrumbs.append({"id": f"folder_{folderId}", "name": f_info["name"]})

    if not target_dir or not target_dir.exists():
        return {"success": True, "data": {"files": [], "breadcrumbs": breadcrumbs}}

    # Build breadcrumb path
    # ...
    items = []
    try:
        for entry in target_dir.iterdir():
            if entry.name.startswith("."):
                continue
            if search and search.lower() not in entry.name.lower():
                continue

            stat = entry.stat()
            mime, _ = mimetypes.guess_type(str(entry))
            items.append({
                "id": encode_path_id(entry),
                "name": entry.name,
                "isDirectory": entry.is_dir(),
                "mimeType": "resource/folder" if entry.is_dir() else (mime or "application/octet-stream"),
                "size": stat.st_size if not entry.is_dir() else 0,
                "lastModified": int(stat.st_mtime * 1000),
                "folderId": target_folder_id,
            })
    except Exception as e:
        print(f"Error listing directory {target_dir}: {e}")

    # Sort directories first, then by name
    items.sort(key=lambda x: (not x["isDirectory"], x["name"].lower()))

    return {
        "success": True,
        "data": {
            "files": items,
            "breadcrumbs": breadcrumbs,
        }
    }

# ----------------- FILE CONTENT & THUMBNAILS -----------------
@app.get("/api/v1/files/{file_id}/content")
async def get_file_content(file_id: str, request: Request, download: bool = False):
    require_auth(request)
    file_path = decode_path_id(file_id)
    if not file_path or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    mime, _ = mimetypes.guess_type(str(file_path))
    mime = mime or "application/octet-stream"

    headers = {}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{file_path.name}"'
    else:
        headers["Content-Disposition"] = f'inline; filename="{file_path.name}"'

    return FileResponse(path=str(file_path), media_type=mime, headers=headers)

@app.get("/api/v1/files/{file_id}/thumbnail")
async def get_file_thumbnail(file_id: str, request: Request):
    require_auth(request)
    file_path = decode_path_id(file_id)
    if not file_path or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    thumb = ThumbnailEngine.get_thumbnail(file_path, max_size=320)
    if not thumb:
        # Fallback to direct content or 404
        return FileResponse(path=str(file_path))

    return Response(content=thumb, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})

# ----------------- MEDIA & CINEMA -----------------
@app.get("/api/v1/media")
async def get_media_library(request: Request, search: Optional[str] = None):
    require_auth(request)
    shared_folders = db.get_folders()
    all_videos = []
    
    for f in shared_folders:
        base_p = Path(f["path"])
        if not base_p.exists():
            continue
        for root, _, filenames in os.walk(base_p):
            for fname in filenames:
                file_p = Path(root) / fname
                if is_video(file_p):
                    if search and search.lower() not in fname.lower():
                        continue
                    stat = file_p.stat()
                    meta = MediaEngine.get_media_metadata(file_p)
                    media_id = encode_path_id(file_p)
                    
                    series_name, season, episode = MediaEngine.parse_series_info(fname)
                    
                    all_videos.append({
                        "id": media_id,
                        "title": fname.rsplit(".", 1)[0].replace(".", " "),
                        "name": fname,
                        "durationMs": meta["durationMs"],
                        "resolution": meta["resolution"],
                        "width": meta["width"],
                        "height": meta["height"],
                        "size": stat.st_size,
                        "seriesName": series_name,
                        "seasonNumber": season,
                        "episodeNumber": episode,
                        "folderId": f["id"],
                    })

    # Group into Movies and Series
    series_map: Dict[str, Dict[str, Any]] = {}
    movies = []

    for vid in all_videos:
        if vid["seriesName"]:
            s_name = vid["seriesName"]
            if s_name not in series_map:
                series_map[s_name] = {
                    "id": f"series_{s_name}",
                    "title": s_name,
                    "seasons": {},
                    "episodesCount": 0,
                    "sampleMediaId": vid["id"],
                }
            season_num = vid["seasonNumber"] or 1
            if season_num not in series_map[s_name]["seasons"]:
                series_map[s_name]["seasons"][season_num] = []
            series_map[s_name]["seasons"][season_num].append(vid)
            series_map[s_name]["episodesCount"] += 1
        else:
            movies.append(vid)

    # Continue Watching
    all_progress = db.get_all_playback_progress()
    continue_watching = []
    for vid in all_videos:
        if vid["id"] in all_progress:
            prog = all_progress[vid["id"]]
            if not prog["completed"] and prog["positionMs"] > 5000:
                continue_watching.append({
                    **vid,
                    "progress": prog,
                })

    # Featured Hero Video
    featured = all_videos[0] if all_videos else None

    # Series list format
    series_list = []
    for s_name, s_data in series_map.items():
        seasons_arr = []
        for s_num, eps in sorted(s_data["seasons"].items()):
            eps.sort(key=lambda x: x["episodeNumber"] or 0)
            seasons_arr.append({
                "seasonNumber": s_num,
                "episodes": eps,
            })
        series_list.append({
            "id": s_data["id"],
            "title": s_data["title"],
            "episodesCount": s_data["episodesCount"],
            "sampleMediaId": s_data["sampleMediaId"],
            "seasons": seasons_arr,
        })

    watchlist_ids = set(db.get_watchlist())
    watchlist_items = [v for v in all_videos if v["id"] in watchlist_ids]
    for v in all_videos:
        v["isWatchlisted"] = (v["id"] in watchlist_ids)

    return {
        "success": True,
        "data": {
            "totalVideos": len(all_videos),
            "featured": featured,
            "continueWatching": continue_watching,
            "recentlyAdded": all_videos[:24],
            "movies": movies,
            "series": series_list,
            "watchlist": watchlist_items,
            "allVideos": all_videos,
            "all": all_videos,
        }
    }

@app.get("/api/v1/media/{media_id}")
async def get_media_details(media_id: str, request: Request):
    require_auth(request)
    file_path = decode_path_id(media_id)
    if not file_path or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Media not found")

    probe = MediaEngine.probe_media(file_path)
    stat = file_path.stat()

    return {
        "success": True,
        "data": {
            "id": media_id,
            "title": file_path.stem.replace(".", " "),
            "name": file_path.name,
            "durationMs": probe["durationMs"],
            "resolution": probe["resolution"],
            "width": probe["width"],
            "height": probe["height"],
            "videoCodec": probe["videoCodec"],
            "audioCodec": probe["audioCodec"],
            "isBrowserNative": probe["isBrowserNative"],
            "size": stat.st_size,
            "tracks": probe["subtitleTracks"],
            "audioTracks": probe["audioTracks"],
        }
    }

@app.get("/api/v1/media/{media_id}/thumbnail")
async def get_media_thumbnail(media_id: str, request: Request):
    require_auth(request)
    file_path = decode_path_id(media_id)
    if not file_path or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Media not found")

    thumb = MediaEngine.get_video_thumbnail(file_path)
    if not thumb:
        raise HTTPException(status_code=404, detail="Thumbnail could not be generated")

    return Response(content=thumb, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})

@app.get("/api/v1/media/{media_id}/tracks")
async def get_media_tracks(media_id: str, request: Request):
    require_auth(request)
    file_path = decode_path_id(media_id)
    if not file_path or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Media not found")

    probe = MediaEngine.probe_media(file_path)
    combined_tracks = []

    # Subtitles
    for sub in probe.get("subtitleTracks", []):
        combined_tracks.append({
            "id": str(sub.get("id")),
            "type": "subtitle",
            "label": sub.get("name") or f"{sub.get('language', 'Unknown')} Subtitle",
            "language": sub.get("language"),
            "isDefault": sub.get("isDefault", False),
            "format": "vtt",
            "source": "embedded" if sub.get("isEmbedded") else "sidecar",
        })

    # Audio
    for a in probe.get("audioTracks", []):
        combined_tracks.append({
            "id": str(a.get("index")),
            "type": "audio",
            "label": f"{a.get('language', 'Audio')} ({a.get('codec', '').upper()} {a.get('channels', 2)}ch) - {a.get('title', '')}".strip(" -"),
            "language": a.get("language"),
            "isDefault": a.get("audioIndex", 0) == 0,
            "format": a.get("codec"),
            "source": "embedded",
        })

    return {
        "success": True,
        "data": combined_tracks
    }

@app.get("/api/v1/media/{media_id}/subtitles/{track_id}")
async def get_media_subtitles(media_id: str, track_id: str, request: Request):
    require_auth(request)
    file_path = decode_path_id(media_id)
    if not file_path or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Media not found")

    if track_id.startswith("embedded_"):
        try:
            stream_idx = int(track_id.replace("embedded_", ""))
            content = MediaEngine.get_embedded_subtitle_vtt(file_path, stream_idx)
            return Response(content=content, media_type="text/vtt; charset=utf-8")
        except Exception:
            return Response(content="WEBVTT\n\n", media_type="text/vtt; charset=utf-8")

    sub_path = Path(track_id)
    if not sub_path.exists():
        raise HTTPException(status_code=404, detail="Subtitle file not found")

    content = sub_path.read_text(encoding="utf-8", errors="replace")
    if sub_path.suffix.lower() == ".srt":
        content = MediaEngine.convert_srt_to_vtt(content)

    return Response(content=content, media_type="text/vtt; charset=utf-8")

# ----------------- SMART VIDEO STREAMING (DIRECT OR TRANSCODED) -----------------
@app.get("/api/v1/media/{media_id}/stream")
async def stream_media(
    media_id: str,
    request: Request,
    start: float = Query(0.0),
    transcode: Optional[str] = Query(None),
    audioTrack: Optional[int] = Query(None),
    direct: Optional[str] = Query(None),
    quality: Optional[str] = Query(None)
):
    require_auth(request)
    file_path = decode_path_id(media_id)
    if not file_path or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Video file not found")

    probe = MediaEngine.probe_media(file_path)
    is_native = probe.get("isBrowserNative", False)
    force_direct = (direct == "1")
    has_specific_quality = bool(quality and quality.lower() not in ("auto", "original"))

    # If the file is NOT browser native (e.g. MKV, HEVC, AC3, DTS) OR transcode is requested OR specific quality is requested:
    # Stream real-time browser-compatible fragmented MP4 (H.264 + AAC Stereo)
    should_transcode = (not is_native and not force_direct) or (transcode == "1") or has_specific_quality
    if should_transcode:
        try:
            proc = MediaEngine.create_transcode_process(
                file_path,
                start_sec=start,
                audio_stream_idx=audioTrack,
                quality=quality
            )

            def iter_stream():
                try:
                    while True:
                        chunk = proc.stdout.read(64 * 1024)
                        if not chunk:
                            break
                        yield chunk
                finally:
                    try:
                        proc.terminate()
                        proc.wait(timeout=0.5)
                    except Exception:
                        try:
                            proc.kill()
                        except Exception:
                            pass

            headers = {
                "Content-Type": "video/mp4",
                "Accept-Ranges": "none",
                "Cache-Control": "no-cache, no-store",
                "X-Content-Type-Options": "nosniff",
            }
            return StreamingResponse(iter_stream(), media_type="video/mp4", headers=headers)
        except Exception as e:
            print(f"[!] Transcoding failed ({e}), falling back to direct stream: {file_path}")

    # Native browser MP4 direct streaming with Range 206
    stat = file_path.stat()
    file_size = stat.st_size
    range_header = request.headers.get("Range")
    mime, _ = mimetypes.guess_type(str(file_path))
    mime = mime or "video/mp4"

    if not range_header:
        return FileResponse(
            path=str(file_path),
            media_type=mime,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
            }
        )

    range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
    if not range_match:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})

    start_byte = int(range_match.group(1))
    end_byte = int(range_match.group(2)) if range_match.group(2) else file_size - 1

    if start_byte >= file_size or end_byte >= file_size or start_byte > end_byte:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})

    chunk_length = min(2 * 1024 * 1024, end_byte - start_byte + 1)
    effective_end = start_byte + chunk_length - 1

    def iter_bytes():
        with open(file_path, "rb") as f:
            f.seek(start_byte)
            remaining = effective_end - start_byte + 1
            while remaining > 0:
                read_size = min(64 * 1024, remaining)
                data = f.read(read_size)
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {
        "Content-Range": f"bytes {start_byte}-{effective_end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(chunk_length),
        "Content-Type": mime,
    }
    return StreamingResponse(iter_bytes(), status_code=206, headers=headers)

# ----------------- PLAYBACK PROGRESS & WATCHLIST -----------------
@app.get("/api/v1/media/{media_id}/playback-progress")
async def get_progress(media_id: str, request: Request):
    require_auth(request)
    prog = db.get_playback_progress(media_id)
    return {"success": True, "data": prog}

@app.post("/api/v1/media/{media_id}/playback-progress")
async def save_progress(media_id: str, request: Request):
    require_auth(request)
    data = await request.json()
    db.save_playback_progress(
        media_id=media_id,
        position_ms=data.get("positionMs", 0),
        duration_ms=data.get("durationMs", 0),
        completed=data.get("completed", False),
        subtitle_track=data.get("subtitleTrack"),
        audio_track=data.get("audioTrack"),
        playback_speed=data.get("playbackSpeed", 1.0),
    )
    return {"success": True, "data": None}

@app.delete("/api/v1/media/{media_id}/playback-progress")
async def delete_progress(media_id: str, request: Request):
    require_auth(request)
    db.delete_playback_progress(media_id)
    return {"success": True, "data": None}

@app.post("/api/v1/media/{media_id}/watchlist")
async def toggle_watchlist(media_id: str, request: Request):
    require_auth(request)
    is_watch = db.toggle_watchlist(media_id)
    return {"success": True, "data": {"isWatchlisted": is_watch}}

# ----------------- FILE OPS (UPLOAD / DELETE / RENAME) -----------------
@app.post("/api/v1/files/upload")
async def upload_file(
    request: Request,
    folderId: str = Form(...),
    parentId: Optional[str] = Form(None),
    file: UploadFile = File(...)
):
    require_auth(request)
    target_dir: Optional[Path] = None
    if parentId:
        target_dir = decode_path_id(parentId)
    else:
        f_info = db.get_folder_by_id(folderId)
        if f_info:
            target_dir = Path(f_info["path"])

    if not target_dir or not target_dir.exists():
        raise HTTPException(status_code=400, detail="Target upload directory not found")

    safe_filename = Path(file.filename).name
    dest_path = (target_dir / safe_filename).resolve()
    with open(dest_path, "wb") as f_out:
        shutil.copyfileobj(file.file, f_out)

    stat = dest_path.stat()
    mime, _ = mimetypes.guess_type(str(dest_path))
    return {
        "success": True,
        "data": {
            "id": encode_path_id(dest_path),
            "name": dest_path.name,
            "isDirectory": False,
            "mimeType": mime or "application/octet-stream",
            "size": stat.st_size,
            "lastModified": int(stat.st_mtime * 1000),
            "folderId": folderId,
        }
    }

@app.delete("/api/v1/files/{file_id}")
async def delete_file(file_id: str, request: Request):
    require_auth(request)
    file_path = decode_path_id(file_id)
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    if file_path.is_file():
        file_path.unlink()
    elif file_path.is_dir():
        shutil.rmtree(file_path)

    return {"success": True, "data": None}

@app.post("/api/v1/files/{file_id}/rename")
async def rename_file(file_id: str, request: Request):
    require_auth(request)
    data = await request.json()
    new_name = data.get("newName", "").strip()
    safe_name = Path(new_name).name
    if not safe_name:
        raise HTTPException(status_code=400, detail="Valid new name required")

    file_path = decode_path_id(file_id)
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    new_path = file_path.parent / safe_name
    file_path.rename(new_path)

    stat = new_path.stat()
    mime, _ = mimetypes.guess_type(str(new_path))
    return {
        "success": True,
        "data": {
            "id": encode_path_id(new_path),
            "name": new_path.name,
            "isDirectory": new_path.is_dir(),
            "mimeType": mime or "application/octet-stream",
            "size": stat.st_size if not new_path.is_dir() else 0,
            "lastModified": int(stat.st_mtime * 1000),
        }
    }

# ----------------- QR CODE ENDPOINT -----------------
@app.get("/api/v1/qr")
async def get_qr(data: str = Query(...)):
    qr_bytes = generate_qr_bytes(data, size=400)
    return Response(content=qr_bytes, media_type="image/png")

# ----------------- STATIC WEB DASHBOARD SERVING -----------------
if WEB_DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(WEB_DIST_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Check if requested file exists in dist
        req_file = WEB_DIST_DIR / full_path
        if full_path and req_file.exists() and req_file.is_file():
            mime, _ = mimetypes.guess_type(str(req_file))
            return FileResponse(path=str(req_file), media_type=mime)
        # Fallback to index.html for SPA routing
        return FileResponse(path=str(WEB_DIST_DIR / "index.html"), media_type="text/html")
