# Early-access exit audit (RC-ENG-8.3, the M2.5 gate)

Third run, 2026-10-16, on **`d24d51bb3`**: the dispatcher's `loop/rc` (`511fc6af4`, which is the second
run's `b2ddfc1d` plus a lossless re-encode of 171 visual baselines) with two commits from this
story's branch. `f1b81db8a` fixes the second run's three findings (RC-ENG-8.15 to 8.17), and
`d24d51bb3` re-baselines the 30 visual goldens those fixes change. The finding stories were still
`proposed` in the dispatcher's store, so the self-heal round that re-dispatched this story widened its
claim to the three defect files and the fixes were made here ([§7](#7-blocking-stories)). Everything
in §1 to §9 was measured on `d24d51bb3`. The second run, on `b2ddfc1d`, is kept in
[§10](#10-the-second-run-on-b2ddfc1d) and the first, on `ef42291b`, in
[§11](#11-the-first-run-on-ef42291b).

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

**M2.5 does not pass on `d24d51bb3`.** Gates 1, 3, 4 and 5 pass. Gate 2 fails: the review found no
critical finding and three high ones, all new in this run.

- **A3-1 (high).** With a session live and the table shown a scene, previewing "Any player" from the
  top bar shows a stage that says "Your DM has not shown a scene yet". A GM checking what players
  see is told they see nothing.
- **B3-1 (high).** Every new screen starts GM-only, and the Start dialog offers it with "Show … to
  the table" disabled. The only reason is a hover tooltip in English, and nothing points to where
  sharing is set. This is the half of RC-ENG-8.16 that the fix in `f1b81db8a` did not cover.
- **D3-2 (high).** On the demo vault's Ruined Keep at default zoom on the phone, a drag from a
  seeded token's centre moves a nearby point of interest instead, because the point's label takes
  the press. It also happens on desktop for one token.

The second run's critical and two highs are fixed. C2-1 (level-up off-screen on touch), B2-1 (Next
turn unreachable at Fit) and B2-2 (no way to share a screen) were each re-tested with their original
reproduction on every tier they apply to. The fixes caused two medium regressions (B3-3, C3-1) and
widened FRICTIONLESS M2 (B3-4). The Timer part of B2-1 remains on the rail, as medium B3-2.

The three findings are filed as RC-ENG-8.18 to 8.20 ([§7](#7-blocking-stories)), added to
RC-ENG-8.3's `Deps:` in the roadmap and created in the dispatcher as `proposed`. RC-ENG-8.3 is not
complete: the story closes only when a run on an application commit carrying those three passes all
five gates.

What holds: the five golden journeys passed 50 of 50 times across ten profile-runs with no retry,
and the axe gate reports no critical or serious violation on 60 route-and-profile scans.

## 2. Golden paths

`golden-path.spec.ts` on `desktop-chromium` and `mobile-chromium` together, retries 0, five
consecutive runs, 2026-10-16 19:04:28–19:09:15Z: **78 passed, 0 failed, 0 flaky, 0 skipped in each
run** (39 per profile). The 78 are the five journeys (first run, prep, Standby to live, knowledge
capture, a player joining over the fake LAN) and the detector and seeded-defect fixtures that prove
each journey assertion fails on a planted defect. The highest retry index in all five JSON reports
is 0. The machine's load average was 2.8–3.8 at the run starts.

The journeys still go live on a seeded shareable scene and join a specific player, so they pass with
A3-1 and B3-1 present. None of them drags a token.

## 3. Accessibility gate

`pnpm a11y:gate` on `d24d51bb3` (19:09:15–19:10:38Z, straight after run 5), exit 0:

- non-text contrast: 319 pair checks across five themes and 16 forced-colors remap checks passed;
- axe on both profiles: 61 passed, 1 skipped (the phone-only `/board` Layout test on
  `desktop-chromium`, skipped by design);
- report over 60 route-and-profile scans, all 60 worker artifacts present: 0 critical, 0 serious,
  1 moderate, 0 minor; 0 blocking; 0 approved known violations; "Gate result: PASS".

The moderate one is axe `region` on `/session#combat` on `mobile-chromium`, as in both earlier runs
(FRICTIONLESS.md L12). The gate scans its own seeded routes; the `target-size` violation pass D
found on the seeded Ruined Keep map (D3-3) is on a route state the gate does not reach.

## 4. The review

Four passes of the project's `ux-ui-reviewer` agent (`.claude/agents/ux-ui-reviewer.md`), one per
group of routes, each in its own detached worktree at `d24d51bb3` with its own dev server, run in
parallel after the gates (about 19:11–20:02Z). Each drove the app with the repo's Playwright through
scratch probe specs built on `tests/e2e/_helpers.ts`, starting from the second run's probes, at
1440×900 (desktop, mouse), 834×1112 (rail, touch) and 390×844 (phone, touch), default theme,
English. The shared brief gave them the severity scale above, the second run's audit to re-check,
FRICTIONLESS.md's open items and the four code paths the fixes changed, required the second run's
critical and highs to be re-tested with their original reproduction, and required every critical or
high finding to reproduce in two separate runs. I re-read the source behind each high finding before
accepting it. Screenshots, ARIA snapshots, per-state metrics and the probes stay in the audit's
scratch directory and are not committed.

| Group | Routes                                                                                                                                 | Critical | High | Medium | Low |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---- | ------ | --- |
| A     | Onboarding, Command Center (fresh, seeded, demo, live), the shell, palette and Help with the shortcut list, `/screens`                 | 0        | 1    | 3      | 2   |
| B     | `/screen/:id` (home and four templates, view and edit), `/scene/:id` and the template editor on all three tiers, `/session`            | 0        | 1    | 5      | 2   |
| C     | Characters, the builder and level-up, character History, Notes, `/play` joined over the fake LAN                                       | 0        | 0    | 2      | 3   |
| D     | Atlas and its Layers panel, the map editor (token drag, fog, POI, Generate, Assets), image and external-scene import, `.dd2vtt` export | 0        | 1    | 2      | 4   |

The counts are this run's new ids (A3-5 and B3-4 are the same item, seen by two passes). Every route
was loaded at all three tiers, with the gaps listed in [§8](#8-not-checked). No page overflowed
horizontally at any tier. The only console message any probe saw is D2-7's React ref warning when
the map editor's Generate panel opens; there was no page error.

### The second run's critical and highs, re-tested

| Id   | Status              | Evidence                                                                                                                                                                                                                                                                                                                                    |
| ---- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C2-1 | fixed               | 2 runs on each of rail, phone and desktop. The wizard is its column's width (362px on the phone, was 609px; 458px on the rail); every control was tapped where it rests after a vertical scroll only: Discard and its confirm, Choose, Next ×4, Take the average, Finish. Level 2 was stored, max HP 31 → 36, in all six runs.              |
| B2-1 | fixed for Next turn | 3 runs × 3 tiers on the demo vault's live home screen at Fit, no tile body scrolled. Next turn rests inside its body and hit-tests as itself at centre, top and bottom; a centre tap advanced the turn in 9 of 9 runs. Bodies: 52px on the rail, 66px on desktop, under a 24px footer. The Timer on the rail does not fit: B3-2.            |
| B2-2 | fixed for sharing   | Passes A (from the first-session guide, 2 runs × 3 tiers) and B (fresh vault, 3 runs × 3 tiers, and a player over the fake LAN on 2 runs × 3 tiers). "Who can see this screen" in Scene details stores the choice; the Start dialog's box is then enabled and checked, the header names the screen, and the joined player's stage shows it. |

The first run's highs stay fixed: A-1 (pass A, 2 runs × 3 tiers), B-1 (pass B, 3 × 3), C-1 (pass C,
13 builds across the tiers) and D-1 (pass D, 6 of 6).

### Critical

None.

### High

- **A3-1 · Top bar › Preview › "Any player", every tier · the preview says no scene is shown while
  one is.** With a session live and `/session` reading "Players see Harbor of Saltreach" (seeded) or
  "Players see DM screen" (a fresh vault's shared screen), Preview as "Any player" opens the
  companion with "Session live" in its heading and "Your DM has not shown a scene yet" on its stage.
  A preview as a specific player shows the scene. On a fresh vault before a party exists, "Any
  player" is the only player preview. `apps/gm-react/src/screens/play/Frame.tsx:98-104` builds the
  preview from the raw `runtime.state`, where the generic preview actor is not in
  `permissions.actors`; `resolveCommandCenterHome` then answers `unknown-actor`
  (`packages/core/src/queries/command-center-home.ts:218`) and the stage has no scene name. The core
  already has `permissionsWithPreviewActors` (`packages/core/src/queries/preview-mode.ts:149`).
  Reproduced 18 of 18 (2 runs × 3 tiers × 3 vault states). None of the three fixes touched these
  files; the second run's B2-2 note that "a player's preview reads 'Your DM has not shown a scene
  yet'" was partly this. Held high because the preview is the GM's one check before the table and
  it contradicts the session header on every vault; the case for medium is that real joined players
  see the scene. I re-read the three locations; they agree.
- **B3-1 · `/session` and the top bar, every tier · the Start dialog gives no visible reason or
  route when the screen is GM-only.** Every new screen starts GM-only
  (`apps/gm-react/src/screens/screen/useScreens.ts:212`), including the one the first-session guide
  makes. The Start dialog offers it with "Show … to the table" unchecked and disabled; the reason is
  `title="DM-only scenes cannot be shown to the table."`
  (`apps/gm-react/src/screens/session/Lifecycle.tsx:399-401`): hover only, English outside the
  catalog, absent on touch, and pointing nowhere. The control that shares the screen is in Scene
  details, behind Edit layout and a pencil named "Edit scene name, description & tags". RC-ENG-8.16
  asked for both halves; `f1b81db8a` delivered the sharing control only. Reproduced 3 runs × 3 tiers
  (pass B) and 2 × 3 (pass A, as A3-2, rated medium there). Held high, as pass B argues, because the
  disabled control is on the default path and explains nothing where the GM fails; the screen
  header's "DM only" is not visible from the dialog. I re-read `Lifecycle.tsx:396-405`.
- **D3-2 · Map editor, phone (and one token on desktop) · dragging a seeded token from its centre
  moves a point of interest instead.** On the demo vault's Ruined Keep at default zoom on the phone,
  Sir Caldwell's centre is covered by Broken Altar's marker wrapper: 8 of 25 sample points on the
  token hit it, a tap at its centre selects nothing, and a Select & move drag from the centre leaves
  the token in place and moves Broken Altar from (0.300, 0.280) to (0.426, 0.297), announced only as
  "Saved on this device". Cellar Ambusher's centre drags Glyph of Warding on the phone and on desktop.
  Each point of interest's wrapper is sized to its pin and label, carries pointer events and the drag
  handlers, and sits at the tokens' `zIndex: 2` after them in the DOM
  (`apps/gm-react/src/app/map/canvas/MapMarkers.tsx:144-178`; tokens at `:76-88`). Undo restores the
  point, and a drag from the token's edge works. Reproduced 3 of 3 on the phone, 2 of 2 for Cellar
  Ambusher on desktop and the phone. The code predates all three runs. Held high because moving a
  token is the editor's primary table action and the wrong object moves without a word; the case for
  medium is the first run's D-2, a wrong edit on drag rated medium, and the visible jump plus Undo. I
  re-read the marker code; it agrees.

### Medium

None of these blocks M2.5. They are recorded for the operator to file or fold into the stories in §7.

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

### Low

A3-4 Scene details drops an unsaved "Who can see" change on close, like its other fields (read in
code) · A3-6 desktop's live top bar gives no hint that players see nothing on a GM-only screen ·
B3-7 in a wide Initiative tile Next turn now sits left of the readout, so visual and DOM order differ
· B3-8 the phone list's Initiative tile has Next turn at 93×25 · C3-3 the History tab's empty state
still says only journal entries appear there · C3-4 the class step shows its "Choose the class"
prompt in warning orange before any input · C3-5 the phone's Help row (81×34) on Characters and
Notes · D3-4 focus falls to the body after Create map · D3-5 Generate's sticky footer floats over the
Presets row on the phone · D3-6 generator descriptions use engineering jargon ("Delaunay/MST graph")
· D3-7 the map editor's Undo and Redo are disabled with no reason when there is no history.

### The earlier findings, re-checked

Still present at their recorded severity: A2-1 to A2-9; B2-3 (the Map tile's own scroll hides
Project to players at Fit on the rail and desktop), B2-4 (part of B3-1), B2-6; C2-2 to C2-4; D2-1 to
D2-10, with D2-11 now confirmed (the "Your notes are connected" tip covers Atlas's Layers panel after
the first layer edit; low). From the first run, still present: A-2 to A-14 (A-12 not re-measured);
B-3, B-5, B-6, B-8, B-14, BP-1, BP-8; C-2 (now fixed on the rail), C-3 (phone only), C-4 to C-6,
C-13 to C-15, C-17, C-19 to C-22, C-24; C-7 to C-12, C-18, C-25, C-26; D-2 to D-9, D-11, D-12. Not
re-checked: B2-5, B2-7, B2-8, B-9 to B-13, BP-2 to BP-7, BP-10, BP-11, C-16, D2-9. BP-9 did not
reproduce. The second run's descriptions are kept in [§10](#10-the-second-run-on-b2ddfc1d), the
first run's in [§11](#11-the-first-run-on-ef42291b).

FRICTIONLESS.md: L4 is fixed (Next turn rests in view at Fit). M2 is wider: Grow to fit and Restore
at 24px on touch (B3-4), alongside the earlier sub-44px targets. M1, M3, M5, M6, M7, L1, L2, L3, L6,
L10 and L12 still hold as recorded; L5 was not re-checked. None other was found fixed.

## 5. DEBT.md

An entry counts as primary-path when its stated impact is visible to a GM or player on a primary
surface in a configuration the product ships (the default or a selectable theme, locale or system).
`DEBT.md` is unchanged since the second run, and so is the code its open entries cite.

| Entry         | Severity | Status on `d24d51bb3`                                                                                                                                                                                                                                                                                                                                                                                   | Counts |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| DEBT-2026-004 | low      | Open, re-scoped by RC-ENG-8.11 to part (c): the generator category and preset pickers (`app/map/generate/GeneratePanel.tsx`) and the asset category pickers (`app/map/dock/AssetsPanel.tsx`) are hand-rolled `aria-pressed` buttons rather than the DS `SegmentedControl`. Part (b) is resolved: Atlas composes `LayerRow` inside `LayerPanel`, and the entry records why the composed import conforms. | no     |
| DEBT-2026-009 | medium   | Open. Every content command copies every item. Not counted: the cost is internal, and RC-ENG-3.2's final capture breached none of the eleven budgets. This is a judgement; RC-ENG-7.3 should re-read it.                                                                                                                                                                                                | no     |

DEBT-2026-004 (c) is a judgement, as in the second run. Pass D re-checked it: on desktop the Assets
categories are a plain text list and Generate's chips match the editor chrome, and on touch they are
69×24 and about 23px tall, which is FRICTIONLESS M2 (medium), not this entry. If the operator reads
(c) as primary-path, gate 4 fails on it.

## 6. FEATURE-GAPS.md

The primary rows are Onboarding, Command Center, Palette and help, Screens, Scene editor, Board,
Session, Characters, Maps (Atlas), Notes (Knowledge) and Player app. A §2.1 limit is read as §2.1
item 2 defines it: a capability a primary surface offers, or the plan promises, that is unavailable
or incomplete.

None is counted. The primary rows and their limits are unchanged since the second run.
`pnpm feature-audit` reports 46 declared limits, 0 stale, 0 inventory issues, after two line anchors
were re-pointed: the six catalog keys `f1b81db8a` added moved the Plans & cloud row's
`Subscribe at {host}` anchor in `en.ts` from line 5596 to 5602, and the stories this run filed moved
the Shells and platform row's anchor on RC-PLT-1.1's §23 row in RC_ROADMAP.md from line 4260 to line
4307; neither row is primary. A3-1, B3-1 and D3-2 are review findings, not declared limits: no row
claims the preview, the Start dialog's reasons or marker hit areas.

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

## 7. Blocking stories

The second run's three stories were `proposed` in the dispatcher's store, not approved, when this
story was re-dispatched with its claim widened to `LevelUp.tsx`, `WidgetRenderSlot.tsx` and
`useScreens.ts`. The fixes were therefore made on this branch in `f1b81db8a`. Two files outside that
claim were needed and are named in its commit message: `Initiative.tsx` (one `order: -1`; Next turn
rested at 54–98px in a 76px rail body even with no footer) and `SceneMetaPanel.tsx` (the share field,
the surface RC-ENG-8.16 names). Each fix has an e2e that fails on the base and passes on the fix, on
both profiles: `character-levelup.spec.ts` (taps at rest at 834 and 390 with touch),
`tile-overflow-controls.spec.ts` (hit-tests at rest, advances the turn) and the new
`screen-visibility.spec.ts` (fresh vault to a joined player's stage). Before the audit, on the fix
commit: the full e2e suite on both profiles (2,301 passed; the ten failures were two specs, one an
artefact of editing files under a live dev server and one a locator the footer change made
ambiguous, fixed in `f1b81db8a` and passing on re-run), `pnpm test:app` (2,402 tests),
`pnpm lint`, `tsc`, and the pinned-container visual suite (588 passed after re-baselining 30
images, re-encoded losslessly to stay inside the 37 MiB budget).

RC-ENG-8.15 and 8.17 are complete as written apart from B3-2; RC-ENG-8.16 is complete for sharing,
and its Start-dialog half is RC-ENG-8.19. Their store entries are still `proposed`; reconciling them
is the operator's call.

Each new blocking finding is one story in the ENG-8 epic of
[RC_ROADMAP.md](RC_ROADMAP.md#epic-eng-8--early-access-primary-paths-before-platform-depth-p2p3), P3,
with no dependency of its own. RC-ENG-8.3's `Deps:` lists all three, in the story text and in §23.
They were created in the dispatcher with `task.create`, which files them as `proposed`; approving
them is the operator's call. RC-ENG-8.3 is running, and the dispatcher refuses `task.update` on a
running task, so its stored dependencies (30, through RC-ENG-8.14, at a read-only check at 20:04Z)
need the operator to add RC-ENG-8.15 to 8.20.

| Story       | Size | Finding                | What it closes                                                                                                       |
| ----------- | ---- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| RC-ENG-8.18 | S    | A3-1                   | Previewing "Any player" shows the scene the table sees.                                                              |
| RC-ENG-8.19 | M    | B3-1 (with A3-2, B3-5) | The Start dialog says visibly why a GM-only screen cannot be shown and how to share it; no field on the home screen. |
| RC-ENG-8.20 | M    | D3-2 (with D3-3)       | A press on a token reaches the token, not a point of interest's label; the seeded overlap goes.                      |

When all three land, RC-ENG-8.3 runs again: the five golden runs, the a11y gate, the four review
passes over every primary route at the three tiers on the new commit, and DEBT.md and
FEATURE-GAPS.md re-read.

## 8. Not checked

- Electron and Android shells; hosted CI.
- Themes other than the default, except through the contrast gate and the visual suite; Spanish
  and the pseudo-locale beyond the specs that assert them.
- A screen reader. Accessible names come from ARIA snapshots and axe.
- In the review: the camera QR join (no camera on this machine; the companion was joined over the
  fake LAN); Start session with no startable screen (B2-5); the builder's attack fields (C-16); the
  earlier ids listed as not re-checked in §4.
- The review is a model reviewer driving the app, with the high findings checked against source. It
  is not a usability test with people.

## 9. Reproducing the run, and integration

The review probes were scratch specs and are not committed; they are kept with the evidence. The
gates are committed. From a clean checkout, with `<dir>` a scratch path and `<port>` a free port:

```sh
git worktree add --detach <dir> d24d51bb3
cd <dir> && pnpm install --frozen-lockfile
cd <dir>/apps/gm-react
# five times, n = 1..5:
DNDTOOLS_E2E_PORT=<port> PLAYWRIGHT_JSON_OUTPUT_NAME=<dir>/golden-run<n>.json \
  pnpm exec playwright test tests/e2e/golden-path.spec.ts \
  --project=desktop-chromium --project=mobile-chromium --reporter=json,line
cd <dir> && DNDTOOLS_E2E_PORT=<port> pnpm a11y:gate
```

The DEBT.md and FEATURE-GAPS.md readings in §5 and §6 are static: the files at `d24d51bb3` read
against the source they cite.

This audit holds for the application tree of `d24d51bb3`. The commit after it adds only
documentation: this file, the roadmap stories, the run journal, and the two re-pointed
FEATURE-GAPS.md line anchors. Before citing this verdict for another commit, run
`git diff --stat d24d51bb3 <commit> -- . ':!docs' ':!state'`. Empty output means the same application
code; anything else means the gates run again.

## 10. The second run, on `b2ddfc1d`

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
run above found the three fixed, with the Start dialog's half of RC-ENG-8.16 still open (B3-1).

### The second run's medium and low findings

Their status on `d24d51bb3` is in §4.

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

## 11. The first run, on `ef42291b`

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

They became RC-ENG-8.5 to 8.14. The second run (§10) found A-1, B-1, C-1 and D-1 fixed, the DEBT entries
and limits resolved, and B-2 still present as B2-1.

### The first run's medium findings

Their status on `d24d51bb3` is in §4.

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
