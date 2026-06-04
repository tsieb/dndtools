# NAV-command-palette-and-actor-filtering - Completion Evidence

Epic packet: `docs/planning/v2/epics/NAV-command-palette-and-actor-filtering.yaml`
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic NAV-command-palette-and-actor-filtering`.
Implemented against ADR-014 (Accepted) `docs/adr/014-v2-stack-and-subproject-boundary.md`.

Requirements covered: **NAV-008**, **NAV-010**.

## Summary

This epic delivers one unified, actor-filtered **command availability API** in the Processing
Core and wires the command palette and the primary navigation to it, alongside the existing
visible controls (NAV-010). The palette now provides navigation, settings, scene, action, and
widget commands, all filtered by actor visibility and permission, on both the desktop and the
compact (mobile) platform profile (NAV-008).

Key pieces:

- `apps/v2/packages/core/src/queries/navigation.ts` — a small navigation section registry with a
  per-role audience and `listNavigationSections`, the single actor-filtered navigation API the
  primary nav and the palette both consume.
- `apps/v2/packages/core/src/queries/command-availability.ts` — `listPaletteCommands`,
  `resolvePaletteCommand`, and `searchPaletteCommands`. It merges navigation sections, visibility-
  filtered scene deep links, and Processing Core command actions (reusing `listCommandActions` plus
  a `scene.create` command) into one catalog.
- GUI: the header nav (`+layout.svelte`) renders only the sections the active actor may reach; the
  command palette (`CommandPalette.svelte`) renders the unified catalog and either routes
  (navigation) or dispatches the identical `CoreCommand` a visible control would; a header
  "View as" control plus a minimal `/settings/` route make actor filtering demonstrable in the GUI.

## Demo Path

Run `pnpm v2:dev` from the repo root and open `http://localhost:5183/` (the Command Center home).

1. As the default **Default DM** actor, open the command palette (header "⌘K Actions" button or
   Ctrl/Cmd+K). Note navigation commands (Go to Command Center / Scenes / Settings), a **Create
   Scene** command, Command Center preset/add-widget actions, and scene deep links.
2. Open **Scenes** and create two scenes: one with visibility **DM only** (e.g. `Secret Lair`) and
   one **Player visible** (e.g. `Tavern`). The palette now shows `Open Scene:` deep links for both.
3. In the header, change **View as** to `Demo Player (player)`:
   - The primary nav drops the DM-only **Scenes** section (Command Center + Settings remain).
   - Open the palette: the `Create Scene` command, Command Center preset/add-widget actions, and the
     `Open Scene: Secret Lair` deep link are all absent. Only `Open Scene: Tavern` and navigation
     commands remain — the hidden scene never appears (NAV-010 AC1, NAV-008 AC1).
4. Switch **View as** back to the DM. From `/scenes/` before ever opening the Command Center, open
   the palette and search `preset`: the `Save Command Center preset` command is shown disabled with
   the accessible reason "Set up the Command Center first." (NAV-008 AC2).
5. Run the palette's **Create Scene** command with a name — it dispatches the same `scene.create`
   command the visible Scene form dispatches, and the scene appears in the same list (NAV-010 AC2).
6. On a narrow window / mobile device, the palette opens as a full-screen sheet (the equivalent
   command menu) exposing the identical commands and dispatching the same core command (NAV-008 AC3).

Playwright spec `apps/v2/app/tests/e2e/command-palette-nav.spec.ts` drives this path in desktop and
mobile Chromium.

## Requirement Traceability

| Requirement | Implementation | Test evidence |
| ----------- | -------------- | ------------- |
| **NAV-008** — command palette/menu provides action, navigation, settings, note, Scene, map, and widget commands filtered by actor visibility and permission on every platform profile | `listPaletteCommands` in `apps/v2/packages/core/src/queries/command-availability.ts` returns navigation, settings, scene, action, and widget commands filtered for the actor; `CommandPalette.svelte` renders them and shows a non-leaking disabled reason for state-disabled commands. The palette is profile-aware: it renders as a compact full-screen sheet (`data-profile`) on slim profiles while exposing the same command set (navigation/action commands are profile-independent; widget availability follows CMD-005). | `apps/v2/packages/core/tests/command-availability.test.ts` (categories present; player sees no DM-only commands; disabled reason + refusal to resolve; profile-independent filtering result). `apps/v2/app/tests/e2e/command-palette-nav.spec.ts` (player palette hides DM-only commands AC1; disabled reason AC2; compact menu same command AC3). |
| **NAV-010** — navigation and command surfaces use the same actor-filtered command availability API as widgets and visible controls | `listNavigationSections` in `apps/v2/packages/core/src/queries/navigation.ts` is the single navigation availability API; both `+layout.svelte` (primary nav) and `listPaletteCommands` consume it. Scene deep links come from `listScenesForActor`, so hidden scenes never surface. Core-command palette entries resolve via `resolvePaletteCommand` to the identical `CoreCommand` a visible control dispatches (reusing `listCommandActions`), through the same `dispatchCommand` validation path. | `apps/v2/packages/core/tests/command-availability.test.ts` (DM-only nav hidden from player/observer; no hidden-scene leak; navigation resolves to a route; `scene.create` resolves to the same command and is accepted by dispatch). `apps/v2/app/tests/e2e/command-palette-nav.spec.ts` (nav hides Scenes for player AC1; palette `Create Scene` lands in the same list as the visible form AC2; navigation command routes). |

## Architecture Contracts Satisfied

- **Contract 1 (Processing / Display Decoupling):** All command availability and filtering happen in
  the Processing Core. The GUI reads `listNavigationSections` / `listPaletteCommands` view models and
  dispatches `CoreCommand`s or routes; it performs no permission/visibility decisions of its own.
  Choosing which actor's filtered view to render ("View as") is GUI local state, not durable state.
- **Contract 3 (Role, Visibility & Permission Grant Model):** Filtering is evaluated before the GUI
  sees a command. DM-only navigation sections are absent for players/observers; non-DM actors receive
  no mutation commands; scene deep links pass through `evaluateSceneVisibility`, so a hidden scene's
  id and name never reach a non-DM surface (fail closed, no leak).
- **Contract 4 (Scene and Widget Contract):** Widget add commands continue to flow through the widget
  library's profile-aware availability; the palette never bypasses it.
- **ADR-014 boundary:** Core owns the new query modules with no Svelte/DOM/platform/v1 imports; the
  app imports core only through its public API. Boundary lint passes.

## Verification Run

```bash
pnpm v2:workpack:set-status -- --epic NAV-command-palette-and-actor-filtering --status active
pnpm v2:workpack:validate                              # passed
pnpm --filter @dndtools/v2-core test                   # 19 files, 161 tests passed (12 new)
pnpm --filter @dndtools/v2-app test                    # 3 files, 11 tests passed
pnpm v2:lint                                           # v2 boundary lint passed
pnpm --filter @dndtools/v2-core typecheck              # tsc passed
pnpm --filter @dndtools/v2-app typecheck               # svelte-check passed (0 errors)
pnpm --filter @dndtools/v2-app exec playwright test command-palette-nav.spec
# 13 passed, 1 profile-skipped across desktop + mobile Chromium
pnpm --filter @dndtools/v2-app exec playwright test command-palette.spec command-center.spec
# CMD-008 + Command Center regression specs pass (17 passed, 3 profile-skipped)
pnpm v2:workpack:complete -- --epic NAV-command-palette-and-actor-filtering
pnpm v2:workpack:validate                              # passed
```

## Quality Review Summary

- **Correctness:** NAV-008 and NAV-010 acceptance criteria are implemented and tested at unit and
  e2e level, including the player-hidden, disabled-reason, mobile-equivalent-menu, and shared-command
  paths.
- **Architecture:** One actor-filtered availability API serves nav, palette, and visible controls;
  processing/display split preserved; no v1 runtime or platform imports added to core.
- **Tests:** 12 new core unit tests; 6 new e2e tests (run on desktop + mobile); existing CMD-008 and
  Command Center e2e remain green.
- **Accessibility:** Palette dialog is keyboard-operable (Ctrl/Cmd+K, Escape, focus on open); each
  action button has a distinct accessible name; disabled commands expose a visible, non-leaking
  reason; nav has an `aria-label="Primary"` landmark; the "View as" select is labeled.
- **Performance:** The catalog is an in-memory composition of existing queries; no new network,
  render loop, or background work.
- **Security / Permissions:** Non-DM actors receive no DM-only sections, no mutation commands, and no
  hidden scene identifiers. Navigation grants no write capability. DM authority remains inherent.
- **Persistence / Sync/offline:** No new durable state was introduced; navigation and "View as" are
  device-local GUI concerns. Palette core commands reuse the existing command/operation-log path.
- **UX:** Palette has loading-free empty state ("No matching commands."), disabled reasons, search,
  category labels, and a compact full-screen layout for slim profiles.
- **Maintainability:** Two small typed core modules plus thin GUI wiring; the existing CMD-008
  `command-actions` module is reused rather than forked.
- **Docs:** This evidence file records traceability, demo path, verification, quality review, and gaps.

## Known Gaps / Deferred

- **Note and Map command categories:** `CommandCategory` includes `note` and `map`, but this
  prototype has no note domain and no map route, so no concrete note/map palette commands exist yet.
  They are intentionally deferred until those domains are implemented (CONTENT/MAP epics).
- **Canonical Navigation Section registry:** The full registry (owner, aliases, landmarks, release
  status, and the complete section list — Knowledge, Atlas, Session, Campaign, Characters, Audio,
  MCP, Settings) belongs to `NAV-home-and-canonical-sections` (NAV-001/NAV-009). This epic ships a
  minimal registry covering only the routes the prototype renders.
- **Authenticated actor switching:** "View as" switches between the seeded local DM and demo players
  to demonstrate filtering; authenticated participant/session join is outside this NAV epic.
- **Pre-existing, out-of-scope failure:** `apps/v2/app/tests/e2e/scene-create.spec.ts` "Timer widget
  dispatches its declared command through the core" fails on the base commit as well (verified by
  stashing this epic's changes and re-running). It belongs to the CANVAS/widget domain, not NAV, and
  is not affected by this epic's changes.

## Git Evidence

Branch: `epic/NAV-command-palette-and-actor-filtering` (based on the completed v2 epic chain).

Status commands run:

```bash
pnpm v2:workpack:set-status -- --epic NAV-command-palette-and-actor-filtering --status active
pnpm v2:workpack:complete -- --epic NAV-command-palette-and-actor-filtering
```

Changed files:

```text
apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts
apps/v2/app/src/lib/gui/CommandPalette.svelte
apps/v2/app/src/routes/+layout.svelte
apps/v2/app/src/routes/+page.svelte
apps/v2/app/src/routes/settings/+page.svelte
apps/v2/app/src/routes/styles.css
apps/v2/app/tests/e2e/command-palette-nav.spec.ts
apps/v2/packages/core/src/index.ts
apps/v2/packages/core/src/queries/command-availability.ts
apps/v2/packages/core/src/queries/navigation.ts
apps/v2/packages/core/tests/command-availability.test.ts
docs/planning/v2/epics/NAV-command-palette-and-actor-filtering.completion.md
docs/planning/v2/epics/NAV-command-palette-and-actor-filtering.yaml
docs/planning/v2/status.yaml
docs/planning/v2/workpack-state.yaml
```

Commit: pending final commit; final handoff reports the branch HEAD SHA.

Final `git status --short` after `pnpm v2:workpack:complete` and before commit:

```text
 M apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts
 M apps/v2/app/src/lib/gui/CommandPalette.svelte
 M apps/v2/app/src/routes/+layout.svelte
 M apps/v2/app/src/routes/+page.svelte
 M apps/v2/app/src/routes/styles.css
 M apps/v2/packages/core/src/index.ts
 M docs/planning/v2/epics/NAV-command-palette-and-actor-filtering.yaml
 M docs/planning/v2/status.yaml
 M docs/planning/v2/workpack-state.yaml
?? apps/v2/app/src/routes/settings/
?? apps/v2/app/tests/e2e/command-palette-nav.spec.ts
?? apps/v2/packages/core/src/queries/command-availability.ts
?? apps/v2/packages/core/src/queries/navigation.ts
?? apps/v2/packages/core/tests/command-availability.test.ts
?? docs/planning/v2/epics/NAV-command-palette-and-actor-filtering.completion.md
```

After the final commit, `git status --short` is clean (no untracked or unstaged files).
