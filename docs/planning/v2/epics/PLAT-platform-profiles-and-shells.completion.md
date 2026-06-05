# PLAT-platform-profiles-and-shells — Completion Evidence

Epic: `PLAT-platform-profiles-and-shells` — PLAT: Platform profiles and shells
Requirements: PLAT-001, PLAT-002, PLAT-003, PLAT-004, PLAT-005, PLAT-016
Branch: `epic/PLAT-platform-profiles-and-shells` (cut from prior epic HEAD `b4991b5`, not master)

## Summary

Delivers the platform-profile spine and the web/PWA shell capabilities for the first v2 slice,
honoring ADR-014's scope: the web/PWA profile is implemented for real; desktop and
Android/Capacitor ship as typed, declared-unavailable capability descriptors and type-only
service contracts (no native shell built). All work reuses the prior epic's boundary
infrastructure (`scripts/v2-boundary-lint.ts`, `platform-access-exceptions.json`, the type-only
`*.contract.ts` path, the platform-service boundary) — no parallel mechanisms were invented.

Key additions:

- **PLAT-001 (the spine):** a pure core capability-descriptor module
  (`apps/v2/packages/core/src/platform/platform-profile.ts`) with the four declared
  `PlatformProfile` descriptors and a deterministic `selectPlatformProfile(env)` resolver that
  picks a profile from an **environment descriptor** (viewport class + input modality + declared
  shell), never raw pixel width. The app shell (`PlatformProfileStore`) resolves the full
  descriptor once via the platform-layer probe and hands it to GUI packages; feature components
  branch on `profile.capabilities`. The no-raw-viewport-sniffing rule is **mechanically enforced**
  by a new boundary-lint rule that fails closed on `innerWidth`/`matchMedia`/`screen.*` in any
  GUI/route component (the single owned width read lives behind a scoped exception).
- **PLAT-004 (web/PWA, the only real shell):** the web descriptor wires browser-safe storage
  (IndexedDB), service-worker cache, and cloud-cache capability flags; native-only services are
  `unsupported`. A `CapabilityStatus` view renders degraded capability status on Settings.
- **PLAT-002 / PLAT-005 (deferred native shells):** type-only `desktop-shell.contract.ts` and
  `android-shell.contract.ts` declare the trusted platform-service interfaces (filesystem,
  dialogs, updates, protocol, titlebar, context menus, file watching, MCP sidecar; Capacitor
  storage/share-import/keyboard) so feature components compile and degrade against the
  declared-unavailable descriptors. No native API is exposed to feature components — the boundary
  lint stays green. PLAT-002's titlebar control visibility and target-size audit are implemented
  as pure core helpers.
- **PLAT-003 (mobile density):** the Scene editor renders a **focused stacked view** (one widget
  at a time, prev/next) and an **add-widget drawer** on the compact profile, backed by the **same
  Scene state and the same commands** as the desktop grid — no parallel data model. The shared
  per-widget rendering is a single Svelte snippet reused in both densities.
- **PLAT-016:** a published web/PWA **support matrix** data artifact
  (`support-matrix.ts`) covering notes, maps, Scenes, characters, sessions, handouts, assets,
  search, graph, and sync status, plus an unsupported-feature list. `capabilityForFeature` /
  `domainSupportLevel` **fail closed to `unsupported`** for unknown keys. A `SupportMatrix` view
  renders it on Settings.

## Demo path / notes

Visible behavior:

1. `pnpm v2:dev`, open `/settings/`.
   - **PLAT-001/004/002/005:** the "Platform capability status" section
     (`data-testid="capability-status"`) shows the resolved profile and every platform service.
     Native-only services (trusted filesystem, OS credential store, protocol handler, MCP
     sidecar) read `unsupported`; the web shell's real capabilities (service-worker cache, cloud
     cache) read `available`.
   - **PLAT-016:** the "Web / PWA support matrix" section
     (`data-testid="support-matrix"`) lists every core domain with a support level, offline
     behavior, auth requirement, and fallback, plus the unsupported native features.
2. **PLAT-003 (mobile density):** run the app in a compact/mobile viewport (the Playwright
   `mobile-chromium` / Pixel 5 project), create a Scene from `/scenes/`, open it, and add widgets
   via the **Add widget drawer** (`data-testid="toggle-add-widget"`). Widgets are operated through
   the **focused view** (`data-testid="focused-widget-view"`) one at a time with prev/next
   (`focus-prev-widget` / `focus-next-widget`); the dense `widget-grid` is absent. The same Scene
   state and the same layout commands back both densities (open the same Scene in a desktop
   viewport to see the grid).

The PLAT-001 no-raw-viewport-sniffing rule is developer-facing and proven by tests: `pnpm v2:lint`
passes on the clean tree and fails closed on a planted `window.innerWidth`/`matchMedia` access in a
GUI/route component.

## Requirement traceability

| Req      | Statement (abridged)                                                                                                             | Implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Tests                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLAT-001 | Shell selects profile at runtime from capability descriptors, not raw viewport width in feature components                       | `apps/v2/packages/core/src/platform/platform-profile.ts` (`PlatformProfile`, `PlatformEnvironmentDescriptor`, `selectPlatformProfile`, `isCompactPresentation`); `apps/v2/app/src/lib/platform/platform-profile.svelte.ts` (`PlatformProfileStore` resolves the descriptor and exposes `profile`/`capabilities`); `apps/v2/app/src/lib/platform/capabilities.ts` (`probeEnvironment` — the single owned width read); new `viewport-sniff` lint rule in `scripts/v2-boundary-lint.ts` + exception entry in `platform-access-exceptions.json` | `apps/v2/packages/core/tests/platform-profile.test.ts` (descriptor-driven selection incl. touch+compact→mobile AC1, declared-shell wins, deterministic); `apps/v2/app/tests/unit/platform-profile-store.test.ts` (store delegates, exposes capabilities); `apps/v2/app/tests/unit/boundary-lint.test.ts` (planted `innerWidth`/`matchMedia` in a GUI/route file caught AC2; probe behind exception passes) |
| PLAT-002 | Desktop shell: trusted FS, dialogs, updates, protocol, titlebar, context menus, file watching, MCP sidecar behind typed services | `apps/v2/packages/core/src/contracts/desktop-shell.contract.ts` (type-only typed service interfaces incl. IPC request shape AC1); `apps/v2/packages/core/src/platform/titlebar.ts` (`titlebarControlsForState` AC2, `auditTitlebarTargets` AC3, chrome baseline + titlebar height); desktop descriptor in `platform-profile.ts` (declared-unavailable)                                                                                                                                                                                      | `apps/v2/packages/core/tests/titlebar.test.ts` (control visibility per window state AC2; target-size audit below-baseline + exceeds-height, reports all offenders AC3); `platform-profile.test.ts` (desktop services declared not-available; shell deferred)                                                                                                                                               |
| PLAT-003 | Mobile density-reduced access to all Must-have commands via sheets/drawers/focused views, no alternate data model                | `apps/v2/app/src/routes/scene/[id]/+page.svelte` (compact: focused stacked widget view + add-widget drawer, shared `widgetCard` snippet, same `summary.widgets` state and same layout/add commands); `isCompactPresentation` gate via `profile.isCompact`                                                                                                                                                                                                                                                                                   | `apps/v2/app/tests/e2e/platform-profiles.spec.ts` (`mobile-chromium`: focused view backed by same Scene state AC1, add-widget reached through drawer AC2, `widget-grid` absent)                                                                                                                                                                                                                            |
| PLAT-004 | Web/PWA uses browser-safe storage + cloud-cache, preserves local-first for cached vault content                                  | Web descriptor in `platform-profile.ts` (`storage: 'indexeddb'`, `serviceWorkerCache`/`cloudCache` available, native-only unsupported); `apps/v2/app/src/lib/gui/CapabilityStatus.svelte` (degraded capability status AC2); support-matrix offline/queued-write/auth policy (`support-matrix.ts`) models cached read/edit offline (AC1), first-time-setup-offline, offline auth expiry → local/queued + reauth on reconnect, and SW-update preserves writes                                                                                 | `apps/v2/packages/core/tests/support-matrix.test.ts` (offline behavior, sync-status reauth-on-reconnect, asset eviction); `platform-profile.test.ts` (web real capabilities available, native unsupported); `platform-profiles.spec.ts` (capability status shows unsupported vs available)                                                                                                                 |
| PLAT-005 | Android/Capacitor services for storage, file access, keyboard, share/import; no native APIs exposed to feature components        | `apps/v2/packages/core/src/contracts/android-shell.contract.ts` (type-only: filesystem, share/import returning a platform-service result not raw native access AC1, keyboard-insets service AC2); mobile/tablet descriptors in `platform-profile.ts` (`storage: 'capacitor-filesystem'`, declared-unavailable)                                                                                                                                                                                                                              | `platform-profile.test.ts` (mobile/tablet declared not-available, shells deferred); boundary lint keeps the Capacitor bridge rule green (no native bridge import added)                                                                                                                                                                                                                                    |
| PLAT-016 | Web/PWA cached read/write support matrix over notes…sync status + unsupported features                                           | `apps/v2/packages/core/src/platform/support-matrix.ts` (`WEB_SUPPORT_MATRIX` data artifact: per-domain support level + fallback AC1, auth/cache/quota/eviction policy AC2, asset eviction AC3, queued-write replay AC4, unsupported native features AC5; `capabilityForFeature`/`domainSupportLevel` fail closed); `apps/v2/app/src/lib/gui/SupportMatrix.svelte` (rendered view)                                                                                                                                                           | `apps/v2/packages/core/tests/support-matrix.test.ts` (all domains covered, levels+fallbacks AC1, auth/cache/eviction AC2, eviction recovery AC3, native unsupported + fail-closed unknown AC5, matrix↔profile consistency); `platform-profiles.spec.ts` (matrix rows + unsupported features visible)                                                                                                       |

### PLAT-002/PLAT-005 native-shell scope (declared deferred gap)

Desktop (Electron) and Android (Capacitor) shells ship as **typed contracts + declared-unavailable
capability descriptors only**. There is no Electron main process and no Capacitor native bridge in
this slice (ADR-014 scopes the first slice to web/PWA). The descriptors mark deferred services
`unavailable` (vs structurally-impossible `unsupported`) so a later epic flips them to `available`
when the real shell is wired — without changing any feature-component code. No native API is exposed
to feature components; the prior epic's boundary lint (no direct Electron/Capacitor bridge) stays
green.

## Tests run (all pass)

- `pnpm v2:lint` (boundary lint incl. the new PLAT-001 viewport-sniff rule): PASS (clean tree;
  planted-violation regression tests prove it fails closed).
- `pnpm v2:workpack:validate`: PASS (before and after `complete`; no drift).
- `pnpm v2:typecheck`: 0 errors (core `tsc --noEmit`; app `svelte-check` 571 files, 0 errors/warnings).
- `@dndtools/v2-core` Vitest: 34 files, 363 tests PASS (was 326; +37 across platform-profile,
  support-matrix, titlebar).
- `@dndtools/v2-app` Vitest: 11 files, 52 tests PASS (was 44; +8 across the profile store and the
  new boundary-lint viewport regressions).
- Playwright `apps/v2/app/tests/e2e/platform-profiles.spec.ts`: desktop-chromium 3 passed + 1 skipped
  (PLAT-003 is compact-only); mobile-chromium 4 passed (incl. PLAT-003 focused view).
- Playwright regression on desktop-chromium: `scene-create` + `scene-accessibility` +
  `route-accessibility` (14 passed) and `diagnostics` + `command-center` (9 passed, 1 pre-existing
  slim-profile skip). No regressions from the Scene-editor snippet refactor or the Settings additions.

## Quality review

- **Correctness:** every mapped acceptance criterion has an implementation and a test; selection
  and fail-closed paths are covered by negative tests (unknown service/domain → unsupported;
  planted viewport sniff caught).
- **Architecture:** obeys ADR-014 and the contracts. Core platform modules are pure (no DOM/Svelte/
  platform imports — the core boundary lint still passes). The shell owns profile detection and
  passes the descriptor to GUI (Contract 1 binding rule 1); the same commands produce the same core
  result on every profile (PLAT-003 reuses the identical command set). No v1 runtime imports were
  added or needed.
- **Tests:** unit (core profile resolver, support matrix, titlebar audit, app store), boundary
  regression (planted viewport sniff fails closed; probe behind exception passes), and e2e (visible
  capability status, support matrix, mobile focused view).
- **a11y:** the focused view exposes prev/next buttons with text labels and a position indicator;
  the support matrix uses a real `<table>` with `<th scope>`; capability statuses carry
  `data-status` and a visible text label. The compact drawer toggle uses `aria-expanded` +
  `aria-controls`. The shared widget snippet preserves the existing focus-order/toolbar a11y.
- **Performance:** profile selection is O(1) pure logic run once per resize (not per render); the
  matrix is a static artifact. No hot-loop additions.
- **Security:** native-only capabilities fail closed to `unsupported`; `capabilityForFeature` and
  `matrixServiceInconsistencies` prevent a feature from claiming a service the profile lacks. No
  native API is exposed to feature components.
- **Permissions/persistence/sync/offline:** no changes to permission, visibility, persistence, or
  sync semantics. PLAT-003 reuses the same commands → the same operation validation, persistence,
  and actor filtering as desktop. The matrix documents (does not change) the local-first offline
  and queued-write/replay model (Contract 2).
- **UX:** the compact profile shows one work surface at a time with reachable controls; degraded
  and unsupported states are visible with action-oriented fallbacks. Empty Scene state shows the
  existing empty message.
- **Maintainability:** small typed modules; the lint and exception manifest were extended in place,
  not forked; the per-widget UI is a single shared snippet, avoiding duplicate markup across
  densities.
- **Docs:** this completion file; inline rationale comments on every new module and boundary rule.

## Known gaps / deferred items

- **Desktop (Electron) and Android (Capacitor) native shells are intentionally deferred** (ADR-014
  first-slice scope). Only the typed service contracts + declared-unavailable capability
  descriptors ship; the real Electron main process, Capacitor native bridge, titlebar DOM controls,
  and live virtual-keyboard inset wiring are not built. The contracts and descriptors are the seams
  a later epic wires unchanged.
- The titlebar `auditTitlebarTargets` is a pure, test-covered helper; it is not yet run against a
  live desktop titlebar DOM because there is no desktop shell DOM in this slice.
- Cloud-cache / service-worker behavior is modeled as capability flags + the support-matrix policy
  artifact; an actual service worker and cloud transport are out of scope per ADR-014 (the matrix
  declares the intended policy for the release review).
- The support matrix and capability status render on the existing Settings route rather than a new
  canonical Navigation Section, to avoid IA/workpack drift outside this epic's scope.

## Stop conditions

None hit. ADR-014 is Accepted and consistent with the approach (it explicitly scopes the first
slice to web/PWA and defers native shells, which this epic honors); no v1 runtime imports were
required; no hidden visibility/permission/sync/persistence behavior was ambiguous; the generated
workpack validates; `git status --short` showed no unrelated overlapping changes.

## Git evidence

Workpack status: `complete` after running
`pnpm v2:workpack:complete -- --epic PLAT-platform-profiles-and-shells` (re-validated clean, no drift).

- Branch: `epic/PLAT-platform-profiles-and-shells`
- Base: `b4991b5` (prior completed epic HEAD `PLAT-persistence-and-boundaries`)
- Commit: recorded at handoff (this file is committed with the epic work).
- Final `git status --short` after the epic commit: clean (empty) — no untracked or unstaged files
  caused by this epic. The full output is captured in the handoff report.
