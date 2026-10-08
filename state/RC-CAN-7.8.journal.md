# RC-CAN-7.8 — Session as a screen

## Session 1 — 2026-10-08

Started on `dispatch/dndtools/82d34add539698b79ec0` at `8dc8b3db` (the `loop/rc` tip, RC-WID-5.5
landed) with a clean tree. No Headroom tools are exposed in this session; command output is read
directly or kept in `/tmp/rc-can78-*.log`. No additional agents.

Inputs read: RC_ROADMAP CAN-7 / WID-5 stories, ADR-041 "Defaults and preservation", SCREENS_PARITY
§3 and §4, the RC-CAN-7.6, RC-WID-5.5 and RC-SES-6.2 journals, `screens/session/*`,
`CommandCenter.tsx`, `command-center.ts`, `widget-package-state.ts`, `parity.ts`, `FlowBoard.tsx`,
`FlowPart.tsx`, `WidgetRenderSlot.tsx`.

### Step 1 — baselines of today's Session (committed first)

`apps/gm-react/src/screens/session/Session.baseline.test.tsx` renders the shipping `/session`
against a real Core seeded by the real demo seed and snapshots the same four serialisations the
Command Center's baselines use (aria, semantic DOM skeleton, heading outline, focus order; the
aria printer also names textboxes, checkboxes and comboboxes, which the console is full of). States:
Standby at desktop, rail and phone; Prep; Live; a live fight (three monsters, one hidden, one
bloodied) at desktop and phone; Recap after a party short rest (the rest timeline, SE-25); player
preview during the fight; a player's own device. 40 snapshots. The conversion is held to them with
the widget-region wrappers unwrapped.

### Step 1b — re-capture with the GM screen provisioned (`fix(core)` first)

The first conversion run matched every aria snapshot but not the DOM: the Stage panel's
per-player projection pickers listed scenes the fixture vault never had. The bespoke console never
provisioned anything, so the fixture had no board; the app creates the board and the home screen on
its first paint of `/`, and the CAN-7.5 captures came from such a vault. The fixture now runs
`command-center.ensure-home` after the demo seed, and the baselines were re-captured on the
UNCHANGED console (the only snapshot change is the board, "Command Center", in the 32 picker lists).

Before that re-capture, `getPlayerViewController` (core, outside Owns) stopped offering default
screens as projection targets: it listed every non-template scene, so the Command Center home
screen (RC-CAN-7.6) was already a target, and the Session screen would have become one. ADR-041
makes them the GM's own consoles; the GM screen's board stays a target. Core test added in
`player-view-control.test.ts`.

### Step 2 — the conversion (`a5e90d48`)

**The Session screen.** `command-center.ensure-home` with `session: true` provisions a GM-only FLOW
screen recorded as the `session` default screen (`SESSION_SCREEN_DEFAULT_KEY`), beside the board
and the home screen it already ensures. `/session` asks for it; nothing else does, so every other
caller of ensure-home (and every existing core test) is unchanged. Idempotent: once one exists
nothing is written and the GM's edits are never reset (core test removes a widget, re-runs).
Existing vaults gain it without any other scene changing (core test compares the JSON).

- Decision — provisioned on first open, not by every ensure-home. ADR-041 gives fresh vaults three
  default screens; provisioning it from every ensure-home would add a scene to every vault that
  opens `/` (the `/screens` goldens, library e2e counts and the dozens of core tests that run
  ensure-home). A vault gets it the first time a GM opens `/session`, which is where it is used.
  The operator may prefer the eager form; it is one condition in `handleEnsureCommandCenterHome`.
- Layout (`SESSION_SCREEN_PARTS`, owned `widget-package-state.ts`): the session status across the
  top (span 12), the combat tracker (span 7) beside one stacked group of the other twelve panels
  (span 5) — CAN-7.6's lane stacking reproduces the `1.6fr / 1fr` grid as 7/5. Reading and focus
  order: status, combat, then the column, as before.

**The widgets.** Each SCREENS_PARITY Session row group is one widget:

| Row(s)                     | Widget                                         | Body                         |
| -------------------------- | ---------------------------------------------- | ---------------------------- |
| SE-01–06, SE-30–32         | `session`, `view: console` (default `strip`)   | `SessionBody.tsx`            |
| SE-07–14, 33–37, 42–44     | `combat`, `view: tracker` (default `glance`)   | `CombatBody.tsx`             |
| SE-15                      | `dice`, `view: tray` (default `quick`)         | `DiceBody.tsx`               |
| SE-16 … SE-26              | `session-tables` … `session-schedule` (11 new) | `Session*Body.tsx` (11 new)  |

The three shared widgets gain a `view` select (Inspector "Shows") whose default is today's view,
so the GM board and Command Center tiles are unchanged; the GM can now switch a board Combat or
Dice tile to the full tracker or tray. The eleven panels are builtin system definitions in a new
`system.session-widgets` package: scene surface, not library-listed (like the home parts), bare
presentation by default, not forkable. They stay builtin because their behaviour has no public
widget surface yet (SCREENS_PARITY §4.2 G-05–G-11 are unbuilt).

- Each body owns its state and dialogs: the status widget the start, rest and end dialogs; the
  tracker the encounter builder (including the ⌘K/Create "Build encounter" intent), end-combat
  confirm and condition picker. Handlers moved out of `index.tsx` unchanged.
- `useSessionView.ts` became one actor-scoped hook per widget (`useCombatView`, `useTablesView`,
  …, plus `useSessionSeat` and `useSessionDispatch`), so a widget reads only what it shows.
  `startableScenes` keeps the board and now also leaves out the Session screen.
- Edit mode: the tracker is passed `previewing` when it has no `onCommand`, so its bare-key model
  (`n`/`p`/`d`/`h`, arrows) is not bound on `window` while the GM rearranges the screen.
- `/session` renders the screen in reading mode exactly as `/` renders the home screen
  (`flowColumnsFor`, `flowPlacementsForOrder`, `FlowViewTile`, blank parts out of the layout), with
  the console's 16px gap and `Page max={1280}`. A panel that draws nothing (the rest timeline before
  a rest; GM-only panels for a participant) leaves the layout. Previewing keeps the GM's layout; a
  non-DM device draws the default parts unsaved (the GM's screen is GM-only and never read for it).
- `Lifecycle.tsx`: `flush` on the header and the Standby status, so the status widget's trailing
  margin is the grid gap.

**WID-5.5 gate.** Passes with the Session debt recorded, as the amended gate requires:

- `parity.ts`: parity entries for the eleven bodies, declaring the public sources that really cover
  their reads (the test fails on a declared source that covers nothing); the shared modules they
  import (`screens/session/*`, `EncounterBuilder`, `net/SessionContext`) with each export's uses;
  sixteen core helpers classified pure (the workflow transition table, calendar math, the capture
  form's normalisers, the challenge maths — each a function over a value the caller holds).
- 98 new ledger entries (151 in all) under a new repair story, **RC-WID-5.13** (the Session screen's public
  surface: SCREENS_PARITY G-05 dialogs, G-06 multi-select, G-07 gates, G-08 keyboard, G-09
  headings, G-10 scheduling, G-11 combat writes). **Not on the roadmap: the operator needs to file
  it** (§4.2 filed those gaps as RC-WID-5.6–5.12 before the roadmap reused 5.6 and 5.7 for other
  stories). 13 are default-screen findings (a builtin on a shipped default screen); the rest are
  private uses, 22 of them the viewer's own seat (`permissions.actors[actorId].role`).
- `parity.test.ts` provisions the Session screen too, so the default-screen half sees it. Two
  expectations follow the third story: Session panel findings must name RC-WID-5.13, and the
  declared-but-unused case compares against the ledger instead of assuming dice has no private use.

### Paths outside Owns (flagged for the operator)

Each is what the acceptance needs; none changes another surface's behaviour beyond what is named.

- `packages/core/src/commands/command-center.ts`, `schemas/commands.ts`, `index.ts` — provisioning
  ("/session opens this screen") needs a core write with default-screen provenance; no public
  command sets `origin.kind: 'default'`. One optional payload flag, the builder and the finder.
- `packages/core/src/queries/player-view-control.ts` — default screens out of the projection
  targets (Step 1b). Without it the Stage panel offered "Session" as a scene to project.
- `apps/gm-react/src/app/widgets/builtin/index.tsx` and the eleven `Session*Body.tsx` — "each row
  is a widget" needs a type per row, and the gate attributes uses per body module (a body file
  holding several types charges each with all of their reads).
- `apps/gm-react/src/app/widgets/parity.ts` — "widgets that stay builtin pass the WID-5.5 gate".
- `scripts/eslint-rules/no-raw-style-values.allow.js` — `screens/session/index.tsx` 2 → 0.
- i18n catalogs + regenerated `qps-ploc.ts` — `session.setupFailed`.
- Tests: `parity.test.ts`, `builtin-bodies.test.tsx` (router + P2P context the app provides; the
  eleven panels are held to the Session baselines, not the one-value tile live-region contract;
  the rest timeline draws nothing until a rest), new `command-center-session-screen.test.ts`.

### Evidence so far (local)

- `Session.baseline.test.tsx`: the 40 committed snapshots pass UNCHANGED against the screen
  (regions unwrapped). New cases: the fourteen region labels and grid cells; `/screen/:id`
  (`FlowBoard`) draws the same cells and tree at desktop, rail and phone during a fight; the start,
  rest and end dialogs open from the status widget; the encounter builder and end-combat confirm
  from the tracker; the rest timeline joins the layout after a rest. 13/13.
- Core: `command-center-session-screen.test.ts` 8/8; full core suite 290 files / 5288 tests.
- App: full `pnpm test:app` before the last fixes 2178 passed / 14 failed, all in
  `builtin-bodies.test.tsx` (fixed above); widgets + screens + i18n after formatting 47 files / 753.
- `tsc --noEmit` app and core 0; `pnpm lint` 0 (warnings only, none in changed files);
  `pnpm gates` 0 (file-size warnings only).
