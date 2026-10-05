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

## Retry after claim gate (2026-10-03)

- Gate feedback: the eight companion paths from the first attempt were outside the claim. The task
  claim now lists all eight (render.tsx, Select.tsx, CharacterSheet.tsx, graph/Repair.tsx,
  knowledge/index.tsx, vault-object.ts, graph-link-repair-query.ts, state/note-relationships.ts),
  so commit dbb857db stays as it is with no code changes. The only other changed paths are tests,
  the core barrel export and this journal, and the gate didn't flag those.
- Re-verified on this branch: `packages/core/tests/wikilink-target-kinds.test.ts` 10/10 passed;
  `pnpm typecheck` (core, cloud-fns, gm-react) exit 0.
- Integration note: `git merge-tree loop/rc HEAD` reports one content conflict, in
  `apps/gm-react/src/screens/campaign/Relationships.tsx`, against c876b757 (Story polish: canAuthor
  gating, remove-confirm Dialog, spacing tokens). Resolving it means keeping loop/rc's canAuthor/Dialog/token
  changes and this task's grouped From/To options. I didn't rebase, so the claim diff stays against
  the recorded base.
- No agents, push, promotion, dispatcher control changes or new loop.

## Rebase onto integration 6dcb0a00 (2026-10-03)

- Gate feedback: rebasing onto 6dcb0a00 conflicted in `campaign/Relationships.tsx`. I rebased the
  branch myself and fixed it by taking the integration version (canAuthor gating, remove-confirm
  Dialog, EmptyState, spacing tokens) and re-applying this task's hunks on top: actor-scoped
  `buildWikilinkCandidatesForActor` endpoints, `runtime.state` passed to the edge query, per-storage
  write commands, and kind-grouped From/To options.
- Removing a relationship now asks for confirmation, so the RC-KNW-6.1 NPC → faction e2e confirms
  through the dialog before it asserts the edge is gone.
- Verified after the rebase: `pnpm typecheck` exit 0; full core suite 285 files / 5,194 tests passed;
  e2e `campaign-relationships.spec.ts` + `knowledge.spec.ts` 56 passed on desktop-chromium and
  mobile-chromium (DNDTOOLS_E2E_PORT=43255); ESLint and Prettier clean on the changed files.
- No agents, push, promotion, dispatcher control changes or new loop.

## Independent-review collision repair (2026-10-03)

- Review reproduced a faction selection resolving to a same-title note because declarations store
  titles. To now filters with autocomplete's resolution-identity check against the original actor
  candidate order; From retains ID-addressed sources. Add revalidates the current target identity
  and disables stale selections after a collision appears.
- Added browser regressions for cross-kind title and alias collisions, including a selected target
  becoming shadowed, reload, and renaming the shadowed target to restore a valid persistent relationship.
- No Headroom tools exposed; native command output used. No agents or dispatcher control changes.
- First browser run exposed random UUID ordering in the fixture: creation order does not determine
  content resolution priority. The regression now explicitly selects the later-ID note/faction and
  introduces a collision on the earlier-ID entity, including an alias sorted after the target title.
- Read original local logs under `/tmp/rc-knw-6.1-collision-*.log`. Final verification:
  - Core link-kind/isolation and relationship suites: 28 tests passed.
  - Relationship editor: 12 browser tests passed across desktop-chromium and mobile-chromium.
  - NPC completion/navigation/Backlinks and faction/quest navigation: 4 browser tests passed across
    both profiles.
  - Pinned-container campaign-card visual comparisons: 3 tests passed, no snapshot updates.
  - Workspace typecheck, changed-code ESLint, changed-file Prettier, `pnpm gates` and
    `git diff --check` passed. Quality gates emitted existing file-size warnings only.
- Central wrapper gates and independent review remain separate. No push or promotion.

## Independent-review unavailable-target collision repair (2026-10-03)

- Started from clean candidate a683d41e. No Headroom tools exposed; inspected native exact output.
- Reproduced the review defect with title and alias collisions: an unavailable actor-visible
  Obsidian note shadowed a visible NPC in the resolver but incorrectly gave that NPC backlinks.
  Both regression cases failed against the original implementation after correcting the fixture's
  autocomplete assertion to allow the distinct DM-only NPC in DM reads.
- Relationship records now retain the complete actor-visible candidate order and availability.
  Unavailable records reserve their first-match names, while backlinks, related jumps and typed
  edges suppress unavailable sources and targets. Existing pure callers default to available.
- Regression coverage checks DM and player reads, resolver status, autocomplete identity,
  backlinks, forward jumps, unavailable-source suppression and typed declarations.
- Focused core validation passed: 5 files / 70 tests, including both new regressions.
- Changed-code ESLint, Prettier, git diff --check, workspace typecheck and quality gates passed.
  Quality gates emitted existing file-size warnings only. Browser/visual suites were not rerun for
  this core resolution repair; central wrapper gates and independent review remain separate.
- No agents, push, promotion, new loop or dispatcher control changes.

## Post-rebase visual gate triage (2026-10-05)

- Wrapper visual run ec0189a8 at 3d07a669: 452 passed, 1 failed — `visual-desktop` golden routes
  tavern `/board` (0.35 pixel ratio). The other eight `/board` captures (parchment and
  high-contrast desktop, plus every rail and phone theme) passed in the same run.
- The received image shows the App `Boot` Suspense fallback ("Loading your vault…") in the main
  pane while the shell had already rendered. A lazy surface chunk had not arrived at capture time.
  This is the known cold dev-server chunk stall, not a rendering change. The branch does not touch
  the board or DM-screen surfaces.
- Re-ran in the pinned container: `run-in-container.sh tests/visual/golden-routes.spec.ts -g
  "/board" --repeat-each=3` gave 27 passed (desktop tavern 3/3), exit 0, with no snapshot updates
  and no baseline changes (log `/tmp/rc-knw-6.1-visual-board.log`). No re-baseline. The full
  wrapper visual gate still needs a retry from the central operator.
