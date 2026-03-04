# Android Sideload Guide

This guide covers signed APK generation, device installation, and first-run
vault setup for Android builds.

## 1. CI Signing Setup

Configure these GitHub secrets:

- `DNDTOOLS_ANDROID_KEYSTORE_BASE64`
  : base64-encoded release keystore (`.jks`)
- `DNDTOOLS_ANDROID_KEYSTORE_PASSWORD`
- `DNDTOOLS_ANDROID_KEY_ALIAS`
- `DNDTOOLS_ANDROID_KEY_PASSWORD`

Release workflow:

- File: `.github/workflows/release-assets.yml`
- Job: `build-android-apk`
- Output artifact: `signed-android-apk` (`*.apk`)

## 2. Local Signed Build (Optional)

1. Create `android/keystore.properties`:

```properties
storeFile=app/dndtools-release.jks
storePassword=<store-password>
keyAlias=<key-alias>
keyPassword=<key-password>
```

2. Place keystore at `android/app/dndtools-release.jks`.
3. Run:

```bash
pnpm android:sync
cd android
./gradlew assembleRelease
```

APK output:

- `android/app/build/outputs/apk/release/app-release.apk`

## 3. Install on Device

1. Download the signed APK from release assets (or copy local build output).
2. On Android, enable install permission for your installer app:
   - Android 13+: Settings -> Apps -> Special access -> Install unknown apps.
3. Open the APK and confirm installation.

ADB alternative:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

## 4. First-Run Vault Selection

1. Launch the app.
2. Open Settings -> Vault.
3. Under "Android Vault Directory", set the desired relative root (default:
   `dndtools/vault`).
4. Save and restart the app to apply the new vault root.

Notes:

- Vault data is stored in app-private Android storage through Capacitor
  Filesystem.
- Desktop-only MCP sidecar and desktop runtime controls are unavailable on
  Android.
