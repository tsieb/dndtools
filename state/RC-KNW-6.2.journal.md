# RC-KNW-6.2 — One kind vocabulary across Notes, Story, Graph and search

## Session 1 — 2026-10-07

Started on `dispatch/dndtools/2680175096d5e223e4db` at `515d714c` (RC-CAN-7.6 on top; KNW-6.1,
6.3, 6.4 and POL-1.22/1.23 already in history) with a clean tree. No Headroom tools are exposed in
this session; command output is read directly or kept in `/tmp/rc-knw62-*.log`.

Inputs read: RC_ROADMAP KNW-6 epic, friction review `knowledge.md` (KNW-2/3/4/11/14), the KNW-6.1
and 6.4 journals, the manifest fence (`owns` + `companion_paths` + `journal_paths`).

### Where each surface names a kind today

| Surface                                  | Code                                                                               | Ashen Hand-style faction object reads     |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| Graph legend, canvas, results, inspector | `graph/presentation.ts` `KIND_LABEL[node.kind]`, `node.kind` = structural `object` | "Story entry"                             |
| Notes filter Kinds                       | `knowledge/filterModel.ts` `TYPE_LABEL` per search content type                    | "Story entries · n"                       |
| ⌘K palette                               | `shortcuts/palettePresentation.ts` `HIT_PRESENTATION.object`                       | group "Story entries", meta "Story entry" |
| `[[` autocomplete                        | `editor/Autocomplete.tsx` `wikilinkKindLabel`                                      | "Factions" (plural tab label, since 6.1)  |
| Sidebar Story line                       | `shell/Sidebar.tsx` `shell.countStory`                                             | notes counted as "threads"                |

### Plan

- Core: one `kindWordFor(kind, subtype)` in `graph-visualization-query.ts` → `note | quest |
faction | npc | map | place`. The graph view model's `node.kind` becomes that word (the structural
  kind moves to `node.entity`), so every graph surface that already keys on `node.kind` reads it.
- App: `kindLabel` + the label/plural tables in `graph/presentation.ts`; the palette, the Notes
  filter and the autocomplete call it.

### What shipped (`8d51b6e2`)

- **Core** (`graph-visualization-query.ts`): `ContentKindWord`, `CONTENT_KIND_WORDS` and
  `kindWordFor(kind, subtype)`. A note-backed object is a Quest or a Faction by subtype and a Note
  otherwise; `character` → NPC, `map` → Map, `poi` → Place. It takes a content item kind + subtype,
  a graph node kind, or a wikilink target kind (where an object's kind is its subtype) — one function
  for every shape a surface holds. `GraphVizNode.kind` is now the kind word and the structural kind
  moved to `GraphVizNode.entity`; facets and the kind filter are kind words. Exported from `index.ts`.
- **App label** (`graph/presentation.ts`): `KIND_LABEL` / `KIND_PLURAL_LABEL` over the new `kind.*`
  catalog keys and `kindLabel(kind, subtype, t, form)`. `KIND_COLOR`/`KIND_ICON` keyed by kind word,
  so `Graph.tsx` (legend, canvas node labels) reads the vocabulary unchanged. `useOpenGraphNode`
  routes on `entity` (an object that is a Note by word opens in Notes, quests/factions on Story).
- **Graph Search.tsx**: facet chips and result meta read `KIND_LABEL[node.kind]`.
- **Notes filter** (`Filters.tsx`): Kinds chips are Notes, Quests, Factions, Places, Handouts, Rolls.
  The core filters by content type, so each kind maps to the types it needs (`typesForKinds`) and
  quests/factions/other objects — all `object` — are told apart by subtype among the hits the core
  returned. Counts and the match count are over that narrowed list. A saved search still stores
  content types; loading one selects the kinds those types cover (`object` → Quests + Factions).
- **Palette** (`CommandPalette.tsx`): note/object/POI hits group under the plural kind word and carry
  the singular as meta; subtypes come from `getContentItemsForActor`, the actor's own read.
- **Autocomplete**: `wikilinkKindLabel` delegates to `kindLabel` (see crossings).
- **Notes card** (`NoteListMetadata.tsx`): distinct `[[target]]` count beside the tags, read from the
  same projected body as the tags (`knowledge.card.links`).
- **Sidebar**: `shell.countStory` is `{quests} quests · {factions} factions`, counted from objects by
  subtype; "threads" is gone. `home.count.campaign` (the Home library tile, which already counted
  quests) had the same "threads" word; its message now says quests too (catalog only).
- **Seed**: "Faction · The Ashen Hand" is no longer a note. It is the first `DEMO_FACTIONS` entry
  ("The Ashen Hand", cult, hostile, dm-only) whose dossier body is the old lore. The wikilink appends
  link it by its new title (the append pass now reads notes and objects). The showcase's typed
  relations are declared by the notes that point at it (`is served by`, `hosts the rites of`, the
  quest hook's `stolen by`) — `relations:` front matter on the dossier body would become the
  Factions card's one-line summary (`campaignRows.bodySummary` reads the first body line).
- **Catalogs**: `kind.*` (6 singular + 6 plural), `knowledge.card.links`, `shell.countStory`,
  `home.count.campaign` in en and es; `qps-ploc.ts` regenerated.
- **Glossary**: a "Kind word" row with the six words.

### Crossings outside `owns` (acceptance-driven, minimal)

- `apps/gm-react/src/app/editor/Autocomplete.tsx` — `wikilinkKindLabel`'s private table (which said
  "Factions"/"Quests" since 6.1) is replaced by a call to `kindLabel`. The autocomplete is one of
  the surfaces the acceptance unit test covers; there is no owned file it can be fixed from.
- `apps/gm-react/src/screens/graph/Inspector.tsx` — one condition (`=== 'object'` →
  `=== 'quest' || === 'faction'`). Forced by the type change: making `node.kind` the kind word is
  what lets the Graph legend in `Graph.tsx` read the vocabulary without touching that file.

Companion files touched: catalogs, `qps-ploc.ts`, `*.test.ts(x)`, the CAN-7.6 `__snapshots__`,
e2e specs (`knowledge-filters`, `command-palette`, `knowledge`, `campaign-relationships`).

### Acceptance evidence

- Unit, same label on every surface: `screens/graph/kindVocabulary.test.tsx` seeds a real Core with
  the real demo seed and checks the Ashen Hand reads "Faction" on the Graph screen (result meta,
  facet chip, legend, inspector badge, no "Story entry" anywhere), is counted under "Factions · 1" in
  the Notes filter, sits in the palette's "Factions" group with "Faction" meta, and is "Faction" in
  the `[[` autocomplete composition `NoteViewer` uses; plus the Spanish words. Negative control:
  restoring the old `Autocomplete.tsx` and dropping the subtype from the graph node kind fails three
  of its six tests.
- ES catalog: every new and changed key has Spanish (`i18n/index.test.ts` parity passes).
- E2E: no spec asserted the old seed note title (the only hits were `state/RC-CAN-7.5`
  captures). `knowledge-filters.spec.ts` gains "the seeded Ashen Hand is a faction, not a note"
  (absent from the Notes grid, under Factions in the filter, on Story › Factions) and its kind-facet
  test moves from `filters-type-object` to `filters-type-faction`; `command-palette.spec.ts` gains
  the Factions-group hit. The 6.1 specs that pinned "Character" / "Factions" now expect "NPC" /
  "Faction".
- Showcase: `demo-seed.showcase.test.ts` counts four factions and asserts the Ashen Hand is one
  object, subtype faction, whose body starts with the lore.

### Handoffs (not acceptance; outside the claim)

- The Notes grid card still prints "Note" above the title: that span is in
  `screens/knowledge/index.tsx` (`t('knowledge.note')`), not in `NoteListMetadata.tsx`. Dropping it
  is a one-line removal there; per the RC-POL-1.17 / RC-KNW-6.4 fence rulings it is not crossed for a
  non-acceptance item. Link count and tags now show on the card.
- A PC in the `[[` autocomplete and the Relationships lists reads "NPC": the wikilink target kind is
  `character` for every character (`queries/wikilink-graph.ts`, KNW-6.1's file), so the label cannot
  tell a PC from an NPC. The story's vocabulary has no PC word; carrying the character kind on the
  target would let a PC keep its own word.
- Two other surfaces still say "Story entry" for objects and are outside this story's list:
  `screens/play/Handouts.tsx` (`graph.kind.object`) and `screens/characters/sheet/BioPanel.tsx`
  (a hard-coded English literal).

### Validation (session 1)

- Typecheck (core + app): clean. `pnpm lint`: exit 0 (16 pre-existing warnings, no errors).
- Core vitest: 290 files, 5289 tests passed. App vitest (`pnpm test:app`): 175 files pass after the
  CAN-7.6 baseline snapshots were refreshed (`-u`); the only diff in them is the two count lines
  ("0 quests · 4 factions", "5 notes").
- E2E targeted (knowledge-filters, command-palette, campaign-relationships, knowledge, graph,
  graph-polish, campaign; desktop + mobile): 170 passed, 2 failed — both
  `campaign-relationships` on mobile, caused by the spec's own fixture note reusing the title "The
  Ashen Hand", which the seed now also holds (ambiguous `selectOption` label and a three-item
  "collision pair"). The fixture is renamed "The Cinder Court"; re-run 22/22 (with graph-polish).
- E2E full suite, desktop + mobile, `DNDTOOLS_E2E_PORT=5847`: 1908 passed, 38 skipped, 4 failed —
  `tile-content-recovery.spec.ts:87` at 1280 and 834 on both profiles. The default home Quick
  Reference tile lists vault objects; with four factions it overflows and shows "2 more lines ·
  Grow to fit". That is the designed overflow, so the spec now lists it as overflowing (asserting the
  footer) instead of among the tiles that must render whole (`35fd7d70`); re-run 14/14.
- Visual (pinned container), compare against the base baselines: 434 passed, 82 failed. Expected
  movers: every desktop route (the sidebar's Story and Notes counts), `/knowledge` and graph-polish
  on all three tiers (no Ashen Hand note card, link counts; Note/Faction/Map/Place legend and
  chips), `/` and `/board` on desktop and rail (home Library count, Quick Reference overflow), and
  the campaign faction card. Two failures outside that set (phone `scene-editor-polish` scholar,
  rail `/audio named deletion` parchment) were 5 s stability timeouts, not pixel diffs.
- Re-baselined with `--update-snapshots=changed`: 514 passed, 2 failed (phone `characters-polish`
  empty dungeon and `palette-help` high-contrast — timeouts, nothing written). Exactly 120 PNGs were
  rewritten, all in the expected set above (checked by listing the changed files per spec/route).
- Playwright writes uncompressed PNGs, so the set came to 38,127 KiB of the 34,816 KiB budget.
  Recompressed the 120 losslessly (`/tmp/rc-knw62-tools/zrepng.py`): IDAT unfiltered, the original
  filters and filter 0 each Zopfli-deflated, the smaller kept, decoded pixels asserted identical, all
  other chunks unchanged — 17,003,288 → 11,654,359 bytes. Budget 32,903.4 of 34,816 KiB (base
  33,745.6).
- Verification, compare mode over the full set: 516 passed.

No push, promotion, loop or dispatcher-state edits.

## Attempt 2 — 2026-10-07: the fence refused the two crossings

Gate feedback: `apps/gm-react/src/app/editor/Autocomplete.tsx` and
`apps/gm-react/src/screens/graph/Inspector.tsx` are outside the claim. Re-examined each against the
acceptance line ("a unit test asserts the same label for one object on every surface"); both are
kept, so the task blocks for the operator to decide on widening the claim. Nothing else changed.

- **Autocomplete.tsx is required.** The `[[` row's word comes from `wikilinkKindLabel`, defined in
  this file and called from `NoteViewer.tsx` (not owned either) with the target kind from
  `queries/content-search.ts` (not owned). Its private table maps `faction` → `campaign.tab.factions`
  ("Factions") and `quest` → `campaign.tab.quests`, catalog keys the Story tabs also use, so no owned
  file or catalog value can make the row say "Faction". Reverting it fails the acceptance test's
  autocomplete case (`kindVocabulary.test.tsx`, negative control in session 1).
- **Inspector.tsx is required by any design that puts the word on every Graph surface.** The legend
  and canvas live in `Graph.tsx` and the inspector badge in `Inspector.tsx`; all of them read
  `KIND_LABEL[node.kind]` / `facets.kinds`, so the only owned lever is the value of `node.kind`. Making
  it the kind word leaves `Inspector.tsx`'s `selNode.kind === 'object'` (the Open-in-Story button
  label) a type error: reverting the file gives `Inspector.tsx(81,9): error TS2367 … '"quest" |
"faction" | "npc" | "map" | "place"' and '"object"' have no overlap`. The alternative (keep
  `node.kind` structural, add a separate word field) leaves the legend, the canvas node labels and the
  inspector badge saying "Story entry" unless `Graph.tsx` and `Inspector.tsx` are edited instead,
  which is a larger crossing. The one-condition change is the smallest.

## Attempt 3 — 2026-10-08: claim widened by the operator

The operator widened the claim to `apps/gm-react/src/app/editor/Autocomplete.tsx` and
`apps/gm-react/src/screens/graph/Inspector.tsx`, keeping the diffs as small as they were. No code
changed in this attempt: the two diffs against `515d714c` are the same (Autocomplete: the private
table replaced by `kindLabel`, +5/−13; Inspector: one condition, 1 line). Every other changed path is
owned, a manifest companion, or this journal.

Re-checked on `089f0ddb`: `pnpm --filter @dndtools/gm-react typecheck` exit 0; vitest
`kindVocabulary.test.tsx`, `demo-seed*.test.ts` and `i18n/index.test.ts` — 4 files, 40 tests passed
(`/tmp/rc-knw62-acc.log`). Session 1's full e2e, pinned visual (516 passed) and budget results stand;
no source changed since.

No push, promotion, loop or dispatcher-state edits.

## Attempt 4 — 2026-10-08: Visual regression gate red on `596c9434`

Gate log `.state/attempts/25255ad2-…/output.log`: 512 passed, 4 failed, all on `visual-phone` and
none on a baseline this story changed:

| Case                                                           | Failure                                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| characters-polish "characters empty tavern"                    | `svg[data-illustration="characters-empty"]` not found in 5 s                      |
| extensions-polish parchment "/extensions named remove confirm" | `toHaveScreenshot` 5 s timeout waiting on the package card                        |
| golden-routes tavern `/characters`                             | 13,642 px (5%) — the actual frame is "Loading your vault…" (vault never rendered) |
| player-polish "player sheet high-contrast"                     | `getByTestId('character-sheet')` not found in 5 s                                 |

The `/characters` diff image shows a blank page with "Loading your vault…" over the expected card
list. That is a load stall, not a rendering change: phone `/characters` has no sidebar, and nothing
on it reads the seed's factions or the kind words. HEAD equals the gated SHA, `loop/rc` has nothing
new, and no changed path touches these baselines.

- Re-run of those four specs on `visual-phone` (pinned container): 96 passed
  (`/tmp/rc-knw62-visual4.log`).
- Full compare on the same head: 514 passed, 2 failed — desktop play-polish "play stage scholar" and
  phone `/audio named deletion` scholar, both 5 s timeouts, again untouched baselines and a different
  pair (`/tmp/rc-knw62-visual5.log`). Re-run of those specs (all themes, all tiers): 90 passed
  (`/tmp/rc-knw62-visual6.log`).
- Session 1's full compare on the same tree passed 516/516.

Each full run on this machine has hit 2–4 such stalls on a rotating set of routes (session 1:
phone scene-editor, rail `/audio` delete, phone characters-empty, phone palette-help; this attempt:
the six above), which matches the known cold dev-server chunk stall in the pinned container. No code
or baseline changed in this attempt; nothing here can be fixed inside the claim.
