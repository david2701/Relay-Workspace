package app.relay.data

interface AttentionRepository {
    suspend fun loadAttention(): InboxQueryResult
    suspend fun loadAgents(): List<Agent>
}

class RemoteAttentionRepository(
    private val client: RelayApiClient,
) : AttentionRepository {
    override suspend fun loadAttention(): InboxQueryResult = client.fetchAttention()
    override suspend fun loadAgents(): List<Agent> = client.fetchAgents()
}

class FakeAttentionRepository(
    private val result: InboxQueryResult,
    private val agents: List<Agent> = emptyList(),
) : AttentionRepository {
    override suspend fun loadAttention(): InboxQueryResult = result
    override suspend fun loadAgents(): List<Agent> = agents
}
