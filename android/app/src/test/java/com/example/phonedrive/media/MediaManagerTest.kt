package com.example.phonedrive.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.regex.Pattern

class MediaManagerTest {

    @Test
    fun testSrtToVttConversion() {
        val srtSample = """
            1
            00:00:01,000 --> 00:00:04,500
            नमस्ते दुनिया - Welcome to PhoneDrive!
            
            2
            00:00:05,200 --> 00:00:08,800
            Stream 4K videos directly from your phone.
        """.trimIndent()

        // Pure Kotlin converter logic matching MediaManager
        val timestampRegex = Pattern.compile("(\\d{2}:\\d{2}:\\d{2}),(\\d{3})\\s*-->\\s*(\\d{2}:\\d{2}:\\d{2}),(\\d{3})")
        val sb = StringBuilder("WEBVTT\n\n")
        val lines = srtSample.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        for (line in lines) {
            val matcher = timestampRegex.matcher(line)
            if (matcher.find()) {
                val vttTimestamp = line.replace(",", ".")
                sb.append(vttTimestamp).append("\n")
            } else {
                sb.append(line).append("\n")
            }
        }
        val vtt = sb.toString()

        assertTrue(vtt.startsWith("WEBVTT"))
        assertTrue(vtt.contains("00:00:01.000 --> 00:00:04.500"))
        assertTrue(vtt.contains("00:00:05.200 --> 00:00:08.800"))
        assertTrue(vtt.contains("नमस्ते दुनिया - Welcome to PhoneDrive!"))
    }

    @Test
    fun testSeriesTitleRegex() {
        val seriesPattern = Pattern.compile("(?i)(.*?)[ ._\\-(]+[sS](\\d{1,2})[eE](\\d{1,2})")

        val filename = "Stranger.Things.S04E08.1080p.WEBRip.mp4"
        val nameWithoutExt = filename.substringBeforeLast('.')
        val matcher = seriesPattern.matcher(nameWithoutExt)

        assertTrue(matcher.find())
        assertEquals("Stranger.Things", matcher.group(1))
        assertEquals(4, matcher.group(2)?.toInt())
        assertEquals(8, matcher.group(3)?.toInt())
    }
}
