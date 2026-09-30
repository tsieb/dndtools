# Canvas · Screens · Board — review findings (loop/rc `7fab0ebd`, 2026-09-29)

Reviewed on the dev server at 1440×900, 834×1112 (rail) and 390×844 (phone, touch), light theme,
fresh seeded vault ("Your campaign", 7-tile DM screen), plus a Blank screen and a Command Center
template (flow) screen created from the library. Screenshots in `scratchpad/shots/canvas/`
(`desktop-edit-*`, `d2-*`, `d3-*`, `d4-*`, `d6-*`, `f-*` flow, `p-*` phone, `t-*` tablet,
`board-*`/`screens-*` static). Paths below are relative to `apps/gm-react/src/` unless prefixed.

## 1. Verdict

A GM who has never seen the app lands on a board they cannot resize, arranged by a mode they must
find, and told by two headers at once that they are on "Screens" and on the "DM screen". Entering
edit mode is one visible button ("Edit layout"), which is good, and the command palette's
`>board` rows are excellent — but from there the canvas gives almost no direct-manipulation cues:
no hover state, no visible resize handle (every seeded tile is a "system" tier that is move-only, and
the menu says only "size is locked"), right-click does nothing, and the Add panel opens with
"Generate with assistant" and "Build your own" ahead of the widgets and with live previews whose
buttons look real but do nothing. Undo after a mouse drag rewinds the state but the tile keeps
drawing where it was dropped until reload — a GM will believe undo is broken. The same object is
called "DM screen" on the board and "Command Center" in the scene editor, the shell header says
"Screens" on one and "Scenes" on the other, and the browser tab says "Command Center" everywhere.
On a phone, editing throws the GM out of the list into a clipped canvas with tile menus off-screen.
Add a dice tile → move → resize → undo → back to play costs: 2 clicks + scroll (or 3 via palette),
1 drag, **impossible** (locked), 1 click, 1 click; the resize step is the one a GM will try first.

## 2. Findings

Severity: critical = blocks or silently breaks a primary path; high = a new GM will fail or
misread; medium = friction/inconsistency; low = polish.

- **CAN-1 · critical — Undo does not re-render a dragged tile.** Evidence: `desktop-edit-12/14/15`
  (Dice dropped over Quick Reference, Undo pressed, then Done: the tile still sits over Quick
  Reference), `d2-01`/`d2-02`; probe log: after drag `state={x:552,y:220}` while the frame's DOM box
  is at x 953/y 442; after the Undo button `state.y=24` but DOM y 368; after reload DOM y 172
  (correct). The layout-issues banner clears on undo (the model agrees with the state) while the
  frame keeps the dropped transform. Impact: a GM who mis-drops a tile and presses Undo sees nothing
  happen and drags again, stacking history entries on a view that lies. Fix: the frame position
  must come from the rendered `BoardWidget` only; clear any optimistic drag offset when the history
  rewinds (likely `SceneBoardCanvas.tsx` keeping the last pointer delta past `onMove` resolution;
  `app/canvas/useLayoutHistory.ts`). Add a test that undoes a move and asserts the frame's
  `transform` equals the state layout.
- **CAN-2 · critical — Every seeded tile is unresizable and the UI never says why.**
  `app/board-helpers.ts:101` (`isWidgetResizable: tier !== 'system'`), `app/SceneBoardModel.ts:59`
  ("System widgets are move-only, mirroring the prototype"). All seven default tiles and every tile
  added from the gallery or palette are `system`, so no resize handle ever renders (`d2-*`: "resize
  handle count: 0"), the tile menu reads "Resize (size is locked)" (`d2-05-tile-menu`), the
  inspector says "Locked — this widget's size is fixed by the scene layout"
  (`screens/sceneEditor/InspectorTransform.tsx:94`), and Shift+arrows silently no-op although the
  frame's own help text promises "Shift with arrows resizes". Impact: the Prep tile overprints five
  note titles at 240×160 and the Map tile clips its zoom buttons (`board-desktop.png`), and the GM
  has no remedy; on a 1440 display the board uses ~55% of the pane at Fit because the fixed 240×160
  grid cannot grow. Fix: retire the tier lock; give every widget a `minSize`/`maxSize` (from the
  definition, default 1×1 to full board) and the S/M/L presets; RC-CAN-5.5 then has a lever other
  than clipping. (RC-CAN-5.5 "never clips past recovery" as written is insufficient: it recovers
  clipped content but leaves the tile size unchangeable.)
- **CAN-3 · high — No hover or grab affordance in edit mode.** `desktop-edit-05-edit-hover` is
  pixel-identical to `04-edit-mode`: hovering a tile changes only the cursor (`WidgetFrame.tsx:619`
  `cursor: 'grab'` on a full-tile invisible overlay). Nothing says "drag here"; the title bar has no
  grip; a right-click does nothing (`07-edit-contextmenu`). Impact: a GM in edit mode sees a dotted
  grid and identical tiles and does not know they can drag. Fix: hover lift + outline, a grip glyph
  in the title bar, right-click/long-press opens the existing tile menu, and a drop-shadow drag
  ghost that also shows snap guides.
- **CAN-4 · high — Two edit modes, two names, two headers for one screen.** The board's
  "Edit layout" edits in place (`screens/Board.tsx:486`); the header's icon "Open DM screen in the
  scene editor" (`screens/screen/ScreenView.tsx:78-88`) opens `/scene/:id` with a different toolbar
  (Flow/Canvas, Generate a widget, Scene details, Preview as another role, zoom cluster). There the
  same screen is titled "Command Center" (its scene name) under a shell header "Scenes — The
  canvases your table plays on" (`d3-01`), while on `/board` it is "DM screen" under "Screens — Your
  workspaces" (`screens/screen/useScreens.ts:30-33` renames only the home entry). Impact: a GM
  cannot tell whether they edited the right thing or why the layout tools differ by door. Fix: one
  arranging mode per screen; the scene editor's extra tools (layout policy, details, preview) become
  the screen edit mode's inspector; the editor keeps its Scenes vocabulary for player-projected
  scenes only. See story RC-CAN-8.4.
- **CAN-5 · high — The Add panel leads with extensibility and its previews are decoys.**
  `desktop-edit-08-gallery`, `d2-07`, `p-02`: the first two cards are "Generate with assistant"
  and "Build your own" (`app/canvas/AddWidgetGallery.tsx:623-647`), each library card is ~270px
  tall with a live miniature whose buttons ("Roll dice", "Sample data: 2") are real DOM buttons that
  do nothing; the actual pick control is a transparent overlay button (`WidgetFrame.tsx:719-726`,
  `WidgetLibraryCard`) whose accessible name resolved to null in the probe ("pick label: null"; the
  first `li button` in the list is the miniature's "Roll dice"). Adding "Dice" needs Edit layout →
  Add → scroll or filter → click the card (3 clicks + a scroll); the panel stays open and the new tile
  is not selected or scrolled to. Impact: new GMs click the preview's button, nothing happens, and
  give up; screen-reader users get an unnamed button. Fix: compact rows (glyph, title, one line),
  preview on hover/focus only with `aria-hidden` and `inert` on the miniature, "More ways to add" at
  the end, add → close panel, select and focus the new tile.
- **CAN-6 · high — Phone editing abandons the list posture and clips the canvas.** `p-01`,
  `p-08`: "Edit layout" on a phone switches to the canvas at Comfortable (Fit is removed while
  editing, `app/canvas/PhoneNavigator.tsx:52-65`), tiles run off the right edge, and the "Actions for
  Initiative Tracker/Dice/Audio/Quick Reference" buttons are outside the 390px viewport (probe:
  `44x44 OFFSCREEN`); the List|Layout switch disappears (`screens/Board.tsx:115`
  `useStackedPosture(phone && !editing)`), the header wraps to three rows and the pin icon is cut at
  the right edge (`board-phone.png`, x 376); pin/editor/undo/redo are 28×28. The scene editor on a
  phone opens the Scene details sheet over half the canvas while editing (`p-08`). Impact: D5 says
  phones keep every feature; arranging on a phone is not usable. Fix: edit in the list (drag handle
  or Move up/down per tile, which the flow menu already has), keep Fit with a magnifier for canvas
  screens, 44px targets, header on two lines maximum.
- **CAN-7 · high — Keyboard undo diverges from the button.** Probe (`d6`): Space → ArrowRight ×2
  moves Map to x 44 ("Undo moved map"); Escape; Ctrl+Z leaves `x=44` while the toolbar flips to
  "Undo moved map | Redo moved map"; only the Undo button restores x 24. The focused frame's
  keydown handling (`WidgetFrame.tsx:446` help text, `app/canvas/keyboard.ts:88`) swallows the
  chord or coalesces the two arrow steps differently from the history. Impact: keyboard users get a
  half-undo. Fix: one history entry per arrow burst (commit on Escape/blur), Ctrl+Z handled once at
  the board level.
- **CAN-8 · high — Adding from the palette bypasses history and mis-sizes the tile.** `d6-02`:
  `>board` → "Add tile: Dice" adds at 220×160 while every seeded tile is 240×160
  (`app/board-helpers.ts:353` default 280×220 vs the seed's 240×160), enters edit mode with the new
  tile focused, but Undo stays disabled ("Undo(disabled) | Redo removed timer"). The frame's
  accessible name reads "Dice, Dice & Timers widget, position 288, 392, size 220 by 1" (height
  announced as 1). Impact: the one-keystroke add cannot be undone and screen readers hear a 1px tile.
  Fix: route every add through the same history as the gallery; one default size table; fix the
  name builder.
- **CAN-9 · high — Rendered text below the floor at Fit on the rail tier.** `board-tablet.png`:
  tiles paint at 10px (probe: smallest computed font 10px); the phone gets a 12px floor
  (`PhoneNavigator.tsx:50 PHONE_TEXT_FLOOR`) but 834px does not; the header wraps "Edit layout" to
  a second line and 60% of the pane is empty. Fix: apply the floor at every tier when Fit scale < 1
  and let the bounded board use the pane width (see CAN-2).
- **CAN-10 · medium — Screens library mixes player scenes with GM screens and doubles its
  heading.** `screens-desktop.png`: "Harbor of Saltreach (Player visible · town)" and "The Sunken
  Crypt" sit beside "DM screen" as equal cards; the shell header says "Screens" and the page repeats
  an H2 "Screens"; "Scene cards" (atmosphere) is a second unrelated section on the same page; the
  card action row is four 16px icon-only buttons (34 sub-44px controls on the route). The sidebar
  group is still "SCENES" with "Ready · town / Draft · dungeon" while the library says "Player
  visible / DM only" (CAN-7.3 renamed the library; RC-CAN-7.4 will rename the group but its text does
  not mention retiring Draft/Ready in the rows). Fix: a "Screens | Scenes" filter or two sections,
  one heading, Scene cards to its own route or an Atmosphere tab, labelled 44px actions.
- **CAN-11 · medium — Empty-state and literal copy leaks.** A Blank screen named "Table night"
  says "Your DM screen is empty" (`screens/Board.tsx:609` uses `board.emptyTitle` for every screen,
  `d3-08`); `app/canvas/FlowBoard.tsx:60-69` and `app/canvas/TileActionMenu.tsx:33-47` ship English
  `TEXT` literals ("Move to start", "Full width", "Visibility", "An empty screen") outside the message
  catalog, so the flow menu (`f-05`) is untranslated in ES; the selected-tile chip "Dice · System ·
  locked content" (`board-helpers.ts:106`) is engine jargon and overlaps the canvas top edge
  (`desktop-edit-06`).
- **CAN-12 · medium — Document title never follows the route.** `document.title` stays
  "Lamplight — Command Center" on `/screens`, `/screen/:id` and `/scene/:id` (probe logs; only
  `WikiReader.tsx` and `legal/LegalPage.tsx` set it). WCAG 2.4.2 and the browser history menu both
  suffer. Fix: a `useDocumentTitle` in `Page`/`screen-kit` fed by the screen name.
- **CAN-13 · medium — Stacked phone list badges every tile "DM only".** `p-05`, `p-07`:
  `app/canvas/StackedBoard.tsx:277-291` renders `visibilityChip` for every tile, contradicting D4
  (RC-CAN-6.4 badges by exception, which the canvas frames already follow).
- **CAN-14 · medium — Flow screens: no direct reorder and a floating undo cluster.** `f-02`,
  `f-05`, `f-09`: flow tiles reorder only through the "…" menu (Move back/forward, span presets all
  disabled on the Command Center template); no drag handle, no keyboard hint on the frame; the
  Undo/Redo cluster floats at the bottom-right of the content and overlaps the last tile on a phone
  (`f-09`). On a phone a flow screen also offers "List | Layout" (`f-08`) although its Layout is
  already one column.
- **CAN-15 · low — Layouts panel "Save" button renders vertically** (`d2-06-layouts-panel`: the
  letters S/a/v/e stacked; `screens/BoardLayoutsPanel.tsx:93-101` inside a 260px flex row with a
  full-width Input). The Configure dialog for Dice (`d2-08b`) is an empty "Quick-roll formulas
  (comma separated)" field with no example.
- **CAN-16 · low — Detail preset scrolls with no affordance.** `desktop-edit-19-detail`: Quick
  Reference and Prep run past the pane; the container scrolls (probe: `sw=1188/1118`) but shows no
  scrollbar or edge hint.
- **CAN-17 · low (cross-area) — A spotlight ("Your notes are connected") fires mid-edit** over the
  Add panel and stays through Done (`desktop-edit-16..19`), and the sidebar live-badge `StatusDot`
  injects a `<style>` inside the row button so its text content starts with
  `@keyframes dndPulse{…}` (`ds/components/feedback/StatusDot.tsx:58`). For the onboarding and
  shell reviewers (RC-POL-1.23).

Counts for the owner's question (desktop, seeded board): enter edit 1 click; add Dice 2 more clicks

- scroll (palette: Ctrl+K, type, Enter); move 1 drag (no cue); resize impossible; undo 1 click
  (keyboard chord unreliable, mouse-drag undo mis-renders); back to play 1 click (Done) — but the
  "Screens" header, the second editor door and the sidebar "Scenes" group all keep suggesting there
  is somewhere else to be.

## 3. Proposed stories — epic CAN-8 "Arranging a screen is direct, honest and undoable" (P3)

All P3 so they sequence after the CAN-7 chain; each is written so RC-POL-1.2 can land after them —
**RC-POL-1.2 must add CAN-8.1–8.3, 8.5 and 8.6 to its Deps** (they edit `app/canvas` and
`screens/Board.tsx`, which POL-1.2 owns outright). RC-CAN-5.5 (blocked in review) shares
`WidgetFrame.tsx`; CAN-8.1 and 8.2 depend on it so the fence never collides.

- **RC-CAN-8.1 — The canvas draws exactly what the history says.** `M` · P3 · Deps: CAN-5.5,
  CAN-7.7 · Owns: `apps/gm-react/src/app/SceneBoardCanvas.tsx`,
  `apps/gm-react/src/app/canvas/useLayoutHistory.ts`, `apps/gm-react/src/app/canvas/WidgetFrame.tsx`,
  `apps/gm-react/src/app/canvas/keyboard.ts`, `apps/gm-react/src/screens/Board.tsx`,
  `apps/gm-react/src/app/board-helpers.ts`, `apps/gm-react/src/screens/screen/paletteRows.ts`.
  Current state: after a pointer drag and Undo the frame keeps its dropped transform while the state
  and the layout-issues banner rewind (CAN-1); Ctrl+Z from a focused frame after a keyboard move
  flips the toolbar but not the layout (CAN-7); a palette "Add tile" is not in the history and lands
  at 220×160 beside 240×160 siblings, announced as "size 220 by 1" (CAN-8). What to build: frame
  position and size derive only from the widget layout the board receives (drag offsets live in the
  drag overlay and clear on pointer-up or history change); one history entry per keyboard burst
  committed on Escape or blur; every add (gallery, palette, template, duplicate) records a history
  entry and uses one default-size table; the accessible name reads the real size. Acceptance: unit
  tests — undo after `onMove` leaves the frame `transform` equal to the state layout, palette add
  is undoable, name builder prints `size 240 by 160`; e2e on both profiles: drag, Undo, screenshot
  diff against the pre-drag capture is empty; keyboard move → Escape → Ctrl+Z restores; axe clean.
- **RC-CAN-8.2 — Every tile can be resized.** `M` · P3 · Deps: 8.1, CAN-5.5 · Owns:
  `apps/gm-react/src/app/board-helpers.ts`, `apps/gm-react/src/app/SceneBoardModel.ts`,
  `apps/gm-react/src/app/SceneBoardCanvas.tsx`, `apps/gm-react/src/app/canvas/WidgetFrame.tsx`,
  `apps/gm-react/src/app/canvas/TileActionMenu.tsx`,
  `apps/gm-react/src/screens/sceneEditor/InspectorTransform.tsx`,
  `apps/gm-react/src/app/widgets/builtin/index.tsx`, `docs/architecture/WIDGETS.md`. Current
  state: `tier === 'system'` makes every builtin move-only (CAN-2); the Prep and Map tiles overprint
  and clip at their fixed 240×160 with no remedy; the menu, inspector and frame help text disagree
  about resizing. What to build: a `minSize`/`maxSize` per builtin declared beside its body (default
  one grid cell to the board), the S/M/L presets and the corner handle for every tile, handle visible
  on selection and on hover, Shift+arrows honoured, the inspector's Locked note reserved for a widget
  that declares a fixed size and then saying which; seed sizes unchanged so no round-trip changes.
  Acceptance: `isWidgetResizable` no longer reads the tier (test); each builtin's declared bounds
  tested; e2e both profiles resizes Prep to show all six notes and Map to show its zoom row; the
  menu item is enabled on every seeded tile; visual snapshots updated.
- **RC-CAN-8.3 — Direct manipulation cues: hover, grip, guides, context menu.** `M` · P3 ·
  Deps: 8.1 · Owns: `apps/gm-react/src/app/canvas/WidgetFrame.tsx`,
  `apps/gm-react/src/app/SceneBoardCanvas.tsx`, `apps/gm-react/src/app/canvas/FlowBoard.tsx`,
  `apps/gm-react/src/app/canvas/TileActionMenu.tsx`, `apps/gm-react/src/app/canvas/geometry.ts`,
  `apps/gm-react/src/app/canvas/surfaceA11y.tsx`. Current state: edit mode changes only the cursor;
  right-click and long-press do nothing; the drag ghost shows no snap guides; the selection chip
  overlaps the canvas edge; flow tiles have no drag reorder (CAN-3, CAN-14). What to build: hover
  lift and outline (motion tokens, reduced-motion static), a grip glyph in the title bar, right-click
  and long-press open the existing tile menu at the pointer, snap guides and distance hints while
  dragging, the selection chip inside the frame, flow tiles draggable with a drop indicator and the
  same `Move` command the menu dispatches, the undo cluster docked in the toolbar. Acceptance: e2e
  both profiles — hover screenshot differs from rest; contextmenu opens the tile menu; a flow drag
  reorders and Undo restores; keyboard reorder still passes `flow-layout.spec.ts`; axe clean;
  `pnpm lint` emphasis baseline not raised.
- **RC-CAN-8.4 — One way to arrange a screen; one name, one header, one title.** `L` · P3 ·
  Deps: CAN-7.6, CAN-7.8, CAN-7.9, POL-1.3 · Owns: `apps/gm-react/src/screens/screen/ScreenView.tsx`,
  `apps/gm-react/src/screens/screen/useScreens.ts`, `apps/gm-react/src/screens/screen/screenModel.ts`,
  `apps/gm-react/src/screens/screen/routeAliases.tsx`, `apps/gm-react/src/screens/Board.tsx`,
  `apps/gm-react/src/screens/board/BoardHeading.tsx`,
  `apps/gm-react/src/screens/sceneEditor/index.tsx`,
  `apps/gm-react/src/screens/sceneEditor/SceneToolbar.tsx`, `apps/gm-react/src/app/screen-kit.tsx`,
  `docs/architecture/NAVIGATION.md`. Current state: a screen has an in-place edit mode and a second
  editor at `/scene/:id` with different tools and a different name for the same object; the shell
  header says Screens on one and Scenes on the other; `document.title` never changes (CAN-4,
  CAN-12). What to build: after CAN-7.9 retires the bespoke run screens, a screen's edit mode carries
  the editor's tools as an inspector drawer (layout policy, details, backgrounds, preview as player,
  bindings) and the "Open in scene editor" icon is removed from screens; `/scene/:id` for a screen id
  redirects to `/screen/:id?edit=1`; the home screen has one display name everywhere (the scene name
  is the display name; the seed names it "DM screen"); the shell header and `document.title` read the
  screen name. Acceptance: e2e both profiles — no route renders two toolbars for one screen; the
  aria snapshot of `/screen/:id` in edit mode contains the details and preview controls; `title`
  equals "Lamplight — <screen>"; bookmarks to `/scene/<screenId>` land in edit mode; NAVIGATION.md
  updated.
- **RC-CAN-8.5 — An Add panel a GM can read.** `M` · P3 · Deps: 8.1, WID-5.3 · Owns:
  `apps/gm-react/src/app/canvas/AddWidgetGallery.tsx`, `apps/gm-react/src/app/canvas/WidgetFrame.tsx`,
  `apps/gm-react/src/screens/screen/paletteRows.ts`, `apps/gm-react/src/screens/Board.tsx`. Current
  state: CAN-5. What to build: library rows first (glyph, title, one-line purpose, category), a
  miniature only on hover/focus/details and always `aria-hidden` + `inert`; "Generate with assistant"
  and "Build your own" as a final "More ways to add" group (still one click); the pick control named
  "Add <widget>"; picking closes the panel, places the tile in the first free grid slot near the
  viewport centre, selects and focuses it, and announces "Added <widget>"; the phone sheet uses the
  same rows; palette rows share the placement. Acceptance: e2e both profiles — add Dice in ≤2 clicks
  after Edit layout, the new frame is focused and inside the viewport; axe reports no unnamed button
  in the panel; a test proves the miniature is not in the tab order; snapshots per theme.
- **RC-CAN-8.6 — Arranging on a phone and a rail without leaving the posture.** `M` · P3 ·
  Deps: 8.2, 8.3, CAN-5.4 · Owns: `apps/gm-react/src/app/canvas/PhoneNavigator.tsx`,
  `apps/gm-react/src/app/canvas/StackedBoard.tsx`, `apps/gm-react/src/screens/Board.tsx`,
  `apps/gm-react/src/screens/board/BoardHeading.tsx`, `apps/gm-react/src/app/canvas/ZoomCluster.tsx`.
  Current state: CAN-6, CAN-9, CAN-13. What to build: on a phone, Edit layout keeps the List
  posture with a drag handle and Move up/down per tile plus the size presets, and Layout (canvas)
  editing keeps Fit with a magnifier loupe around the touched tile; every tile menu button stays
  inside the viewport; header controls are 44px and the header never exceeds two rows or clips the
  pin; the 12px text floor applies at every tier whenever Fit scales below 1; the stacked list
  badges only shared or player-visible tiles (D4). Acceptance: e2e phone — Edit layout leaves the
  list mounted, reorder by handle dispatches the move command, no control `right > innerWidth`
  (the ENG-8.1 detector); rail — smallest computed font ≥ 12px at Fit; `responsive.spec.ts` and
  `canvas.spec.ts` green on both profiles; axe clean.
- **RC-CAN-8.7 — Screens library and vocabulary cleanup.** `M` · P3 · Deps: CAN-7.4, CAN-7.9,
  UX-4.4 · Owns: `apps/gm-react/src/screens/screen/ScreenCard.tsx`,
  `apps/gm-react/src/screens/screen/ScreenSwitcher.tsx`, `apps/gm-react/src/screens/screen/ScreenView.tsx`,
  `apps/gm-react/src/screens/SceneCardsPanel.tsx`, `apps/gm-react/src/screens/ScenesCreator.tsx`,
  `apps/gm-react/src/app/canvas/FlowBoard.tsx`, `apps/gm-react/src/app/canvas/TileActionMenu.tsx`,
  `apps/gm-react/src/app/board-helpers.ts`, `apps/gm-react/src/app/shell/Sidebar.tsx`. Current
  state: CAN-10, CAN-11. What to build: the library separates GM screens from player-projected scenes
  (two sections or a filter, default Screens), one heading per page, Scene cards moved to its own
  panel reachable from the Session screen and the atmosphere widget, card actions as labelled 44px
  buttons (or a row menu), the sidebar rows read "GM only / Player visible" like the library, every
  `TEXT` literal in FlowBoard and TileActionMenu moved into the catalog with ES, the tier chip
  reduced to the widget name and "Custom"/"AI" only, `board.emptyTitle` replaced by "<screen name>
  is empty". Acceptance: a test fails on any string literal in those two files (`i18n` lint
  allow-list shrinks); e2e both profiles — library shows Screens first, action buttons ≥ 44px,
  Blank screen empty state names the screen; ES snapshot of the flow menu; axe `heading-order`
  clean.
- **RC-CAN-8.8 — Layouts and Configure dialogs.** `S` · P3 · Deps: 8.5 · Owns:
  `apps/gm-react/src/screens/BoardLayoutsPanel.tsx`, `apps/gm-react/src/screens/board/useBoardLayouts.ts`,
  `apps/gm-react/src/app/canvas/TileDialogs.tsx`. Current state: CAN-15. What to build: the Save
  button keeps its width (row → column on narrow panels), saved layouts list with apply/rename/
  delete and a "Restore previous" that says what it restores; Configure dialogs carry a placeholder,
  an example and a validation message per field (Dice: `1d20+5, 2d6`), Enter saves, Escape cancels
  with unsaved-changes guard. Acceptance: visual snapshot of the Layouts panel at 260px shows the
  button on one line; unit test for the formula validator; e2e saves and applies a layout on both
  profiles.

Suggested §23 rows: RC-CAN-8.1 M P3 (CAN-5.5, CAN-7.7) · 8.2 M P3 (8.1, CAN-5.5) · 8.3 M P3 (8.1)
· 8.4 L P3 (CAN-7.6, 7.8, 7.9, POL-1.3) · 8.5 M P3 (8.1, WID-5.3) · 8.6 M P3 (8.2, 8.3, CAN-5.4)
· 8.7 M P3 (CAN-7.4, 7.9, UX-4.4) · 8.8 S P3 (8.5). Edit RC-POL-1.2's Deps to add 8.1, 8.2, 8.3,
8.5, 8.6 and RC-ENG-8.3's Deps to add 8.1, 8.2, 8.4, 8.6.

## 4. Not checked

- Dark and the other themes (light only; DSN-1.2 five themes still blocked).
- Multi-select, align/distribute, group and z-order beyond the help text (CAN-3.6 done): not
  exercised because no tile could be resized and the review budget went to the primary path.
- The demo vault (switcher) and its custom widget: not opened; the seeded fresh vault was used.
- The player-preview overlay inside the editor (RC-CAN-6.1 is blocked in review, so its state is
  in flux).
- Real touch drag on the phone canvas (only tap and the posture switch); CAN-5.4's pan/zoom.
- Reduced-motion rendering of the drag ghost and hover states (no hover state exists yet).
