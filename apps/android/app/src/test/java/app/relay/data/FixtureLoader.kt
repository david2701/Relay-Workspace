package app.relay.data

object FixtureLoader {
    fun read(name: String): String {
        val stream = checkNotNull(
            javaClass.classLoader?.getResourceAsStream("fixtures/$name"),
        ) { "Missing fixture fixtures/$name" }
        return stream.bufferedReader().use { it.readText() }
    }
}
