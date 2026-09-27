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
platforms, the live badge following a click on the real **Start session** control and standing down on
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
registration is logged: offline shell reload is unavailable, but local vault storage still works. A new version waits until the DM accepts the
reload toast (`LAMPLIGHT_SKIP_WAITING`); a session is never swapped mid-encounter.

Verify: `pnpm test:app` (manifest installability and the registration rule), the `pwa-offline`
spec, and an offline reload of a production build served with `vite preview`.

### Offline durability assurance (RC-PLT-2.4)

`pwa-offline.spec.ts` runs on desktop Chromium and the Pixel 5 Chromium profile. Each durable
surface has its own case: a note, NPC character, map, scene, and user audio preset. Each warms its
route under worker control, disconnects the browser, creates through the real runtime dispatch
and IndexedDB persistence path, reloads while still offline, and checks both the complete stored
record and its visible name. The audio case prepares session audio online, then saves the preset
offline: presets persist references, not remote audio bytes. This is persistence assurance, not
an assertion that an uncached remote stream plays offline or that every creation form works.
Lazy routes must have been visited online; the dev worker cannot precache unknown module URLs.

Run both profiles with:
`pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/pwa-offline.spec.ts --workers=1`.

### The honest network indicator on cloud-only controls (RC-PLT-2.4)

Almost everything in Lamplight is local-first and works with no network. A minority of controls are
not: publishing a module, minting an invite, revoking a device, opening the billing portal, pushing
to a Google Doc. Offline those can only fail, and they used to look exactly as live as the local
ones — the only way to find out was to press one and read the error.

`src/cloud/offline.tsx` is the single mechanism. `useCloudActions(reason)` returns `offlineProps`,
spread onto each cloud-only control; `<CloudOfflineNotice />` is the once-per-panel prose.

**Soft-disable, not `disabled`.** A natively disabled button leaves the tab order, taking its own
`title` with it — so the sentence explaining why it cannot be pressed becomes unreachable by exactly
the people who most need it announced. Both `Button` and `IconButton` already implement the
alternative: a truthy `aria-disabled` renders the control unavailable (0.5 opacity, `not-allowed`
cursor) and swallows activation while keeping it focusable and readable. `offlineProps` therefore
sets `aria-disabled`, a `title` naming what the action needs, and `data-cloud-offline="true"`.
Controls that are not DS buttons (`Switch`, `Select`, a `<form onSubmit>`, an Enter-key shortcut)
do not swallow their own activation, so those call sites also guard on `cloudActions.blocked`.

**What it does not claim.** `navigator.onLine === false` is trustworthy — no interface, so no cloud
call can succeed. The true case is much weaker: an interface exists, nothing more. A captive portal,
dead DNS or a service outage all report "online". So the gate only ever ADDS an indicator; it never
suppresses, retries or reinterprets a failure a request actually returned. Server errors stay
errors.

**Deliberately ungated**, because gating them would be a lie in the other direction: local vault
backup/restore, recovery-key export/import (local crypto against the OS credential store), copying
an already-minted invite link, local folder sources (File System Access), renaming an actor,
in-app navigation to `/upgrade`, and a device-local preview plan change when no account backs it.

Verification is three layers, because no single one covers the criterion:

| Layer       | File                                    | Covers                                                                                                                                                             |
| ----------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Static rule | `src/cloud/offline.gate.test.ts`        | No module may import a network-backed cloud client without the gate. Exemptions live in `NO_CLOUD_CONTROLS`, each with a stated reason.                            |
| Component   | `src/cloud/offline.configured.test.tsx` | The configured-and-signed-in screens, which e2e cannot reach: exact set of gated controls, `aria-disabled` not `disabled`, and recovery on reconnect.              |
| Browser     | `tests/e2e/pwa-offline.spec.ts`         | Real offline transition on both profiles: the indicator appears, the control stays focusable, the click fires no request, reconnecting clears it without a reload. |

The middle layer exists because the Playwright server blanks every `VITE_*` cloud coordinate on
purpose (`playwright.config.ts`, asserted by `isolation-guard.spec.ts`) so no e2e run can reach
Cognito or app-api. A cloud-configured, signed-in screen is therefore unreachable from a browser
test by design — the same split `Discover.test.tsx` and `WikiReader.test.tsx` already use. The two
e2e routes that do exercise a real cloud-only control (`/join`, `/wiki`) reach it legitimately: the
server fetch fails, the shipping component offers a retry, and that retry is the gated control.

The visual suite is the opposite case. Its container runs with `--network=none`, so Chromium there
reports `navigator.onLine === false` while every request is answered by the dev server or a route
mock. Visual specs that capture a gated surface call `presentOnline(page)` (`tests/e2e/_helpers.ts`)
before navigating, so the baselines show the online render. `pwa-offline.spec.ts` must never call
it.

Run all three with:
`pnpm --filter @dndtools/gm-react exec vitest run src/cloud/offline` and
`pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/pwa-offline.spec.ts --workers=1`.

Some cloud-only controls live in presentational children split out of their screen
(`DiscoverShelf.tsx`, `Ratings.tsx`, `upgrade/PlanCards.tsx`). The screen owns the network calls,
so it gates them from above:

- **Discover.** Install and remove wear the gate. The shelf's search and filters stay editable: the
  query is local state and the server search waits for the `online` event, which the notice above
  the shelf says. The load-failed retry is withheld offline, since reconnecting re-runs the search
  on its own. The ratings section is hidden (not unmounted) behind one line saying ratings need a
  connection, so an unsent draft survives the drop. Selecting a cached card stays live.
- **Plans.** `Upgrade.tsx` feeds the gate into `PlanCards`' `busy` prop, disabling every
  live-billing CTA and a signed-in plan change; the notice above the cards says why. A signed-out
  preview plan change stays live.

**Online play** (`net/`). "Host online", "Also make joinable online", "Join online" and "Join with
room and PIN" go through the internet relay (`net/cloudBridge.ts`, now on the static rule's network
list), so they are gated, with a notice in the host and join dialogs. They are native `<button>`s,
so they spread `offlineStyle` for the look and refuse in the handler. Local-network hosting, pasted
connection codes and nearby tables are not relay calls and stay live. The top-bar account button
gates only signing in.

`Discover.test.tsx` and `offline.configured.test.tsx` cover these across disconnect and reconnect,
including that blocked activations issue no requests.
