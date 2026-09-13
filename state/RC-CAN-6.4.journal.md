# RC-CAN-6.4 run journal

## Implementation

- Widget frames (board and scene editor) and scene cards use VisibilityChip's opt-in
  exception mode. GM-only badges are absent by default; exposed states retain icon and text.
  Core `shared` normalizes to Players. Authoring chips and the player preview are unchanged.
- Device preference `markGmOnly` defaults off, updates mounted consumers, and persists locally.
  Appearance uses package vocabulary for "Mark {gm}-only items"; EN and ES catalogs updated.
  Scene card labels retain their existing translations.
- Design safety-language rule now says to name every visibility that differs from GM-only.
- Unit coverage exercises the decision, aliases, mounted preference updates, and explicit authoring
  states. Browser coverage checks no GM-only chip, preference restoration and reload persistence,
  disabling the preference, and a raw shared tile displaying Players.
- No Headroom tools were available. Native tools used. No agents, push, promotion, loops, or
  dispatcher control changes.

## Validation

- Initial unit run exposed an unnecessary I18nProvider dependency in the reusable chip. Replaced
  it with the vocabulary context (which has a package default), preserving explicit translated
  labels for scene cards. Rerun: 2 files, 21 tests passed.
- Initial browser scenario: desktop and mobile Chromium passed (2 tests).
- Final shared-value browser scenario: 2/2 passed, desktop and mobile Chromium.
- Final targeted unit rerun: 21/21 passed. App typecheck, boundary lint, and quality gates passed.
- ESLint required reducing WidgetFrame's raw-style allowance from 6 to 4 after removing its custom
  badge. Updated that single companion entry as required by the shrinking-budget rule.
- Final targeted ESLint passed. The HEAD-based format wrapper skipped uncommitted files, so
  formatting is checked directly over all changed files before commit. Full operator gates and
  independent review remain external.

## Attempt 2 — app gate snapshot repair

- Read the original app-gate log for run `ef2d9172-a80a-4a35-8bc1-462ec72331a1`.
  All 60 failures are WidgetFrame header snapshots: expected `visibility: "DM only"`, received
  `visibility: null`. The other 125 test files passed. These expectations predate the intentional
  default badge removal.
- Reset the device preference before each WidgetFrame test, assert the absence of the badge
  explicitly, and update the 60 snapshots across the three themes. Reviewed the exact snapshot
  diff programmatically: only the 60 visibility fields changed from "DM only" to null.
- Targeted snapshot run: 67/67 tests passed. Full gate command `pnpm test:app --maxWorkers=3`:
  exit 0, 126 files and 1334 tests passed (35.47 seconds).
- Prettier check, targeted ESLint, and `git diff --check` passed.
- No product changes, dispatcher mutations, push, or promotion in this repair.
