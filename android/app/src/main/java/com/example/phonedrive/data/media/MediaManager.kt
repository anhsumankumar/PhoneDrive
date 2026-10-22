package com.example.phonedrive.data.media

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.util.LruCache
import androidx.documentfile.provider.DocumentFile
import com.example.phonedrive.data.db.AppDatabaseHelper
import com.example.phonedrive.data.model.CachedMediaMeta
import com.example.phonedrive.data.model.FileEntry
import com.example.phonedrive.data.model.MediaItem
import com.example.phonedrive.data.model.MediaTrack
import com.example.phonedrive.data.model.PlaybackProgress
import com.example.phonedrive.data.storage.StorageRepository
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.regex.Pattern

class MediaManager(private val context: Context) {
    private val dbHelper = AppDatabaseHelper.getInstance(context)
    private val storageRepo = StorageRepository.getInstance(context)

    // Bitmap thumbnail LRU Cache (max 30 MB)
    private val thumbnailCache = object : LruCache<String, ByteArray>(30 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ByteArray): Int {
            return value.size
        }
    }

    companion object {
        @Volatile
        private var INSTANCE: MediaManager? = null

        fun getInstance(context: Context): MediaManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: MediaManager(context.applicationContext).also { INSTANCE = it }
            }
        }

        // Regex patterns for series: S01E02 or 1x02
        private val SERIES_PATTERN = Pattern.compile("(?i)(.*?)[ ._\\-(]+[sS](\\d{1,2})[eE](\\d{1,2})")
        private val SERIES_PATTERN_ALT = Pattern.compile("(?i)(.*?)[ ._\\-(]+(\\d{1,2})x(\\d{1,2})")
    }

    private var cachedLibrary: Pair<Long, Map<String, Any>>? = null

    fun invalidateCache() {
        cachedLibrary = null
    }

    /**
     * Resolves all video files across authorized folders and constructs the library.
     */
    fun getMediaLibrary(folderId: String? = null, search: String? = null): Map<String, Any> {
        val isDefault = folderId.isNullOrEmpty() && search.isNullOrEmpty()
        val cached = cachedLibrary
        if (isDefault && cached != null && (System.currentTimeMillis() - cached.first < 60_000L)) {
            return cached.second
        }

        val videoFiles = storageRepo.listFiles(folderId, null, "videos", search)
        val progressMap = dbHelper.getAllPlaybackProgress().associateBy { it.mediaId }
        val watchlistSet = dbHelper.getAllWatchlistIds()

        val mediaItems = videoFiles.map { file ->
            resolveMediaItem(file, progressMap[file.id], watchlistSet.contains(file.id))
        }

        // Partition into sections
        val continueWatching = mediaItems.filter {
            it.playbackPositionMs > 5000 && !it.completed && (it.durationMs == 0L || it.playbackPositionMs < it.durationMs * 0.95)
        }.sortedByDescending { it.lastWatched }

        val recentlyAdded = mediaItems.sortedByDescending { it.lastModified }
        val movies = mediaItems.filter { !it.isSeries }
        val series = mediaItems.filter { it.isSeries }
        val watchlist = mediaItems.filter { it.isWatchlisted }

        // Featured: pick first unwatched movie or top continue watching
        val featured = continueWatching.firstOrNull() ?: movies.firstOrNull() ?: mediaItems.firstOrNull()

        val result = mapOf(
            "totalVideos" to mediaItems.size,
            "featured" to (featured ?: ""),
            "continueWatching" to continueWatching,
            "recentlyAdded" to recentlyAdded,
            "movies" to movies,
            "series" to series,
            "watchlist" to watchlist,
            "allVideos" to mediaItems
        )

        if (isDefault) {
            cachedLibrary = Pair(System.currentTimeMillis(), result)
        }

        return result
    }

    /**
     * Resolves single MediaItem by fileId.
     */
    fun getMediaItem(fileId: String): MediaItem? {
        val file = storageRepo.resolveFile(fileId) ?: return null
        val progress = dbHelper.getPlaybackProgress(fileId)
        val isWatchlisted = dbHelper.isWatchlisted(fileId)
        return resolveMediaItem(file, progress, isWatchlisted, forceExtraction = true)
    }

    /**
     * Extracts or retrieves cached media metadata for a FileEntry.
     */
    private fun resolveMediaItem(
        file: FileEntry,
        progress: PlaybackProgress?,
        isWatchlisted: Boolean,
        forceExtraction: Boolean = false
    ): MediaItem {
        val cached = dbHelper.getCachedMediaMetadata(file.id)
        if (cached != null && cached.lastModified == file.lastModified) {
            return MediaItem(
                id = file.id,
                name = file.name,
                title = cached.title,
                size = file.size,
                durationMs = cached.durationMs,
                width = cached.width,
                height = cached.height,
                resolution = cached.resolution,
                mimeType = cached.mimeType,
                folderId = file.folderId,
                lastModified = file.lastModified,
                playbackPositionMs = progress?.positionMs ?: 0L,
                completed = progress?.completed ?: false,
                lastWatched = progress?.lastWatched ?: 0L,
                hasSubtitles = cached.hasSubtitles,
                audioTracksCount = cached.audioTracksCount,
                isSeries = cached.isSeries,
                season = cached.season,
                episode = cached.episode,
                isWatchlisted = isWatchlisted
            )
        }

        // Parse title and series metadata
        val (cleanTitle, isSeries, season, episode) = parseMediaTitle(file.name)

        if (!forceExtraction) {
            return MediaItem(
                id = file.id,
                name = file.name,
                title = cleanTitle,
                size = file.size,
                durationMs = 0L,
                width = 1920,
                height = 1080,
                resolution = "HD",
                mimeType = file.mimeType,
                folderId = file.folderId,
                lastModified = file.lastModified,
                playbackPositionMs = progress?.positionMs ?: 0L,
                completed = progress?.completed ?: false,
                lastWatched = progress?.lastWatched ?: 0L,
                hasSubtitles = false,
                audioTracksCount = 1,
                isSeries = isSeries,
                season = season,
                episode = episode,
                isWatchlisted = isWatchlisted
            )
        }

        // Extract metadata using MediaMetadataRetriever
        var durationMs = 0L
        var width = 0
        var height = 0
        var resolution = "SD"
        var mimeType = file.mimeType
        var audioCount = 1
        var hasSubtitles = false

        var retriever: MediaMetadataRetriever? = null
        try {
            retriever = MediaMetadataRetriever()
            retriever.setDataSource(context, Uri.parse(file.uriString))

            val durStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
            durationMs = durStr?.toLongOrNull() ?: 0L

            val wStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
            val hStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
            val rotStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
            val rotation = rotStr?.toIntOrNull() ?: 0

            var rawW = wStr?.toIntOrNull() ?: 0
            var rawH = hStr?.toIntOrNull() ?: 0

            if (rotation == 90 || rotation == 270) {
                width = rawH
                height = rawW
            } else {
                width = rawW
                height = rawH
            }

            resolution = when {
                width >= 3800 || height >= 2000 -> "4K UHD"
                width >= 1900 || height >= 1000 -> "1080p FHD"
                width >= 1200 || height >= 700 -> "720p HD"
                width >= 800 || height >= 400 -> "480p"
                else -> if (width > 0) "SD" else "HD"
            }

            val extractedMime = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE)
            if (!extractedMime.isNullOrEmpty()) {
                mimeType = extractedMime
            }
        } catch (e: Exception) {
            // Fallback for metadata errors
        } finally {
            try {
                retriever?.release()
            } catch (e: Exception) {
            }
        }

        // Check for sidecar subtitle files
        val sidecars = findSidecarSubtitles(file)
        if (sidecars.isNotEmpty()) {
            hasSubtitles = true
        }

        // Also check for sidecar subtitle files
        if (!hasSubtitles) {
            val sidecars = findSidecarSubtitles(file)
            if (sidecars.isNotEmpty()) {
                hasSubtitles = true
            }
        }

        // Cache metadata for fast future lookups
        val metaCache = CachedMediaMeta(
            mediaId = file.id,
            title = cleanTitle,
            durationMs = durationMs,
            width = width,
            height = height,
            resolution = resolution,
            mimeType = mimeType,
            audioTracksCount = audioCount,
            hasSubtitles = hasSubtitles,
            isSeries = isSeries,
            season = season,
            episode = episode,
            lastModified = file.lastModified
        )
        dbHelper.cacheMediaMetadata(metaCache)

        return MediaItem(
            id = file.id,
            name = file.name,
            title = cleanTitle,
            size = file.size,
            durationMs = durationMs,
            width = width,
            height = height,
            resolution = resolution,
            mimeType = mimeType,
            folderId = file.folderId,
            lastModified = file.lastModified,
            playbackPositionMs = progress?.positionMs ?: 0L,
            completed = progress?.completed ?: false,
            lastWatched = progress?.lastWatched ?: 0L,
            hasSubtitles = hasSubtitles,
            audioTracksCount = audioCount,
            isSeries = isSeries,
            season = season,
            episode = episode,
            isWatchlisted = isWatchlisted
        )
    }

    /**
     * Returns audio and subtitle tracks for a media file.
     */
    fun getMediaTracks(fileId: String): List<MediaTrack> {
        val file = storageRepo.resolveFile(fileId) ?: return emptyList()
        val tracks = mutableListOf<MediaTrack>()

        // 1. Embedded tracks via MediaExtractor
        try {
            val extractor = MediaExtractor()
            extractor.setDataSource(context, Uri.parse(file.uriString), null)
            var audioIndex = 1
            var subIndex = 1

            for (i in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(i)
                val mime = format.getString(MediaFormat.KEY_MIME) ?: ""
                val lang = if (format.containsKey(MediaFormat.KEY_LANGUAGE)) format.getString(MediaFormat.KEY_LANGUAGE) else null

                if (mime.startsWith("audio/")) {
                    val label = when {
                        !lang.isNullOrEmpty() -> "Audio: ${lang.uppercase()}"
                        audioIndex == 1 -> "Original Audio"
                        else -> "Audio Track $audioIndex"
                    }
                    tracks.add(
                        MediaTrack(
                            id = "audio_$i",
                            type = "audio",
                            label = label,
                            language = lang,
                            isDefault = (audioIndex == 1),
                            format = mime.removePrefix("audio/"),
                            source = "embedded"
                        )
                    )
                    audioIndex++
                } else if (mime.startsWith("text/") || mime.contains("subrip") || mime.contains("vtt")) {
                    val label = when {
                        !lang.isNullOrEmpty() -> lang.uppercase()
                        else -> "Subtitle Track $subIndex"
                    }
                    tracks.add(
                        MediaTrack(
                            id = "sub_$i",
                            type = "subtitle",
                            label = label,
                            language = lang,
                            isDefault = (subIndex == 1),
                            format = "vtt",
                            source = "embedded"
                        )
                    )
                    subIndex++
                }
            }
            extractor.release()
        } catch (e: Exception) {
        }

        // If no audio track detected, add default
        if (tracks.none { it.type == "audio" }) {
            tracks.add(
                MediaTrack(
                    id = "audio_default",
                    type = "audio",
                    label = "Default Stereo",
                    isDefault = true,
                    source = "embedded"
                )
            )
        }

        // 2. Discovered Sidecar Subtitles (.srt, .vtt)
        val sidecars = findSidecarSubtitles(file)
        for ((idx, sidecar) in sidecars.withIndex()) {
            val lang = parseSubtitleLanguage(sidecar.name)
            val label = if (!lang.isNullOrEmpty()) "$lang (External)" else "Subtitles ${idx + 1}"
            tracks.add(
                MediaTrack(
                    id = sidecar.id,
                    type = "subtitle",
                    label = label,
                    language = lang,
                    isDefault = (tracks.none { it.type == "subtitle" }),
                    format = if (sidecar.name.endsWith(".vtt", ignoreCase = true)) "vtt" else "srt",
                    source = "sidecar"
                )
            )
        }

        return tracks
    }

    /**
     * Converts or streams subtitle content as valid WebVTT.
     */
    fun getSubtitleVttContent(fileId: String, trackId: String): String? {
        val subFile = storageRepo.resolveFile(trackId)
        val isSidecar = subFile != null

        if (isSidecar) {
            val stream = storageRepo.openInputStream(subFile!!) ?: return null
            val rawText = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }

            return if (subFile.name.endsWith(".vtt", ignoreCase = true)) {
                rawText
            } else {
                convertSrtToVtt(rawText)
            }
        }
        return null
    }

    /**
     * Converts SubRip (.srt) text into clean WebVTT format with UTF-8 support.
     */
    fun convertSrtToVtt(srtText: String): String {
        val sb = StringBuilder("WEBVTT\n\n")
        // Timestamp regex: 00:01:23,456 --> 00:01:27,890
        val timestampRegex = Pattern.compile("(\\d{2}:\\d{2}:\\d{2}),(\\d{3})\\s*-->\\s*(\\d{2}:\\d{2}:\\d{2}),(\\d{3})")

        val lines = srtText.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        for (line in lines) {
            val matcher = timestampRegex.matcher(line)
            if (matcher.find()) {
                val vttTimestamp = line.replace(",", ".")
                sb.append(vttTimestamp).append("\n")
            } else {
                sb.append(line).append("\n")
            }
        }
        return sb.toString()
    }

    /**
     * Extracts and caches a thumbnail frame as JPEG bytes.
     */
    fun getVideoThumbnail(fileId: String): ByteArray? {
        val cachedBytes = thumbnailCache.get(fileId)
        if (cachedBytes != null) return cachedBytes

        val file = storageRepo.resolveFile(fileId) ?: return null
        var retriever: MediaMetadataRetriever? = null
        try {
            retriever = MediaMetadataRetriever()
            retriever.setDataSource(context, Uri.parse(file.uriString))

            val durStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
            val durMs = durStr?.toLongOrNull() ?: 10000L
            // Target frame at 10% or 2 seconds in
            val targetUs = Math.min(durMs * 1000L / 10L, 2_000_000L)

            val bitmap = retriever.getFrameAtTime(targetUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                ?: retriever.frameAtTime

            if (bitmap != null) {
                // Resize for thumbnail efficiency: max width 640
                val scaled = if (bitmap.width > 640) {
                    val scale = 640f / bitmap.width
                    Bitmap.createScaledBitmap(bitmap, 640, (bitmap.height * scale).toInt(), true)
                } else {
                    bitmap
                }

                val baos = ByteArrayOutputStream()
                scaled.compress(Bitmap.CompressFormat.JPEG, 80, baos)
                val bytes = baos.toByteArray()
                thumbnailCache.put(fileId, bytes)
                return bytes
            }
        } catch (e: Exception) {
        } finally {
            try {
                retriever?.release()
            } catch (e: Exception) {
            }
        }
        return null
    }

    /**
     * Searches for matching sidecar subtitle files (.srt, .vtt) in the same directory.
     */
    private fun findSidecarSubtitles(videoFile: FileEntry): List<FileEntry> {
        val baseName = videoFile.name.substringBeforeLast('.')
        val parentFiles = storageRepo.listFiles(videoFile.folderId, videoFile.parentId, null, null)

        return parentFiles.filter { file ->
            !file.isDirectory &&
                    (file.name.endsWith(".srt", ignoreCase = true) || file.name.endsWith(".vtt", ignoreCase = true)) &&
                    file.name.startsWith(baseName, ignoreCase = true)
        }
    }

    private fun parseSubtitleLanguage(filename: String): String? {
        val lower = filename.lowercase()
        return when {
            lower.contains(".en.") || lower.contains("_en.") || lower.contains("english") -> "English"
            lower.contains(".hi.") || lower.contains("_hi.") || lower.contains("hindi") -> "Hindi"
            lower.contains(".es.") || lower.contains("_es.") || lower.contains("spanish") -> "Spanish"
            lower.contains(".fr.") || lower.contains("_fr.") || lower.contains("french") -> "French"
            lower.contains(".de.") || lower.contains("_de.") || lower.contains("german") -> "German"
            else -> null
        }
    }

    /**
     * Parses a video filename into a clean display title and detects TV series patterns.
     */
    private fun parseMediaTitle(filename: String): TitleMetadata {
        val nameWithoutExt = filename.substringBeforeLast('.')

        // Check S01E02 pattern
        var matcher = SERIES_PATTERN.matcher(nameWithoutExt)
        if (matcher.find()) {
            val seriesTitle = cleanTitleString(matcher.group(1) ?: "")
            val s = matcher.group(2)?.toIntOrNull()
            val e = matcher.group(3)?.toIntOrNull()
            return TitleMetadata(
                title = "$seriesTitle S${s?.toString()?.padStart(2, '0')}E${e?.toString()?.padStart(2, '0')}",
                isSeries = true,
                season = s,
                episode = e
            )
        }

        // Check 1x02 pattern
        matcher = SERIES_PATTERN_ALT.matcher(nameWithoutExt)
        if (matcher.find()) {
            val seriesTitle = cleanTitleString(matcher.group(1) ?: "")
            val s = matcher.group(2)?.toIntOrNull()
            val e = matcher.group(3)?.toIntOrNull()
            return TitleMetadata(
                title = "$seriesTitle S${s?.toString()?.padStart(2, '0')}E${e?.toString()?.padStart(2, '0')}",
                isSeries = true,
                season = s,
                episode = e
            )
        }

        return TitleMetadata(
            title = cleanTitleString(nameWithoutExt),
            isSeries = false,
            season = null,
            episode = null
        )
    }

    private fun cleanTitleString(raw: String): String {
        return raw
            .replace(Regex("(?i)\b(1080p|720p|2160p|4k|uhd|bluray|webrip|web-dl|x264|x265|hevc|aac|dvdrip|h264)\b"), "")
            .replace('.', ' ')
            .replace('_', ' ')
            .replace('-', ' ')
            .replace(Regex("\\s+"), " ")
            .trim()
            .ifEmpty { raw }
    }

    private data class TitleMetadata(
        val title: String,
        val isSeries: Boolean,
        val season: Int?,
        val episode: Int?
    )
}
