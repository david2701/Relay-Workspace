package app.relay.data

interface AttentionRepository {
    suspend fun loadAttention(): InboxQueryResult
}

class RemoteAttentionRepository(
    private val client: RelayApiClient,
) : AttentionRepository {
    override suspend fun loadAttention(): InboxQueryResult = client.fetchAttention()
}

class FakeAttentionRepository(
    private val result: InboxQueryResult,
) : AttentionRepository {
    override suspend fun loadAttention(): InboxQueryResult = result
}
