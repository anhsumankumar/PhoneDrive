package com.example.phonedrive.server

import fi.iki.elonen.NanoHTTPD.Response
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import java.io.ByteArrayInputStream

class HttpRangeHandlerTest {

    @Test
    fun testFullStreamWhenRangeHeaderMissing() {
        val content = "PhoneDrive streaming content test 1234567890".toByteArray(Charsets.UTF_8)
        val stream = ByteArrayInputStream(content)

        val response = HttpRangeHandler.buildStreamingResponse(
            inputStream = stream,
            totalLength = content.size.toLong(),
            mimeType = "text/plain",
            rangeHeader = null
        )

        assertEquals(Response.Status.OK, response.status)
        assertEquals("bytes", response.getHeader("Accept-Ranges"))
        assertEquals(content.size.toString(), response.getHeader("Content-Length"))
    }

    @Test
    fun testPartialContentRangeHeader() {
        val content = "0123456789abcdefghij".toByteArray(Charsets.UTF_8)
        val stream = ByteArrayInputStream(content)

        // Request bytes=5-9 (5 bytes: 5,6,7,8,9)
        val response = HttpRangeHandler.buildStreamingResponse(
            inputStream = stream,
            totalLength = content.size.toLong(),
            mimeType = "text/plain",
            rangeHeader = "bytes=5-9"
        )

        assertEquals(Response.Status.PARTIAL_CONTENT, response.status)
        assertEquals("bytes 5-9/20", response.getHeader("Content-Range"))
        assertEquals("5", response.getHeader("Content-Length"))
        assertEquals("bytes", response.getHeader("Accept-Ranges"))

        // Verify data stream
        val readBytes = ByteArray(5)
        response.data.read(readBytes)
        assertEquals("56789", String(readBytes, Charsets.UTF_8))
    }

    @Test
    fun testPartialContentOpenEndedRange() {
        val content = "0123456789abcdefghij".toByteArray(Charsets.UTF_8)
        val stream = ByteArrayInputStream(content)

        // Request bytes=10- (from 10 to end: 10 bytes: 'abcdefghij')
        val response = HttpRangeHandler.buildStreamingResponse(
            inputStream = stream,
            totalLength = content.size.toLong(),
            mimeType = "text/plain",
            rangeHeader = "bytes=10-"
        )

        assertEquals(Response.Status.PARTIAL_CONTENT, response.status)
        assertEquals("bytes 10-19/20", response.getHeader("Content-Range"))
        assertEquals("10", response.getHeader("Content-Length"))

        val readBytes = ByteArray(10)
        response.data.read(readBytes)
        assertEquals("abcdefghij", String(readBytes, Charsets.UTF_8))
    }

    @Test
    fun testRangeNotSatisfiable() {
        val content = "12345".toByteArray(Charsets.UTF_8)
        val stream = ByteArrayInputStream(content)

        // Range out of bounds
        val response = HttpRangeHandler.buildStreamingResponse(
            inputStream = stream,
            totalLength = content.size.toLong(),
            mimeType = "text/plain",
            rangeHeader = "bytes=10-20"
        )

        assertEquals(Response.Status.RANGE_NOT_SATISFIABLE, response.status)
        assertEquals("bytes */5", response.getHeader("Content-Range"))
    }
}
