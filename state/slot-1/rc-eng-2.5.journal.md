# RC-ENG-2.5 run journal

- Added static Android preflight: XML parser, bounded standard Java multi-catch hierarchy guard,
  root/app version contract and agreement; integrated first in `pnpm check`.
- Current branch still had the invalid SecurityException/RuntimeException multi-catch; removed
  redundant SecurityException, preserving IOException and RuntimeException handling.
- `pnpm check:android`: PASS, 18 XML files and 11 Java files; package versions agree.
- `pnpm exec vitest run tests/unit/check-android.test.ts`: PASS, 14 tests (malformed XML,
  related/unrelated catches, comments/strings, version syntax/agreement, missing tree).
- Historical acceptance: exported each introducing commit with `git archive` into a temporary
  directory, then ran `pnpm check:android <export>` using the new checker:
  - `729be436`: exit 1, colors.xml, invalid XML at 4:45 (malformed comment).
  - `ba35b10e`: exit 1, DndtoolsAppIntentPlugin.java:144, SecurityException extends RuntimeException.
- Documented Adoptium JDK 21 installation, java/javac and Gradle version verification,
  SDK prerequisites, sync and local unit/lint/assembleDebug commands.
- JDK 21 compiler is absent (`test -x /usr/lib/jvm/java-21-openjdk/bin/javac` exits 1).
  Gradle compilation and emulator checks not run; preflight does not claim native build success.
- Full `pnpm check`: PASS (exit 0), including Android preflight, quality gates, boundary lint,
  all three typechecks, and 6,405 tests: core 4,760, cloud 405, app 1,095, tooling 145.
  Exact output retained at `/tmp/rc-eng-2.5-check.log` (local run artifact).
- Targeted ESLint on the checker/tests, Prettier checks on changed supported files, and
  `git diff --check`: PASS.
- Implementation complete; intended files committed on the current dispatch task branch.
  Independent review and central wrapper gates remain with the operator.
- No dispatcher state edits, push, promotion, or additional agents.

## Central browser gate follow-up

- Central validation on `6a905350` passed typecheck, lint, app/tooling tests, build, and requirements
  audit. Browser acceptance failed: 8 failed, 11 skipped, 1,039 passed.
- Read the original browser log at
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/86124f81-b329-4d7e-9df8-fe7db6049134/output.log`.
- Re-ran the affected cases on this task tree with `DNDTOOLS_E2E_PORT=15473`, two workers:
  6 failed, 1 skipped, 3 passed. Both responsive cases passed in isolation. Original recheck output:
  `/tmp/rc-eng-2.5-browser-recheck.log`.
- Remaining failures: quick-map drag movement stays zero (both profiles), equipment preview has no
  Item input (both profiles), mobile board axe target-size violation, and mobile combat HP button
  click intercepted by the compact tile. No renderer or browser-test files changed in `6a905350`.
- Parent comparison completed using a `git archive` export of
  `75c76bd14b91042ef4af35f0d88662580f4611f9`, its own frozen-lockfile dependency installation,
  `CI=1`, `DNDTOOLS_E2E_PORT=15475`, `--workers=2 --retries=0`. Result: exit 1,
  the same 6 failures, 1 skipped, 3 passed. Original output:
  `/tmp/rc-eng-2.5-browser-parent-clean.log`. All six failure diagnostics match the task tree:
  zero drag movement, missing Item input, Hide combat overlay target-size violation,
  and intercepted compact combat HP click. Both responsive checks pass on the parent as well.
- Reproduction command from each checkout root:
  `pnpm e2e --workers=2 --grep 'supports live-session edits|authority: the PC owner|Android routes consume|a11y axe gate: /board$|tapping the hit points'`
  (parent additionally used `--retries=0`; environment above prevents existing-server reuse).
- Discarded initial parent setup attempts: symlinked dependencies caused Vite font allow-list
  failures; a reused server after dependency installation caused startup failures. Neither was
  used as regression evidence. The clean run started a fresh Vite server with local dependencies.
- The six reproduced browser failures predate this task; the other two central failures were not
  reproduced on either tree. No browser code or assertions changed, and no gate was bypassed.
  Android acceptance remains implemented in `6a905350`; central browser acceptance remains red
  and needs separate renderer repair or operator triage.
- `pnpm check:android` still passes (18 XML, 11 Java files).

## Rebase onto main (post-rebase gate failure)

- Feedback was "post-rebase gates failed". The branch was still based on `75c76bd1`; `origin/main`
  had moved 13 commits ahead, so the rebase had never actually been resolved on this tree.
- Rebased onto `origin/main`. Three conflicts, resolved by deferring to main in every case:
  - `tools/loop/run-loop.sh` (from RC-ENG-2.3's carried commit): main's `e0725d79` retired the
    local entrypoint to a four-line stub, so RC-ENG-2.3's `verify_tree_gates` hunk has no file
    left to patch. Took main's stub. `tests/unit/loop-integration-gate.test.ts` asserts against
    `.github/workflows/ci.yml`, not this script, so RC-ENG-2.3's gate still has its teeth; its
    `rcloop.py` and `test_rcloop.py` changes merged cleanly and are preserved.
  - `DndtoolsAppIntentPlugin.java`: main's `6fda3c33` had already made the identical
    `IOException | RuntimeException` fix, with a comment explaining why naming both is a compile
    error. Kept main's version; this story no longer needs to carry the repair.
  - The previous attempt's `86103f88` (browser-acceptance repairs to `MapEditor`, `Map`,
    `ImportMapDialog`, `InitiativeTracker` and two e2e specs) was DROPPED with `rebase --skip`.
    Main's `64ea76e7` and `3026e0b1` fix all six of those items independently and better: the POI
    wrapper back to `pointerEvents: 'none'` with an opt-in `Popover`, `setMobileDock` on the
    transition instead of every render, SVG dimensions read from `width`/`height`/`viewBox`,
    `OpChip` gaining `dense`, the unconditional touch-target inflation removed, and the same two
    stale e2e expectations updated. Those files are outside this story's owned paths; carrying a
    second, different workaround for problems main has already solved would only re-break them.
- Net diff against main is now the owned surface plus RC-ENG-2.3's carried loop work: no app,
  core, or cloud source is touched by this story.
- Post-rebase `package.json` is main's `0.3.7` at both root and `apps/gm-react`; the version
  contract agrees. `pnpm install --frozen-lockfile`: lockfile up to date after the merge.
- Added the one missing checker branch: a test that a drifted `build.gradle` regex fails closed
  with `expected anchored major.minor.patch version contract`. The existing fixtures already
  encode both historical failures as permanent regression cases (`--color-bg` inside a comment,
  `IOException | SecurityException | RuntimeException`), plus the `0.3.5-alpha.1` suffix class
  that Android's `versionName` also rejects.
- Acceptance re-verified on the rebased tree, `git archive` export per introducing commit and
  `node scripts/check-android.mjs <export>` from this checkout:
  - `729be436` (07-31 Lamplight rebrand): exit 1 —
    `apps/gm-react/android/app/src/main/res/values/colors.xml: invalid XML: 4:45: malformed comment.`
  - `ba35b10e` (RC-PLT-2.2): exit 1, naming the same line javac rejects —
    `DndtoolsAppIntentPlugin.java: 144: invalid multi-catch: SecurityException extends RuntimeException; remove SecurityException`
- Gates on the rebased tree: `pnpm check` PASS (exit 0) — `check:android` first, quality gates
  (pre-existing file-size warnings only), boundary lint, all three typechecks, and 6,411 tests
  (core 4,760, cloud 405, app 1,098, tooling 148). Log: `/tmp/rc-eng-2.5-check-rebased.log`.
- Still no JDK 21 on this box, so no Gradle run: the preflight is a static guard and the docs say
  so. Documented install is unverified here by necessity; only CI or a JDK-equipped box can prove
  `assembleDebug`.
- No push, promotion, dispatcher state edit, or additional agents.
- Ran the carried loop work's own suite to confirm the run-loop.sh resolution did not break it:
  `python3 -m unittest tools.loop.tests.test_rcloop.RelatedSpecs` PASS (2 tests).
- FOUND, NOT MINE, NOT FIXED: the whole `tools/loop/tests/test_rcloop.py` suite hangs at
  `ModelPickup.test_backend_forwards_model_reasoning_and_resume_thread` (no timeout, killed at 90s).
  Verified pre-existing by running that single test against a clean `git archive` export of
  `origin/main`: identical hang, exit 124 (`/tmp/rcloop-main-single.log`). The test arrived with
  main's `e0725d79` and this branch does not touch it. No `pnpm` gate runs the Python suite, so it
  is not the reported gate failure — flagging it for whoever owns `tools/loop`.

## Ownership-claim follow-up

- Feedback: "candidate changes paths outside its claim: pnpm-lock.yaml,
  state/slot-1/rc-eng-2.5.journal.md, tests/unit/check-android.test.ts". The claim now owns all
  three. Branch is on `origin/main` `48a82786`; the RC-ENG-2.5 commits touch only owned paths
  (`DEVELOPMENT.md`, `package.json`, `pnpm-lock.yaml`, `check-android.mjs`, the checker test, this
  journal). `23309972` is RC-ENG-2.3's carried commit, preserved unchanged.
- `pnpm-lock.yaml` is needed: `saxes` was already installed as an optional transitive dependency.
  Promoting it to a root devDependency adds the importer entry and drops `optional: true` from
  `saxes` and `xmlchars`. `pnpm install --frozen-lockfile`: PASS.
- Tree `c9db6fd3` is byte-identical to the previously gated candidate `291f8276`. That candidate
  passed full `pnpm check`, lint, build and format, so those gates were not repeated.
- Re-verified on this tree: acceptance `729be436` exit 1 (colors.xml 4:45 malformed comment),
  `ba35b10e` exit 1 (`DndtoolsAppIntentPlugin.java: 144` multi-catch); current tree
  `pnpm check:android` PASS; checker vitest 15/15; ESLint and Prettier on story files PASS.
- No code change in this attempt. No push, promotion, dispatcher state edit, or additional agents.
