# Branch ledger

RC-STB-1.2 branch-hygiene pass. Records what happened to every non-`main` ref that existed on
2026-09-06 and why, so `git branch -a` staying down to `main` + active initiative branches doesn't
read as silent data loss.

## Remote branches deleted (GitHub, via `gh`/`gh api`, no local push)

All of the following were fully merged into `main` (verified with
`git merge-base --is-ancestor <branch> origin/main`, or their PR shows `MERGED`) or were dead ends
whose PR was already `CLOSED` with no unmerged content worth keeping. Deleted via the GitHub API so
history stays reachable through the merge commits / closed PRs on github.com if anyone needs it
later.

- `claude/project-cleanup-docs-sj0q6f` — merged (PR #25).
- `epic/SRCH-filters-and-saved-searches` — ancestor of `main`; all content (incl. docs) already
  landed. No cherry-pick needed despite the roadmap line assuming otherwise — it was written before
  this branch got folded in.
- `feat/agentic-ai-runs` — ancestor of `main` (PR #34).
- `feat/completion-pass` — ancestor of `main`.
- `feat/gm-react-p2p` — ancestor of `main`.
- `reorg/promote-gm` — merged (PR #23).
- `ux/clarity-pass` — ancestor of `main`.
- `worktree-react-prototype` — merged (PR #26).
- `master` — pre-rename default branch (see [[project_react_primary_pivot]]); GitHub default has
  been `main` since 2026-07-09. Fully an ancestor of `main`, so the tip is preserved.
- `remake`, `v2-clean-slate` — pre-React-pivot experiment branches from the Svelte/remake era;
  ancestors of `main`, superseded by the shipped React app.
- `initiative/21-realignment` — merged (PR #22); not a literal git ancestor of `main` (squash
  merge), content confirmed landed via the PR.
- `initiative/22-ux-audit-remediation` — one unique commit (`0e0fdcde`, "add Initiative 22")
  never merged: a March-2026 human-driven audit process doc (`docs/planning/initiatives/I22-*`)
  written against the old Svelte-era `CLAUDE.md`/`pnpm check` workflow. Superseded by
  `docs/planning/RC_ROADMAP.md`'s UX lane and the current story-based process; not resurrected.
- `release-please--branches--master--components--dndtools` — leftover from a release-please bot
  run; the tool isn't wired into any current workflow (`.github/workflows/release.yml` is a manual
  tag-triggered desktop/Android packager, unrelated). Dead automation branch.
- `claude/widget-design-brief-y8qc5a` — its one unique commit (`5e405d96`,
  `docs/architecture/WIDGET_FEATURE_BRIEF.md`) was cherry-picked onto this run's tree first (see
  below); the WID lane's input is preserved, branch deleted.
- All 12 dependabot branches present at the start of this pass
  (`github_actions/actions-a936dc9853`, `gradle/.../com.google.gms-google-services-4.5.0`,
  `gradle/.../gradle-wrapper-9.7.1`, `npm_and_yarn/multi-3d3f0671f1`,
  `npm_and_yarn/multi-b0dfc253ff`, `npm_and_yarn/runtime-patches-1b456a7de1`,
  `npm_and_yarn/tooling-patches-db173a2644`, `npm_and_yarn/types/node-26.1.1`,
  `npm_and_yarn/typescript-6.0.3`, `npm_and_yarn/vite-8.1.5`) — see PR disposition below.

## Cherry-picked

- `docs/architecture/WIDGET_FEATURE_BRIEF.md` from `claude/widget-design-brief-y8qc5a`
  (commit `5e405d96`, single-file, no conflicts) — feeds the WID lane. See commit `61abd7a6` in
  this run.

## Dependabot PRs (12 total)

11 of the 12 were already `MERGED` (#51 actions, #54 gradle-wrapper, #55 runtime-patches) or
`CLOSED` by the time this pass ran (superseded by newer dependabot re-proposals, including the
`typescript-6.0.3` PR #30 — dependabot itself closed it, no newer TS bump PR was open at ledger
time). The one still `OPEN` was:

- **#47 `dependabot/npm_and_yarn/vite-8.1.5`** (chore(deps-dev): bump vite from 7.3.6 to 8.1.5) —
  **closed, not merged.** GitHub reports it `CONFLICTING` against current `main`, and a vite 7→8
  major bump needs its own typecheck+build verification run, which is bigger than this
  branch-hygiene story's scope. Left for a future story to re-take (dependabot will recreate the PR
  against current `main` on its next scheduled run, or someone can cherry-pick the bump commit and
  run typecheck+build deliberately).

## Stash

`git stash list` was empty at the start of this pass — nothing to drop.

## Local branches — out of scope for this pass

`auto/visual-review-loop` and the `salvage/*` branches (`salvage/run002-unverified`,
`salvage/run015-unverified`, `salvage/slot*-orphan-*`, `salvage/slot*-unverified-run-*`,
`salvage/*-wip-*`) are the RC loop's own recovery artifacts (see `tools/loop/`), not development
branches this story owns. They live only in the shared local repo behind every slot's worktree, not
on the remote. Left untouched — pruning them (if ever warranted) is the loop wrapper's call, not an
in-worktree git-refs story's.

## Result

`git branch -a` (remote side) now lists only `main` and `loop/rc`, the active RC integration
branch. Local side still carries the loop's own `auto/visual-review-loop` and `salvage/*` refs,
which this story does not own (see above).
