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
