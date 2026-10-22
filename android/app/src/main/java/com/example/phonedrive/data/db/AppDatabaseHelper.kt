package com.example.phonedrive.data.db

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.example.phonedrive.data.model.FolderItem
import com.example.phonedrive.data.model.PairingToken
import com.example.phonedrive.data.model.SessionInfo
import com.example.phonedrive.data.model.PlaybackProgress
import com.example.phonedrive.data.model.CachedMediaMeta
import java.util.UUID

class AppDatabaseHelper(context: Context) : SQLiteOpenHelper(
    context, DATABASE_NAME, null, DATABASE_VERSION
) {
    companion object {
        const val DATABASE_NAME = "phonedrive.db"
        const val DATABASE_VERSION = 2

        @Volatile
        private var INSTANCE: AppDatabaseHelper? = null

        fun getInstance(context: Context): AppDatabaseHelper {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: AppDatabaseHelper(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                uri TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
            """.trimIndent()
        )

        db.execSQL(
            """
            CREATE TABLE sessions (
                token TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                device_name TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_active INTEGER NOT NULL,
                is_revoked INTEGER NOT NULL DEFAULT 0
            )
            """.trimIndent()
        )

        db.execSQL(
            """
            CREATE TABLE pairing_tokens (
                token TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                is_used INTEGER NOT NULL DEFAULT 0
            )
            """.trimIndent()
        )

        db.execSQL(
            """
            CREATE TABLE activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                action TEXT NOT NULL,
                client_ip TEXT NOT NULL,
                status TEXT NOT NULL
            )
            """.trimIndent()
        )

        db.execSQL(
            """
            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """.trimIndent()
        )

        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS playback_progress (
                media_id TEXT PRIMARY KEY,
                folder_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                position_ms INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                subtitle_track TEXT,
                audio_track TEXT,
                playback_speed REAL NOT NULL DEFAULT 1.0,
                last_watched INTEGER NOT NULL
            )
            """.trimIndent()
        )

        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS media_metadata_cache (
                media_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                duration_ms INTEGER NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                resolution TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                audio_tracks_count INTEGER NOT NULL DEFAULT 1,
                has_subtitles INTEGER NOT NULL DEFAULT 0,
                is_series INTEGER NOT NULL DEFAULT 0,
                season INTEGER,
                episode INTEGER,
                last_modified INTEGER NOT NULL
            )
            """.trimIndent()
        )

        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS watchlist (
                media_id TEXT PRIMARY KEY,
                added_at INTEGER NOT NULL
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS playback_progress (
                    media_id TEXT PRIMARY KEY,
                    folder_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    position_ms INTEGER NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 0,
                    subtitle_track TEXT,
                    audio_track TEXT,
                    playback_speed REAL NOT NULL DEFAULT 1.0,
                    last_watched INTEGER NOT NULL
                )
                """.trimIndent()
            )

            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS media_metadata_cache (
                    media_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    width INTEGER NOT NULL,
                    height INTEGER NOT NULL,
                    resolution TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    audio_tracks_count INTEGER NOT NULL DEFAULT 1,
                    has_subtitles INTEGER NOT NULL DEFAULT 0,
                    is_series INTEGER NOT NULL DEFAULT 0,
                    season INTEGER,
                    episode INTEGER,
                    last_modified INTEGER NOT NULL
                )
                """.trimIndent()
            )

            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS watchlist (
                    media_id TEXT PRIMARY KEY,
                    added_at INTEGER NOT NULL
                )
                """.trimIndent()
            )
        }
    }

    // Folders
    @Synchronized
    fun getAllFolders(): List<FolderItem> {
        val list = mutableListOf<FolderItem>()
        val db = readableDatabase
        val cursor = db.query(
            "folders", null, null, null, null, null, "created_at DESC"
        )
        cursor.use {
            val idCol = it.getColumnIndexOrThrow("id")
            val nameCol = it.getColumnIndexOrThrow("name")
            val uriCol = it.getColumnIndexOrThrow("uri")
            val createdCol = it.getColumnIndexOrThrow("created_at")

            while (it.moveToNext()) {
                list.add(
                    FolderItem(
                        id = it.getString(idCol),
                        name = it.getString(nameCol),
                        uriString = it.getString(uriCol),
                        createdAt = it.getLong(createdCol)
                    )
                )
            }
        }
        return list
    }

    @Synchronized
    fun getFolderById(id: String): FolderItem? {
        val db = readableDatabase
        val cursor = db.query(
            "folders", null, "id = ?", arrayOf(id), null, null, null
        )
        cursor.use {
            if (it.moveToFirst()) {
                return FolderItem(
                    id = it.getString(it.getColumnIndexOrThrow("id")),
                    name = it.getString(it.getColumnIndexOrThrow("name")),
                    uriString = it.getString(it.getColumnIndexOrThrow("uri")),
                    createdAt = it.getLong(it.getColumnIndexOrThrow("created_at"))
                )
            }
        }
        return null
    }

    @Synchronized
    fun insertFolder(folder: FolderItem) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("id", folder.id)
            put("name", folder.name)
            put("uri", folder.uriString)
            put("created_at", folder.createdAt)
        }
        db.insertWithOnConflict("folders", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    @Synchronized
    fun deleteFolder(id: String): Boolean {
        val db = writableDatabase
        return db.delete("folders", "id = ?", arrayOf(id)) > 0
    }

    // Sessions
    @Synchronized
    fun insertSession(session: SessionInfo) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("token", session.token)
            put("device_id", session.deviceId)
            put("device_name", session.deviceName)
            put("created_at", session.createdAt)
            put("last_active", session.lastActive)
            put("is_revoked", if (session.isRevoked) 1 else 0)
        }
        db.insertWithOnConflict("sessions", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    @Synchronized
    fun getValidSession(token: String): SessionInfo? {
        val db = readableDatabase
        val cursor = db.query(
            "sessions", null, "token = ? AND is_revoked = 0", arrayOf(token), null, null, null
        )
        cursor.use {
            if (it.moveToFirst()) {
                return SessionInfo(
                    token = it.getString(it.getColumnIndexOrThrow("token")),
                    deviceId = it.getString(it.getColumnIndexOrThrow("device_id")),
                    deviceName = it.getString(it.getColumnIndexOrThrow("device_name")),
                    createdAt = it.getLong(it.getColumnIndexOrThrow("created_at")),
                    lastActive = it.getLong(it.getColumnIndexOrThrow("last_active")),
                    isRevoked = it.getInt(it.getColumnIndexOrThrow("is_revoked")) == 1
                )
            }
        }
        return null
    }

    @Synchronized
    fun updateSessionActivity(token: String) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("last_active", System.currentTimeMillis())
        }
        db.update("sessions", values, "token = ?", arrayOf(token))
    }

    @Synchronized
    fun revokeSession(token: String) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("is_revoked", 1)
        }
        db.update("sessions", values, "token = ?", arrayOf(token))
    }

    @Synchronized
    fun revokeAllSessions() {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("is_revoked", 1)
        }
        db.update("sessions", values, null, null)
    }

    @Synchronized
    fun getAllActiveSessions(): List<SessionInfo> {
        val list = mutableListOf<SessionInfo>()
        val db = readableDatabase
        val cursor = db.query(
            "sessions", null, "is_revoked = 0", null, null, null, "last_active DESC"
        )
        cursor.use {
            val tokenCol = it.getColumnIndexOrThrow("token")
            val idCol = it.getColumnIndexOrThrow("device_id")
            val nameCol = it.getColumnIndexOrThrow("device_name")
            val createdCol = it.getColumnIndexOrThrow("created_at")
            val lastActiveCol = it.getColumnIndexOrThrow("last_active")

            while (it.moveToNext()) {
                list.add(
                    SessionInfo(
                        token = it.getString(tokenCol),
                        deviceId = it.getString(idCol),
                        deviceName = it.getString(nameCol),
                        createdAt = it.getLong(createdCol),
                        lastActive = it.getLong(lastActiveCol),
                        isRevoked = false
                    )
                )
            }
        }
        return list
    }

    // Pairing Tokens
    @Synchronized
    fun createPairingToken(): PairingToken {
        val token = UUID.randomUUID().toString().replace("-", "")
        val pairing = PairingToken(token = token)
        val db = writableDatabase
        val values = ContentValues().apply {
            put("token", pairing.token)
            put("created_at", pairing.createdAt)
            put("expires_at", pairing.expiresAt)
            put("is_used", 0)
        }
        db.insert("pairing_tokens", null, values)
        return pairing
    }

    @Synchronized
    fun consumePairingToken(token: String): Boolean {
        val db = writableDatabase
        val now = System.currentTimeMillis()
        val cursor = db.query(
            "pairing_tokens", null,
            "token = ? AND is_used = 0 AND expires_at > ?",
            arrayOf(token, now.toString()),
            null, null, null
        )
        val valid = cursor.use { it.moveToFirst() }
        if (valid) {
            val values = ContentValues().apply {
                put("is_used", 1)
            }
            db.update("pairing_tokens", values, "token = ?", arrayOf(token))
            return true
        }
        return false
    }

    // Activity Logs
    @Synchronized
    fun logActivity(action: String, clientIp: String, status: String) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("timestamp", System.currentTimeMillis())
            put("action", action)
            put("client_ip", clientIp)
            put("status", status)
        }
        db.insert("activity_logs", null, values)

        // Keep last 200 logs
        db.execSQL("DELETE FROM activity_logs WHERE id NOT IN (SELECT id FROM activity_logs ORDER BY id DESC LIMIT 200)")
    }

    @Synchronized
    fun getRecentLogs(limit: Int = 30): List<Triple<Long, String, String>> {
        val list = mutableListOf<Triple<Long, String, String>>()
        val db = readableDatabase
        val cursor = db.query(
            "activity_logs", null, null, null, null, null, "id DESC", limit.toString()
        )
        cursor.use {
            val timeCol = it.getColumnIndexOrThrow("timestamp")
            val actionCol = it.getColumnIndexOrThrow("action")
            val statusCol = it.getColumnIndexOrThrow("status")
            while (it.moveToNext()) {
                list.add(
                    Triple(it.getLong(timeCol), it.getString(actionCol), it.getString(statusCol))
                )
            }
        }
        return list
    }

    // Settings
    @Synchronized
    fun getSetting(key: String, defaultValue: String): String {
        val db = readableDatabase
        val cursor = db.query(
            "settings", arrayOf("value"), "key = ?", arrayOf(key), null, null, null
        )
        cursor.use {
            if (it.moveToFirst()) {
                return it.getString(0)
            }
        }
        return defaultValue
    }

    @Synchronized
    fun setSetting(key: String, value: String) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("key", key)
            put("value", value)
        }
        db.insertWithOnConflict("settings", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    // Playback Progress
    @Synchronized
    fun savePlaybackProgress(progress: PlaybackProgress) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("media_id", progress.mediaId)
            put("folder_id", progress.folderId)
            put("filename", progress.filename)
            put("position_ms", progress.positionMs)
            put("duration_ms", progress.durationMs)
            put("completed", if (progress.completed) 1 else 0)
            put("subtitle_track", progress.subtitleTrack)
            put("audio_track", progress.audioTrack)
            put("playback_speed", progress.playbackSpeed)
            put("last_watched", progress.lastWatched)
        }
        db.insertWithOnConflict("playback_progress", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    @Synchronized
    fun getPlaybackProgress(mediaId: String): PlaybackProgress? {
        val db = readableDatabase
        val cursor = db.query(
            "playback_progress", null, "media_id = ?", arrayOf(mediaId), null, null, null
        )
        cursor.use {
            if (it.moveToFirst()) {
                return PlaybackProgress(
                    mediaId = it.getString(it.getColumnIndexOrThrow("media_id")),
                    folderId = it.getString(it.getColumnIndexOrThrow("folder_id")),
                    filename = it.getString(it.getColumnIndexOrThrow("filename")),
                    positionMs = it.getLong(it.getColumnIndexOrThrow("position_ms")),
                    durationMs = it.getLong(it.getColumnIndexOrThrow("duration_ms")),
                    completed = it.getInt(it.getColumnIndexOrThrow("completed")) == 1,
                    subtitleTrack = it.getString(it.getColumnIndexOrThrow("subtitle_track")),
                    audioTrack = it.getString(it.getColumnIndexOrThrow("audio_track")),
                    playbackSpeed = it.getFloat(it.getColumnIndexOrThrow("playback_speed")),
                    lastWatched = it.getLong(it.getColumnIndexOrThrow("last_watched"))
                )
            }
        }
        return null
    }

    @Synchronized
    fun getAllPlaybackProgress(): List<PlaybackProgress> {
        val list = mutableListOf<PlaybackProgress>()
        val db = readableDatabase
        val cursor = db.query(
            "playback_progress", null, null, null, null, null, "last_watched DESC"
        )
        cursor.use {
            val mediaIdCol = it.getColumnIndexOrThrow("media_id")
            val folderIdCol = it.getColumnIndexOrThrow("folder_id")
            val filenameCol = it.getColumnIndexOrThrow("filename")
            val posCol = it.getColumnIndexOrThrow("position_ms")
            val durCol = it.getColumnIndexOrThrow("duration_ms")
            val compCol = it.getColumnIndexOrThrow("completed")
            val subCol = it.getColumnIndexOrThrow("subtitle_track")
            val audCol = it.getColumnIndexOrThrow("audio_track")
            val spdCol = it.getColumnIndexOrThrow("playback_speed")
            val lastCol = it.getColumnIndexOrThrow("last_watched")

            while (it.moveToNext()) {
                list.add(
                    PlaybackProgress(
                        mediaId = it.getString(mediaIdCol),
                        folderId = it.getString(folderIdCol),
                        filename = it.getString(filenameCol),
                        positionMs = it.getLong(posCol),
                        durationMs = it.getLong(durCol),
                        completed = it.getInt(compCol) == 1,
                        subtitleTrack = it.getString(subCol),
                        audioTrack = it.getString(audCol),
                        playbackSpeed = it.getFloat(spdCol),
                        lastWatched = it.getLong(lastCol)
                    )
                )
            }
        }
        return list
    }

    @Synchronized
    fun deletePlaybackProgress(mediaId: String): Boolean {
        val db = writableDatabase
        return db.delete("playback_progress", "media_id = ?", arrayOf(mediaId)) > 0
    }

    // Watchlist
    @Synchronized
    fun toggleWatchlist(mediaId: String): Boolean {
        val db = writableDatabase
        val exists = isWatchlisted(mediaId)
        return if (exists) {
            db.delete("watchlist", "media_id = ?", arrayOf(mediaId))
            false
        } else {
            val values = ContentValues().apply {
                put("media_id", mediaId)
                put("added_at", System.currentTimeMillis())
            }
            db.insert("watchlist", null, values)
            true
        }
    }

    @Synchronized
    fun isWatchlisted(mediaId: String): Boolean {
        val db = readableDatabase
        val cursor = db.query(
            "watchlist", arrayOf("media_id"), "media_id = ?", arrayOf(mediaId), null, null, null
        )
        cursor.use {
            return it.moveToFirst()
        }
    }

    @Synchronized
    fun getAllWatchlistIds(): Set<String> {
        val set = mutableSetOf<String>()
        val db = readableDatabase
        val cursor = db.query("watchlist", arrayOf("media_id"), null, null, null, null, null)
        cursor.use {
            while (it.moveToNext()) {
                set.add(it.getString(0))
            }
        }
        return set
    }

    // Media Metadata Cache
    @Synchronized
    fun getCachedMediaMetadata(mediaId: String): CachedMediaMeta? {
        val db = readableDatabase
        val cursor = db.query(
            "media_metadata_cache", null, "media_id = ?", arrayOf(mediaId), null, null, null
        )
        cursor.use {
            if (it.moveToFirst()) {
                return CachedMediaMeta(
                    mediaId = it.getString(it.getColumnIndexOrThrow("media_id")),
                    title = it.getString(it.getColumnIndexOrThrow("title")),
                    durationMs = it.getLong(it.getColumnIndexOrThrow("duration_ms")),
                    width = it.getInt(it.getColumnIndexOrThrow("width")),
                    height = it.getInt(it.getColumnIndexOrThrow("height")),
                    resolution = it.getString(it.getColumnIndexOrThrow("resolution")),
                    mimeType = it.getString(it.getColumnIndexOrThrow("mime_type")),
                    audioTracksCount = it.getInt(it.getColumnIndexOrThrow("audio_tracks_count")),
                    hasSubtitles = it.getInt(it.getColumnIndexOrThrow("has_subtitles")) == 1,
                    isSeries = it.getInt(it.getColumnIndexOrThrow("is_series")) == 1,
                    season = if (it.isNull(it.getColumnIndexOrThrow("season"))) null else it.getInt(it.getColumnIndexOrThrow("season")),
                    episode = if (it.isNull(it.getColumnIndexOrThrow("episode"))) null else it.getInt(it.getColumnIndexOrThrow("episode")),
                    lastModified = it.getLong(it.getColumnIndexOrThrow("last_modified"))
                )
            }
        }
        return null
    }

    @Synchronized
    fun cacheMediaMetadata(meta: CachedMediaMeta) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("media_id", meta.mediaId)
            put("title", meta.title)
            put("duration_ms", meta.durationMs)
            put("width", meta.width)
            put("height", meta.height)
            put("resolution", meta.resolution)
            put("mime_type", meta.mimeType)
            put("audio_tracks_count", meta.audioTracksCount)
            put("has_subtitles", if (meta.hasSubtitles) 1 else 0)
            put("is_series", if (meta.isSeries) 1 else 0)
            if (meta.season != null) put("season", meta.season) else putNull("season")
            if (meta.episode != null) put("episode", meta.episode) else putNull("episode")
            put("last_modified", meta.lastModified)
        }
        db.insertWithOnConflict("media_metadata_cache", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }
}
