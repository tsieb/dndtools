# RC-CAN-7.5 run journal — owned-path revision

## Scope and provenance

2026-09-19. Starting HEAD: `8e893374`, clean worktree. Applied the supplied docs-research
instructions. No repository AGENTS.md was found. The earlier candidate and its evidence are
already on this task branch; this revision preserves all 27 ARIA snapshots and 41 screenshots.
Their original capture date and source baseline remain 2026-09-16 / `83f94aabb28cf188630d30e56f9d301d2773fb26`.
The [historical journal](../RC-CAN-7.5.journal.md) records the original capture procedure and
historical gates; those results are not rerun results for this revision.

The 2026-09-18 operator brief explicitly adds the planning index and this evidence directory to
Owns. Only `docs/planning/SCREENS_PARITY.md`, `docs/planning/README.md`, and
`state/RC-CAN-7.5/` are changed. The older sibling journal remains untouched.

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
