# Mobile and Android Workflow

This document is the implementation reference for Epic 6.2 (Android build and
mobile UX support).

## Scope

- Capacitor integration for the shared SvelteKit renderer.
- Native Android project scaffold under `android/`.
- Capacitor filesystem-backed storage adapter:
  `src/lib/platform/storage/capacitor-adapter.ts`.
- Mobile-first shell behavior:
  - bottom navigation (Notes, Search, Graph, Session, Settings)
  - slide-up library sheet for sidebar modes
  - edge-swipe back/forward navigation
  - virtual keyboard viewport adaptation and editor-toolbar docking

## Commands

- One-time scaffold:
  - `pnpm android:add`
- Sync latest web assets/plugins into native project:
  - `pnpm android:sync`
- Open Android Studio project:
  - `pnpm android:open`
- Build release APK from CLI:
  - `pnpm android:assemble:release`

Canonical build pipeline:

1. `pnpm build`
2. `pnpm exec cap sync android` (or `pnpm android:sync`)
3. Gradle release build (`./gradlew assembleRelease`) from `android/`

## Runtime Behavior

- Desktop runtime keeps using `ElectronStorageAdapter`.
- Android (and non-desktop fallback) uses `CapacitorStorageAdapter`.
- MCP sidecar is desktop-only; Android degrades to client-computed behavior for
  suggestions/object graph/lint where possible.

## Android Vault Directory

- Android vault root is configurable via Settings -> Vault when running without
  desktop bridge.
- Preference key: `dndtools.mobileVaultRoot` (local storage).
- Default root: `dndtools/vault` (app-private storage namespace).
- Changes require app restart to reinitialize storage on the new root.

## Test Coverage Added

- Unit: `src/lib/platform/storage/capacitor-adapter.test.ts`
- E2E (mobile simulation): `tests/e2e/mobile-ui.spec.ts`
