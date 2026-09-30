# RC-KNW-6.1 run journal

## Implementation (2026-09-29)

- Clean task worktree at start; no Headroom tools exposed. No agents spawned.
- Extending the existing actor-filtered wikilink candidates with optional character/map/session
  domains, reused by autocomplete and relationship queries. Reads use listCharactersForActor
  and getMapViewForActor (including delivered map context).
- Relationship bodies use existing content bodies, character data.body, map descriptions and
  POI notes. Writes use existing validated commands, without a second edge store.
- Necessary companion changes outside the listed implementation paths: public query type exports,
  CharacterSheet Backlinks rendering, Select optgroup support, and acceptance tests. Existing
  editor and markdown rendering already support callback navigation and kind labels.
- Validation in progress. No push, promotion, dispatcher changes or additional loop.

## Completed implementation and verification

- Character links render as anchors to `/characters/:id`; Backlinks use resolved graph edges.
  Faction/quest objects now open their body through Knowledge's existing detail renderer, while
  the library list remains note-only. Map/POI links use the Atlas deep-link query parameters.
- Added first-match collision handling to the relationship engine to match wikilink resolution.
  Autocomplete suppresses shadowed duplicate titles. Map/POI aliases and heading sections are
  derived from their visible bodies, matching relationship records.
- Repair preview, repair authorization and the existing repair command receive the same domain
  context. Valid character links no longer appear in bulk repair, and unresolved links can be
  repaired to visible characters.
- Additional necessary companion paths: shared markdown renderer (real anchor semantics), Knowledge
  detail lookup (object bodies), graph repair query/screen/command plumbing, and relationship name
  matching. Existing NoteEditor and Knowledge markdown wrapper needed no behavior changes.
- Initial test fixture corrections: the command is `map.create-poi`; observers cannot read character
  data under the existing role ceiling; repair preview normalizes broken target names to lowercase.
  These corrections changed test expectations/fixtures, not actor policy.

Exact local output was read from `/tmp/rc-knw-6.1-*.log`:

- Full core suite: 284 files / 5,170 tests passed before the final collision/repair regression additions.
- Final focused core run: 5 files / 66 tests passed, including 10 new kind/isolation/backlink/repair/
  collision/round-trip tests and existing editor, relationship and repair suites.
- Final browser run: 10 passed across desktop-chromium and mobile-chromium. Covers NPC completion,
  kind label, anchor navigation, Backlinks return, faction/quest detail navigation, NPC → faction
  body persistence after reload, graph removal, and existing note completion/relationship behavior.
- Shared markdown renderer/tokenizer: 2 files / 42 tests passed.
- Pinned Playwright container visual comparison for Knowledge, Characters and Campaign: 27 passed
  across desktop/tablet/phone and three themes. No snapshot updates.
- Workspace typecheck passed across core, cloud-fns and gm-react. Boundary lint passed.
- `pnpm gates` passed (6 gates and docs reachability); existing file-size warnings only.
- Final changed-file ESLint, Prettier and `git diff --check` passed.

No agents, push, promotion, dispatcher control changes or new loop. Central operator gates and
independent review remain separate from this implementation commit.
