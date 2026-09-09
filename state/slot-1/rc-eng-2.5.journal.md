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
