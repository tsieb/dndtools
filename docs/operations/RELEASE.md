# Desktop Release & Signing Guide

This document defines the release pipeline for signed desktop builds and how to manage signing credentials for Windows, macOS, and Linux artifacts.

## 1. Release Outputs

`electron-builder` produces:

- Windows: signed `NSIS` installer (`.exe`) with blockmap metadata for differential updates.
- macOS: signed + notarized `dmg` and `zip` artifacts.
- Linux: `AppImage` and `.deb` packages.
- Android: signed release APK (`app-release.apk`) from Gradle (`android/` project).

Artifacts are emitted to `dist-desktop/` by:

- `pnpm desktop:package:win`
- `pnpm desktop:package:mac`
- `pnpm desktop:package:linux`

## 2. Required Secrets (GitHub Actions)

Store these in repository secrets:

- `DNDTOOLS_CSC_LINK`: Base64/URL encoded signing certificate (`.p12`) for Windows/macOS.
- `DNDTOOLS_CSC_KEY_PASSWORD`: Certificate password.
- `DNDTOOLS_APPLE_ID`: Apple Developer account email (macOS notarization).
- `DNDTOOLS_APPLE_APP_SPECIFIC_PASSWORD`: App-specific password for notarization.
- `DNDTOOLS_APPLE_TEAM_ID`: Apple Developer Team ID.
- `RELEASE_SIGNING_PRIVATE_KEY`: PEM private key used to sign `SHA256SUMS.txt`.

The release workflow fails fast if required platform secrets are missing.

Android signing secrets:

- `DNDTOOLS_ANDROID_KEYSTORE_BASE64`
- `DNDTOOLS_ANDROID_KEYSTORE_PASSWORD`
- `DNDTOOLS_ANDROID_KEY_ALIAS`
- `DNDTOOLS_ANDROID_KEY_PASSWORD`

## 3. Windows Signing Policy

Preferred:

- EV code-signing certificate in hardware-backed storage.

Fallback:

- Organization certificate in `DNDTOOLS_CSC_LINK` for CI signing.
- For internal QA only, self-signed certificates may be used; publish installer trust instructions with each release:
  1. import the certificate into `Trusted Root Certification Authorities`
  2. verify thumbprint out-of-band
  3. run installer

Never commit certificates or private keys to the repository.

## 4. macOS Signing + Notarization

Requirements:

- Developer ID Application certificate in `DNDTOOLS_CSC_LINK`.
- Valid Apple notarization credentials (`DNDTOOLS_APPLE_*`).

Pipeline behavior:

- Sign app bundle.
- Submit for notarization.
- Staple notarization ticket to distributables.

If notarization fails, the release job must be treated as failed and artifacts must not be published.

## 5. Linux Packaging

Linux artifacts (`AppImage`, `.deb`) are produced in the same release job matrix.
These are not code-signed by default in this pipeline.

## 6. Local Verification Before Release

Run locally before opening release PRs:

```bash
pnpm check
pnpm desktop:build
pnpm desktop:smoke
```

Optional packaging dry-run:

```bash
pnpm desktop:package -- --dir
```

## 7. Release Workflow

Two workflows cooperate:

- **`.github/workflows/release-please.yml`** — listens for merged PRs and creates/updates a release PR using the conventional-commit log. When the release PR is merged, it creates a GitHub release tag.
- **`.github/workflows/release-assets.yml`** — triggers on the GitHub release tag. Builds and signs all platform artifacts, then uploads them to the release.

`release-assets.yml` behavior:

1. Validate release notes include `## Human Reviewed Notes`.
2. Build signed installers in OS matrix.
3. Build signed Android release APK.
4. Upload signed desktop + Android artifacts.
5. Build and sign `SHA256SUMS.txt`.
6. Upload all assets to the GitHub release tag.

## 8. Android Sideload Installation

For installing signed APKs directly on a device:

1. Download the signed APK from release assets (or copy local build output from `android/app/build/outputs/apk/release/app-release.apk`).
2. On Android, enable install permission for your installer app:
   - Android 13+: Settings → Apps → Special access → Install unknown apps.
3. Open the APK and confirm installation.

ADB alternative:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Local signed build:

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

### First-Run Vault Selection (Android)

1. Launch the app.
2. Open Settings → Vault.
3. Under "Android Vault Directory", set the desired relative root (default: `dndtools/vault`).
4. Save and restart the app.

Notes:

- Vault data is stored in app-private Android storage through Capacitor Filesystem.
- Desktop-only MCP sidecar and desktop runtime controls are unavailable on Android.

## 9. Rotation & Incident Response

Certificate/key rotation cadence:

- At least annually, or immediately after suspected compromise.

If compromise is suspected:

1. Revoke compromised certificate.
2. Rotate all related secrets in GitHub.
3. Rebuild and republish affected release artifacts.
4. Publish a security advisory with impacted version range and mitigation steps.
