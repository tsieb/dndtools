# Android Alpha Build, Install, and Recovery

This runbook covers the tracked Capacitor Android application in `apps/gm-react/android`. It is for
v0.3.0 alpha development and release acceptance; Google Play publication and iOS are out of scope.

## Release identity and pinned toolchain

| Setting               | v0.3.0 value                                              |
| --------------------- | --------------------------------------------------------- |
| Application id        | `com.dndtools.gm`                                         |
| Version name          | `0.3.0`                                                   |
| Version code          | `3000`                                                    |
| Minimum Android API   | 24                                                        |
| Compile / target API  | 36 / 36                                                   |
| Capacitor             | 8, exact package versions in `apps/gm-react/package.json` |
| Android Gradle Plugin | 8.13.0                                                    |
| Gradle wrapper        | 8.14.3                                                    |
| Java                  | JDK 21                                                    |

The version code formula is `major × 1,000,000 + minor × 1,000 + patch`. Keep the root,
`packages/core`, and `apps/gm-react` package versions equal to `versionName` before tagging.

## Local prerequisites

- Node.js 22.13+ and the repository-pinned pnpm 10.34.5.
- JDK 21 selected by `JAVA_HOME` and visible from `java -version`.
- Android SDK command-line tools or Android Studio, with `platform-tools`, `platforms;android-36`,
  `build-tools;36.0.0`, `emulator`, and an API 36 emulator image installed.
- `ANDROID_HOME` or `ANDROID_SDK_ROOT` pointing at that SDK. Keep the generated
  `apps/gm-react/android/local.properties` untracked.

Accept SDK licenses and install the CI-equivalent packages with `sdkmanager`:

```bash
yes | sdkmanager --licenses
sdkmanager \
  'platform-tools' \
  'platforms;android-36' \
  'build-tools;36.0.0' \
  'emulator' \
  'system-images;android-36;google_apis;x86_64'
```

## Build and install a development APK

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @dndtools/gm-react android:sync
cd apps/gm-react/android
./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug
adb install --replace app/build/outputs/apk/debug/app-debug.apk
adb shell am start -W -n com.dndtools.gm/.MainActivity
```

`android:sync` builds the Vite renderer into `apps/gm-react/dist` and runs `cap sync android`; copied
web assets and generated Capacitor config are intentionally ignored. Use
`pnpm --filter @dndtools/gm-react android:open` to inspect the tracked project in Android Studio, or
`android:run` for Capacitor's build/run flow. Do not edit generated files under
`android/app/src/main/assets/public`.

The debug APK is for local development only. It cannot upgrade an alpha release signed with the
permanent release key.

### Sideload the alpha APK without adb

Download the APK and `SHA256SUMS.txt` from the same GitHub prerelease, verify the checksum, and open
the APK from Android's file manager. If prompted, allow **Install unknown apps** only for that file
manager/browser, complete the install, then disable the permission again. Do not install APKs from
reposted or unverified locations. The `.aab` file is not directly installable.

For an upgrade, export a vault first and install the new APK over the existing application; do not
uninstall. Android should present it as an update to DND Tools GM. A signature-conflict warning is a
release/key problem, not a reason to delete the current installation.

## Permanent alpha signing key

All v0.3.x APKs/AABs for `com.dndtools.gm` must use the same 4096-bit RSA key with alias
`dndtools-alpha`. Android accepts an in-place upgrade only when package id and signing identity match.
Treat this key as permanent release infrastructure, not a per-build secret.

On the release workstation, keep the recovery copy and its credentials outside the repository under:

```text
/home/trinkle/.config/dndtools/signing/android-alpha/
```

The directory must be mode `0700`; the keystore, credential file, and any recovery archive must be
mode `0600`. Keep a second encrypted, access-controlled recovery copy. Never commit, paste into an
issue, print in CI output, or pass passwords as command-line arguments. Record the certificate SHA-256
fingerprint separately and compare it before every release.

If the key has not yet been created, run `keytool` interactively so passwords do not enter shell
history:

```bash
install -d -m 0700 /home/trinkle/.config/dndtools/signing/android-alpha
keytool -genkeypair \
  -keystore /home/trinkle/.config/dndtools/signing/android-alpha/dndtools-alpha.jks \
  -storetype JKS \
  -alias dndtools-alpha \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
chmod 0600 /home/trinkle/.config/dndtools/signing/android-alpha/dndtools-alpha.jks
```

The GitHub repository requires these encrypted Actions secrets:

- `ANDROID_ALPHA_KEYSTORE_BASE64`
- `ANDROID_ALPHA_KEYSTORE_PASSWORD`
- `ANDROID_ALPHA_KEY_ALIAS` (`dndtools-alpha`)
- `ANDROID_ALPHA_KEY_PASSWORD`

Set them through `gh secret set` or repository settings without echoing their values. The release
workflow decodes the keystore into its temporary runner directory, restricts it to mode `0600`, and
deletes it with the runner. A missing secret fails the Android release instead of producing a
differently signed package.

For a local signed build, populate the four Gradle inputs through a protected environment-loading
mechanism and run the same checks as CI:

```bash
export ANDROID_ALPHA_KEYSTORE_PATH=/home/trinkle/.config/dndtools/signing/android-alpha/dndtools-alpha.jks
# Load ANDROID_ALPHA_KEYSTORE_PASSWORD, ANDROID_ALPHA_KEY_ALIAS, and
# ANDROID_ALPHA_KEY_PASSWORD from the protected credential file without printing them.
cd apps/gm-react/android
./gradlew --no-daemon testReleaseUnitTest lintRelease assembleRelease bundleRelease
```

Verify before distributing:

```bash
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify \
  --verbose --print-certs app/build/outputs/apk/release/app-release.apk
jarsigner -verify app/build/outputs/bundle/release/app-release.aab
```

The APK is directly installable. The AAB is prepared for future Play Console use and cannot be
installed directly with `adb`.

## Back up, restore, and upgrade

The shared renderer writes each accepted command immediately through the serialized `SceneRuntime`
and Dexie transaction path. This protects a completed command from backgrounding, WebView recreation,
and process restart, but it does not make app-private storage an external backup.

Before every alpha install or upgrade:

1. Export a full local vault backup from Settings.
2. In the Android share/save sheet, save it to durable storage outside DND Tools and confirm the file
   is readable. Do not rely on the temporary share cache. Native Android share exports are limited to
   32 MiB to avoid low-memory crashes while the Capacitor bridge encodes the file; if a vault is larger,
   remove large device-local media or export it from the desktop app.
3. Keep a second copy before testing import, restore, or a storage-affecting build.
4. If cloud backup is enabled, remember that it is an encrypted recovery copy, not a replacement for
   the local export, and does not contain device-local media bytes.

Local restore validates the full backup before replacing state, history, and assets in one Dexie
transaction. If validation, storage capacity, or the process interrupts the attempt, reopen the app,
verify the prior vault, free storage if needed, and retry from the untouched backup. Never clear app
storage or uninstall as a recovery step before exporting the current vault.

Install an update in place with the permanent alpha signature:

```bash
adb install --replace DND-Tools-GM-0.3.0-android.apk
```

An in-place install preserves app-private data. `INSTALL_FAILED_UPDATE_INCOMPATIBLE` means the installed
and candidate signing identities differ; stop and investigate the key fingerprint. Uninstalling first
would remove the Dexie vault, encrypted preferences, and the non-exportable Android Keystore key.

Android system backup/device transfer is not the release recovery contract. Secure-store ciphertext
is explicitly excluded because its Keystore key is non-portable. After a device transfer or restore,
be prepared to sign in again and re-enter hosted AI credentials. A user-created vault export is the
supported portable backup.

## Android alpha behavior and limitations

- The full GM information architecture remains available. Compact screens use Command Center,
  Session, Characters, and Maps bottom navigation plus the More sheet; wider screens use the rail.
- Android always opens Maps in Quick Map mode for touch-safe live-session use. It renders and preserves
  desktop-authored precision geometry while retaining pan, centroid pinch zoom, zoom/reset/fit
  controls, selection, token/POI placement and movement, fog reveal/conceal, layer visibility,
  undo/redo, player projection, import/export, and generator presets. Navigation is the default;
  editing must be visibly armed, and multi-touch always navigates. Brush, room, wall, road, door,
  light, text, scatter, marquee, and detailed geometry controls are hidden. Use the desktop app for
  advanced authoring.
- Manual and cloud session codes remain available. Automatic mDNS LAN discovery is Electron-only.
- Native window management and a separately opened player-display window are desktop-only; normal
  player projection remains available.
- Local Ollama/cleartext HTTP providers are desktop-only. Android allows hosted HTTPS AI providers
  with user-supplied credentials and never prompts for notification permission until the user opts in.
- Native Android share/save exports are limited to 32 MiB for this alpha. Larger vaults must have
  device-local media reduced or be exported from the desktop app.
- When trusted production cloud coordinates are absent, account, cloud-backup, and internet relay
  controls fail closed. The vault and local GM workflows remain usable offline.
- Android is the only native mobile target for v0.3.0. There is no iOS build, Google Play publication,
  or physical-device release gate for this alpha.

## API 36 emulator acceptance

Before publishing, test the signed release APK on a clean API 36 emulator and retain the logs. Cover:

- fresh install, cold launch, offline launch, and every primary route;
- compact portrait, short landscape, tablet/foldable resize, split screen, rotation, 200% text,
  reduced motion, forced colors, and a virtual-keyboard-reduced viewport;
- background/resume, WebView/process restart, and accepted-command vault persistence;
- Android Back ordering: topmost menu/dialog/sheet, fullscreen editor, router history, then minimize at
  the root;
- secure sign-in persistence, explicit notification opt-in, native share/export, file import, and
  external HTTPS links;
- Quick Map pan and centroid pinch zoom, zoom/reset/fit, selection, token/POI placement and movement,
  fog reveal/conceal, projection, layer visibility, properties/history/generation sheet,
  generator preview/accept, undo/redo, import/export, and byte-preservation of unsupported precision
  geometry;
- interrupted restore and low-storage failure recovery; and
- upgrade installation over the previous alpha APK signed by the same permanent key.

The release workflow is an additional gate: it runs Android unit/lint tasks, creates signed APK/AAB
packages, verifies both signatures, and installs/cold-launches the APK on API 36. Browser E2E and
accessibility coverage remain mandatory because Android uses the same renderer.

## Release artifacts and verification

The v0.3.0 prerelease must contain the two signed Android packages plus four unsigned desktop alpha
installers. It also contains `SHA256SUMS.txt`, the source-dependency and artifact SPDX inventories, and
GitHub build-provenance attestations. The exact artifact list and tag/publish procedure are in
[`../development/RELEASING.md`](../development/RELEASING.md).

From a directory containing the release downloads:

```bash
sha256sum -c SHA256SUMS.txt
gh attestation verify DND-Tools-GM-0.3.0-android.apk --repo tsieb/dndtools
gh attestation verify DND-Tools-GM-0.3.0-android.aab --repo tsieb/dndtools
```
