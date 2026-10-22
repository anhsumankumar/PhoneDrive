package com.example.phonedrive.server

import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoHTTPD.Response
import java.io.FilterInputStream
import java.io.InputStream

object HttpRangeHandler {

    /**
     * Creates a streaming NanoHTTPD Response supporting HTTP Range requests (206 Partial Content).
     */
    fun buildStreamingResponse(
        inputStream: InputStream,
        totalLength: Long,
        mimeType: String,
        rangeHeader: String?
    ): Response {
        if (rangeHeader.isNullOrEmpty() || !rangeHeader.startsWith("bytes=")) {
            // Full stream (HTTP 200)
            val response = NanoHTTPD.newFixedLengthResponse(
                Response.Status.OK,
                mimeType,
                inputStream,
                totalLength
            )
            response.addHeader("Accept-Ranges", "bytes")
            response.addHeader("Content-Length", totalLength.toString())
            return response
        }

        // Parse Range: bytes=start-end
        var start: Long = 0
        var end: Long = totalLength - 1

        val rangeValue = rangeHeader.substring(6).trim()
        val dashIndex = rangeValue.indexOf('-')

        if (dashIndex != -1) {
            val startStr = rangeValue.substring(0, dashIndex).trim()
            val endStr = rangeValue.substring(dashIndex + 1).trim()

            try {
                if (startStr.isNotEmpty()) {
                    start = startStr.toLong()
                }
                if (endStr.isNotEmpty()) {
                    end = endStr.toLong()
                }
            } catch (e: NumberFormatException) {
                // Malformed range
                val errorResp = NanoHTTPD.newFixedLengthResponse(
                    Response.Status.RANGE_NOT_SATISFIABLE,
                    NanoHTTPD.MIME_PLAINTEXT,
                    "Requested Range Not Satisfiable"
                )
                errorResp.addHeader("Content-Range", "bytes */$totalLength")
                return errorResp
            }
        }

        // Bound checks
        if (start < 0) start = 0
        if (end >= totalLength) end = totalLength - 1
        if (start > end || start >= totalLength) {
            val errorResp = NanoHTTPD.newFixedLengthResponse(
                Response.Status.RANGE_NOT_SATISFIABLE,
                NanoHTTPD.MIME_PLAINTEXT,
                "Requested Range Not Satisfiable"
            )
            errorResp.addHeader("Content-Range", "bytes */$totalLength")
            return errorResp
        }

        val rangeLength = end - start + 1

        // Skip to start offset
        try {
            var skipped: Long = 0
            while (skipped < start) {
                val s = inputStream.skip(start - skipped)
                if (s <= 0) {
                    // Fallback to reading
                    if (inputStream.read() == -1) break
                    skipped++
                } else {
                    skipped += s
                }
            }
        } catch (e: Exception) {
            return NanoHTTPD.newFixedLengthResponse(
                Response.Status.INTERNAL_ERROR,
                NanoHTTPD.MIME_PLAINTEXT,
                "Failed to seek stream"
            )
        }

        val boundedStream = BoundedInputStream(inputStream, rangeLength)
        val response = NanoHTTPD.newFixedLengthResponse(
            Response.Status.PARTIAL_CONTENT,
            mimeType,
            boundedStream,
            rangeLength
        )

        response.addHeader("Accept-Ranges", "bytes")
        response.addHeader("Content-Range", "bytes $start-$end/$totalLength")
        response.addHeader("Content-Length", rangeLength.toString())
        return response
    }

    /**
     * InputStream wrapper that terminates EOF after reading a fixed number of bytes.
     */
    private class BoundedInputStream(
        inputStream: InputStream,
        private val maxBytesToRead: Long
    ) : FilterInputStream(inputStream) {
        private var bytesRead: Long = 0

        override fun read(): Int {
            if (bytesRead >= maxBytesToRead) return -1
            val b = super.read()
            if (b != -1) bytesRead++
            return b
        }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (bytesRead >= maxBytesToRead) return -1
            val maxCanRead = (maxBytesToRead - bytesRead).toInt()
            val toRead = minOf(len, maxCanRead)
            val read = super.read(b, off, toRead)
            if (read > 0) bytesRead += read
            return read
        }

        override fun available(): Int {
            val avail = super.available()
            val remaining = (maxBytesToRead - bytesRead).toInt()
            return minOf(avail, remaining)
        }
    }
}
