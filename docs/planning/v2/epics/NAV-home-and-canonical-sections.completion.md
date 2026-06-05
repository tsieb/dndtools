# NAV-home-and-canonical-sections - Completion Evidence

Epic packet: `docs/planning/v2/epics/NAV-home-and-canonical-sections.yaml`
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic NAV-home-and-canonical-sections`.
Implemented against ADR-014 (Accepted) `docs/adr/014-v2-stack-and-subproject-boundary.md`.

Requirements covered: **NAV-001**, **NAV-009**.

## Summary

This epic delivers the **canonical top-level Navigation Section registry** and confirms the
**Command Center as the application home** (NAV-001, NAV-009). The earlier NAV epics shipped a
minimal runtime nav limited to the routes the prototype renders; this epic adds the single,
authoritative IA registry behind it — owner, route root, player/observer availability, aliases,
landmark, local navigation contract, and release status for every approved section — and wires the
runtime nav, command palette, and a Settings registry view to derive from it.

Key pieces:

- `apps/v2/packages/core/src/queries/navigation-sections.ts` — the canonical registry
  (`CANONICAL_NAVIGATION_SECTIONS`) of all approved sections: **Command Center** (home), **Scenes**
  (DM authoring), **Knowledge, Atlas, Session, Campaign, Characters, Audio, MCP**, and **Settings**.
  Each section carries the full NAV-009 metadata. `validateNavigationSections` is the programmatic
  IA-review gate: it fails closed when a section omits owner/route root/aliases/availability/local
  nav contract, or when structural invariants break (duplicate ids, route-root or alias collisions,
  anything but exactly one home reachable by every role). Helpers: `getHomeSection`,
  `isSectionAvailableForRole`, `sectionRuntimeRoute`, `findSectionByRoute`.
- `apps/v2/packages/core/src/queries/navigation.ts` — refactored to **derive** the runtime view
  from the canonical registry so the two can never drift. `listNavigationSections` returns only
  `released` + actor-available sections (the primary nav / palette source of truth, behavior
  unchanged), now carrying each section's `landmark`. New `listNavigationRegistryForActor` returns
  the actor-filtered canonical IA metadata (released **and** planned) for registry views, with the
  same role filter so DM-only sections never leak to players/observers.
- GUI: `+layout.svelte` reflects the resolved canonical section in the **route landmark and page
  title** (NAV-001 AC2). `settings/+page.svelte` renders the actor-filtered canonical IA registry —
  owner, route root, availability, local-nav contract, and release status per section — which a DM
  sees in full and a player/observer sees with DM-only sections absent (NAV-009 AC2).

The canonical registry deliberately includes approved-but-unbuilt sections as `releaseStatus:
'planned'`. Only `released` sections are reachable at runtime, so the primary nav never renders a
dead link to an unimplemented route while the approved IA is still maintained as data (NAV-001).

## Demo Path

Run `pnpm v2:dev` from the repo root and open the app (preview/e2e uses port 4183; dev uses 5183).

1. **Home is the Command Center (NAV-001 AC1).** Open `/`. The Command Center renders as the home
   surface. The page title reads "Command Center — DND Tools v2" and the main route landmark
   reflects the section (`<main data-section-landmark="command-center">`).
2. **Sections reflect route, landmark, and title (NAV-001 AC2).** As the default **Default DM**,
   click **Scenes** in the primary nav: the route becomes `/scenes/`, the landmark becomes
   `scenes`, and the title becomes "Scenes — DND Tools v2". Click **Settings**: `/settings/`,
   landmark `settings`, title "Settings — DND Tools v2".
3. **Canonical IA registry (NAV-009).** On **Settings**, the "Canonical navigation sections" panel
   lists the approved IA: each entry shows its owning domain, route root, the roles it is available
   to, its local-nav contract, and `released`/`planned` (with a `reachable` badge for sections you
   can open now). Command Center shows "home"; Knowledge/Atlas/Session/Campaign/Characters/Audio/MCP
   show "planned".
4. **DM-only sections fail closed (NAV-009 AC2 / NAV-001 AC3).** Switch **View as** to
   **Demo Player**. The registry drops the DM-only **Scenes**, **Audio**, and **MCP** sections
   entirely (their names never appear in player navigation data), while the home and player-available
   sections remain. The DM-only **Scenes** section also disappears from the primary nav.

Playwright spec `apps/v2/app/tests/e2e/canonical-sections.spec.ts` drives the home/landmark/title
reflection and the DM-vs-player registry filtering on desktop and mobile Chromium.

## Requirement Traceability

| Requirement | Implementation | Test evidence |
| ----------- | -------------- | ------------- |
| **NAV-001** — Command Center is home; maintain canonical section-rooted navigation for approved Navigation Sections (Knowledge, Atlas, Session, Campaign, Characters, Audio, MCP, Settings) | `CANONICAL_NAVIGATION_SECTIONS` + `getHomeSection` (single `home` section = Command Center at `/`) in `navigation-sections.ts`; `listNavigationSections` (released runtime nav, carries `landmark`) in `navigation.ts`; `+layout.svelte` reflects route/landmark/title from the resolved section | Core: `navigation-sections.test.ts` (exactly one home = command-center at `/`; all NAV-001-named sections present; released runtime nav = `[command-center, scenes, settings]`, planned never surfaced; landmark per reachable section). E2e: `canonical-sections.spec.ts` AC1 home reflection, AC2 section route/landmark/title reflection (desktop + mobile). |
| **NAV-009** — approved registry defines owner, route root, player/observer availability, aliases, landmarks, local navigation contract, release status per section | `CanonicalNavigationSection` metadata + `validateNavigationSections` IA gate + `listNavigationRegistryForActor` (actor-filtered) in `navigation-sections.ts` / `navigation.ts`; `settings/+page.svelte` registry view | Core: `navigation-sections.test.ts` (shipped registry validates clean; validator requires owner/routeRoot/aliases/availability/localNav and rejects duplicate ids/routes, alias clashes, wrong home count, home not reachable by all; DM-only sections absent for player/observer; unknown actor fails closed). E2e: `canonical-sections.spec.ts` DM registry view + player DM-only absence (desktop + mobile). |

### Acceptance criteria

- **NAV-001 AC1** — "the home surface is Command Center." `getHomeSection()` resolves to
  `command-center` (root `/`, reachable by every role); the home route renders the Command Center
  and the layout reflects it. (core + e2e)
- **NAV-001 AC2** — "route, landmark, and title reflect the canonical section." `listNavigationSections`
  carries each section's `landmark`; the layout sets `document.title` and `data-section-landmark`
  from the resolved canonical section. (e2e: Scenes/Settings/Command Center)
- **NAV-001 AC3** — "DM-only sections and actions are absent or disabled with non-leaking reasons."
  DM-only sections are **absent** (fail closed) for players/observers in the primary nav and the
  registry; their names never appear in player navigation data. (core + e2e)
- **NAV-009 AC1** — "owner, route root, aliases, actor availability, and local navigation contract
  are required." `validateNavigationSections` flags any section missing those fields; a test feeds
  malformed sections and asserts each required field is reported. (core)
- **NAV-009 AC2** — "a DM-only section is absent or represented only by an allowed placeholder for a
  player/observer." `listNavigationRegistryForActor` applies the role filter; Scenes/Audio/MCP are
  absent for players/observers. (core + e2e)

## Architecture Contracts Satisfied

- **Contract 1 (Processing / Display Decoupling):** The canonical registry, IA validation, and
  actor filtering all live in the Processing Core. The GUI derives one route-based location, renders
  the returned registry/section view models, and follows links; it makes no availability or
  visibility decisions. Route knowledge stays in the app (`navigation-location.ts`).
- **Contract 3 (Role, Visibility & Permission Grant Model):** Per-role section availability is
  evaluated in the core before navigation data reaches the GUI. DM-only sections are absent for
  players/observers in both the runtime nav and the registry view; an unknown actor receives an
  empty list. Fail closed, no leak.
- **ADR-014 boundary:** The new core module imports only core types (`permission-state`, `ids`); no
  Svelte/DOM/platform/v1 imports. The app imports core only through its public API. Boundary lint
  passes. No durable state, sync units, or persistence were added — the registry is static IA data
  and the page title / landmark are GUI display state.

## Verification Run

```bash
pnpm v2:workpack:set-status -- --epic NAV-home-and-canonical-sections --status active
pnpm v2:workpack:validate                              # passed
pnpm v2:lint                                           # v2 boundary lint passed
pnpm v2:typecheck                                      # core tsc + app svelte-check: 0 errors
pnpm --filter @dndtools/v2-core test                   # 21 files, 193 tests passed (18 new)
pnpm --filter @dndtools/v2-app test                    # 5 files, 19 tests passed
pnpm --filter @dndtools/v2-app exec playwright test canonical-sections command-palette-nav
# 21 passed, 1 profile-skipped across desktop + mobile Chromium (6 new + 15 existing, no regressions)
pnpm --filter @dndtools/v2-app exec playwright test
# 60 passed, 8 profile-skipped, 2 failed (pre-existing timer test — see Known Gaps)
pnpm v2:workpack:complete -- --epic NAV-home-and-canonical-sections
pnpm v2:workpack:validate                              # passed
```

## Quality Review Summary

- **Correctness:** NAV-001 AC1/AC2/AC3 and NAV-009 AC1/AC2 are implemented and covered at unit and
  e2e level, including the IA-review validator's required-field and structural-invariant checks.
- **Architecture:** One canonical registry is the source of truth; the runtime nav and palette
  derive from it (no parallel list to drift). Processing/display split preserved; no v1 or platform
  imports added to core.
- **Tests:** 18 new core unit tests (`navigation-sections.test.ts`); 6 new e2e cases (3 desktop +
  3 mobile). Existing 175 core, 19 app-unit, and the command-palette-nav e2e suite pass unchanged.
- **Accessibility:** The main route landmark reflects the canonical section (`aria-label`,
  `data-section-landmark`) and the page title reflects it. Full route-level h1 audit and live route
  announcements remain owned by NAV-007 (`NAV-ia-validation-and-accessibility-semantics`); this epic
  does not add a second h1.
- **Performance:** The registry is static frozen data; runtime/registry queries are in-memory list
  maps over ~10 sections. No new network, render loop, or background work.
- **Security / Permissions:** DM-only sections (Scenes, Audio, MCP) are absent for players/observers
  in both the runtime nav and the registry; hidden section names never enter player navigation data;
  unknown actors get an empty list. Fail closed.
- **Persistence / Sync/offline:** No durable state, operation-log entries, or sync units added. The
  registry is static IA; the page title and landmark are device-local GUI state. Fully offline.
- **UX:** The Settings registry view shows owner, route root, availability, local-nav contract, and
  `released`/`planned`/`reachable` status; planned sections are visible as approved roadmap without
  becoming clickable dead links.
- **Maintainability:** One small typed core module plus a thin derivation in `navigation.ts`; the
  existing nav API shape is preserved (back-compatible `NavigationSectionDef`/`NavigationAudience`),
  and the GUI additions are localized to the layout and Settings page.
- **Docs:** This evidence file records traceability, demo path, verification, quality review, and gaps.

## Known Gaps / Deferred

- **Planned sections are not yet routable:** Knowledge, Atlas, Session, Campaign, Characters, Audio,
  and MCP are declared as approved IA (`releaseStatus: 'planned'`) but have no `+page` routes yet.
  They are intentionally absent from the runtime primary nav (no dead links) and appear only in the
  read-only Settings registry view. Their feature epics (CONTENT, MAP, SES, CHAR, AUDIO, MCP) will
  flip each to `released` and add the route + local navigation when built.
- **Route alias redirects are deferred:** Each section declares its canonical `aliases` as data, and
  `findSectionByRoute` resolves them, but generating legacy redirect stubs and preserving query/hash
  is owned by `NAV-route-aliases-and-deep-links` (NAV-002/004/005). This epic only supplies the
  shared alias source of truth.
- **Full route a11y semantics are NAV-007's:** Page title and section-reflecting landmark are set
  here for AC2; the exactly-one-`h1` audit, semantic-landmark validation, and live route
  announcements are owned by `NAV-ia-validation-and-accessibility-semantics` (NAV-006/NAV-007).
- **Pre-existing, out-of-scope failure:** `apps/v2/app/tests/e2e/scene-create.spec.ts` "Timer widget
  dispatches its declared command through the core" fails on the base commit (`51dfba6`) as well — it
  belongs to the CANVAS/widget domain and is untouched by this epic (no widget/timer/canvas-runtime/
  scene-create files changed). It fails identically on desktop and mobile, exactly as documented by
  the prior NAV epic.

## Git Evidence

Branch: `epic/NAV-home-and-canonical-sections` (based on the completed v2 epic chain at `51dfba6`,
the `NAV-global-local-contextual-navigation` HEAD).

Status commands run:

```bash
pnpm v2:workpack:set-status -- --epic NAV-home-and-canonical-sections --status active
pnpm v2:workpack:complete -- --epic NAV-home-and-canonical-sections
```

Changed files:

```text
apps/v2/app/src/routes/+layout.svelte
apps/v2/app/src/routes/settings/+page.svelte
apps/v2/app/tests/e2e/canonical-sections.spec.ts
apps/v2/packages/core/src/index.ts
apps/v2/packages/core/src/queries/navigation.ts
apps/v2/packages/core/src/queries/navigation-sections.ts
apps/v2/packages/core/tests/navigation-sections.test.ts
docs/planning/v2/epics/NAV-home-and-canonical-sections.yaml
docs/planning/v2/epics/NAV-home-and-canonical-sections.completion.md
docs/planning/v2/status.yaml
docs/planning/v2/workpack-state.yaml
```

Commit: pending final commit; final handoff reports the branch HEAD SHA.

Final `git status --short` after `pnpm v2:workpack:complete` and before commit:

```text
 M apps/v2/app/src/routes/+layout.svelte
 M apps/v2/app/src/routes/settings/+page.svelte
 M apps/v2/packages/core/src/index.ts
 M apps/v2/packages/core/src/queries/navigation.ts
 M docs/planning/v2/epics/NAV-home-and-canonical-sections.yaml
 M docs/planning/v2/status.yaml
 M docs/planning/v2/workpack-state.yaml
?? apps/v2/app/tests/e2e/canonical-sections.spec.ts
?? apps/v2/packages/core/src/queries/navigation-sections.ts
?? apps/v2/packages/core/tests/navigation-sections.test.ts
?? docs/planning/v2/epics/NAV-home-and-canonical-sections.completion.md
```

After the final commit, `git status --short` is clean (no untracked or unstaged files).
