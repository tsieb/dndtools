# Git Workflow

Reference for branch strategy, commit conventions, validation gates, PR process, and recovery guidance — for both human developers and AI agents.

---

## 1. Branch Strategy

### 1.1 Primary Branch

`master` is the stable branch. CI runs on every push. It must always pass `pnpm check` and be deployable.

### 1.2 Story Branches

All story-level work requires a dedicated branch. Commit directly to `master` only for:

- Single-file documentation fixes
- Trivial typos with no behavior change

Branch naming convention:

```
story/<epic-id>-<story-id>-<slug>
```

- `<epic-id>` and `<story-id>` map directly to MASTER_PLAN.md identifiers (e.g., `1.4`, `s1.4.2`)
- `<slug>` is a 2–5 word kebab-case summary of the story

Examples:

```
story/2.1-s2.1.1-core-ci-workflow
story/1.4-s1.4.2-ipc-payload-validation
story/3.2-s3.2.4-faceted-search-filter
```

### 1.3 Agent Branch Lifecycle

```bash
# 1. Start from latest master
git checkout master

# 2. Create story branch
git checkout -b story/<epic-id>-<story-id>-<slug>

# 3. Work in task-sized commits
#    Pre-commit hook runs lint + format:check automatically on each commit

# 4. Push branch (pre-push hook runs pnpm check — full gate)
git push -u origin story/<epic-id>-<story-id>-<slug>

# 5. Open PR and enable auto-merge
gh pr create \
  --title "<type>(<scope>): <summary> [Epic X.Y / SX.X.X]" \
  --body "$(cat .github/pull_request_template.md)" \
  --base master
gh pr merge --auto --squash

# 6. CI runs on the PR. When green, GitHub auto-merges as a squash commit on master.
#    You do not need to wait — proceed to the next task.
```

### 1.4 Agent Hard Rules

- **You may merge your own PRs when CI passes** — no human approval required
- Never force-push `master`
- Never use `--no-verify` to bypass git hooks — hooks are the local gate
- Never `git reset --hard` without explicit human instruction
- Never rewrite pushed branch history on shared branches
- Do not initiate a rollback of a merged PR on your own — that is a human decision

---

## 2. Commit Message Convention

### 2.1 Format

```
<type>(<scope>): <imperative summary>

[optional body — explain why, not what]

[optional footer — refs, breaking changes]
```

### 2.2 Types

| Type       | When                                      |
| ---------- | ----------------------------------------- |
| `feat`     | New capability visible to users or agents |
| `fix`      | Bug correction                            |
| `refactor` | Restructuring with no behavior change     |
| `test`     | Adding or updating tests only             |
| `docs`     | Documentation only                        |
| `chore`    | Build scripts, deps, CI config            |
| `perf`     | Performance improvement                   |
| `style`    | Formatting, whitespace only               |

### 2.3 Scopes

Use the top-level module or domain:

`mcp` · `renderer` · `electron` · `storage` · `ui` · `ci`

### 2.4 Examples

```
feat(mcp): add get_campaign_health tool with scoring logic
fix(storage): prevent index write when vault is read-only
test(mcp): add edge case coverage for delete_note
refactor(renderer): extract note header into standalone component
docs: add GIT_WORKFLOW.md with branch and commit conventions
chore(ci): add format:check step to quality workflow
```

This convention aligns with Conventional Commits and is enforced in CI via
`.github/workflows/commitlint.yml`. Releases are automated via
`.github/workflows/release-please.yml` and `.github/workflows/release-assets.yml`.

### 2.5 Commit Sizing

Each commit corresponds to one Task in the PLANNING_TIERS hierarchy (hours of work, single coherent concern, passes tests independently).

Do not:

- Commit broken code with intent to fix in the next commit
- Bundle unrelated changes in a single commit
- Use vague messages like "wip", "fixes", "cleanup"

---

## 3. Validation Gates

### 3.1 Automatic (Hooks)

| Hook       | Trigger            | Command                                      |
| ---------- | ------------------ | -------------------------------------------- |
| pre-commit | Every `git commit` | `pnpm lint && pnpm format:check`             |
| pre-push   | Every `git push`   | `pnpm check` (lint + typecheck + unit tests) |

These run automatically. Never bypass with `--no-verify`.

### 3.2 Manual (Conditional)

Run these after the pre-push gate, before opening a PR, when the change warrants it:

| When                                         | Command              |
| -------------------------------------------- | -------------------- |
| Any `src/` or Svelte component changed       | `pnpm test:e2e`      |
| Any `electron/` or `mcp/` entrypoint changed | `pnpm desktop:build` |
| Any `mcp/tools/` or `mcp/resources/` changed | `pnpm mcp:build`     |

### 3.3 CI (On Every PR)

PRs are validated by multiple workflows:

- `.github/workflows/ci.yml`:
  - Node LTS matrix quality checks (lint, typecheck, unit tests, and `pnpm check`)
  - docs drift validation (`pnpm docs:validate`) for path integrity, `TODO(APP)` metadata, and migration-version sync
- `.github/workflows/e2e.yml`:
  - headed desktop E2E smoke in Electron via Playwright + `xvfb` on Ubuntu
- `.github/workflows/commitlint.yml`:
  - Conventional Commits enforcement across PR commit history

A PR must not be merged if CI is red. Fix the issue with a new commit on the story branch — CI re-runs automatically.

### 3.4 Definition of "Ready to Merge"

A story branch is ready to merge when:

- `pnpm check` passes locally
- `pnpm format:check` passes locally
- All acceptance criteria in the story are met
- Docs updated for any contract, architecture, or user-visible behavior change
- CI is green on the PR

---

## 4. Pull Request Process

### 4.1 Scope

One PR per Story. A Story is the smallest piece of work that provides standalone value (see `docs/PLANNING_TIERS.md`). PRs covering multiple stories are only acceptable if the stories are strictly sequential and the combination was pre-planned.

### 4.2 PR Title

```
<type>(<scope>): <story summary> [Epic X.Y / SX.X.X]
```

Example:

```
feat(mcp): add get_campaign_health tool [Epic 2.1 / S2.1.1]
```

### 4.3 PR Description

Use the template at `.github/pull_request_template.md` — GitHub auto-populates it when creating a PR via the UI. When using `gh pr create`, pass `--body "$(cat .github/pull_request_template.md)"` and fill in the fields.

### 4.4 Merge Policy

- CI must pass before merging
- Agents may self-merge using `gh pr merge --auto --squash` — no human approval needed
- Each story merges as a single squash commit on `master` — this is intentional for clean rollback history
- Auto-merge must be enabled in GitHub repo settings (see §6)

---

## 5. Recovery Guidance

| Situation                                    | Action                                                                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-commit hook fails                        | Fix the lint/format error; re-commit — do not use `--no-verify`                                                                                                |
| Pre-push hook fails                          | Fix the typecheck/test error; re-commit; push again                                                                                                            |
| CI fails on a PR                             | Push a new fix commit to the story branch; CI re-runs automatically                                                                                            |
| Broken commit, not yet pushed                | `git commit --amend` on the immediately preceding commit only                                                                                                  |
| Broken commit, already pushed (story branch) | New fix commit; never rewrite pushed branch history                                                                                                            |
| Broken code reached `master`                 | Create `fix/<description>` branch immediately; fast-track PR; do not push more to `master` until merged                                                        |
| Story branch diverged from master            | `git rebase master`; resolve conflicts; re-run `pnpm check`; `git push --force-with-lease origin <branch>` (story branch only — never master)                  |
| Merged PR needs rollback                     | **Human decision.** Recovery path is always a new `git revert <merge-sha>` PR — never a forced reset of master history. Agents do not self-initiate rollbacks. |

---

## 6. GitHub Remote Setup (When Remote Is Added)

This project is currently local-only. When a GitHub remote is configured, perform these one-time settings:

### GitHub Repo Settings

- **Allow squash merging**: enabled
- **Allow merge commits**: disabled (keep history clean)
- **Allow rebase merging**: disabled
- **Auto-merge**: enabled (allows `gh pr merge --auto` to work)
- **Automatically delete head branches**: enabled

### Branch Protection on `master`

Available on free personal GitHub accounts:

- Require status checks to pass before merging: enable `quality` (the job name in `ci.yml`)
- Do not allow bypassing the above settings
- Allow force pushes: disabled
- Allow deletions: disabled

### Release Tooling (Implemented)

- `release-please` opens and updates release PRs from Conventional Commit history
  (`.github/workflows/release-please.yml`)
- Release artifact workflow publishes desktop bundles + MCP bundle and signed checksums
  (`.github/workflows/release-assets.yml`)
- Published release notes must include a `## Human Reviewed Notes` section before artifact publication proceeds

---

## 7. Reference

| Document                               | Purpose                                             |
| -------------------------------------- | --------------------------------------------------- |
| `docs/MASTER_PLAN.md`                  | Epic and Story identifiers for branch naming        |
| `docs/PLANNING_TIERS.md`               | Initiative → Epic → Story → Task → Atomic hierarchy |
| `docs/DEVELOPMENT.md`                  | Canonical quality commands and boundary rules       |
| `.github/workflows/ci.yml`             | Core quality and docs validation gates              |
| `.github/workflows/e2e.yml`            | Desktop E2E CI definition                           |
| `.github/workflows/desktop-build.yml`  | Cross-platform desktop build + smoke matrix         |
| `.github/workflows/commitlint.yml`     | Conventional Commit enforcement                     |
| `.github/workflows/release-please.yml` | Automated release PR + changelog generation         |
| `.github/workflows/release-assets.yml` | Release artifact publication and signing            |
| `CLAUDE.md`                            | Agent development guide                             |
