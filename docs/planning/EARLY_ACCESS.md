# Early-access exit audit (RC-ENG-8.3, the M2.5 gate)

Fifth run, 2026-10-16, on **`d1b4e6e4d`**: the dispatcher's `loop/rc` (`511fc6af4`) with this story's
branch on top. The branch fixes every high finding the earlier runs filed (RC-ENG-8.15 to 8.20) and
the one the fourth run found, in four commits: `f1b81db8a` and `d24d51bb3` (the second run's three,
with 30 re-baselined visual goldens), `0033dd551` (the third run's three) and `d1b4e6e4d` (the fourth
run's high and two regressions of `0033dd551`). Everything in §1 to §9 was measured on `d1b4e6e4d`.
The fourth run, on `0033dd551`, is kept in [§10](#10-the-fourth-run-on-0033dd551), the third, on
`d24d51bb3`, in [§11](#11-the-third-run-on-d24d51bb3), the second, on `b2ddfc1d`, in
[§12](#12-the-second-run-on-b2ddfc1d) and the first, on `ef42291b`, in
[§13](#13-the-first-run-on-ef42291b).

The gate, from the story and [§3.2 M2.5](RC_ROADMAP.md#32-milestones):

1. the golden paths green on five consecutive runs on both Playwright profiles;
2. a `ux-ui-reviewer` pass over every primary route at the three viewport tiers with zero high
   findings;
3. `pnpm a11y:gate` clean;
4. no open primary-path entry in [`DEBT.md`](../../DEBT.md);
5. no primary row of [`FEATURE-GAPS.md`](../requirements/FEATURE-GAPS.md) carrying a limit beyond
   the [§2.1](RC_ROADMAP.md#21-feature-completeness) four (payment processor, signed desktop
   certificates, curation service, Cloud-Enhanced phase 2).

Primary surfaces are the ones [§0.3 rule 12](RC_ROADMAP.md#03-non-negotiable-guardrails-apply-to-every-story)
names: screens, Session, Characters, Maps, Notes, onboarding and the shell. The player companion
(`/play`) is included because the golden paths and RC-POL-1.8 put it on the primary path. The three
tiers are the `Viewport` tiers in [NAVIGATION.md](../architecture/NAVIGATION.md): desktop (>1024px),
rail (641–1024px) and phone (≤640px).

Everything below ran locally on one Linux machine against the Vite dev server, not on hosted CI.
Severity follows FRICTIONLESS.md: **critical** blocks or silently breaks a primary path; **high**
means a new GM or player will fail or misread; **medium** is friction or inconsistency; **low** is
polish.

## 1. Verdict

**M2.5 passes on `d1b4e6e4d`.** All five gates hold:

1. the golden paths: 78 of 78 in each of five consecutive runs, 39 per profile, no retry;
2. the review: four passes over every primary route at the three tiers, zero critical and zero high
   findings, each earlier high re-tested with its original reproduction;
3. `pnpm a11y:gate`: PASS, no critical or serious violation in 60 route-and-profile scans;
4. DEBT.md: no open primary-path entry (unchanged since the second run);
5. FEATURE-GAPS.md: no primary row with a limit beyond the §2.1 four (46 declared limits, 0 stale).

The verdict holds for the application tree of `d1b4e6e4d` and for nothing else. Three conditions go
with it:

- **The fixes are on this story's branch, not yet on `loop/rc`.** Five of the files they change are
  outside RC-ENG-8.3's claim: `screens/play/Frame.tsx`, `screens/session/Lifecycle.tsx` and
  `app/map/canvas/MapMarkers.tsx` (each the Owns of the story for its finding, RC-ENG-8.18 to 8.20)
  and `ds/components/core/Popover.tsx` and `ds/components/map/POIPopover.tsx` (D4-1). Both commits
  name them for the operator ([§7](#7-stories)). If any of them is reverted, the verdict no longer
  holds and the gates run again.
- **RC-ENG-8.15 to 8.20 are still `proposed` in the dispatcher's store.** Their work is done on this
  branch and confirmed by the review; reconciling the store is the operator's call.
- **The review's medium findings are friction, not passes.** There are 7 new mediums and 2 new lows
  in this run, and the earlier runs' open mediums (§4, §10). They do not block M2.5 and are recorded
  for the operator to file. Two are regressions of this branch's fixes (B5-1, D5-3).

Two readings are judgements, as in the earlier runs: DEBT-2026-004 (c) is not counted as
primary-path (§5), and C5-2, level-up hit points that leave out the Constitution modifier, is held
at medium (§4).

## 2. Golden paths

`golden-path.spec.ts` on `desktop-chromium` and `mobile-chromium` together, retries 0, five
consecutive runs, 2026-10-16 23:15:45–23:20:33Z: **78 passed, 0 failed, 0 flaky, 0 skipped in each
run** (39 per profile). The 78 are the five journeys (first run, prep, Standby to live, knowledge
capture, a player joining over the fake LAN) and the detector and seeded-defect fixtures that prove
each journey assertion fails on a planted defect. The highest retry index in all five JSON reports
is 0. The machine's load average was 1.2–2.5 at the run starts.

## 3. Accessibility gate

`pnpm a11y:gate` on `d1b4e6e4d` (23:20:33–23:21:56Z, straight after run 5), exit 0:

- non-text contrast: 319 pair checks across five themes and 16 forced-colors remap checks passed;
- axe on both profiles: 61 passed, 1 skipped (the phone-only `/board` Layout test on
  `desktop-chromium`, skipped by design);
- report over 60 route-and-profile scans, all 60 worker artifacts present: 0 critical, 0 serious,
  1 moderate, 0 minor; 0 blocking; 0 approved known violations; "Gate result: PASS".

The moderate one is axe `region` on `/session#combat` on `mobile-chromium`, as in every earlier run
(FRICTIONLESS.md L12). The gate scans its own seeded routes. Pass D also ran axe (wcag2a/aa, 21a/aa,
22aa) on the seeded Ruined Keep's detail and editor, which the gate does not reach: no violation,
including `target-size`, on any tier.

## 4. The review

Four passes of the project's `ux-ui-reviewer` agent (`.claude/agents/ux-ui-reviewer.md`), one per
group of routes, each in its own detached worktree at `d1b4e6e4d` with its own dev server, run in
parallel (about 22:56–23:36Z, before the gates). Each drove the app with the repo's Playwright
through scratch probe specs built on `tests/e2e/_helpers.ts`, re-running and extending the fourth
run's probes, at 1440×900 (desktop, mouse), 834×1112 (rail, touch) and 390×844 (phone, touch),
default theme, English. The shared brief gave them the severity scale above, the fourth run's
reports and the third run's audit to re-check, FRICTIONLESS.md's open items and the four code paths
`d1b4e6e4d` changed; it required every route in each group to be loaded at every tier, the fourth
run's high and regressions to be re-tested with their original reproduction two runs per tier, and
every critical or high finding to reproduce in two separate runs. I re-read the source behind each
high finding before accepting it, in this run and the fourth. Screenshots, ARIA snapshots,
per-state metrics, the probes and each pass's report stay in the audit's scratch directory and are
not committed.

| Group | Routes                                                                                                                                     | Critical | High | Medium | Low |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---- | ------ | --- |
| A     | Onboarding, Command Center (fresh, seeded, demo, live), the shell, palette and Help with the shortcut list, `/screens`, Preview as         | 0        | 0    | 1      | 1   |
| B     | `/screen/:id` (home and four templates, view and edit, idle and live), `/scene/:id` and the template editor on all three tiers, `/session` | 0        | 0    | 1      | 0   |
| C     | Characters, the builder and level-up, character History, Notes, `/play` joined over the fake LAN                                           | 0        | 0    | 2      | 1   |
| D     | Atlas and its Layers panel, the map editor (tokens, POIs, fog, Generate, Assets), image and external-scene import, `.dd2vtt` export        | 0        | 0    | 3      | 0   |

The counts are this run's new ids. Every route was loaded at all three tiers, with the gaps listed in
[§8](#8-not-checked). No page overflowed horizontally at any tier. The only console message any probe
saw is D2-7's React ref warning when the map editor's Generate panel opens; there was no page error.

### The earlier highs and regressions, re-tested

| Id          | Status | Evidence                                                                                                                                                                                                                                                                                                  |
| ----------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D4-1        | fixed  | Desktop keyboard, 2 runs each from a mouse click, Enter on a pin and a new POI from the POI tool, in the editor and on `/atlas`. Focus lands on the popover panel; arrows nudge the point in the editor and change nothing on Atlas; visibility stays `dm-only`; Tab still reaches every popover control. |
| A4-1 / B4-1 | fixed  | 2 pointer and 2 keyboard runs × 3 tiers in each of passes A and B. After Share, focus is on the enabled, checked box inside the dialog and the `role="status"` line reads "… is shared with players.".                                                                                                    |
| D4-2        | fixed  | 2 runs × 3 tiers. Both seeded pins hit-test as themselves on Atlas's detail and in the editor, and a tap opens the popover.                                                                                                                                                                               |
| A3-1        | fixed  | 2 runs × 3 tiers × 2 vaults, Any player and Observer (36 previews with the control). The stage names the scene the session header names; nothing DM-only or another player's appears.                                                                                                                     |
| B3-1, B3-5  | fixed  | 2 runs × 3 tiers. The reason is visible (12px, 7.06:1), catalogued and tied by `aria-describedby`; Share enables the box; the session goes live with the screen shown to a LAN player. No visibility field on the GM's workspace screens.                                                                 |
| D3-2, D3-3  | fixed  | 2 runs × 3 tiers. Each seeded token's centre hit-tests as the token; a drag moves only the token and survives a reload; axe reports no `target-size`.                                                                                                                                                     |
| C2-1, C-1   | fixed  | Level-up tapped at rest on every tier, 6 of 6; 26 builder builds with no mismatch between the Review card, the sheet and the store.                                                                                                                                                                       |
| B2-1, B-1   | fixed  | 2 runs × 3 tiers. Next turn hit-tests as itself at Fit and a centre tap advanced the turn 6 of 6; Start session never goes live on the GM's home screen.                                                                                                                                                  |

### Critical

None.

### High

None.

### Medium

None of these blocks M2.5. They are recorded for the operator to file or fold into stories.

- **A5-1** Starting or ending a session from `/session` drops focus to `<body>`: the dialog's opener
  (Start session, End session) unmounts as the workflow changes, after the dialog has already handed
  focus back to it (`app/widgets/builtin/SessionBody.tsx:222,231-232`, `platform/returnFocus.ts:31`).
  The next Tab lands on the replacing control. 2 runs × 3 tiers.
- **B5-1** Regression of `d1b4e6e4d`: in the Start dialog, arrowing the Scene select away from a
  just-shared screen and back moves focus to the "Show … to the table" box, because the focus effect
  keys on the selected scene (`screens/session/Lifecycle.tsx:336-339`). 2 runs × 3 tiers.
- **C5-1** The builder's Attacks & kit step starts every character at AC 13, HP 10, speed 30 and a
  "Longsword +4 · 1d8+2", whatever the class, ancestry and scores, and the Review card shows them
  beside the derived values with nothing marking them as defaults
  (`app/charBuilder/index.tsx:160-165`). Editable on a labelled step.
- **C5-2** Level-up hit points leave out the Constitution modifier: "Take the average (5)" saves 5 and
  the roll is a bare `1d8` (`app/character/LevelUp.tsx:182-184,255-259,326-333`); the core adds the
  value as given. Brother Calloway (CON 14) goes from 31 to 36, not 38. Held at medium because the
  value is shown and editable on the step and the package model is not 5e-only; the case for high is
  that the guided path stores a wrong maximum at every level for most characters. I re-read the
  source; it agrees.
- **D5-1** In the map editor with nothing selected, an arrow jumps to the nearest point of interest
  and selects it, and the next arrow moves that point instead of browsing on
  (`app/map/keyboard.ts:175-202`). Undo restores it. Before `d1b4e6e4d` the same press changed its
  visibility (D4-1).
- **D5-2** The POI popover is cut by the canvas edge: on the phone a point at about 45% height opens
  it under the tool options bar, and on the rail Broken Altar's is cut by the tool rail. Placement
  is chosen from the point's fraction, not the free pixels (`app/map/canvas/MapMarkers.tsx:204`).
  Predates `d1b4e6e4d`.
- **D5-3** Regression of `d1b4e6e4d`: on touch, a token takes a press only on its 30×30 disc; in the
  fourth run the 62×46 wrapper with its label did. Above WCAG 2.5.8's 24px and a centre tap works,
  so it widens FRICTIONLESS M2 rather than reopening D3-2. A transparent 44px hit area on the disc
  keeps D4-2 fixed (`MapMarkers.tsx:74-101`).

Still present from the fourth run, at medium (described in [§10](#10-the-fourth-run-on-0033dd551)):
A3-2 (the top bar's Start still goes live on a GM-only screen without the dialog), B4-2, B4-3, B4-4,
C4-1, C4-2 and C4-3. Still present from the third run: B3-2 and the other tile controls resting
outside their body at Fit, B3-3, A3-5/B3-4, C3-1, C3-2 and D3-1.

`tile-overflow-controls.spec.ts` lists every control resting outside its tile body on the seeded live
home and compares the list to an exact set per width (3 at 1440, 8 at 834, 6 at 390). It passes
because the set is recorded, not because the controls are reachable where they rest; a new clipped
control, or a fixed one, fails it until the set changes.

### Low

A5-2 the phone's screen toolbar has no side gutter · C5-3 the companion's Journal labels automatic
rest, combat and level-up entries "Note". From the fourth run, still present: A4-2, B4-5, B4-6, C4-4
to C4-7, D4-3 to D4-5.

### The earlier findings, re-checked

Each pass reported every earlier id in its routes. Still present at their recorded severity: A2-1 to
A2-8; B2-3, B2-4 (partly fixed), B2-5, B2-7, B2-8; C2-2 to C2-4; D2-1 to D2-4, D2-7, D2-8, D2-11;
from the first run A-2 to A-6, A-8 to A-10, A-13, A-14, B-3, B-5 to B-8, C-2 (fixed on the rail),
C-3 (phone only), C-13 to C-15, C-17, C-19, C-20, C-22, C-24, D-2 to D-9, D-11, D-12, C-7, C-9 to
C-12, C-18, C-25, C-26. C-16 is partly fixed (the attack inputs are named, with no visible labels).
Not re-checked this run: A-7, A-11, A-12, A3-3, A3-4, A4-2, B-4, B-9 to B-14, BP-1 to BP-11 (the
template editor ran clean end to end on every tier), B3-6, B3-7, D2-5, D2-6, D2-9, D2-10, C-8. BP-9
did not reproduce.

FRICTIONLESS.md: L4 stays fixed. M2 is wider (B4-3, D5-3, C4-3, C4-7). M1, M3, M5, M6, M7, L2, L3,
L6, L10, L11 and L12 still hold as recorded; L1 and L5 were not re-checked.

## 5. DEBT.md

An entry counts as primary-path when its stated impact is visible to a GM or player on a primary
surface in a configuration the product ships (the default or a selectable theme, locale or system).
`DEBT.md` is unchanged since the second run (`git log 511fc6af4..d1b4e6e4d -- DEBT.md` is empty), and
so is the code its open entries cite.

| Entry         | Severity | Status on `d1b4e6e4d`                                                                                                                                                                                                                                                                                                                                                                                   | Counts |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| DEBT-2026-004 | low      | Open, re-scoped by RC-ENG-8.11 to part (c): the generator category and preset pickers (`app/map/generate/GeneratePanel.tsx`) and the asset category pickers (`app/map/dock/AssetsPanel.tsx`) are hand-rolled `aria-pressed` buttons rather than the DS `SegmentedControl`. Part (b) is resolved: Atlas composes `LayerRow` inside `LayerPanel`, and the entry records why the composed import conforms. | no     |
| DEBT-2026-009 | medium   | Open. Every content command copies every item. Not counted: the cost is internal, and RC-ENG-3.2's final capture breached none of the eleven budgets. This is a judgement; RC-ENG-7.3 should re-read it.                                                                                                                                                                                                | no     |

DEBT-2026-004 (c) is a judgement, as in the earlier runs. Pass D re-checked it in the fourth and
fifth runs: the pickers look consistent with the editor chrome, and the friction they cause is their
size on touch (69×24), which is FRICTIONLESS M2 (medium), not this entry. If the operator reads (c)
as primary-path, gate 4 fails on it.

## 6. FEATURE-GAPS.md

The primary rows are Onboarding, Command Center, Palette and help, Screens, Scene editor, Board,
Session, Characters, Maps (Atlas), Notes (Knowledge) and Player app. A §2.1 limit is read as §2.1
item 2 defines it: a capability a primary surface offers, or the plan promises, that is unavailable
or incomplete.

None is counted. The primary rows and their limits are unchanged since the second run.
`pnpm feature-audit` reports 46 declared limits, 0 stale, 0 inventory issues on `d1b4e6e4d`. The
catalog keys `0033dd551` and `d1b4e6e4d` added moved eight `en.ts` line anchors (in the Session,
Extensions, Community, Plans & cloud, Settings and Public wiki rows) by three and then one line; each
was re-pointed in place, same digit count, so no table row re-padded. The roadmap notes this run
added moved the Shells and platform row's anchor on RC-PLT-1.1's §23 row from line 4307 to 4324,
re-pointed in the documentation commit; that row is not primary.

One review finding sits close to this gate: C4-2, a character can never be removed (no command, no
control). No row declares it, so it is a review medium here, not a declared limit. If the operator
records it on the Characters row as a missing capability, gate 5 fails on it until it is built.

The primary rows' remaining limits, with the reason each is not a §2.1 limit:

| Row              | Limit                                                          | Why it is not a §2.1 limit                                                                             |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Palette and help | Authored guides ship in English                                | Localization residue; §2.3 gates the Spanish catalog at RC-1, not M2.5.                                |
| Scene editor     | Generated widgets need DM review                               | The §0.3 rule 9 guardrail (AI proposes, never disposes).                                               |
| Board            | Tile status notes and inspector tier descriptions stay English | Localization residue, as above.                                                                        |
| Board            | Phone list tiles keep their authored height and scroll inside  | RC-CAN-5.5's recovery design for content that outgrows a tile.                                         |
| Session          | End the live session to return to Standby                      | The §1.6 D2 posture rule.                                                                              |
| Session          | Continuity prompts stay English                                | Localization residue.                                                                                  |
| Characters       | D&D Beyond JSON import diagnostics stay English                | Localization residue.                                                                                  |
| Maps (Atlas)     | The legacy per-map token array stays in state                  | Internal state; nothing on screen.                                                                     |
| Notes            | Live co-editing presence is not modeled                        | Neither offered nor promised; the roadmap's "presence" is the companion's `screens/play/Presence.tsx`. |
| Notes            | History keeps 50 revisions over 30 days                        | Retention bounds (RC-KNW-5.2), not a missing capability.                                               |

The English residues are listed for RC-ENG-7.3, which audits §2.3.

## 7. Stories

No new blocking story. The fourth run's one high, D4-1, was fixed on this branch in `d1b4e6e4d` and
confirmed fixed by this run before a verdict was recorded, so it was not filed.

Every blocking story the earlier runs filed is done on this branch. Their dispatcher entries were
still `proposed` at a read-only check on 2026-10-16; marking them, and whether to keep the
crossings, is the operator's call.

| Story       | Finding    | Fixed in                 | Confirmed by          | Outside RC-ENG-8.3's claim                         |
| ----------- | ---------- | ------------------------ | --------------------- | -------------------------------------------------- |
| RC-ENG-8.15 | B2-1       | `f1b81db8a`              | third to fifth runs   | — (`Initiative.tsx` was widened by self-heal)      |
| RC-ENG-8.16 | B2-2       | `f1b81db8a`, `0033dd551` | third to fifth runs   | `Lifecycle.tsx` (its Start-dialog half, as 8.19)   |
| RC-ENG-8.17 | C2-1       | `f1b81db8a`              | third to fifth runs   | —                                                  |
| RC-ENG-8.18 | A3-1       | `0033dd551`              | fourth and fifth runs | `screens/play/Frame.tsx`                           |
| RC-ENG-8.19 | B3-1, B3-5 | `0033dd551`, `d1b4e6e4d` | fourth and fifth runs | `screens/session/Lifecycle.tsx`                    |
| RC-ENG-8.20 | D3-2, D3-3 | `0033dd551`, `d1b4e6e4d` | fourth and fifth runs | `app/map/canvas/MapMarkers.tsx`                    |
| (none)      | D4-1       | `d1b4e6e4d`              | fifth run             | `ds/components/core/Popover.tsx`, `POIPopover.tsx` |

RC-ENG-8.15 is done for its finding (Next turn rests in view and takes the tap on every tier) but
not for its acceptance as written, which asks that every tile button take a centre tap where it
rests: 17 controls across the three widths still rest outside their tile body (the Map tile's lower
controls, the Timer pair on the rail, the phone canvas's combat-row actions), and
`tile-overflow-controls.spec.ts` records them as an exact list rather than passing them (§4). The
review holds them at medium. Closing that acceptance, or narrowing it, is the operator's call. RC-ENG-8.20
asked to move the seeded token off the glyph "if the overlap remains"; with only the pins and discs
taking presses, both seeded tokens' centres hit-test as themselves and axe finds no `target-size`, so
the seed was left as it is.

Each fix has an e2e on both profiles that fails on the commit before it and passes on it:

- `companion-preview.spec.ts` "Any player sees the scene the session shows the table" (A3-1), and
  `screen-visibility.spec.ts` on a fresh vault (A3-1 and B3-1, with the Share focus and status for
  A4-1) and on the home screen (B3-5);
- `map-editor.spec.ts`, the seeded Ruined Keep at 390×844 with touch and 1440×900 with a mouse: each
  token dragged from its centre with no point moving, axe `target-size` (D3-2, D3-3); each pin
  hit-tested and tapped on Atlas and in the editor (D4-2); arrows after selecting the DM-only Glyph of
  Warding on Atlas and in the editor (D4-1).

The RC-CHR-6.5 test "Any player uses the generic actor without borrowing the demo seat character or
scene" assumed the generic preview's stage is empty; it now re-points the demo seat at another scene
and asserts the stage shows the table's scene and not the seat's.

Before the gates on `d1b4e6e4d`: the full e2e suite on both profiles (2,326 passed, 51 skipped,
1 flaky: `companion-preview.spec.ts:219`, Escape from a Demo Player 2 preview staying on `/play`,
which fails 1 in 20 on `511fc6af4` and passed 20 of 20 on `d1b4e6e4d`), `pnpm test:app` (2,402
tests), `pnpm lint`, `pnpm typecheck`, `pnpm feature-audit` and the pinned-container visual suite
(588 passed; no baseline changed in the fourth or fifth run).

## 8. Not checked

- Electron and Android shells; hosted CI.
- Themes other than the default, except through the contrast gate and the visual suite; Spanish
  and the pseudo-locale beyond the specs that assert them.
- A screen reader. Accessible names and status announcements come from ARIA snapshots, axe and the
  live region's DOM, not from a reader.
- In the review: the camera QR join (no camera on this machine; the companion was joined over the
  fake LAN); the earlier ids listed as not re-checked in §4.
- The review is a model reviewer driving the app, with the high findings checked against source. It
  is not a usability test with people.

## 9. Reproducing the run, and integration

The review probes were scratch specs and are not committed; they are kept with the evidence. The
gates are committed. From a clean checkout, with `<dir>` a scratch path and `<port>` a free port:

```sh
git worktree add --detach <dir> d1b4e6e4d
cd <dir> && pnpm install --frozen-lockfile
cd <dir>/apps/gm-react
# five times, n = 1..5:
DNDTOOLS_E2E_PORT=<port> PLAYWRIGHT_JSON_OUTPUT_NAME=<dir>/golden-run<n>.json \
  pnpm exec playwright test tests/e2e/golden-path.spec.ts \
  --project=desktop-chromium --project=mobile-chromium --reporter=json,line
cd <dir> && DNDTOOLS_E2E_PORT=<port> pnpm a11y:gate
```

The DEBT.md and FEATURE-GAPS.md readings in §5 and §6 are static: the files at `d1b4e6e4d` read
against the source they cite.

This audit holds for the application tree of `d1b4e6e4d`. The commit after it adds only
documentation: this file, the roadmap notes, the planning index, one FEATURE-GAPS.md anchor and the
run journal. Before citing this verdict for
another commit (the merge of this branch into `loop/rc`, say), run
`git diff --stat d1b4e6e4d <commit> -- . ':!docs' ':!state'`. Empty output means the same application
code; anything else means the gates run again.

## 10. The fourth run, on `0033dd551`

Run 2026-10-16 on `0033dd551`, `loop/rc` plus this branch's fixes for the second and third runs'
findings, with the same gates and method. The visual suite passed (588) with no baseline changed.

**Verdict: not passed.** Gates 1, 3, 4 and 5 held: 78 of 78 in each of five golden runs (22:40–22:46Z,
load 4.7–21 at the run starts, with the review passes running), and the a11y gate PASS with the same
one moderate. The review confirmed A3-1, B3-1, B3-5, D3-2 and D3-3 fixed and found no leak in the
generic preview. Gate 2 failed on one new high:

- **D4-1 (high)**: selecting a point of interest opened its popover with focus on the visibility
  radios, because `Popover` focuses the body's first control (`ds/components/core/Popover.tsx:118-133`)
  and `POIPopover` puts the `SegmentedControl` first (`ds/components/map/POIPopover.tsx:209-220`). The
  map editor's own hint says arrow keys nudge the selection, so following it turned a DM-only point
  player-visible, announced only as "Saved on this device". 6 of 6 on desktop, in the editor and on
  `/atlas`. The code dates from September.

It was fixed in `d1b4e6e4d` with two regressions of `0033dd551` found in the same run (A4-1/B4-1 and
D4-2), and the fifth run confirmed all three.

### The fourth run's medium and low findings

Their status on `d1b4e6e4d` is in §4.

- **A4-1 / B4-1** (fixed in `d1b4e6e4d`) "Share with players" unmounted with focus on it, and nothing
  announced the share.
- **A3-2** (narrowed) The `/session` Start dialog now explains and shares a GM-only screen, but the
  top bar's Start still goes live on one without the dialog, with the toast "Session started…"
  (`app/ProjectionControl.tsx:52-74,150`).
- **B4-2** On the Command Center's scenes card, a GM-only screen that went live is badged "Live" with
  the players' eye icon while `/session` says "Players see nothing yet"
  (`app/widgets/templates/HubParts.tsx:153-156`).
- **B4-3** Every DS dialog's Close is 30×30 on the rail and the phone (`ds/components/overlay/Dialog.tsx:458-459`).
- **B4-4** On the phone's list view in live combat, the Initiative tile shows one of six combatants
  with no cue that more exist; its compact tracker scrolls inside its own box
  (`InitiativeCompact.tsx:176`).
- **C4-1** The seeded PCs show SPEED "—", INIT "—", HIT DICE "0/0 d8" and no save proficiencies on the
  DM sheet and the companion; the seed sets only class, background, abilities, HP and AC
  (`runtime/demo-seed.ts:49-75`), and the sheet does not derive INIT from DEX
  (`screens/characters/sheet/CombatPanel.tsx:61-69`). Supersedes C-5 and absorbs C-4.
- **C4-2** A character can never be removed: no command archives or deletes one, and no control
  offers it.
- **C4-3** A note's Edit and Push-to-players controls are 28×28 on touch
  (`screens/knowledge/NoteViewer.tsx:355-370`).
- **D4-2** (fixed in `d1b4e6e4d`) Once points of interest sat under tokens, a token's wrapper covered
  Broken Altar's pin on the phone's Atlas detail.
- Low: A4-2 the "Any player" identity card says "Your own character" · B4-5 Share persists if the GM
  then cancels · B4-6 the companion's Journal says no scene has been shown while the stage shows one ·
  C4-4 the stage's handout preview prints raw markdown · C4-5 the sheet header's class line is raw
  lower case · C4-6 companion journal disclosures 17px tall on the rail · C4-7 coin steppers and
  Damage/Heal 1 at 28×28 · D4-3 tokens draw over point labels · D4-4 "Players" in the popover is
  "Player visible" elsewhere · D4-5 a point's label no longer takes a click.

## 11. The third run, on `d24d51bb3`

Run 2026-10-16 on `d24d51bb3`, `loop/rc` plus this branch's fixes for the second run's findings
(`f1b81db8a`, with 30 visual goldens re-baselined in `d24d51bb3`), with the same gates and method.

**Verdict: not passed.** Gates 1, 3, 4 and 5 held: 78 of 78 in each of five golden runs and the a11y
gate clean with the same one moderate. The review confirmed C2-1, B2-1 (for Next turn) and B2-2 (for
sharing) fixed. Gate 2 failed on three new highs:

- **A3-1**: with a session live and the table shown a scene, previewing "Any player" from the top bar
  showed a stage saying "Your DM has not shown a scene yet". The generic preview actor was not in the
  stored permissions and had no player-view assignment, so the companion's reads answered
  `unknown-actor` (`screens/play/Frame.tsx`, `packages/core/src/queries/command-center-home.ts:218`).
- **B3-1**: every new screen starts GM-only, and the Start dialog offered it with "Show … to the
  table" disabled, the reason only a hover `title` in English and nothing pointing to where sharing
  is set (`screens/session/Lifecycle.tsx:399-401`).
- **D3-2**: on the demo vault's Ruined Keep at default zoom on the phone, a drag from Sir Caldwell's
  centre moved Broken Altar instead, because each point's wrapper, sized to its pin and label, took
  the press at the tokens' z-index (`app/map/canvas/MapMarkers.tsx:144-178`).

They became RC-ENG-8.18 to 8.20. The fourth run (§10) found all three fixed.

### The third run's medium and low findings

Their status on `d1b4e6e4d` is in §4.

- **A3-2** (with A2-1, A2-2) The share control is hard to find from the start path: the guide still
  makes "DM screen" from the DM screen template, top-bar Start goes live on a GM-only screen with a
  toast that does not say players see nothing (`app/ProjectionControl.tsx:52-74`), and neither
  `docs/user/screens.md` nor `running-a-session.md` mentions who can see a screen. Folded into
  RC-ENG-8.19's scope.
- **A3-3** On the rail, the companion's role blurb in a preview is squeezed to about 75px wide, one
  word per line (`screens/play/Frame.tsx:416`).
- **A3-5 / B3-4** Grow to fit and Restore tile size are 24px tall on touch (74×24 and 105×24 on the
  rail), the WCAG 2.5.8 minimum the fix chose (`app/widgets/WidgetRenderSlot.tsx`). It reverses
  RC-ENG-8.7's 44px and widens FRICTIONLESS M2. The 44px row is what hid Next turn.
- **B3-2** On the rail at Fit, the Timer's Start and Add a minute rest under its "1 more line" footer
  (only the top 17px show; a tap on Add a minute's centre grew the tile in 2 of 3 runs). The clock
  and both controls need about 82px and the rail body is 76px even with no footer. Desktop and
  phone are clean. Rated medium, as pass B rates it: the Timer is off the combat path, Grow to fit
  sits beside it, and the rail's live quick panel has its own Timer Start. The second run counted it
  inside B2-1's high.
- **B3-3** Regression from the fix: Next turn now leads its row (`order: -1`,
  `widgets/templates/board/Initiative.tsx`), which pushes the Round, Turn and HP readout down; at Fit
  on desktop "Mother Sild" and "45 / 45" are cut through the glyphs and on the rail the readout is
  hidden ("5 more lines").
- **B3-5** Scene details offers "Who can see this screen" on the home GM screen; shared, it can go
  live as the table's view showing its name and an empty grid. The field's guard asks the core's
  `canShowSceneToTable`, which keeps the home screen projectable. Folded into RC-ENG-8.19.
- **B3-6** Add a minute on a timer that has never started does nothing; Start resets to 60
  (`packages/core/src/commands/widget-command.ts:368`).
- **C3-1** Regression from the fix: with the wizard held to its column, the level-up stepper's
  nowrap labels overflow their `flex: 1` items and print over the next step on the rail and the
  phone ("Slots and resources" over "Review"; `ds/components/core/Stepper.tsx:84-85,118`).
- **C3-2** Keyboard focus falls to the body when the level-up wizard opens and on every Next, because
  Next is natively disabled while the new step is unanswered (`app/character/LevelUp.tsx`); Enter in
  the Class field does not save. One run, desktop.
- **D3-1** The map import's six-step stepper has the same overlap on the phone (`Stepper.tsx`, used at
  `app/map/ImportMapDialog.tsx:92`). Visible in the second run's screenshots, unreported then.
- **D3-3** axe reports `target-size` (serious) on the seeded "Token: Cellar Ambusher", partly
  covered by Glyph of Warding, in Ruined Keep's detail and editor on every tier. The content side of
  D3-2; RC-ENG-8.20 covers it.

Low: A3-4 Scene details drops an unsaved "Who can see" change on close, like its other fields (read in
code) · A3-6 desktop's live top bar gives no hint that players see nothing on a GM-only screen ·
B3-7 in a wide Initiative tile Next turn now sits left of the readout, so visual and DOM order differ
· B3-8 the phone list's Initiative tile has Next turn at 93×25 · C3-3 the History tab's empty state
still says only journal entries appear there · C3-4 the class step shows its "Choose the class"
prompt in warning orange before any input · C3-5 the phone's Help row (81×34) on Characters and
Notes · D3-4 focus falls to the body after Create map · D3-5 Generate's sticky footer floats over the
Presets row on the phone · D3-6 generator descriptions use engineering jargon ("Delaunay/MST graph")
· D3-7 the map editor's Undo and Redo are disabled with no reason when there is no history.

## 12. The second run, on `b2ddfc1d`

Run 2026-10-16 on `b2ddfc1d`, the dispatcher's `loop/rc` after RC-ENG-8.5 to 8.14 landed, with the
same gates and method (four route groups).

**Verdict: not passed.** Gates 1, 3, 4 and 5 passed (78 of 78 in each of five golden runs; the a11y
gate clean with the same one moderate; DEBT-2026-006, -007 and -008 resolved and -004 down to part
(c); the first run's two FEATURE-GAPS limits gone). Gate 2 failed:

- C2-1 (critical): on the rail and the phone the level-up wizard grew to its stepper's 609px, so
  Next and Discard level-up sat past the right edge of a column a finger cannot scroll;
- B2-1 (high): at Fit during live combat, a 44px overflow footer row left the Initiative tracker's
  Next turn scrolled out of a 32px body on the rail and 46px on desktop;
- B2-2 (high): every new screen was GM-only and nothing in the app could change a scene's
  visibility, so only seeded scenes could ever be shown to players.

They became RC-ENG-8.15 to 8.17. The first run's highs A-1, B-1, C-1 and D-1 were fixed. The third
run (§11) found the three fixed, with the Start dialog's half of RC-ENG-8.16 still open (B3-1).

### The second run's medium and low findings

Their status on `d1b4e6e4d` is in §4.

- **A2-1** (also B2-5) On a fresh vault, Start session from the top bar or `/session` answers with
  the toast "Create a scene first — a session needs a scene to show players." and no action; the app
  calls them screens, and the vault already shows two (`app/ProjectionControl.tsx:55-58`,
  `en.ts:312`). The built-in screens are not startable (`screens/session/useSessionView.ts:95-114`).
- **A2-2** The first-session guide's New screen defaults to the DM screen template and the name "DM
  screen" (`screens/screen/NewScreenDialog.tsx:42`), so the guide makes a second "DM screen", and the
  session goes live on it showing players nothing (the B2-2 path).
- **A2-3** Onboarding's consent step opens with "Cloud-Enhanced lets our server read your campaign
  content, including secrets" before saying those features are not in this edition
  (`en.ts:67`).
- **B2-3** B-7 unchanged on every tier: the Map tile's body scrolls on its own
  (`app/widgets/templates/board/MapView.tsx:355`), so its zoom row and Project to players can sit
  out of view with no "more" cue.
- **B2-4** Two strings from the RC-ENG-8.6 fix bypass the catalog: "nothing yet" in the Session
  header (`screens/session/Lifecycle.tsx:56`) and the disabled checkbox's hover-only reason
  (`Lifecycle.tsx:401`).
- **B2-6** In the template editor on the rail and the phone, removing the last tile replaces the
  history cluster with the empty state, so the canvas Undo is gone; only the toast's Undo or Ctrl+Z
  restores the tile.
- **C2-2** Level-up's class step starts empty for a character who already has a class, and accepts
  any text (`app/character/LevelUp.tsx:175`, `LevelUpParts.tsx:205-231`).
- **D2-1** In Atlas's Layers panel, Move up/down and the visibility chip drop focus to the body after
  use, because they set native `disabled` while busy (`screens/atlas/LayersPanel.tsx:114,124,162`);
  the enable switch keeps focus. Predates RC-ENG-8.11.
- **D2-2** On the phone, Atlas's Project to players result renders about 1,500px above the viewport
  (`screens/atlas/index.tsx:214`), so the GM sees no result.
- **D2-3** On the phone map editor, choosing Generate shows nothing; the panel stays behind Panels
  (`app/map/useMapEditorShell.ts:133-141` raises it only in quick-map mode).
- **D2-4** The map import's "External scene format" path reports "Imported … · Scene elements
  recorded" and marks the background image "Importable", but changes nothing on the map
  (`useImportMap.ts:251-255` commits with no bytes); a `.dd2vtt` the editor just exported cannot be
  imported back. The first step does say scene files cannot be read.
- **D2-5** An imported square map is stretched to the canvas's shape on every tier (the map lives in
  a 0..100 box with `preserveAspectRatio="none"`, `app/map/canvas/MapSvgLayers.tsx:55`). Tokens and
  walls stay aligned with the image. No doc records the choice.

Low: A2-4 Send feedback always shows "If the form did not open…" because `window.open(…, 'noopener')`
returns null · A2-5 "atlas" in the palette finds only New map · A2-6 on desktop, focus falls to the
body after a palette Go to opened with Ctrl+K · A2-7 the palette shows "esc" and arrow-key hints on
touch and has no Close button · A2-8 Help guides say "GM screen" · A2-9 Command Center regions are
announced with numbers · B2-7 "More editing tools" exists only on the phone · B2-8 B-11 and B-13
still visible on Session · C2-3 the Journal tab badges automatic History entries with raw kind ids
("level-up", "rest") and offers them an edit pencil · C2-4 point buy starts every score at 10 with 15
points left and no Suggest · D2-6 the Generate panel has no side padding on desktop and the rail ·
D2-7 opening Generate logs "Function components cannot be given refs" (`GeneratePanel.tsx:267`
passes a ref to the DS `Input`) · D2-8 the minimap shows only a hatched placeholder, even for an
imported image · D2-9 read-only Atlas layer rows are Tab stops with raw English names · D2-10 the
Select tool group's pop-out opens over the canvas by default · D2-11 (unconfirmed) the "Your notes are
connected" tip can sit over Atlas's Layers panel.

## 13. The first run, on `ef42291b`

Run 2026-10-15 on `ef42291b`, with the same gates and method (three route groups, then a phone
template-editor pass and a pass for five actions the first groups had not reached).

**Verdict: not passed.** Gates 1 and 3 passed (78 of 78 in each of five golden runs; the a11y gate
clean with the same one moderate). Gates 2, 4 and 5 failed:

- five high review findings: A-1, a typed section name in the palette opened the Import hub; B-1,
  the default Start session went live on the DM-only home screen and said players saw it; B-2, on
  the rail at Fit the overflow footer covered the Initiative tracker's Next turn; C-1, a PC built in
  the wizard lacked the ancestry bonus, hit dice, initiative and save proficiencies the wizard showed;
  D-1, a finished map import left the open editor saying the map's image was missing;
- four open primary-path DEBT entries: -004 part (b), -006, -007 and -008;
- two primary FEATURE-GAPS limits outside the §2.1 four: Characters History without rest, combat or
  level-up events, and a push limit on the Player app row that `/play` never showed.

They became RC-ENG-8.5 to 8.14. The second run (§12) found A-1, B-1, C-1 and D-1 fixed, the DEBT entries
and limits resolved, and B-2 still present as B2-1.

### The first run's medium findings

Their status on `d1b4e6e4d` is in §4.

- **A-2** The NavRail's Search is 28×28 on the touch rail.
- **A-3** One glyph serves two or three destinations on the rail and in More (DM screen and
  Extensions share `widget`; Local vaults uses Story's glyph), and the rail shows no label on focus
  or touch.
- **A-4** DS Dialog and Sheet close buttons are 30×30 on touch tiers; the toast's Dismiss is 24×24.
- **A-5** The live-session quick button's accessible name is its ticking clock ("00:04").
- **A-6** Creating a screen from `/screens` drops focus to the body.
- **A-7** The Import hub's description is clipped in the dialog header ("Choose what to bring in.
  Each" on the phone).
- **A-8** The screen header's Pin is 28×28 on the rail in view mode, which widens FRICTIONLESS M2.
- **B-3** The Combat scene template's "Conditions" tile lists factions.
- **B-4** Picking an active map in `/session` before any home screen exists fails with the raw core
  message "No Command Center home Scene exists for the active map widget." (C-7 hits the same refusal
  from Atlas.)
- **B-5** Session combat and encounter-builder targets on rail and phone: Heal and Damage 28×28 on a
  30px pitch, Previous turn 28×28, combatant names 16px tall, the phase control 29px.
- **B-6** The seeded scene "The Sunken Crypt" opens its editor with "1 layout issue".
- **B-7** At Fit on desktop the home screen's Map tile clips its zoom row and hides Project to players
  (folded into RC-ENG-8.7).
- **C-2** Focus falls to the body after Create character (desktop and phone).
- **C-3** On the phone, opening a character from a scrolled roster lands mid-sheet with no back
  control in view.
- **C-4** A joined player's sheet shows Proficiency "—" and Passive Perception "—" where the DM sees
  +2 and 10.
- **C-5** Seeded PCs read "No skills, saves, or hit dice recorded" under a populated saves panel.
- **C-6** Damage and Heal are bare chevrons with an unlabeled amount box, on the DM sheet and the
  companion.
- **C-7** Atlas's Project to players can show the raw core refusal, and otherwise reports "Projected …
  to 3 players" with no live session.
- **C-8** The token tool's hint promises inspector linking that the inspector does not offer.
- **C-9** Import map sits under the map editor's Export menu, and `/atlas` has no Import action.
- **C-10** On the phone, tapping a map in Atlas shows nothing; its detail sits below the whole
  library.
- **C-11** The phone map editor clips the map name, the breadcrumb and the token hint.
- **C-12** Atlas and map-editor targets under 44px on rail and phone (zoom, layer reorder, Back,
  Undo, Redo).
- **C-13** Builder steppers, the sheet's back control and Rename, and the notes sharing segment are
  under 44px on touch.
- **C-14** Companion handouts sort by random id, so the newest lands anywhere and a different one
  auto-opens each run.
- **C-15** The join dialog promises a nearby-table list that does not exist, in English outside the
  catalog.
- **BP-1** After a removed tile is restored with the canvas Undo or Ctrl+Z, the "Removed … · Undo"
  toast stays up, and its Undo reverts the edit before the removal without saying so. Reproduced 3
  times; the toast's action calls the generic history undo
  (`apps/gm-react/src/screens/sceneEditor/useSceneCommands.ts:116-122`). Not phone-specific.
- **BP-2** On the phone the inspector overlays the right 300px of the canvas
  (`sceneEditor/shared.ts:15-23`), so it covers the tile being edited and its Actions button.
- **BP-3** The tile menu's Move and Resize start a keyboard grab and show arrow-key hints, which do
  nothing on a touch-only phone. Touch drag and the Transform tab still work.
- **BP-4** On the phone Scene details reopens over the canvas each time nothing is selected
  (`sceneEditor/index.tsx:142-145`), leaving about 311px of canvas and covering the zoom row or the
  empty state's Apply a template.
- **BP-5** The phone edit canvas's Undo, Redo, zoom and Flow tile-menu buttons are 28×28, the resize
  handle 24×24. This is FRICTIONLESS M2 on the phone; the header controls are now at least 44px.
- **D-2** Dragging a token just placed, with the Token tool still active, places a second token on
  desktop and does nothing on touch; markers take pointer input only under Select & move
  (`apps/gm-react/src/app/map/canvas/MapMarkers.tsx:86`), where the drag works and persists on every
  tier.
- **D-3** The keyboard alternative to dragging: Enter on a selected token toggles it off without a
  word (`MapMarkers.tsx:72`); a second Enter re-selects it and the arrows then move it a tenth of
  the map per press.
- **D-4** On the rail the Fog of war flyout covers the wrapped options bar's Rect, Polygon and Brush;
  collapsing the group frees them. `map-editor.spec.ts:586` checks only the Water tool at 1280px.
- **D-5** A new map has no fog and the tool defaults to Reveal, so the first stroke changes nothing a
  player would see while the announcement says "Fog revealed."; there is no cover-the-whole-map
  action, and brush strokes draw as a thin dashed centre line.
- **D-6** The POI and token inspectors' Label field saves on blur only: Enter does nothing and Escape
  loses the name (`apps/gm-react/src/app/map/dock/MarkerInspectors.tsx:48-53,158-163`), while the
  list view's field saves on Enter.
- **D-7** On the phone the editor's tool-group strip holds 492px of buttons in 298px: Tokens sits
  under Show list, and Combat, Notes and Generate are off the edge with no scroll cue. The group
  holding Point of interest, Route and Label is called "Notes", the name of the Notes library.
- **D-8** Under 44px on rail and phone, widening C-12 and A-4: the token marker 30×30, the POI
  popover's Close 28×28 and visibility options 24px tall, the phone Panels button 28×28, the
  "Import map…" item 31px tall, and the shortcut list's Close 30×30.

### The first run's low findings

A-9 no Help inside onboarding · A-10 focus after onboarding lands on the finished row · A-11 the live
chip squeezes the desktop subtitle · A-12 the hero's party avatars clip their initials · A-13 the
palette input is named by its placeholder, which says "scenes" · A-14 the step-1 storage link is 16px
tall · B-8 disabled controls with no reason (Show to table, "Active map · Required", phone Move
up/down) · B-9 dead-end empty states on `/session` · B-10 toasts cover the phone combat list · B-11
"Lowest HP" in danger red at full health · B-12 every edit canvas is announced "DM screen layout
editor" · B-13 the Session subtitle truncates beside the live chip · B-14 Recap stays in Recap after
saving the log · C-16 builder attack fields have no visible label · C-17 vocabulary drift ("Back to
Atlas" under a Maps nav, "Default DM", a check icon on "Not ready") · C-18 keyboard instructions on
touch Atlas · C-19 phone and rail badges break mid-word · C-20 the companion journal's callout
contradicts its layout · C-21 a phone note scrolls out of view after Done · C-22 sheet tabs wrap ·
C-23 the token inspector's Delete dominates · C-24 disabled controls with no reason (Inventory Add,
Level up, Add entry, Export as markdown, Open in map editor, Create, Join) · C-25 the demo maps are
mostly empty grids · C-26 Atlas states its counts ambiguously · BP-6 the "Previewing as Player" toast
outlives the preview · BP-7 the preview banner says "Press Escape" on a phone · BP-8 an applied
template lands at 100% with tiles off the right edge · BP-9 a one-finger pan on empty canvas did not
move the view (possibly a probe artefact) · BP-10 only the details panel says a scene is a template ·
BP-11 the template picker's thumbnails clip their labels · D-9 focus falls to the body when the
import's result step appears · D-10 the shortcut list says "Scene canvas" and "scene card" (M1/M3)
and is offered on touch-only phones · D-11 the editor tour says "Hover over a tool" on touch · D-12
the phone list view cuts off its Position and Actions columns · D-13 Help opens with focus on Import
hub.
