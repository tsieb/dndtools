# Knowledge base review — Notes, Story, Graph & search (loop/rc 7fab0ebd, 2026-09-29)

Screenshots: `scratchpad/shots/knowledge/*.png` (desktop 1440, tablet 834, phone 390; fresh vault,
demo vault, and a vault created empty through the switcher). Aria snapshots beside them (`*.aria.txt`),
raw probe output in `results.json`.

## 1. Verdict

The three surfaces are individually well built (the editor has autosave, revision history, wikilink
autocomplete, a slash menu with templates and snippets; the palette finds a note by title or body word
one second after it is typed; the faction and quest cards are the best-designed cards in the app) but
they do not form one knowledge model. A new GM meets three homes for the same things: an NPC is a
combat sheet under Characters, a faction is a "Story entry" in the Graph, a "faction" on the Story
page, and a `Note` in the wikilink autocomplete, and the seed models the same faction twice (a note
titled "Faction · The Ashen Hand" beside three faction objects). The sidebar promises "6 threads" that
no tab shows. Relationships ("who leads a faction, who lives where") can only join two notes, so an NPC
cannot be linked to the faction it leads and `[[Mi` finds nothing for Mira the Ferryman. Capture is
four actions plus typing and lands in a read-only viewer with focus lost; text typed in the 1.2 s
before leaving the page is silently discarded. The graph breaks every label mid-word on desktop and
shows no labels at all on a phone. None of this is a visual-polish defect; it is model and wiring
work, which is why RC-POL-1.11 and RC-POL-1.12 (both done) did not touch it.

## 2. Findings

### Model and vocabulary

- **KNW-1 (high) — NPCs cannot be linked from notes or relationships.** Evidence: typing `[[Mi` in a
  note body shows "Nothing matches" (probe 4, `autocompleteMi`); the Relationships editor's From/To
  lists contain only `kind === 'note'` items (`src/screens/campaign/Relationships.tsx:68`), so the
  three faction objects and both NPC characters are absent although the panel's own subtitle promises
  "who leads a faction, who lives where" (`campaign-Relationships.png`). Impact: the GM's most common
  link (NPC ↔ faction ↔ place) is impossible without a workaround note. Fix: extend wikilink targets
  and relationship endpoints to characters (through `listCharactersForActor`) and to faction and
  quest objects; render `[[Mira]]` as a link to `/characters/:id`; store nothing new — the relation
  already lives in the note body (`Relationships.tsx:93-117`, `content.update-item`).
- **KNW-2 (high) — Story's sidebar count and its tabs disagree.** Evidence: the sidebar reads
  "6 threads · 3 factions" while the Quests tab reads "No quests yet" (`campaign-desktop.png`);
  `Sidebar.tsx:88-110` counts notes as "threads", a word that appears on no Story tab. Impact: a new
  GM opens Story expecting six things and finds none. Fix: count what the tabs show (quests · factions
  · NPCs) and retire "threads" from `shell.countStory`. Sidebar.tsx is owned by open RC-CAN-7.4 and
  RC-POL-1.23 — this is a one-line count change and belongs in the vocabulary story below, sequenced
  after CAN-7.4.
- **KNW-3 (high) — One thing, four names.** Evidence: faction objects are "Factions" on Story
  (`campaign-tab-Factions.png`), "Story entry" in the Graph legend and results (`graph.kind.object`,
  `demo-graph.png`), "Story entries · 3" in the Notes filter panel (`notes-search-panel.png`), and
  "Note" in the wikilink autocomplete rows (probe 2, `autocomplete`: "Brine Hand — Note"). Quests
  appear as "Quest hook · The missing shipment — Note" in the graph. Impact: the GM cannot predict
  where a thing lives or what a filter will return. Fix: one kind vocabulary (Note, Quest, Faction,
  NPC, Map, Place) resolved from the object subtype, shared by the autocomplete, the Graph legend and
  results, the Notes filter kinds and the palette groups.
- **KNW-4 (medium) — The seed models a faction as a note.** Evidence: fresh vaults carry a note
  titled "Faction · The Ashen Hand" beside three faction objects (`knowledge-desktop.png`,
  `campaign-tab-Factions.png`), so the Factions tab shows three factions while Notes shows a fourth
  as prose. Impact: the demo teaches the wrong pattern on the first screen. Fix: seed the Ashen Hand
  as a faction object with its lore as the dossier body; `demo-seed.ts` is owned by open RC-CAN-7.6,
  so the change rides with the vocabulary story after it.
- **KNW-5 (medium) — An NPC's story home is a combat sheet.** Evidence: the Story › NPCs cards show
  AC and HP only (`campaign-tab-NPCs.png`) and open `/characters/:id`, whose first panels are skills,
  attacks and XP (`npc-click-target.png`). Nothing on either surface shows the NPC's faction, the
  notes that mention them, or where they are. Impact: a narrative NPC (a ferryman) is presented as a
  monster stat block. Fix: an NPC card on Story that shows relationship edges and backlinks and
  offers "Add relationship" inline, without touching the character sheet (CHR lane).

### Capture and the editor

- **KNW-6 (high) — Text typed just before leaving the editor is lost silently.** Evidence: probe 1
  typed " more words", clicked Story within the 1.2 s autosave window (`useNoteAutosave.ts:21`), and
  the body on return lacked them; no dialog appeared (`dialogOnNav: none`, `bodyAfterReturn`). Impact:
  a mid-session note loses its last sentence with no warning. Fix: flush the pending draft on route
  change, `visibilitychange` and `beforeunload`; keep the confirm-dialog only for a write that fails.
- **KNW-7 (medium) — Two save models on one screen.** Evidence: the editor autosaves ("Unsaved
  changes" → "Saved 2:46 PM", role=status) and also shows a gold "Save note" primary beside Cancel
  and a red Delete (`editor-desktop.png`). Impact: the GM does not know whether Cancel discards what
  autosave already wrote, and Delete sits where a thumb lands on a phone (`editor-phone.png`). Fix:
  autosave is the model; "Save note" becomes "Done" (exit edit mode), Cancel becomes "Discard
  changes" only while a draft is unsaved, Delete moves to the note's overflow menu with a confirm.
- **KNW-8 (medium) — New note lands in read mode with focus on `<body>`.** Evidence: Enter in the
  composer navigates to `/knowledge/:id` (`knowledge/index.tsx:135`) whose body is empty; the GM must
  find Edit; entering Edit leaves `document.activeElement` on `<body>` (`focusOnEdit: "BODY"`,
  `bodyFocused: false`). Capture cost today: New note → title → Enter → Edit → click body → type →
  Done (4 clicks before the first body character). Impact: mid-session capture is slower than a
  sticky note. Fix: a created note opens in edit mode with the body focused; Edit focuses the body
  (or the title when empty); Ctrl/⌘+N on /knowledge opens the composer.
- **KNW-9 (medium) — Templates are not offered at the moment of creation.** Evidence: the composer
  is a single title field (`knowledge-New-note.png`); templates live in a separate Templates panel with
  a select and required fields (`knowledge-Templates.png`); the slash menu lists them too. Impact: a
  GM who wants a session recap starts blank and discovers templates later, or never. Fix: the composer
  gains an optional "Start from" chip row (blank, Session recap, Faction brief, Quest outline,
  Location lore, your templates) sourced from the same template store.
- **KNW-10 (low) — Toolbar as text chips, split preview always on.** Evidence: Bold / Italic /
  Heading / List … are labelled chips, not icons (`editor-desktop.png`), wrapping to two rows on a
  phone (`editor-phone.png`); the desktop preview pane shows "This note is empty." beside an empty
  editor. Fix: Lucide icons with tooltips (one icon family, §0.3 rule 5), preview collapsed until the
  note has content or the GM toggles it, the hint line kept.
- **KNW-11 (low) — Wikilink autocomplete labels every row "Note".** Evidence: probe 2 `autocomplete`
  lists "Brine Hand — Note" for a faction object. Covered by KNW-3.

### Finding things

- **KNW-12 (medium) — "Search" on Notes is a filter panel; the palette is search.** Evidence: the
  Notes button labelled "Search" (`knowledge.filters.open: 'Search'`) opens a panel with "Words to
  find", Kinds, Tags, Folder, Linked to and saved searches (`notes-search-panel.png`); the top bar
  "Search everything…", the sidebar magnifier, the phone magnifier and Graph's "Search the vault" all
  open the palette; Graph has its own "Search the graph…" filter. The 2026-09-12 five boxes are now
  two systems behind five entry points. Impact: a GM types the same word in two places and gets two
  differently shaped answers. Fix: rename the Notes panel "Filter" (icon `filter`), give the palette
  a "Refine in Notes" row that carries the query into the filter panel, and let the Graph search box
  say "Filter the graph".
- **KNW-13 (medium) — Saved searches are discoverable only inside the filter panel.** Evidence:
  `SavedSearches.tsx` renders inside the panel; pinned ones become Command Center tiles, but the Notes
  list itself shows no chips. Fix: saved searches as chips above the note grid; covered by the filter
  story below.
- **KNW-14 (low) — Note cards repeat the kind label.** Evidence: every card on a page titled Notes
  carries "Note" (`knowledge-desktop.png`); tags and folder show only when present. Fix: drop the
  kind label on the Notes grid (keep it where kinds mix); show link count and tags in the meta line.

### Graph

- **KNW-15 (high) — Node labels break mid-word and overlap.** Evidence: "Smug glers' Cach e",
  "Harbo r Town", "Facti on · The Ashen Hand" (`graph-desktop.png`); at 19 nodes three labels overprint
  (`demo-graph.png`). Root cause: `src/screens/graph/graph.css:13` `overflow-wrap: anywhere` inside a
  fixed-diameter circle. Impact: the graph is unreadable at exactly the size a real campaign reaches.
  Fix: label outside the node (below, with a halo), truncation with the full title in the tooltip and
  aria-label, and a collision pass that nudges labels.
- **KNW-16 (high) — No labels on phones.** Evidence: node buttons render an icon only; the title is
  aria-only (`phoneGraphLabels`, `graph-phone.png`). Impact: a phone user sees sixteen anonymous
  circles. Fix: a list-first phone layout (the search results list is already the graph's index) with
  the canvas behind a "Show map" toggle, or labels on the selected node and its neighbours.
- **KNW-17 (medium) — The empty graph shows analytics panels.** Evidence: a vault with zero notes
  shows Search, "No results for this filter", "Dormant arcs · 0 active arcs", and "Every arc has moved
  recently" (`emptyvault-graph.png`). Fix: one empty state with a first action (New note, Import a
  markdown vault); the analytics panels mount at ≥3 linked notes (the UX-3.5 maturity signal).
- **KNW-18 (low) — "Graph & search" is named for its mechanism.** Evidence: the More sheet entry is
  "Graph & search · Relationships", the page subtitle is "Explore the notes, places and connections
  you can see". Frozen by §1.6 D6 until RC-UX-5.5; noted for that review only.

### Story

- **KNW-19 (medium) — Timeline dead-ends on a cross-screen instruction.** Evidence: "No campaign
  date set — set it from the Session screen." (`campaign.timeline.noDate`, `emptyvault-campaign-timeline.png`).
  Fix: a "Set the campaign date" action in place that dispatches the same command Session uses.
- **KNW-20 (medium) — Relationships live on a sub-route, away from the cards.** Evidence:
  `/campaign/relationships` is a bare form (From select, free-text verb, To select); faction cards
  and NPC cards have no "Relationships" section and no add affordance. Fix: an inline relationship
  list with "Add" on every faction, quest and NPC card, the sub-route kept as the overview table.
- **KNW-21 (low) — The NPCs tab creates nothing here.** Evidence: the empty state says "NPCs and
  monsters you create in Characters appear here" and "New NPC" navigates away
  (`Campaign.tsx:453-470`). Acceptable once KNW-5 gives the card a story purpose; the copy is honest.

### Out of scope, noted in passing

- The sidebar's live-scene row includes a `<style>` element inside the button, so its accessible
  name begins "@keyframes dndPulse{0%{transform:scale(1" (keyboard probe, tab stop 8) — app shell,
  RC-POL-1.23.
- "Create vault" in the switcher adds the vault but does not open it; the dialog stays open and the
  GM must click the new vault's row (`dialogStill`, probe 3) — RC-UX-5.4 follow-up, not KNW.

## 3. Proposed stories (epic KNW-6 — One knowledge model, P3)

Current state (2026-09-29): KNW-1–5 and the Notes and Graph polish passes are done; the surfaces are
finished individually and disagree with each other (findings KNW-1–5, 12, 15, 16). The epic makes
Notes, Story and Graph three views of one model with one vocabulary, and makes capture and linking
fast enough for the table. No schema bump: relationships stay body-encoded, links stay wikilinks.

- **RC-KNW-6.1 — Link targets: characters, factions, quests and places from any note.** `M` · P3 ·
  Deps: CAN-7.6 · Owns: `packages/core/src/queries/wikilink-graph.ts`,
  `packages/core/src/queries/note-relationships.ts`, `packages/core/src/queries/content-search.ts`,
  `apps/gm-react/src/app/editor/Autocomplete.tsx`, `apps/gm-react/src/app/editor/NoteEditor.tsx`,
  `apps/gm-react/src/screens/knowledge/markdown.tsx`, `apps/gm-react/src/screens/knowledge/NoteViewer.tsx`,
  `apps/gm-react/src/screens/campaign/Relationships.tsx`, `docs/architecture/KNOWLEDGE.md`. Current
  state: `[[` completes notes and note-backed objects only; a character is not a link target
  (finding KNW-1) and the Relationships editor's endpoints are `kind === 'note'`. What to build: the
  wikilink resolver and the autocomplete accept characters visible to the actor (through
  `listCharactersForActor`), faction and quest objects, maps and points of interest, each with its
  kind word; a resolved `[[Mira the Ferryman]]` renders as a link to `/characters/:id` and appears in
  that character's Backlinks; unresolved links keep today's repair path; the Relationships editor's
  From and To lists include the same kinds, grouped, and its verb field shows the existing vocabulary
  (`Relationships.tsx:30`) as suggestions; a player never sees a DM-only target (the actor-scoped
  reads decide). Acceptance: core tests resolve and reject each kind per actor; an isolation test proves
  a player's autocomplete omits DM-only characters; e2e on both profiles types `[[Mi`, picks the NPC,
  follows the link, and sees the note under the character's backlinks; a relationship NPC → faction
  "leads" round-trips through the body and the graph.
- **RC-KNW-6.2 — One kind vocabulary across Notes, Story, Graph and search.** `S` · P3 · Deps: 6.1,
  CAN-7.4, CAN-7.6 · Owns: `packages/core/src/queries/graph-visualization-query.ts`,
  `apps/gm-react/src/screens/graph/presentation.ts`, `apps/gm-react/src/screens/graph/Search.tsx`,
  `apps/gm-react/src/screens/knowledge/Filters.tsx`, `apps/gm-react/src/screens/knowledge/NoteListMetadata.tsx`,
  `apps/gm-react/src/app/CommandPalette.tsx`, `apps/gm-react/src/app/shell/Sidebar.tsx`,
  `apps/gm-react/src/runtime/demo-seed.ts`, `docs/reference/GLOSSARY.md`. Current state: findings
  KNW-2, 3, 4, 11, 14. What to build: a single `kindLabel(view)` that maps note-backed objects by
  subtype to Quest, Faction, Place and everything else to Note, NPC, Map; the Graph legend and results,
  the Notes filter "Kinds", the palette groups and the autocomplete rows read it; the Notes grid drops
  the "Note" label and shows link count and tags; the sidebar's Story line becomes "quests · factions"
  (NPCs stay on Characters) and `shell.countStory` loses "threads"; the seed's "Faction · The Ashen
  Hand" note becomes a faction object whose dossier carries the lore. Acceptance: a unit test asserts
  the same label for one object on every surface; the ES catalog updated; the e2e that asserted the
  seed note title is updated in the same change; `demo-seed.showcase.test.ts` counts four factions.
- **RC-KNW-6.3 — Capture in two actions: create-and-edit, focus, flush on leave.** `M` · P3 · Deps:
  none · Owns: `apps/gm-react/src/screens/knowledge/index.tsx`, `apps/gm-react/src/screens/knowledge/Composer.tsx`,
  `apps/gm-react/src/screens/knowledge/NoteViewer.tsx`, `apps/gm-react/src/app/editor/NoteEditor.tsx`,
  `apps/gm-react/src/app/editor/useNoteAutosave.ts`, `apps/gm-react/src/app/editor/Toolbar.tsx`,
  `apps/gm-react/src/app/shortcuts/registry.ts`. Current state: findings KNW-6, 7, 8, 10. What to
  build: a created note opens in edit mode with the body focused; Edit focuses the body (title when
  empty); the pending draft is written on route change, `visibilitychange` and `beforeunload`, and only
  a failed write raises the confirm; autosave is the one save model, so "Save note" becomes "Done",
  Cancel becomes "Discard changes" and is present only while a draft is unsaved, and Delete moves to
  the note's overflow menu behind a confirm; the toolbar uses Lucide icons with tooltips and the desktop
  preview pane is collapsed until the note has content; Ctrl/⌘+N on /knowledge opens the composer
  through the UX-3.3 registry. Acceptance: e2e on both profiles: New note → title → Enter → type →
  navigate away within 1 s → return shows the full body (fails on the current tree); the focused
  element after create and after Edit is the body; axe clean; `knowledge.spec.ts` selector-only edits.
- **RC-KNW-6.4 — Start from a template at creation, and the filter panel says what it is.** `S` ·
  P3 · Deps: 6.3 · Owns: `apps/gm-react/src/screens/knowledge/Composer.tsx`,
  `apps/gm-react/src/screens/knowledge/Templates.tsx`, `apps/gm-react/src/screens/knowledge/Filters.tsx`,
  `apps/gm-react/src/screens/knowledge/SavedSearches.tsx`, `apps/gm-react/src/screens/graph/Search.tsx`,
  `apps/gm-react/src/app/CommandPalette.tsx`. Current state: findings KNW-9, 12, 13. What to build:
  the composer shows a "Start from" chip row (Blank first, then built-in and user templates) that
  opens the template's required fields inline and creates through `content.create-from-template`; the
  Notes "Search" button becomes "Filter" with the `filter` icon and the saved searches render as chips
  above the grid whether or not the panel is open; the palette adds a "Refine in Notes" row that opens
  /knowledge with the query in the filter panel; the Graph box reads "Filter the graph…". Acceptance:
  e2e creates a session recap from the composer in three actions; a saved search chip filters the grid;
  the palette handoff preserves the query; the ES catalog updated.
- **RC-KNW-6.5 — Graph labels that can be read, and a phone layout that lists first.** `M` · P3 ·
  Deps: 6.2 · Owns: `apps/gm-react/src/screens/Graph.tsx`, `apps/gm-react/src/screens/graph/graph.css`,
  `apps/gm-react/src/screens/graph/presentation.ts`, `apps/gm-react/src/screens/graph/clusters.tsx`,
  `apps/gm-react/src/screens/graph/Health.tsx`, `apps/gm-react/src/screens/graph/Search.tsx`. Current
  state: findings KNW-15, 16, 17. What to build: labels sit below the node with a halo, truncate at
  two lines with the full title in the tooltip and aria-label, and a collision pass nudges overlapping
  labels; the node diameter scales with degree, not with the label; on the phone tier the results list
  is the primary view and the canvas opens behind a "Show map" toggle that labels the selected node and
  its neighbours; an empty vault shows one empty state with New note and Import actions, and the
  Search, Clusters and Dormant arcs panels mount only once the UX-3.5 graph signal is reached.
  Acceptance: a visual snapshot of the demo vault at 1440 with no overlapping label boxes (a test
  measures label rects); e2e on the phone profile reaches every node by name through the list; axe
  clean; `graph-polish.spec.ts` green with selector-only edits.
- **RC-KNW-6.6 — Relationships on the cards, and an NPC with a story home.** `M` · P3 · Deps: 6.1,
  6.2, POL-1.10 · Owns: `apps/gm-react/src/screens/Campaign.tsx`, `apps/gm-react/src/screens/campaignRows.ts`,
  `apps/gm-react/src/screens/campaign/FactionEditor.tsx`, `apps/gm-react/src/screens/campaign/QuestEditor.tsx`,
  `apps/gm-react/src/screens/campaign/Relationships.tsx`, `apps/gm-react/src/screens/campaign/Calendar.tsx`.
  Current state: findings KNW-5, 19, 20, 21. What to build: every faction, quest and NPC card on Story
  shows its relationship edges (from 6.1's read) and the notes that mention it, with an inline "Add
  relationship" that dispatches the same body write as the sub-route; the NPC card replaces AC and HP
  with faction, place and last-mentioned note and keeps "Open sheet"; the Timeline's missing-date
  state offers "Set the campaign date" in place (the Session command, no new state); the Relationships
  sub-route stays as the overview table. Acceptance: e2e on both profiles adds NPC → faction "leads"
  from the faction card and sees it on the NPC card and in the graph; a player preview shows no
  DM-only edge; the timeline date can be set without leaving Story; axe clean.
- **RC-KNW-6.7 — Knowledge golden path.** `S` · P3 · Deps: 6.1, 6.3, 6.4, 6.6, ENG-8.1 · Owns:
  `apps/gm-react/tests/e2e/golden-path.spec.ts`, `docs/development/TESTING.md`. Current state: the
  ENG-8.1 prep journey creates one note; nothing holds capture, linking and finding together. What to
  build: a fifth journey on both profiles: capture a note mid-session in two actions, link an NPC and a
  faction from its body, add a relationship from the faction card, find the note by a body word in the
  palette within two seconds of typing it, and see it in the graph with a readable label; the journey
  asserts no console error, no dead-end copy that names another screen, and the ENG-8.1 overflow
  detector. Acceptance: the spec runs in the manifest's browser gate; each assertion fails on a seeded
  defect; TESTING.md lists the journey.

Sequencing note: 6.3 and 6.4 touch only Notes and editor files and can run now; 6.1 waits for
CAN-7.6 only because `demo-seed.ts` is adjacent work, and could be re-sequenced first if CAN-7.6
stalls; 6.2 waits for CAN-7.4 (Sidebar.tsx) and CAN-7.6 (demo-seed.ts); 6.6 waits for POL-1.10
(Campaign files). None touches `src/ds`, so no RC-DSN dependency.

## 4. Not checked

- The markdown folder round trip (KNW-5.1) needs a directory picker; the Sources panel's "Connect
  folder…" cannot be driven headless. The paste-import path was opened but not exercised.
- Revision history restore and the conflict notice were not re-run (covered by `knowledge.spec.ts`).
- Light theme and the other three themes (RC-DSN-1.2 is blocked; the app rendered its default theme).
- The player-side view of Notes and Graph was not sampled; the graph's "Player view" toggle was
  disabled on the fresh vault ("Add a player in Settings to preview the player viewpoint").
- Tablet width was screenshotted for Notes only (`knowledge-tablet.png`, no defects seen).
