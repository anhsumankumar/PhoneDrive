package com.example.phonedrive.server

import android.content.Context
import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoHTTPD.Response
import java.io.InputStream

class WebAssetHandler(private val context: Context) {

    fun serveAsset(uri: String): Response? {
        val cleanPath = when {
            uri == "/" || uri.isEmpty() || uri == "/index.html" -> "index.html"
            uri.startsWith("/") -> uri.substring(1)
            else -> uri
        }

        // Try exact path in assets/web/
        val assetPath = "web/$cleanPath"
        var mimeType = getMimeType(cleanPath)

        val stream: InputStream? = try {
            context.assets.open(assetPath)
        } catch (e: Exception) {
            // If asset not found and not an API call, fallback to index.html for SPA dynamic routing
            if (!cleanPath.startsWith("api/") && !cleanPath.contains(".")) {
                try {
                    mimeType = "text/html; charset=UTF-8"
                    context.assets.open("web/index.html")
                } catch (ex: Exception) {
                    null
                }
            } else {
                null
            }
        }

        if (stream != null) {
            val response = NanoHTTPD.newChunkedResponse(Response.Status.OK, mimeType, stream)
            if (cleanPath.startsWith("assets/")) {
                response.addHeader("Cache-Control", "public, max-age=31536000, immutable")
            } else {
                response.addHeader("Cache-Control", "no-cache, no-store, must-revalidate")
            }
            return response
        }

        return null
    }

    private fun getMimeType(path: String): String {
        return when {
            path.endsWith(".html") -> "text/html; charset=UTF-8"
            path.endsWith(".js") -> "application/javascript; charset=UTF-8"
            path.endsWith(".css") -> "text/css; charset=UTF-8"
            path.endsWith(".svg") -> "image/svg+xml"
            path.endsWith(".png") -> "image/png"
            path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
            path.endsWith(".ico") -> "image/x-icon"
            path.endsWith(".json") -> "application/json; charset=UTF-8"
            path.endsWith(".woff2") -> "font/woff2"
            path.endsWith(".woff") -> "font/woff"
            path.endsWith(".ttf") -> "font/ttf"
            else -> "application/octet-stream"
        }
    }
}
