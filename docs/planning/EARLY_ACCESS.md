# Early-access exit audit (RC-ENG-8.3, the M2.5 gate)

Re-run on 2026-10-16 against **`b2ddfc1d`**, the dispatcher's `loop/rc` after the ten stories filed
by the first run (RC-ENG-8.5 to 8.14) landed. Each of the ten is `succeeded` in the dispatcher's
store and its recorded head is an ancestor of `b2ddfc1d`. The first run, on `ef42291b` on 2026-10-15,
did not pass; [§10](#10-the-first-run-on-ef42291b) keeps its result. Everything in §1 to §9 was
measured on `b2ddfc1d`, nothing was carried over from the first run.

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

**M2.5 does not pass on `b2ddfc1d`.** Gates 1, 3, 4 and 5 pass. Gate 2 fails: the review found one
critical and two high findings.

- **C2-1 (critical).** On the rail and the phone the level-up wizard is wider than the sheet's
  column, so Next and Discard level-up sit past the right edge of a region that cannot be scrolled
  by touch. A touch user cannot level up a character, and the companion sends players to the DM's
  sheet to do it.
- **B2-1 (high).** B-2 from the first run is still there in a new form: at Fit during live combat,
  the Initiative tracker's Next turn cannot be tapped where it rests on the rail, and now on desktop
  as well.
- **B2-2 (high).** Nothing in the app lets the GM make a screen visible to players. Every new screen
  is DM-only, so a GM who builds a screen and starts a session shows the table nothing; only seeded
  scenes can ever be shown.

The first run's other four highs are fixed: A-1 (palette), B-1 (Start session on the DM-only home
screen), C-1 (the builder's stats) and D-1 (map import). Of the four DEBT entries it counted, -006,
-007 and -008 are resolved and -004 is down to part (c), which §5 does not count (a stated
judgement); the two FEATURE-GAPS limits it counted are gone.

The three findings are filed as RC-ENG-8.15 to 8.17 ([§7](#7-blocking-stories)), added to
RC-ENG-8.3's `Deps:` in the roadmap and created in the dispatcher as `proposed`. RC-ENG-8.3 is not
complete: the story closes only when a re-run on an application commit carrying those three passes
all five gates.

What holds: the five golden journeys passed 50 of 50 times across ten profile-runs with no retry,
and the axe gate reports no critical or serious violation on 60 route-and-profile scans.

## 2. Golden paths

`golden-path.spec.ts` on `desktop-chromium` and `mobile-chromium` together, retries 0, five
consecutive runs, 2026-10-16 16:16:58–16:21:55Z: **78 passed, 0 failed, 0 flaky, 0 skipped in each
run** (39 per profile). The 78 are the five journeys (first run, prep, Standby to live, knowledge
capture, a player joining over the fake LAN) and the detector and seeded-defect fixtures that prove
each journey assertion fails on a planted defect. The highest retry index in all five JSON reports
is 0. The machine's load average was 1.7–4.1 at the run starts.

The journeys assert, per RC-ENG-8.1 and RC-ENG-9.2, no console error or warning, no failed request,
no widget in an error state, no disabled control without a stated reason, no unrecoverable clip, and
the friction budgets. They passed with B2-1 and B2-2 present: the overflow detector accepts content
that scrolls into view inside its tile, and the live journey goes live on a seeded shareable scene.

## 3. Accessibility gate

`pnpm a11y:gate` on `b2ddfc1d` (16:21:55–16:23:24Z, straight after run 5), exit 0:

- non-text contrast: 319 pair checks across five themes and 16 forced-colors remap checks passed;
- axe on both profiles: 61 passed, 1 skipped (the phone-only `/board` Layout test on
  `desktop-chromium`, skipped by design);
- report over 60 route-and-profile scans, all 60 worker artifacts present: 0 critical, 0 serious,
  1 moderate, 0 minor; 0 blocking; 0 approved known violations; "Gate result: PASS".

The moderate one is axe `region` on `/session#combat` on `mobile-chromium`, the same rule and scan as
the first run (FRICTIONLESS.md L12). The gate logs moderate impacts without blocking.

## 4. The review

Four passes of the project's `ux-ui-reviewer` agent (`.claude/agents/ux-ui-reviewer.md`), one per
group of routes, each in its own detached worktree at `b2ddfc1d` with its own dev server, run in
parallel after the gates (about 16:25–17:00Z). Each drove the app with the repo's Playwright through
scratch probe specs built on `tests/e2e/_helpers.ts`, starting from the first run's probes, at
1440×900 (desktop, mouse), 834×1112 (rail, touch) and 390×844 (phone, touch), default theme,
English. The shared brief gave them the severity scale above, the first run's findings and
FRICTIONLESS.md's open items to re-check, required the first run's highs to be re-tested with their
original reproduction, and required every critical or high finding to reproduce in two separate
runs. I re-read the source behind each critical and high finding before accepting it. Screenshots,
ARIA snapshots, per-state metrics and the reports stay in the audit's scratch directory and are not
committed.

| Group | Routes                                                                                                                                 | Critical | High | Medium | Low |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---- | ------ | --- |
| A     | Onboarding, Command Center (fresh, seeded, demo, live), the shell, palette and Help with the shortcut list, `/screens`                 | 0        | 0    | 3      | 6   |
| B     | `/screen/:id` (home and four templates, view and edit), `/scene/:id` and the template editor on all three tiers, `/session`            | 0        | 2    | 4      | 2   |
| C     | Characters, the builder and level-up, character History, Notes, `/play` joined over the fake LAN                                       | 1        | 0    | 1      | 2   |
| D     | Atlas and its Layers panel, the map editor (token drag, fog, POI, Generate, Assets), image and external-scene import, `.dd2vtt` export | 0        | 0    | 5      | 6   |

The counts are the re-run's new ids; B2-1 is the first run's B-2 still present. Every route was
loaded at all three tiers, with the gaps listed in [§8](#8-not-checked). No page overflowed
horizontally at any tier. The only console message any probe saw is D2-7's React ref warning
when the map editor's Generate panel opens; there was no page error.

### The first run's highs, re-tested

| Id  | Status        | Evidence                                                                                                                                                                                                              |
| --- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-1 | fixed         | 2 runs × 3 tiers. "maps", "characters", "notes", "session", "screens" each select their Go to row and Enter lands on the route; "import" still opens the Import hub. Exact and prefix label matches now rank first.   |
| B-1 | fixed         | 3 runs × 3 tiers. With the home screen present, both starts go live on the shareable Harbor of Saltreach; header, Stage and player preview agree. With every scene DM-only the header says "Players see nothing yet". |
| B-2 | still present | Now B2-1, below.                                                                                                                                                                                                      |
| C-1 | fixed         | 26 PCs built over 2 runs on all tiers (Human and Dwarf, standard array, point buy, roll): stored scores, INIT, hit dice and save proficiencies match the Review card. A rolled Dwarf with INT 7 finalizes.            |
| D-1 | fixed         | 2 runs × 3 tiers. After Done the open editor draws the imported image and shows no missing-image notice; the bytes are stored before `map.import-asset` is dispatched (`useImportMap.ts:212-230`).                    |

### Critical

- **C2-1 · Characters › Level up, rail and phone · Next and Discard level-up are off-screen.** On a
  character sheet's Level up tab the wizard renders 609px wide. The phone column is 362px and the
  rail column 490px, so Next lands at x 567–623 at 390 and 913–969 at 834, and Discard level-up just
  left of it. Both sit inside ancestors with `overflow-x: hidden` (`main#main-content` on the phone,
  the sheet section on the rail), which a finger cannot scroll, and the stepper's steps are not
  buttons. A touch user can choose a class and then cannot go on, finish or discard; the draft
  persists, so the tab stays on it. The companion's Level up tab says "Your DM can level you up from
  their sheet", so this sheet is the only path. The root is
  `<div style={{ maxWidth: 680, margin: '0 auto' }}>` with no `minWidth: 0`
  (`apps/gm-react/src/app/character/LevelUp.tsx:282`), so it grows to the stepper's unwrapped width
  (`ds/components/core/Stepper.tsx:118`, `whiteSpace: 'nowrap'`) and the stepper's own
  `overflowX: 'auto'` (`LevelUp.tsx:288`) never engages. Reproduced 4 of 4 (two runs on each touch
  tier); desktop is clean. None of these files changed since `ef42291b`; the first run never opened
  the wizard. I re-read the three lines and the rects in the probe log; they agree.

### High

- **B2-1 · `/screen/:id`, rail and desktop · Next turn cannot be tapped where it rests at Fit.**
  RC-ENG-8.7 moved the overflow footer into its own row and gave Grow to fit a 44px minimum on every
  tier (`apps/gm-react/src/app/widgets/WidgetRenderSlot.tsx:494-501`). In a tile about 140px tall
  that leaves the Initiative body 32px on the rail and 46px on desktop. On the demo vault's live home
  screen at Fit, Next turn is scrolled out of the body ("4 more lines" on the rail, "3 more lines" on
  desktop): taps at its box land on the tile body, Grow to fit or the Map tile below, and the Timer's
  Start sits under its body's "1 more line". The first run's desktop control was clean, so desktop
  is a regression. A swipe inside the tile or Grow to fit reaches it, and on desktop the side panel
  has its own Next turn. `tile-overflow-controls.spec.ts` passes because it scrolls each button into
  view before hit-testing. Held high, as B-2 was, because it hides the combat tile's primary action
  on the default home screen at the default zoom. Reproduced 2 of 2 on each of the rail and
  desktop; the phone was clean.
- **B2-2 · Screens and Session, every tier · A GM cannot show players a screen they made.** Every
  new screen is created `dm-only` (`apps/gm-react/src/screens/screen/useScreens.ts:194`), and no
  surface changes a scene's visibility: scene details edits name, description, tags and background
  (`screens/sceneEditor/useSceneCommands.ts:15-20`, `SceneMetaPanel.tsx`); the inspector's visibility
  control is per tile; the Stage's Everyone select lists only shareable scenes
  (`app/ProjectionControl.tsx:228-231`). On a fresh vault after a real onboarding, the first-session
  guide's "New screen from a template" makes a DM-only screen; Start session then offers only that
  screen with "Show … to the table" unchecked and disabled (its reason is a hover-only `title`,
  `screens/session/Lifecycle.tsx:401`), the header reads "Players see nothing yet", and a player's
  preview reads "Your DM has not shown a scene yet". The core already accepts `visibility` on
  `scene.update-metadata` (`packages/core/src/commands/scene-meta.ts:112`); nothing in the app sends
  it. The first run missed this because the seeded vault's Harbor of Saltreach is shareable, and
  RC-ENG-8.6's fix made the header honest, which exposed it. Reproduced 2 of 2 on desktop and on the
  phone; the rail shares the code path and was not run for this state. I re-read the files above and
  searched the app for any dispatch carrying a scene visibility; there is none.

### Medium

None of these blocks M2.5. They are recorded for the operator to file or fold into the stories in §7.

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

### Low

A2-4 Send feedback always shows "If the form did not open…" because `window.open(…, 'noopener')`
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

### The first run's other findings, re-checked

Still present, at their recorded severity: A-2 to A-14; B-3, B-5, B-6, B-8, B-11 to B-14; C-2 to
C-10, C-12 to C-22, C-24 to C-26; BP-1 (now confirmed on all three tiers), BP-2 to BP-6, BP-8, BP-10,
BP-11; D-2 to D-13. Changed: B-7 is B2-3 above; C-11 is lowered to low (long map names now truncate
with an ellipsis, and tool hints wrap in the options bar); B-4's state (no home screen) can no
longer be reached, because onboarding provisions the home screen; BP-9 did not reproduce. Not
re-checked: B-9, B-10, BP-7, C-23. The first run's descriptions are kept in
[§10](#10-the-first-run-on-ef42291b).

FRICTIONLESS.md: L4 is still held high (B2-1). M2 is wider again: the Assets and Generate pickers
and the Level up wizard's controls join the sub-44px targets on touch. M1, M3, M5, M6, M7, L1, L2,
L3, L6, L10 and L12 still hold as recorded. L5 changed: on the phone Snap moved into More editing
tools, and no clip was seen. None was found fixed.

## 5. DEBT.md

An entry counts as primary-path when its stated impact is visible to a GM or player on a primary
surface in a configuration the product ships (the default or a selectable theme, locale or system).

| Entry         | Severity | Status on `b2ddfc1d`                                                                                                                                                                                                                                                                                                                                                                                    | Counts |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| DEBT-2026-004 | low      | Open, re-scoped by RC-ENG-8.11 to part (c): the generator category and preset pickers (`app/map/generate/GeneratePanel.tsx`) and the asset category pickers (`app/map/dock/AssetsPanel.tsx`) are hand-rolled `aria-pressed` buttons rather than the DS `SegmentedControl`. Part (b) is resolved: Atlas composes `LayerRow` inside `LayerPanel`, and the entry records why the composed import conforms. | no     |
| DEBT-2026-009 | medium   | Open. Every content command copies every item. Not counted: the cost is internal, and RC-ENG-3.2's final capture breached none of the eleven budgets. This is a judgement; RC-ENG-7.3 should re-read it.                                                                                                                                                                                                | no     |

DEBT-2026-004 (c) is a judgement too. The first run counted the entry for part (b), a hand-rolled
panel on Atlas's main view, and left (c) uncounted. The two panels left are optional docks inside the
map editor; their buttons work and carry `aria-pressed`, and review D found them consistent with
the surrounding chrome on screen. Their real defect is size: under 44px on touch, which is
FRICTIONLESS M2, recorded in §4 and not part of this entry. If the operator reads (c) as primary-path,
gate 4 fails on it.

DEBT-2026-006, -007 and -008, which the first run counted, are under Resolved, closed by RC-ENG-8.8,
8.10 and 8.9. Checked in source: `character.create-draft` takes `abilityScorePool`
(`packages/core/src/commands/character.ts:240`), `vocabularyValues()` localizes the built-in
packages (`apps/gm-react/src/i18n/vocabulary.tsx:65`), and parchment's accent is `#945016`, 4.74:1
on its tint (`apps/gm-react/src/styles/tokens/colors.css:165`), which the contrast step of the a11y
gate passed.

## 6. FEATURE-GAPS.md

The primary rows are Onboarding, Command Center, Palette and help, Screens, Scene editor, Board,
Session, Characters, Maps (Atlas), Notes (Knowledge) and Player app. A §2.1 limit is read as §2.1
item 2 defines it: a capability a primary surface offers, or the plan promises, that is unavailable
or incomplete.

None is counted. The first run's two are gone: the Characters History limit left with RC-ENG-8.12
(History now records rests, combats and level-ups; review C saw all three on every tier), and the
push limit moved to the Settings row with RC-ENG-8.13, so the Player app row carries no limit.
`pnpm feature-audit` reports 46 declared limits, 0 stale. The primary rows' remaining limits, with
the reason each is not a §2.1 limit:

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

The English residues are listed for RC-ENG-7.3, which audits §2.3. B2-2 is not a FEATURE-GAPS row:
the Screens row claims sharing through projection and makes no visibility claim, so the gap is a
review finding, not a declared limit.

## 7. Blocking stories

The first run's ten stories, RC-ENG-8.5 to 8.14, are all `succeeded` and integrated, and the re-run
above confirms what each was to close, with one exception: RC-ENG-8.7's footer change cleared the
overlay but left Next turn out of reach at rest (B2-1).

Each new blocking finding is one story in the ENG-8 epic of
[RC_ROADMAP.md](RC_ROADMAP.md#epic-eng-8--early-access-primary-paths-before-platform-depth-p2p3), P3,
with no dependency of its own. RC-ENG-8.3's `Deps:` lists all three, in the story text and in §23.
They were created in the dispatcher with `task.create`, which files them as `proposed`; approving
them is the operator's call. RC-ENG-8.3 is running, and the dispatcher refuses `task.update` on a
running task, so its stored dependencies (30, through RC-ENG-8.14, at a read-only check at 17:00Z)
need the operator to add these three.

| Story       | Size | Finding          | What it closes                                                                                  |
| ----------- | ---- | ---------------- | ----------------------------------------------------------------------------------------------- |
| RC-ENG-8.15 | M    | B2-1 (B-2, L4)   | The combat tile's actions can be tapped at Fit without scrolling, on every tier.                |
| RC-ENG-8.16 | M    | B2-2 (with A2-2) | The GM can make a screen visible to players, and the Start dialog says how when it is not.      |
| RC-ENG-8.17 | S    | C2-1             | The level-up wizard fits the rail and phone columns, so Next, Finish and Discard can be tapped. |

When all three land, RC-ENG-8.3 runs again: the five golden runs, the a11y gate, the four review
passes over every primary route at the three tiers on the new commit, and DEBT.md and
FEATURE-GAPS.md re-read.

## 8. Not checked

- Electron and Android shells; hosted CI.
- Themes other than the default, except through the contrast gate; Spanish and the pseudo-locale
  beyond the specs that assert them.
- A screen reader. Accessible names come from ARIA snapshots and axe.
- In the review: the camera QR join (no camera on this machine; the companion was joined over the
  fake LAN); B2-2 on the rail (same code path as desktop and phone); the first run's B-9, B-10,
  BP-7 and C-23.
- The review is a model reviewer driving the app, with the blocking findings checked against
  source. It is not a usability test with people.

## 9. Reproducing the run, and integration

The review probes were scratch specs and are not committed; they are kept with the evidence. The
gates are committed. From a clean checkout, with `<dir>` a scratch path and `<port>` a free port:

```sh
git worktree add --detach <dir> b2ddfc1d
cd <dir> && pnpm install --frozen-lockfile
cd <dir>/apps/gm-react
# five times, n = 1..5:
DNDTOOLS_E2E_PORT=<port> PLAYWRIGHT_JSON_OUTPUT_NAME=<dir>/golden-run<n>.json \
  pnpm exec playwright test tests/e2e/golden-path.spec.ts \
  --project=desktop-chromium --project=mobile-chromium --reporter=json,line
cd <dir> && DNDTOOLS_E2E_PORT=<port> pnpm a11y:gate
```

The DEBT.md and FEATURE-GAPS.md readings in §5 and §6 are static: the files at `b2ddfc1d` read
against the source they cite.

This audit holds for the application tree of `b2ddfc1d`. The audit branch is rebased onto it and
adds only documentation: this file, the planning-index link, the roadmap stories, the run journal,
and one re-anchored FEATURE-GAPS.md limit (the Shells row cites the roadmap line of RC-PLT-1.1,
which the new stories move). Before citing this verdict for another commit, run
`git diff --stat b2ddfc1d <commit> -- . ':!docs' ':!state'`. Empty output means the same application
code; anything else means the gates run again.

## 10. The first run, on `ef42291b`

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

They became RC-ENG-8.5 to 8.14. The re-run above found A-1, B-1, C-1 and D-1 fixed, the DEBT entries
and limits resolved, and B-2 still present as B2-1.

### The first run's medium findings

Their status on `b2ddfc1d` is in §4.

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
