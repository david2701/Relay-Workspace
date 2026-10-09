package app.relay.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit

class RelayApiException(
    message: String,
    cause: Throwable? = null,
) : IOException(message, cause)

/**
 * HTTP client for apps/server /api routes.
 * Base URL is injectable (BuildConfig / settings). No auth tokens in this foundation;
 * when credentials exist, store them in EncryptedSharedPreferences — not plaintext prefs.
 */
class RelayApiClient(
    baseUrl: String,
    private val client: OkHttpClient = defaultClient(),
    private val json: Json = defaultJson(),
) {
    private val root = baseUrl.trimEnd('/').toHttpUrl()

    suspend fun health(): HealthResponse = get("/api/health")

    suspend fun fetchAttention(): InboxQueryResult =
        get("/api/inbox", mapOf("view" to "attention"))

    suspend fun fetchItem(id: String): WorkItem {
        val envelope: ItemEnvelope = get("/api/items/$id")
        return envelope.item
    }

    suspend fun fetchItems(): List<WorkItem> {
        val envelope: ItemsEnvelope = get("/api/items")
        return envelope.items
    }

    suspend fun fetchAgents(): List<Agent> {
        val envelope: AgentsEnvelope = get("/api/agents")
        return envelope.agents
    }

    fun decodeInbox(raw: String): InboxQueryResult =
        json.decodeFromString(InboxQueryResult.serializer(), raw)

    fun decodeItemEnvelope(raw: String): ItemEnvelope =
        json.decodeFromString(ItemEnvelope.serializer(), raw)

    fun decodeItemsEnvelope(raw: String): ItemsEnvelope =
        json.decodeFromString(ItemsEnvelope.serializer(), raw)

    private suspend inline fun <reified T> get(
        path: String,
        query: Map<String, String> = emptyMap(),
    ): T = withContext(Dispatchers.IO) {
        val urlBuilder = root.newBuilder()
        path.trim('/').split('/').forEach { segment ->
            urlBuilder.addPathSegment(segment)
        }
        query.forEach { (key, value) ->
            urlBuilder.addQueryParameter(key, value)
        }
        val request = Request.Builder()
            .url(urlBuilder.build())
            .get()
            .header("Accept", "application/json")
            .build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw RelayApiException("HTTP ${response.code}: $body")
            }
            try {
                json.decodeFromString(serializer<T>(), body)
            } catch (err: Exception) {
                throw RelayApiException("Decode failed for $path", err)
            }
        }
    }

    companion object {
        fun defaultJson(): Json = Json {
            ignoreUnknownKeys = true
            isLenient = false
        }

        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .build()
    }
}
