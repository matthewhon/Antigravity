# ──────────────────────────────────────────────────────────────────────────────
# Capacitor / Cordova bridge
# ──────────────────────────────────────────────────────────────────────────────
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * {
    @com.getcapacitor.PluginMethod <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
}
-keepclassmembers class * extends com.getcapacitor.Plugin {
    <init>();
}

# ──────────────────────────────────────────────────────────────────────────────
# WebView JavaScript interface
# ──────────────────────────────────────────────────────────────────────────────
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface

# ──────────────────────────────────────────────────────────────────────────────
# Preserve line numbers for readable crash stack traces
# ──────────────────────────────────────────────────────────────────────────────
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
