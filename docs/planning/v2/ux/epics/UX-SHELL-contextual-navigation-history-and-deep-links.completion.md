# UX-SHELL — Contextual Navigation, History, and Deep Links — Completion

UX workpack status: `complete`

Epic: `UX-SHELL-contextual-navigation-history-and-deep-links` (phase 02 Shell and Navigation, P0).
Branch: `ux/UX-SHELL-contextual-navigation-history-and-deep-links` (off chain tip
`ux/UX-SHELL-route-layout-and-platform-profiles`).

## Summary

Made the epic-7 shell's contextual navigation, history, and deep links production-grade against the
UX requirements package (`docs/remake-review/ux-requirements/02-navigation-and-platform-profiles.md`):

- **UX-NAV-007 breadcrumbs** — location-style `Section › … › Current` trail with `›` (U+203A)
  separators, second-level-and-deeper only (absent at a section root), a `…` control that expands a
  collapsed deep middle, and compact `‹ <parent>` truncation with a full-path tap-to-expand sheet.
- **UX-NAV-008 backlinks** — a collapsible `complementary` panel with a `Backlinks (N)` count toggle
  (expanded by default when ≥ 1), `Alt+B` to expand-and-focus the first row on Desktop, and a sheet
  on the compact profile. Renders the actor-filtered backlink set verbatim (no leak).
- **UX-NAV-012 scroll restoration** — `history.scrollRestoration = 'manual'` plus
  `beforeNavigate`/`afterNavigate` hooks that record each page's scroll offset and restore it on
  browser back/forward (window scroll on Desktop/landscape, the `<main>` internal scroll on compact),
  while a forward navigation starts at the top; hash jumps stay instant under reduced motion.
- **UX-NAV-016 deep-link unavailable** — a shared, player-safe `DeepLinkUnavailable` surface: one
  generic non-leaking message for hidden/missing/uncached targets, a "Return to Command Center"
  recovery action, and an offline-specific "Content unavailable offline" + retry state gated on the
  genuine offline signal.
- **UX-NAV-017 history** — in-app `← / →` back/forward controls (Must-have parity for PWA/Electron
  chrome-less hosts) wrapping `history.back()/forward()`, alongside the browser's own back/forward
  which keep working because the shell uses ordinary `<a href>`/`goto` (one `pushState` per route).
- **UX-NAV-020 alias transparency** — confirmed/strengthened the existing registry-driven redirect
  stubs: aliases redirect to canonical with params + hash preserved using `replaceState`, so back
  skips the alias; the duplicate-implementation audit gate stays enforced.

Foundations reused, not reimplemented: the core navigation derivations
(`resolveNavigationView`, `resolveRouteFocus`, `resolveDeepLink`, `resolveRouteAlias`), the
`Dialog`/focus-trap a11y primitive for sheets, the platform-profile store, the connectivity probe in
the owned platform layer, and the design tokens.

## Demo path (Desktop / Tablet / Mobile)

- `pnpm --filter @dndtools/v2-app build && pnpm --filter @dndtools/v2-app preview` → http://localhost:4183
- **Desktop (expanded)**: open the Command Center home Scene → breadcrumb shows
  `Command Center › Scenes › <Scene>` with `›` separators and the current crumb `aria-current`;
  the `Backlinks (N)` panel is expanded inline — collapse it, press `Alt+B` to re-expand onto the
  first row. Scroll a tall section (Session), navigate to Atlas, browser-back → scroll restored.
  Use the top-bar `← / →` controls to move through history. A `/maps?...` URL redirects silently to
  `/atlas/?...` (params + hash kept); back skips the alias.
- **Tablet (medium)**: landscape rail / portrait tab bar from epic 7; the breadcrumb full trail
  (landscape) or compact `‹ <parent>` + sheet (portrait) and the backlinks panel/sheet follow the
  same `isCompact` split.
- **Mobile (compact, Pixel 5)**: breadcrumb truncates to `‹ <parent>`; tapping opens the full-path
  sheet. `Backlinks (N)` opens a bottom sheet of rows. Deep-linking a hidden map as a player shows
  the generic "Not available" page with a Return-to-Command-Center action and no entity name; going
  offline switches it to "Content unavailable offline" + retry. In-app `← / →` work in the header.

## Requirement coverage (every mapped ID traced)

- **UX-NAV-007** — `apps/v2/app/src/lib/gui/ux-shell/breadcrumb-model.ts` (pure collapse/truncation
  model) + `apps/v2/app/src/lib/gui/Breadcrumbs.svelte` (separator, `…` expand, compact sheet,
  second-level-and-deeper guard). Tests: `apps/v2/app/tests/unit/breadcrumb-model.test.ts` (AC2/AC3
  collapse + truncation), `apps/v2/app/tests/e2e/nav-shell-history-deep-links.spec.ts` (AC1 absent at
  section root; AC2 trail + `aria-current`), `apps/v2/app/tests/e2e/contextual-navigation.spec.ts`
  (desktop trail + mobile sheet).
- **UX-NAV-008** — `apps/v2/app/src/lib/gui/ux-shell/BacklinksPanel.svelte` (count toggle, `Alt+B`,
  default-expanded, mobile sheet); related links split into `apps/v2/app/src/lib/gui/ContextualNav.svelte`.
  Tests: `nav-shell-history-deep-links.spec.ts` (AC1 count matches rows; AC3 `Alt+B` expand+focus),
  `contextual-navigation.spec.ts` (AC1 navigate + history; mobile sheet). AC2 (player-filtered count)
  is enforced by the actor-filtered core derivation the panel renders verbatim
  (`apps/v2/packages/core/tests/navigation-view.test.ts`), with shell no-leak coverage in
  `command-palette-nav.spec.ts` / `collab-*` specs.
- **UX-NAV-012** — `apps/v2/app/src/lib/platform/scroll-restoration.ts` (keyed position store) +
  `apps/v2/app/src/routes/+layout.svelte` (manual restoration, hash-jump instant scroll). Tests:
  `apps/v2/app/tests/unit/scroll-restoration.test.ts`, `nav-shell-history-deep-links.spec.ts`
  (AC2 back restores offset; AC1 forward starts at top), and the existing
  `apps/v2/app/tests/e2e/route-focus.spec.ts` (AC1 hash focus without announcer; reduced motion is
  honoured because hash `scrollIntoView` is never `smooth`).
- **UX-NAV-016** — `apps/v2/app/src/lib/gui/ux-shell/DeepLinkUnavailable.svelte` +
  `apps/v2/app/src/routes/atlas/+page.svelte` (uses it) over the core `resolveDeepLink`. Tests:
  `nav-shell-history-deep-links.spec.ts` (AC2 hidden target → generic page + recovery action + no
  leak; offline copy + retry), existing `apps/v2/app/tests/e2e/deep-links.spec.ts` (AC1 viewport
  restore; AC2/AC3 hidden/uncached), and `apps/v2/app/tests/e2e/session-prep-recap-and-calendar.spec.ts`
  SES-012 (a link to a DM-only note degrades to unavailable for a player — note no-leak).
- **UX-NAV-017** — `apps/v2/app/src/lib/gui/ux-shell/HistoryControls.svelte` wired into the top bar.
  Tests: `nav-shell-history-deep-links.spec.ts` (in-app back/forward), existing `route-focus.spec.ts`
  (browser back/forward coherence — AC1 spirit), and the alias-back test below (AC2: redirect uses
  `replaceState`).
- **UX-NAV-020** — registry-driven redirect stubs (`apps/v2/app/src/lib/state/alias-redirect.ts`,
  `apps/v2/app/src/routes/{maps,map,home,canvas,preferences,pcs,party,play,sessions}/+page.ts`) over
  the core `resolveRouteAlias`/`auditRouteAliasStubs`. Tests: existing
  `apps/v2/app/tests/e2e/route-aliases.spec.ts` (AC1 params + hash preserved, transparent),
  `apps/v2/app/tests/unit/route-alias-audit.test.ts` (AC2 duplicate-implementation gate),
  `nav-shell-history-deep-links.spec.ts` (replaceState — back skips the alias).

## Actor-safety / no-leak evidence

- Breadcrumb crumbs, the backlinks panel, and the related list all render the
  already-visibility-filtered core derivation (`resolveNavigationView`), so a hidden ancestor,
  backlink source, or projection never appears (and never contributes to the `Backlinks (N)` count).
- `DeepLinkUnavailable` shows the single generic `DEEP_LINK_UNAVAILABLE_MESSAGE` (names no entity)
  identically for hidden/missing/uncached; offline copy is gated on the real offline signal so an
  online-but-hidden target cannot be inferred. Deep-link routes stay a 200 page (no 403/404 leak).
- e2e: a player deep-linking a hidden map sees the generic page with no "Ruined Keep"/"Secret Cellar"
  text; SES-012 proves the same for a DM-only note link. Full suite player/observer no-leak specs
  pass on both profiles.

## Tests run (all green)

- `pnpm --filter @dndtools/v2-core typecheck` ✅ · `pnpm --filter @dndtools/v2-app typecheck` ✅
- App unit: **285 passed (37 files)** ✅ (new `breadcrumb-model.test.ts`, `scroll-restoration.test.ts`).
- `pnpm lint` (eslint + lint:navigation + lint:tokens + a11y:contrast + audit:repo) ✅ ·
  `pnpm lint:nav-registry` ✅ · `pnpm docs:validate` ✅
- `pnpm a11y:axe` ✅ (16/16 on desktop-chromium + mobile-chromium) · `pnpm a11y:report` ✅ PASS
  (0 critical/serious/blocking; known-violation register empty/0 approved; 2 pre-existing moderate
  `landmark-unique` on /characters + /settings page content, logged non-blocking, owned by those
  sections' epics).
- FULL Playwright e2e on BOTH projects (`playwright test`, desktop-chromium + mobile-chromium):
  **594 passed, 24 skipped, 0 failed.**

## Files changed

Code (GUI / platform):
- `apps/v2/app/src/lib/gui/ux-shell/breadcrumb-model.ts` (new), `BacklinksPanel.svelte` (new),
  `HistoryControls.svelte` (new), `DeepLinkUnavailable.svelte` (new)
- `apps/v2/app/src/lib/platform/scroll-restoration.ts` (new)
- `apps/v2/app/src/lib/gui/Breadcrumbs.svelte`, `ContextualNav.svelte` (related-only)
- `apps/v2/app/src/lib/platform/capabilities.ts` (owned `watchConnectivity` probe)
- `apps/v2/app/src/routes/+layout.svelte` (scroll restoration hooks, BacklinksPanel/HistoryControls
  wiring, subheader/breadcrumb second-level rule)
- `apps/v2/app/src/routes/atlas/+page.svelte` (uses `DeepLinkUnavailable`)
- `apps/v2/app/src/routes/styles.css` (breadcrumb `›`/collapse/sheet, backlinks panel, history
  controls, unavailable actions)

Tests:
- New: `apps/v2/app/tests/unit/breadcrumb-model.test.ts`,
  `apps/v2/app/tests/unit/scroll-restoration.test.ts`,
  `apps/v2/app/tests/e2e/nav-shell-history-deep-links.spec.ts`
- Updated: `apps/v2/app/tests/e2e/contextual-navigation.spec.ts` (compact breadcrumb + backlinks sheet)

Docs:
- `docs/planning/v2/ux/epics/UX-SHELL-route-layout-and-platform-profiles.completion.md` (fixed 5
  pre-existing relative test-path references to full repo-relative so `pnpm docs:validate` passes)
- This completion file.

Generated (via UX workpack CLI): `docs/planning/v2/ux/{workpack-state,status}.yaml`,
`docs/planning/v2/ux/epics/UX-SHELL-contextual-navigation-history-and-deep-links.yaml`.

## Key judgment calls

- **Breadcrumb root.** The prototype's location trail is rooted at the Command Center home
  (`Command Center › Section › Entity`), per the established NAV-003 derivation the existing test
  depends on, rather than the UX doc's illustrative section-rooted `Section › Parent › Current`.
  UX-NAV-007's testable rules — absent at section root, `›` separators, `…` collapse, compact
  truncation — are all honoured; this is a presentation choice, not a visibility change.
- **Backlinks empty/loading/error states.** Backlinks derive synchronously from local state
  (local-first; no async load), so loading/error states are not applicable; the `Backlinks (0)`
  empty state is deferred — the shell only mounts the panel when an entity has ≥ 1 authorized
  backlink (kept clean rather than a noisy empty toggle on every page).
- **Compact "More"-sheet sections do a full page navigation** (a pre-existing epic-7 behavior: the
  sheet unmounts mid-click so SvelteKit does not intercept the link), which discards the in-memory
  scroll store. The NAV-012 scroll-restoration coverage therefore exercises direct tabs
  (Session ↔ Atlas) that stay client-side on every profile. The sheet-nav full-reload itself is out
  of scope (owned by the NAV-006 nav-shell epic) and is noted as a follow-up.

## Known gaps / deferred

- Note/object deep-link GUI wiring into the Knowledge route (so a `?note=` link restores the note +
  heading) is owned by the CONTENT epics; the core resolver already fails closed for a hidden note
  (covered by SES-012 e2e + content-query visibility tests).
- The `Backlinks (0)` empty state and async loading/error states are deferred (synchronous
  local-first derivation; see judgment calls).
- Compact "More"-sheet navigation full-reload (pre-existing) — recommend the NAV-006 epic close the
  sheet via `afterNavigate`/programmatic `goto` so overflow-section navigation stays client-side.

## Git

Branch: `ux/UX-SHELL-contextual-navigation-history-and-deep-links`. Commit created together with this
completion file and the regenerated `docs/planning/v2/ux/**`
(`feat(v2-ux): UX-SHELL contextual navigation, history, deep links`). Final `git status --short` is
clean after commit.

### git status --short (pre-complete working tree)

```
 M apps/v2/app/src/lib/gui/Breadcrumbs.svelte
 M apps/v2/app/src/lib/gui/ContextualNav.svelte
 M apps/v2/app/src/lib/platform/capabilities.ts
 M apps/v2/app/src/routes/+layout.svelte
 M apps/v2/app/src/routes/atlas/+page.svelte
 M apps/v2/app/src/routes/styles.css
 M apps/v2/app/tests/e2e/contextual-navigation.spec.ts
 M docs/planning/v2/ux/epics/UX-SHELL-contextual-navigation-history-and-deep-links.yaml
 M docs/planning/v2/ux/epics/UX-SHELL-route-layout-and-platform-profiles.completion.md
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
?? apps/v2/app/src/lib/gui/ux-shell/
?? apps/v2/app/src/lib/platform/scroll-restoration.ts
?? apps/v2/app/tests/e2e/nav-shell-history-deep-links.spec.ts
?? apps/v2/app/tests/unit/breadcrumb-model.test.ts
?? apps/v2/app/tests/unit/scroll-restoration.test.ts
?? docs/planning/v2/ux/epics/UX-SHELL-contextual-navigation-history-and-deep-links.completion.md
```
