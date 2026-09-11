# Git Workflow

## 1. Branches

- `main` is the release-ready branch and the only branch CI deploys from (dev stage). Direct commits
  are reserved for single-file doc fixes and human-approved emergency follow-ups.
- `loop/rc` is the autonomous loop's integration branch. Agents work stories in their own worktrees,
  the wrapper rebases and pushes to `loop/rc`, and a promotion gate fast-forwards `main` (see
  `tools/loop/README.md`). Every push to `loop/rc` runs full CI including all browser shards.
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

The loop's story gate runs only the specs a story names plus specs sharing its owned paths and
routes (`gates.e2e_named_specs`), which is why the independent full run on `loop/rc` exists.

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
