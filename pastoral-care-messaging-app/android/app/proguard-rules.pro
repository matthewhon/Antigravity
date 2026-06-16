# ──────────────────────────────────────────────────────────────────────────────
# Capacitor / Cordova bridge
# ──────────────────────────────────────────────────────────────────────────────
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class com.barnabassoftware.pcmessaging.** { *; }

# ──────────────────────────────────────────────────────────────────────────────
# Firebase & Google Play Services
# ──────────────────────────────────────────────────────────────────────────────
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ──────────────────────────────────────────────────────────────────────────────
# WebView JavaScript interface
# ──────────────────────────────────────────────────────────────────────────────
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface

# ──────────────────────────────────────────────────────────────────────────────
# AndroidX / AppCompat
# ──────────────────────────────────────────────────────────────────────────────
-keep class androidx.** { *; }
-dontwarn androidx.**

# ──────────────────────────────────────────────────────────────────────────────
# Preserve line numbers for readable crash stack traces
# ──────────────────────────────────────────────────────────────────────────────
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
