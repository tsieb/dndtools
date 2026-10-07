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

### Step 3 — browser checks, review and re-baseline (`e760a983`)

- The first container run of `golden-routes` moved exactly 18 goldens: `/` and `/scenes`, three
  themes × three tiers. Nothing else moved; the `/scene/:id` capture was kept on the same table
  scene by skipping default screens in the spec's scene picker (opening `/` now provisions them).
- It also showed one real regression: at the core tier (the goldens' tier) Manage draws nothing and
  its empty slot still took a grid row, pushing Library down ~32px and leaving an empty labelled
  region. Fixed: a part whose body draws nothing leaves the layout (kept mounted, `display:none`,
  out of the placements), and DOM order stays the reading order. Unit test added.
- Spacing brought back to the hub's values with token-backed `calc()`: 14px launch tiles, 10px row
  padding, 28px between parts (24px on a phone).
- `ux-ui-reviewer` compared the 18 before/after pairs (`/tmp/rc-can76-before`, `/tmp/rc-can76-after`):
  **no regression in any pair**. Minor notes, within token tolerance: the 12-column grid gives a
  58/42 Scenes/Create split instead of 60/40 (Scenes cards ~6px narrower); content ~4px lower. Nits
  outside this claim, left as follow-ups: the `/screens` thumbnail draws a flow screen from its
  nominal canvas geometry (`ScreenThumbnail.tsx`, CAN-7.3) rather than its flow placement; and
  deleting the Command Center screen from the library means the next visit to `/` provisions a new
  one (`ensure-home` looks for a LIVE default screen) — after an Undo the oldest one is used and the
  newer copy stays in the library for the GM to delete.
- Re-baselined the 18 goldens in the pinned container (`--update-snapshots=changed`); the visual
  budget is 32.9 of 34.0 MiB.
- Playwright (local, desktop + mobile): hub-templates, screens, pinned-screens, flow-layout,
  golden-path, demo-vault, responsive, settings-tiers, local-vaults, command-palette,
  shell-pin-bounds, onboarding-consent, scene-templates — **353 passed**.
- Perf (`perf:capture --only scene-first-render,app-startup`, then `compare.ts --run`):
  `scene-first-render` **1232.6 ms / 1500 ms — PASS**, steady (+15.4% on a busy host; `/board`
  now also provisions the home screen); `app-startup` 1087.3 / 2000 ms PASS. The compare script
  prints "gate FAILED" only because 9 of the 11 budgets were not captured in this run.

### CAN-7.5 Command Center rows

| Row      | Element                    | Where it is now                                                                                                    | Checked by                                              |
| -------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| CC-01    | Hero eyebrow               | `home-hero` `eyebrow`/`liveEyebrow` (`i18n:nav.commandCenter` / `home.sessionLive`), live from the `resume` row    | baseline idle + live snapshots                          |
| CC-02    | Hero name                  | `resume` row: the live scene's name only while live, else "Your campaign"; `<h2>`                                  | idle, live-scene, live-GM-screen snapshots              |
| CC-03    | Subtitle + party count     | `resume` row secondary                                                                                             | snapshots (with and without party: empty vault)         |
| CC-04    | Live dot                   | hero `StatusDot`, pulse while live                                                                                 | screenshots; aria (absent, decorative)                  |
| CC-05    | Avatar stack               | `party` query, ≤5, `role=img` + name + title                                                                       | DOM snapshot                                            |
| CC-06    | Hero primary               | `resume` row `meta` names the intent: GM screen `/board`, enter/open `/scene/:id`, `/scenes` when nothing resolves | three snapshot states; live-GM-screen label             |
| CC-07/08 | Scenes header + New scene  | `home-scenes` heading + `new` intent (`open-route /scenes`)                                                        | snapshots                                               |
| CC-09    | Scene tiles                | `table-scenes` source; Live/Ready/Draft badge, lock, hover; open-screen intent                                     | snapshots incl. live; `table-scenes` isolation test     |
| CC-10    | Empty state                | card-grid empty card + `empty` intent                                                                              | "no scenes" and empty-vault snapshots                   |
| CC-11    | Create launchers           | `home-create`, five intents with icon + hint, two columns                                                          | snapshots                                               |
| CC-12    | Manage links               | `home-manage`, open-settings intents gated by the experience tier; hidden when none                                | advanced / intermediate / core snapshots; collapse test |
| CC-13    | Library counts             | `library-sections` source + open-route intents, card layout                                                        | snapshots; isolation test                               |
| CC-14/15 | Player / observer variants | unchanged participant card in `CommandCenter.tsx` (players never see the GM's screen)                              | player and observer snapshots                           |

Keyboard and heading order: the `headings` and `focus order` snapshots of every state above pass
unchanged.

## Session 2 — claim gate follow-up (2026-10-05, base `b04c529e`)

The gate rebased the branch onto `b04c529e` and flagged 15 paths outside the claim. Each was
re-checked against the acceptance; commit `2148f8c9` carries the per-path reasons.

**Reverted to base** (not required, or done inside owned files instead):

- `app/board-helpers.ts`, `app/canvas/FlowBoard.tsx`, `app/flow-layout.test.ts` — the lane
  stacking (Create over Manage beside Scenes) moved into `CommandCenter.tsx` as `homePlacements`,
  reading the parts' layout groups from the scene. Consequence: at `/screen/:id` the flow board
  (CAN-7.7) still packs rows, so Manage sits under Scenes there, and flow does not yet honour bare
  presentation; `/` is unaffected. Both are follow-ups for the flow board's owner.
- `app/widgets/WidgetRenderSlot.tsx` — the page sets `overflow: visible` on its own parts' regions
  (from `HomePart`'s layout effect) instead of a slot prop.
- `screens/sceneEditor/Inspector.tsx` and the `sceneEditor.rebuildWidget` key — the "Rebuild in the
  widget builder" button is gone. The duplicate acceptance is proved through the builder's own
  `readPackage`/`buildPackage` in the baseline test; an in-app entry point for copying a system
  template widget into the builder is a follow-up (the Inspector's owner).

**Kept, and why** (the task should be blocked for the operator to decide on widening):
`templates/Hub.tsx`, `HubIntent.tsx` (the parts are these renderers — baseline and duplicate
acceptance); `templates/index.tsx` (the viewer's translator, so es is not English-only);
`dataEnvironment.ts` + `homeSources.ts` (the three sources); `widgetBuilder/vocabulary.ts`
(typecheck); `schemas/widget-package.ts` (a GM-built copy with icon/hint must install);
`shell/Sidebar.tsx` (else "3 scenes" on `/`); `builtin/DataHubBody.tsx` (reverting it fails the
existing builtin-bodies snapshot: "Scenes 1"); `session/useSessionView.ts` (else the start picker
offers the home screen); `core/state/onboarding.ts` (else the existing onboarding test fails).

Evidence after the reverts: `pnpm typecheck` 0; `pnpm lint` 0 (16 pre-existing warnings); app vitest
168 files green (DataHub snapshot restored); core vitest 287 files / 5241 tests; baseline test 11/11
(44 committed snapshots unchanged); `golden-routes` in the pinned container: **213 passed**, no
golden changed from the `e760a983` re-baseline.

Not completed: the full Playwright suite (both profiles, 1882 tests) was started twice and both runs
were cut off when the session ended (the second reached 36/1882 with no failures). Locally proven
browser coverage is therefore the 353-test targeted batch (session 1) and the 213 golden routes;
the operator's browser gate is the full-suite evidence.

## Session 3 — widened claim, rebase onto loop/rc (2026-10-06)

Operator brief: the claim now covers the crossings the journal justifies; rebase (the branch was 19
commits behind) and re-run gates on the existing candidate.

- Rebased onto `582ed519` (pre-rebase tip tagged locally as `rc-can76-pre-rebase`). Conflicts:
  `packages/core/src/index.ts` (RC-WID-6.5's query-option type exports beside `HomeWidgetType` — both
  kept) and `screens/sceneEditor/Inspector.tsx` (resolved to `loop/rc`: this branch no longer changes
  it). The files session 2 reverted (`board-helpers`, `FlowBoard`, `WidgetRenderSlot`,
  `flow-layout.test`, `Inspector`) are byte-identical to `loop/rc`. Every changed source path is in
  the widened claim; the rest are tests, catalogs (`qps-ploc` regenerated), the core barrel, the
  raw-style ratchet and this journal.
- RC-WID-6.5 (new upstream) pins every template kind with no query. It caught one behaviour change
  in the rebuilt hub templates: a card grid with no query drew a blank empty card instead of "This
  widget has no data source yet." Fixed in `Hub.tsx` (`b87787e3`); the hero, launcher and link list
  differed in markup only, so the four snapshots were re-recorded.
- `widget-query-sources.spec.ts` pins the full source list; it now includes the three home sources
  (`98fad959`).

Evidence on the rebased tree: `pnpm typecheck` 0; `pnpm lint` 0 (16 pre-existing warnings);
`pnpm gates` 0; `format:check:changed --base loop/rc` clean; app vitest 174 files / 2116 tests; core
vitest 290 files / 5286 tests; `CommandCenter.baseline.test.tsx` 11/11 with the 44 committed
baselines unchanged; `golden-routes` in the pinned container 213 passed (no golden moved);
Playwright targeted batch (hub-templates, screens, pinned-screens, flow-layout, golden-path,
demo-vault, responsive, settings-tiers, local-vaults, command-palette, shell-pin-bounds,
onboarding-consent, scene-templates, a11y-axe-gate, widget-builder, widget-query-sources) on desktop

- mobile: 432 passed, 4 skipped, then the 4 query-source failures fixed by the spec update (4/4);
  `scene-first-render` 1241.0 / 1500 ms PASS, `app-startup` 1129.8 / 2000 ms PASS (0 regressed).

### Visual gate follow-up (gate run on `fa65e901`)

The operator's "Visual regression (pinned container)" gate runs every visual spec (516), not only
`golden-routes`, and failed on `extensions-polish` and `palette-help`. Reproduced locally; both are
intended consequences of the home screen, so re-baselined (`62f2e672`, 36 PNGs):

- `/extensions` lists the new built-in "Command Center Parts" package beside the existing "Command
  Center Widgets" one (desktop + rail lists, the phone remove confirm; five themes each).
- Help's getting-started checklist reads "2 of 2 set up": the spec opens `/`, which now provisions
  the Command Center, so "Set up your Command Center" is done. Before, nothing was provisioned until
  `/board`, and the capture showed "1 of 2".
- Six rail palette captures differ only in the sliver of page (now the hub) behind the dialog's top
  edge; the dialog itself is identical.

Full visual suite in the pinned container after the re-baseline: **516 passed**; visual budget
34066 of 34816 KiB.

### Core-tests gate (run on `83e21300`)

Quality gates, format, the full visual suite, typecheck and lint passed. "Core tests"
(`pnpm test:critical`) failed on one test this branch does not touch:
`packages/core/tests/calendar.test.ts` › "is INDEPENDENT of host timezone, locale, and clock" —
`Test timed out in 5000ms` after 5363 ms. The test spawns `tsx` child processes to format under other
timezones and locales, so its cost is process start-up on the host; locally it takes 354 ms.
Re-run on the same head: `pnpm test:critical` exit 0 — 290 files / 5286 tests; the test alone 3/3
passes. No branch change touches the calendar code or that test (the core diff is
`command-center.ts`, `widget-package-state.ts`, `schemas/widget-package.ts`, `onboarding.ts`, the
barrel and four command-center/navigation tests). Treated as a host-load timeout; not edited (outside
the claim). The gate needs a re-run.

### App-tests gate (run on `8c1b24bb`) and rebase onto the repaired `loop/rc`

"App tests" (`pnpm test:app`) reported 174 files / 2116 tests passed but exited 1 on four uncaught
errors, all `TypeError: range.getClientRects is not a function` from `WidgetRegion`'s fit probe
(`WidgetRenderSlot.tsx`), attributed to `CommandCenter.baseline.test.tsx`. This was mine: the hub's
parts render inside widget regions, the baseline test stubs `ResizeObserver` (so the probe runs) and
jsdom has no `Range.getClientRects`; a probe frame that fired late under load threw outside any test.
Fixed in the test with the same `Range` stubs `SceneBoardCanvas.test.tsx` uses (`2a142da8`).

Rebased onto `c6e47e5d` (the ci-recovery repair; it only splits the browser e2e into shards). On the
new head: `pnpm test:app` exit 0 — 174 files / 2116 tests, no errors; the baseline test 3× 11/11;
`pnpm typecheck` 0; `format:check:changed --base loop/rc` clean.
