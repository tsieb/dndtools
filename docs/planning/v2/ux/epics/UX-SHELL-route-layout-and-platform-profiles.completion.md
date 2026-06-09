# UX-SHELL — Route Shell, Landmarks, and Platform Profiles — Completion

UX workpack status: `complete`

Epic: `UX-SHELL-route-layout-and-platform-profiles` (phase 02 Shell and Navigation, P0).
Branch: `ux/UX-SHELL-route-layout-and-platform-profiles` (off chain tip
`ux/UX-A11Y-spatial-live-region-and-leakage`).

## Summary

Built the production application shell that every route renders within: the seven-section global
navigation presented per platform profile (Desktop persistent sidebar + icon-rail collapse, Tablet
landscape rail / portrait tab bar, Mobile bottom tab bar + "More" sheet), ARIA landmark structure
with a skip-to-content link, single `h1` + stable page title per route, live route announcement,
`Alt+<n>` / `Alt+Shift+H` keyboard parity, and `data-input-modality` focus-ring policy.

It CONSUMES the phase-00 contracts rather than redefining them:

- The seven-destination ordering and the Scenes/Audio/MCP "non-global capability" classification are
  taken from `docs/planning/v2/ux/navigation-registry.yaml` (UX-NAV-002). The GUI presentation list
  in `apps/v2/app/src/lib/navigation/global-nav.ts` is pinned to that contract by
  `tests/unit/global-nav.test.ts`, so it cannot drift.
- Per-section title / route / landmark / actor-availability come from the functional registry's
  actor-filtered view (`listNavigationRegistryForActor`), so DM-only / observer-hidden sections are
  ABSENT from the nav data (not hidden) — the same source the command palette and visible controls
  read (NAV-010).
- Tokens (epic 2), density/motion (epic 3), the icon registry (epic 4), and the a11y primitives
  (`Dialog`/focus-trap, `LiveRegion`/announcer — epics 5–6) are reused, not reimplemented.

## Demo path (Desktop / Tablet / Mobile)

- `pnpm --filter @dndtools/v2-app build && pnpm --filter @dndtools/v2-app preview`
- Desktop (≥1200px / `expanded`): persistent labelled sidebar of the seven sections in canonical
  order; `nav-collapse-toggle` collapses to a 56px icon rail (tooltips/accessible names retained;
  persisted across reload); top bar holds only command palette + view-as + help.
- Tablet (`medium`): landscape → icon+label rail; portrait → bottom tab bar + "More" sheet
  (orientation resolved in the platform layer, `data-orientation`).
- Mobile (`compact`, Pixel 5): bottom tab bar with four direct tabs (Command Center, Session,
  Characters, Atlas) + "More" overflow sheet (Campaign, Knowledge, Settings); content area is the
  single internal scroll region above the bar.
- All profiles: `Tab` reveals the skip link first; `Alt+4` → Atlas, `Alt+6` → Knowledge (an overflow
  section — proving keyboard reaches every section, not only visible tabs), `Alt+Shift+H` → Command
  Center, each announced via the route live region. Switch "View as" to a player/observer to see
  DM-only/observer-hidden sections vanish from the nav DOM.

## Requirement coverage (every mapped ID traced)

- UX-NAV-001 (Command Center is home): home pinned first; `home` icon; `Alt+Shift+H`; route `/`
  reflected in landmark/title/announcement. `route-shell.spec.ts` keyboard test; `canonical-sections`.
- UX-NAV-003 (three-tier hierarchy): Tier 1 = `GlobalNav` (`nav[aria-label="Primary navigation"]`);
  Tier 2/3 = existing `LocalNav` / `Breadcrumbs` / `ContextualNav` in the subheader, derived once from
  the route via `resolveNavigationView`. Distinct landmark labels (`route-shell.spec.ts` landmarks
  test; `contextual-navigation.spec.ts`).
- UX-NAV-004 (Desktop sidebar + icon-rail collapse): `GlobalNav` sidebar surface; `NavChromeStore`
  persists collapse (never default); accessible name retained when icon-only. `route-shell.spec.ts`
  collapse test.
- UX-NAV-005 (Tablet rail/tab bar): `data-surface` = rail (landscape) / tabbar (portrait) from the
  platform-layer orientation probe; same section set/order; no hamburger. Unit-covered via
  `splitForTabBar`; presentation driven by `data-viewport`+`data-orientation`.
- UX-NAV-006 (Mobile bottom tab bar + section sheets): ≤5 tabs + focus-trapped "More" sheet (shared
  `Dialog`). `route-shell.spec.ts` mobile tab-bar test; `command-palette-nav.spec.ts`.
- UX-NAV-009 (skip link + landmarks): `.skip-link` first focusable → `#main-content`; `<header>`
  banner, `nav[aria-label="Primary navigation"]`, `<main id="main-content">`. `route-shell.spec.ts`
  skip-link + landmark tests; axe `landmark` rules clean on all 8 routes.
- UX-NAV-010 (single `h1` + stable title): shell-owned single `h1` + `document.title` from
  `resolveShellRouteAccessibility` (also fills the approved-but-planned Knowledge/Campaign titles +
  landmarks, role-filtered so it never leaks). `route-accessibility.spec.ts`.
- UX-NAV-011 (live route announcement): polite `route-announcer` set on navigation completion;
  suppressed on hash-only jumps; announced even on cold load. `route-accessibility.spec.ts`,
  `route-focus.spec.ts`.
- UX-NAV-018 (input modality + focus-ring policy): `InputModalityStore` sets
  `data-input-modality` (keyboard/pointer/touch); `:focus-visible` baseline retained; touch suppresses
  hover-only rail tooltips. `route-shell.spec.ts` modality test.
- Honored cross-cutting UX-NAV-002 (seven-section canonical order, capabilities excluded) and
  UX-NAV-013 (actor-filtered, no-leak): `command-palette-nav.spec.ts`, `canonical-sections.spec.ts`,
  `global-nav.test.ts`.

## Actor-safety / no-leak evidence

- `buildGlobalNav` is fed only the actor-filtered IA, so a player/observer's nav has no DM-only
  capability and no observer-hidden section in the DOM (verified, not `display:none`).
- `global-nav.test.ts`: observer nav = `[command-center, session, atlas, settings]`; Characters /
  Campaign / Knowledge absent; positions stay sequential.
- `command-palette-nav.spec.ts`: observer view-as → `nav-characters/campaign/knowledge` count 0;
  `primary-nav` text never contains "Characters"; Scenes/Audio/MCP never primary-nav items for anyone.
- `resolveShellRouteAccessibility` fails closed to the app-name fallback for a section the actor
  cannot reach (no leaked title on deep-link).

## Tests run (all green)

- `pnpm --filter @dndtools/v2-core typecheck` ✅ · `pnpm --filter @dndtools/v2-app typecheck` ✅
- Core unit: 2838 passed (182 files) ✅ · App unit: 275 passed (35 files) ✅ (new
  `global-nav.test.ts`; updated `navigation-location.test.ts`, `route-audit.test.ts`).
- `pnpm v2:lint` (boundary) ✅ · `pnpm lint` (eslint + lint:navigation + lint:tokens + a11y:contrast +
  audit:repo) ✅ · `pnpm lint:nav-registry` ✅ · `pnpm docs:validate` ✅
- `pnpm a11y:axe` ✅ (16/16, both projects, incl. new `/campaign`) · `pnpm a11y:report` ✅ PASS
  (0 critical/serious/blocking; register empty; 2 pre-existing moderate `landmark-unique` on
  /characters + /settings page content — non-blocking, present on those pages' own content, not the
  shell, since the 6 other routes that share the shell are clean).
- FULL Playwright e2e on BOTH projects (`pnpm test:e2e`, desktop-chromium + mobile-chromium):
  **577 passed, 23 skipped, 0 failed.**

## Files changed

Code (GUI/platform):
- `apps/v2/app/src/lib/navigation/global-nav.ts` (new), `route-a11y.ts` (new)
- `apps/v2/app/src/lib/gui/GlobalNav.svelte` (new)
- `apps/v2/app/src/lib/platform/input-modality.svelte.ts` (new), `nav-chrome.svelte.ts` (new)
- `apps/v2/app/src/lib/platform/capabilities.ts`, `platform-profile.svelte.ts` (orientation probe)
- `apps/v2/app/src/lib/state/navigation-location.ts` (map all seven section roots)
- `apps/v2/app/src/routes/+layout.svelte` (shell restructure), `styles.css` (shell/profile CSS)
- `apps/v2/app/src/routes/campaign/+page.svelte` + `+page.ts` (new honest-empty-state root)
- `apps/v2/app/platform-access-exceptions.json` (scoped localStorage exception for nav-chrome)

Tests:
- New: `tests/unit/global-nav.test.ts`, `tests/e2e/route-shell.spec.ts`, `tests/e2e/_nav-helper.ts`
- Updated: `tests/unit/navigation-location.test.ts`, `tests/unit/route-audit.test.ts`,
  `tests/e2e/{a11y-axe-gate,canonical-sections,command-center,command-palette-nav,help-and-interaction-primitives,onboarding,route-accessibility,route-focus}.spec.ts`

Generated (via UX workpack CLI): `docs/planning/v2/ux/{workpack-state,status}.yaml`,
`docs/planning/v2/ux/epics/UX-SHELL-route-layout-and-platform-profiles.yaml`.

## Key judgment calls

- Removed Scenes/Audio/MCP from the primary nav (they were rendered for the DM before): the accepted
  contract (`navigation-registry.yaml` followUps) makes that exactly this epic's job. Scenes stays
  reachable via the command palette / direct link, so no Must-have action became unreachable.
  Specs that navigated via `nav-scenes` were repointed to the command palette path / direct
  `goto('/scenes/')` (root cause, not weakened assertions).
- The compact bottom tab bar is in normal flow inside a `100dvh` flex column with an internal-scroll
  content region — NOT `position: fixed`. A fixed bottom bar on the emulated Pixel-5 viewport let
  taps fall through to content behind it (layout vs visual viewport mismatch), which would have
  broken mobile hit-testing on shared routes. The in-flow layout keeps the bar always visible and the
  content never overlaps it.
- Did NOT change the functional core registry's `releaseStatus` for Knowledge/Campaign; instead the
  shell presents them (with scaffolded honest-empty-state roots) and resolves their accessibility
  from the actor-filtered IA, keeping the functional contract untouched.

## Known gaps / deferred

- Tablet rail/portrait split is logic- and unit-tested and CSS-driven, but not directly exercised by
  the two Playwright projects (no tablet device project exists); covered by the orientation logic +
  `splitForTabBar` unit tests.
- Sidebar drag-to-resize (UX-NAV-004 continuous width) is not implemented; the icon-rail collapse
  toggle (pointer + `Ctrl+\`-class keyboard parity via the toggle button) satisfies the keyboard path.
- Deep-link "unavailable" page for an actor typing a route they cannot reach (UX-NAV-016) is out of
  this epic's scope; the shell already fails closed to the app-name title (no leak) for that case.
- Pre-existing moderate `landmark-unique` on /characters + /settings page content (logged,
  non-blocking) is owned by those sections' epics.

## Git

Branch: `ux/UX-SHELL-route-layout-and-platform-profiles`. Commit: created together with this
completion file and the regenerated `docs/planning/v2/ux/**` (see
`feat(v2-ux): UX-SHELL route shell, landmarks, platform profiles`). Final `git status --short` is
clean after commit.

### git status --short (pre-commit working tree)

```
 M apps/v2/app/platform-access-exceptions.json
 M apps/v2/app/src/lib/platform/capabilities.ts
 M apps/v2/app/src/lib/platform/platform-profile.svelte.ts
 M apps/v2/app/src/lib/state/navigation-location.ts
 M apps/v2/app/src/routes/+layout.svelte
 M apps/v2/app/src/routes/styles.css
 M apps/v2/app/tests/e2e/a11y-axe-gate.spec.ts
 M apps/v2/app/tests/e2e/canonical-sections.spec.ts
 M apps/v2/app/tests/e2e/command-center.spec.ts
 M apps/v2/app/tests/e2e/command-palette-nav.spec.ts
 M apps/v2/app/tests/e2e/help-and-interaction-primitives.spec.ts
 M apps/v2/app/tests/e2e/onboarding.spec.ts
 M apps/v2/app/tests/e2e/route-accessibility.spec.ts
 M apps/v2/app/tests/e2e/route-focus.spec.ts
 M apps/v2/app/tests/unit/navigation-location.test.ts
 M apps/v2/app/tests/unit/route-audit.test.ts
 M docs/planning/v2/ux/epics/UX-SHELL-route-layout-and-platform-profiles.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
?? apps/v2/app/src/lib/gui/GlobalNav.svelte
?? apps/v2/app/src/lib/navigation/
?? apps/v2/app/src/lib/platform/input-modality.svelte.ts
?? apps/v2/app/src/lib/platform/nav-chrome.svelte.ts
?? apps/v2/app/src/routes/campaign/
?? apps/v2/app/tests/e2e/_nav-helper.ts
?? apps/v2/app/tests/e2e/route-shell.spec.ts
?? apps/v2/app/tests/unit/global-nav.test.ts
?? docs/planning/v2/ux/epics/UX-SHELL-route-layout-and-platform-profiles.completion.md
```
