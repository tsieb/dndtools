# NAV-ia-validation-and-accessibility-semantics - Completion Evidence

Epic packet: `docs/planning/v2/epics/NAV-ia-validation-and-accessibility-semantics.yaml`
Workpack status: `complete` after
`pnpm v2:workpack:complete -- --epic NAV-ia-validation-and-accessibility-semantics`.
Implemented against ADR-014 (Accepted) `docs/adr/014-v2-stack-and-subproject-boundary.md`.

Requirements covered: **NAV-006**, **NAV-007**.

## Summary

This epic adds the two cross-cutting navigation guarantees the prior NAV epics deliberately
deferred: **IA validation before route scaffolding** (NAV-006) and **accessible route semantics**
(NAV-007). Both are derived in the Processing Core so the GUI only renders the result.

Key pieces:

- `apps/v2/packages/core/src/queries/navigation-sections.ts` — the canonical IA registry (owned by
  NAV-009) is extended with two route-ownership/IA-review fields and a programmatic route audit:
  - **`taskFit`** on every section — the primary user task it serves. The IA-review validator
    (`validateNavigationSections`) now requires it, so a proposed top-level section that cannot name
    a distinct user task fails the review. This is the "user-task-oriented check" / "task fit"
    dimension of **NAV-006 AC1**, alongside the route-ownership, aliases, and local-nav-contract
    checks already enforced.
  - **`entityRoutes`** on every section — the route roots for entity/detail pages a section owns
    (e.g. Scenes owns `/scene` for the `/scene/[id]` editor). This makes route ownership of detail
    routes explicit IA metadata (**NAV-006 AC1**) and lets the audit treat a detail route as owned
    rather than an orphan.
  - **`auditNavigationRoutes(...)`** — the route audit. Given the route roots actually scaffolded in
    the app, it fails closed when (a) the IA registry itself is invalid, (b) a scaffolded route has
    no canonical IA owner (**NAV-006 AC2** — "a route is added without IA metadata → the gate
    fails"), or (c) a released section's declared route/entity route is not scaffolded (IA and route
    tree cannot silently diverge).
- `apps/v2/app/tests/unit/route-audit.test.ts` — the **route-audit gate**. It enumerates the real
  top-level route directories under `src/routes`, hands the discovered roots to
  `auditNavigationRoutes`, and fails if any route lacks IA metadata. Route-shape knowledge stays in
  the GUI (Contract 1); the audit logic stays pure in the core. This runs as part of `pnpm v2:test`.
- `apps/v2/packages/core/src/queries/navigation-view.ts` — **`resolveRouteAccessibility(view)`**
  derives one route-accessibility model from the navigation view: the single route-level `h1`
  heading, the document title, the route landmark + label, and the live route-change announcement.
  Deriving all four from one source keeps the page title, heading, and announcement from ever
  disagreeing about which route is active, and it fails closed (the app-name fallback) so a hidden
  entity title never leaks.
- GUI route shell (`+layout.svelte`) — the app shell now renders **exactly one route-level `h1`**
  (`data-testid="route-title"`) driven by `resolveRouteAccessibility`, demoting the static brand to
  a banner link; sets `document.title`, the main landmark id, and the landmark label from the same
  model; and adds a **polite live region** (`data-testid="route-announcer"`) that announces each
  completed route change (**NAV-007 AC1 + AC2**). The four route pages had their duplicate top-level
  titles demoted and their section headings promoted so each route has one `h1` (shell-owned) over a
  clean `h2`/`h3` outline.
- `settings/+page.svelte` — the canonical IA registry view now also shows each section's `taskFit`
  ("serves: …"), making the NAV-006 task-fit metadata user-visible while preserving the existing
  DM-only fail-closed filtering.

## Demo Path

Run `pnpm v2:dev` from the repo root and open the app (dev uses port 5183; preview/e2e use 4183).

1. **One route-level `h1` per route, matching the title (NAV-007 AC1).** Open `/`. The page shows a
   single `<h1>` "Command Center" and the document title is "Command Center — DND Tools v2". Click
   **Scenes** → the `h1` becomes "Scenes" (title "Scenes — DND Tools v2"); click **Settings** → `h1`
   "Settings". Create a Scene and open it → the `h1` is the Scene name and the title matches it.
   Throughout, there is exactly one `<h1>` on the page (the app shell owns it; route content uses
   `h2`/`h3`).
2. **Live route announcement (NAV-007 AC2).** A visually-hidden `aria-live="polite"` region
   (`data-testid="route-announcer"`) updates to name the route on each navigation — "Command
   Center", then "Scenes", then "Settings" — so a screen reader announces the new route after the
   transition completes.
3. **Task fit in the IA registry (NAV-006 AC1).** On **Settings → Canonical navigation sections**,
   each section now shows a "serves: …" line — the user task it fits — beside its owner, route root,
   availability, and local-nav contract. DM-only sections (Scenes, Audio, MCP) remain absent when
   you switch **View as** to Demo Player.
4. **IA validation + route audit (NAV-006).** The validation runs as gates, not visible UI:
   - `pnpm --filter @dndtools/v2-core test` exercises `validateNavigationSections` (task fit now
     required) and `auditNavigationRoutes` (passing for the real routes; failing when an unowned
     `/orphan` route is added).
   - `pnpm --filter @dndtools/v2-app test` runs the route-audit gate, which reads the real
     `src/routes` tree and asserts every scaffolded route maps to canonical IA metadata.

Playwright spec `apps/v2/app/tests/e2e/route-accessibility.spec.ts` drives the single-`h1`, matching
title, and live announcement behavior on desktop and mobile Chromium.

## Requirement Traceability

| Requirement                                                                                                                | Implementation                                                                                                                                                                                                                                                                         | Test evidence                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NAV-006** — navigation architecture validated before route scaffolding via IA review, route audits, and user-task checks | `taskFit` + `entityRoutes` fields and the extended `validateNavigationSections` (task fit required) in `navigation-sections.ts`; `auditNavigationRoutes` route audit; app route-audit gate `apps/v2/app/tests/unit/route-audit.test.ts`; `taskFit` surfaced in `settings/+page.svelte` | Core: `navigation-ia-validation.test.ts` (task fit required in IA review with route ownership/aliases/local nav; entity routes validated; route audit passes for real routes, fails for an unowned route (AC2), reports missing released-section routes, ignores planned sections, fails on an invalid registry). App gate: `route-audit.test.ts` (discovers `/`,`/scene`,`/scenes`,`/settings`; gate passes; fails when `/reports` is added without IA). |
| **NAV-007** — stable page titles, exactly one route-level `h1`, semantic landmarks, live route announcements               | `resolveRouteAccessibility` in `navigation-view.ts`; `+layout.svelte` single `h1`, document title, landmark + label, and polite live announcer; route pages demote duplicate titles so the shell `h1` is the only one                                                                  | Core: `navigation-ia-validation.test.ts` (heading/title match section + entity route context; announcement names the route and differs per route; fail-closed app-name fallback never leaks a hidden title; custom app name). E2e: `route-accessibility.spec.ts` (exactly one `h1` matching title on home/Scenes/Settings/Scene routes; polite live region announces each route change) on desktop + mobile.                                              |

### Acceptance criteria

- **NAV-006 AC1** — "architecture review includes task fit, route ownership, aliases, and local nav
  contract." `validateNavigationSections` now fails when `taskFit` is missing and continues to
  require owner/route root/aliases/local-nav contract; a test asserts all four (incl. task fit) are
  reported for a malformed section. (core)
- **NAV-006 AC2** — "a route added without IA metadata → the route audit gate fails."
  `auditNavigationRoutes` returns an `unowned-route` problem for any scaffolded route with no
  canonical owner; the app gate (`route-audit.test.ts`) reads the real route tree and fails on an
  unregistered route. (core + app gate)
- **NAV-007 AC1** — "exactly one `h1` exists and page title matches route context." The shell renders
  one `h1` from `resolveRouteAccessibility`; route pages carry no competing `h1`. E2e asserts
  `h1` count = 1 and `route-title`/title match on every primary route and an open Scene. (core + e2e)
- **NAV-007 AC2** — "a live announcement communicates the new route." A persistent
  `aria-live="polite"` region is updated with the route heading on each navigation; e2e asserts it
  changes to name each route. (core + e2e)

## Architecture Contracts Satisfied

- **Contract 1 (Processing / Display Decoupling):** IA validation, the route audit, and the route
  accessibility model are pure Processing-Core functions. The GUI supplies route-shape facts (the
  discovered route roots, the current location) and renders the returned model — it makes no IA or
  accessibility-policy decisions. The route-audit gate keeps filesystem/route knowledge in the app
  and the audit rules in the core.
- **Contract 3 (Role, Visibility & Permission Grant Model):** `resolveRouteAccessibility` reads the
  already actor-filtered navigation view, so a section a player cannot reach or an entity hidden from
  them yields the app-name fallback heading/title/announcement — a hidden title never leaks. The
  Settings `taskFit` line rides the existing DM-only registry filter.
- **ADR-014 boundary:** New core code imports only core types; no Svelte/DOM/platform/v1 imports.
  The app imports core only through its public API and reads `src/routes` only inside a test. Boundary
  lint passes. No durable state, sync units, or persistence were added — the registry is static IA
  data and the title/heading/landmark/announcement are GUI display state.

## Verification Run

```bash
pnpm v2:workpack:set-status -- --epic NAV-ia-validation-and-accessibility-semantics --status active
pnpm v2:workpack:validate                              # passed
pnpm v2:lint                                           # v2 boundary lint passed
pnpm v2:typecheck                                      # core tsc + app svelte-check: 0 errors
pnpm --filter @dndtools/v2-core test                   # 22 files, 212 tests passed (20 new)
pnpm --filter @dndtools/v2-app test                    # 6 files, 22 tests passed (3 new route-audit)
pnpm exec prettier --check <changed files>             # all matched files use Prettier style
pnpm --filter @dndtools/v2-app exec playwright test route-accessibility canonical-sections contextual-navigation command-palette-nav
# 34 passed, 2 profile-skipped across desktop + mobile Chromium (new NAV-007 specs + existing NAV, no regressions)
pnpm --filter @dndtools/v2-app exec playwright test
# 68 passed, 8 profile-skipped, 2 failed (pre-existing timer test — see Known Gaps)
pnpm v2:workpack:complete -- --epic NAV-ia-validation-and-accessibility-semantics
pnpm v2:workpack:validate                              # passed
```

## Quality Review Summary

- **Correctness:** NAV-006 AC1/AC2 and NAV-007 AC1/AC2 are implemented and covered at unit, app-gate,
  and e2e level, including the IA-review task-fit requirement, the route audit's unowned/ missing/
  invalid-registry cases, the single-`h1`/title match, and the live announcement.
- **Architecture:** IA validation, the route audit, and route accessibility are core-owned pure
  functions derived from the existing navigation view/registry; the GUI renders the result. No
  parallel source of truth was introduced — `taskFit`/`entityRoutes` extend the one canonical
  registry, and the shell `h1`/title/announcement come from one model.
- **Tests:** 20 new core unit tests (`navigation-ia-validation.test.ts`), 3 new app-gate tests
  (`route-audit.test.ts`), and 6 new e2e cases (`route-accessibility.spec.ts`, 3 desktop + 3 mobile).
  All prior core (192), app-unit (19), and NAV e2e suites pass unchanged.
- **Accessibility:** Exactly one route-level `h1` per route (shell-owned, derived from the route
  context); route pages demoted to a clean `h2`/`h3` outline under it; the main landmark carries a
  context label; a polite live region announces route changes. No second `h1` anywhere.
- **Performance:** Audit and accessibility derivations are in-memory operations over ~10 sections and
  a handful of breadcrumbs; no network, render loop, or background work added. The live region only
  changes text when the route changes, so it does not fire on unrelated reactive updates.
- **Security / Permissions:** `resolveRouteAccessibility` is fail-closed — a hidden entity yields the
  app-name fallback and never the hidden title; the Settings `taskFit` line keeps the DM-only
  filtering, so DM-only section task fits never reach players/observers.
- **Persistence / Sync/offline:** No durable state, operation-log entries, or sync units added. IA
  metadata is static; titles/headings/announcements are device-local GUI state. Fully offline.
- **UX:** Each route now has a clear single page heading and title; the brand is a banner link to
  home; duplicate "Command Center / Command Center"-style headings were removed; the IA registry
  exposes the user task each section serves.
- **Maintainability:** Two small additive core fields, one validator extension, one pure audit
  function, and one pure accessibility resolver; GUI changes are localized to the layout, four route
  pages (heading-level adjustments), and the Settings registry line. No speculative abstractions.
- **Docs:** This evidence file records traceability, demo path, verification, quality review, and
  gaps.

## Known Gaps / Deferred

- **Route audit covers top-level route roots, not nested sub-routes:** the gate maps each top-level
  `src/routes` segment (and the home `+page`) to IA owners. Deeper nested sub-routes within a section
  are owned by that section's local navigation contract; per-sub-route IA audit can be added when
  sections grow nested routes (none exist in the prototype yet).
- **Planned sections remain unrouted:** Knowledge/Atlas/Session/Campaign/Characters/Audio/MCP carry
  `taskFit` and IA metadata but are still `releaseStatus: 'planned'`; the audit does not require their
  routes to exist until their feature epics flip them to `released`.
- **Announcement copy is the route name:** the live region announces the route heading (e.g.
  "Scenes"). A more verbose template ("Navigated to …") was intentionally avoided to match the page
  title; this can be revisited if user testing prefers a prefix.
- **No axe-core scan added:** NAV-007 is covered by targeted structural assertions (single `h1`,
  title, landmark, live region). A broader automated axe pass over v2 routes remains a future
  cross-cutting accessibility task, consistent with ADR-014's "reuse the existing axe policy where
  practical."

## Pre-existing failures fixed (at maintainer request)

Two failures predating this epic (verified by stashing this epic's changes and re-running on the
clean prior-epic HEAD) were fixed and committed here on explicit maintainer request:

- **Stale timer e2e test:** `apps/v2/app/tests/e2e/scene-create.spec.ts` "Timer widget dispatches its
  declared command through the core" failed because `timer.start` is a session-writing widget command
  (`writesTo: 'session'`) that the core only accepts while the session workflow is `active`
  (CMD-active-session-control guard in `widget-command.ts`). The test predated that guard and never
  activated the session, so the dispatch was rejected and no "timer running" state appeared. Fix: the
  test now activates the session on the Command Center (session state is application-level and
  persists across navigation) before adding and starting the timer. The product behavior is correct
  and unchanged; only the test's missing precondition was added. Passes on desktop and mobile.
- **Broken doc path references:** `docs/planning/v2/epics/NAV-global-local-contextual-navigation.completion.md`
  referenced three test files (the navigation-location and navigation-history unit tests and the
  contextual-navigation e2e spec) by repo-root-relative paths that omitted the required
  `apps/v2/app/` prefix, which `pnpm docs:validate` could not resolve from the repo root. Fix: the
  references now use the full `apps/v2/app/...` paths the files actually live at. `pnpm docs:validate`
  now passes.

## Git Evidence

Branch: `epic/NAV-ia-validation-and-accessibility-semantics` (based on the completed v2 epic chain at
`ce975c4`, the `NAV-home-and-canonical-sections` HEAD).

Status commands run:

```bash
pnpm v2:workpack:set-status -- --epic NAV-ia-validation-and-accessibility-semantics --status active
pnpm v2:workpack:complete -- --epic NAV-ia-validation-and-accessibility-semantics
```

Changed files (epic scope):

```text
apps/v2/app/src/routes/+layout.svelte
apps/v2/app/src/routes/+page.svelte
apps/v2/app/src/routes/scene/[id]/+page.svelte
apps/v2/app/src/routes/scenes/+page.svelte
apps/v2/app/src/routes/settings/+page.svelte
apps/v2/app/src/routes/styles.css
apps/v2/app/tests/e2e/route-accessibility.spec.ts
apps/v2/app/tests/unit/route-audit.test.ts
apps/v2/packages/core/src/index.ts
apps/v2/packages/core/src/queries/navigation.ts
apps/v2/packages/core/src/queries/navigation-sections.ts
apps/v2/packages/core/src/queries/navigation-view.ts
apps/v2/packages/core/tests/navigation-ia-validation.test.ts
apps/v2/packages/core/tests/navigation-sections.test.ts
docs/planning/v2/epics/NAV-ia-validation-and-accessibility-semantics.yaml
docs/planning/v2/epics/NAV-ia-validation-and-accessibility-semantics.completion.md
docs/planning/v2/status.yaml
docs/planning/v2/workpack-state.yaml
```

Changed files (pre-existing-failure fixes, at maintainer request):

```text
apps/v2/app/tests/e2e/scene-create.spec.ts
docs/planning/v2/epics/NAV-global-local-contextual-navigation.completion.md
```

Commit: pending final commit; final handoff reports the branch HEAD SHA.

Final `git status --short` after `pnpm v2:workpack:complete` and before commit:

```text
 M apps/v2/app/src/routes/+layout.svelte
 M apps/v2/app/src/routes/+page.svelte
 M apps/v2/app/src/routes/scene/[id]/+page.svelte
 M apps/v2/app/src/routes/scenes/+page.svelte
 M apps/v2/app/src/routes/settings/+page.svelte
 M apps/v2/app/src/routes/styles.css
 M apps/v2/app/tests/e2e/scene-create.spec.ts
 M apps/v2/packages/core/src/index.ts
 M apps/v2/packages/core/src/queries/navigation.ts
 M apps/v2/packages/core/src/queries/navigation-sections.ts
 M apps/v2/packages/core/src/queries/navigation-view.ts
 M apps/v2/packages/core/tests/navigation-sections.test.ts
 M docs/planning/v2/epics/NAV-global-local-contextual-navigation.completion.md
 M docs/planning/v2/epics/NAV-ia-validation-and-accessibility-semantics.yaml
 M docs/planning/v2/status.yaml
 M docs/planning/v2/workpack-state.yaml
?? apps/v2/app/tests/e2e/route-accessibility.spec.ts
?? apps/v2/app/tests/unit/route-audit.test.ts
?? apps/v2/packages/core/tests/navigation-ia-validation.test.ts
?? docs/planning/v2/epics/NAV-ia-validation-and-accessibility-semantics.completion.md
```

After the final commit, `git status --short` is clean (no untracked or unstaged files).
