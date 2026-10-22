# ==============================================================================
# PhoneDrive ProGuard & R8 Optimization Rules for Production Release
# ==============================================================================

# 1. NanoHTTPD Embedded Web Server
-keep class fi.iki.elonen.** { *; }
-dontwarn fi.iki.elonen.**

# 2. AndroidX Media3 (Transformer, Effects, Common, Codecs)
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# 3. ZXing QR Code Engine
-keep class com.google.zxing.** { *; }
-dontwarn com.google.zxing.**

# 4. PhoneDrive Data Models & SQLite Serializables
-keep class com.example.phonedrive.data.model.** { *; }
-keepclassmembers class com.example.phonedrive.data.model.** { *; }

# 5. Background Server Service
-keep class com.example.phonedrive.service.PhoneDriveServerService { *; }
-keep class com.example.phonedrive.server.** { *; }

# 6. Compose Runtime & UI
-keep class androidx.compose.** { *; }
-dontwarn androidx.compose.**

# 7. Kotlin Reflection & Coroutines
-keepclassmembers class * extends kotlin.coroutines.jvm.internal.ContinuationImpl { *; }
