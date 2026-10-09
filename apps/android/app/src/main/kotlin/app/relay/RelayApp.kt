package app.relay

import android.app.Application
import app.relay.data.AttentionRepository
import app.relay.data.RelayApiClient
import app.relay.data.RemoteAttentionRepository

class RelayApp : Application() {
    lateinit var apiClient: RelayApiClient
        private set
    lateinit var attentionRepository: AttentionRepository
        private set

    override fun onCreate() {
        super.onCreate()
        val baseUrl = resolveBaseUrl()
        apiClient = RelayApiClient(baseUrl)
        attentionRepository = RemoteAttentionRepository(apiClient)
    }

    /**
     * Configurable API URL: `relay.apiBaseUrl` system/meta property, else BuildConfig.
     * Emulator → host loopback is `http://10.0.2.2:7420`.
     * Not a secret; EncryptedSharedPreferences reserved for future auth tokens
     * (apple-on-device-ai-and-vault-security / platform equivalent).
     */
    private fun resolveBaseUrl(): String {
        val fromProp = System.getProperty("relay.apiBaseUrl")
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
        return fromProp ?: BuildConfig.DEFAULT_API_BASE_URL
    }
}
