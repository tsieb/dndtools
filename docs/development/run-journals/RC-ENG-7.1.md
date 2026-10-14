# RC-ENG-7.1 run journal

## Scope and implementation

- Owned implementation: `.github/workflows/release.yml` and
  [the runnable RC checklist](../RC_CHECKLIST.md). This journal is the requested run evidence.
- Added explicit `rc` dispatch channel; plain semver tags remain compatible with Android.
  Tag pushes still select preview. RC creates only a draft prerelease, retaining unsigned
  desktop and existing Android signing behavior. Production requirements are unchanged.
- Checklist commands run from the pinned tag with full history, record exact SHA, workflow
  revision, run/attempt, commands, exit codes and UTC timestamps. A failed command blocks
  release creation, while all subsequent commands still collect evidence.
- Successful report/log archives join release assets before checksums and provenance;
  failed runs retain their evidence as workflow artifacts. Manual scope/review/historical
  evidence is explicitly PENDING. Unsigned RC cannot replace a production or preview draft.

## Verification

- Headroom tools were not available; native command outputs were read directly.
- `pnpm exec vitest run tests/unit/release-verify.test.ts tests/unit/ci-guardrails.test.ts`:
  2 files / 23 tests pass. Original log: `/tmp/rc-eng-7.1-tests.log`.
- Runner fixture (`/tmp/rc-runner-test.py`): checks shell syntax, 12 command results,
  exit-7 propagation to overall exit 1, continued execution after failure, explicit pending
  manual bars, and wrong-SHA rejection. Fixture commands do not constitute release evidence.
- Initial `pnpm gates` found the new checklist unreachable from the docs index. This linked
  journal lives in the indexed run-journal directory and provides a documentation route to it.
  Final gate result recorded below after rerun.

## Remaining acceptance and scope blockers

No RC tag was pushed, workflow dispatched, release created or published, or dispatcher state
changed. The end-to-end tagged run and release attachments therefore **have not occurred**;
RC-ENG-7.2's operator rehearsal must supply that evidence after integration and independent review.
The local implementation tests are not substitutes for this acceptance criterion.

The requested Discussions form and Help → Send feedback action cannot be implemented inside the
supplied two-path ownership fence. `RC_ROADMAP.md` §21.2 explicitly blocks candidate changes
outside the claim. The operator must grant `.github/DISCUSSION_TEMPLATE/` and the relevant
`apps/gm-react/src/app/help/` menu paths (plus any actual shell wiring) before that work can land.
No control-state or roadmap ownership changes were made. The checklist records this as a beta
launch prerequisite; it does not claim that a feedback route already exists.

## Final local results

- `pnpm gates`: exit 0; six quality gates, 310 reachable docs and 445 resolved links.
  Existing 500-line target warnings remain; there were no gate failures. Original output:
  `/tmp/rc-eng-7.1-gates.log`.
- Reran the 23 release/CI guardrail tests after the workflow edits: all pass.
- Runner fixture passes; extracted checklist and workflow Bash steps pass `bash -n`.
- Prettier check on all three changed files and `git diff --check` pass.
- Structured performance and whole-app reports, when generated, are included in the evidence
  archive in addition to command logs. RC alone extends the release timeout to 360 minutes.
