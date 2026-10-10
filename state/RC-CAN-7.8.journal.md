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

**The Session screen.** `command-center.ensure-home` with `screen: 'session'` provisions a GM-only
FLOW screen recorded as the `session` default screen (`SESSION_SCREEN_DEFAULT_KEY`), and nothing
else. `/session` asks for it; ensure-home without the field is byte-for-byte what it was, so every
other caller (and every existing core test) is unchanged. Idempotent: once one exists nothing is
written and the GM's edits are never reset (core test removes a widget, re-runs). Existing vaults
gain it without any other scene changing (core test compares the JSON).

- The first form (`session: true`, `a5e90d48`) also ensured the board and the home screen, so a
  fresh vault opened straight on `/session` gained a board that the start dialog offered as a
  "Continue" target: `session-lifecycle.spec.ts:124` (nothing to continue) failed on both profiles.
  Fixed in `a1861678`: `/session` provisions only its own screen.
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

| Row(s)                 | Widget                                         | Body                        |
| ---------------------- | ---------------------------------------------- | --------------------------- |
| SE-01–06, SE-30–32     | `session`, `view: console` (default `strip`)   | `SessionBody.tsx`           |
| SE-07–14, 33–37, 42–44 | `combat`, `view: tracker` (default `glance`)   | `CombatBody.tsx`            |
| SE-15                  | `dice`, `view: tray` (default `quick`)         | `DiceBody.tsx`              |
| SE-16 … SE-26          | `session-tables` … `session-schedule` (11 new) | `Session*Body.tsx` (11 new) |

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
  command sets `origin.kind: 'default'`. One optional payload field (`screen: 'session'`), the
  builder and the finder.
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

### Step 3 — browser checks

- The acceptance specs (desktop + mobile, local, own port): `combat.spec.ts`, every
  `session-*.spec.ts`, `dice-tray`, `encounter-builder`, `character-rest`,
  `combat-quick-reference`, `combat-audio-automation`, `player-preview`: first run 165 passed,
  2 failed — `session-lifecycle.spec.ts:124` on both profiles (Step 2's provisioning fix). After
  `a1861678`: lifecycle + the new quick panel spec 18/18. **No spec was edited**, not even a
  selector: the console's accessible names, roles and test ids are unchanged.
- New `tests/e2e/session-quick-panel-routes.spec.ts`: live session, then on `/`, `/board`,
  `/session`, `/screens`, `/characters`, `/atlas`, `/campaign`, `/knowledge`, `/audio` and
  `/settings` the quick panel's d20 rolls through the core (roll count +1, result shown). Both
  profiles (rail on desktop, sheet on the phone).
- Full Playwright suite at `a1861678`, both profiles: **1918 passed, 38 skipped, 0 failed**
  (33.1 min, `/tmp/rc-can78-e2e-full.log`).

### Step 4 — visual gate, before/after review, re-baseline

- Full visual suite in the pinned container at `a1861678` (`--update-snapshots=none --workers=2`):
  507 passed, 24 failed, all pixel diffs, none a timeout: the nine `/session` goldens (3 themes ×
  3 tiers) and the fifteen `/extensions` goldens (desktop and rail list, phone remove confirm × 5
  themes). `/extensions` lists installed packages, and the only change in its diff is the new
  built-in "Session Widgets" row (v1.0.0 · 11 widgets), as CAN-7.6's "Command Center Parts" row
  re-baselined it before. Copies of every actual/expected/diff: `/tmp/rc-can78-visual-fail/`;
  the before goldens: `/tmp/rc-can78-before/`.
- Before/after review of the nine `/session` pairs. Done in this session by reading each
  expected/actual/diff, not by a `ux-ui-reviewer` agent: the task forbids extra agents unless it
  authorizes them, and the central operator runs its own independent review. Findings, all within
  CAN-7.6's tolerance, **no regression**:
  - The columns split 7/12 : 5/12 (58/42) instead of `1.6fr 1fr` (62/38): the combat panel is
    about 30px narrower at desktop and rail and the right column wider; at desktop the five dice
    presets now fit one row. Flow has twelve equal columns; 7/5 is the nearest split (CAN-7.6
    accepted 58/42 for the hub's 60/40).
  - Everything below the status row sits 2px higher: the status widget's last margin (18px) is now
    the console's 16px grid gap.
  - The phone is identical apart from that 2px. No clipped content, no lost control, focus or
    heading, in any theme; high contrast keeps its borders.
- Re-baselined exactly those 24 in the container (`--update-snapshots=changed`, golden-routes +
  extensions-polish: 258 passed), then re-deflated the 24 PNGs losslessly (zlib 9 over the same
  filtered scanlines, decompressed IDAT asserted identical): 124,477 bytes saved. Budget after:
  34,680.1 of 34,816.0 KiB. Re-run on the re-deflated files: 258 passed.

### CAN-7.5 Session parity rows

Every row in SCREENS_PARITY §3, with the widget that now carries it and the evidence. "Baseline"
means the committed `Session.baseline.test.tsx` snapshots pass unchanged (aria, DOM, headings,
focus order) in the states listed in Step 1.

| Rows            | Widget                | Evidence                                                                                                                                        |
| --------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| SE-01 eyebrow   | session (console)     | baseline (Standby, Live, preview, player); `session-lifecycle.spec` (named session line)                                                        |
| SE-02 phase     | session               | baseline (radiogroup, disabled options per state incl. preview); `session-lifecycle.spec` (rail routes through the start / end flows)           |
| SE-03 standby   | session               | baseline (Standby, Prep, Recap sentence); `session-standby.spec`; `standby-controls.test`                                                       |
| SE-04, SE-05    | session               | baseline (Live only, not in preview); after-test opens the rest and end dialogs; `character-rest.spec`, `session-lifecycle.spec`                |
| SE-06           | session               | baseline (Live: "Players see …")                                                                                                                |
| SE-07, SE-08    | combat (tracker)      | baseline (Build encounter / Add + End combat; "No combat running"); after-test opens the builder and end confirm                                |
| SE-09–SE-11     | combat                | baseline (live fight desktop + phone, preview: status region, readout, list, hidden combatant); `combat.spec` (turns, n/p keys, Alt+arrows)     |
| SE-12, SE-13    | combat                | `combat.spec` (HP keypad sheet, d/h keys, digits, Escape; condition picker)                                                                     |
| SE-14           | combat                | `encounter-builder.spec`, `session-standby.spec` (build, start, reinforce); after-test                                                          |
| SE-15           | dice (tray)           | baseline; `dice-tray.spec`; `session-standby.spec` (Standby roll)                                                                               |
| SE-16           | session-tables        | baseline (empty state); `session-tables.spec` (draw, record, pin/unpin by keyboard)                                                             |
| SE-17           | session-handouts      | baseline (DM, preview sentence); `session-standby.spec` (push outside a session)                                                                |
| SE-18           | session-now-playing   | baseline (nothing playing); `combat-audio-automation.spec`                                                                                      |
| SE-19           | session-stage         | baseline (active map, Project, per-player pickers, now without GM workspaces); full suite (`atlas`, `map-tile`, `player-view` projection specs) |
| SE-20           | session-campaign-date | baseline (DM only, absent in preview); body snapshot (no calendar)                                                                              |
| SE-21           | session-prep-recap    | baseline (Standby, Recap with archive); full suite                                                                                              |
| SE-22, SE-39–41 | session-capture       | baseline; `session-capture.spec`                                                                                                                |
| SE-23           | session-roster        | baseline (not hosting); `session-posture.spec`                                                                                                  |
| SE-24           | session-party         | baseline (three PCs; empty in preview)                                                                                                          |
| SE-25           | session-rests         | baseline (absent before a rest, present in Recap after one); after-test (joins the layout after a rest)                                         |
| SE-26           | session-schedule      | baseline (unconfigured install, DM only)                                                                                                        |
| SE-30–SE-32     | session (dialogs)     | after-test (start, rest, end open from the widget); `session-lifecycle.spec` (both endings, named start, nothing-to-continue)                   |
| SE-33           | combat (dialog)       | after-test; `combat.spec` (End combat confirm)                                                                                                  |
| SE-34–SE-37     | combat                | baseline (live fight); `combat.spec` (initiative call, adjust, detail actions, reorder bounds)                                                  |
| SE-38           | shell Toaster         | unchanged (not part of the screen); `session-lifecycle.spec`                                                                                    |
| SE-42–SE-44     | combat                | `combat.spec` (condition clear, death saves, concentration keep/drop)                                                                           |
| §3.5 headings   | all                   | baseline heading outlines unchanged in every state (`h2` per panel, `h3` empty states, Rests between Party and Schedule in Recap)               |
| §3.5 tiers      | screen                | baseline rail and phone; after-test `/session` vs `/screen/:id` cells at three tiers (rail keeps two columns, phone one)                        |

Not carried as a public-surface widget yet, by design: every Session row stays builtin until the
gaps G-05–G-11 have a public surface (ledgered under RC-WID-5.13 above).

### Follow-ups for the operator

- **File RC-WID-5.13** (public surface for the Session widgets; SCREENS_PARITY G-05–G-11) on the
  roadmap; the parity ledger names it.
- `/screen/:id` draws the Session screen with flow's bare-part gap (28px) where `/session` keeps
  the console's 16px (cells and tree are equal; tested). Making FlowBoard honour a screen's gap is
  outside this claim.
- The eleven panels are not offered in the add gallery (like the home parts). Listing them would
  let a GM put "Handouts" on any screen; it changes gallery counts that other specs read.
- `scene-first-render` / `app-startup` perf budgets were not re-measured here; `/session` now
  provisions once and renders through the flow pieces.

### Final local checks at `d7b4fbe8`

- `pnpm test:app` 177 files / 2185 tests, exit 0. `pnpm test:critical` (core) 291 files /
  5296 tests, exit 0.
- `tsc --noEmit` app and core 0; `pnpm lint` 0 (warnings only, none in changed files); `pnpm gates`
  0 (file-size warnings only); `pnpm format:check:changed -- --base loop/rc` clean (35 files).
- The central gates, independent review and any promotion are the operator's. No push, promotion,
  loop launch, extra agent or dispatcher control-state change.

## Session 2 — claim-fence rework — 2026-10-08

Gate feedback: the candidate changed fifteen paths outside the claim. Rebased onto `8ba82424` by the
operator; tree clean on entry. No Headroom tools exposed; original output read directly.

### What changed

- **The eleven `Session*Body.tsx` files are gone**, and so are the eleven `session-*` types, their
  definitions and the `system.session-widgets` package. Every Session row is now a VIEW of an existing
  builtin widget: the status row and each right-hand panel are `session` views (its "Shows" select:
  `console`, `tables`, `handouts`, `now-playing`, `stage`, `campaign-date`, `prep-recap`, `capture`,
  `roster`, `party`, `rests`, `schedule`; default `strip`), the tracker is `combat`'s `tracker`, the
  tray `dice`'s `tray`. The views live in the owned `SessionBody.tsx` (607 lines, under the 800-line
  `.tsx` gate). Each instance carries its row's `title`, so every widget region keeps its own name.
  `SESSION_PANEL_VIEWS` / `SESSION_SCREEN_PARTS` (owned `widget-package-state.ts`) describe them.
- `builtin/index.tsx` is back to base apart from two props (below). `builtin-bodies.test.tsx` and its
  snapshot are back to base. The fifteen `/extensions` goldens are back to base (no new package row).
- `parity.ts`: no per-type entries now. `session` declares the sources its views read and the
  `open-route` intent (campaign date → `/campaign/calendar`); its RC-WID-5.13 ledger carries the union
  of every view's private uses (42 + own seat), because the gate charges a body module with all of
  them. Combat 16 + own seat; dice own seat; default-screen findings for `session` and `combat`.

### Paths still outside Owns, and why each is required

1. `apps/gm-react/src/app/widgets/builtin/index.tsx` — two props. `WidgetBody` rendered
   `<SessionBody />` with no widget, so the body cannot read which row (`view`) it is; without the prop
   every Session row would have to be a new type, which needs this file anyway. `interactive` keeps
   the tracker's bare-key model (`n`/`p`/`d`/`h`) off `window` while the GM edits the screen layout.
2. `apps/gm-react/src/app/widgets/parity.ts` — "widgets that stay builtin pass the WID-5.5 gate": the
   gate fails on any unledgered finding and on an unclassified shared import, and its ledger and
   classifications live only here.
3. `packages/core/src/commands/command-center.ts` (+ the companion `schemas/commands.ts`, core
   `index.ts`) — "/session opens this screen": a persisted default screen needs `origin.kind:
'default'`, which no public command writes; without it the Session screen would be a table scene in
   the hub, the sidebar, the start picker and the projection pickers.
4. `packages/core/src/queries/player-view-control.ts` — without it the Session screen becomes a
   projection target in the Stage panel's per-player pickers (SE-19): the after-state would offer
   players the GM's console. The same filter removes the Command Center home screen (CAN-7.6).

### Evidence at this commit

- App vitest 178 files / 2194 tests; core 291 / 5296; app and core `tsc` 0; `pnpm lint` 0;
  `pnpm gates` 0. Session baselines: the 40 committed snapshots pass unchanged (41 tests).
  Parity test 36/36.
- Playwright, both profiles: combat, every session spec, dice-tray, encounter-builder,
  character-rest, combat-quick-reference, player-preview, combat-audio-automation, canvas, screens
  and the quick-panel route spec: 267 passed, 9 skipped, 0 failed. No spec edited.
- Visual (pinned container, golden-routes + extensions-polish): 258 passed; the nine `/session`
  goldens from Session 1 still match; `/extensions` on its base goldens.

## Session 3 — claim widened, rebase onto loop/rc — 2026-10-09

The operator widened the claim to `builtin/index.tsx`, `parity.ts`, `command-center.ts` and
`player-view-control.ts` (self-heal round 1); those changes are kept as they were. `loop/rc` had
moved to `1028592b` (RC-WID-5.6 and RC-CAN-8.2 landed), so the branch was rebased onto it. One
conflict, in `parity.ts`: RC-WID-5.6 repaid and removed its five home round-trip ledger entries and
the `wid56` helper; resolved by keeping the RC-WID-5.13 Session block and dropping those entries
(`style(widgets)` commit re-ran Prettier on the merged file). No other file conflicted.

Evidence on the rebased branch (original output read directly; no Headroom tools exposed):

- Parity test + Session tests 82/82. App and core `tsc` 0. `pnpm lint` 0, `pnpm gates` 0.
- Core: 292 files / 5301 tests. App: 2224 passed, 1 failed — `screens/play/Sheet.test.tsx`
  timed out at 5 s under the full run; alone it passed 3 of 3 runs, and the branch changes nothing
  under `screens/play`.
- Playwright, both profiles, the acceptance specs plus `tile-resize.spec.ts` (new on loop/rc): 174
  passed, 1 failed (`tile-resize.spec.ts:21`, mobile: Shift+F10 menu not found). Repeating that
  spec ×4: 23 passed, 1 failed, a different case (`:119`, desktop: the inspector did not open after
  Enter on the board's Prep tile). Both cases drive GM-board tiles whose definitions and bodies this
  branch does not change; recorded as instability in that new spec, not fixed here (outside the
  claim). Every acceptance spec passed.

**Incident.** While cleaning up after a visual run of mine that hit a 10-minute wrapper timeout, I
stopped a running Playwright container (`3579e997…`) without first checking whose it was. It
belonged to another worktree (`dndtools/90a87361679f4bc466c3`), so that task's visual run was cut
short and needs a re-run by the operator. My own container had already exited. Nothing else was
touched.

- Visual, pinned container, golden-routes + extensions-polish on the rebased branch: 258 passed
  (10.3 min). The nine `/session` goldens committed in Session 1 still match.
- No push, promotion, loop launch, extra agent or dispatcher control-state change.

## Session 4 — independent review repair — 2026-10-09

Resumed candidate `7afd563b` with a clean tree. Review reported two durable turn advances from one
`n` key when a second combat tracker is placed. No Headroom tools are exposed; direct command
output and original logs under `/tmp/rc-can78-duplicate-*.log` are the evidence for this repair.

The repeatable widget mounts the existing `useCombatKeyboard` hook once per tracker. Each hook
listens on `window` and ignores whether an earlier listener already handled the event. The repair
honors `defaultPrevented` and keeps each listener's registration stable across rerenders while a
layout-updated ref supplies its current callbacks and state. The first eligible mounted tracker
handles global shortcuts; later trackers skip consumed events. Unmounting that tracker naturally
hands the shortcuts to the next listener. Preview and edit mode, inputs, and dialogs retain their
existing guards.

Necessary scope extension: `screens/session/useCombatKeyboard.ts`, the shared keyboard handler
identified by the review, plus regression coverage in `Session.baseline.test.tsx` and a new browser
spec. Keeping the correction at the hook protects every caller rather than suppressing duplicate
writes individually in CombatBody callbacks (which would leave duplicate HP sheets and cursors).
Existing combat/session/dice browser specs and before/after snapshots remain unchanged.

Validation in progress; final results follow below. No additional agents, push, promotion, loop
launch or dispatcher control-state edits.

Repair evidence (original output read directly):

- The new duplicate-tracker test against the original hook failed with `expected 2 to be 1`
  at the turn assertion after one `n` press (`/tmp/rc-can78-duplicate-before.log`).
- With the repair, Session baselines + widget parity: **55 passed**, including all 40 unchanged
  before-conversion snapshots (`/tmp/rc-can78-duplicate-after.log`). The new test also checks one
  durable previous-turn entry, one reordered combatant, stable arrow selection, one HP dialog and
  no turn write while that dialog is open.
- New browser regression: **4 passed**, desktop and mobile (`/tmp/rc-can78-duplicate-browser.log`).
  Exercises actual scene duplication, exact turn and durable-log counts, handoff when the first
  widget is destroyed, reload from storage, stable selection, and single Damage/Heal dialogs.
- App typecheck, `pnpm lint`, `pnpm gates`, focused Prettier check and `git diff --check` passed.
  Original logs: `/tmp/rc-can78-repair-typecheck.log`, `/tmp/rc-can78-repair-lint.log`,
  `/tmp/rc-can78-repair-gates.log`. Lint/gates retain existing warnings.
- This follow-up changes keyboard handling only; no layout, styles, accessible markup or golden
  images changed. The previous before/after visual review remains recorded above; no new pinned
  visual run is claimed for this repair. Central wrapper gates and independent review remain pending.
- Acceptance browser run: **147 passed, 9 skipped, 0 failed**, desktop + mobile, 3.8 minutes;
  original `/tmp/rc-can78-repair-acceptance.log`, runner exit 0. Command:
  `pnpm --filter @dndtools/gm-react exec playwright test 'tests/e2e/(combat|session-.*|dice-tray)\.spec\.ts' --workers=2`.
  This includes the new duplicate-tracker cases and quick-panel rolls across all ten primary routes.
  The pre-existing combat, session and dice specs were not edited, including their selectors.

Repair complete locally; ready for the central operator's wrapper gates and independent review.

## Session 5 — claim gate disposition — 2026-10-09

The claim gate rejected `apps/gm-react/src/screens/session/useCombatKeyboard.ts`, which is outside
this task's current claim. Retain this required path under the explicit exception in the retry
instructions, and request the operator's decision to widen the claim. The claim has NOT been
widened, and this task remains blocked at that gate.

Compared the hook with base `1028592b7672aa044c045551176e81e41c8392ca` and inspected its caller.
Reverting it would restore the independent review's high-severity defect: two reading-mode combat
widgets advance the durable turn twice for one `n` press. The original regression output was read
again directly: the base hook produces turn 2 where turn 1 is required. Original repaired outputs
still record 55 unit/parity passes and 147 browser passes / 9 skips.

The shared hook owns window listener registration and event consumption. `CombatBody` cannot
independently disable that keyboard model: `CombatPanel` exposes only `previewing`, which also
disables normal widget controls. Guarding command callbacks there would leave duplicate HP dialogs,
whose state is internal to CombatPanel. The retained hook change fixes consumption for all shortcut
actions and preserves listener order across rerenders, covering the newly repeatable tracker while
keeping each widget interactive. This is necessary for Session widget parity and the explicit review
requirement, not an unrelated change.

This follow-up changes the journal and records the required-path rationale in the commit message;
implementation and tests are unchanged from `973e9d30`. No test rerun is claimed. `git diff --check`
passes. No push, promotion, additional agent, loop launch or dispatcher control-state edit.

## Session 6 — widened keyboard-hook claim accepted — 2026-10-10

The scheduling instruction now explicitly includes
`apps/gm-react/src/screens/session/useCombatKeyboard.ts` in Owns (self-heal round 2) and directs
that its changes be kept. This supersedes Session 5's pending scope decision. Retained the
keyboard repair and its regression tests unchanged; no further implementation change is needed
for the supplied feedback.

Verified a clean tree at `25eaf5bb`, the retained hook diff against base `1028592b`, and no intervening
implementation changes since the tested repair `973e9d30`. The Session 4 evidence therefore still
applies: 55 unit/parity passes; 147 acceptance browser passes / 9 skips; typecheck, lint and quality
gates passed locally. No tests were rerun for this journal-only update. `git diff --check` passed.
No Headroom tools are exposed; branch and diff output was read directly.

The reported ownership blocker is addressed by the supplied claim extension; this is not a claim
that a new central gate has run. The candidate is ready for the central operator's wrapper gates
and independent review. No push, promotion, extra agent, loop launch or dispatcher control-state
change.

## Session 7 — visual gate red at `f6eec7ca` triaged as load stall — 2026-10-10

Gate feedback: "Visual regression (pinned container)" exit 1, 2 failed / 529 passed (run
`4544165f`). Read the original log and both error contexts:

- `[visual-desktop] player-polish.spec.ts:7 player sheet high-contrast` — `#main-content` still
  showed the `Loading your vault…` Suspense fallback when the 5 s `toBeVisible` expired. The other
  four themes on desktop and all five on rail/phone passed.
- `[visual-rail] golden-routes.spec.ts:162 tavern /play` — `toHaveScreenshot` capture timed out
  (5 s). The failure screenshot shows the correct, fully rendered "Join your table" page. parchment
  and high-contrast /play passed on rail; tavern passed on desktop and phone.

Neither route is in this branch's diff (`git diff --stat 3ef5354b HEAD`: Session screen, Session
widget bodies, parity, core command-center/player-view-control/widget-package-state). No pixel
diff on any route.

Re-ran both specs in the pinned container (`run-in-container.sh --update-snapshots=none
--workers=2 tests/visual/player-polish.spec.ts tests/visual/golden-routes.spec.ts
--repeat-each=2`) with load average ~17 and a second worktree's visual container running
concurrently: 452 passed / 4 failed (21.5 m). Both previously failing tests passed on both
repeats. The 4 new failures are different tests, all 5 s screenshot-capture timeouts on untouched
routes (desktop `/audio loading` dungeon, desktop `player-history-empty` parchment, rail
`/characters` tavern, rail `/audio Playback` scholar). This is the documented base-level cold
chunk/capture stall that lands on a different spec each run; the Session goldens re-baselined by
this task passed on every profile. No baseline was changed and no code change is warranted.

No push, promotion, extra agent, loop launch or dispatcher control-state change. No Headroom tools
were used; logs were read directly.

## Session 8 — post-rebase visual gate red at `13e6a119` — 2026-10-10

Gate run `5f4991b0`: 1 failed / 545 passed. The only failure was `[visual-rail]
settings-polish.spec.ts:29 settings vault empty state — parchment`. Its error context shows
`#main-content` still on the `Loading your vault…` status when the 5 s `toBeVisible` expired, the
same Suspense-fallback stall as Session 7. /settings is not in this branch's diff. The other 14
theme/profile combinations of the spec passed in the same run.

Cross-task check of the dispatcher's recent visual attempts in the same window. Other branches
fail on the same untouched specs with no diff of their own there:

- `2680175…` `435d1431`: player sheet parchment, characters empty, `/`, palette-help (4).
- `2680175…` `cb70bc68`: /audio loading, player sheet tavern, atlas empty (3).
- `90a8736…` `2c12a7b5`: Story polish, graph polish, **settings vault empty state — scholar**,
  char builder (4).
  Earlier on 2026-10-08/09, `90a8736…` and `7465ea0…` show the same 1–3 single-theme timeouts on
  plans-legal, palette-help, graph-polish, /audio and /scene/:id. This is host-load noise across the
  fleet, not something this branch introduces.

Re-ran `settings-polish.spec.ts` in the pinned container (`--update-snapshots=none --workers=2
--repeat-each=2`, load average ~7): 30 passed / 0 failed. No baselines or code changed.

No push, promotion, extra agent, loop launch or dispatcher control-state change. No Headroom tools
were used; logs were read directly.

## Session 9 — Format (changed) red at `86cfd159` — 2026-10-10

Gate run `a8fb2dfb`: `format:check:changed --base loop/rc` flagged only `state/RC-CAN-7.8.journal.md`.
My Session 8 bullet list was not Prettier-wrapped. Ran `prettier --write` on the journal.
`pnpm format:check:changed -- --base loop/rc` now reports all 25 changed files clean. Journal-only
change; no code, test or baseline touched.

## Session 10 — duplicate encounter-launch review repair — 2026-10-10

Started from the clean reviewed candidate `71e6783c`. The supplied independent review found that
all interactive combat trackers consume the same `createEncounter` location state before the
router clears it, opening two dialogs whose modal effects make each other inert. Inspected the
tracker effect, palette launcher, existing duplicate-keyboard regression, and Playwright config.
No Headroom tools are exposed; original command output is read directly and logs retained under
`/tmp/rc-can78-intent-*.log`. No additional agents.

Added browser regression coverage to the existing `session-duplicate-trackers.spec.ts` for idle
and running combat, repeated palette launches, arrival from another route, and removal of the
first tracker. Each launch must produce exactly one dialog including hidden dialogs, permit title
editing and Cancel, then leave no dialog. Validation and repair results follow below.

`CombatBody.tsx` now claims each router location synchronously in a module-local WeakSet before
setting builder state. All sibling trackers share that location object, so exactly one consumes it
while navigation clears the state. Fresh navigation creates a fresh object, allowing another launch
on the same route; the WeakSet does not retain discarded locations or pin ownership to a widget.
The original interactive guard and per-widget encounter buttons remain unchanged.

Local evidence (original outputs read directly):

- Before the fix, the new idle-combat browser regression failed with **2 dialogs instead of 1**
  (`/tmp/rc-can78-intent-before.log`). An initial test-helper call used the wrong argument shape;
  that setup error was corrected before this reproduction.
- After the fix, `session-duplicate-trackers.spec.ts`: **8 passed**, desktop + mobile, including
  the existing keyboard/HP-dialog tests (`/tmp/rc-can78-intent-focused.log`).
- Session baseline + widget parity unit tests: **55 passed**, with unchanged snapshots
  (`/tmp/rc-can78-intent-unit.log`).
- App `tsc --noEmit` passed (`/tmp/rc-can78-intent-typecheck.log`). Focused ESLint produced no
  diagnostics. Quality gates passed with existing file-size warnings
  (`/tmp/rc-can78-intent-lint.log`, `/tmp/rc-can78-intent-gates.log`).
- Broader acceptance browser run: **199 passed, 9 skipped, 0 failed**, desktop + mobile,
  4.5 minutes (`/tmp/rc-can78-intent-acceptance.log`, exit 0). Command:
  `pnpm --filter @dndtools/gm-react exec playwright test 'tests/e2e/(combat|session-.*|dice-tray|command-palette|encounter-builder)\.spec\.ts' --workers=2`.
  This includes quick-panel routes, the duplicate-launch regression and existing keyboard repair.
- Focused ESLint and Prettier checks exited 0; `git diff --check` passed.

Only the owned `CombatBody.tsx`, the existing duplicate-tracker regression spec and this journal
changed. Existing acceptance specs and all visual/baseline snapshots remain unchanged. This repair
changes intent consumption, not rendering; the earlier before/after review is retained. Full wrapper
and pinned visual gates remain for the central operator; no new full-gate success is claimed here.
No push, promotion, extra agent, loop launch or dispatcher control-state edit.
