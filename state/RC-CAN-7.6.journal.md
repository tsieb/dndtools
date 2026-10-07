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

### Visual gate (run on `3ef6705d`) and rebase onto `24201708`

The visual gate ran 516: 515 passed, 1 failed — `knowledge-polish.spec.ts` › "knowledge note card —
tavern" on `visual-phone`, a `toHaveScreenshot` **timeout** (the page never settled within 5 s), not a
pixel diff, on `/knowledge`, which this branch does not touch. Re-run locally in the pinned container
with `--repeat-each=3`: 45/45 passed. Treated as the known one-off host stall in the full visual gate.

`loop/rc` had moved 10 commits (RC-KNW-6.4: Notes filter/refine, composer templates, re-baselined
Notes/Graph/shortcut captures). Rebased onto `24201708` without conflicts (no PNG this branch
re-baselined was also re-baselined upstream); `qps-ploc` regenerated (no change). On the new head:
`pnpm typecheck` 0, `pnpm lint` 0, `pnpm gates` 0, `format:check:changed --base loop/rc` clean,
`pnpm test:app` 174 files / 2117 tests (no errors), `pnpm test:critical` 290 files / 5286 tests, and
the full visual suite in the pinned container **516 passed**.

### Browser-acceptance gate (run on `bc5ac0c8`)

Every other gate passed (quality gates, format, visual 516, typecheck, lint, core, app, tooling,
build, bundle budget, requirements audit). Browser acceptance (`pnpm e2e --workers=2 --retries=2`):
1892 passed, 35 skipped, **1 failed** — `canvas-cues.spec.ts:287` "a drag by the grip shows a drop
indicator, reorders, and Undo restores" on `mobile-chromium`, failing on all three attempts.

Mine: the spec's `openFlowScene` fixture turns `homeSceneId ?? the first authored scene` into a flow
screen. On the base `/` provisioned nothing, so it always got a demo table scene; on this branch `/`
runs `ensure-home`, and the fixture raced onto the GM screen's board, whose first tile is the bound
Map. Reproduced 6/6 on mobile: a grip drag on that Map tile selects it instead (the Inspector stays
open). The fixture now skips default screens (as the golden-routes scene picker already does) —
`canvas-cues.spec.ts` ×4 on both profiles: 52 passed, 4 skipped (profile-specific).

Follow-up for the flow board's owner (not changed here; `FlowBoard` and `Map.tsx` are outside the
claim): on a phone, dragging a flow tile whose body is the Map tile by its grip selects the tile rather
than starting the drag. Other specs still use `homeSceneId ?? first scene` (flow-layout, atlas,
dice-tray, encounter-builder …); all passed in this gate run.

### Restart re-admission (2026-10-07) — rebase onto `ca25e26b`

The operator restart refunded an attempt and re-admitted the preserved work. `loop/rc` had moved 8
commits (RC-WID-6.7 install/trust wording with re-baselined Extensions and rail Add-panel captures,
the CI linear-history change, a gallery-test fix, an infra build fix). Rebased; the only conflicts were
the 15 `/extensions` PNGs both sides had re-baselined. Took upstream's, finished the rebase, then ran
the full visual suite in compare mode: **501 passed, 15 failed — exactly those 15**, each showing
RC-WID-6.7's wording unchanged plus this branch's "Command Center Parts" row. Re-baselined them in the
pinned container (`--update-snapshots=changed`, 15 files) and re-ran `extensions-polish`: 45/45.
Visual budget 33522.7 of 34816 KiB.

On the rebased head: `pnpm typecheck` 0, `pnpm lint` 0, `pnpm gates` 0, `format:check:changed --base
loop/rc` clean, `pnpm test:app` 174 files / 2123 tests (no errors), `pnpm test:critical` 290 files /
5286 tests; `qps-ploc` regenerated (no change).

## Session 4 — independent review on `f1cf17f6` (2026-10-07)

The review rejected the candidate on two findings. Both reproduced from the code, then fixed:

1. **High — the home screen lost its layout and bare presentation at `/screen/:id`.** `/` drew the
   parts through a home-only path (`homePlacements` + `HomePart`); the screen's own route draws flow
   screens with `FlowBoard`, which packed rows (Manage under Scenes) and framed every tile. So the
   "normal flow screen" only looked right on `/`, and a copied part would not look the same anywhere
   else. Session 2 had reverted the flow-board half of this to stay inside the claim; the review
   shows it is part of the acceptance, so it is back as ONE shared path:
   - `board-helpers.ts` — `flowPlacementsForOrder` now does the group stacking itself (moved from
     `CommandCenter.tsx` unchanged; byte-identical output without groups, so every existing flow
     screen packs as before). `BoardWidget.groupId` is filled from the layout only when set;
     `FlowPlacement.rowSpan` is set only beside a stack. `boardWidgetPresentation` reads instance
     configuration, else the definition's default field (WidgetFrame's rule).
   - `canvas/FlowPart.tsx` (new, beside FlowBoard, which sits at the 800-line gate) — the bare cell
     (`HomePart` moved here), `useBlankTiles`, `flowPartGap` (28px / 24px phone).
   - `canvas/FlowBoard.tsx` — in VIEW mode a bare tile is page content: no frame/header/caption/rail,
     no tile tab stop (its controls are the stops; the arrow walk covers framed tiles), and out of the
     layout while it draws nothing. A grid of only bare parts uses the part gap. Edit mode is
     unchanged: every tile framed, grabbable, walked. `FlowViewTile` is the exported view-mode tile.
   - `CommandCenter.tsx` renders the home screen with `flowPlacementsForOrder` + `FlowViewTile`, so
     `/`, `/screen/:id` and a part copied elsewhere go through the same code. Kept: `/` uses the hub's
     tier rule (rail keeps 12 columns); `/screen/:id` uses the flow tier (rail reflows to 6), as every
     flow screen does.
2. **Medium — Presentation and Style settings had no effect.** Framed now draws the flow frame on
   both routes (same `FlowViewTile`). `Hub.tsx` wraps what a hub template draws in `HubStyle`: two
   `display: contents` levels that point `--color-accent` / `--color-text-primary` at the part's
   `--widget-accent` / `--widget-text` (two levels because a property naming itself is a cycle). With
   the declared defaults they resolve to the theme's colours; a picked colour also re-derives the
   accent fill/border and the quieter text levels. DS controls inside (the hero's primary button,
   Card borders) follow. A template that draws nothing still renders nothing (blank detection holds).

Tests added: `CommandCenter.baseline.test.tsx` — `/screen/:id` (FlowBoard in view mode over the same
actor-scoped widgets) has the same cells, aria/DOM/headings/focus serialisation and gap as `/`, at
advanced and core tiers, also after all five parts are GM-rebuilt copies; framed + styleTokens on the
hero reach both routes. `flow-layout.test.ts` — four stacking cases. `hub-templates.spec.ts` (desktop,
real browser): part geometry and gap equal on `/` and `/screen/<home>`, no chrome; after configuring
the hero framed with `{accent:'#ff00ff', text:'#00ff00'}` its heading computes `rgb(0, 255, 0)` and its
primary button `rgb(255, 0, 255)` on both routes, while Scenes keeps the theme. Template snapshots
(`Hub.test`, `noQuery.test`, 20) re-recorded: the two wrapper divs only. The 44 committed baselines
are unchanged.

Evidence: `pnpm typecheck` 0, `pnpm lint` 0, `pnpm gates` 0, `format:check:changed --base loop/rc`
clean, `pnpm test:app` 174 files / 2129 tests. `token-references.test` caught the undeclared
`--hub-*` names; they now carry an inert `currentColor` fallback (the outer level always sets them).
Browser: targeted Playwright batch (a11y-axe-gate, canvas-cues, command-palette, demo-vault,
flow-layout, golden-path, hub-templates, onboarding-consent, pinned-screens, responsive,
scene-templates, screens, settings-tiers, widget-builder) on desktop + mobile: **436 passed, 6
skipped, 0 failed**. Full visual suite in the pinned container: **516 passed, no golden changed** —
`/` and `/scenes` at every theme and tier render exactly as the reviewed `e760a983`/`62f2e672`
baselines, so the earlier per-theme/tier `ux-ui-reviewer` comparison still describes this head.
Perf: `scene-first-render` **1294.6 / 1500 ms PASS**, `app-startup` 1208.8 / 2000 ms PASS; `compare.ts`
exits 1 on the ±20% historical-baseline drift (+21.2% / +20.1%, the untouched `app-startup` drifting
equally, captured right after the 13-minute visual run), not on a budget.

Not changed (outside this story): `WidgetFrame` (canvas) keeps a bare tile focusable, as WID-5.3
shipped; other template kinds (stat block, table…) still read the theme tokens directly.

### Claim gate on `dd69af55` — three paths kept, operator decision needed

The gate flagged `app/board-helpers.ts`, `app/canvas/FlowBoard.tsx` and the new
`app/canvas/FlowPart.tsx`. Each was re-checked against the review's high finding (the home screen
must look and lay out the same at its canonical route, `/screen/:id`, and copied onto other
screens). None can be reverted without bringing that finding back:

- `/screen/:id` renders through `ScreenView` → `Board` → `FlowBoard`; no owned file is on that path.
  The chrome the review saw is `FlowBoard`'s `FlowTile`, and only `FlowBoard` can draw a bare tile
  without it. Wrapping or special-casing the home screen elsewhere is what the review rejected
  ("no special home host").
- Manage's column comes from `flowPlacements` in `board-helpers.ts`, the one flow placement the board
  uses; the stacking has to live there for the board to stack. `FlowBoard` receives `BoardWidget[]`
  from `boardWidgetsOf` (also `board-helpers.ts`), which is the only way a layout group reaches it.
- `FlowPart.tsx` exists only because `FlowBoard.tsx` would otherwise cross the 800-line hard gate
  (846 lines); folding it into an owned screen file would make `app/canvas` import from `screens/`
  in a cycle with `CommandCenter.tsx`.

Smallest alternative considered: revert all three and keep the session-2 home-only path. That
restores the exact defect the independent review rejected (`/screen/<home>` framed, Manage in
column 1), so it was not taken. If the operator declines to widen the claim, reverting these three
paths and `CommandCenter.tsx` to `f1cf17f6` is the fallback; the `Hub.tsx` style fix (owned) works
on its own.

## Session 5 — claim widened to the flow path (2026-10-07)

Operator brief: owns now include `app/board-helpers.ts`, `app/canvas/FlowBoard.tsx` and
`app/canvas/FlowPart.tsx`; re-run gates on the existing candidate and change nothing else. No code
changed in this session; the head's code is byte-identical to `dd69af55` (only this journal
differs). Every changed source path is now inside the claim.

Gates on `544b1cf6` (base `ca25e26b`): `pnpm typecheck` 0, `pnpm lint` 0, `pnpm gates` 0,
`format:check:changed --base ca25e26b` clean, `pnpm test:app` 174 files / 2129 tests,
`pnpm test:critical` 290 files / 5286 tests. The baseline snapshot file is unchanged since its first
commit `d885844e`. The browser evidence from session 4 stands for this code: targeted Playwright 436
passed / 0 failed on both profiles, full visual suite 516 passed with no golden changed,
`scene-first-render` 1294.6 / 1500 ms.

For the next rebase (not done here, per the brief): `loop/rc` is 11 commits ahead (`1f78337f`).
RC-UX-6.4 (`7b319298`, `a57f2350`) touched three files this branch changes — `CommandCenter.tsx`,
`shell/Sidebar.tsx`, `core/state/onboarding.ts` — and re-baselined the six desktop/rail
`command-center--*` goldens. The `CommandCenter.tsx` conflict carries a behaviour that must move into
the home's Create part: the "New widget" launcher is hidden below its tier
(`featureGateVisible('home.create.widget', tier)`). The bespoke hub it was written against no longer
exists here, so on rebase that gate belongs in `Hub.tsx`'s live availability check (or as a gate on
the `home-create` intent); the goldens then need re-capturing on top of upstream's.

## Session 6 — rebase onto `1f78337f` (RC-UX-6.4) (2026-10-07)

The gate's rebase onto `1f78337f` conflicted in `CommandCenter.tsx`. Rebased here (pre-rebase tip
tagged `rc-can76-pre-rebase-2`):

- `CommandCenter.tsx` (conversion commit): resolved to the converted page. Upstream's change was to
  the bespoke hub that page no longer contains: RC-UX-6.4 hid the "New widget" launcher below its
  complexity-map gate (`home.create.widget`, intermediate). Carried into the Create part instead
  (`eea04cdb`): `Hub.tsx`'s live availability check offers an intent named like a gate the map places
  on the Command Center (`surface: '/'`) only from that gate's tier. Checked against every home
  intent: only `new-widget` matches (scoping to `/` keeps the library's Campaign card, `nav.story`,
  ungated, as the hub had it).
- The six desktop/rail `command-center--*` PNGs (both sides re-baselined): took upstream's, then
  re-captured (`50cbb191`).
- Everything else merged cleanly (`Sidebar.tsx`, `onboarding.ts`, the core barrel, en/es catalogs);
  the branch's own source files are byte-identical to the pre-rebase tip, `qps-ploc` regenerated
  with no change.

**Baselines re-recorded on the new base.** "Today's Command Center" changed upstream, so the
committed baselines were regenerated against upstream's own hub (the rebased baseline commit's
sources, `498e2454`, with `-u`): exactly one change — "New widget" leaves the core-tier state
(6 snapshot lines). The new home passes the re-recorded file unchanged, all states, including the
GM-built duplicates and the canonical-route parity.

**Goldens.** A full visual compare on the rebased head: 509 passed, 7 failed — the six `/`
desktop/rail captures (expected: upstream's are of the bespoke hub at the new Standard default) and
`community — parchment` on phone, a `toHaveScreenshot` 5 s timeout (no pixel diff) on a route this
branch does not touch; `community.spec.ts --repeat-each=3`: 90/90. Re-captured the six (changed
only), losslessly re-deflated (−51 KiB), golden routes desktop + rail 142/142; budget 33,745.6 of
34,816 KiB. A `ux-ui-reviewer` comparison of the six before (upstream hub, `1f78337f`) / after
pairs, measured by pixel and sampled colour: **no regression finding** in any pair — same content,
order and per-theme colours, nothing clipped; the known 58/42 split (cards −3 to −5 px) and the
cumulative 2–8 px downward shift stay within tolerance; card gutters are now a uniform 12 px (were
11–14 px). It noted the rail Story tile's "0 threads" against the sidebar's "6 threads" is the same
before and after (not this change). The phone `/` captures did not move.

Evidence on `50cbb191`: `pnpm typecheck` 0, `pnpm lint` 0, `pnpm gates` 0,
`format:check:changed --base loop/rc` clean, `pnpm test:app` 174 files / 2133 tests,
`pnpm test:critical` 290 files / 5286 tests; Playwright targeted batch (the 14 specs of session 4 +
widget-query-sources) on desktop + mobile **446 passed, 6 skipped, 0 failed**; `scene-first-render`
**1223.7 / 1500 ms PASS (steady)**, `app-startup` 1155.3 / 2000 ms PASS (steady).

CAN-7.5 row update: CC-11 Create launchers — New widget from the intermediate tier
(`home.create.widget`), checked by the re-recorded core-tier baseline.

## Session 7 — independent review on `4f81c477` (2026-10-07)

The review rejected the candidate on two high findings. Both reproduced from the code and fixed.

1. **Canonical route at phone and rail.** On a phone, `Board.tsx` chose `StackedBoard` (the phone
   panel list, RC-CAN-5.1) before `FlowBoard`, so `/screen/<home>` framed every part in a 172px
   disclosure panel. At rail, `/` used 12 columns and `FlowBoard` used 6, so Scenes and Create/Manage
   each went full width on the screen route only.
   - `board-helpers.ts`: `flowColumnsFor(tier, widgets, editing)` is now the one column rule for both
     routes. A screen whose tiles are all bare in view mode is one page of content, so it keeps the
     authoring grid at rail and only the phone collapses it (the hub's rule). A framed tile, or edit
     mode, reads the tier's own grid, so every existing flow screen reflows at rail as before
     (`flow-layout.spec` still sees 6 columns). `FlowBoard` and `CommandCenter.tsx` both call it.
   - `screens/Board.tsx` — **outside the claim, 1 line plus moving 3 lines up**: `useStackedPosture(phone
     && !editing && !flow)`. The panel list stands in for a canvas on a phone; a flow screen already
     collapses to one column (ADR-041), so it goes through `FlowBoard` at every tier. `flow` is
     computed a few lines earlier so the hook can read it. No owned file is on this path: `Board`
     picks the board component before `FlowBoard` is reached. Canvas-policy boards are unchanged.
2. **No builder path for the parts.** `widgetEditTarget` (app) and `widget.package.fork` (core) both
   refuse any `author: 'system'` widget, because most system widgets draw through a hand-written body
   keyed by type that a copy would lose. The home parts have no such body.
   - `widget-package-state.ts`: `isCopyableSystemWidget` is true only for a system TEMPLATE widget
     whose type is one of `HOME_WIDGET_TYPES`. Exported from the core barrel.
   - **Outside the claim, one condition each**: `core/src/commands/widget-package.ts` (fork refusal)
     and `app/widgetBuilder/draft.ts` (`widgetEditTarget`) now refuse `author === 'system' &&
     !isCopyableSystemWidget(widget)`. Every other system widget stays locked (tested).
   - The GM's path is the one RC-WID-6.6 ships: tile menu or Inspector → **Edit widget** → fork (on
     at once: template code is author-trusted) → `scene.repoint-widget` (same instance, layout and
     layout group) → builder. The copy is named "Resume (copy)" by the builder's fork convention, so
     its region label reads "1. Resume (copy)"; everything it draws is unchanged.

Tests:
- `CommandCenter.baseline.test.tsx`: canonical parity now renders `FlowBoard` at the current tier
  and checks rail (same 7 + 5 cells as desktop) and phone (one column). A new case runs the real
  builder path for all five parts: `widgetEditTarget` → `fork`, `widget.package.fork`,
  `scene.repoint-widget`, then the builder's save (`readPackage` → `buildPackage` →
  `widget.package.upgrade`). After each step the serialised hub equals the original; the copies keep
  settings, queries and intents; the arrangement holds; parity holds at all three tiers. Another case
  checks other system template widgets stay locked (target null, fork rejected).
  The pure DOM serialisers moved to `CommandCenter.serialise.ts` (the test hit the 800-line gate at
  833); the committed snapshot file is unchanged.
- `command-center-home-screen.test.ts` (core): each part forks with its definition intact; a
  non-home system template widget is refused.
- `hub-templates.spec.ts` (real browser): at 900px and 390px, `/` and `/screen/<home>` have the
  same part columns and widths, the screen route draws the flow grid (not the panel list), no chrome,
  and no part's region clips. Second test: Edit layout → hero tile menu → Edit widget opens the
  builder, the tile moves to `home-hero-copy`, stays there after Escape, and `/` draws the same hero
  text, still bare.

Evidence on the session-7 code (`061b28b7`, base `1f78337f`): `pnpm typecheck` 0, `pnpm lint` 0,
`pnpm gates` 0 (after the serialiser split; it first failed on the 833-line test file),
`format:check:changed --base loop/rc` clean, `pnpm test:critical` 290 files / 5287 tests,
`pnpm test:app` 174 files: 2134 passed, 1 failed. The failure was `play/Sheet.test.tsx` timing out
at 5 s while the browser batch loaded the host. That file isn't touched here, and alone it passes
3/3. The baseline test passes 15/15 with the committed snapshot file unchanged. Playwright on
desktop + mobile, 28 specs (every spec that touches flow screens, `/screen/`, the stacked list or the
home screen, plus widget-edit-fork, widget-builder, golden-path, demo-vault, settings-tiers,
onboarding-consent, widget-query-sources): **617 passed, 21 skipped, 0 failed, 0 flaky**.
`golden-routes` in the pinned container: **213 passed, no golden changed**, so the per-theme/tier
screenshot review of `50cbb191` still describes `/`. `scene-first-render` **1191.0 / 1500 ms PASS**
(steady). `compare.ts` printed "gate FAILED" only because the other budgets weren't captured in this
run.

Paths outside the claim in this session (flagged for the operator): `screens/Board.tsx`,
`core/src/commands/widget-package.ts`, `app/widgetBuilder/draft.ts` (one condition each, reasons
above), the core barrel export, the new test helper `screens/CommandCenter.serialise.ts`, and tests.
