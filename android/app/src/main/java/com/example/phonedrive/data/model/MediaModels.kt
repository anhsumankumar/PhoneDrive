package com.example.phonedrive.data.model

data class MediaItem(
    val id: String,
    val name: String,
    val title: String,
    val size: Long,
    val durationMs: Long,
    val width: Int,
    val height: Int,
    val resolution: String, // e.g. "4K UHD", "1080p FHD", "720p HD", "480p"
    val mimeType: String,
    val folderId: String,
    val lastModified: Long,
    val playbackPositionMs: Long = 0L,
    val completed: Boolean = false,
    val lastWatched: Long = 0L,
    val hasSubtitles: Boolean = false,
    val audioTracksCount: Int = 1,
    val isSeries: Boolean = false,
    val season: Int? = null,
    val episode: Int? = null,
    val isWatchlisted: Boolean = false
)

data class MediaTrack(
    val id: String,
    val type: String, // "subtitle" | "audio"
    val label: String,
    val language: String? = null,
    val isDefault: Boolean = false,
    val format: String? = null, // "vtt", "srt", "aac", etc.
    val source: String = "embedded" // "embedded" | "sidecar"
)

data class PlaybackProgress(
    val mediaId: String,
    val folderId: String,
    val filename: String,
    val positionMs: Long,
    val durationMs: Long,
    val completed: Boolean = false,
    val subtitleTrack: String? = null,
    val audioTrack: String? = null,
    val playbackSpeed: Float = 1.0f,
    val lastWatched: Long = System.currentTimeMillis()
)

data class CachedMediaMeta(
    val mediaId: String,
    val title: String,
    val durationMs: Long,
    val width: Int,
    val height: Int,
    val resolution: String,
    val mimeType: String,
    val audioTracksCount: Int,
    val hasSubtitles: Boolean,
    val isSeries: Boolean,
    val season: Int?,
    val episode: Int?,
    val lastModified: Long
)
