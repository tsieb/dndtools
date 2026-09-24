# Platform Shells

One React renderer runs in a browser, in the Electron desktop shell, and in the Capacitor Android
shell. iOS is served by the installable web app; a Capacitor iOS shell was rejected for RC1
([ADR-038](../adr/038-ios-platform-strategy.md)). The shared-renderer decision is
[ADR-006](../adr/006-multi-platform-approach-electron-capacitor.md).

## 1. Runtime kinds and capabilities

`apps/gm-react/src/platform/capabilities.ts` detects the runtime once and resolves the
`PlatformCapabilities` contract. `RuntimeKind` is `'web' | 'electron' | 'android' | 'ios'`; `ios` is
WebKit on iPhone or iPad (`detectIosWebKit`, bridge detection outranks the user-agent test in both
directions) and exists so capability copy and the `mobile` widget profile match the device.
Components consume capabilities for secure storage, export and share, discovery, notifications,
window management, external links, and Quick Map mode. They never probe native globals.

`PlatformLifecycle.tsx` and `backNavigation.ts` adapt Android lifecycle and Back events; browser and
Electron get no-op adapters. `download.ts` exposes one async `exportFile` contract (native share
chooser on Android, downloads elsewhere). `secureStore.ts` exposes one `DurableSecretStore` interface
(Electron `safeStorage`, Android Keystore, session-only on the web).

## 2. Electron desktop

`apps/gm-react/electron/main.cjs` serves the packaged renderer from the privileged `dndtools://app`
origin, owns the BrowserWindow, and builds the CSP; `preload.cjs` exposes a minimal named bridge;
`discovery.cjs` bundles mDNS peer discovery for LAN play. The shell adds no authoritative state.

Upgrades from the v0.2.0 `file://` origin export the legacy database through a hidden renderer,
import it in bounded chunks, verify a digest, and write a completion marker. The source is never
deleted and an interrupted move is retried.

### Desktop parity (RC-PLT-1.3)

The native application menu uses standard Edit, View, Window and application/quit roles.
Session menu labels and shortcut legends come from `src/app/shortcuts/registry.ts`; clicks
re-enter the existing keydown handlers so text-input and modal guards still apply. Accelerators
are displayed without registering a second shortcut handler. On Windows/Linux, Alt reveals the
menu; macOS uses the system menu bar.

`electron/parity.cjs` saves normal window bounds and maximized state on close, using an atomic
rename in userData. Invalid files and rectangles outside connected display work areas reset to
window defaults. Minimized/fullscreen state is not restored. AUD-2.4 owns the native display
chooser and isolated kiosk projector; Escape and display removal close that window.

The main process accepts only `lamplight://join/<URL-safe-token>` and routes it to
`#/join?token=…`, preserving the existing invite redemption flow. Cold-start arguments, macOS
`open-url`, and repeat-launch arguments share validation; external URLs, extra path segments,
queries and fragments are rejected. Delivery waits for the primary preload to be ready.

Getting the OS to hand that link over takes two halves, and both must be present. The packaged
bundle DECLARES the scheme — `protocols:` in `electron-builder.yml` becomes `CFBundleURLTypes` in
the macOS `Info.plist` and the scheme's registry keys in the NSIS installer, while
`linux.desktop.entry.MimeType: x-scheme-handler/lamplight;` puts it in the AppImage's desktop
entry — and packaged startup then CLAIMS it via `app.setAsDefaultProtocolClient`. An unpackaged
dev tree deliberately does not claim the scheme: a checkout moves or disappears, and pointing a
developer's mime database at one would break invites for the installed app. Dev and CI exercise
the same delivery path through argv / `open-url` / `second-instance` instead.

The macOS LIVE dock badge and the Windows/Linux live-session tray icon follow Core's own
`session.workflow`: `PlatformLifecycle` calls the primary-only
`lamplightDesktop.setLiveSession(boolean)` bridge whenever the workflow changes, from the same
state the Android live-session notification reads, so the two platforms cannot disagree and the
badge cannot claim a table is live when it is not. It stands down on End session, on unmount, and
when the primary window closes. A Linux session with no StatusNotifier host (minimal desktops,
xvfb CI) logs a warning and keeps running without a tray icon.

Parity runs as part of the standard desktop suite, so CI's `desktop-smoke` job and any release
check cover it:

```sh
pnpm --filter @dndtools/gm-react desktop:smoke
```

After the origin, migration and auto-update passes it boots the production main/preload twice
against a disposable profile. Assertions cover the registry-built menu action, cold / warm /
second-instance links, rejected links and senders, the packaged protocol declaration for all three
platforms, the live badge following a click on the real **Go live** control and standing down on
**End session**, projector isolation/Escape, and window bounds across a genuine restart. A display
is required. What a virtual display still cannot prove: physical monitor placement, visible OS
badge rendering, and a genuine OS protocol hand-off — that last one needs an installed package and
a real desktop session, which is why the declaration itself is asserted instead.

### Auto-update

The packaged app updates from GitHub Releases through `electron-updater`
(`electron/updater.cjs`, IPC in `main.cjs`, bridge `window.dndtoolsUpdates`, typed accessor
`src/platform/desktopUpdates.ts`, panel `screens/settings/AppUpdates.tsx`). Nothing is automatic:
the shell checks, downloads, and installs only on explicit request, and `autoDownload`,
`autoInstallOnAppQuit`, `allowDowngrade`, and `disableWebInstaller` are off. The feed comes from
`publish:` in `electron-builder.yml`; `LAMPLIGHT_UPDATE_FEED_URL` is honoured only when
`app.isPackaged` is false so the desktop smoke can use a loopback feed. A package is refused unless
its sha512 matches the release feed; Windows and macOS additionally require a matching code
signature, so unsigned preview builds report an honest failure rather than installing. The panel
shows a plain reason and no buttons on unpackaged builds without a staged feed and on Linux
distro packages. `electron/updater.bundled.cjs` is generated by `desktop:bundle-updater` and
gitignored.

Verify with `pnpm --filter @dndtools/gm-react desktop:smoke` (full) or `desktop:smoke:updater`
(`scripts/smoke-updater.cjs`: newer build offered, tampered package refused, running version,
unreachable feed).

## 3. Android

`capacitor.config.ts` packages `dist` as `com.dndtools.gm`. The tracked Gradle project under
`apps/gm-react/android` uses JDK 21, minimum API 24, compile and target API 36, Android Gradle
Plugin 8.13, Gradle 8.14.3, and exact Capacitor 8 plugin versions. It supports rotation, resizing,
split screen, and edge-to-edge insets.

- `MainActivity.java` registers the custom secure-store and file-export plugins, rejects mixed
  content, and keeps WebView Safe Browsing on; the network security config rejects cleartext.
- `AndroidKeystoreSecretStore` encrypts values under a non-exportable Keystore AES-GCM key in
  app-private preferences. Backup rules exclude them because the key cannot move.
- Native export writes a bounded app-cache file and opens the share or save chooser (32 MiB cap).
- Files shared into the app open an import review that runs the same commands as a marketplace
  install (8 MiB cap). Two home-screen shortcuts (Session, Play) are re-checked against
  `SHORTCUT_ROUTES` in `capabilities.ts`. Two notification channels exist from first launch;
  posting still needs the explicit Android 13+ opt-in.
- Android always opens Maps in Quick Map mode: full geometry renders and is preserved, precision
  authoring stays desktop-only, navigation is the default, and multi-touch always pans.
- Local Ollama and cleartext AI providers are desktop-only; hosted HTTPS providers work.

Build, signing, install, upgrade, and acceptance procedures: [`../runbooks/android-alpha.md`](../runbooks/android-alpha.md).

## 4. Installable web app (PWA)

| File                                          | Role                                                     |
| --------------------------------------------- | -------------------------------------------------------- |
| `apps/gm-react/public/manifest.webmanifest`   | Name, icons, colours, `display: standalone`              |
| `apps/gm-react/src/sw/service-worker.js`      | The worker; never imported by the app bundle             |
| `apps/gm-react/vite.config.ts`                | `lamplightServiceWorker()` emits it with a precache list |
| `apps/gm-react/src/platform/serviceWorker.ts` | Registration rule and the update toast                   |

The worker keeps one cache, `lamplight-<build hash>`, and deletes every other `lamplight-*` cache on
activation. The offline shell (`index.html`, the entry chunk and its static imports, the stylesheet,
brand fonts, boot script, icons, manifest) is precached and served cache-first; everything else and
every navigation is network-first with fallback, so lazy route chunks are held only after they are
opened. Cross-origin traffic (cloud, signalling, AI providers) is never cached. `cache.match` uses
`ignoreVary: true` because static hosts answer with `Vary: Origin` and Vite marks module scripts
`crossorigin`; honouring Vary blanked the shell in production once.

`shouldRegisterServiceWorker` registers only for `web` and `ios` runtimes in a secure context, and
under the Vite dev server only with `?sw=dev` (used by `tests/e2e/pwa-offline.spec.ts`). A failed
registration is logged and the app stays online-only. A new version waits until the DM accepts the
reload toast (`LAMPLIGHT_SKIP_WAITING`); a session is never swapped mid-encounter.

Verify: `pnpm test:app` (manifest installability and the registration rule), the `pwa-offline`
spec, and an offline reload of a production build served with `vite preview`.
