# Goose AI — Mobile Clients

Android and iOS clients for the Goose AI agent platform. Connects to your desktop `goosed` server via Lapstone secure tunnel.

## Android App

**Target Devices:**
- Samsung Galaxy S21 Ultra (12GB, Snapdragon, Android 14)
- Samsung Galaxy Tab S9+ (12GB, Snapdragon, Android 15, **Rooted** — NinjaSU/KernelSU)

### Quick Start

```bash
# From the goose root directory:

# 1. Build and install debug APK to connected USB device
just install-android-debug

# 2. Or deploy over WiFi to rooted Tab S9+ (enable ADB WiFi from Root Tools in app)
just deploy-android 192.168.1.XXX
```

### Requirements

- **Android SDK** with API 35
- **JDK 17+**
- **Gradle 8.7+** (or generate wrapper: `cd ui/mobile/android && gradle wrapper`)
- **ADB** in PATH
- Device connected via USB or WiFi ADB

### First-Time Setup

```bash
# Generate Gradle wrapper (one-time, requires Gradle installed)
cd ui/mobile/android
gradle wrapper --gradle-version 8.7

# Or if you have an existing Gradle installation:
# The wrapper files (gradlew, gradlew.bat, gradle/) will be created
```

### Root Features (Tab S9+)

The app detects root access (KernelSU/NinjaSU/Magisk) and provides:

| Feature            | Description                                               |
| ------------------ | --------------------------------------------------------- |
| **ADB WiFi**       | Enable wireless debugging without PC — `setprop` via root |
| **Silent Install** | Push APK updates with `pm install`, no prompts            |
| **File Browser**   | Read/write any path on device for artifact testing        |
| **CPU Governor**   | Set Snapdragon to performance mode for benchmarks         |
| **Screen Capture** | Root-level screenshots for automated testing              |

### Project Structure

```
ui/mobile/android/
├── app/
│   ├── build.gradle.kts          # Dependencies: Compose, OkHttp, libsu, CameraX
│   ├── proguard-rules.pro
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/block/goose/
│       │   ├── GooseApp.kt       # Application class
│       │   ├── GooseClient.kt    # HTTP client — goosed + Conscious APIs
│       │   ├── MainActivity.kt   # Compose entry point
│       │   ├── root/
│       │   │   └── RootHelper.kt # libsu root utilities (KernelSU/NinjaSU)
│       │   └── ui/
│       │       ├── GooseNavHost.kt
│       │       ├── theme/Theme.kt
│       │       └── screens/
│       │           ├── ChatScreen.kt      # Main chat with goosed
│       │           ├── SettingsScreen.kt   # Tunnel config + connection test
│       │           └── RootToolsScreen.kt  # ADB WiFi, CPU, file browser
│       └── res/
│           └── values/
│               ├── strings.xml
│               └── themes.xml
├── build.gradle.kts              # Root build — AGP + Kotlin plugin versions
├── settings.gradle.kts
├── gradle.properties
└── gradle/wrapper/               # Gradle wrapper (generate with `gradle wrapper`)
```

### API Endpoints Used

**goosed (port 7878):**
- `POST /api/reply` — Send chat messages
- `GET /api/status` — Health check

**Conscious Voice API (port 8999):**
- `GET /api/voice/status` — Voice engine status
- `GET /api/emotion/status` — Emotion detection status
- `GET /api/personality/status` — Active personality
- `POST /api/personality/switch` — Switch personality
- `GET /api/personality/list` — Available personalities
- `GET /api/memory/status` — Conversation history
- `POST /api/creator/create` — AI-generate artifacts from chat

### Deploying to Tab S9+ (Rooted)

1. **First time**: Connect via USB, install debug APK
2. **Open app** → Root Tools → Enable ADB WiFi
3. **Note the IP** shown in the app
4. **From PC**: `just deploy-android <IP>` for wireless deploys
5. **In app**: Settings → Enter your Lapstone tunnel URL → Test Connection

## iOS App

The iOS app ("goose AI") is available on the [App Store](https://apps.apple.com/app/goose-ai/id6752889295). It connects to goose Desktop via Lapstone tunnel — see [Mobile Access docs](https://block.github.io/goose/docs/experimental/mobile-access).

## Justfile Commands

| Command                      | Description                                 |
| ---------------------------- | ------------------------------------------- |
| `just init-mobile`           | Initialize goose-mobile git submodule       |
| `just build-android`         | Build release APK                           |
| `just build-ios`             | Build iOS archive (macOS + Xcode required)  |
| `just install-android-debug` | Build + install debug APK to USB device     |
| `just adb-connect <IP>`      | Connect to device over WiFi ADB             |
| `just deploy-android <IP>`   | WiFi connect + build + install + launch     |
| `just release-all`           | Build all platforms (desktop + mobile init) |
