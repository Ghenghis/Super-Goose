# Goose AI Android - ProGuard Rules

# Keep Retrofit interfaces
-keepattributes Signature
-keepattributes Exceptions
-keep class com.block.goose.GooseClient { *; }
-keep class com.block.goose.ChatResponse { *; }

# Keep Gson serialization
-keepclassmembers,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Keep libsu (root)
-keep class com.topjohnwu.superuser.** { *; }

# Keep Compose
-keep class androidx.compose.** { *; }
