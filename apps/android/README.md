# Relay Android (Jetpack Compose + Material 3)

Native Android client. Talks to `apps/server` over HTTP (`/api/inbox?view=attention`, etc.).
No WebView / Capacitor.

## Requirements

- JDK 17+
- Android SDK (compileSdk 36)
- Gradle wrapper in this directory

```bash
export ANDROID_HOME=~/Android/Sdk   # or your SDK path
echo "sdk.dir=$ANDROID_HOME" > local.properties
```

## Build / test / lint

```bash
cd apps/android
./gradlew :app:assembleDebug
./gradlew :app:lintDebug
./gradlew :app:testDebugUnitTest
```

Screenshot (Roborazzi, JVM — no emulator/KVM required). The Roborazzi **Gradle plugin is not applied** (AGP 9); recording is driven by the unit-test system property already set in `app/build.gradle.kts`:

```bash
./gradlew :app:testDebugUnitTest -Droborazzi.test.record=true
# PNGs under app/src/test/screenshots/
# Widths: 360 / 600 / 840 (light & dark) — Attention, detail, and `_end` (24-item list)
# Verify mode (compare against recorded goldens):
./gradlew :app:testDebugUnitTest -Droborazzi.test.verify=true -Droborazzi.test.record=false
```

There are no `recordRoborazziDebug` / `verifyRoborazziDebug` AGP-plugin tasks in this project
(Roborazzi AGP plugin is not applied under AGP 9). Use the system properties above.

## API base URL

Default for emulator: `http://10.0.2.2:7420` (`BuildConfig.DEFAULT_API_BASE_URL`).
Override with JVM system property `relay.apiBaseUrl` for tests.

No auth tokens yet — URL is a preference, not a vault secret. Future credentials → EncryptedSharedPreferences.

## Design

Tokens from ui-spec-v0.3 §9.5 (yellow `#F8ED60` fill + ochres; r8 selected row = raised + 1 px control border; dark selected has no shadow; light `--shadow-float` is two layers).
`AttentionList` bottom content padding = FAB height + edge margin on top of Scaffold `innerPadding` (no double-counting of nav/gesture insets).
Atención screen follows Android home renders (A+C yellow direction).
