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
