package com.example.phonedrive.server

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

/**
 * High-performance hardware-accelerated video transcoding engine for PhoneDrive on Android.
 * Powered by Jetpack Media3 Transformer.
 *
 * Scales videos to 4K, 1080p, 720p, 480p, 360p and encodes to universal H.264 + AAC MP4.
 * Uses persistent disk caching so once a quality is transcoded, it serves instantly with HTTP 206 Range seeking.
 */
class MediaTranscoder private constructor(private val context: Context) {

    private val mainHandler = Handler(Looper.getMainLooper())
    private val cacheDir = File(context.cacheDir, "transcoded_media").apply {
        if (!exists()) mkdirs()
    }

    private val activeJobs = ConcurrentHashMap<String, Transformer>()

    companion object {
        private const val TAG = "MediaTranscoder"

        @Volatile
        private var INSTANCE: MediaTranscoder? = null

        fun getInstance(context: Context): MediaTranscoder {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: MediaTranscoder(context.applicationContext).also { INSTANCE = it }
            }
        }

        val QUALITY_HEIGHT_MAP = mapOf(
            "4k" to 2160,
            "2160p" to 2160,
            "1080p" to 1080,
            "720p" to 720,
            "480p" to 480,
            "360p" to 360
        )

        private const val MAX_CACHE_BYTES = 5L * 1024 * 1024 * 1024 // 5 GB safety quota

        fun hashKey(input: String): String {
            val md = MessageDigest.getInstance("MD5")
            val digest = md.digest(input.toByteArray())
            return digest.joinToString("") { "%02x".format(it) }
        }
    }

    private fun pruneCacheIfNeeded() {
        try {
            val files = cacheDir.listFiles() ?: return
            var totalSize = files.sumOf { it.length() }
            if (totalSize > MAX_CACHE_BYTES) {
                // Evict oldest completed files first (LRU)
                val sorted = files.filter { !it.name.endsWith(".tmp") }.sortedBy { it.lastModified() }
                for (file in sorted) {
                    val len = file.length()
                    if (file.delete()) {
                        totalSize -= len
                        if (totalSize <= MAX_CACHE_BYTES * 0.75) {
                            break
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Cache pruning error", e)
        }
    }

    fun getTranscodedFile(fileId: String, quality: String): File? {
        val targetHeight = QUALITY_HEIGHT_MAP[quality.lowercase()] ?: return null
        val cacheKey = "${hashKey(fileId)}_${targetHeight}p.mp4"
        val file = File(cacheDir, cacheKey)
        return if (file.exists() && file.length() > 0) file else null
    }

    fun isTranscoding(fileId: String, quality: String): Boolean {
        val targetHeight = QUALITY_HEIGHT_MAP[quality.lowercase()] ?: return false
        val jobKey = "${fileId}_${targetHeight}p"
        return activeJobs.containsKey(jobKey)
    }

    fun startTranscode(
        fileId: String,
        inputUri: Uri,
        quality: String,
        onComplete: ((File?) -> Unit)? = null
    ): File {
        val targetHeight = QUALITY_HEIGHT_MAP[quality.lowercase()] ?: 720
        val cacheKey = "${hashKey(fileId)}_${targetHeight}p.mp4"
        val outputFile = File(cacheDir, cacheKey)
        val tempFile = File(cacheDir, "${cacheKey}.tmp")
        val jobKey = "${fileId}_${targetHeight}p"

        if (outputFile.exists() && outputFile.length() > 0) {
            onComplete?.invoke(outputFile)
            return outputFile
        }

        pruneCacheIfNeeded()

        if (activeJobs.containsKey(jobKey)) {
            return outputFile
        }

        mainHandler.post {
            try {
                val mediaItem = MediaItem.fromUri(inputUri)
                val presentation = Presentation.createForHeight(targetHeight)
                val editedMediaItem = EditedMediaItem.Builder(mediaItem)
                    .setEffects(Effects(emptyList(), listOf(presentation)))
                    .build()

                val transformer = Transformer.Builder(context)
                    .setVideoMimeType(MimeTypes.VIDEO_H264)
                    .setAudioMimeType(MimeTypes.AUDIO_AAC)
                    .addListener(object : Transformer.Listener {
                        override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                            Log.d(TAG, "Transcoding complete for $jobKey: ${outputFile.name}")
                            activeJobs.remove(jobKey)
                            if (tempFile.exists() && tempFile.length() > 0) {
                                tempFile.renameTo(outputFile)
                                onComplete?.invoke(outputFile)
                            } else {
                                onComplete?.invoke(null)
                            }
                        }

                        override fun onError(
                            composition: Composition,
                            exportResult: ExportResult,
                            exportException: ExportException
                        ) {
                            Log.e(TAG, "Transcoding error for $jobKey", exportException)
                            activeJobs.remove(jobKey)
                            tempFile.delete()
                            onComplete?.invoke(null)
                        }
                    })
                    .build()

                activeJobs[jobKey] = transformer
                transformer.start(editedMediaItem, tempFile.absolutePath)
                Log.d(TAG, "Started hardware transcoding for $jobKey (${targetHeight}p)")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start transcode for $jobKey", e)
                activeJobs.remove(jobKey)
                onComplete?.invoke(null)
            }
        }

        return outputFile
    }
}
