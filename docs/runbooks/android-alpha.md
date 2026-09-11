# Android: Build, Sign, Install, Accept

The tracked Capacitor project is `apps/gm-react/android` (`com.dndtools.gm`). Google Play and iOS
are out of scope ([ADR-038](../adr/038-ios-platform-strategy.md)). Design and boundaries:
[`../architecture/PLATFORMS.md`](../architecture/PLATFORMS.md).

## 1. Toolchain

| Setting               | Value                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Version name / code   | derived by `app/build.gradle` from `apps/gm-react/package.json` (`major×1,000,000 + minor×1,000 + patch`); `pnpm check:android` asserts it |
| Minimum / target API  | 24 / 36                                                                                                                                    |
| Capacitor             | 8, exact plugin versions in `apps/gm-react/package.json`                                                                                   |
| Android Gradle Plugin | 8.13.0 (Gradle 9 drops an API AGP 8 needs; Dependabot ignores wrapper bumps past 9.5)                                                      |
| Gradle wrapper        | 8.14.3                                                                                                                                     |
| Java                  | JDK 21 with both `java` and `javac`                                                                                                        |

Install a JDK 21 (Temurin: `sudo dnf install temurin-21-jdk` or `sudo apt install temurin-21-jdk`
after adding the Adoptium repository), set `JAVA_HOME` to it, and confirm `java -version` and
`javac -version` both report 21. Install the SDK packages and point `ANDROID_HOME` at them:

```bash
yes | sdkmanager --licenses
sdkmanager 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' 'emulator' \
  'system-images;android-36;google_apis;x86_64'
```

Keep the generated `android/local.properties` untracked.

## 2. Build and install a debug APK

```bash
pnpm install --frozen-lockfile
pnpm check:android                                  # static preflight, no Java needed
pnpm --filter @dndtools/gm-react android:sync       # Vite build + cap sync android
cd apps/gm-react/android
./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug
adb install --replace app/build/outputs/apk/debug/app-debug.apk
adb shell am start -W -n com.dndtools.gm/.MainActivity
```

`android:open` opens the project in Android Studio; `android:run` uses Capacitor's run flow. Never
edit generated files under `android/app/src/main/assets/public`. A debug APK cannot upgrade an alpha
signed with the release key. To check an old tree with the current checker, export it with
`git archive` and run `pnpm check:android /path/to/export`.

Sideloading without adb: download the APK and `SHA256SUMS.txt` from the same prerelease, verify the
checksum, open the APK from the file manager, allow "Install unknown apps" for that app only, then
revoke it. For an upgrade, export a vault first and install over the existing app; a
signature-conflict warning is a key problem, never a reason to uninstall.

## 3. The permanent alpha key

Every APK/AAB for `com.dndtools.gm` is signed with the same 4096-bit RSA key, alias
`dndtools-alpha`. Android accepts an in-place upgrade only when the signing identity matches, so the
key is permanent release infrastructure. The recovery copy lives outside git at
`~/.config/dndtools/signing/android-alpha/` (directory `0700`, files `0600`), with a second
encrypted copy elsewhere and the certificate SHA-256 fingerprint recorded separately. Create it
interactively if it does not exist:

```bash
keytool -genkeypair -keystore ~/.config/dndtools/signing/android-alpha/dndtools-alpha.jks \
  -storetype JKS -alias dndtools-alpha -keyalg RSA -keysize 4096 -validity 10000
```

The repository needs the encrypted Actions secrets `ANDROID_ALPHA_KEYSTORE_BASE64`,
`ANDROID_ALPHA_KEYSTORE_PASSWORD`, `ANDROID_ALPHA_KEY_ALIAS`, `ANDROID_ALPHA_KEY_PASSWORD`, set with
`gh secret set` without echoing them. The release workflow materializes a `0600` runner copy and fails
if any input is missing. A local signed build supplies the same four values through
`ANDROID_ALPHA_KEYSTORE_PATH` and the environment, then:

```bash
./gradlew --no-daemon testReleaseUnitTest lintRelease assembleRelease bundleRelease
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose --print-certs app/build/outputs/apk/release/app-release.apk
jarsigner -verify app/build/outputs/bundle/release/app-release.aab
```

## 4. Backup, restore, upgrade

Accepted commands persist immediately through the serialized runtime and one Dexie transaction, but
app-private storage is not an external backup. Before every install or upgrade: export a full vault
from Settings, save it to durable storage outside the app through the share sheet (32 MiB cap;
larger vaults export from desktop), keep a second copy, and remember that cloud backup carries no
device-local media. Restore validates the whole backup before replacing state, history, and assets in
one transaction; on any interruption reopen the app, verify the prior vault, and retry. Never clear
storage or uninstall as a recovery step.

Upgrade in place with `adb install --replace`. `INSTALL_FAILED_UPDATE_INCOMPATIBLE` means the
signing identities differ; stop and check the fingerprint. Android system backup is not the recovery
contract: Keystore-encrypted preferences are excluded, so after a device transfer expect to sign in
again and re-enter AI credentials.

## 5. Alpha behaviour and limits

The full IA is available (bottom tabs plus the More sheet on phones, the rail on wider screens).
Maps always open in Quick Map mode: pan, pinch, zoom controls, selection, token and POI placement,
fog, layers, undo, projection, import and export, and generator presets, with editing explicitly
armed and precision authoring desktop-only. Manual and cloud session codes work; mDNS discovery,
native windowing, and local Ollama are desktop-only; hosted HTTPS AI providers work. Shared
`application/json` or `application/octet-stream` files open an import review (8 MiB cap). Two
home-screen shortcuts (Session, Play) and two notification channels (`lamplight-live-session`,
`lamplight-updates`) exist from first launch; posting needs the explicit Android 13+ opt-in. Without
trusted cloud coordinates the account, backup, and relay controls fail closed and local play works
offline.

## 6. API 36 acceptance

Before publishing, run the signed APK on a clean API 36 emulator and keep the logs. Cover: fresh,
cold, and offline launch and every primary route; compact portrait, short landscape, tablet, split
screen, rotation, 200% text, reduced motion, forced colors, and a keyboard-reduced viewport;
background, resume, and process restart with persistence; Back ordering (overlay, editor, router
history, minimize); secure sign-in persistence, notification opt-in, share and export, file import,
external links; both shortcuts, a dropped undeclared shortcut route, both channels, and a shared
file opening the import review (`scripts/android-emulator-acceptance.sh` covers those four); the
Quick Map matrix including byte-preservation of desktop geometry; interrupted restore and low-storage
recovery; and an upgrade over the previous APK signed with the same key. The release workflow
additionally runs the Gradle tasks, verifies both signatures, and installs and cold-launches on API 36. Browser E2E and axe remain mandatory because Android runs the same renderer.

Release artifacts and the publish procedure: [`../development/RELEASING.md`](../development/RELEASING.md).
