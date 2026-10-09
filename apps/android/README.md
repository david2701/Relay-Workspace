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

Screenshot (Roborazzi, JVM — no emulator/KVM required):

```bash
./gradlew :app:recordRoborazziDebug
# PNGs under app/src/test/screenshots/
```

## API base URL

Default for emulator: `http://10.0.2.2:7420` (`BuildConfig.DEFAULT_API_BASE_URL`).
Override with JVM system property `relay.apiBaseUrl` for tests.

No auth tokens yet — URL is a preference, not a vault secret. Future credentials → EncryptedSharedPreferences.

## Design

Tokens from ui-spec-v0.3 §9.5 (yellow `#F8ED60` fill + ochres; r8 selected row = raised + 1 px control border).
Atención screen follows Android home renders (A+C yellow direction).
