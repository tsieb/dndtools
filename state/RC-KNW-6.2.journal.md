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

## Attempt 5 — 2026-10-08: rebase onto `9752d983` (RC-POL-1.1)

Gate feedback: the rebase onto `9752d983` conflicted in nine baselines, desktop
`command-center--{high-contrast,parchment,tavern}` and `scenes--*`, and rail `command-center--*`.
Upstream (RC-POL-1.1, 7 commits) redrew the Command Center and scene authoring. It also touched
`en.ts`/`es.ts`/`qps-ploc.ts` and the CAN-7.6 `CommandCenter.baseline` snapshot, but none of
this story's code paths.

- `git rebase 9752d983`: the code, e2e and catalog commits applied cleanly. In the visual commit the
  nine PNGs were resolved to upstream's version (`--ours` during the rebase), then regenerated below.
- Merged catalogs: `tsx scripts/i18n-catalog.ts pseudo` produced no diff. Typecheck (core + app)
  exit 0. `pnpm test:app`: 2140/2141. The one failure was mine: `help/changelog.test.ts` forbids code
  spans in "For players and GMs", and my bullet said `` `[[` ``. It now says "the link menu you
  open by typing two square brackets"; the test passes 16/16 (`e4c6ad79`). The merged `CommandCenter.baseline` snapshot passes
  unchanged. `pnpm lint` exit 0.
- Visual, full compare on the rebased tree: 521 passed, 10 failed. Nine were exactly the conflicted
  baselines: desktop `/` and `/scenes` and rail `/`, ×3 themes, 124–320 px. Those are this story's
  sidebar Story/Notes counts and the Home Library line on upstream's new layout. The tenth was rail
  characters-empty tavern (element not found, the known stall).
- Regenerated only those (`-g "golden routes .* /(scenes)?$"`, desktop + rail, 12 passed, exactly
  the nine rewritten). Recompressed losslessly with the same Zopfli script (1,339,000 → 950,874 B).
  Budget 33,677.9 of 34,816 KiB. Compare re-run including rail characters-empty: 22 passed.
- E2E on both profiles, upstream's `command-center-polish` plus knowledge-filters, command-palette,
  tile-content-recovery and campaign-relationships: 92 passed.

Note for `-g`: Playwright matches the title path joined by spaces, not `›`.

## Attempt 6 — 2026-10-08: independent review, requested changes on `ae066a7b`

Review findings and what changed:

1. **Saved kind filters did not round-trip (medium).** The core's `normalizeSearchFilter` keeps
   content types only, so no owned file can store "Factions but not Quests" (`state/saved-search.ts`
   and the search query are outside the claim, and the operator brief forbids widening). The review's
   second option is taken: never save a broader search silently, and reload exactly what was saved.
   `Filters.tsx`:
   - The kind state is `FilterKind[] | null`. `null` (a loaded saved search, a cleared panel) narrows
     by the stored content types only, so the panel lists exactly what the saved search re-runs (and
     what its Command Center tile shows); the chips show every kind those types cover. An old
     object-only saved search therefore lists generic objects again (`kindsForTypes` now selects any
     kind whose types intersect). Toggling a chip switches to picked kinds.
   - Picking some but not all of the kinds the core returns for `object` (Notes, Quests, Factions,
     and NPC/Map when offered) shows `knowledge.filters.saveBroadens` above the saved-search form:
     "A saved search can't tell notes, quests, factions, NPCs and maps apart yet, so saving this one
     keeps all of them." (en + es, `qps-ploc.ts` regenerated.)
   - Carrying the kind criterion through saved searches needs a core `SearchFilter` field; handoff
     below.
2. **Graph and autocomplete disagreed for `character`/`map` objects (medium).** `kindWordFor` now
   reads the object's subtype for every word (`switch` on `kind === 'object' ? subtype : kind`), so
   an object and its wikilink target, which carries the subtype as its kind, always agree:
   `character` object → NPC, `map` object → Map. Both subtypes are projections of a roster
   character / an Atlas map (`vault-object-schema.ts` `modelReference`), so NPC/Map is the right word.
   Knock-ons, kept small:
   - `presentation.ts`: `opensInStory(node)`; `useOpenGraphNode` sends every object that is not a
     quest/faction to Notes (a `character`/`map` object is note-backed).
   - `Inspector.tsx` (widened path): the open button label uses `opensInStory` and the node's
     `entity` (map/POI → "Open in maps", otherwise "Open note"); one expression plus the import.
     Without it a `character`/`map` object would have said "Open in maps" and opened a note.
   - `Filters.tsx`: NPC and Map chips (types `object`), shown only while a visible object has that
     word, so the seeded panel is unchanged.
3. **"Note" label on grid cards (low, scope gap).** Not done: the span is `t('knowledge.note')` in
   `screens/knowledge/index.tsx`, outside the claim, and the brief forbids widening further. **This
   requested behavior is unfinished**; it needs an authorized one-line follow-up in `index.tsx`.

Tests:

- Core `graph-visualization.test.ts`: `kindWordFor('object','character'|'map')`, and a new case
  creating faction/character/map objects through `content.create-object` and asserting the graph
  node word equals `kindWordFor(suggestWikilinkTargetsForActor(...).kind)`.
- `kindVocabulary.test.tsx` (+4): a `character` and a `map` object read NPC/Map on the Graph row
  (and "Open note" in the inspector), the Notes filter chip, the palette group/meta and the `[[`
  label; Factions-only shows the notice, all object kinds hide it, the saved filter is
  `{query, contentTypes:['object']}` and reopening lists exactly `saved.result.hits`; an object-only
  saved search lists a `note`-subtype object under Notes. Negative control: with the four source
  files at `ae066a7b` the four new tests fail and the six old ones pass (`/tmp/rc-knw62-negctl`).

Validation on this tree: core + app typecheck exit 0; eslint on changed files clean; prettier clean.
Core vitest 290 files / 5290 tests passed; `pnpm test:app` 176 files / 2145 tests passed;
`changelog.test.ts` 16/16. E2E desktop + mobile (`DNDTOOLS_E2E_PORT=5863`): knowledge-filters,
graph, graph-polish, graph-repair, command-palette, knowledge, map-room-graph,
campaign-relationships — 176 passed (`/tmp/rc-knw62-e2e7.log`). No visual run: the seed holds no
`character`/`map` object (no Graph, chip or inspector change on seeded data) and no visual spec opens
the filter panel; no baseline changed.

Handoffs added: (a) a core `SearchFilter` kind criterion (`state/saved-search.ts` normalization +
the search query) so saved searches and their consumers keep Quests/Factions/Notes apart; (b) the
`index.tsx` grid-card "Note" label (item 3).

No push, promotion, loop or dispatcher-state edits.

## Attempt 7 — 2026-10-08: Browser acceptance red on `98086009` (post-rebase)

Gate run `a9a5bbdc`: one failure, `tile-resize.spec.ts:21`, on both profiles. The spec arrived with
the new base `1028592b` (RC-CAN tile resize). It asserts `expect(data.notes).toHaveLength(6)`, where
`data.notes` is every `kind === 'note'` content item. This story moves "Faction · The Ashen Hand" out
of notes and into a faction object, so the seed now has five notes. The log shows `Received length: 5`
with the five remaining titles. The desktop retry #2 instead timed out waiting for the Resize
menuitem; that is a load stall earlier in the same test, not a separate defect (it passed 4/4 below).

Fix: the count becomes 5, plus a one-line comment. The spec is outside the claim; this is the minimal
crossing the acceptance criterion asks for ("the e2e that asserted the seed … is updated in the
same change"). The Prep tile's `count: 6` stays: it is a cap, and all five notes must still render
whole.

Validation: `tile-resize.spec.ts` desktop + mobile, `--repeat-each=2 --retries=0`
(`DNDTOOLS_E2E_PORT=5871`) passed 12/12. prettier + eslint on the file are clean. I did not re-run the
full suite.

## Self-heal round 1 — 2026-10-10: remove the Notes grid kind label

The operator widened the claim to `screens/knowledge/index.tsx` after independent review of
`8daecd20` found the redundant `Note` span still rendered on every grid card. This supersedes the
scope-gap handoffs above: the requirement is now implemented by deleting that single span. The
book icon, visibility chip and adjacent `NoteListMetadata` (link count and tags) remain intact.
No other production source changed.

Validation for this follow-up:

- Focused app tests: `kindVocabulary.test.tsx`, `NoteListMetadata.test.tsx`,
  `demo-seed.showcase.test.ts`, and `i18n/index.test.ts`: 4 files, 48 tests passed.
- Prettier and ESLint on `screens/knowledge/index.tsx`: passed; `git diff --check`: passed.
- Pinned-container visual update, `-g '/knowledge' --update-snapshots=changed`: 24 passed.
  Nine golden Notes PNGs changed (three themes across desktop, rail and phone); all nine were
  opened and visually inspected. The 15 card-corner captures remain unchanged.
- Baseline budget: 822 files, 34050.2 KiB of 34816.0 KiB, passed.
- Pinned-container visual comparison, `-g '/knowledge' --update-snapshots=none`: 24 passed
  (53.1 seconds), confirming the saved baselines.

Headroom tools are not exposed in this session; original command output was read directly.
Visual logs: `/tmp/rc-knw62-selfheal-visual.log` and
`/tmp/rc-knw62-selfheal-visual-compare.log`. Full wrapper gates and independent review remain with
the central operator. No push, promotion, new dispatcher loop or dispatcher control-state edits.

## Gate follow-up — 2026-10-10: visual timeouts outside the Notes change

Current rebased candidate: `e11bc39a223a98ba498dcbe9855f11c4546f7a43`; working tree was clean.
Read the original gate output directly (Headroom tools are not exposed):
`/home/trinkle/Programming/agent-dispatcher/.state/attempts/cb70bc68-d68c-4946-8d44-4f6c0f65b922/output.log`.
The full pinned-container run had 543 passes and 3 failures; all 24 Notes visual tests passed.
Failures were five-second timeouts, not reported pixel differences:

- Desktop Audio / tavern: screenshot capture of `audio-loading--tavern.png` timed out after fonts
  loaded (`golden-routes.spec.ts:237`).
- Desktop Player / tavern: `character-sheet` was absent; the saved error context shows
  `Loading your vault…` (`player-polish.spec.ts:15`).
- Rail Atlas / scholar: the empty-library illustration was absent; the saved error context shows
  `Loading your vault…` (`atlas.spec.ts:32`).

Reproduction on unchanged source and baselines:

```sh
apps/gm-react/tests/visual/run-in-container.sh \
  --project=visual-desktop --project=visual-rail \
  -g 'Audio polish — tavern.*loading and failure|player sheet tavern|atlas empty scholar' \
  --repeat-each=3 --retries=0 --workers=2 --update-snapshots=none
```

Original local output: `/tmp/rc-knw62-gate-repro.log`, read through its final diagnostics.
Result: **16 passed, 2 failed**, exit 1 (1.2 minutes). The first desktop Atlas run timed out
waiting for the illustration; the first desktop Audio run timed out capturing `audio-error`
(the original gate had stalled at `audio-loading`). Subsequent repetitions of both passed;
Player passed all six repetitions. This reproduces intermittent readiness/capture failures,
not a deterministic Notes baseline regression. It does not establish their underlying cause
or constitute a green visual gate.

No source or baseline changes were justified within this task's claim. The label removal and its
nine Notes baselines remain committed. The visual gate is still unresolved; the operator needs a
separately scoped visual-harness/readiness follow-up for the three test locations above. Do not
waive the gate based on the successful repetitions. This commit records evidence only. No push,
promotion, new loop, dispatcher control-state edits, timeout increases or snapshot rewrites.
