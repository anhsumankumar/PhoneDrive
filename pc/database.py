import sqlite3
import time
import uuid
import secrets
from pathlib import Path
from typing import List, Dict, Any, Optional
from config import DB_PATH

class Database:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = str(db_path)
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            c = conn.cursor()
            
            # Shared Folders
            c.execute("""
                CREATE TABLE IF NOT EXISTS folders (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    path TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )
            """)

            # Sessions
            c.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    device_id TEXT NOT NULL,
                    device_name TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    last_active INTEGER NOT NULL,
                    is_revoked INTEGER NOT NULL DEFAULT 0
                )
            """)

            # Pairing Tokens
            c.execute("""
                CREATE TABLE IF NOT EXISTS pairing_tokens (
                    token TEXT PRIMARY KEY,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    is_used INTEGER NOT NULL DEFAULT 0
                )
            """)

            # Playback Progress
            c.execute("""
                CREATE TABLE IF NOT EXISTS playback_progress (
                    media_id TEXT PRIMARY KEY,
                    position_ms INTEGER NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 0,
                    subtitle_track TEXT,
                    audio_track TEXT,
                    playback_speed REAL DEFAULT 1.0,
                    updated_at INTEGER NOT NULL
                )
            """)

            # Watchlist
            c.execute("""
                CREATE TABLE IF NOT EXISTS watchlist (
                    media_id TEXT PRIMARY KEY,
                    added_at INTEGER NOT NULL
                )
            """)

            # Settings
            c.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """)

            # Activity Logs
            c.execute("""
                CREATE TABLE IF NOT EXISTS activity_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action TEXT NOT NULL,
                    client_ip TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )
            """)

            conn.commit()

    # ---------------- FOLDERS ----------------
    def get_folders(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            rows = conn.execute("SELECT * FROM folders ORDER BY created_at ASC").fetchall()
            return [dict(r) for r in rows]

    def add_folder(self, name: str, path: str) -> Dict[str, Any]:
        folder_id = str(uuid.uuid4())
        created_at = int(time.time() * 1000)
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO folders (id, name, path, created_at) VALUES (?, ?, ?, ?)",
                (folder_id, name, str(Path(path).resolve()), created_at)
            )
            conn.commit()
        return {"id": folder_id, "name": name, "path": path, "createdAt": created_at, "isAccessible": True}

    def remove_folder(self, folder_id: str) -> bool:
        with self._get_connection() as conn:
            cur = conn.execute("DELETE FROM folders WHERE id = ?", (folder_id,))
            conn.commit()
            return cur.rowcount > 0

    def get_folder_by_id(self, folder_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM folders WHERE id = ?", (folder_id,)).fetchone()
            return dict(row) if row else None

    # ---------------- SESSIONS & PAIRING ----------------
    def create_pairing_token(self, ttl_seconds: int = 120) -> str:
        token = secrets.token_hex(16)
        now = int(time.time() * 1000)
        expires_at = now + (ttl_seconds * 1000)
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO pairing_tokens (token, created_at, expires_at, is_used) VALUES (?, ?, ?, 0)",
                (token, now, expires_at)
            )
            conn.commit()
        return token

    def consume_pairing_token(self, token: str) -> bool:
        now = int(time.time() * 1000)
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM pairing_tokens WHERE token = ?", (token,)).fetchone()
            if not row:
                return False
            if row["is_used"] == 1 or now > row["expires_at"]:
                return False
            conn.execute("UPDATE pairing_tokens SET is_used = 1 WHERE token = ?", (token,))
            conn.commit()
            return True

    def create_session(self, device_id: str, device_name: str) -> str:
        token = secrets.token_urlsafe(32)
        now = int(time.time() * 1000)
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO sessions (token, device_id, device_name, created_at, last_active, is_revoked) VALUES (?, ?, ?, ?, ?, 0)",
                (token, device_id, device_name, now, now)
            )
            conn.commit()
        return token

    def validate_session(self, token: str) -> bool:
        if not token:
            return False
        now = int(time.time() * 1000)
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM sessions WHERE token = ? AND is_revoked = 0", (token,)).fetchone()
            if row:
                conn.execute("UPDATE sessions SET last_active = ? WHERE token = ?", (now, token))
                conn.commit()
                return True
            return False

    def get_sessions(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            rows = conn.execute("SELECT * FROM sessions WHERE is_revoked = 0 ORDER BY last_active DESC").fetchall()
            return [dict(r) for r in rows]

    def revoke_session(self, token: str) -> bool:
        with self._get_connection() as conn:
            cur = conn.execute("UPDATE sessions SET is_revoked = 1 WHERE token = ?", (token,))
            conn.commit()
            return cur.rowcount > 0

    def revoke_all_sessions(self) -> int:
        with self._get_connection() as conn:
            cur = conn.execute("UPDATE sessions SET is_revoked = 1 WHERE is_revoked = 0")
            conn.commit()
            return cur.rowcount

    # ---------------- PASSWORD SECURITY ----------------
    def is_password_set(self) -> bool:
        hash_val = self.get_setting("sec_pwd_hash", "")
        return bool(hash_val.strip())

    def set_password(self, new_password: str):
        salt = secrets.token_bytes(16)
        salt_b64 = secrets.token_hex(16)
        # PBKDF2-HMAC-SHA256 with 20,000 iterations
        import hashlib, base64
        derived = hashlib.pbkdf2_hmac("sha256", new_password.encode("utf-8"), salt, 20000)
        hash_b64 = base64.b64encode(derived).decode("utf-8")
        salt_b64 = base64.b64encode(salt).decode("utf-8")

        self.set_setting("sec_pwd_salt", salt_b64)
        self.set_setting("sec_pwd_hash", hash_b64)

    def verify_password(self, password: str) -> bool:
        salt_b64 = self.get_setting("sec_pwd_salt", "")
        hash_b64 = self.get_setting("sec_pwd_hash", "")
        if not salt_b64 or not hash_b64:
            return True  # No password set

        import hashlib, base64
        try:
            salt = base64.b64decode(salt_b64.encode("utf-8"))
            expected = base64.b64decode(hash_b64.encode("utf-8"))
            derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 20000)
            return secrets.compare_digest(derived, expected)
        except Exception:
            return False

    def remove_password(self):
        with self._get_connection() as conn:
            conn.execute("DELETE FROM settings WHERE key IN ('sec_pwd_hash', 'sec_pwd_salt', 'password', 'require_password')")
            conn.commit()

    # ---------------- SETTINGS ----------------
    def get_setting(self, key: str, default: str = "") -> str:
        with self._get_connection() as conn:
            row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
            return row["value"] if row else default

    def set_setting(self, key: str, value: str):
        with self._get_connection() as conn:
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
            conn.commit()

    # ---------------- PLAYBACK PROGRESS & WATCHLIST ----------------
    def get_playback_progress(self, media_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM playback_progress WHERE media_id = ?", (media_id,)).fetchone()
            if row:
                return {
                    "mediaId": row["media_id"],
                    "positionMs": row["position_ms"],
                    "durationMs": row["duration_ms"],
                    "completed": bool(row["completed"]),
                    "subtitleTrack": row["subtitle_track"],
                    "audioTrack": row["audio_track"],
                    "playbackSpeed": row["playback_speed"],
                    "updatedAt": row["updated_at"],
                }
            return None

    def get_all_playback_progress(self) -> Dict[str, Dict[str, Any]]:
        with self._get_connection() as conn:
            rows = conn.execute("SELECT * FROM playback_progress ORDER BY updated_at DESC").fetchall()
            res = {}
            for row in rows:
                res[row["media_id"]] = {
                    "mediaId": row["media_id"],
                    "positionMs": row["position_ms"],
                    "durationMs": row["duration_ms"],
                    "completed": bool(row["completed"]),
                    "subtitleTrack": row["subtitle_track"],
                    "audioTrack": row["audio_track"],
                    "playbackSpeed": row["playback_speed"],
                    "updatedAt": row["updated_at"],
                }
            return res

    def save_playback_progress(self, media_id: str, position_ms: int, duration_ms: int,
                               completed: bool = False, subtitle_track: Optional[str] = None,
                               audio_track: Optional[str] = None, playback_speed: float = 1.0):
        now = int(time.time() * 1000)
        with self._get_connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO playback_progress
                (media_id, position_ms, duration_ms, completed, subtitle_track, audio_track, playback_speed, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (media_id, position_ms, duration_ms, 1 if completed else 0, subtitle_track, audio_track, playback_speed, now))
            conn.commit()

    def delete_playback_progress(self, media_id: str):
        with self._get_connection() as conn:
            conn.execute("DELETE FROM playback_progress WHERE media_id = ?", (media_id,))
            conn.commit()

    def is_watchlisted(self, media_id: str) -> bool:
        with self._get_connection() as conn:
            row = conn.execute("SELECT 1 FROM watchlist WHERE media_id = ?", (media_id,)).fetchone()
            return row is not None

    def toggle_watchlist(self, media_id: str) -> bool:
        with self._get_connection() as conn:
            row = conn.execute("SELECT 1 FROM watchlist WHERE media_id = ?", (media_id,)).fetchone()
            if row:
                conn.execute("DELETE FROM watchlist WHERE media_id = ?", (media_id,))
                conn.commit()
                return False
            else:
                now = int(time.time() * 1000)
                conn.execute("INSERT INTO watchlist (media_id, added_at) VALUES (?, ?)", (media_id, now))
                conn.commit()
                return True

    def get_watchlist(self) -> List[str]:
        with self._get_connection() as conn:
            rows = conn.execute("SELECT media_id FROM watchlist ORDER BY added_at DESC").fetchall()
            return [r["media_id"] for r in rows]

    def log_activity(self, action: str, client_ip: str, status: str):
        now = int(time.time() * 1000)
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO activity_logs (action, client_ip, status, created_at) VALUES (?, ?, ?, ?)",
                (action, client_ip, status, now)
            )
            conn.commit()

    def get_recent_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
            return [dict(r) for r in rows]
