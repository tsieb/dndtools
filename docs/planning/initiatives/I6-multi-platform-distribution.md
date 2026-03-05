# Initiative 6 — Multi-Platform Distribution

## Status: COMPLETED

**Outcome:** DND Tools runs excellently on desktop (Windows, macOS, Linux), Android
(sideloaded APK), and in any modern browser. The desktop experience is polished,
signed, and self-updating. The mobile experience is native-feeling and offline-capable.
The app is fully accessible to users with disabilities.

---

## Epic 6.1 — Desktop Shell Hardening

**Goal:** The packaged desktop app is signed, self-updating, fully self-contained (no
external runtime dependencies), and hardened against common Electron security vectors.

**Stories:**

- **S6.1.1 — Code-signed build pipeline**
  Configure `electron-builder` with code signing for Windows (EV certificate or
  self-signed with install instructions), macOS (Developer ID + Notarization), and
  Linux (AppImage + .deb). Add signing to the CI release pipeline. Document the
  certificate management process in `docs/RELEASE.md`.

- **S6.1.2 — Auto-update with staged rollout**
  Integrate `electron-updater` with GitHub Releases as the update server. Support
  differential updates. Add update readiness UI: Settings → About → "Update available"
  with changelog preview and "Update now / Remind later" controls. Support staged
  rollout (% of users per day) for major releases.

- **S6.1.3 — Bundled MCP sidecar runtime**
  Package a Node.js runtime (via `@yao-pkg/pkg` or Electron's bundled Node) with the
  MCP sidecar so no external `node` binary is required. Update `electron/mcp-sidecar.ts`
  to use the bundled binary path with a fallback to system Node in development mode.
  Add startup validation that the bundled runtime is intact and the correct version.

- **S6.1.4 — Vault lifecycle UX improvements**
  Add: recent vault list with last-opened date and health indicator, graceful handling
  of last vault being unavailable (startup selector, not crash), vault switch with
  progress/rollback, and vault permission checks with clear remediation instructions.

---

## Epic 6.2 — Android Build & Sideload Pipeline

**Goal:** DND Tools ships as an Android APK that can be sideloaded, provides a
first-class mobile experience, and uses the same application code as the desktop app.

**Stories:**

- **S6.2.1 — Capacitor integration and Android project scaffolding**
  Integrate Capacitor into the SvelteKit project. Configure `capacitor.config.ts` for
  DND Tools. Initialize the Android platform (`npx cap add android`). Establish the
  build pipeline: `pnpm build` → `npx cap sync` → Android Studio / Gradle release build.
  Document this in `docs/MOBILE.md`.

- **S6.2.2 — Android filesystem adapter via Capacitor Filesystem plugin**
  Implement a `CapacitorStorageAdapter` in `src/lib/platform/storage/capacitor-adapter.ts`
  that uses the Capacitor Filesystem plugin for vault reads/writes. The adapter
  implements the same `StorageAdapter` interface as the Electron adapter. MCP sidecar
  is not available on Android; vault intelligence features gracefully degrade to
  client-computed equivalents.

- **S6.2.3 — Mobile-first navigation patterns**
  Add a bottom navigation bar for mobile (replacing sidebar in the < 768px breakpoint):
  Notes, Search, Graph, Session, Settings. Add swipe-left/right for back/forward. All
  current sidebar modes (folder tree, recent, favorites) are accessible via a slide-up
  sheet from the bottom bar.

- **S6.2.4 — Virtual keyboard adaptation**
  Detect soft keyboard open/close via `visualViewport` API. Dock the editor toolbar
  above the keyboard. Ensure cursor remains visible with `scrollIntoView`. Disable
  fixed-position elements that interfere with keyboard-obscured layouts. Add E2E
  simulator tests for keyboard layouts.

- **S6.2.5 — APK signing pipeline and sideload guide**
  Generate a release keystore and store it in GitHub Secrets. Configure Gradle release
  signing. Produce a signed APK artifact in CI on release tags. Write `docs/SIDELOAD.md`
  with step-by-step instructions for enabling unknown sources, installing the APK, and
  selecting a vault directory on Android.

---

## Epic 6.3 — Offline-First Sync Architecture

**Goal:** The app works completely without internet access. When connectivity is
available, sync operations are transparent, non-blocking, and conflict-safe.

**Stories:**

- **S6.3.1 — Sync status indicators and offline mode detection**
  Add a persistent sync status indicator in the top bar: online/offline/syncing/error
  states. Offline detection uses `navigator.onLine` + periodic ping. In offline mode,
  all write operations are queued for sync on reconnect. No UI operation is blocked by
  sync state.

- **S6.3.2 — Offline write queue with deferred sync**
  When offline, local writes succeed immediately and are added to a sync queue stored
  in the vault. On reconnect, the queue is replayed against the cloud state with
  conflict detection. The queue is persistent across app restarts.

- **S6.3.3 — Conflict resolution model for offline edits**
  When the same note is modified both locally (offline) and remotely (by another
  client), present a conflict resolution UI: three-way diff (local, remote, ancestor),
  choose winner or merge manually, and a "use latest" automatic mode configurable in
  settings.

---

## Epic 6.4 — Accessibility Compliance Program

**Goal:** DND Tools meets WCAG 2.1 AA across all routes and primary workflows for all
user groups — including users who rely on keyboard navigation, screen readers, or
reduced motion.

**Stories:**

- **S6.4.1 — WCAG 2.1 AA audit and gap register**
  Run automated axe scans on every route and manually audit the 10 highest-impact
  workflows. Document all gaps in `docs/ACCESSIBILITY.md` with WCAG criterion,
  severity (blocker/major/minor), and remediation owner. Update this register after
  every release.

- **S6.4.2 — Automated accessibility tests in CI**
  Integrate `axe-playwright` into the E2E test suite. Assert zero violations at
  `critical` and `serious` severity for all primary routes on every PR. This gate
  blocks merges when it fails. Add to the CI workflow alongside the existing E2E stage.

- **S6.4.3 — Full keyboard reachability for all major workflows**
  Audit and fix: focus traps in modals/dialogs, missing `aria-label` on icon buttons,
  unreachable command palette items, and non-focusable interactive elements. Every
  primary workflow (create note, link, search, open entity, session board) is
  completable keyboard-only.

- **S6.4.4 — Screen reader QA pass**
  Test all primary workflows in NVDA (Windows) and VoiceOver (macOS). Document
  failures. Fix: route change announcements, live region updates for async operations
  (search results, save confirmation), and semantic heading hierarchy per route.

- **S6.4.5 — Touch target and motion audit**
  Enforce minimum 44×44px touch targets across all interactive elements. Audit all
  animations and transitions for `prefers-reduced-motion` compliance. Add a CI check
  that scans for interactive elements below the size threshold.

---

## Epic 6.5 — Progressive Web App & Browser Support

**Goal:** DND Tools is fully functional as an installable PWA in modern browsers —
no Electron required. This enables access from Chromebook, iOS Safari, and any device
without app installation. Storage uses IndexedDB; sync is optional via cloud.

**Stories:**

- **S6.5.1 — Service worker with offline-first cache strategy**
  Add a Vite PWA plugin configuration implementing a `StaleWhileRevalidate` strategy
  for app shell assets and a `CacheFirst` strategy for static resources. The service
  worker pre-caches all route JS/CSS bundles at install time. Vault data reads from
  IndexedDB — no network access required after initial install. Add an "app is offline"
  indicator when the service worker is serving from cache exclusively.

- **S6.5.2 — IndexedDB storage adapter as browser fallback**
  Implement `IndexedDbStorageAdapter` in `src/lib/platform/storage/indexeddb-adapter.ts`
  satisfying the full `StorageAdapter` interface. Vault notes, objects, settings,
  session boards, and changelog all map to Dexie tables. The bootstrap module detects
  the absence of `window.dndtoolsDesktop` and uses the IndexedDB adapter
  automatically. File-based vault operations (import/export) use the browser File
  System Access API with graceful fallback to `<input type="file">`.

- **S6.5.3 — PWA install and manifest**
  Configure `manifest.webmanifest` with: name, short_name, icons (192px, 512px,
  maskable), theme_color, background_color, display: `standalone`, start_url, and
  screenshots for the app store listing. Add an in-app install prompt that appears
  after the user has opened 3 notes (not immediately). Test install flow on Chrome
  Desktop, Chrome Android, Safari iOS, and Edge.

- **S6.5.4 — Browser-mode feature parity audit**
  Document all features that require Electron and are unavailable in browser mode:
  filesystem vault selection, MCP sidecar, auto-update, native notifications. For each
  gap, define the browser-mode behavior: cloud vault replaces filesystem; MCP features
  degrade to client-side algorithmic fallbacks; notifications use Web Notifications
  API. Add a "browser mode" indicator in Settings showing which features are limited.

---

---
