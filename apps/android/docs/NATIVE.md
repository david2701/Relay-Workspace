# Android native notes

## Toolchain

- AGP 9.4.0 (built-in Kotlin — do **not** apply `org.jetbrains.kotlin.android`)
- Kotlin 2.4.20 · Gradle 9.6.0 · JDK 17 · Compose BOM 2026.02.01 · minSdk 26

## Screenshots

Recorded with **Roborazzi** on the JVM (Robolectric `GraphicsMode.NATIVE`). No emulator/KVM on the Linux agent.

```bash
./gradlew :app:testDebugUnitTest --tests 'app.relay.ui.attention.AttentionScreenshotTest'
# PNGs: app/src/test/screenshots/
```

## Security

No auth tokens in this foundation. API base URL defaults to `http://10.0.2.2:7420` (emulator → host). Override with system property `relay.apiBaseUrl`. Future credentials → EncryptedSharedPreferences (not plaintext SharedPreferences).
