package com.example.phonedrive.server

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.StatFs
import com.example.phonedrive.data.db.AppDatabaseHelper
import com.example.phonedrive.data.media.MediaManager
import com.example.phonedrive.data.model.MediaItem
import com.example.phonedrive.data.model.MediaTrack
import com.example.phonedrive.data.model.PlaybackProgress
import com.example.phonedrive.data.model.SessionInfo
import com.example.phonedrive.data.security.SecurityManager
import com.example.phonedrive.data.storage.StorageRepository
import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.net.URLDecoder
import java.util.HashMap

class PhoneDriveServer(
    private val context: Context,
    port: Int = 8080
) : NanoHTTPD(port) {

    private val dbHelper = AppDatabaseHelper.getInstance(context)
    private val securityManager = SecurityManager.getInstance(context)
    private val storageRepository = StorageRepository.getInstance(context)
    private val mediaManager = MediaManager.getInstance(context)
    private val webAssetHandler = WebAssetHandler(context)
    private val thumbnailManager = ThumbnailManager(context)
    private val mediaTranscoder = MediaTranscoder.getInstance(context)
    private val startTime = System.currentTimeMillis()

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri
        val method = session.method
        val clientIp = session.headers["remote-addr"] ?: "unknown"

        // Handle CORS preflight
        if (method == Method.OPTIONS) {
            val response = newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, "")
            addCorsHeaders(response)
            return response
        }

        val response = try {
            when {
                // API Routes
                uri.startsWith("/api/v1/") -> handleApi(session, uri, method, clientIp)

                // Static Web Assets
                else -> {
                    val assetResponse = webAssetHandler.serveAsset(uri)
                    assetResponse ?: newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "404 Not Found")
                }
            }
        } catch (e: Exception) {
            errorResponse(Response.Status.INTERNAL_ERROR, "Server Error: ${e.message}")
        }

        addCorsHeaders(response)
        return response
    }

    private fun handleApi(session: IHTTPSession, uri: String, method: Method, clientIp: String): Response {
        return when {
            uri == "/api/v1/health" && method == Method.GET -> {
                val json = JSONObject().apply {
                    put("status", "ok")
                    put("server", "PhoneDrive")
                    put("uptime", (System.currentTimeMillis() - startTime) / 1000)
                }
                jsonResponse(Response.Status.OK, json)
            }

            uri == "/api/v1/auth/login" && method == Method.POST -> {
                handleLogin(session, clientIp)
            }

            uri == "/api/v1/pairing/complete" && method == Method.POST -> {
                handlePairingComplete(session, clientIp)
            }

            // Authenticated endpoints below
            else -> {
                val token = extractToken(session)
                if (token.isNullOrEmpty() || dbHelper.getValidSession(token) == null) {
                    return errorResponse(Response.Status.UNAUTHORIZED, "Unauthorized: Invalid or expired session")
                }
                dbHelper.updateSessionActivity(token)

                when {
                    uri == "/api/v1/auth/logout" && method == Method.POST -> {
                        dbHelper.revokeSession(token)
                        jsonResponse(Response.Status.OK, JSONObject().put("success", true))
                    }

                    uri == "/api/v1/session" && method == Method.GET -> {
                        val sessionInfo = dbHelper.getValidSession(token)
                        jsonResponse(Response.Status.OK, JSONObject().apply {
                            put("authenticated", true)
                            put("deviceId", sessionInfo?.deviceId)
                            put("deviceName", sessionInfo?.deviceName)
                        })
                    }

                    uri == "/api/v1/storage/status" && method == Method.GET -> {
                        handleStorageStatus()
                    }

                    uri == "/api/v1/folders" && method == Method.GET -> {
                        handleListFolders()
                    }

                    uri == "/api/v1/files" && method == Method.GET -> {
                        handleListFiles(session)
                    }

                    uri.startsWith("/api/v1/files/") && uri.endsWith("/content") && method == Method.GET -> {
                        handleFileContent(session, uri)
                    }

                    uri.startsWith("/api/v1/files/") && uri.endsWith("/thumbnail") && method == Method.GET -> {
                        handleFileThumbnail(uri)
                    }

                    uri == "/api/v1/files/upload" && method == Method.POST -> {
                        handleFileUpload(session)
                    }

                    uri.startsWith("/api/v1/files/") && uri.endsWith("/rename") && method == Method.POST -> {
                        handleFileRename(session, uri)
                    }

                    uri.startsWith("/api/v1/files/") && method == Method.DELETE -> {
                        handleFileDelete(uri)
                    }

                    // Media & Cinema Streaming Endpoints
                    uri == "/api/v1/media" && method == Method.GET -> {
                        handleMediaLibrary(session)
                    }

                    uri.startsWith("/api/v1/media/") && uri.endsWith("/stream") && method == Method.GET -> {
                        handleMediaStream(session, uri)
                    }

                    uri.startsWith("/api/v1/media/") && uri.endsWith("/transcode-status") && method == Method.GET -> {
                        handleTranscodeStatus(session, uri)
                    }

                    uri.startsWith("/api/v1/media/") && uri.endsWith("/transcode") && method == Method.POST -> {
                        handleTriggerTranscode(session, uri)
                    }

                    uri.startsWith("/api/v1/media/") && uri.endsWith("/thumbnail") && method == Method.GET -> {
                        handleMediaThumbnail(uri)
                    }

                    uri.startsWith("/api/v1/media/") && uri.endsWith("/tracks") && method == Method.GET -> {
                        handleMediaTracks(uri)
                    }

                    uri.startsWith("/api/v1/media/") && uri.contains("/subtitles/") && method == Method.GET -> {
                        handleMediaSubtitles(uri)
                    }

                    uri.startsWith("/api/v1/media/") && uri.endsWith("/playback-progress") && method == Method.GET -> {
                        handleGetPlaybackProgress(uri)
                    }

                    uri.startsWith("/api/v1/media/") && uri.endsWith("/playback-progress") && method == Method.POST -> {
                        handleSavePlaybackProgress(session, uri)
                    }

                    uri.startsWith("/api/v1/media/") && uri.endsWith("/playback-progress") && method == Method.DELETE -> {
                        handleDeletePlaybackProgress(uri)
                    }

                    uri.startsWith("/api/v1/media/") && uri.endsWith("/watchlist") && method == Method.POST -> {
                        handleToggleWatchlist(uri)
                    }

                    uri.startsWith("/api/v1/media/") && method == Method.GET -> {
                        handleMediaDetails(uri)
                    }

                    else -> errorResponse(Response.Status.NOT_FOUND, "Endpoint not found")
                }
            }
        }
    }

    private fun handleLogin(session: IHTTPSession, clientIp: String): Response {
        val body = parseJsonBody(session)
        val password = body.optString("password", "")

        val authResult = securityManager.verifyPassword(password, clientIp)
        return when (authResult) {
            is SecurityManager.AuthResult.Success -> {
                val token = securityManager.generateSessionToken()
                val sessionInfo = SessionInfo(
                    token = token,
                    deviceId = session.headers["user-agent"] ?: "Browser Client",
                    deviceName = session.headers["user-agent"] ?: "Web Browser"
                )
                dbHelper.insertSession(sessionInfo)
                dbHelper.logActivity("Login", clientIp, "SUCCESS")

                val res = JSONObject().apply {
                    put("token", token)
                    put("deviceId", sessionInfo.deviceId)
                }
                jsonResponse(Response.Status.OK, res)
            }

            is SecurityManager.AuthResult.InvalidPassword -> {
                dbHelper.logActivity("Login", clientIp, "FAILED")
                errorResponse(
                    Response.Status.UNAUTHORIZED,
                    "Invalid password. ${authResult.remainingAttempts} attempts remaining before temporary lockout."
                )
            }

            is SecurityManager.AuthResult.LockedOut -> {
                dbHelper.logActivity("Login", clientIp, "LOCKED_OUT")
                errorResponse(
                    Response.Status.FORBIDDEN,
                    "Too many failed attempts. Try again in ${authResult.retryAfterSeconds} seconds."
                )
            }

            is SecurityManager.AuthResult.NoPasswordConfigured -> {
                errorResponse(Response.Status.BAD_REQUEST, "Master password not configured on phone yet.")
            }
        }
    }

    private fun handlePairingComplete(session: IHTTPSession, clientIp: String): Response {
        val body = parseJsonBody(session)
        val pairToken = body.optString("pairToken", "")
        val deviceName = body.optString("deviceName", session.headers["user-agent"] ?: "Paired Device")

        if (pairToken.isEmpty() || !dbHelper.consumePairingToken(pairToken)) {
            return errorResponse(Response.Status.FORBIDDEN, "Invalid or expired pairing token")
        }

        val sessionToken = securityManager.generateSessionToken()
        val sessionInfo = SessionInfo(
            token = sessionToken,
            deviceId = deviceName,
            deviceName = deviceName
        )
        dbHelper.insertSession(sessionInfo)
        dbHelper.logActivity("QR Pairing", clientIp, "SUCCESS")

        val res = JSONObject().apply {
            put("token", sessionToken)
            put("deviceId", sessionInfo.deviceId)
        }
        return jsonResponse(Response.Status.OK, res)
    }

    private fun handleStorageStatus(): Response {
        val stat = StatFs(Environment.getDataDirectory().path)
        val totalBytes = stat.totalBytes
        val freeBytes = stat.availableBytes
        val folders = storageRepository.getAuthorizedFolders()

        val json = JSONObject().apply {
            put("serverName", "PhoneDrive")
            put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
            put("androidVersion", "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            put("totalFolders", folders.size)
            put("totalFiles", 0)
            put("totalBytes", totalBytes - freeBytes)
            put("freeSpaceBytes", freeBytes)
            put("totalSpaceBytes", totalBytes)
            put("version", "1.0.0")
            put("uptimeSeconds", (System.currentTimeMillis() - startTime) / 1000)
        }
        return jsonResponse(Response.Status.OK, json)
    }

    private fun handleListFolders(): Response {
        val folders = storageRepository.getAuthorizedFolders()
        val arr = JSONArray()
        for (f in folders) {
            arr.put(JSONObject().apply {
                put("id", f.id)
                put("name", f.name)
                put("uri", f.uriString)
                put("createdAt", f.createdAt)
                put("isAccessible", f.isAccessible)
            })
        }
        return jsonResponse(Response.Status.OK, arr)
    }

    private fun handleListFiles(session: IHTTPSession): Response {
        val params = session.parameters
        val folderId = params["folderId"]?.firstOrNull()
        val parentId = params["parentId"]?.firstOrNull()
        val category = params["category"]?.firstOrNull()
        val search = params["search"]?.firstOrNull()

        val fileEntries = storageRepository.listFiles(folderId, parentId, category, search)
        val filesArr = JSONArray()

        for (file in fileEntries) {
            filesArr.put(JSONObject().apply {
                put("id", file.id)
                put("name", file.name)
                put("isDirectory", file.isDirectory)
                put("mimeType", file.mimeType)
                put("size", file.size)
                put("lastModified", file.lastModified)
                put("parentId", file.parentId)
                put("folderId", file.folderId)
            })
        }

        // Build dynamic breadcrumbs
        val breadcrumbsArr = JSONArray()
        breadcrumbsArr.put(JSONObject().apply {
            put("id", "")
            put("name", "All Files")
        })

        if (!category.isNullOrEmpty() && category != "all") {
            breadcrumbsArr.put(JSONObject().apply {
                put("id", "cat_$category")
                put("name", category.replaceFirstChar { it.uppercase() })
            })
        } else {
            val effectiveFId = if (!folderId.isNullOrEmpty()) {
                folderId
            } else if (!parentId.isNullOrEmpty() && parentId.startsWith("folder_")) {
                parentId.removePrefix("folder_")
            } else {
                null
            }

            if (!effectiveFId.isNullOrEmpty()) {
                val folder = storageRepository.getAuthorizedFolders().find { it.id == effectiveFId }
                if (folder != null) {
                    breadcrumbsArr.put(JSONObject().apply {
                        put("id", "folder_${folder.id}")
                        put("name", folder.name)
                    })
                }
            }
            if (!parentId.isNullOrEmpty() && !parentId.startsWith("folder_")) {
                val parentDoc = storageRepository.resolveFile(parentId)
                if (parentDoc != null) {
                    breadcrumbsArr.put(JSONObject().apply {
                        put("id", parentDoc.id)
                        put("name", parentDoc.name)
                    })
                }
            }
        }

        val json = JSONObject().apply {
            put("files", filesArr)
            put("breadcrumbs", breadcrumbsArr)
        }
        return jsonResponse(Response.Status.OK, json)
    }

    private fun handleFileContent(session: IHTTPSession, uri: String): Response {
        // format: /api/v1/files/{id}/content
        val parts = uri.split("/")
        if (parts.size < 5) return errorResponse(Response.Status.BAD_REQUEST, "Invalid file URL")
        val fileId = URLDecoder.decode(parts[4], "UTF-8")

        val file = storageRepository.resolveFile(fileId) ?: return errorResponse(Response.Status.NOT_FOUND, "File not found")
        val stream = storageRepository.openInputStream(file) ?: return errorResponse(Response.Status.INTERNAL_ERROR, "Cannot open file stream")

        val rangeHeader = session.headers["range"]
        val downloadParam = session.parameters["download"]?.firstOrNull() == "true"

        val response = HttpRangeHandler.buildStreamingResponse(
            inputStream = stream,
            totalLength = file.size,
            mimeType = file.mimeType,
            rangeHeader = rangeHeader
        )

        if (downloadParam) {
            response.addHeader("Content-Disposition", "attachment; filename=\"${file.name}\"")
        }
        return response
    }

    private fun handleFileThumbnail(uri: String): Response {
        val parts = uri.split("/")
        if (parts.size < 5) return errorResponse(Response.Status.BAD_REQUEST, "Invalid file URL")
        val fileId = URLDecoder.decode(parts[4], "UTF-8")

        val file = storageRepository.resolveFile(fileId) ?: return errorResponse(Response.Status.NOT_FOUND, "File not found")

        // 1. Try high-performance downsampled cached thumbnail (15KB - 30KB)
        val thumbBytes = thumbnailManager.getThumbnail(file)
        if (thumbBytes != null) {
            val response = newFixedLengthResponse(
                Response.Status.OK,
                "image/jpeg",
                ByteArrayInputStream(thumbBytes),
                thumbBytes.size.toLong()
            )
            response.addHeader("Cache-Control", "public, max-age=604800, immutable")
            response.addHeader("Content-Length", thumbBytes.size.toString())
            return response
        }

        // 2. Fallback to raw stream if thumbnail cannot be generated
        val stream = storageRepository.openInputStream(file) ?: return errorResponse(Response.Status.NOT_FOUND, "Cannot open file stream")
        val response = newChunkedResponse(Response.Status.OK, file.mimeType, stream)
        response.addHeader("Cache-Control", "public, max-age=86400")
        return response
    }

    private fun handleFileUpload(session: IHTTPSession): Response {
        val files = HashMap<String, String>()
        session.parseBody(files)

        val params = session.parameters
        val folderId = params["folderId"]?.firstOrNull() ?: return errorResponse(Response.Status.BAD_REQUEST, "Missing folderId")
        val parentId = params["parentId"]?.firstOrNull()

        val tempFilePath = files["file"] ?: return errorResponse(Response.Status.BAD_REQUEST, "No file uploaded")
        val fileName = params["file"]?.firstOrNull() ?: "uploaded_${System.currentTimeMillis()}"

        val tempFile = File(tempFilePath)
        if (!tempFile.exists()) return errorResponse(Response.Status.BAD_REQUEST, "Uploaded file corrupted")

        val mimeType = session.headers["content-type"] ?: "application/octet-stream"
        val target = storageRepository.createUploadTarget(folderId, parentId, fileName, mimeType)
            ?: return errorResponse(Response.Status.INTERNAL_ERROR, "Could not create target file on phone")

        val (entry, outStream) = target
        try {
            FileInputStream(tempFile).use { input ->
                outStream.use { output ->
                    input.copyTo(output)
                }
            }
        } finally {
            tempFile.delete()
        }

        val json = JSONObject().apply {
            put("id", entry.id)
            put("name", entry.name)
            put("isDirectory", false)
            put("size", tempFile.length())
            put("mimeType", mimeType)
            put("lastModified", System.currentTimeMillis())
        }
        return jsonResponse(Response.Status.OK, json)
    }

    private fun handleFileRename(session: IHTTPSession, uri: String): Response {
        val parts = uri.split("/")
        if (parts.size < 5) return errorResponse(Response.Status.BAD_REQUEST, "Invalid file URL")
        val fileId = URLDecoder.decode(parts[4], "UTF-8")

        val body = parseJsonBody(session)
        val newName = body.optString("newName", "")
        if (newName.isEmpty()) return errorResponse(Response.Status.BAD_REQUEST, "Invalid newName")

        val renamed = storageRepository.renameFile(fileId, newName)
            ?: return errorResponse(Response.Status.INTERNAL_ERROR, "Rename failed")

        val json = JSONObject().apply {
            put("id", renamed.id)
            put("name", renamed.name)
            put("isDirectory", renamed.isDirectory)
            put("mimeType", renamed.mimeType)
            put("size", renamed.size)
            put("lastModified", renamed.lastModified)
        }
        return jsonResponse(Response.Status.OK, json)
    }

    private fun handleFileDelete(uri: String): Response {
        val parts = uri.split("/")
        if (parts.size < 5) return errorResponse(Response.Status.BAD_REQUEST, "Invalid file URL")
        val fileId = URLDecoder.decode(parts[4], "UTF-8")

        val deleted = storageRepository.deleteFile(fileId)
        if (deleted) {
            return jsonResponse(Response.Status.OK, JSONObject().put("success", true))
        }
        return errorResponse(Response.Status.INTERNAL_ERROR, "Delete failed or permission denied")
    }

    // Media & Cinema Handlers
    private fun handleMediaLibrary(session: IHTTPSession): Response {
        val folderId = session.parameters["folderId"]?.firstOrNull()
        val search = session.parameters["search"]?.firstOrNull()

        val library = mediaManager.getMediaLibrary(folderId, search)
        val json = JSONObject()
        json.put("totalVideos", library["totalVideos"])

        val featured = library["featured"]
        if (featured is MediaItem) {
            json.put("featured", mediaItemToJson(featured))
        } else {
            json.put("featured", JSONObject.NULL)
        }

        fun toArray(items: Any?): JSONArray {
            val arr = JSONArray()
            if (items is List<*>) {
                for (item in items) {
                    if (item is MediaItem) arr.put(mediaItemToJson(item))
                }
            }
            return arr
        }

        json.put("continueWatching", toArray(library["continueWatching"]))
        json.put("recentlyAdded", toArray(library["recentlyAdded"]))
        json.put("movies", toArray(library["movies"]))
        json.put("series", toArray(library["series"]))
        json.put("watchlist", toArray(library["watchlist"]))
        json.put("allVideos", toArray(library["allVideos"]))

        return jsonResponse(Response.Status.OK, json)
    }

    private fun handleMediaDetails(uri: String): Response {
        val parts = uri.split("/")
        if (parts.size < 5) return errorResponse(Response.Status.BAD_REQUEST, "Invalid media URL")
        val fileId = URLDecoder.decode(parts[4], "UTF-8")

        val media = mediaManager.getMediaItem(fileId) ?: return errorResponse(Response.Status.NOT_FOUND, "Media not found")
        val tracks = mediaManager.getMediaTracks(fileId)

        val json = mediaItemToJson(media)
        val tracksArray = JSONArray()
        for (track in tracks) {
            tracksArray.put(mediaTrackToJson(track))
        }
        json.put("tracks", tracksArray)

        return jsonResponse(Response.Status.OK, json)
    }

    private fun handleMediaStream(session: IHTTPSession, uri: String): Response {
        val parts = uri.split("/")
        if (parts.size < 6) return errorResponse(Response.Status.BAD_REQUEST, "Invalid media stream URL")
        val fileId = URLDecoder.decode(parts[4], "UTF-8")

        val file = storageRepository.resolveFile(fileId) ?: return errorResponse(Response.Status.NOT_FOUND, "Video not found")

        val quality = session.parameters["quality"]?.firstOrNull()?.lowercase()
        val isSpecificQuality = quality != null && quality != "auto" && quality != "original"

        // 1. Hardware Transcoded Stream for specific requested quality (480p, 720p, 1080p, 4K, 360p)
        if (isSpecificQuality) {
            val transcoded = mediaTranscoder.getTranscodedFile(fileId, quality)
            if (transcoded != null && transcoded.exists() && transcoded.length() > 0) {
                val rangeHeader = session.headers["range"]
                val inputStream = FileInputStream(transcoded)
                return HttpRangeHandler.buildStreamingResponse(
                    inputStream = inputStream,
                    totalLength = transcoded.length(),
                    mimeType = "video/mp4",
                    rangeHeader = rangeHeader
                )
            } else {
                // Kick off hardware background transcode with Media3
                mediaTranscoder.startTranscode(fileId, Uri.parse(file.uriString), quality)
            }
        }

        // 2. Direct Streaming: original video file (Zero-CPU direct play via HTTP 206 Range)
        val stream = storageRepository.openInputStream(file) ?: return errorResponse(Response.Status.NOT_FOUND, "Cannot open media stream")

        val rangeHeader = session.headers["range"]
        return HttpRangeHandler.buildStreamingResponse(
            inputStream = stream,
            totalLength = file.size,
            mimeType = if (file.mimeType.startsWith("video/")) file.mimeType else "video/mp4",
            rangeHeader = rangeHeader
        )
    }

    private fun handleTranscodeStatus(session: IHTTPSession, uri: String): Response {
        val parts = uri.split("/")
        if (parts.size < 6) return errorResponse(Response.Status.BAD_REQUEST, "Invalid URL")
        val fileId = URLDecoder.decode(parts[4], "UTF-8")
        val quality = session.parameters["quality"]?.firstOrNull()?.lowercase() ?: "720p"

        val cachedFile = mediaTranscoder.getTranscodedFile(fileId, quality)
        val isReady = cachedFile != null && cachedFile.exists() && cachedFile.length() > 0
        val isBusy = mediaTranscoder.isTranscoding(fileId, quality)

        val json = JSONObject().apply {
            put("ready", isReady)
            put("transcoding", isBusy)
            put("quality", quality)
            put("fileSize", cachedFile?.length() ?: 0L)
        }
        return jsonResponse(Response.Status.OK, json)
    }

    private fun handleTriggerTranscode(session: IHTTPSession, uri: String): Response {
        val parts = uri.split("/")
        if (parts.size < 6) return errorResponse(Response.Status.BAD_REQUEST, "Invalid URL")
        val fileId = URLDecoder.decode(parts[4], "UTF-8")
        val body = parseJsonBody(session)
        val quality = body.optString("quality", "720p").lowercase()

        val file = storageRepository.resolveFile(fileId) ?: return errorResponse(Response.Status.NOT_FOUND, "Video not found")
        val cached = mediaTranscoder.getTranscodedFile(fileId, quality)
        if (cached != null) {
            val res = JSONObject().apply {
                put("status", "already_cached")
                put("quality", quality)
                put("fileSize", cached.length())
            }
            return jsonResponse(Response.Status.OK, res)
        }

        mediaTranscoder.startTranscode(fileId, Uri.parse(file.uriString), quality)
        val res = JSONObject().apply {
            put("status", "started")
            put("quality", quality)
        }
        return jsonResponse(Response.Status.OK, res)
    }

    private fun handleMediaThumbnail(uri: String): Response {
        val parts = uri.split("/")
        if (parts.size < 6) return errorResponse(Response.Status.BAD_REQUEST, "Invalid media URL")
        val fileId = URLDecoder.decode(parts[4], "UTF-8")

        val thumbBytes = mediaManager.getVideoThumbnail(fileId)
        if (thumbBytes != null) {
            val response = newFixedLengthResponse(
                Response.Status.OK,
                "image/jpeg",
                ByteArrayInputStream(thumbBytes),
                thumbBytes.size.toLong()
            )
            response.addHeader("Cache-Control", "public, max-age=86400")
            return response
        }

        // Fallback to generic thumbnail
        return handleFileThumbnail("/api/v1/files/$fileId/thumbnail")
    }

    private fun handleMediaTracks(uri: String): Response {
        val parts = uri.split("/")
        if (parts.size < 6) return errorResponse(Response.Status.BAD_REQUEST, "Invalid media URL")
        val fileId = URLDecoder.decode(parts[4], "UTF-8")

        val tracks = mediaManager.getMediaTracks(fileId)
        val arr = JSONArray()
        for (t in tracks) {
            arr.put(mediaTrackToJson(t))
        }
        return jsonResponse(Response.Status.OK, arr)
    }

    private fun handleMediaSubtitles(uri: String): Response {
        // Format: /api/v1/media/{fileId}/subtitles/{trackId}
        val parts = uri.split("/")
        if (parts.size < 7) return errorResponse(Response.Status.BAD_REQUEST, "Invalid subtitle URL")
        val fileId = URLDecoder.decode(parts[4], "UTF-8")
        val trackId = URLDecoder.decode(parts[6], "UTF-8")

        val vttContent = mediaManager.getSubtitleVttContent(fileId, trackId)
            ?: return errorResponse(Response.Status.NOT_FOUND, "Subtitle track not available")

        val response = newFixedLengthResponse(
            Response.Status.OK,
            "text/vtt; charset=utf-8",
            vttContent
        )
        response.addHeader("Cache-Control", "public, max-age=3600")
        return response
    }

    private fun handleGetPlaybackProgress(uri: String): Response {
        val parts = uri.split("/")
        if (parts.size < 6) return errorResponse(Response.Status.BAD_REQUEST, "Invalid URL")
        val fileId = URLDecoder.decode(parts[4], "UTF-8")

        val progress = dbHelper.getPlaybackProgress(fileId)
        if (progress == null) {
            return jsonResponse(Response.Status.OK, JSONObject().put("positionMs", 0L).put("completed", false))
        }

        val json = JSONObject().apply {
            put("mediaId", progress.mediaId)
            put("positionMs", progress.positionMs)
            put("durationMs", progress.durationMs)
            put("completed", progress.completed)
            put("subtitleTrack", progress.subtitleTrack)
            put("audioTrack", progress.audioTrack)
            put("playbackSpeed", progress.playbackSpeed)
            put("lastWatched", progress.lastWatched)
        }
        return jsonResponse(Response.Status.OK, json)
    }

    private fun handleSavePlaybackProgress(session: IHTTPSession, uri: String): Response {
        val parts = uri.split("/")
        if (parts.size < 6) return errorResponse(Response.Status.BAD_REQUEST, "Invalid URL")
        val fileId = URLDecoder.decode(parts[4], "UTF-8")

        val body = parseJsonBody(session)
        val file = storageRepository.resolveFile(fileId) ?: return errorResponse(Response.Status.NOT_FOUND, "File not found")

        val pos = body.optLong("positionMs", 0L)
        val dur = body.optLong("durationMs", 0L)
        val completed = body.optBoolean("completed", (dur > 0 && pos >= dur * 0.90))
        val subTrack = if (body.has("subtitleTrack") && !body.isNull("subtitleTrack")) body.getString("subtitleTrack") else null
        val audTrack = if (body.has("audioTrack") && !body.isNull("audioTrack")) body.getString("audioTrack") else null
        val speed = body.optDouble("playbackSpeed", 1.0).toFloat()

        val progress = PlaybackProgress(
            mediaId = fileId,
            folderId = file.folderId,
            filename = file.name,
            positionMs = pos,
            durationMs = dur,
            completed = completed,
            subtitleTrack = subTrack,
            audioTrack = audTrack,
            playbackSpeed = speed,
            lastWatched = System.currentTimeMillis()
        )
        dbHelper.savePlaybackProgress(progress)

        return jsonResponse(Response.Status.OK, JSONObject().put("saved", true))
    }

    private fun handleDeletePlaybackProgress(uri: String): Response {
        val parts = uri.split("/")
        if (parts.size < 6) return errorResponse(Response.Status.BAD_REQUEST, "Invalid URL")
        val fileId = URLDecoder.decode(parts[4], "UTF-8")

        val deleted = dbHelper.deletePlaybackProgress(fileId)
        return jsonResponse(Response.Status.OK, JSONObject().put("deleted", deleted))
    }

    private fun handleToggleWatchlist(uri: String): Response {
        val parts = uri.split("/")
        if (parts.size < 6) return errorResponse(Response.Status.BAD_REQUEST, "Invalid URL")
        val fileId = URLDecoder.decode(parts[4], "UTF-8")

        val inWatchlist = dbHelper.toggleWatchlist(fileId)
        return jsonResponse(Response.Status.OK, JSONObject().put("isWatchlisted", inWatchlist))
    }

    private fun mediaItemToJson(item: MediaItem): JSONObject {
        return JSONObject().apply {
            put("id", item.id)
            put("name", item.name)
            put("title", item.title)
            put("size", item.size)
            put("durationMs", item.durationMs)
            put("width", item.width)
            put("height", item.height)
            put("resolution", item.resolution)
            put("mimeType", item.mimeType)
            put("folderId", item.folderId)
            put("lastModified", item.lastModified)
            put("playbackPositionMs", item.playbackPositionMs)
            put("completed", item.completed)
            put("lastWatched", item.lastWatched)
            put("hasSubtitles", item.hasSubtitles)
            put("audioTracksCount", item.audioTracksCount)
            put("isSeries", item.isSeries)
            if (item.season != null) put("season", item.season)
            if (item.episode != null) put("episode", item.episode)
            put("isWatchlisted", item.isWatchlisted)
        }
    }

    private fun mediaTrackToJson(track: MediaTrack): JSONObject {
        return JSONObject().apply {
            put("id", track.id)
            put("type", track.type)
            put("label", track.label)
            if (track.language != null) put("language", track.language)
            put("isDefault", track.isDefault)
            if (track.format != null) put("format", track.format)
            put("source", track.source)
        }
    }

    private fun extractToken(session: IHTTPSession): String? {
        val authHeader = session.headers["authorization"]
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7).trim()
        }
        return session.parameters["token"]?.firstOrNull()
    }

    private fun parseJsonBody(session: IHTTPSession): JSONObject {
        val files = HashMap<String, String>()
        return try {
            session.parseBody(files)
            val postData = files["postData"]
            if (!postData.isNullOrEmpty()) JSONObject(postData) else JSONObject()
        } catch (e: Exception) {
            JSONObject()
        }
    }

    private fun jsonResponse(status: Response.Status, json: Any): Response {
        val respObj = JSONObject().apply {
            put("success", true)
            put("data", json)
        }
        return newFixedLengthResponse(status, "application/json; charset=UTF-8", respObj.toString())
    }

    private fun errorResponse(status: Response.Status, message: String): Response {
        val respObj = JSONObject().apply {
            put("success", false)
            put("error", message)
        }
        return newFixedLengthResponse(status, "application/json; charset=UTF-8", respObj.toString())
    }

    private fun addCorsHeaders(response: Response) {
        response.addHeader("Access-Control-Allow-Origin", "*")
        response.addHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS, HEAD")
        response.addHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Range")
        response.addHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length, Content-Disposition")
    }
}
