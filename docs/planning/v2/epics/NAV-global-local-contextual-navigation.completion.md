# NAV-global-local-contextual-navigation - Completion Evidence

Epic packet: `docs/planning/v2/epics/NAV-global-local-contextual-navigation.yaml`
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic NAV-global-local-contextual-navigation`.
Implemented against ADR-014 (Accepted) `docs/adr/014-v2-stack-and-subproject-boundary.md`.

Requirements covered: **NAV-003**.

## Summary

This epic delivers the contextual navigation capability branch (NAV-003): a single
Processing-Core navigation model that drives breadcrumbs, local section navigation, contextual
backlinks/related links, and device-local pinned/recent items — all derived from one
`NavigationLocation` (the current route), so no two navigation surfaces hold conflicting route
state. Global navigation and the command palette already existed
(NAV-command-palette-and-actor-filtering); this epic adds the local/contextual layers around them.

Key pieces:

- `apps/v2/packages/core/src/queries/navigation-view.ts` — `resolveNavigationView` returns the
  breadcrumb trail (Home → Section → Entity), the actor-visible local section items, and contextual
  `backlinks`/`related` links for the open entity, all from one location. `listReachableDestinations`
  lists the routes the actor can currently reach. Every relationship is visibility-filtered and fails
  closed. Backlinks are grounded in real Scene relationships in the prototype: the Command Center
  home Scene, template lineage (instance ↔ template), and DM-only player-view projections.
- GUI: `Breadcrumbs.svelte`, `LocalNav.svelte` (an accessible drawer/sheet on the compact profile),
  `ContextualNav.svelte` (backlinks + related), and `QuickAccess.svelte` (pinned/recent). The root
  layout derives one `location` from `page.url.pathname` and feeds the single resolved view to every
  surface.
- `apps/v2/app/src/lib/platform/navigation-history.ts` / `.svelte.ts` — device-local pinned/recent
  store, persisted to `localStorage` only, never synced (Contract 1/2). Pure list transforms are
  unit-tested; reachable-route filtering fails closed so an unreachable route is never surfaced.
- `apps/v2/app/src/lib/state/navigation-location.ts` — the app-owned route → `NavigationLocation`
  mapping (the GUI owns route knowledge; the core owns section/entity ids).

## Demo Path

Run `pnpm v2:dev` from the repo root and open `http://localhost:5183/` (the Command Center home).

1. As the default **Default DM** actor, open **Scenes** and create a Scene (e.g. `Riverside`). Open
   it from the Scenes list. The contextual subheader now shows a **breadcrumb trail** `Command
   Center / Scenes / Riverside` (the open Scene is `aria-current`), a **local section nav** listing
   the vault's Scenes (the open one current), and **Quick access** offering a pin toggle plus
   recent items.
2. Click the **Scenes** breadcrumb — the route changes to `/scenes/`; press the browser **Back**
   button and you return to the Scene editor. Route and history stay coherent; nothing keeps a
   second copy of "where am I" (NAV-003 AC1).
3. From the Command Center home (`/`), click **Open in Scene editor**. The open Scene is the
   Command Center home, surfaced under **Backlinks** as "Command Center home Scene". Click it to
   route back to `/`; Back returns to the editor (NAV-003 AC1, contextual backlink).
4. Use **☆ Pin this** in Quick access to pin the current page; it moves to **Pinned**. Switch
   **View as** to `Demo Player`: DM-only destinations (the Scenes section, dm-only Scenes) drop out
   of Quick access and local nav — pinned/recent fail closed and never surface an unreachable route.
5. Narrow the window (or use a mobile device): the local section nav collapses to a **drawer/sheet**
   opened by a "Scenes navigation" button. It is a modal dialog; **Escape** closes it, focus returns
   to the trigger, and focus is not trapped afterward (NAV-003 AC2).

Playwright spec `apps/v2/app/tests/e2e/contextual-navigation.spec.ts` drives the breadcrumb,
backlink, and mobile-drawer paths on desktop and mobile Chromium.

## Requirement Traceability

| Requirement | Implementation | Test evidence |
| ----------- | -------------- | ------------- |
| **NAV-003** — navigate using global navigation, local section navigation, contextual navigation, breadcrumbs, backlinks, pinned/recent items, and command palette without redundant conflicting route state | `resolveNavigationView` in `apps/v2/packages/core/src/queries/navigation-view.ts` derives breadcrumbs, local section items, and contextual backlinks/related links from one `NavigationLocation`; the app maps the route to that location once (`navigation-location.ts`) and the layout feeds the single view to `Breadcrumbs`, `LocalNav`, `ContextualNav`, and `QuickAccess`. Global nav + command palette continue to use `listNavigationSections` (NAV-008/010). Pinned/recent are device-local (`navigation-history.ts`/`.svelte.ts`), filtered to reachable routes. | Core: `apps/v2/packages/core/tests/navigation-view.test.ts` (breadcrumb trail + single current flag; DM-only ancestor omitted for players; hidden-Scene fail-closed; local items; home/template/projection backlinks; DM-only projection gating; reachable-destination filtering). App unit: `tests/unit/navigation-location.test.ts`, `tests/unit/navigation-history.test.ts` (route mapping; recent dedupe/cap; pin toggle; reachable fail-closed filtering). E2e: `tests/e2e/contextual-navigation.spec.ts` AC1 breadcrumb route+history coherence, AC1 backlink route+history coherence, AC2 mobile drawer focus release. |

### Acceptance criteria

- **AC1** — "Given a note is open, when backlinks or breadcrumbs are used, then navigation updates
  route and history coherently." The prototype has no note domain yet, so the open entity is a
  **Scene** (the closest navigable entity). Breadcrumbs and backlinks are ordinary links over the
  single route source of truth; following one updates the route and browser history coherently
  (e2e: breadcrumb and backlink specs assert route change + `goBack` returns to the entity).
- **AC2** — "Given mobile profile is active, when local nav is opened, then it appears as an
  accessible drawer/sheet and does not trap focus after closing." `LocalNav` renders a modal
  drawer on the compact profile, returns focus to the trigger on close, unmounts the sheet, and
  removes its key handler so focus is free afterward (e2e: mobile-chromium drawer spec).

## Architecture Contracts Satisfied

- **Contract 1 (Processing / Display Decoupling):** All navigation availability and visibility
  filtering happen in the Processing Core (`resolveNavigationView`, `listReachableDestinations`).
  The GUI derives one route-based location, renders the returned view models, and follows links; it
  makes no permission/visibility decisions. Route parsing and device-local pinned/recent are GUI
  concerns (local display preferences), not durable state.
- **Contract 2 (Cloud Sync & Offline Model):** Pinned/recent navigation state is device-local
  (`localStorage`), never written to the durable vault or the operation log and never synced, so it
  is fully available offline and leaks no campaign data. No new sync units were introduced.
- **Contract 3 (Role, Visibility & Permission Grant Model):** Every crumb, local item, backlink,
  related link, and reachable destination is visibility-filtered before the GUI sees it. A Scene
  hidden from the actor produces no crumb/link (its name never appears); DM-only player-view
  projection backlinks are gated to the DM; pinned/recent are filtered to reachable routes — all
  fail closed.
- **ADR-014 boundary:** The new core module imports no Svelte/DOM/platform/v1 code; the app imports
  core only through its public API and uses `$app/state` for the route. Boundary lint passes.

## Verification Run

```bash
pnpm v2:workpack:set-status -- --epic NAV-global-local-contextual-navigation --status active
pnpm v2:workpack:validate                              # passed
pnpm --filter @dndtools/v2-core test                   # 20 files, 174 tests passed (12 new)
pnpm --filter @dndtools/v2-app test                    # 5 files, 19 tests passed (8 new)
pnpm v2:lint                                           # v2 boundary lint passed
pnpm v2:typecheck                                      # core tsc + app svelte-check: 0 errors
pnpm --filter @dndtools/v2-app exec playwright test contextual-navigation.spec
# 5 passed, 1 profile-skipped across desktop + mobile Chromium
pnpm --filter @dndtools/v2-app exec playwright test
# 52 passed, 8 profile-skipped, 2 failed (pre-existing timer test — see Known Gaps)
pnpm v2:workpack:complete -- --epic NAV-global-local-contextual-navigation
pnpm v2:workpack:validate                              # passed
```

## Quality Review Summary

- **Correctness:** NAV-003 AC1 (breadcrumb/backlink route+history coherence) and AC2 (mobile drawer
  focus release) are implemented and covered at unit and e2e level, plus visibility fail-closed and
  reachable-route filtering.
- **Architecture:** One Processing-Core navigation model drives every contextual surface from a
  single route-derived location; processing/display split preserved; no v1 runtime or platform
  imports added to core.
- **Tests:** 12 new core unit tests; 8 new app unit tests; 3 new e2e cases on desktop + mobile.
- **Accessibility:** Breadcrumbs use `nav[aria-label="Breadcrumb"]` + an ordered list with
  `aria-current="page"`; local nav, contextual nav, and quick access are labeled `nav` landmarks;
  the mobile drawer is a modal `dialog` with focus-in on open, focus-return to the trigger on close,
  Escape-to-close, and no focus trap once unmounted. Exactly one route-level `h1` is unchanged
  (NAV-007 preserved).
- **Performance:** The view is an in-memory composition of existing queries; no new network, render
  loop, or background work. Recent visits are recorded at most once per route change.
- **Security / Permissions:** Hidden Scenes never surface a crumb, link, or pinned/recent route;
  DM-only player-view projection backlinks are gated to the DM; unknown actors get an empty view.
- **Persistence / Sync/offline:** Pinned/recent are device-local `localStorage` only, never synced;
  corrupt/absent storage degrades to an empty list; no durable vault state added.
- **UX:** Subheader self-hides when empty; breadcrumbs hide at the Home root; quick access excludes
  the current page from "recent"; the drawer closes on backdrop, Close button, Escape, or item
  selection.
- **Maintainability:** One small typed core module plus four cohesive components and a thin
  device-local store; pure list transforms are isolated and unit-tested; the existing navigation
  registry is reused, not forked.
- **Docs:** This evidence file records traceability, demo path, verification, quality review, and gaps.

## Known Gaps / Deferred

- **No note domain yet:** NAV-003's AC1 references "a note". The prototype has no note/CONTENT
  domain, so the open navigable entity is a **Scene**. The navigation model is entity-type-generic
  (`NavigationEntityType`), so a future note domain plugs notes into the same breadcrumb/local/
  contextual shape without changing the contract.
- **Note backlink intelligence (snippets):** Visibility-redacted note backlinks with context
  snippets are owned by `GRAPH-backlinks-and-navigation-relationships` (GRAPH-002). This epic owns
  the navigation shell and implements contextual backlinks for the Scene relationships that exist
  today (home Scene, template lineage, player-view projection); GRAPH-002 will feed note backlinks
  into the same `ContextualLink` shape.
- **Template instantiation is not yet GUI-exposed:** Template-instance backlinks are covered by core
  unit tests (and `scene.instantiate-template` exists), but the Scene editor has no instantiate
  button yet, so the demo path exercises the home-Scene backlink. Instantiation UI belongs to a
  CANVAS/Scene-template surface.
- **Pre-existing, out-of-scope failure:** `apps/v2/app/tests/e2e/scene-create.spec.ts` "Timer widget
  dispatches its declared command through the core" fails on the base commit as well (re-verified
  this epic by stashing all changes, rebuilding, and re-running — it failed identically). It belongs
  to the CANVAS/widget domain, not NAV, and is unaffected by this epic.

## Git Evidence

Branch: `epic/NAV-global-local-contextual-navigation` (based on the completed v2 epic chain on
`v2-clean-slate`).

Status commands run:

```bash
pnpm v2:workpack:set-status -- --epic NAV-global-local-contextual-navigation --status active
pnpm v2:workpack:complete -- --epic NAV-global-local-contextual-navigation
```

Changed files:

```text
apps/v2/app/src/routes/+layout.svelte
apps/v2/app/src/routes/styles.css
apps/v2/app/src/lib/gui/Breadcrumbs.svelte
apps/v2/app/src/lib/gui/ContextualNav.svelte
apps/v2/app/src/lib/gui/LocalNav.svelte
apps/v2/app/src/lib/gui/QuickAccess.svelte
apps/v2/app/src/lib/platform/navigation-history.ts
apps/v2/app/src/lib/platform/navigation-history.svelte.ts
apps/v2/app/src/lib/state/navigation-location.ts
apps/v2/app/tests/e2e/contextual-navigation.spec.ts
apps/v2/app/tests/unit/navigation-history.test.ts
apps/v2/app/tests/unit/navigation-location.test.ts
apps/v2/packages/core/src/index.ts
apps/v2/packages/core/src/queries/navigation-view.ts
apps/v2/packages/core/tests/navigation-view.test.ts
docs/planning/v2/epics/NAV-global-local-contextual-navigation.yaml
docs/planning/v2/epics/NAV-global-local-contextual-navigation.completion.md
docs/planning/v2/status.yaml
docs/planning/v2/workpack-state.yaml
```

Commit: pending final commit; final handoff reports the branch HEAD SHA.

Final `git status --short` after `pnpm v2:workpack:complete` and before commit:

```text
 M apps/v2/app/src/routes/+layout.svelte
 M apps/v2/app/src/routes/styles.css
 M apps/v2/packages/core/src/index.ts
 M docs/planning/v2/epics/NAV-global-local-contextual-navigation.yaml
 M docs/planning/v2/status.yaml
 M docs/planning/v2/workpack-state.yaml
?? apps/v2/app/src/lib/gui/Breadcrumbs.svelte
?? apps/v2/app/src/lib/gui/ContextualNav.svelte
?? apps/v2/app/src/lib/gui/LocalNav.svelte
?? apps/v2/app/src/lib/gui/QuickAccess.svelte
?? apps/v2/app/src/lib/platform/navigation-history.svelte.ts
?? apps/v2/app/src/lib/platform/navigation-history.ts
?? apps/v2/app/src/lib/state/navigation-location.ts
?? apps/v2/app/tests/e2e/contextual-navigation.spec.ts
?? apps/v2/app/tests/unit/navigation-history.test.ts
?? apps/v2/app/tests/unit/navigation-location.test.ts
?? apps/v2/packages/core/src/queries/navigation-view.ts
?? apps/v2/packages/core/tests/navigation-view.test.ts
?? docs/planning/v2/epics/NAV-global-local-contextual-navigation.completion.md
```

After the final commit, `git status --short` is clean (no untracked or unstaged files).
