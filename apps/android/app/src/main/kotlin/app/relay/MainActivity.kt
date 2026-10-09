package app.relay

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.lifecycle.viewmodel.compose.viewModel
import app.relay.data.AttentionRepository
import app.relay.theme.RelayTheme
import app.relay.ui.attention.AttentionRoute
import app.relay.ui.attention.AttentionViewModel

val LocalAttentionRepository = staticCompositionLocalOf<AttentionRepository> {
    error("AttentionRepository not provided")
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as RelayApp
        setContent {
            RelayTheme {
                CompositionLocalProvider(
                    LocalAttentionRepository provides app.attentionRepository,
                ) {
                    val vm: AttentionViewModel = viewModel(
                        factory = AttentionViewModel.factory(LocalAttentionRepository.current),
                    )
                    AttentionRoute(viewModel = vm)
                }
            }
        }
    }
}
