# RC-CHR-6.4 run journal

## Implementation

- Fresh unjoined devices render a join-first companion with one primary action. Local seeded
  content is limited to explicit previews and demo vaults; previews name the participant and
  suppress self/You markers. Joined views continue to use only the host snapshot.
- Join guidance explains the same-network invite/reply exchange using system vocabulary.
  QR scanning probes camera and decoder support without requesting permission and releases
  camera tracks on success, cancellation, errors and unmount. Paste remains available.
- Host invite QR and code share a wrapping row; the empty roster mentions online codes only
  for an active online table. Code textareas receive accessible names.
- Headroom tools were not available. No agents, push, promotion, loop launch or dispatcher edits.
- Required supporting edits: EN/ES join-stage messages and focused browser acceptance coverage.

## Validation

- First targeted lint found untranslated join-stage copy; moved it to EN/ES catalogs.
- First browser run: fresh-device/axe checks passed on both profiles; old "Sheet" selector and
  hidden mobile preview label failed. Corrected selector to "My character" and placed the
  preview identity in the always-visible tier badge (the mobile toolbar hides its blurb).
- Second run: 27/28 passed; this exposed the toolbar's mobile CSS hiding the blurb. The final badge change passed the final acceptance run. Camera read/denial/cancellation tests passed on both profiles.
- Existing companion tests that assumed an implicit seat now opt into read-only preview or
  open the real demo vault for local command/delivery scenarios. No product bypass was added.
- The wider 106-test browser run passed 101 and failed 5 fixture cases: co-DM setup waited for
  the old implicit stage on both profiles; initiative setup inherited the demo showcase fight
  on both profiles; the desktop host test used the old "Host nearby" label. Original log errors
  were inspected. Fixed explicit preview/exit assertions, ended the showcase fight through a
  Core command before calling initiative, and used "Host on local network".

## Final verification

All commands ran from this task worktree; full operator gates and independent review remain external.

- `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- ESLint and Prettier over every changed TS/TSX file plus the new acceptance spec: exit 0.
- `pnpm gates`, `pnpm lint:boundary`, and `git diff --check`: exit 0.
- Final browser command: `pnpm --filter @dndtools/gm-react exec playwright test
tests/e2e/player-join-first.spec.ts tests/e2e/player-view.spec.ts tests/e2e/golden-path.spec.ts
--grep 'player joins|fresh companion|invited PC|demo vault keeps|QR camera|host shares|player view:'
--workers=2 --output=/tmp/rc-chr-6.4-final-e2e`: **28/28 passed**, both profiles. Includes fresh
  one-action/no-identity stage, invited PC after fake LAN, leave-to-join-first, named demo preview,
  no You label in demo party/dice, QR read/denial/cancellation, host QR and unavailable-online copy,
  axe on fresh/joined/join/host surfaces, existing LAN privacy and projected map coverage.
- Focused recheck across co-dm/collab/player-join-first/responsive with grep
  `host shares a QR|honors an active co-DM|the DM calls, the player rolls|Co-DM can reach every|skip link`:
  **12/12 passed**, including every failed fixture scenario above on both profiles.
- Wider successful cases also cover private notes, all companion sections and themes under axe,
  live party/fog delivery, scene-card history, and route titles. The earlier 101/106 run is not
  represented as a green full-suite run; its five failures were all resolved and rechecked above.
- Pinned visual baseline update: 24/24 passed, nine intentional `/play` images changed. Existing
  stage captures now explicitly enter preview. Desktop/parchment and phone/tavern images inspected.
- `DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh
--grep '/play$|play stage'`: **15/15 passed** against committed-intent baselines.
- Camera scanning requires a camera and native QR decoding support; otherwise the paste path
  remains available. No permission prompt occurs before the explicit Scan action.
- No push, promotion, remote CI claim, or dispatcher control changes.

## Attempt 2 — generated pseudo-locale repair

- Read the original app-gate failure log for run `5df32461-212a-4ae0-8808-fead2ec26e70`.
  The two failures were pseudo-catalog equality and coverage: the five new `play.join.*`
  messages were missing from the generated DEV catalog; 1,750 other app tests passed.
- Ran `pnpm exec tsx scripts/i18n-catalog.ts pseudo`. Reviewed the resulting diff: only the
  five join-stage messages were added to `src/i18n/dev/qps-ploc.ts` using the existing generator.
- Full `pnpm test:app --maxWorkers=3` passed: 160 files, 1,752 tests, exit 0.
  Headroom artifact `22285d8b829e47a3aba61d6c943d1e5d`; retrieved original stdout to verify results.
- Prettier check and `git diff --check` passed. No product behavior or test assertions changed.
- Headroom tools were available for this repair. No agents, push, promotion, loop launch,
  or dispatcher control mutations.
