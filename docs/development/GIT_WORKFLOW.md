# Git Workflow

## 1. Branches

- `main` is the release-ready branch and the only branch CI deploys from (dev stage). Direct commits
  are reserved for single-file doc fixes and human-approved emergency follow-ups.
- `loop/rc` is the dispatcher's integration branch (§5). Workers take roadmap stories in their own
  worktrees (`dispatch/dndtools/<hash>`), every candidate is gated and independently reviewed, then
  integrated onto `loop/rc`; a delivery PR promotes `loop/rc` to `main` on a 12-hour window when the
  required `CI` workflow is green. Every push to `loop/rc` runs full CI including all browser shards.
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
| Before opening a PR              | `pnpm check`, plus the domain gates below                     |
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

### CI tiers

`.github/workflows/ci.yml` tiers by the PR's base branch: a PR into `initiative/*` runs `smoke-gate`;
a push to `main`, a PR into `main`, `loop/rc`, or `workflow_dispatch` runs the full tier:

- `build-and-test`: credentials scan, quality gates, lint, typecheck, production build and bundle
  budget, all unit suites.
- `browser-e2e`: three Playwright shards with failure artifacts; `accessibility`: axe on both
  profiles; `desktop-smoke`: Electron boot, CSP, persistence; `android-checks`: JDK 21 / API 36
  sync, Gradle unit and lint, debug package. All path-filtered on `main` PRs, unconditional on
  `loop/rc`.

The dispatcher's per-candidate gate list (quality gates, format, typecheck, lint, all unit suites,
build, feature audit, the full browser suite on both profiles) mirrors this tier; the run on
`loop/rc` is the independent confirmation on the integrated tree.

Other workflows: `validate.yml` (weekly and manual whole-app harness), `deploy.yml` (dev cloud
deploy over OIDC, skips cleanly when unconfigured), `promote-production.yml` (manual, protected
`production` environment), `cloud-drift.yml` (scheduled), `perf.yml` (path-filtered budgets),
`release.yml` (tag-triggered desktop and Android packaging). Playwright installation is one
composite action, `.github/actions/setup-e2e`, restored from the workflow SHA when a release tag
predates it.

## 3. Branch protection

`main`: require a PR, require `build-and-test` and `android-checks`, require up to date, no
bypass, no force push, no deletion. `initiative/*`: the same with `smoke-gate` as the required
check. Repository settings enable squash merge, auto-merge, and head-branch deletion.

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
