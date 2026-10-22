package com.example.phonedrive.ui.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.example.phonedrive.R
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.util.EnumMap

object QRCodeGenerator {

    /**
     * Generates a custom-branded QR Code with:
     * 1. Lighter, vibrant Sky-Blue to Ocean-Blue gradient (perfect balance: not dark/navy, not faded).
     * 2. Smooth, perfectly rounded circular cutout in the center (NO sharp 90-degree corners).
     * 3. Direct transparent 3D Cloud icon.png in center floating on a silky smooth white circle.
     * 4. ErrorCorrectionLevel.H for guaranteed instant scanning.
     */
    fun generateQrBitmap(context: Context? = null, content: String, size: Int = 512): ImageBitmap? {
        if (content.isEmpty()) return null
        return try {
            val hints = EnumMap<EncodeHintType, Any>(EncodeHintType::class.java).apply {
                put(EncodeHintType.MARGIN, 1)
                put(EncodeHintType.CHARACTER_SET, "UTF-8")
                put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.H)
            }

            val writer = QRCodeWriter()
            val bitMatrix = writer.encode(content, BarcodeFormat.QR_CODE, size, size, hints)
            val matrixWidth = bitMatrix.width
            val matrixHeight = bitMatrix.height

            val outputBitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(outputBitmap)

            // Fill pure white background
            val bgPaint = Paint().apply {
                color = Color.WHITE
                style = Paint.Style.FILL
                isAntiAlias = true
            }
            canvas.drawRect(0f, 0f, size.toFloat(), size.toFloat(), bgPaint)

            // Vibrant, moderately light & luminous gradient (Sky-Blue #0EA5E9 -> Ocean-Blue #0284C7 -> Royal Blue #2563EB)
            val gradientShader = LinearGradient(
                0f, 0f, size.toFloat(), size.toFloat(),
                intArrayOf(
                    Color.parseColor("#0EA5E9"), // Bright Sky Blue
                    Color.parseColor("#0284C7"), // Ocean Blue
                    Color.parseColor("#2563EB")  // Rich Royal Blue
                ),
                floatArrayOf(0f, 0.45f, 1f),
                Shader.TileMode.CLAMP
            )

            val modulePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                shader = gradientShader
                style = Paint.Style.FILL
            }

            val moduleSize = size.toFloat() / matrixWidth

            // Center safe zone: Perfectly rounded circle (no sharp corners!)
            val logoFraction = 0.23f
            val centerModuleX = matrixWidth / 2f
            val centerModuleY = matrixHeight / 2f
            val clearRadiusInModules = (matrixWidth * logoFraction / 2f) + 0.6f

            // Function to check if a matrix position belongs to one of the 3 Finder Pattern eyes (7x7)
            fun isFinderEye(mx: Int, my: Int): Boolean {
                val inTopLeft = mx in 0..6 && my in 0..6
                val inTopRight = mx in (matrixWidth - 7) until matrixWidth && my in 0..6
                val inBottomLeft = mx in 0..6 && my in (matrixHeight - 7) until matrixHeight
                return inTopLeft || inTopRight || inBottomLeft
            }

            // Draw data modules with smooth circular center clearing
            for (mx in 0 until matrixWidth) {
                for (my in 0 until matrixHeight) {
                    if (isFinderEye(mx, my)) continue

                    // Smooth circular clearing: checks Euclidean distance so QR dots wrap in a soft circle
                    val dx = (mx + 0.5f) - centerModuleX
                    val dy = (my + 0.5f) - centerModuleY
                    val dist = Math.hypot(dx.toDouble(), dy.toDouble()).toFloat()
                    if (dist <= clearRadiusInModules) continue

                    if (bitMatrix.get(mx, my)) {
                        val left = mx * moduleSize
                        val top = my * moduleSize
                        val right = left + moduleSize
                        val bottom = top + moduleSize

                        val dotPadding = moduleSize * 0.06f
                        val roundRadius = moduleSize * 0.32f
                        val rect = RectF(
                            left + dotPadding,
                            top + dotPadding,
                            right - dotPadding,
                            bottom - dotPadding
                        )
                        canvas.drawRoundRect(rect, roundRadius, roundRadius, modulePaint)
                    }
                }
            }

            // Draw modern, sleek Finder Pattern eyes
            fun drawFinderEye(startX: Int, startY: Int) {
                val left = startX * moduleSize
                val top = startY * moduleSize
                val eyeSize = 7 * moduleSize
                val right = left + eyeSize
                val bottom = top + eyeSize

                // Outer rounded rectangle
                val outerRect = RectF(left + 2f, top + 2f, right - 2f, bottom - 2f)
                val outerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    shader = gradientShader
                    style = Paint.Style.STROKE
                    strokeWidth = moduleSize
                }
                val outerRadius = moduleSize * 1.5f
                canvas.drawRoundRect(outerRect, outerRadius, outerRadius, outerPaint)

                // Inner solid rounded core (3x3 modules)
                val innerLeft = left + 2 * moduleSize
                val innerTop = top + 2 * moduleSize
                val innerRight = right - 2 * moduleSize
                val innerBottom = bottom - 2 * moduleSize
                val innerRect = RectF(innerLeft + 0.5f, innerTop + 0.5f, innerRight - 0.5f, innerBottom - 0.5f)
                val innerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    shader = gradientShader
                    style = Paint.Style.FILL
                }
                val innerRadius = moduleSize * 1.0f
                canvas.drawRoundRect(innerRect, innerRadius, innerRadius, innerPaint)
            }

            drawFinderEye(0, 0)
            drawFinderEye(matrixWidth - 7, 0)
            drawFinderEye(0, matrixHeight - 7)

            // Draw Center Direct icon.png on smooth, rounded white circle
            if (context != null) {
                val cx = size / 2f
                val cy = size / 2f
                val circleRadius = clearRadiusInModules * moduleSize

                // Perfectly round, smooth white backdrop with subtle anti-aliased edge
                val whiteBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.WHITE
                    style = Paint.Style.FILL
                }
                canvas.drawCircle(cx, cy, circleRadius + 1f, whiteBgPaint)

                // Decode icon.png directly
                val logoBitmap = try {
                    context.assets.open("web/icon.png").use { stream ->
                        BitmapFactory.decodeStream(stream)
                    }
                } catch (e: Exception) {
                    try {
                        BitmapFactory.decodeResource(context.resources, R.drawable.app_icon)
                    } catch (e2: Exception) {
                        null
                    }
                }

                if (logoBitmap != null) {
                    // Position icon comfortably inside the round white area
                    val iconRadius = circleRadius * 0.85f
                    val iconHalfW = iconRadius
                    val iconHalfH = iconRadius * 0.88f // Aspect ratio of cloud
                    val iconDestRect = RectF(
                        cx - iconHalfW,
                        cy - iconHalfH,
                        cx + iconHalfW,
                        cy + iconHalfH
                    )

                    val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
                    val srcRect = Rect(0, 0, logoBitmap.width, logoBitmap.height)
                    canvas.drawBitmap(logoBitmap, srcRect, iconDestRect, iconPaint)
                }
            }

            outputBitmap.asImageBitmap()
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
}
