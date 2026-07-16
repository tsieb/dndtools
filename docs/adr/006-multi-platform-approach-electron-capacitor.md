# ADR-006: Multi-Platform Approach (Web + Electron + Capacitor Android)

- Status: Accepted (amended 2026-07-15)
- Date: 2026-03-01
- Deciders: Engineering
- Consulted: Product, UX, Security, QA
- Amends: ADR-004 implementation details; incorporates the React-primary decision in ADR-018

## Context

DND Tools has one maintained GM application and one authoritative data model. The primary app is now
the Vite + React application at `apps/gm-react`, not the retired SvelteKit application. It persists
the vault through Dexie/IndexedDB and sends every durable mutation through `SceneRuntime` and
`@dndtools/core`. The same renderer already runs in browsers and the Electron desktop shell.

Android support must preserve that renderer, command path, vault schema, and local-first behavior. A
separate native application or a second storage model would duplicate product logic and create
cross-device data drift. At the same time, Android has capabilities and constraints that cannot be
represented safely by ad hoc global checks: Keystore-backed credentials, native share sheets,
lifecycle and Back events, system-bar insets, HTTPS-only networking, and a touch-first map workspace.

## Decision

Ship three runtime kinds from the shared React renderer:

- `web`: the normal Vite build, with browser downloads and session-only secret storage;
- `electron`: the same renderer in the existing Electron shell, with `safeStorage`, desktop window
  management, and automatic LAN discovery; and
- `android`: the same renderer in the tracked Capacitor 8 project at `apps/gm-react/android`.

`apps/gm-react/src/platform/capabilities.ts` is the single runtime and capability decision point. It
defines `RuntimeKind = 'web' | 'electron' | 'android'` and `PlatformCapabilities` for secure storage,
file export/share, local discovery, notifications, window management, external links, and Android
Quick Map mode. Feature code consumes this contract instead of probing Electron or Capacitor globals.

Persistence remains renderer-owned Dexie/IndexedDB on every runtime. `SceneRuntime.dispatch` keeps the
single serialized durable-write path, and `src/platform/storage/coreStore.ts` keeps transactional
command persistence and atomic backup restore. The Android shell does not introduce a second vault
format or native database.

Runtime-specific integrations stay narrow:

- Android credentials use the `DndtoolsSecureStore` Capacitor plugin: a non-exportable Android
  Keystore AES key encrypts authenticated values stored in app-private preferences. Secure-store
  ciphertext is excluded from Android backup and device transfer because its key is not portable.
- Android exports use the `DndtoolsFileExport` plugin to write a bounded temporary cache file and open
  the native share/save chooser. Web and Electron keep browser-style downloads behind the same async
  `exportFile` contract.
- Android lifecycle and Back events enter through `PlatformLifecycle`; native Back closes the
  topmost overlay or editor, then uses router history, and minimizes at the root.
- Android rejects cleartext network destinations and opens trusted external HTTPS links outside the
  embedded WebView. WebView Safe Browsing remains enabled.
- Android always enables Quick Map mode. It preserves and renders the full normalized-vector map but
  exposes only touch-safe live-session operations. Precision authoring stays available on desktop.

The Android application identity is `com.dndtools.gm`. For v0.3.0 it uses `versionName 0.3.0`,
`versionCode 3000`, minimum API 24, and compile/target API 36. The build is pinned to Capacitor 8,
Android Gradle Plugin 8.13, Gradle 8.14.3, and JDK 21.

## Consequences

### Positive

- Browser, desktop, and Android share the React UI, `@dndtools/core`, Dexie vault, command log, backup
  envelopes, and sync model.
- Capability differences are explicit, typed, testable, and user-visible.
- Android receives OS-backed credential custody and native file sharing without putting platform code
  in the processing core.
- Desktop behavior and advanced map authoring remain intact.

### Negative

- Release and test matrices now include Gradle, an API 36 emulator, Android lifecycle behavior, and
  permanent APK signing-key custody.
- Android WebView storage is app-private but is not a substitute for a user-created vault backup;
  uninstalling clears local vault data and Keystore credentials.
- Some integrations remain intentionally platform-specific: automatic LAN discovery, desktop
  windowing/second-screen control, local Ollama, and precision map drawing are unavailable on Android.

## Rejected Alternatives

| Alternative                              | Why Rejected                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Separate Kotlin/Compose Android app      | Duplicates the renderer, command wiring, vault behavior, and accessibility work; creates the largest long-term drift risk.  |
| Cordova shell                            | Older runtime/plugin model and weaker fit than the maintained Capacitor bridge.                                             |
| Tauri mobile shell                       | Adds a Rust/mobile toolchain and a second native integration model without improving the shared renderer or vault boundary. |
| Native Android database                  | Creates another persistence and migration path when Dexie already provides transactional durability in the shared renderer. |
| Runtime checks spread through components | Makes platform behavior hard to audit and encourages nonfunctional controls instead of explicit capability messages.        |

## Migration Impact

- The tracked Capacitor project and custom plugins live below `apps/gm-react/android`; generated build
  outputs, copied web assets, local SDK paths, and signing material remain ignored.
- Renderer platform access routes through `src/platform/capabilities.ts`, `PlatformLifecycle.tsx`, and
  the async export and secure-store adapters.
- Existing vaults need no schema migration. Import/export and sync envelopes remain compatible across
  browser, Electron, and Android.
- Releases must retain the permanent `dndtools-alpha` signing key for `com.dndtools.gm`; losing it
  prevents in-place upgrades of previously installed alpha APKs.

## Rollback Plan

- Stop distributing Android artifacts and leave the browser/Electron release path active.
- Keep shared capability, async export, responsive, and accessibility improvements that remain useful
  outside Android.
- Do not migrate or rewrite vault data. Existing user exports stay compatible with the browser and
  desktop app.
- Never replace the Android signing identity as a rollback shortcut. Users with an alpha build should
  export a vault before uninstalling if an in-place signed update is unavailable.

## Verification and Evidence

- `apps/gm-react/src/platform/capabilities.ts`
- `apps/gm-react/src/platform/PlatformLifecycle.tsx`
- `apps/gm-react/src/platform/storage/coreStore.ts`
- `apps/gm-react/src/platform/download.ts`
- `apps/gm-react/src/cloud/secureStore.ts`
- `apps/gm-react/capacitor.config.ts`
- `apps/gm-react/android/app/src/main/java/com/dndtools/gm/MainActivity.java`
- `apps/gm-react/android/app/src/main/java/com/dndtools/gm/plugins/AndroidKeystoreSecretStore.java`
- `apps/gm-react/android/app/src/main/java/com/dndtools/gm/plugins/DndtoolsFileExportPlugin.java`
- `apps/gm-react/android/app/build.gradle`
- `.github/workflows/release.yml`
- [`../runbooks/android-alpha.md`](../runbooks/android-alpha.md)
