package com.block.goose

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

private val Context.dataStore by preferencesDataStore(name = "goose_settings")

class GooseClient(private val context: Context) {

    private val gson = Gson()
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val TUNNEL_URL_KEY = stringPreferencesKey("tunnel_url")
    private val TUNNEL_SECRET_KEY = stringPreferencesKey("tunnel_secret")

    var tunnelUrl: String = ""
        private set

    var isConnected: Boolean = false
        private set

    suspend fun configureTunnel(url: String, secret: String) {
        tunnelUrl = url.trimEnd('/')
        context.dataStore.edit { prefs ->
            prefs[TUNNEL_URL_KEY] = url
            prefs[TUNNEL_SECRET_KEY] = secret
        }
    }

    suspend fun loadSavedConfig(): Boolean {
        val prefs = context.dataStore.data.first()
        val url = prefs[TUNNEL_URL_KEY] ?: return false
        val secret = prefs[TUNNEL_SECRET_KEY] ?: return false
        tunnelUrl = url.trimEnd('/')
        return tunnelUrl.isNotEmpty()
    }

    // ─── Goosed API Calls ──────────────────────────────────────────

    suspend fun sendChat(message: String): Result<ChatResponse> = apiPost(
        "/reply",
        mapOf("messages" to listOf(mapOf("role" to "user", "content" to message)))
    )

    suspend fun getStatus(): Result<Map<String, Any>> = apiGet("/status")

    // ─── Conscious Voice API Calls ─────────────────────────────────

    suspend fun getVoiceStatus(): Result<Map<String, Any>> = apiGet(
        "/api/voice/status", port = 8999
    )

    suspend fun getEmotionStatus(): Result<Map<String, Any>> = apiGet(
        "/api/emotion/status", port = 8999
    )

    suspend fun getPersonalityStatus(): Result<Map<String, Any>> = apiGet(
        "/api/personality/status", port = 8999
    )

    suspend fun switchPersonality(name: String): Result<Map<String, Any>> = apiPost(
        "/api/personality/switch", mapOf("name" to name), port = 8999
    )

    suspend fun listPersonalities(): Result<Map<String, Any>> = apiGet(
        "/api/personality/list", port = 8999
    )

    suspend fun getMemoryStatus(): Result<Map<String, Any>> = apiGet(
        "/api/memory/status", port = 8999
    )

    suspend fun createArtifact(text: String): Result<Map<String, Any>> = apiPost(
        "/api/creator/create", mapOf("text" to text), port = 8999
    )

    // ─── Health Check ──────────────────────────────────────────────

    suspend fun healthCheck(): Boolean {
        return try {
            val result = getStatus()
            isConnected = result.isSuccess
            isConnected
        } catch (e: Exception) {
            isConnected = false
            false
        }
    }

    // ─── Internal HTTP Helpers ──────────────────────────────────────

    private suspend inline fun <reified T> apiGet(
        path: String,
        port: Int = 7878
    ): Result<T> = withContext(Dispatchers.IO) {
        try {
            val url = buildUrl(path, port)
            val request = Request.Builder().url(url).get().build()
            val response = client.newCall(request).execute()
            parseResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend inline fun <reified T> apiPost(
        path: String,
        body: Any,
        port: Int = 7878
    ): Result<T> = withContext(Dispatchers.IO) {
        try {
            val url = buildUrl(path, port)
            val json = gson.toJson(body)
            val requestBody = json.toRequestBody(jsonMedia)
            val request = Request.Builder().url(url).post(requestBody).build()
            val response = client.newCall(request).execute()
            parseResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun buildUrl(path: String, port: Int): String {
        return if (tunnelUrl.isNotEmpty()) {
            "$tunnelUrl$path"
        } else {
            "http://localhost:$port$path"
        }
    }

    private inline fun <reified T> parseResponse(response: Response): Result<T> {
        val body = response.body?.string() ?: return Result.failure(IOException("Empty response"))
        return if (response.isSuccessful) {
            val type = object : TypeToken<T>() {}.type
            Result.success(gson.fromJson(body, type))
        } else {
            Result.failure(IOException("HTTP ${response.code}: $body"))
        }
    }
}

data class ChatResponse(
    val content: String = "",
    val role: String = "assistant"
)
