# Android native notes

## Toolchain

- AGP 9.4.0 (built-in Kotlin — do **not** apply `org.jetbrains.kotlin.android`)
- Kotlin 2.4.20 · Gradle 9.6.0 · JDK 17 · Compose BOM 2026.02.01 · minSdk 26

## Screenshots

Recorded with **Roborazzi** on the JVM (Robolectric `GraphicsMode.NATIVE`). No emulator/KVM on the Linux agent.

```bash
./gradlew :app:testDebugUnitTest -Droborazzi.test.record=true \
  --tests 'app.relay.ui.attention.AttentionScreenshotTest'
# PNGs: app/src/test/screenshots/ (360 / 411 / 600 / 840 dp, light & dark;
# Attention list, detail (incl. 411), `_end` with 24 items)
# Verify: -Droborazzi.test.verify=true -Droborazzi.test.record=false
# No recordRoborazziDebug / verifyRoborazziDebug tasks — Roborazzi AGP plugin is not applied.
```

## Adaptive layout

- `NavigationSuiteScaffold`: bottom bar &lt; 600 dp, rail at 600+ (Penpot expanded keeps rail).
- `NavigableListDetailPaneScaffold`: single pane on compact/medium; list + detail at ≥ 840 dp.
- Detail pane: bottom app bar (Asignar / Nota / Aviso). Blocked reason: `maxLines = 1` + ellipsis.
- FAB clearance: list bottom padding = FAB height + 16 dp on compact (rail FAB does not overlay list).

## Security

No auth tokens in this foundation. API base URL defaults to `http://10.0.2.2:7420` (emulator → host). Override with system property `relay.apiBaseUrl`. Future credentials → EncryptedSharedPreferences (not plaintext SharedPreferences).
