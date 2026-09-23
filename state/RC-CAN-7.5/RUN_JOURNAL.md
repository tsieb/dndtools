# RC-CAN-7.5 run journal — owned-path revision

## Scope and provenance

2026-09-19. Starting HEAD: `8e893374`, clean worktree. Applied the supplied docs-research
instructions. No repository AGENTS.md was found. The earlier candidate and its evidence are
already on this task branch; this revision preserves all 27 ARIA snapshots and 41 screenshots.
Their original capture date and source baseline remain 2026-09-16 / `83f94aabb28cf188630d30e56f9d301d2773fb26`.
The [historical journal](HISTORICAL_JOURNAL.md) records the original capture procedure and
historical gates; those results are not rerun results for this revision.

The 2026-09-18 operator brief explicitly adds the planning index and this evidence directory to
Owns. Only `docs/planning/SCREENS_PARITY.md`, `docs/planning/README.md`, and
`state/RC-CAN-7.5/` are changed. The historical sibling journal was subsequently relocated into this directory; see the capture repair below.

## Changes and reasons

- Correct the existing inventory rather than create another topic document. Source inspection
  and saved ARIA show editable dice textboxes and the active-map selector off-session; the
  recap snapshot contains one archive, its editor and 14 capture checkboxes. Correct the
  opposite claims. Add the previously unmapped toast Dismiss control and dice history actions.
- File RC-WID-5.6–5.11 as open stories in SCREENS_PARITY §4.2, with explicit gap IDs, sizes,
  dependencies, owned implementation paths and acceptance criteria. This is the local planning
  backlog; no scheduler registration or implementation is claimed. The operator can register
  the filed entries without inventing their scope. CAN-7.6 must retain unsupported behaviours.
- Minimal planning-index change: link the filed backlog from its existing parity paragraph so
  reviewers and conversion owners can discover it. No roadmap/control-state edit is needed to
  record the stories in this owned document.
- `control-coverage.json` records exact ARIA controls, variants, file/line occurrences and SHA-256
  hashes. `verify-evidence.py` checks that none is missing, duplicated, altered or assigned to a
  nonexistent row; it checks all ten gap assignments and all 27 baseline screenshot files.
  It is a frozen-evidence audit, not a browser test or automatic semantic review.
- Final registry review found no Schedule builtin: file G-10 / RC-WID-5.11 for the host calendar
  action, inventory configured controls from SchedulePanel, and clarify that CombatBody is a
  summary rather than the full Session tracker. No calendar API was invoked.
- This journal supersedes the historical journal's “proposed, not filed” status. Screenshot and
  ARIA provenance is retained. The deleted capture harness cannot be reproduced literally;
  the document now states that limitation instead of presenting a placeholder as a runnable command.

## Screenshot set

Each link is an original full-page capture. Tiers: desktop 1440×900, rail 900×800, phone 390×844.
Themes were set before boot. This revision checks file presence and format, not a fresh capture.

| Route / tier      | Tavern                                        | Parchment                                           | High contrast                                               |
| ----------------- | --------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| home / desktop    | [tavern](screens/home-desktop-tavern.webp)    | [parchment](screens/home-desktop-parchment.webp)    | [high-contrast](screens/home-desktop-high-contrast.webp)    |
| home / rail       | [tavern](screens/home-rail-tavern.webp)       | [parchment](screens/home-rail-parchment.webp)       | [high-contrast](screens/home-rail-high-contrast.webp)       |
| home / phone      | [tavern](screens/home-phone-tavern.webp)      | [parchment](screens/home-phone-parchment.webp)      | [high-contrast](screens/home-phone-high-contrast.webp)      |
| board / desktop   | [tavern](screens/board-desktop-tavern.webp)   | [parchment](screens/board-desktop-parchment.webp)   | [high-contrast](screens/board-desktop-high-contrast.webp)   |
| board / rail      | [tavern](screens/board-rail-tavern.webp)      | [parchment](screens/board-rail-parchment.webp)      | [high-contrast](screens/board-rail-high-contrast.webp)      |
| board / phone     | [tavern](screens/board-phone-tavern.webp)     | [parchment](screens/board-phone-parchment.webp)     | [high-contrast](screens/board-phone-high-contrast.webp)     |
| session / desktop | [tavern](screens/session-desktop-tavern.webp) | [parchment](screens/session-desktop-parchment.webp) | [high-contrast](screens/session-desktop-high-contrast.webp) |
| session / rail    | [tavern](screens/session-rail-tavern.webp)    | [parchment](screens/session-rail-parchment.webp)    | [high-contrast](screens/session-rail-high-contrast.webp)    |
| session / phone   | [tavern](screens/session-phone-tavern.webp)   | [parchment](screens/session-phone-parchment.webp)   | [high-contrast](screens/session-phone-high-contrast.webp)   |

Additional captured states:

- [board-desktop-add-panel](screens/board-desktop-add-panel.webp)
- [board-desktop-edit](screens/board-desktop-edit.webp)
- [board-desktop-layouts-panel](screens/board-desktop-layouts-panel.webp)
- [board-desktop-preview-observer](screens/board-desktop-preview-observer.webp)
- [dialog-encounter-builder](screens/dialog-encounter-builder.webp)
- [home-desktop-no-scenes](screens/home-desktop-no-scenes.webp)
- [home-desktop-preview-observer](screens/home-desktop-preview-observer.webp)
- [home-desktop-preview-player](screens/home-desktop-preview-player.webp)
- [session-desktop-active](screens/session-desktop-active.webp)
- [session-desktop-live-combat](screens/session-desktop-live-combat.webp)
- [session-desktop-prep](screens/session-desktop-prep.webp)
- [session-desktop-preview-player](screens/session-desktop-preview-player.webp)
- [session-desktop-recap](screens/session-desktop-recap.webp)
- [session-phone-live-combat](screens/session-phone-live-combat.webp)

The `session-desktop-preview-player` screenshot corresponds to Recap, as its ARIA filename says.
The observed state limitations (loading, populated optional integrations, remaining dialogs,
real participant devices, locale, reduced motion) are listed in SCREENS_PARITY §5.

## Validation

Run from the repository root:

```sh
python3 state/RC-CAN-7.5/verify-evidence.py
pnpm exec prettier --check docs/planning/SCREENS_PARITY.md docs/planning/README.md state/RC-CAN-7.5/RUN_JOURNAL.md state/RC-CAN-7.5/control-coverage.json
pnpm gates
pnpm check
```

- Evidence verifier: exit 0; 877 occurrences / 211 distinct control records, 27 unchanged ARIA
  captures, all 27 baseline screenshot files, all ten gap assignments.
- Prettier check: exit 0 for both planning files, this journal and the crosswalk.
- `pnpm gates`: exit 0; 255 reachable documents / 303 resolved relative links. File-size warnings
  concern product files untouched by this revision.
- `pnpm check`: exit 0 (81.175 seconds); system validation, Android static preflight, gates,
  boundary lint, all three typechecks, and four test groups passed: 4,811 + 482 + 1,386 + 187
  tests (6,866 total). It emitted React `act(...)` environment warnings; no failed suite.
  This is not Android compilation or an e2e browser run.
- Retrieved the complete original Headroom check stdout (126,460 bytes) and stderr (379,728 bytes),
  plus exact gate/format/verifier output, before recording these results. Check artifact:
  `7bd6e8abe6e3486985515a82ee7f0b6d`; stdout SHA-256:
  `89aafd3959f6e8675b6a030b125d8e80379ffddf8ce335883aecbc554b191328`.
- No product implementation changed, so no new browser suite or recapture was run. Operator gates
  and independent review remain separate. Final prose/format edits were checked again before commit.

## Format-gate repair — 2026-09-19

Starting HEAD: `e3cc90a9e5f747185dff599b0ab60445364b11d7`, clean worktree. The operator's
Format (changed) log (`81f9a27d-d922-4d4d-a8a6-d49b268b2bef`) reports 27 YAML formatting warnings.
Its command is `pnpm format:check:changed --base loop/rc`, which selects 32 files across the whole
candidate. The earlier four-file check omitted the original ARIA captures; its success did not
establish that the operator's format gate passed.

- Format only the 27 owned `aria/*.yaml` files with the repository's Prettier configuration.
  This changes indentation, scalar quoting and final newlines, not observed UI content.
- Compare every formatted tree with its pre-repair tree using `yaml.parse` and
  `assert.deepStrictEqual`: all 27 match. The original bytes remain in Git at `e3cc90a9`.
- Refresh the crosswalk's hashes, scalar spelling and line references without changing any
  control-to-row assignment. All 877 occurrences remain covered. No screenshots were recaptured
  or changed. These edits and this journal entry stay under the owned evidence directory.
- Keep the earlier source/test findings as historical validation; this formatting-only repair
  does not claim a new browser run or a new full `pnpm check` run.

Reproduce semantic preservation from the repository root:

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import YAML from 'yaml';
const dir = 'state/RC-CAN-7.5/aria/';
for (const name of fs.readdirSync(dir).filter((name) => name.endsWith('.yaml'))) {
  const path = dir + name;
  const before = execFileSync('git', ['show', 'e3cc90a9:' + path], { encoding: 'utf8' });
  assert.deepStrictEqual(YAML.parse(fs.readFileSync(path, 'utf8')), YAML.parse(before), name);
}
console.log('PASS: 27 ARIA trees retain their captured content.');
JS
python3 state/RC-CAN-7.5/verify-evidence.py
pnpm format:check:changed --base loop/rc
pnpm gates
```

Repair validation: all commands above passed. The exact operator format command checked all 32
candidate files; the evidence verifier retained 877 occurrences / 211 distinct controls and all
10 gap assignments; quality gates found 258 reachable documents and 310 resolved links, with
file-size warnings only. `git diff --check` passed. Original Headroom outputs were retrieved
before recording these results (format artifact `cd5b8bea8dc64621b00dcfc17f16d577`).

## Independent-review coverage repair — 2026-09-19

Starting HEAD: `8dbdd12a1233d5475bde5a8fdb6a0d26cc3f60c9`; worktree clean.
Used the supplied docs-research skill. No Headroom tools were available in this session;
commands below were read directly. No repository AGENTS.md found. No additional agents used.

The review correctly identified shipped controls missing from the historical baseline. Read
Board, AddWidgetGallery, CombatTracker, InitiativeCallParts, the gallery keyboard spec,
initiative command tests and Sheet focus implementation/tests before updating the inventory.
The correction stays within SCREENS_PARITY and this evidence directory. README needs no further
change: its existing link already exposes the inventory and filed WID backlog.

- Preserve all 27 historical ARIA files and 41 images unchanged. Their old baseline is history,
  not complete evidence of the reviewed source. Add BD-27/28 and SE-34–37, correct BD-06's
  availability, placement and phone Sheet contracts, and extend existing sized WID assignments.
- Fresh route checks also found the seeded Map now bound to Ruined Keep. Correct BD-20 and mark
  D-06 historical; inventory its zoom, fit and enabled editor actions.
- Retain `capture-refresh.ts`: nine isolated browser contexts, fresh local demo vault per context,
  three themes set before boot, desktop 1440×900 / rail 900×800 / phone 390×844.
  It drives real gallery open/search and initiative-call/selection controls. Workflow setup uses
  the DEV seam and asserts acceptance. It does not call an external model or calendar provider.
- Initial refresh exposed a route-transition race: the generic helper could return while the
  previous route remained mounted. Crosswalk inspection caught home controls labelled board and
  board controls labelled Session. Added explicit route-specific readiness assertions and reran
  the entire harness successfully; only the corrected output is retained. No product defect claim.
- All 72 new ARIA captures and 72 lossless WebP images are prefixed `refresh-`. Gallery snapshots
  include its own region/dialog root; route captures use main. Phone sheet contains h2 and Done.
  Screenshots use fullPage but the app has internal scrolling: they show the visible viewport,
  while ARIA includes offscreen controls. Visually inspected the phone gallery and desktop
  selected-combatant screenshots; no exhaustive visual or keyboard audit is claimed.
- Crosswalk maps all current and historical control occurrences. Verifier adds required controls
  for each refreshed state, preventing the reviewed omissions or wrong-route capture from passing
  merely through matching a stale manifest. It checks nine screenshots per refreshed state.
  It cannot prove every conditional state of the application has been visited.
- Preview/read-only, empty-party, incoming network roll, invalid adjustment and unavailable-library
  states in the added rows are source contracts. Local browser capture proves the live DM path,
  zero-result search and current seed. No multi-device session, adjustment submission or start-round
  outcome is claimed. Source-backed gaps remain filed/assigned as described in §4; scheduler
  registration is still pending operator handoff, not changed by this docs task.

### Reproduce the refresh

From repository root, start Vite in a separate terminal using an unused isolated port:

```sh
cd apps/gm-react
VITE_CLOUD_REGION='' VITE_COGNITO_USER_POOL_ID='' VITE_COGNITO_CLIENT_ID='' \
VITE_SIGNALING_WS_URL='' VITE_SYNC_API_URL='' VITE_APP_API_URL='' \
VITE_PUBLIC_APP_URL='' VITE_GOOGLE_CLIENT_ID='' \
pnpm exec vite --host 127.0.0.1 --port 15751 --strictPort
```

Then from repository root (`magick` and installed Playwright Chromium required):

```sh
PARITY_URL=http://127.0.0.1:15751 pnpm exec tsx state/RC-CAN-7.5/capture-refresh.ts
pnpm exec prettier --write 'state/RC-CAN-7.5/aria/refresh-*.yaml'
```

Recapture intentionally requires reviewing/updating crosswalk line references and hashes; generated
captures are not automatically approved by the verifier. The existing committed crosswalk binds
this reviewed set, not arbitrary future runs. Shut down the isolated Vite process afterward.

### Refreshed screenshot index

Each cell links one lossless image from the corrected run; corresponding ARIA has the same stem.

| State / tier                  | Tavern                                                            | Parchment                                                               | High contrast                                                                   |
| ----------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| home / desktop                | [tavern](screens/refresh-home-desktop-tavern.webp)                | [parchment](screens/refresh-home-desktop-parchment.webp)                | [high-contrast](screens/refresh-home-desktop-high-contrast.webp)                |
| home / rail                   | [tavern](screens/refresh-home-rail-tavern.webp)                   | [parchment](screens/refresh-home-rail-parchment.webp)                   | [high-contrast](screens/refresh-home-rail-high-contrast.webp)                   |
| home / phone                  | [tavern](screens/refresh-home-phone-tavern.webp)                  | [parchment](screens/refresh-home-phone-parchment.webp)                  | [high-contrast](screens/refresh-home-phone-high-contrast.webp)                  |
| board / desktop               | [tavern](screens/refresh-board-desktop-tavern.webp)               | [parchment](screens/refresh-board-desktop-parchment.webp)               | [high-contrast](screens/refresh-board-desktop-high-contrast.webp)               |
| board / rail                  | [tavern](screens/refresh-board-rail-tavern.webp)                  | [parchment](screens/refresh-board-rail-parchment.webp)                  | [high-contrast](screens/refresh-board-rail-high-contrast.webp)                  |
| board / phone                 | [tavern](screens/refresh-board-phone-tavern.webp)                 | [parchment](screens/refresh-board-phone-parchment.webp)                 | [high-contrast](screens/refresh-board-phone-high-contrast.webp)                 |
| board-gallery / desktop       | [tavern](screens/refresh-board-gallery-desktop-tavern.webp)       | [parchment](screens/refresh-board-gallery-desktop-parchment.webp)       | [high-contrast](screens/refresh-board-gallery-desktop-high-contrast.webp)       |
| board-gallery / rail          | [tavern](screens/refresh-board-gallery-rail-tavern.webp)          | [parchment](screens/refresh-board-gallery-rail-parchment.webp)          | [high-contrast](screens/refresh-board-gallery-rail-high-contrast.webp)          |
| board-gallery / phone         | [tavern](screens/refresh-board-gallery-phone-tavern.webp)         | [parchment](screens/refresh-board-gallery-phone-parchment.webp)         | [high-contrast](screens/refresh-board-gallery-phone-high-contrast.webp)         |
| board-gallery-empty / desktop | [tavern](screens/refresh-board-gallery-empty-desktop-tavern.webp) | [parchment](screens/refresh-board-gallery-empty-desktop-parchment.webp) | [high-contrast](screens/refresh-board-gallery-empty-desktop-high-contrast.webp) |
| board-gallery-empty / rail    | [tavern](screens/refresh-board-gallery-empty-rail-tavern.webp)    | [parchment](screens/refresh-board-gallery-empty-rail-parchment.webp)    | [high-contrast](screens/refresh-board-gallery-empty-rail-high-contrast.webp)    |
| board-gallery-empty / phone   | [tavern](screens/refresh-board-gallery-empty-phone-tavern.webp)   | [parchment](screens/refresh-board-gallery-empty-phone-parchment.webp)   | [high-contrast](screens/refresh-board-gallery-empty-phone-high-contrast.webp)   |
| session / desktop             | [tavern](screens/refresh-session-desktop-tavern.webp)             | [parchment](screens/refresh-session-desktop-parchment.webp)             | [high-contrast](screens/refresh-session-desktop-high-contrast.webp)             |
| session / rail                | [tavern](screens/refresh-session-rail-tavern.webp)                | [parchment](screens/refresh-session-rail-parchment.webp)                | [high-contrast](screens/refresh-session-rail-high-contrast.webp)                |
| session / phone               | [tavern](screens/refresh-session-phone-tavern.webp)               | [parchment](screens/refresh-session-phone-parchment.webp)               | [high-contrast](screens/refresh-session-phone-high-contrast.webp)               |
| session-active / desktop      | [tavern](screens/refresh-session-active-desktop-tavern.webp)      | [parchment](screens/refresh-session-active-desktop-parchment.webp)      | [high-contrast](screens/refresh-session-active-desktop-high-contrast.webp)      |
| session-active / rail         | [tavern](screens/refresh-session-active-rail-tavern.webp)         | [parchment](screens/refresh-session-active-rail-parchment.webp)         | [high-contrast](screens/refresh-session-active-rail-high-contrast.webp)         |
| session-active / phone        | [tavern](screens/refresh-session-active-phone-tavern.webp)        | [parchment](screens/refresh-session-active-phone-parchment.webp)        | [high-contrast](screens/refresh-session-active-phone-high-contrast.webp)        |
| session-call / desktop        | [tavern](screens/refresh-session-call-desktop-tavern.webp)        | [parchment](screens/refresh-session-call-desktop-parchment.webp)        | [high-contrast](screens/refresh-session-call-desktop-high-contrast.webp)        |
| session-call / rail           | [tavern](screens/refresh-session-call-rail-tavern.webp)           | [parchment](screens/refresh-session-call-rail-parchment.webp)           | [high-contrast](screens/refresh-session-call-rail-high-contrast.webp)           |
| session-call / phone          | [tavern](screens/refresh-session-call-phone-tavern.webp)          | [parchment](screens/refresh-session-call-phone-parchment.webp)          | [high-contrast](screens/refresh-session-call-phone-high-contrast.webp)          |
| session-adjust / desktop      | [tavern](screens/refresh-session-adjust-desktop-tavern.webp)      | [parchment](screens/refresh-session-adjust-desktop-parchment.webp)      | [high-contrast](screens/refresh-session-adjust-desktop-high-contrast.webp)      |
| session-adjust / rail         | [tavern](screens/refresh-session-adjust-rail-tavern.webp)         | [parchment](screens/refresh-session-adjust-rail-parchment.webp)         | [high-contrast](screens/refresh-session-adjust-rail-high-contrast.webp)         |
| session-adjust / phone        | [tavern](screens/refresh-session-adjust-phone-tavern.webp)        | [parchment](screens/refresh-session-adjust-phone-parchment.webp)        | [high-contrast](screens/refresh-session-adjust-phone-high-contrast.webp)        |

### Repair validation

- Corrected browser harness: exit 0, all 72 state/theme/tier captures produced with route and
  missing-control assertions. One final type-only cleanup replaced three explicit `any` types
  after ESLint rejected them; harness ESLint then passed. No runtime logic changed in that cleanup.
- Evidence verifier: exit 0, 3,886 occurrences / 257 distinct row-control records, 99 ARIA captures,
  27 historical baseline and 72 refresh screenshot combinations, ten assigned gaps.
- ImageMagick decoded all 113 WebP files. Byte comparison against starting HEAD verified all
  68 historical ARIA/image artifacts unchanged.
- `pnpm gates`: exit 0, six quality gates; 258 reachable docs / 317 resolved relative links.
  Existing product file-size warnings only. Full original command output inspected.
- Explicit Prettier check across the matrix, journal, crosswalk, harness and all 99 YAML files
  passed. `pnpm format:check:changed` (working-tree mode) passed. The pre-commit
  `--base loop/rc` command only selected the 32 previously committed files, so its result alone
  was not used to validate this revision. `git diff --cached --check` passed.
- No full `pnpm check`, general browser suite, typecheck or independent review result is claimed
  for this repair. The central operator runs its candidate gates and review after this commit.

## Capture omissions and ownership repair — 2026-09-19

Starting HEAD `cfa8754f699a77d684b957bff0cf014bd65fff35`; clean worktree.
Review base: `16dd3e7ef62ae2d8dbd8f4eff97d6a02a645044c`. No Headroom tools available;
read command outputs directly. No additional agents used.

- Read Capture.tsx, Session handlers/useSessionView, SceneRuntime preview guard, Panel heading
  implementation and session-capture.spec.ts before editing. SE-39–41 cover archive selection,
  bounded filtering and continuity actions; SE-22 links those details. Extend existing G-02,
  G-06 and G-07 assignments and filed WID-5.7/5.9 acceptance. No product edits.
- Give Outcome toast the unique SE-38 ID and update Dismiss crosswalk records. Verifier now
  rejects duplicate IDs before resolving mappings and requires the four omitted signatures.
- Move the historical sibling journal into HISTORICAL_JOURNAL.md, preserving its content, and
  update its link. This removes the out-of-scope addition from the complete base-to-candidate
  delta. README has no new edit; its previously authorized index link remains minimal.
- Retain capture-conditional.ts. Run against the isolated cloud-disabled Vite command above,
  then `pnpm exec tsx state/RC-CAN-7.5/capture-conditional.ts`. Fresh local demo per theme/tier;
  accepted DEV commands create two archives and 16 synthetic notes. Real UI filtering selects
  a note then enters a nonmatching query; assertion confirms the selected checkbox remains.
  Real UI save produces the continuity group; Create is clicked and the NPC record asserted.
- Setup retries exposed tsx function naming in page.evaluate, an unset home scene and illegal
  recap-to-prep setup transition. Harness supplies the naming helper, uses a seeded scene
  fallback and transitions through idle. Only the successful final captures are retained.
- Eighteen new ARIA files and lossless panel screenshots cover both states at all nine combinations.
  These panel-scoped captures supplement the retained route captures; they are not whole-page
  captures. Busy/rejection, preview with a retained suggestion, and Not now activation remain
  source-inspected contracts. No exhaustive keyboard, screen-reader or participant-device test
  is claimed. Conditional states no longer rely on the initial seed's 14-checkbox snapshot.

### Conditional screenshot index

| State / tier                 | Tavern                                                           | Parchment                                                              | High contrast                                                                  |
| ---------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| capture filter / desktop     | [tavern](screens/refresh-capture-filter-desktop-tavern.webp)     | [parchment](screens/refresh-capture-filter-desktop-parchment.webp)     | [high-contrast](screens/refresh-capture-filter-desktop-high-contrast.webp)     |
| capture filter / rail        | [tavern](screens/refresh-capture-filter-rail-tavern.webp)        | [parchment](screens/refresh-capture-filter-rail-parchment.webp)        | [high-contrast](screens/refresh-capture-filter-rail-high-contrast.webp)        |
| capture filter / phone       | [tavern](screens/refresh-capture-filter-phone-tavern.webp)       | [parchment](screens/refresh-capture-filter-phone-parchment.webp)       | [high-contrast](screens/refresh-capture-filter-phone-high-contrast.webp)       |
| capture continuity / desktop | [tavern](screens/refresh-capture-continuity-desktop-tavern.webp) | [parchment](screens/refresh-capture-continuity-desktop-parchment.webp) | [high-contrast](screens/refresh-capture-continuity-desktop-high-contrast.webp) |
| capture continuity / rail    | [tavern](screens/refresh-capture-continuity-rail-tavern.webp)    | [parchment](screens/refresh-capture-continuity-rail-parchment.webp)    | [high-contrast](screens/refresh-capture-continuity-rail-high-contrast.webp)    |
| capture continuity / phone   | [tavern](screens/refresh-capture-continuity-phone-tavern.webp)   | [parchment](screens/refresh-capture-continuity-phone-parchment.webp)   | [high-contrast](screens/refresh-capture-continuity-phone-high-contrast.webp)   |

### Capture repair validation

- Capture harness passed all nine contexts: retained selected checkbox after filtering,
  post-save continuity group, successful Create and resulting NPC record.
- Visually inspected the phone tavern continuity image: the four reviewed controls are visible.
  The app's inner scroll container clips lower panel content and the toast overlays its bottom;
  panel screenshots do not prove below-viewport layout. ARIA retains the full panel controls.
- `python3 state/RC-CAN-7.5/verify-evidence.py`: passed, 4,273 occurrences, 303 mapped records,
  117 ARIA captures and ten assigned gaps. A read-only injected duplicate SE-34 matrix row
  triggered the expected Duplicate matrix IDs assertion (negative verification).
- `pnpm gates`: exit 0, 258 reachable documents / 321 resolved relative links. Existing product
  file-size warnings only. No full pnpm check or independent review is claimed for this docs repair.
- Complete candidate ownership checked against supplied base, including the relocated journal:
  no path outside the two authorized planning documents and state/RC-CAN-7.5/ remains.
- The precommit exact-base format check passed for 104 existing candidate files. The separate
  staged-file check caught a formatting issue in capture-conditional.ts; corrected with Prettier.
  The initial commit's claim that this staged check passed was premature and is superseded here.
  Evidence verifier and diff whitespace checks passed. Final full-candidate formatting is checked
  after the repair commit because the base option selects committed HEAD.
- Final exact-base format check passed for all 124 candidate files after the harness correction;
  evidence verifier and complete-base `git diff --check` also passed. Worktree was clean.

## Operator lint-gate repair — 2026-09-19

Starting HEAD: `cdc5116288d77ec3319a9cb7d3862302b4c0aee6`, clean worktree.
Read the original operator log for run `c2eff00d-77b1-4921-93d3-5b76b755455b` directly;
no Headroom tools were available. It reports two no-explicit-any errors in
capture-conditional.ts:83–84 and 15 unrelated application warnings. Quality, format and
Typecheck passed in the supplied operator report; those are prior results, not reruns here.

Inspected the ESLint configuration, the DEV runtime seam in tests/e2e/\_helpers.ts and the
CharacterState record. Replace only the harness's two any annotations with an explicit
character record shape, matching the existing session-capture.spec.ts convention. The assertion
still checks the same NPC name and kind; this type-only repair does not recapture or alter
browser evidence. This journal records the gate repair; both edits are inside the owned directory.

Validation from repository root:

- `pnpm lint`: exit 0. ESLint has zero errors and the same 15 application warnings; boundary,
  emphasis and non-text contrast gates passed. Existing emphasis warnings and its suggestion
  to lower the baseline remain outside this repair. Original output retained at
  `/tmp/rc-can-7.5-lint-repair.log` and read directly before recording this result.
- `python3 state/RC-CAN-7.5/verify-evidence.py`: exit 0; all 4,273 control occurrences,
  303 records, 117 ARIA captures and ten gap assignments remain intact.
- Prettier initially flagged this appended journal; formatted it before the final changed-file
  check. No new browser run or full pnpm check is claimed for this type-only repair.
- Final `pnpm format:check:changed` passed for both repair files; `git diff --check` passed.

## Live conditional combat repair — 2026-09-22

Starting HEAD: `29841decbafedd4ff258e03d3bcdd5886dcf7506`, clean worktree. The previous attempt
stopped at a provider allowance limit and left no uncommitted work. Operator brief (2026-09-22):
address the two high findings from the independent review of `29841dec` by capturing the live
conditional controls, not only the saved snapshots. I read the review record directly. The
dispatch Headroom tools were not loaded in this session, so I read command output directly and
kept full logs under `/tmp/rc-can-7.5-*` while working. No additional agents were used.

Before editing, I read `CombatTracker.tsx` (row, condition, death-save and concentration blocks),
`ConditionBadge.jsx`, `InitiativeBody.tsx`, `InitiativeTracker.tsx`, `NextTurnControl.tsx`,
`HpKeypadSheet.tsx`, `Sheet.jsx`, `dataEnvironment.ts` (the `current-combatants` projection),
`widget-command.ts`, `combat.spec.ts` (setup and the RC-CHR-1.3 / RC-SES-3.1 tests) and
`combat-tile.spec.ts`. No product file changed.

- **Finding 1 (SE-11).** Added SE-42 (condition badges and `Clear <condition>`), SE-43 (death
  saves) and SE-44 (concentration check) in a new §3.2.2. SE-11 now lists its text badges,
  hidden-row behaviour and the player-preview redaction to `Unknown creature`. SE-12 now records its
  captured keypad controls.
- **Finding 2 (BD-21).** BD-21 now separates idle and live, desk/rail and phone, edit mode and player
  preview. The earlier text described the idle phone text as if it were the whole phone contract.
  Added BD-29 (phone live order), BD-30 (quick-action tray and swipe, with its keyboard equivalent)
  and BD-31 (tile HP keypad and outcome announcement) in a new §2.2.2.
- **Gap mapping.** `current-combatants` projects only initiative, HP, hidden and active, so G-02 now
  names conditions, concentration and death-save reads. `widget.dispatch-command` has no combat
  reducer, so no builder-made widget can write combat state. I filed that as G-11 → RC-WID-5.12 (M)
  in §4.2, and extended G-05, G-07 and G-08 to the new rows. CombatBody is labelled summary-only.
  Filing is not scheduler registration; that remains an operator handoff.
- **Observed defects, not fixed here** (none is owned): D-08, where the phone tile at Fit zoom clips
  its rows and the `Active` badge wraps one character per line; D-09, where the phone board keypad
  paints inside the scaled canvas under sibling tiles in all three themes (the fixed-position,
  no-portal cause is an inference from `Sheet.jsx`). Also observed: the phone tile omits the dying,
  death-save, concentration and condition controls that /session has. Tray focus landed on
  `Heal` after Enter on More actions; the source has no explicit focus move.
- **README.** The only edit is the backlog range, 5.6–5.11 → 5.6–5.12, so the existing index link
  still names every filed story. No other planning or control-state file changed.
- **Integration drift, not recaptured.** Product source is identical to base `eafbce28` (no
  `apps/` or `packages/` diff). `origin/loop/rc` is now `df379bf7` and adds RC-WID-4.4 live
  readouts and density touch targets to `InitiativeBody.tsx` and `InitiativeTracker.tsx`. Source
  inspection shows the same control names; SCREENS_PARITY §5 records the drift.

### Capture procedure

Start the isolated, cloud-disabled Vite command from the refresh section on an unused port (this
run used 15761). Then, from the repository root:

```sh
PARITY_URL=http://127.0.0.1:15761 pnpm exec tsx state/RC-CAN-7.5/capture-combat.ts
pnpm exec prettier --write 'state/RC-CAN-7.5/aria/refresh-*combat*.yaml'
```

Each of the nine theme/tier contexts gets a fresh local demo vault. Accepted Core commands take the
session live and start a three-monster fight. Bog Lurker concentrates on Blur, takes 1 damage (DC 10
check owed) and is Poisoned for two rounds. Reed Stalker is at 0 HP but not defeated, so it is
dying. Marsh Wisp is hidden. The harness captures the Combat section, the HP sheet and a player
preview. It then clicks death-save success and failure, Keep concentration and Clear Poisoned, and
asserts the durable state: tally 1/1, check cleared, Blur kept, conditions empty. On `/board` it
captures the Initiative tile live, then player preview, then edit mode. On phone only, it opens the
tray by a synthetic touch swipe, closes it, reopens it with Enter on More actions (asserting focus on
`Heal`), captures the keypad, types 5, applies Damage, and asserts HP 21→16 plus the tile's status
text. Phone contexts use device scale 3; CSS layout and ARIA are unchanged. Snapshots are scoped to
the section, tile, dialog or (for board preview) `#main-content`.

Three earlier attempts stopped on harness errors I had made: a wrong durable field name, the
preview tile locator, and an edit-mode Next-turn assertion. None was a product defect. The harness
then completed three times, each with exit 0 and 60 captures: at device scale 1, at device scale 3,
and at device scale 3 with the focus assertion added. Across the three successful runs the ARIA
was byte-identical. Between the last two runs, 5 of the 60 images differed at pixel level; the final
set is retained. Prettier then reformatted 51 YAML files (indentation and quoting only); a
`yaml.parse` deep-equality check against the raw output passed for all 60. The crosswalk was built
from the formatted files with explicit per-state mapping rules. Any unmapped control stops the
build.

### Live-combat screenshot index

Session images are Combat-section or viewport (sheet) images. Board images are tile, viewport
(sheet) or `#main-content` (preview) images.

| State / tier                         | Tavern                                                                   | Parchment                                                                      | High contrast                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| session-combat-conditional / desktop | [tavern](screens/refresh-session-combat-conditional-desktop-tavern.webp) | [parchment](screens/refresh-session-combat-conditional-desktop-parchment.webp) | [high-contrast](screens/refresh-session-combat-conditional-desktop-high-contrast.webp) |
| session-combat-conditional / rail    | [tavern](screens/refresh-session-combat-conditional-rail-tavern.webp)    | [parchment](screens/refresh-session-combat-conditional-rail-parchment.webp)    | [high-contrast](screens/refresh-session-combat-conditional-rail-high-contrast.webp)    |
| session-combat-conditional / phone   | [tavern](screens/refresh-session-combat-conditional-phone-tavern.webp)   | [parchment](screens/refresh-session-combat-conditional-phone-parchment.webp)   | [high-contrast](screens/refresh-session-combat-conditional-phone-high-contrast.webp)   |
| session-combat-hp-sheet / desktop    | [tavern](screens/refresh-session-combat-hp-sheet-desktop-tavern.webp)    | [parchment](screens/refresh-session-combat-hp-sheet-desktop-parchment.webp)    | [high-contrast](screens/refresh-session-combat-hp-sheet-desktop-high-contrast.webp)    |
| session-combat-hp-sheet / rail       | [tavern](screens/refresh-session-combat-hp-sheet-rail-tavern.webp)       | [parchment](screens/refresh-session-combat-hp-sheet-rail-parchment.webp)       | [high-contrast](screens/refresh-session-combat-hp-sheet-rail-high-contrast.webp)       |
| session-combat-hp-sheet / phone      | [tavern](screens/refresh-session-combat-hp-sheet-phone-tavern.webp)      | [parchment](screens/refresh-session-combat-hp-sheet-phone-parchment.webp)      | [high-contrast](screens/refresh-session-combat-hp-sheet-phone-high-contrast.webp)      |
| session-combat-preview / desktop     | [tavern](screens/refresh-session-combat-preview-desktop-tavern.webp)     | [parchment](screens/refresh-session-combat-preview-desktop-parchment.webp)     | [high-contrast](screens/refresh-session-combat-preview-desktop-high-contrast.webp)     |
| session-combat-preview / rail        | [tavern](screens/refresh-session-combat-preview-rail-tavern.webp)        | [parchment](screens/refresh-session-combat-preview-rail-parchment.webp)        | [high-contrast](screens/refresh-session-combat-preview-rail-high-contrast.webp)        |
| session-combat-preview / phone       | [tavern](screens/refresh-session-combat-preview-phone-tavern.webp)       | [parchment](screens/refresh-session-combat-preview-phone-parchment.webp)       | [high-contrast](screens/refresh-session-combat-preview-phone-high-contrast.webp)       |
| board-combat-live / desktop          | [tavern](screens/refresh-board-combat-live-desktop-tavern.webp)          | [parchment](screens/refresh-board-combat-live-desktop-parchment.webp)          | [high-contrast](screens/refresh-board-combat-live-desktop-high-contrast.webp)          |
| board-combat-live / rail             | [tavern](screens/refresh-board-combat-live-rail-tavern.webp)             | [parchment](screens/refresh-board-combat-live-rail-parchment.webp)             | [high-contrast](screens/refresh-board-combat-live-rail-high-contrast.webp)             |
| board-combat-live / phone            | [tavern](screens/refresh-board-combat-live-phone-tavern.webp)            | [parchment](screens/refresh-board-combat-live-phone-parchment.webp)            | [high-contrast](screens/refresh-board-combat-live-phone-high-contrast.webp)            |
| board-combat-edit / desktop          | [tavern](screens/refresh-board-combat-edit-desktop-tavern.webp)          | [parchment](screens/refresh-board-combat-edit-desktop-parchment.webp)          | [high-contrast](screens/refresh-board-combat-edit-desktop-high-contrast.webp)          |
| board-combat-edit / rail             | [tavern](screens/refresh-board-combat-edit-rail-tavern.webp)             | [parchment](screens/refresh-board-combat-edit-rail-parchment.webp)             | [high-contrast](screens/refresh-board-combat-edit-rail-high-contrast.webp)             |
| board-combat-edit / phone            | [tavern](screens/refresh-board-combat-edit-phone-tavern.webp)            | [parchment](screens/refresh-board-combat-edit-phone-parchment.webp)            | [high-contrast](screens/refresh-board-combat-edit-phone-high-contrast.webp)            |
| board-combat-preview / desktop       | [tavern](screens/refresh-board-combat-preview-desktop-tavern.webp)       | [parchment](screens/refresh-board-combat-preview-desktop-parchment.webp)       | [high-contrast](screens/refresh-board-combat-preview-desktop-high-contrast.webp)       |
| board-combat-preview / rail          | [tavern](screens/refresh-board-combat-preview-rail-tavern.webp)          | [parchment](screens/refresh-board-combat-preview-rail-parchment.webp)          | [high-contrast](screens/refresh-board-combat-preview-rail-high-contrast.webp)          |
| board-combat-preview / phone         | [tavern](screens/refresh-board-combat-preview-phone-tavern.webp)         | [parchment](screens/refresh-board-combat-preview-phone-parchment.webp)         | [high-contrast](screens/refresh-board-combat-preview-phone-high-contrast.webp)         |
| board-combat-tray / phone            | [tavern](screens/refresh-board-combat-tray-phone-tavern.webp)            | [parchment](screens/refresh-board-combat-tray-phone-parchment.webp)            | [high-contrast](screens/refresh-board-combat-tray-phone-high-contrast.webp)            |
| board-combat-hp-sheet / phone        | [tavern](screens/refresh-board-combat-hp-sheet-phone-tavern.webp)        | [parchment](screens/refresh-board-combat-hp-sheet-phone-parchment.webp)        | [high-contrast](screens/refresh-board-combat-hp-sheet-phone-high-contrast.webp)        |

### Repair validation

- `python3 state/RC-CAN-7.5/verify-evidence.py`: exit 0. 4,942 control occurrences, 388 mapped
  records, 177 ARIA captures, 27 historical plus 150 refresh screenshots, 11 assigned gaps. New
  required-control assertions cover every new state. They also check that the phone-only tile
  controls appear on phone and are absent on desk/rail, and that edit mode has no Next turn button.
- Negative checks on a /tmp copy: removing the SE-43 success mapping failed with
  `Unmapped/changed controls`; deleting the G-11 register row failed with `AssertionError: G-11`.
- `pnpm exec eslint` on both capture harnesses: exit 0.
- `pnpm gates`: exit 0; 258 reachable documents, 333 resolved relative links (links to the new
  source references included); existing product file-size warnings only.
- Prettier `--check` on both planning files, this journal, the crosswalk, the new harness and all
  177 ARIA files: passed before commit. After commit `47d90944`,
  `pnpm format:check:changed --base loop/rc` passed for 185 files. That covers every
  Prettier-eligible file changed against local `loop/rc` (`df379bf7`), including the 60 new YAML
  files. `git diff --check eafbce28 HEAD` passed.
- Ownership: no path in the base-to-candidate diff falls outside `docs/planning/SCREENS_PARITY.md`,
  `docs/planning/README.md` and `state/RC-CAN-7.5/`.
- Not run for this repair: full `pnpm check`, typecheck, the Playwright suites (`combat.spec.ts`
  and `combat-tile.spec.ts` were read, not rerun) and any real participant device. The isolated
  Vite server was stopped afterwards. Operator gates and independent review remain separate.

## Integration-tip recapture — 2026-09-23

Resumed after the previous session stopped on a provider allowance limit. Starting HEAD was
`bf177185` (clean) on base `df379bf7`. Used the supplied docs-research skill. No Headroom tools were
used, so all output below was read directly. No additional agents.

**Why a recapture.** The 2026-09-22 section cites `47d90944` and base `eafbce28`. Those SHAs belong to
the branch before it was rebased onto `df379bf7` (the patch of `47d90944` equals `c15fd363`'s).
The evidence was therefore captured on `eafbce28` and never recaptured on the base it was committed
against. `eafbce28..df379bf7` includes RC-WID-4.4 (`3fbef676`) and its follow-ups (`e0c4b9ed`,
`d33e9a90`, `30db68d1`). Local `loop/rc` had since moved to `2fb670a4`, adding RC-CAN-4.6 scene
backgrounds (`a88af2ae`, `1a6afbcc`, re-baselined in `2fb670a4`), which touches
`SceneBoardCanvas.tsx` and `WidgetFrame.tsx`.

Steps:

1. `git merge-tree --write-tree loop/rc HEAD` was clean, so I rebased the task branch onto local
   `loop/rc` (`2fb670a4`) without conflicts. Old → new SHAs: `bf177185` → `e87a5c85`, `c15fd363` →
   `a800ca1e`; the earlier commits are listed by `git log loop/rc..HEAD`. The verifier passed
   unchanged afterwards.
2. Started the isolated, cloud-disabled Vite server from the refresh section on port 15771 and ran
   `capture-refresh.ts`, `capture-conditional.ts` and `capture-combat.ts` without modification. All
   three exited 0. Then `prettier --write` on the refresh YAML.
3. Classified every changed file by comparing indentation-stripped lines:
   - 30 board-route ARIA files (`refresh-board-*` ×9, `-combat-live` ×9, `-combat-edit` ×9,
     `-combat-tray-phone` ×3). Each tile body is now wrapped in a numbered `region` (`WidgetRegion`,
     `WidgetRenderSlot.tsx:252`). `1:00` is now `timer`. The phone header adds visually hidden
     `· Turn 1`. Quick Reference and Prep text order moved (known D-05). A script checked that each
     file's interactive-control sequence (the verifier's role regex) is identical before and after.
   - 18 capture filter/continuity files: wall-clock titles and fixture checkbox order only.
   - Every other ARIA file: byte-identical.
4. Kept the 30 board ARIA files and every board-route image whose bytes changed (48). Restored the
   capture ARIA files (noise) and every non-board image with `git checkout`.
5. Re-anchored `control-coverage.json` with a script that maps old line → new line by position in
   the identical control sequence (204 occurrences moved, 240 remapped entries). It asserts
   sequence equality per file and refreshes the 30 SHA-256 values. Prettier then restored the file's
   layout. Committed the evidence as a checkpoint (`71ffcedb`).
6. Reran all three harnesses on the same server to measure image noise outside the board, comparing
   each changed non-board image with the committed one (ImageMagick difference, thresholded):
   - Capture images: clock-derived titles; five continuity images changed height.
   - Session images: at most 0.57% of pixels differ. I inspected the three largest crops. They show
     the elapsed `Session live` clock (00:00 vs 00:01, which also shifts the pill width) and one
     hover-highlighted `Recap` radio. The hover is probably where the pointer rested (inference).

   No product change was visible. Restored the tree to `71ffcedb` and stopped Vite (port free).

7. Viewed the new board images: Tavern desktop and rail, High-contrast desktop and phone, and the
   parchment phone next to its predecessor. Under Tavern and High contrast, the board surface
   between tiles is now cream: `data-theme="parchment"` comes from the seed's `parchment` scene
   background (`command-center-state.ts:145`). The phone layout itself is unchanged, so D-07 stands.

Matrix changes (`SCREENS_PARITY.md`):

- §0 gains a recapture subsection. It also states that the live-combat run was on `eafbce28` and was
  not recaptured after the first rebase.
- BD-11 records the numbered region. BD-23 records `role="timer"`. BD-29 records the hidden turn
  suffix.
- §2.2.2, §2.3 and D-02 now say landmark navigation reaches each tile, while heading navigation
  still does not.
- §2.4 gains the scene-background paragraph, and D-10 is new.
- WID-5.10's rationale notes that the region already exists.
- §5's "newer integration tip" limitation is resolved to `2fb670a4`. §6 gains source links.

No WID gap changed. The region landmarks do not close G-06 or WID-5.10, which is about headings.
D-10 is a CAN-7.6/7.7 decision, not a widget-surface gap, so no new WID story was filed.

Verifier change: new required assertions for `board` (regions 1, 2 and 7, `timer: 1:00`),
`board-combat-live` and `-edit` (region 2), and phone-only `initiative order · Turn 1`. This is
inside `state/RC-CAN-7.5/`. `docs/planning/README.md` was not touched in this repair.

### Recapture validation

- `python3 state/RC-CAN-7.5/verify-evidence.py`: exit 0 (4,942 occurrences, 388 mapped controls, 177
  ARIA captures, 27 + 150 screenshots, 11 gaps).
- Negative checks on /tmp copies:
  - Replacing one board file with its pre-recapture version failed with `Unmapped/changed controls`.
  - Restoring the whole pre-recapture board set together with its matching crosswalk and hashes
    failed with `AssertionError: ('refresh-board-desktop-tavern', 'region "1. Map"')`, so a stale
    but self-consistent set no longer passes.
- Gate results for this repair are recorded below once run.
