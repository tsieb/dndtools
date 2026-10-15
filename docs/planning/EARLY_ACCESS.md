# Early-access exit audit (RC-ENG-8.3, the M2.5 gate)

Run on 2026-10-15 against **`ef42291b`**, the dispatcher's `loop/rc` when this task was claimed. It
carries all 20 stories RC-ENG-8.3 depends on, RC-ENG-9.3 among them. Its application tree is the one
[FRICTIONLESS.md](FRICTIONLESS.md) audited: `git diff --stat 93361a43 ef42291b -- . ':!docs' ':!state'`
prints nothing. The gates were still re-run for this audit on `ef42291b`, not carried over.

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

**M2.5 does not pass on `ef42291b`.** Gates 1 and 3 pass. Gates 2, 4 and 5 fail:

- the review found four high findings and no critical one: the palette sends a typed section name to
  the Import hub (A-1); the default Start session goes live on the DM-only home screen and tells the
  GM that players see it (B-1); on the rail at Fit the overflow footer covers the Initiative tracker's
  Next turn (B-2); and a PC built in the wizard lacks the ancestry bonus, hit dice, initiative and
  save proficiencies the wizard shows (C-1);
- four DEBT.md entries are open on primary surfaces: DEBT-2026-004 (Maps), -006 (Characters), -007
  (Characters and the companion in Spanish) and -008 (screens and Session in parchment);
- two primary FEATURE-GAPS rows carry a limit outside the §2.1 four: Characters (History has no
  rest, combat or level-up events) and the Player app (a push limit that `/play` never shows; the
  row is misattributed).

Each failure is filed as a story in [§7](#7-blocking-stories), added to RC-ENG-8.3's `Deps:` in the
roadmap, and created in the dispatcher as `proposed`. M2.5 is re-audited once they land.

This file records a failed gate. RC-ENG-8.3 is not complete while M2.5 fails: the story closes only
when a re-run on the application commit that carries RC-ENG-8.5 to 8.13 passes all five gates. Until
the operator copies those nine into the dispatcher's stored dependencies, nothing there holds this
task behind them ([§7](#7-blocking-stories)).

What holds: the five golden journeys (first run, prep, Standby to live, knowledge capture, a player
joining over the fake LAN) passed 50 of 50 times across ten profile-runs with no retry, and the axe
gate reports no critical or serious violation on 60 route-and-profile scans.

## 2. Golden paths

`golden-path.spec.ts` on `desktop-chromium` and `mobile-chromium` together, retries 0, five
consecutive runs, 2026-10-15 10:37:55–10:43:19Z: **78 passed, 0 failed, 0 flaky, 0 skipped in each
run** (39 per profile). The 78 are the five journeys and the detector and seeded-defect fixtures that
prove each journey assertion fails on a planted defect; the fixtures failed their planted defect as
designed every time. The highest retry index in all five JSON reports is 0.

The journeys assert, per RC-ENG-8.1 and RC-ENG-9.2, no console error or warning, no failed request,
no widget in an error state, no disabled control without a stated reason, no unrecoverable clip, and
the friction budgets. The machine's load average was 6.8–10.2 at the run starts; another dispatcher
worktree ran a containerized visual suite throughout.

## 3. Accessibility gate

`pnpm a11y:gate` on `ef42291b` (10:43:19–10:45:12Z, straight after run 5), exit 0:

- non-text contrast: 319 pair checks across five themes and 16 forced-colors remap checks passed;
- axe on both profiles: 61 passed, 1 skipped (the phone-only `/board` Layout test on
  `desktop-chromium`, skipped by design);
- report over 60 route-and-profile scans, all 60 worker artifacts present: 0 critical, 0 serious,
  1 moderate, 0 minor; 0 blocking; 0 approved known violations; "Gate result: PASS".

The moderate one is axe `region` on the phone live-session strip
(`div[data-testid="phone-session-strip"]`, `/session#combat`, `mobile-chromium`), FRICTIONLESS.md L12,
unchanged. The gate logs moderate impacts without blocking. The gate is clean by its own policy; it
does not scan parchment for text contrast, which is why DEBT-2026-008 (§5) does not show here.

## 4. The review

Three passes of the project's `ux-ui-reviewer` agent (`.claude/agents/ux-ui-reviewer.md`), one per
group of routes, each in its own detached worktree at `ef42291b` with its own dev server, and a
fourth for the one state group B missed (below). Each drove the app with the repo's Playwright
through scratch probe specs built on `tests/e2e/_helpers.ts`, at 1440×900 (desktop, mouse), 834×1112
(rail, touch) and 390×844 (phone, touch), default theme, English. The brief gave them the severity
scale above, told them to treat FRICTIONLESS.md's open items as known and re-check them, and
required every critical or high finding to reproduce in two separate runs. I re-read the source
behind each high finding before accepting it. The parent session restarted twice during the review,
and the passes resumed from their saved probes and evidence. Screenshots, ARIA snapshots, per-state
metrics and the four reports stay in the audit's scratch directory and are not committed.

| Group | Routes                                                                                                | Critical | High | Medium | Low |
| ----- | ----------------------------------------------------------------------------------------------------- | -------- | ---- | ------ | --- |
| A     | Onboarding, Command Center (fresh, seeded, demo, live), the shell, palette and Help, `/screens`       | 0        | 1    | 7      | 6   |
| B     | `/screen/:id` (home and four templates, view and edit), `/scene/:id`, `/session`, Session as a screen | 0        | 2    | 5      | 7   |
| C     | Characters and the builder, Atlas and the map editor, Notes, `/play` joined over the fake LAN         | 0        | 1    | 14     | 11  |
| BP    | `/scene/:id` template editor on the phone (completes group B; see below)                              | 0        | 0    | 5      | 6   |

Every route was loaded at all three tiers, with the gaps listed in [§8](#8-not-checked). No page
overflowed horizontally at any tier.

Group B's pass reached the template editor at `/scene/:id` on desktop and the rail only. Its phone
test hit its time limit in the step before, twice (11:17:18Z and 11:23:29Z). A fourth
`ux-ui-reviewer` pass completed that state on 2026-10-15 (11:39–11:59Z) on this branch's checkout,
whose application tree equals `ef42291b`. It ran at 390×844 with touch, on a seeded vault with a live
session, and added a fresh template scene. It covered the empty state, Apply a template, the Flow and
Canvas switch, Add, the tile Actions menu and inspector, move and resize by keyboard, touch drag and
the Transform tab, remove and undo, preview as a player, and Done. Before it, I ran a shorter probe
of the same state four times. Seven runs passed every step with no console or page error: my last
two and the reviewer's last five. The other three failed on probe selectors, not on the app: my first
two clicked the "Dice & Timers" filter instead of "Add Dice" and left the Add sheet open, and the
reviewer's first looked for the template picker in the wrong dialog. The pass found no critical or
high finding; its findings are BP-1 to BP-11 below.

### High

- **A-1 · palette, every tier · A section name opens the Import hub.** Typing "maps",
  "characters" or "notes" makes "Import…" the first, selected row, above Go to › Maps. Enter opens
  "Bring your existing material" and the route stays on `/`; on desktop, Escape from that dialog
  leaves focus on the body. The import row's keywords (`importHub.keywords`,
  `apps/gm-react/src/i18n/messages/en.ts:14-15`) name those sections, and the Actions group ranks
  above Go to (`apps/gm-react/src/app/CommandPalette.tsx:466-471`). NAVIGATION.md §4 makes the
  palette the phone's one inline route to every destination. Reproduced in 3 runs on each tier. The
  reviewer called it recoverable (the right row is one below) and left the blocking call to the
  audit; it is held high because it breaks the palette's standard use on the tier that relies on it.
- **B-1 · `/session` and the top bar · Start session goes live on the DM-only home screen.** Once
  the home screen exists, which a real first run creates, the Start dialog opens on "Continue DM
  screen?", because the resume target falls back to the home screen
  (`apps/gm-react/src/screens/session/useSessionView.ts:104`) and the dialog defaults to Continue
  (`apps/gm-react/src/screens/session/Lifecycle.tsx:303`). "Show DM screen to the table" is disabled
  with no reason. After confirming, the header reads "Players see DM screen" (the header names the
  active scene whatever its visibility, `Lifecycle.tsx:54-56`), the Stage's Everyone row is empty, and
  player preview says "Your DM has not shown a scene yet". The top-bar start does the same in one
  click. The seeded vault has a shareable scene that neither path uses. The golden path misses it
  because it goes live before the home screen exists, so its dialog opens in New. Reproduced 4 of 4
  (dialog) and 2 of 2 (top bar).
- **B-2 · `/screen/:id`, rail · The overflow footer covers Next turn.** On the default home screen
  during live combat at 834×1112 and the default Fit zoom, the Initiative tracker's Next turn is fully
  covered and the Timer's Start mostly covered by the "1 more line · Grow to fit" footer. Hit tests at
  the button's centre, top and bottom land on the body, the footer or the tile below. The footer is an
  opaque overlay on the body's bottom edge
  (`apps/gm-react/src/app/widgets/WidgetRenderSlot.tsx:417-432`). This is FRICTIONLESS.md L4, which
  was low; it now hides the combat tile's primary action, so it is raised. The golden-path detector
  passes it because the content can be scrolled into view inside the 160px tile. Reproduced 2 of 2;
  the desktop control was clean.
- **C-1 · Characters, every tier · The builder promises stats the PC does not get.** Identity lists
  ancestries as "Human +1 to all abilities" and "Dwarf +2 CON" under "Sets racial traits & ability
  bonuses", and point buy reads "scores 8–15 before racial bonuses"
  (`apps/gm-react/src/i18n/messages/en.ts:5252,5283`). No bonus is applied anywhere: the ancestry
  entries are display text (`apps/gm-react/src/app/charBuilder/data.ts:50-62`), the effective scores
  add nothing (`apps/gm-react/src/app/charBuilder/index.tsx:225-233`), and the core draft flow has no
  ancestry concept. A Dwarf built from the standard array is stored with CON 14. The Review card's
  INIT +1 becomes "—" on the sheet, a level 1 Fighter shows hit dice "0/0 d8", and saves carry no
  class proficiency. Reproduced 3 times (Human on every tier; Dwarf twice on desktop and phone).

### Medium

None of these blocks M2.5. They are recorded for the operator to file or fold into the stories in §7.

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

### Low

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
BP-11 the template picker's thumbnails clip their labels.

### FRICTIONLESS.md items, re-checked

L4 is raised to high (B-2). M2 is wider than recorded: A-8, B-5, C-12 and C-13 find the same
sub-44px targets outside edit mode and on Session, Maps, Characters and Notes. M7 is wider too: the
companion's rail sheet has 24×24 slot and condition controls, and "Clear Poisoned" is 24×24 at 390,
which the 48dp gate (`companion-frame.spec.ts`) does not catch. M5 still holds at 834, and the keys
typed before the GM taps the body are dropped. M1, M3, M6, L1, L2, L3, L5, L6, L10 and L12 still
hold as recorded; M3's two labels are asserted literally by `screen-editing.spec.ts:39-40`, so the
fix has to change that spec. None of these were found fixed.

## 5. DEBT.md

An entry counts as primary-path when its stated impact is visible to a GM or player on a primary
surface in a configuration the product ships (the default or a selectable theme, locale or system).

| Entry         | Severity | Primary surface                            | Status on `ef42291b`                                                                                                                                                                                                                                                                                                                                                                         | Counts |
| ------------- | -------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| DEBT-2026-004 | low      | Maps                                       | Part (b) is still open. Atlas's `screens/atlas/LayersPanel.tsx` hand-rolls its rows; only the editor dock (`app/map/dock/LayersPanel.tsx`) uses the DS `LayerRow`. The map import composes DS `Dialog`, `Stepper` and `Field`; the DS `ImportWizard` appears only in `screens/DsGallery.tsx`. The entry says RC-POL-1.9 picks it up; POL-1.9 has landed and its journal does not mention it. | yes    |
| DEBT-2026-006 | medium   | Characters                                 | Open. The core still holds every PC draft to the 27-point buy (`ABILITY_POINT_BUDGET`, `character-draft-flow.ts:77`), so a rolled spread cannot be finalized.                                                                                                                                                                                                                                | yes    |
| DEBT-2026-007 | medium   | Characters, the companion (Spanish)        | Open. Package vocabulary reaches Spanish strings untranslated.                                                                                                                                                                                                                                                                                                                               | yes    |
| DEBT-2026-008 | medium   | Screens, Session, scene editor (parchment) | Open. The parchment pair is still `#9a5418` on `#f0e0c8` (`styles/tokens/colors.css:165,168`); `session-polish.spec.ts:27` and the comments at `QuickPanel.tsx:217`, `CombatantItem.tsx:95` and `DiceTray.tsx:220` still name it.                                                                                                                                                            | yes    |
| DEBT-2026-009 | medium   | none visible                               | Open. Every content command copies every item. Not counted: the cost is internal, and RC-ENG-3.2's final capture breached none of the eleven budgets. This is a judgement; RC-ENG-7.3 should re-read it.                                                                                                                                                                                     | no     |

## 6. FEATURE-GAPS.md

The primary rows are Onboarding, Command Center, Palette and help, Screens, Scene editor, Board,
Session, Characters, Maps (Atlas), Notes (Knowledge) and Player app. A §2.1 limit is read as §2.1
item 2 defines it: a capability a primary surface offers, or the plan promises, that is unavailable
or incomplete.

Counted, outside the four:

- **Characters.** "History renders journal entries; automatic rest, combat and level-up history still
  needs event-source wiring" (`app/character/History.tsx:21`). RC-CHR-2.3 promised a feed of
  "level-ups, rests, combats, downtime"; only journal entries (downtime among them) appear.
- **Player app.** "Push delivery is unavailable" (`platform/capabilities.ts:166`). That copy renders
  only in the GM's Settings › Notifications (`screens/settings/Notifications.tsx:17`); nothing under
  `screens/play/` imports the push client. The limit is real, operator-owned (RC-CLD-2.3, §24) and
  not one of the four, but it belongs to the Settings row, which is not primary.

Not counted, with the reason:

| Row              | Limit                                                          | Why it is not a §2.1 limit                                                                             |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Palette and help | Authored guides ship in English                                | Localization residue; §2.3 gates the Spanish catalog at RC-1, not M2.5.                                |
| Scene editor     | Generated widgets need DM review                               | The §0.3 rule 9 guardrail (AI proposes, never disposes).                                               |
| Board            | Tile status notes and inspector tier descriptions stay English | Localization residue, as above.                                                                        |
| Board            | Phone list tiles keep their authored height and scroll inside  | RC-CAN-5.5's recovery design for content that outgrows a tile.                                         |
| Session          | Parchment phase control at 4.43:1                              | Counted once, as DEBT-2026-008.                                                                        |
| Session          | End the live session to return to Standby                      | The §1.6 D2 posture rule.                                                                              |
| Session          | Continuity prompts stay English                                | Localization residue.                                                                                  |
| Characters       | D&D Beyond JSON import diagnostics stay English                | Localization residue.                                                                                  |
| Maps (Atlas)     | The legacy per-map token array stays in state                  | Internal state; nothing on screen.                                                                     |
| Notes            | Live co-editing presence is not modeled                        | Neither offered nor promised; the roadmap's "presence" is the companion's `screens/play/Presence.tsx`. |
| Notes            | History keeps 50 revisions over 30 days                        | Retention bounds (RC-KNW-5.2), not a missing capability.                                               |

The English residues are listed for RC-ENG-7.3, which audits §2.3.

## 7. Blocking stories

Each failure is one story in the ENG-8 epic of [RC_ROADMAP.md](RC_ROADMAP.md#epic-eng-8--early-access-primary-paths-before-platform-depth-p2p3),
P3, with no dependency of its own. RC-ENG-8.3's `Deps:` now lists all nine, in the story text and in
§23. The stories were also created in the dispatcher with `task.create`, which files them as
`proposed`; approving them is the operator's call. RC-ENG-8.3 was running when its dependencies
changed, and the dispatcher refuses `task.update` on a running task, so its stored dependencies still
need the operator to pick up the roadmap change. A read-only look at the store at 12:00Z on
2026-10-15 shows RC-ENG-8.3 `running` with its original 20 dependencies and RC-ENG-8.5 to 8.13
`proposed`. Until the nine are added there, the dispatcher does not hold this task behind them,
and approving it would mark the exit audit done while the gate fails.

| Story       | Size | Finding                    | What it closes                                                                                                             |
| ----------- | ---- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| RC-ENG-8.5  | S    | A-1                        | A section name typed in the palette goes to that section.                                                                  |
| RC-ENG-8.6  | M    | B-1                        | Start session never goes live on a DM-only workspace, and the header says what the table sees.                             |
| RC-ENG-8.7  | M    | B-2 (FRICTIONLESS L4), B-7 | A tile's buttons are never under its overflow footer.                                                                      |
| RC-ENG-8.8  | L    | C-1, DEBT-2026-006         | A built PC carries the scores, hit dice, initiative and saves the builder shows, and a PC can be built from rolled scores. |
| RC-ENG-8.9  | M    | DEBT-2026-008              | Parchment's accent on its tint reaches 4.5:1.                                                                              |
| RC-ENG-8.10 | M    | DEBT-2026-007              | The two built-in system packages' vocabulary renders in Spanish.                                                           |
| RC-ENG-8.11 | S    | DEBT-2026-004 (b)          | Atlas uses the DS layer components; the import flow is reconciled with the DS wizard.                                      |
| RC-ENG-8.12 | M    | FEATURE-GAPS Characters    | Character history records rests, combats and level-ups.                                                                    |
| RC-ENG-8.13 | S    | FEATURE-GAPS Player app    | The push limit moves to the Settings row, where its copy renders.                                                          |

When all nine land, RC-ENG-8.3 runs again: the five golden runs, the a11y gate, the three reviews
on the new commit, and DEBT.md and FEATURE-GAPS.md re-read.

## 8. Not checked

- Electron and Android shells; hosted CI.
- Themes other than the default, except through the contrast gate; Spanish and the pseudo-locale
  beyond the specs that assert them.
- A screen reader. Accessible names come from ARIA snapshots and axe.
- In the review: the shortcut list behind Help (the probe's selector missed its row, so FRICTIONLESS
  L3's shortcut wording was not re-checked); dragging a placed map token, drawing fog, placing a POI
  in the editor, and a map import past its first step; the camera QR join.
- In the phone template-editor pass (BP): the rail and desktop again (group B covered them) and
  pinch zoom.
- The review is a model reviewer driving the app, with findings checked against source. It is not a
  usability test with people.

Because of the Help shortcut list and the unexercised map-editor actions above, the three-tier review
is not complete. The re-audit in §7 should cover them.

## 9. Reproducing the run, and integration

The review probes were scratch specs and are not committed; the gates are. From a clean checkout,
with `<dir>` a scratch path and `<port>` a free port:

```sh
git worktree add --detach <dir> ef42291b
cd <dir> && pnpm install --frozen-lockfile
cd <dir>/apps/gm-react
# five times, n = 1..5:
DNDTOOLS_E2E_PORT=<port> PLAYWRIGHT_JSON_OUTPUT_NAME=<dir>/golden-run<n>.json \
  pnpm exec playwright test tests/e2e/golden-path.spec.ts \
  --project=desktop-chromium --project=mobile-chromium --reporter=json,line
cd <dir> && DNDTOOLS_E2E_PORT=<port> pnpm a11y:gate
```

The DEBT.md and FEATURE-GAPS.md readings in §5 and §6 are static: the files at `ef42291b` read against
the source they cite.

This audit holds for the application tree of `ef42291b`. On top of it the branch adds only
documentation: this file, the planning-index link, the roadmap stories, the run journal, and one
re-anchored FEATURE-GAPS.md limit (the Shells row cites a roadmap line that the new stories moved
from 4109 to 4206; `pnpm feature-audit` reports 0 stale anchors after it). Before
citing this verdict for another commit, run `git diff --stat ef42291b <commit> -- . ':!docs' ':!state'`.
Empty output means the same application code; anything else means the gates run again.
