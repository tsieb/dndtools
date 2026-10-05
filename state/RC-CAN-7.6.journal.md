# RC-CAN-7.6 — The Command Center as the default screen

## Session 1 — 2026-10-05

Started on `dispatch/dndtools/be539aeaeef92ebd066d` at `13bfd9e5` with a clean tree. No Headroom
tools are exposed in this session; command output is read directly or kept in `/tmp/rc-can76-*.log`.

Inputs read: RC_ROADMAP CAN-7/WID-5 epics, ADR-041, SCREENS_PARITY §1 and §4, the CAN-7.3, 7.7,
ENG-8.2, WID-5.1, 5.2 and 5.3 journals, `CommandCenter.tsx`, `command-center.ts`,
`widget-package-state.ts`, `templates/Hub.tsx`, `FlowBoard.tsx`, `WidgetRenderSlot.tsx`.

### Step 1 — baselines of today's Command Center (committed first)

`apps/gm-react/src/screens/CommandCenter.baseline.test.tsx` renders the shipping hub against a real
Core seeded by the real demo seed (`seedDemoContent`, no showcase — the content the CAN-7.5 captures
used) and snapshots, per state, four serialisations:

- `aria` — roles, accessible names, heading levels and the text between them, printed the way
  `ariaSnapshot()` prints. The desktop snapshot matches `state/RC-CAN-7.5/aria/aria-home-desktop.yaml`
  line for line apart from the current "New widget" sub-line (the copy changed after the capture).
- `dom` — the semantic DOM skeleton: headings, controls, images, landmarks and every element with a
  role, with their accessibility attributes and text, in document order. `div`/`span` wrappers,
  `style` and `class` are left out on purpose: what the hub looks like is the screenshot review's
  job, and a token or a wrapper moving is not a regression.
- `headings` and `focus order` — the heading outline and every tab stop by role and name.

States: idle at desktop, rail and phone; live on a table scene; live on the GM screen; no scenes;
the intermediate and core experience tiers (Manage loses Permissions, then disappears); an empty
vault; the player and observer variants. 44 snapshots.

After the conversion the same test renders the new hub and compares against these unchanged
snapshots with the widget-region wrappers (`section[data-widget-region]`) unwrapped.

### Step 2 — the conversion (`18742485`, formatted in `4221f077`)

**The home screen.** `command-center.ensure-home` now also provisions a GM-only FLOW screen of five
system template widgets, recorded as the `command-center` default screen
(`ScreenOrigin.defaultKey`): `home-hero` (hero), `home-scenes` (card grid), `home-create`
(launcher), `home-manage` (link list) and `home-library` (link list, card layout). In a fresh vault
it is created beside the board the command already creates; in an existing vault it is added and the
board is left byte-identical (a core test compares the JSON). Idempotent: once one exists nothing is
written, and a GM's edits to it are never reset (core test removes a part, re-runs ensure-home).

- Decision — the home pointer. `commandCenter.homeSceneId` keeps naming the board, which ADR-041
  keeps as the GM screen; `/` finds the home screen by its default key (`findHomeScreen`). Moving
  the pointer would have changed the meaning of a persisted field that `/board`, presets, safe
  points, the palette and CAN-7.3's aliases all read, and `command-center-state.ts` is outside this
  claim. Nothing persisted changes shape: the home screen is an ordinary scene with screen metadata.
- `isDefaultScreen` (core) is the one predicate for "not a table scene" (the board or any default
  screen). The hub's scenes, the sidebar's scene list and counts, the Data Hub and the session start
  picker use it, as they used `id !== homeSceneId` before; onboarding's "first scene" step ignores
  default screens too.
- Every part's settings are definition defaults (bare presentation, headings, labels), and the
  instances carry no configuration, so a part rebuilt from the same definition is configured the
  same. App-translated text is stored as `i18n:<key>` (`WIDGET_TEXT_MESSAGE_PREFIX`) and rendered
  through the viewer's catalog by the hub templates, so Spanish keeps working.

**Public surface additions** (owned `widget-package-state.ts`): intents gain optional `icon` and
`hint` (launcher tiles, Manage rows); three query sources — `resume` (the hero's target, with the
intent its primary follows in `meta`), `table-scenes` (CC-09's list), `library-sections` (CC-13's
counts) — each a mapping over actor-scoped reads, in `app/widgets/homeSources.ts`.

**Layout.** The hub's body is Scenes beside a column of Create over Manage. Flow packs rows, so
Manage would have landed under Scenes. Consecutive tiles that share a layout group now STACK in one
lane (`flowPlacementsForOrder`; the tiles beside the stack span its rows; the stack closes its band
so row-by-row reading still meets tiles in layout order). The home screen groups Create and Manage.
`/` renders the screen in reading mode with the hub's own tier rule (only phone collapses), through
`WidgetRenderSlot` and so inside each part's labelled widget region.

**Hub templates.** Rebuilt to the bespoke hub's structure and states: hero eyebrow (live/idle),
title, subtitle, status dot, avatar stack with titles, the primary chosen by the resume row; scene
tiles (thumbnail grid, Live/Ready/Draft badge, lock glyph, hover); the `1fr 1fr` launcher with icon
chip and hint; Manage rows in a flat card with dividers and chevrons; library cards. Intents a
viewer cannot follow are not drawn; a Settings intent whose tab is hidden at the experience tier is
not drawn either, and a declarative list with nothing left draws nothing (Manage at the core tier).

### Boundary crossings (outside Owns — flagged for the operator)

Each is what the acceptance needs; none changes another surface's behaviour beyond what is named.

- `app/widgets/templates/Hub.tsx`, `HubIntent.tsx`, `index.tsx`, `Hub.test.tsx` (+ snapshot) — the
  parts ARE these templates; parity had to be built here, not around them (ADR-041: no bespoke hub
  behind a widget-shaped wrapper). `index.tsx` passes the viewer's translator to the data resolver.
  `Hub.test.tsx`: two assertions assumed the "new" action after the tiles; it now heads the section
  as in the hub. 15 snapshots re-recorded (markup only).
- `app/widgets/dataEnvironment.ts` (+ new `homeSources.ts`) — three source cases, `icon` on rows, a
  `translate` in the host context. `dataEnvironment.hub.test.ts`: isolation cases for the three.
- `app/widgetBuilder/vocabulary.ts` + en/es catalogs + `qps-ploc.ts` (regenerated) — the
  `Record<WidgetDataQuerySource, …>` needs the three labels; `home.setupFailed*`,
  `sceneEditor.rebuildWidget`.
- `packages/core/src/schemas/widget-package.ts` — the strict intent schema accepts `icon`/`hint`.
- `app/board-helpers.ts` — `BoardWidget.groupId`, `FlowRect.groupId`, `FlowPlacement.rowSpan`, the
  stacking rule; `flow-layout.test.ts` covers it. `app/canvas/FlowBoard.tsx` — `rowSpan` on the grid
  row, and bare presentation in view mode (WID-5.3's contract, which flow did not honour yet).
- `app/widgets/WidgetRenderSlot.tsx` — `fitsContent`: a region whose host sizes it to content does
  not clip (the hero card's shadow and outward focus rings were cut by `overflow:auto`).
- `screens/sceneEditor/Inspector.tsx` — "Rebuild in the widget builder" for a system template
  widget: opens the builder on the system definition under a new package/type id. Without it a GM
  had no way to rebuild a part in the builder.
- `app/shell/Sidebar.tsx`, `app/widgets/builtin/DataHubBody.tsx`, `screens/session/useSessionView.ts`,
  `packages/core/src/state/onboarding.ts` — leave the home screen out of table-scene lists.
- Tests whose fixtures enumerate every system widget: `WidgetFrame.test.tsx` (header identity —
  bare parts have no header in view mode) and `builtin-bodies.test.tsx` (the parts deliberately have
  no builtin body). Core tests: ensure-home now writes the home screen too (`command-center`,
  `command-center-default-bindings`, `navigation-view`).
- `scripts/eslint-rules/no-raw-style-values.allow.js` — CommandCenter.tsx 33 → 3 (two-sided ratchet).
- `tests/e2e/hub-templates.spec.ts` — the card-grid slice now matches the baseline's order.

SceneCardsPanel and SceneQueuePanel (owned) are the atmosphere scene-card panels, not screens; they
needed no change.

### Evidence so far (local)

- `CommandCenter.baseline.test.tsx`: the 44 committed snapshots pass UNCHANGED against the new hub
  (regions unwrapped); the region labels are asserted (`1. Resume` … `5. Library`); a GM-built copy
  of each part, and of all five with the column re-grouped, serialises identically.
- `pnpm typecheck` 0; `pnpm lint` 0 (warnings only); `pnpm gates` 0; app vitest 168 files / 2052
  tests; core vitest 287 files / 5240 tests; `format:check:changed --base 13bfd9e5` clean.
