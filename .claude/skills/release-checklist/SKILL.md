---
name: release-checklist
description: Sweep for the loose ends that outlive a push — the out-of-band steps a `git push` cannot perform and that therefore get forgotten. Use after merging a branch or completing a milestone, when a task ends with "PENDING USER", after renaming or retiring a branch, or when the user asks "what's still outstanding" / "did we finish that". Covers default-branch switches, deleting stale remote branches, infra parameters that encode a branch name, CI variables, and tags.
---

# Release / hand-off checklist

The failure mode this exists to prevent: work is finished, committed, and pushed — and the *out-of-band* half is never done, because nothing in the repo can fail to remind you. It sits in memory as `⚠️ PENDING USER` and rots. Run this sweep at the end of any milestone and report what is still open.

**Some of these steps mutate the remote or live infrastructure.** Diagnose everything, then present the pending items and let the user choose. Do not delete a remote branch, change a default branch, or deploy a stack without explicit confirmation.

## 1. Is the push actually complete?

```bash
git status -sb                       # ahead/behind markers
git log --oneline @{u}..             # commits held back locally
git log --oneline ..@{u}             # commits on the remote you don't have
git tag --points-at HEAD             # did the milestone tag get pushed?
git push --tags --dry-run
```

A branch that is `ahead` after you believed you pushed is the most common miss. Tags are separate refs and are **not** pushed by `git push`.

## 2. Default branch and its shadows

If the default branch was renamed (this repo went `master` → `main`), a push cannot finish the job. Verify all four, because each lives in a different system:

```bash
gh api repos/tsieb/dndtools --jq .default_branch     # GitHub's default branch
git symbolic-ref refs/remotes/origin/HEAD            # your local idea of it
git remote set-head origin -a                        # re-sync that after the switch
git branch -r                                        # is the old branch still on the remote?
```

Then, in order:

1. Switch the default in GitHub — `gh repo edit tsieb/dndtools --default-branch main` (or the repo Settings UI). Do this **before** deleting the old branch; GitHub refuses to delete the default branch, and open PRs need retargeting.
2. Retarget any open PRs whose base is the old branch: `gh pr list --base master`.
3. Delete the stale remote branch — `git push origin --delete master` — only once nothing depends on it.
4. `git remote set-head origin -a` locally.

## 3. Anything that *encodes* a branch name

This is the step that bites. A branch rename silently invalidates configuration in three places:

- **CI triggers** — `.github/workflows/*.yml` `on.push.branches`. Grep for the old name: `grep -rn "master" .github/workflows/`.
- **Deployed infra parameters** — `infra/foundation`'s `GitHubBranch` builds the OIDC trust condition `repo:tsieb/dndtools:ref:refs/heads/<branch>`. Editing `samconfig.toml` is not enough: **the stack must be redeployed**, and the parameter must be set explicitly in `parameter_overrides` (a CloudFormation *update* keeps a parameter's previous value when omitted; the template `Default:` only applies on *create*). Confirm against the live role, not the template:

  ```bash
  aws iam get-role --role-name <ci-deploy-role> --profile dndtools --region ca-central-1 \
    --query 'Role.AssumeRolePolicyDocument'
  ```

  Both `dev` and `prod` config-envs drift independently. See the `infra-deploy` skill, or the `infra-ops-reviewer` agent for a full drift audit.
- **Repo variables and secrets** — `gh variable list`, `gh secret list`. `deploy.yml`'s preflight goes *neutral* (not red) when `AWS_DEPLOY_ROLE_ARN` is missing, so an unconfigured deploy never shows up as a failure. Absence of red is not evidence of configuration.

## 4. Is the deployed state behind the tree?

A merge that lands `infra/` changes arms the path-filtered auto-deploy on the next push to the default branch. Before or right after such a push, know what will ship:

```bash
git log --oneline -5 -- infra/          # last infra commit
gh run list --workflow=deploy.yml -L 5  # did it run? did it skip?
```

If templates were hardened but never deployed, the live stacks are running the *old* infra and the next unrelated push to a filtered path will deploy them wholesale. Say that out loud — it is a surprise deploy, not a routine one.

## 5. Stale branches and worktrees

```bash
git branch -r --merged origin/main      # safe to delete
git branch -r --no-merged origin/main   # still carrying work — do NOT delete
git worktree list
```

Report merged-and-deletable branches as a list for the user to approve; never bulk-delete. Branches carrying unmerged work get named, not deleted.

## 6. Docs and memory that assert a now-false state

- Grep the tree for the retired name or the superseded claim: `grep -rn "master" docs/ infra/ .github/ --include=*.md --include=*.yml`. Comments that say "must be redeployed" after the redeploy happened are the same class of rot.
- Update the project memory entries whose `⚠️ PENDING USER` items you just closed, and delete the ones that are no longer true. A memory that survives its own resolution will mislead the next session.

## Output

Report as three buckets, in this order:

1. **Still open** — each item with the exact command that closes it and who must run it (you, or the user in a browser).
2. **Closed this pass** — with the evidence you used to confirm.
3. **Will happen automatically** — e.g. the next push to `main` touching `infra/**` triggers a deploy of the currently-undeployed templates. Name the trigger and the blast radius.
