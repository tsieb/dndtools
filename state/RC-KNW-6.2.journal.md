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
