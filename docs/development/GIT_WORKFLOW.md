# Git Workflow

## 1. Branches

- `main` is the release-ready branch. Every commit on it carries a passing `ci-gate` check, and
  every such commit deploys the dev stage (`deploy.yml`, triggered by the CI run that passed).
  Nothing pushes `main` without that check: the dispatcher's promotion carries it from `loop/rc`,
  a human change arrives through a pull request. `main` has a ruleset: no force push, no
  deletion, `ci-gate` required on every pushed commit.
- `loop/rc` is the dispatcher's integration branch (§5). Workers take roadmap stories in their own
  worktrees (`dispatch/dndtools/<hash>`), every candidate is gated and independently reviewed, then
  fast-forwarded onto `loop/rc`. Every push runs CI; once the required `CI` workflow is green and
  the promotion window (one hour) has elapsed, the dispatcher fast-forwards `main` to that commit
  directly. There is no standing delivery pull request any more (ADR-043). `loop/rc` has a
  ruleset: no force push, no deletion.
- A pull request merged to `main` moves it ahead of `loop/rc`. The dispatcher's next promotion
  merges `main` back into `loop/rc` (a `merge-back-<sha>` candidate), CI verifies the merge
  commit on the push, and the promotion after that fast-forwards `main` again. Nobody merges
  `main` into `loop/rc` by hand. A merge that conflicts becomes one `promotion-recovery` task
  scoped to the paths the pull request touched.
- Human work branches from `main` as `<type>/<slug>` and merges by squash PR. Long-running
  multi-story efforts may use `initiative/<id>-<slug>` with `story/<id>-<slug>` branches off it;
  PRs into an `initiative/*` branch get the smoke tier.
- Rollback is a new `git revert` PR, never a force push. `git commit --amend` only for an unpushed
  commit.

## 2. Gates

No git hooks are installed; run these by hand.

| When                             | Command                                                       |
| -------------------------------- | ------------------------------------------------------------- |
| Before every push                | `pnpm test:smoke` (fast) or `pnpm check` (full)               |
| Before opening a PR              | `pnpm ci:local` (the `static`, `unit` and `build` legs)       |
| UI routes or interaction changes | `pnpm e2e` on both profiles; the full suite for shared routes |
| Accessibility-affecting changes  | `pnpm a11y:gate`                                              |
| Layer-spanning changes           | `pnpm validate`                                               |
| Electron changes                 | `pnpm desktop:build`, `desktop:smoke`                         |
| Android changes                  | `android:sync` + the Gradle tasks in the Android runbook      |
| Infra changes                    | the `infra-ops-reviewer` agent and `pnpm cloud:drift`         |

### Smoke gate

`pnpm test:smoke` = `lint:boundary` + `typecheck` + the curated critical-unit subset in
`packages/core/vitest.smoke.config.ts` (schemas, migration, permission grants, the cloud, renderer,
and privacy security boundaries, command dispatch). It is deliberately the load-bearing seams, not
the fastest tests.

### CI: the required tier

`.github/workflows/ci.yml` is one workflow whose legs run in parallel from a cached install and
feed one aggregate job, **`ci-gate`**. That job is the only required status check: branch rules,
`deploy.yml`, `release.yml`, `promote-production.yml` and the dispatcher all read it on the
commit, so the legs can be reshaped without touching any of them. A leg that is skipped because
its paths did not change is fine; a failed or cancelled leg fails the gate.

| Leg                 | What it runs                                                                                              | Runs when                  |
| ------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------- |
| `static`            | quality gates, secrets scan, format baseline, Android version contract, stage config, lint, typecheck     | always                     |
| `unit` ×4           | `test:coverage:core` (core + coverage floors), `test:cloud`, `test:app`, `test:tooling`                   | always                     |
| `build`             | `pnpm build`, bundle budget                                                                               | always                     |
| `e2e` ×6 + report   | the functional Playwright suite, both profiles, six shards merged into one report; `@quarantine` excluded | runtime paths changed      |
| `accessibility`     | axe on both profiles + the release policy                                                                 | runtime paths changed      |
| `visual-regression` | golden routes against the committed baselines                                                             | pixel-moving paths changed |
| `desktop-smoke`     | Electron boot, CSP, persistence                                                                           | desktop paths changed      |
| `android-build`     | Gradle unit, lint, debug APK                                                                              | Android paths changed      |

Every browser leg runs inside the pinned Playwright image (the one the visual baselines describe),
so no job installs browsers or touches apt. The wall time is the slowest leg, about ten minutes.

A push to `main` that fast-forwards a commit already green on `loop/rc` reuses that verdict: the
`changes` job finds the existing `ci-gate` on the commit, every leg skips, and `ci-gate` passes
on that evidence. PRs into `initiative/*` run only `smoke-gate`.

### Heavy and flaky checks: nightly

`nightly.yml` runs daily against `loop/rc` (or any ref by dispatch): the Android emulator legs
(instrumentation + lifecycle acceptance on API 36), every browser test tagged `@quarantine`
(five repeats each), and the whole-application harness `pnpm validate`. A failure opens or
updates one issue labelled `nightly`; a green night closes it. None of it blocks a landing. The
emulator legs also run on every release tag (`release.yml`).

Other workflows: `deploy.yml` (dev cloud deploy after a green CI run on `main`, redeploying only
what changed since the last successful deploy), `promote-production.yml` (manual, protected
`production` environment), `release.yml` (tag-triggered desktop and Android packaging),
`cloud-drift.yml` (scheduled), `perf.yml` (push to `main`, weekly, or manual; no longer on pull
requests), `supply-chain.yml` (workflow lint on PRs and on workflow edits pushed to `loop/rc` or
`main`; weekly audit and SBOM). Workflows share `.github/actions/setup-workspace` (pnpm, Node,
cached install); the Playwright install action `.github/actions/setup-e2e` remains for the jobs
that run outside the image (`perf.yml`, the nightly harness).

The dispatcher's per-candidate gate list mirrors the required tier (quality gates, format,
typecheck, lint, all unit suites, build, bundle budget, feature audit, the full browser suite on
both profiles, axe, the visual suite); the run on `loop/rc` is the independent confirmation on
the integrated tree, and promotion re-runs only the cheap contract checks.

## 3. Branch protection

Rulesets (Settings → Rules), created by `scripts/ci/apply-rulesets.sh`:

- `main`: block force pushes and deletion, require the `ci-gate` status check on every pushed
  commit. Repository admins may bypass only through a pull request.
- `loop/rc`: block force pushes and deletion. No status check: the dispatcher pushes commits
  GitHub has never seen, and CI runs on the push.

Neither ruleset requires linear history: the dispatcher's merge-back of a pull request into
`loop/rc` is a merge commit, and it reaches `main` by fast-forward.

Repository settings enable squash merge, auto-merge, and head-branch deletion.

## 4. Pull requests

Title `<type>(<scope>): <imperative summary>` (append `[RC-XXX-n.m]` for a roadmap story). The body
states what changed, why, and which of `check` / `validate` / `e2e` / `a11y:gate` you ran, with
file:line and test names for each acceptance criterion. Any PR touching `src/ds`, tokens, or a
screen requests the `ux-ui-reviewer` agent; sandbox, host API, package review, private store,
sync, billing, or cloud paths run `/security-review`; anything under `infra/` runs the
`infra-ops-reviewer` agent.

## 5. The dispatcher

`docs/planning/RC_ROADMAP.md` is executed by the shared agent dispatcher in
`~/Programming/agent-dispatcher` (`dispatch.py status | control | command | migrate`). The rules it
enforces on stories — the ownership write fence, companion paths, phase gate, retry and review
semantics — are in RC_ROADMAP.md §21. Two scripts keep the file and the store equal:

- `tools/roadmap/sync-status.py` renders the store into §23's status column (run before a promotion).
- `tools/roadmap/sync-tasks.py --apply` pushes an edited story's ownership, acceptance and dependency
  lines into the store for every unfinished task (migration only creates new ids).

A story added on `main` reaches the dispatcher after `main` is merged into `loop/rc` and pushed, then
`dispatch.py migrate dndtools --apply`.

When GitHub CI fails on a published or promoted commit, the dispatcher first re-runs the failed
jobs once (no tokens). If the rerun is red too, it creates one `ci-recovery-<sha>` task scoped to
the paths changed since the last green promotion plus the workflow files; later failures are
absorbed into that open task instead of spawning siblings. A nightly failure never creates a task:
it is an issue for the operator.

## 6. Branch ledger (2026-09-11)

Deleted branch names whose tips are kept under `refs/archive/*` (`git for-each-ref refs/archive`;
restore with `git branch <name> refs/archive/<name>`):

- `salvage/*` (41): the retired per-repo loop's unverified and orphaned runs from 2026-07-29 to
  2026-09-08. Every story they carried (ENG-1.1, UX-1.2/1.3/1.4, WID-4.2, MAP-2.1/3.2/3.5/3.8,
  AI-1.4, PLT-2.1/2.2, STB-1.2/2.7, ENG-2.2, CAN-3.1, CLD-1.3) later succeeded through the dispatcher.
- `loop/rc.backup`: one commit, `1111f0fb` (RC-ENG-2.3), whose `ci.yml` hunks are on `loop/rc` and
  whose `tools/loop` parts are retired; kept as `refs/archive/loop-rc-backup`.
- `auto/visual-review-loop`: the retired visual-review loop, 304 commits behind `main`.
- `dispatch/dndtools/<hash>` (10): worktrees of succeeded dispatcher tasks (CAN-2.1/2.2, DSN-1.1/2.2,
  ENG-2.3/2.4/2.5, UX-3.1/3.2, one ci-recovery), all integrated; kept as `refs/archive/dispatch/<hash>`.
- Worktrees removed: `~/Programming/dndtools-loop/wt-1..5`, `~/Programming/dndtools-review-loop`.
- Open dependabot PRs #56, #57, #59–#63 are superseded by RC-ENG-4.4 and closed when it lands.

Second pass (2026-09-11, evening), after `loop/rc` through `5e6064d9` was merged into `main`:

- Every live `dispatch/dndtools/<hash>` tip is also kept as `refs/archive/dispatch/<hash>`, and
  RC-ENG-4.4's uncommitted `package.json`/`pnpm-lock.yaml` edits as
  `refs/archive/dispatch/a127e092d50a35118a0a-wip` (a stash commit; `git stash apply <ref>`).
- Deleted: the worktrees and branches of the two cancelled ci-recovery tasks, `4a335b1e…` (805d8646)
  and `de0f3813…` (3682f366). Their demo-seed commit is the same patch as `ecc21717` on `main` (PR
  #68) and their `Board.tsx` Prettier fix is `703d5443`; only their run journals are archive-only.
- Kept on purpose: the 12 worktrees of blocked or in-review tasks (CAN-2.3/2.4/4.1/5.1/6.1,
  CLD-2.2/4.5, DOC-2.2, ENG-1.3/2.6/4.4, WID-2.4). The dispatcher re-creates a missing worktree with
  `git worktree add -b`, so removing one while its task is open breaks that task.
