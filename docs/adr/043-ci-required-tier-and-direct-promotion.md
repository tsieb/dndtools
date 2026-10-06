# ADR-043: CI as one required tier, direct promotion, nightly heavy checks

- Status: Accepted (2026-10-06)
- Deciders: owner
- Related: ADR-002 (platform ownership), RC-ENG-1.3, RC-ENG-2.1, RC-ENG-2.2, RC-DSN-4.1

## Context

Between 2026-09-25 and 2026-10-06 the `CI` workflow ran 200 times. On the integration branch
`loop/rc` it failed 70 of 164 runs. Of the forty most recent failures, nineteen were the Android
emulator step, twelve the unit job (one test that was repaired on `loop/rc` and re-failed on
every intermediate push), seven Playwright shards and one axe run. Every push to `loop/rc` ran
CI twice, once for the push and once for the standing draft pull request the dispatcher opened
from `loop/rc` to `main`; cancelling the superseded pull-request run read as a failure to the
dispatcher. The two-hour paired performance capture also ran on every such pull request.

The dispatcher answered each red run with a `ci-recovery-<sha>` task that claimed the whole
repository (serialising the fleet) at size L. 107 of 485 tasks in the store are recovery tasks;
most of their journals record a flake or a sibling that had already fixed the cause. Promotion
re-ran the complete local gate list on a commit hosted CI had already passed, and the production
preflight re-ran the suite a third time on the tag. Branch protection documented for `main` did
not exist on GitHub.

## Decision

1. **One required check.** `ci.yml` is a set of independent legs (`static`, four `unit` suites,
   `build`, four `e2e` shards with a merged report, `accessibility`, `visual-regression`,
   `desktop-smoke`, `android-build`) feeding one aggregate job, `ci-gate`. Branch rules, the
   deploy, the release, the promotion and the dispatcher read `ci-gate` on the commit and
   nothing else. Legs are path-filtered; a skipped leg passes the gate, a failed or cancelled
   leg fails it.
2. **Browser legs run in the pinned Playwright image**, the environment the visual baselines
   already describe. No job installs browsers or runs `apt`.
3. **Heavy, environment-sensitive checks never block a landing.** The Android emulator legs,
   browser tests tagged `@quarantine`, and the whole-app harness run in `nightly.yml` against
   `loop/rc` and report through one `nightly` issue. The emulator legs still run on every release
   tag. The per-commit Android leg compiles, unit-tests and lints.
4. **Status checks belong to the commit.** A push to `main` whose commit already carries a green
   `ci-gate` reuses it. The dev deploy (`deploy.yml`) triggers from the CI run that passed on
   `main`, requires the check on the commit, and redeploys what changed since the last successful
   deploy. The release and the production promotion require the check on the tag's commit and
   run only release-specific gates (versions, advisories, legal placeholders, Electron smoke,
   SBOM) instead of the suite.
5. **No standing delivery pull request.** The dispatcher fast-forwards `main` directly once the
   required workflow is green and the promotion window (one hour) has elapsed. Pull requests no
   longer trigger the performance workflow.
6. **Rulesets, not documentation.** `main`: no deletion, no force push, linear history, `ci-gate`
   required on every pushed commit, admin bypass only through a pull request. `loop/rc`: no
   deletion, no force push, linear history. `scripts/ci/apply-rulesets.sh` is the source.
7. **Dispatcher recovery is bounded and scoped.** A cancelled or skipped run is not a failure.
   A failed required workflow is first re-run once (`gh run rerun --failed`, no tokens). A second
   failure creates one `ci-recovery-<sha>` task scoped to the paths changed since the last green
   promotion plus the workflow files; later failures are absorbed into the open task. Per-task
   gates gain the bundle budget and axe so a candidate cannot pass locally and fail the required
   tier; promotion gates shrink to the contract checks.

## Consequences

- A landing's wall time is the slowest leg (about ten minutes), not the sum of serial steps. A
  promotion reaches the dev stage in roughly the deploy's own duration.
- Emulator and quarantine failures are seen within a day, not on every push, and cost no fleet
  time; the operator decides whether a nightly issue becomes a story.
- A human change to `main` must arrive through a pull request; a direct push of an untested commit
  is rejected by the ruleset.
- The `@quarantine` tag is a documented, visible debt: `docs/development/TESTING.md` §10 requires
  a linked issue, and the nightly runs each quarantined test five times.
- Rolling back a tag that predates this ADR still works: the release and promotion workflows
  restore their own revision of `scripts/ci` and `.github/actions` before using them.
