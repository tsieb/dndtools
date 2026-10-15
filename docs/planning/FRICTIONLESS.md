# Frictionless exit audit (RC-ENG-9.3, the M2.6 gate)

Run on 2026-10-14 and re-run on 2026-10-15. The gates are bound to **`93361a43`**: `loop/rc`
`ad2812a9` plus this task's documentation commits. `ad2812a9` is the operator's merge of
`origin/loop/rc` `effe44cb` (v0.4.4) into the dispatcher's `loop/rc`, so it carries all 45 stories
RC-ENG-9.3 depends on, RC-CAN-8.6, RC-CAN-8.7, RC-SES-7.3 and RC-UX-6.5 among them. Its `apps/`,
`packages/` and `tests/` are byte-identical to the two commits audited on 2026-10-14: `7008d590`
(RC-POL-1.2 integrated over `effe44cb`) and `d18a4272` (an earlier candidate of this task, since
dropped). Outside `docs/` and `state/`, the one other difference is
`scripts/validate/feature-audit.ts`, RC-DOC-1.1's FEATURE-GAPS checker, which none of these gates
runs; `git diff --stat d18a4272 93361a43 -- . ':!docs' ':!state'` lists only that file. The
commit after `93361a43` changes only this file and the run journal. The review probes in §4 ran
against a `7008d590` checkout. The budget runs, the a11y gate and the story-spec run in §2, §3 and
§6 ran on `7008d590`, again on `d18a4272`, and a third time on `93361a43`. See §8 for
integration.

Method, the same as the [2026-09-29 reviews](friction-review-2026-09-29/README.md): the dev server
driven by the repo's Playwright (Playwright MCP was not used) at 1440×900 (desktop), 834×1112 with
touch (rail) and 390×844 with touch (phone); keyboard-only passes; action counts per job; the
`design-polish` and `design:design-critique` checklists applied to the captures. Default theme,
English. Every gate below ran locally on one machine, not on hosted CI. Screenshots, ARIA snapshots
and per-state metrics live in the audit session's scratch directory and are not committed. File
references below hold for all three commits.

Severity, as in the 2026-09-29 reviews: **critical** blocks or silently breaks a primary path;
**high** means a new GM or player will fail or misread; **medium** is friction or inconsistency;
**low** is polish.

## 1. Verdict

**M2.6 passes on `93361a43`.** No critical or high finding remains on the five surfaces. Every
budget in [FRICTION_BUDGETS.md](FRICTION_BUDGETS.md) held on five consecutive runs on both
profiles, and `pnpm a11y:gate` passed on the same commit.

Of the 90 findings from 2026-09-29, 74 are fixed (6 of them on the strength of the story's own
spec), 13 are partly fixed with a smaller residual recorded in §5, 2 stay open by decision (PLY-11
and KNW-18, frozen by §1.6 D6 until the RC-UX-5.5 navigation review), and 1 low item (CAN-16) was
not re-checked. The re-run found 19 remaining items: 7 medium and 12 low. None meets
the bar for a blocking story.

The jobs the reviews priced now cost what the budgets say. A GM finishes onboarding in 4 clicks or
9 keys (was 8 or 37), captures a note in 2 actions (was 4 clicks before the first character),
places a party HP list in 6 clicks (was 18 across three surfaces), and adds, moves and resizes a
tile in 4 actions (resize was impossible). A joined player marks damage in 2 taps (the sheet was
read-only), and Start session puts the shared scene on every joined stage in 1 action (players saw
"Nothing is being shown yet"). Help opens full height from a button labelled Help on every tier;
on desktop it used to be a 26-pixel strip.

What still rubs is wording and touch size, not paths. The Command Center hub still says "scene" for
what the rest of the app now calls a screen, the screen edit toolbar does too, and on the 834px rail
the edit-mode controls and the companion's dice modifiers are 24–34px targets. On split-pane widths
(834 and 1024) a new note opens with focus on its section rather than its body, so capture costs
one extra tap there; the two budget profiles do not cover that width.

## 2. Budgets against FRICTION_BUDGETS.md

Five consecutive runs of the five specs that assert the budgets (`golden-path`,
`friction-budgets`, `companion-sheet`, `widget-quick-builder`, `table-view`) on `desktop-chromium`
and `mobile-chromium` together, retries 0, on `93361a43` (2026-10-15 09:40–09:54Z): **178 passed,
0 failed, 0 flaky, 0 skipped in each run**. Counts come from the `friction` annotations `assertWithin`
records on a passing journey. Only the application journeys are listed; the boundary fixtures
consume the full allowance by construction. The same five runs on `7008d590` (2026-10-14
06:58–07:12Z) and on `d18a4272` (08:01–08:15Z) also passed 178 of 178. Every `friction` annotation
(80 per run: project, test, budget, count) was identical across all fifteen runs.

| Budget ID           | Ceiling | desktop-chromium, runs 1–5 | mobile-chromium, runs 1–5 | 2026-09-29                          |
| ------------------- | ------- | -------------------------- | ------------------------- | ----------------------------------- |
| `onboarding-clicks` | 5       | 4 · 4 · 4 · 4 · 4          | 4 · 4 · 4 · 4 · 4         | 8 clicks                            |
| `onboarding-keys`   | 12      | 9 · 9 · 9 · 9 · 9          | 9 · 9 · 9 · 9 · 9         | 37 keys                             |
| `capture-note`      | 2       | 2 · 2 · 2 · 2 · 2          | 2 · 2 · 2 · 2 · 2         | 4 clicks before the first character |
| `quick-track`       | 6       | 6 (both recipes), ×5       | 6 (both recipes), ×5      | 18 clicks, three surfaces           |
| `tile-layout`       | 4       | 4 · 4 · 4 · 4 · 4          | 4 · 4 · 4 · 4 · 4         | resize impossible                   |
| `player-damage`     | 2       | 2 · 2 · 2 · 2 · 2          | 2 · 2 · 2 · 2 · 2         | impossible (read-only sheet)        |
| `help`              | 1       | 1 on all 21 journeys, ×5   | 1 on all 21 journeys, ×5  | 1 click; unreadable on desktop      |
| `table-scene`       | 1       | 1 · 1 · 1 · 1 · 1          | 1 · 1 · 1 · 1 · 1         | stage stayed empty                  |

The 21 Help journeys are the 20 GM shell routes in the spec's inventory plus entity details. The
seeded-defect tests (one extra dialog) failed their budget as designed in every run. Only the two
onboarding rows have slack; the other six sit at their ceiling, so any added step on those jobs
fails the browser gate. On `7008d590` the review probes ran alongside runs 2–5, so those runs
passed under extra load. The later runs had no probes running alongside them.

Jobs counted by hand outside the table, desktop unless noted:

| Job                                        | Actions                                                                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Add Dice, move, resize, undo, back to play | 7: Edit layout, Add, Add Dice, drag, Shift+↓, Undo, Done                                                                                       |
| Same from the palette in edit mode         | Ctrl+K, type, pick the row; the add is undoable and sized like the seeded tiles                                                                |
| Capture a note by keyboard                 | Ctrl+N, title, Enter; focus lands in the body                                                                                                  |
| Quick-track party list by keyboard         | 39 keys, 33 of them Tab (20 to reach "Build your own", last in the gallery); the probe focused Edit layout and Add rather than tabbing to them |
| Capture a note at 834 or 1024 wide         | 3: New note, Enter, then a tap or click into the body (see M5)                                                                                 |
| Find Help on a phone                       | 1: the labelled Help row above the tab bar                                                                                                     |

## 3. Accessibility gate

`pnpm a11y:gate` on `93361a43` (2026-10-15 09:54–09:55Z, after the budget runs), exit 0. Two runs on
`d18a4272` (2026-10-14 08:15–08:16Z and 08:49–08:51Z) gave the same result:

- non-text contrast: 319 pair checks across five themes (tavern, parchment, scholar, dungeon,
  high-contrast) and 16 forced-colors remap checks passed;
- axe on both profiles: 61 passed, 1 skipped (the phone-only `/board` Layout test, skipped on
  `desktop-chromium` by design);
- report over 60 route-and-profile scans: 0 critical, 0 serious, 1 moderate, 0 minor; 0 blocking;
  0 approved known violations; "Gate result: PASS". The moderate one is axe `region` on the phone
  live-session strip at `/session#combat` (L12 in §5). The gate logs moderate impacts and does not
  block on them.

The earlier gate on `7008d590` also exited 0 with 61 passed and 1 skipped, but its report merged
only 5 scans. The worker artifacts it reads (`apps/gm-react/test-results/a11y/`) were partly
cleared, most likely by this audit's probe runs in the same checkout. So that report's
"0 moderate" covered 5 scans, not 60. The later reports are complete.

The keyboard pass found a visible focus ring at every one of 40 Tab stops on `/`, `/board`,
`/knowledge`, `/campaign`, `/graph` and `/screens`, at 1440 and 390. With
`prefers-reduced-motion: reduce`, `document.getAnimations()` reported no running animation on `/`,
`/board`, `/session` or `/graph`.

## 4. The five reviews, re-run

Status per original finding. "Fixed" is observed on `7008d590` (the same application tree as
`93361a43`) unless marked "(spec)", which means
it rests on the story's own acceptance spec passing in the §6 regression run rather than on a
probe of this audit. Residuals point to §5.

### Onboarding and help ([onboarding.md](friction-review-2026-09-29/onboarding.md))

| Finding        | Status | Now                                                                                                                                                              |
| -------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ONB-1 critical | Fixed  | Help dialog 540×852 at 1440, 540×1064 at 834, 342×796 at 390, with the guide, Guides and What's new readable.                                                    |
| ONB-2 critical | Fixed  | Three steps; Skip on step 1; "Enter a campaign name to continue." in visible text; no inner scroll at any width.                                                 |
| ONB-3 high     | Fixed  | Standard preselected and Recommended (badge on one line); the three cards list different hidden sections; Beginner hides New widget, Extensions and Permissions. |
| ONB-4 high     | Fixed  | The name typed in step 1 shows in the sidebar chip and the hero.                                                                                                 |
| ONB-5 high     | Fixed  | No party step; the guide's "Add your party" row offers Add players and Import characters.                                                                        |
| ONB-6 high     | Fixed  | Ready is one paragraph and "Open the Command Center"; focus lands on the guide's first row inside `#main-content`.                                               |
| ONB-7 high     | Partly | The guide and the empty Scenes card offer "New screen from a template". Residual M1.                                                                             |
| ONB-8 high     | Fixed  | Getting started reads "1 of 6 done" on a fresh named vault and "3 of 6" on the seeded one.                                                                       |
| ONB-9 medium   | Partly | No code spans or backticks. Residual L1.                                                                                                                         |
| ONB-10 medium  | Partly | Labelled "Help" on every tier. Residual L2.                                                                                                                      |
| ONB-11 medium  | Fixed  | Import hub offered by the guide, Help (opened there), the palette ("Import…") and Settings › Vault connections.                                                  |
| ONB-12 medium  | Fixed  | The switcher opens with one sentence on vaults, the demo row first, and "New campaign".                                                                          |
| ONB-13 medium  | Fixed  | No AI step.                                                                                                                                                      |
| ONB-14 medium  | Fixed  | No display face below 24px and no em dash or exclamation mark in the three steps.                                                                                |
| ONB-15 medium  | Fixed  | An empty vault's Session reads "No recent changes to review."                                                                                                    |
| ONB-16 low     | Fixed  | Spotlights for a second screen, Session, a map, a player and the campaign chip (`packages/core/src/state/onboarding.ts:2158`).                                   |
| ONB-17 low     | Fixed  | Phone guides carry no keyboard sentences; larger tiers say "With a keyboard, press Ctrl+K (⌘K on a Mac)".                                                        |
| ONB-18 low     | Fixed  | The Space row reads "Pick up the focused widget so the arrow keys move it".                                                                                      |

The Ready step's storage paragraph names Cloud-Enhanced and says the vault stays end-to-end
encrypted. That reads as two modes at once, but it is the disclosure ADR-042 requires
(`docs/adr/042-tiered-vault-privacy-default.md`), so it is not a finding.

### Canvas and screens ([canvas.md](friction-review-2026-09-29/canvas.md))

| Finding        | Status         | Now                                                                                                                                   |
| -------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| CAN-1 critical | Fixed          | After a mouse drag and Undo, every frame's position matches the layout in state.                                                      |
| CAN-2 critical | Fixed          | Corner handle on hover, Resize in the menu, Shift+↓ grows a tile 160→180, Small/Medium/Large on the phone.                            |
| CAN-3 high     | Fixed          | Hover outline, a grip in the title bar, and a right-click opens the tile menu at the pointer.                                         |
| CAN-4 high     | Partly         | `/scene/<screen id>` redirects to `/screen/<id>?edit=1`; no second editor door; one title. Residual M3.                               |
| CAN-5 high     | Fixed          | Widgets first, "More ways to add" last; every pick button named ("Add Dice"); adding closes the panel and focuses the new tile.       |
| CAN-6 high     | Partly         | Phone Edit layout keeps the list with Move up/down and size presets; no control past the viewport. Residual L5.                       |
| CAN-7 high     | Fixed          | Space, →, →, Escape, Ctrl+Z puts the tile back where it started.                                                                      |
| CAN-8 high     | Fixed          | Palette "Add tile: Dice" is undoable, 240×160 like the seeded tiles, announced "size 240 by 160".                                     |
| CAN-9 high     | Fixed          | Smallest rendered tile text at Fit on the rail is 12px.                                                                               |
| CAN-10 medium  | Partly         | The library shows "DM screens", then "Player scenes"; scene cards moved behind their own button. Residual M1.                         |
| CAN-11 medium  | Fixed (spec)   | `screens-library.spec.ts`: a Blank screen names itself; the flow menu reads in Spanish. The selection chip reads "Party HP · Custom". |
| CAN-12 medium  | Fixed          | "Lamplight — DM screen", "Lamplight — Screens".                                                                                       |
| CAN-13 medium  | Fixed          | The phone list carries no per-tile "DM only" badge.                                                                                   |
| CAN-14 medium  | Fixed (spec)   | `canvas-cues.spec.ts`: drag by the grip with a drop indicator, a docked history toolbar, right-click on flow tiles.                   |
| CAN-15 low     | Fixed (spec)   | `board-layouts.spec.ts` (RC-CAN-8.8).                                                                                                 |
| CAN-16 low     | Not re-checked | The Detail preset was not opened; see §7.                                                                                             |
| CAN-17 low     | Partly         | The `StatusDot` `<style>` is gone (RC-ENG-9.1). A spotlight during edit was not re-checked; see §7.                                   |

### The widget builder ([widgets.md](friction-review-2026-09-29/widgets.md))

| Finding        | Status       | Now                                                                                                                                                                                 |
| -------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WID-1 critical | Fixed        | Buttons are named by outcome; a Quick "Buttons" widget's Roll ran in Standby (two ops, no alert); `widget-commands.spec.ts`.                                                        |
| WID-2 critical | Fixed        | A template widget installs enabled with `trust.state: 'trusted'` from the Quick track and the full builder; on the Quick track the record shows basis `author`, reviewed by the DM. |
| WID-3 high     | Fixed        | Add to screen places the tile and focuses it.                                                                                                                                       |
| WID-4 high     | Fixed        | The Quick track (8 recipes) is the default; the eight-step builder sits behind "More options" on the same draft.                                                                    |
| WID-5 high     | Fixed        | At 390, Next stays inside the viewport on every step (y 792 of 844) and Install is reachable.                                                                                       |
| WID-6 high     | Partly       | Previews show labelled "Sample data" rows until a query exists. Residual L7.                                                                                                        |
| WID-7 high     | Fixed        | The party preview lists the three PCs only; chips read "Player visible", "Shared", "DM only".                                                                                       |
| WID-8 medium   | Fixed        | Escape on an edited draft asks "Keep this draft?" with Keep draft and Discard draft.                                                                                                |
| WID-9 medium   | Fixed        | Definition is a header toggle, off by default.                                                                                                                                      |
| WID-10 medium  | Fixed        | A widget with no settings says so in the inspector and points to Edit widget definition.                                                                                            |
| WID-11 medium  | Fixed        | "The assistant is off. Turn it on in Settings › Tool preferences to generate a widget." with a link.                                                                                |
| WID-12 medium  | Fixed        | The tile menu has Edit widget; the inspector has Edit widget definition.                                                                                                            |
| WID-13 medium  | Fixed (spec) | `widget-install-words.spec.ts`, `widget-trust-review.spec.ts`.                                                                                                                      |
| WID-14 medium  | Partly       | "Add a button" cards named by outcome. Residual L9.                                                                                                                                 |
| WID-15 low     | Partly       | Residual L8.                                                                                                                                                                        |
| WID-16 low     | Fixed        | `apps/gm-react/src/app/canvas/AddWidgetGallery.tsx` has no local en/es tables; its copy goes through `t()`.                                                                         |
| WID-17 low     | Fixed        | No console warning or error with the builder open.                                                                                                                                  |
| WID-18 low     | Fixed        | The Quick builder is a 560px sheet over the board on desktop and full width on the phone.                                                                                           |

The full builder's Review step contradicts WID-2's fix in its copy; that is M4.

### The knowledge base ([knowledge.md](friction-review-2026-09-29/knowledge.md))

| Finding       | Status       | Now                                                                                                                                                                   |
| ------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KNW-1 high    | Fixed        | `[[Mi` offers "Mira the Ferryman · NPC"; relationships reach NPCs (the golden-path journey relates a faction to an NPC).                                              |
| KNW-2 high    | Fixed        | The sidebar reads "0 quests · 4 factions", matching the tabs.                                                                                                         |
| KNW-3 high    | Partly       | Autocomplete says NPC; the Graph legend says Note, Faction, Map, Place. Residual L10.                                                                                 |
| KNW-4 medium  | Fixed        | The Ashen Hand is a faction with its dossier; Notes holds no faction note.                                                                                            |
| KNW-5 medium  | Fixed        | NPC cards show Relationships, Add relationship and Open sheet.                                                                                                        |
| KNW-6 high    | Fixed        | Text typed and followed at once by a click on Story was stored.                                                                                                       |
| KNW-7 medium  | Fixed        | The editor offers Done, Push to players and Show history, with no Save note, Cancel or Delete beside them; the note header has an overflow (⋯) menu, not opened here. |
| KNW-8 medium  | Partly       | 2 actions with the body focused at 1440 and 390. Residual M5.                                                                                                         |
| KNW-9 medium  | Fixed        | The composer offers Start from: Blank, Session recap, NPC handout, Faction brief, Quest outline, Location lore.                                                       |
| KNW-10 low    | Fixed        | Icon toolbar; Write/Preview toggle instead of an always-on preview.                                                                                                   |
| KNW-11 low    | Fixed        | As KNW-3.                                                                                                                                                             |
| KNW-12 medium | Fixed        | Notes has "Filter"; the palette offers "Refine in Notes"; the Graph box says "Filter the graph…".                                                                     |
| KNW-13 medium | Fixed (spec) | `knowledge-filters.spec.ts`.                                                                                                                                          |
| KNW-14 low    | Fixed        | Note cards show link counts, not a kind label.                                                                                                                        |
| KNW-15 high   | Fixed        | Labels sit outside the nodes, wrap between words, and none of the 16 overlap.                                                                                         |
| KNW-16 high   | Fixed        | The phone graph opens as a list with "Show map".                                                                                                                      |
| KNW-17 medium | Fixed        | An empty vault's graph shows one empty state with New note and Import notes.                                                                                          |
| KNW-18 low    | Open (D6)    | Still "Graph & search"; frozen until RC-UX-5.5. L11.                                                                                                                  |
| KNW-19 medium | Fixed        | Timeline offers "Set the campaign date" in place.                                                                                                                     |
| KNW-20 medium | Fixed        | Faction and NPC cards carry their relationships and an Add action inline.                                                                                             |
| KNW-21 low    | Fixed        | The NPC card now has a story purpose (KNW-5), which was the condition for accepting the copy.                                                                         |

### The player views ([player.md](friction-review-2026-09-29/player.md))

| Finding        | Status       | Now                                                                                                                   |
| -------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| PLY-1 critical | Fixed        | A joined player marks damage in 2 taps; the DM sees it; another PC is refused (`companion-sheet.spec.ts`, five runs). |
| PLY-2 high     | Fixed        | `/play` › My character renders the full sheet (Sheet, Resources, Level up, Journal, History; Damage and Heal).        |
| PLY-3 high     | Fixed        | Preview as Demo Player 2 opens their companion: "This is the page their phone shows."                                 |
| PLY-4 high     | Fixed        | In Standby the dice stay enabled under a note (`apps/gm-react/src/screens/play/Dice.tsx:72`).                         |
| PLY-5 high     | Fixed        | An unjoined `/play` shows "Join your table" with one primary, "Join a table".                                         |
| PLY-6 high     | Fixed        | Party lists 3 members.                                                                                                |
| PLY-7 high     | Fixed        | Start session puts the shared scene on the joined stage in 1 action (`table-view.spec.ts`, five runs).                |
| PLY-8 medium   | Fixed        | The Session screen carries the "What players see" widget.                                                             |
| PLY-9 medium   | Fixed        | Labelled bottom tabs (Sheet, Dice, Party, More); the DOM puts `#player-main` before the nav.                          |
| PLY-10 medium  | Partly       | Badges read "Note" and "Story entry". Residual L10.                                                                   |
| PLY-11 medium  | Open (D6)    | Host, Preview and Start session are still icon-only top-bar buttons (named by `aria-label`). M6.                      |
| PLY-12 medium  | Fixed (spec) | The join stage explains the code and the QR; the host shows a QR (`player-join-first.spec.ts`).                       |
| PLY-13 low     | Fixed        | Settings › Players subtitles name the character ("Playing Sera Duskwhisper").                                         |
| PLY-14 low     | Fixed        | "Lamplight — Join your table", "— You're invited", "— No scene on display".                                           |
| PLY-15 low     | Fixed        | One "Write a note"; bookmarks and impressions collapsed.                                                              |
| PLY-16 low     | Fixed        | `/display` keeps "Your DM controls this display from Session → Scene cards."                                          |

## 5. Remaining findings

**Critical: none. High: none.** Nothing here becomes a story that blocks RC-ENG-9.3. The medium
items are candidates for the RC-ENG-8.3 early-access audit or a follow-up polish story; filing them
is the operator's call.

### Medium

- **M1 · onboarding/home · The Command Center hub still says "scene" for a screen.** The hub's
  Scenes card is headed "Scenes" with a "New scene" action, lists rows as "Ready · town" and
  "Draft · dungeon", and the Create card offers "New scene · A canvas for the table". Both
  launchers create a screen (`target: 'screen'`). The hero says "Resume or open a scene" with "Open
  scene", and the campaign chip counts "2 scenes". The sidebar, the guide, the library and the
  palette say "screen", and CAN-8.7 retired "Ready/Draft" from the sidebar. Source: the `home-scenes`
  and create definitions in `packages/core/src/state/widget-package-state.ts:1526-1570`; copy keys
  `home.scenes`, `home.newScene`, `home.openScene`, `home.create.scene`. Residual of ONB-7 and
  CAN-10.
- **M2 · canvas · Edit-mode controls on the rail are below 44px.** At 834 with touch: Pin 28×28,
  the details pencil 28×28, Undo and Redo 28×28, Close inspector 28×28, the resize handle 24×24,
  Flow and Canvas 29px tall, "Preview this scene as another role" 34px tall. RC-CAN-8.6 made the
  phone header 44px; the rail kept the desktop sizes. §20.3 asks for 44px touch targets.
- **M3 · canvas · A screen's edit toolbar still calls it a scene.** On `/screen/<id>?edit=1` the
  controls are named "Edit scene name, description & tags" and "Preview this scene as another
  role". CAN-4 kept Scenes vocabulary for player-projected scenes only.
- **M4 · widgets · The full builder's Review step says the widget installs disabled.** It reads "It
  installs disabled with all permissions denied. When you are ready, enable it from Installed
  packages." For a template widget with no permissions, Install produced an enabled package with
  `trust.state: 'trusted'` (basis `author`). The copy predates RC-WID-6.2.
- **M5 · knowledge · At split-pane widths a new note does not focus its body.** At 834×1112 and
  1024×768, with touch or mouse, Enter in the composer opens the note in edit mode with focus on
  the note's `<section>`, checked at 0.3 s, 1 s and 2.5 s. Typing goes nowhere until the GM taps
  the body, so capture costs 3 actions. At 1440 and 390 the body is focused, which is why the
  `capture-note` budget, measured on `desktop-chromium` (1280) and `mobile-chromium` (393), passes.
- **M6 · player (open by D6) · The top bar's Host, Preview and Start session are icon-only.** The
  plain eye previews and the filled gold eye starts the session; both rely on `aria-label` and
  `title`. PLY-11, unchanged, held for the RC-UX-5.5 navigation review.
- **M7 · player · Companion controls on the rail are below 44px.** At 834 with touch, Dice's
  Disadvantage, Normal and Advantage are 29px tall and the modifier −1/+1 buttons 28×28. The 48dp
  gate (`companion-frame.spec.ts`) measures 390 only.

### Low

- **L1 · help · What's new reports a release-engineering change.** The 0.4.4 entry reads "The
  Android release check reaches the app's saved vault again…", which is about the release pipeline,
  not anything a GM or player sees. Residual of ONB-9.
- **L2 · help · The phone Help row is 81×34**, below 44px.
- **L3 · help · The shortcuts list uses em dashes** ("Open the command palette — search the whole
  vault"); so does the shell subtitle on screens ("…for running the table — open, switch, pin…").
- **L4 · canvas · At Fit on the rail, the Initiative Tracker's "1 more line" hint collides with
  its Next turn button**, with a clipped line showing beneath.
- **L5 · canvas · The phone edit toolbar clips its "Snap" label** at the right edge.
- **L6 · canvas · The board names the screen twice, and meta text drops below 12px.** The shell
  header reads "DM screen" over the Screens library's subtitle; the board heading repeats "DM
  SCREEN" over "7 widgets · your home board" at 10px. The sidebar chip's counts are 10.5px and the
  phone tab labels 10px.
- **L7 · widgets · A Quick widget's eyebrow reads "CUSTOM".** Quick recipes never set a category,
  so the draft default (`apps/gm-react/src/app/widgetBuilder/draft.ts:189`) shows on the tile and in the selection
  chip. WID-6.5 asked for the template kind or the GM's category, never the literal default.
- **L8 · widgets · Icon radios outside the meaning map are named by file name** ("ArrowUp",
  "CreditCard", "SlidersHorizontal", "Sprout"). `iconMeaning` falls back to the raw name
  (`apps/gm-react/src/app/widgetBuilder/IdentityStep.tsx:42`).
- **L9 · widgets · Package-author leftovers in the full builder.** The Review summary prints engine
  ids (`workspace.quick-<uuid>`), and the Commands step's "Start something new" lists "New scene"
  beside "New screen".
- **L10 · player · The companion's Handouts label factions "Story entry"** while GM surfaces now
  say "Faction". Residual of KNW-3 and PLY-10.
- **L11 · knowledge (open by D6) · "Graph & search" is still named for its mechanism.** KNW-18,
  held for RC-UX-5.5.
- **L12 · shell (phone) · The live-session strip sits outside every landmark.** While a session
  is live, the 16px strip above the phone tab bar (`data-testid="phone-session-strip"`,
  `apps/gm-react/src/app/shell/Footer.tsx:31`, RC-SES-1.1) is a bare `div`. Axe reports `region`
  (moderate) on `/session#combat` at `mobile-chromium`; the strip is shell chrome, so it sits the
  same way above the five surfaces while a session runs. Its text still reads in document order;
  a screen-reader user jumping by landmark skips the "live" signal. Found by the a11y gate in §3,
  not by the 2026-09-29 reviews.

## 6. Checklists and regression

**`design-polish`.** Baseline: states, empty states and spacing were consistent across the
captures; the type floor slips only in the meta text of L6. Accessibility: tab order follows the
visual order on every route walked, every stop shows a ring, inputs and icon buttons are named
(L8 is a naming-quality issue, not a missing name), the gate's contrast checks pass in five themes,
and every scanned page sits inside landmarks except the phone live-session strip (L12).
Motion: nothing runs under reduced motion. Verify: no page overflowed horizontally at 390 on any
captured state.

**`design:design-critique`.** First impression and hierarchy: each surface now leads with its one
job (the guide on a fresh home, the Quick track in Add, the join stage on an unjoined phone) and the
primary action is the gold one. Usability: no job needs a trip to another surface. Consistency: the
open items are vocabulary (M1, M3, L9, L10) and rail target sizes (M2, M7). What works: the
first-session guide, the Quick track, list-posture arranging on the phone, inline relationships on
Story, and the companion preview that shows the exact page a player's phone renders.

**Story specs on the same commit.** One run of the 75 e2e spec files the 45 dependency stories
added or changed (found through their commits), plus the join-first, companion-frame, play-polish,
Standby-session and onboarding-polish specs, minus the five already run five times and the axe
gate. Both profiles, retries 0. On `7008d590` (2026-10-14 07:25–07:55Z) and on `d18a4272`
(08:16–08:49Z): **1,126 passed, 0 failed, 0 flaky, 18 skipped**. Each skip is a declared
single-profile test (a touch gesture, the phone panel list, a desktop-only canvas check) or the demo
vault's dedicated performance capture.

On `93361a43` (2026-10-15 09:55–10:24Z): **1,124 passed, 2 failed, 0 flaky, 18 skipped.** The
machine's load average was 3.4 before the budget runs and 13.6 after this run. The application code
is the same as in the two clean runs. Neither failing spec backs a "(spec)" row in §4, and every
spec those rows cite passed. The two failures:

- `canvas-arrange.spec.ts:32` (RC-CAN-3.6), `mobile-chromium`. It fails in its setup loop, which
  deletes the seeded tiles one `Delete` press at a time: one press did not remove its tile (7 left
  where 6 were expected, `canvas-arrange.spec.ts:48`). Repeated ten times per profile on the same
  commit, it failed once more (desktop 1 of 10, mobile 0 of 10). The failure is intermittent and
  has not been diagnosed; whether the keypress is lost in the app or in the test's focus walk is
  open. The arrange steps the spec exists for were not reached in the failing runs.
- `hub-templates.spec.ts:260`, `desktop-chromium`. The Command Center's part widths on `/` and
  `/screen/:id` differed by one percentage point at 900px (56 against 57). It passed 10 of 10 on
  repeat.

These are the runs the "(spec)" rows in §4 rest on.

## 7. Not checked

- Electron and Android shells; hosted CI. Everything here ran on one Linux machine against the Vite
  dev server.
- Spanish and the `qps-ploc` pseudo-locale beyond the specs that assert them; themes other than the
  default except through the contrast gate.
- A screen reader. Accessible names come from ARIA snapshots and axe, not from speech output.
- Joined-player flows beyond the specs: a real phone joining over the fake LAN was exercised only by
  `companion-sheet`, `table-view` and `player-join-first`.
- The Detail preset's scroll affordance (CAN-16) and a spotlight firing during edit (CAN-17).
- Ctrl+N in a real Chrome window. Playwright delivers the chord to the page; Chrome normally keeps
  Ctrl+N for a new window. Inferred, not tested; Electron is unaffected either way.
- Multi-select, align and group beyond `canvas-arrange.spec.ts`.

## 8. Reproducing the run, and integration

The probes were scratch specs and are not committed; the gates are. From a clean checkout, with
`<dir>` a scratch path and `<port>` a free port:

```sh
git worktree add --detach <dir> 93361a43
cd <dir> && pnpm install --frozen-lockfile
cd <dir>/apps/gm-react
# five times:
DNDTOOLS_E2E_PORT=<port> PLAYWRIGHT_JSON_OUTPUT_NAME=<dir>/budgets-run<n>.json \
  pnpm exec playwright test tests/e2e/golden-path.spec.ts tests/e2e/friction-budgets.spec.ts \
  tests/e2e/companion-sheet.spec.ts tests/e2e/widget-quick-builder.spec.ts tests/e2e/table-view.spec.ts \
  --project=desktop-chromium --project=mobile-chromium --reporter=json,line
cd <dir> && DNDTOOLS_E2E_PORT=<port> pnpm a11y:gate
```

The counts in §2 are the `friction` annotations in each JSON report.

This audit holds for the application tree of `93361a43`, which is also the tree of `d18a4272` and
`7008d590`. On top of `loop/rc` `ad2812a9`, the branch adds only documentation: this file, its
links from the planning index and FEATURE-GAPS.md, and the run journal. A later rebase can change
the commit ids without changing the code. Before citing this verdict for another commit, run
`git diff --stat 93361a43 <commit> -- . ':!docs' ':!state'`. Empty output means the same
application code. If the output lists anything the five surfaces or these gates load, repeat the
budget runs and the a11y gate first.
