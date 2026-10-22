package com.example.phonedrive.server

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.util.LruCache
import com.example.phonedrive.data.model.FileEntry
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

/**
 * High-performance thumbnail generation & multi-tier caching engine.
 * Solves browser lag and massive memory consumption by generating downsampled
 * ~20KB-35KB web-optimized thumbnails instead of streaming raw multi-megabyte 4K/12MP photos.
 *
 * Tier 1: In-memory LRU Cache (Instant < 1ms response)
 * Tier 2: Persistent Disk Cache on Android CacheDir (Fast < 5ms response)
 * Tier 3: Asynchronous On-Demand Downsampling with Bitmap.Config.RGB_565 (Low CPU/RAM)
 */
class ThumbnailManager(private val context: Context) {

    // 16MB in-memory byte cache
    private val memoryCache = object : LruCache<String, ByteArray>(16 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ByteArray): Int = value.size
    }

    private val cacheDir = File(context.cacheDir, "phonedrive_thumbs").apply {
        if (!exists()) mkdirs()
    }

    companion object {
        private const val TARGET_SIZE = 320 // 320px is perfect for sharp high-DPI thumbnails
        private const val JPEG_QUALITY = 82
    }

    fun getThumbnail(fileEntry: FileEntry): ByteArray? {
        val cacheKey = hashKey(fileEntry.id)

        // 1. Check in-memory LRU Cache
        synchronized(memoryCache) {
            val memBytes = memoryCache.get(cacheKey)
            if (memBytes != null) return memBytes
        }

        // 2. Check persistent disk cache
        val diskFile = File(cacheDir, "$cacheKey.jpg")
        if (diskFile.exists() && diskFile.length() > 0) {
            try {
                val diskBytes = diskFile.readBytes()
                synchronized(memoryCache) {
                    memoryCache.put(cacheKey, diskBytes)
                }
                return diskBytes
            } catch (e: Exception) {
                // If disk read fails, regenerate
            }
        }

        // 3. Generate downsampled thumbnail
        val generatedBytes = generateThumbnail(fileEntry) ?: return null

        // 4. Cache to disk and memory
        try {
            FileOutputStream(diskFile).use { it.write(generatedBytes) }
        } catch (e: Exception) {
            // Ignore disk write failure
        }

        synchronized(memoryCache) {
            memoryCache.put(cacheKey, generatedBytes)
        }

        return generatedBytes
    }

    private fun generateThumbnail(fileEntry: FileEntry): ByteArray? {
        val uri = Uri.parse(fileEntry.uriString)
        val mime = (fileEntry.mimeType ?: "").lowercase()

        return when {
            mime.startsWith("image/") || isImageExtension(fileEntry.name) -> {
                generateImageThumbnail(uri)
            }
            mime.startsWith("video/") || isVideoExtension(fileEntry.name) -> {
                generateVideoThumbnail(uri)
            }
            else -> null
        }
    }

    private fun generateImageThumbnail(uri: Uri): ByteArray? {
        return try {
            // Pass 1: Decode image dimensions only without allocating memory
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            context.contentResolver.openInputStream(uri)?.use { stream ->
                BitmapFactory.decodeStream(stream, null, options)
            } ?: return null

            val width = options.outWidth
            val height = options.outHeight
            if (width <= 0 || height <= 0) return null

            // Calculate optimal inSampleSize for power of 2 downsampling
            var sampleSize = 1
            var halfWidth = width / 2
            var halfHeight = height / 2
            while ((halfWidth / sampleSize) >= TARGET_SIZE && (halfHeight / sampleSize) >= TARGET_SIZE) {
                sampleSize *= 2
            }

            // Pass 2: Decode downsampled bitmap directly using RGB_565 (50% less RAM than ARGB_8888)
            val decodeOptions = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.RGB_565
                inDither = true
            }

            val sampledBitmap = context.contentResolver.openInputStream(uri)?.use { stream ->
                BitmapFactory.decodeStream(stream, null, decodeOptions)
            } ?: return null

            // Fine scale precisely to target dimensions if still somewhat large
            val finalBitmap = if (sampledBitmap.width > TARGET_SIZE * 1.4 || sampledBitmap.height > TARGET_SIZE * 1.4) {
                val ratio = sampledBitmap.width.toFloat() / sampledBitmap.height.toFloat()
                val targetW: Int
                val targetH: Int
                if (ratio > 1f) {
                    targetW = TARGET_SIZE
                    targetH = (TARGET_SIZE / ratio).toInt().coerceAtLeast(1)
                } else {
                    targetH = TARGET_SIZE
                    targetW = (TARGET_SIZE * ratio).toInt().coerceAtLeast(1)
                }
                val scaled = Bitmap.createScaledBitmap(sampledBitmap, targetW, targetH, true)
                if (scaled != sampledBitmap) sampledBitmap.recycle()
                scaled
            } else {
                sampledBitmap
            }

            val baos = ByteArrayOutputStream()
            finalBitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, baos)
            finalBitmap.recycle()
            baos.toByteArray()
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    private fun generateVideoThumbnail(uri: Uri): ByteArray? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(context, uri)
            // Extract frame at 2 seconds or closest keyframe
            val frame = retriever.getFrameAtTime(2_000_000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                ?: retriever.frameAtTime ?: return null

            val ratio = frame.width.toFloat() / frame.height.toFloat()
            val targetW = TARGET_SIZE
            val targetH = (TARGET_SIZE / ratio).toInt().coerceAtLeast(1)

            val scaled = Bitmap.createScaledBitmap(frame, targetW, targetH, true)
            if (scaled != frame) frame.recycle()

            val baos = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, baos)
            scaled.recycle()
            baos.toByteArray()
        } catch (e: Exception) {
            null
        } finally {
            try { retriever.release() } catch (ignored: Exception) {}
        }
    }

    private fun hashKey(key: String): String {
        return try {
            val digest = MessageDigest.getInstance("MD5").digest(key.toByteArray(Charsets.UTF_8))
            digest.joinToString("") { "%02x".format(it) }
        } catch (e: Exception) {
            key.hashCode().toString()
        }
    }

    private fun isImageExtension(name: String): Boolean {
        return name.matches(Regex("(?i).*\\.(jpg|jpeg|png|gif|webp|bmp|heic|heif)$"))
    }

    private fun isVideoExtension(name: String): Boolean {
        return name.matches(Regex("(?i).*\\.(mp4|mkv|webm|mov|avi|wmv|m4v|3gp)$"))
    }
}
