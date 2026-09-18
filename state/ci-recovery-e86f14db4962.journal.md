# ci-recovery-e86f14db4962 — run journal

Task: repair GitHub CI for promoted commit `e86f14db4962ae8f51d3c738b26a5441687c5b55`
(`test(visual): re-baseline /board, /scene/:id and /settings for the new base`).
Failing workflow: CI.

## Diagnosis

The failure is not in the named commit. Both CI runs on the SHA (`35139440540` and
`35139443821`) show exactly one red job, confirmed by querying the run's job list rather
than reading the summary page:

```
failure   Android unit, lint, and package checks
```

Every other job on the SHA passed, and the sibling Performance (`35139443689`) and Supply
Chain (`35139443808`) workflows both passed. The job died in "Set up Android SDK" before
Gradle started. The promoted commit only re-baselines three PNG snapshots, so it cannot
reach the Android toolchain — this is environmental drift that every promoted commit
inherits.

Root cause: the workflows pin `android-actions/setup-android` at `40fd30fb` (v4.0.1) but
passed no `packages` input, so the action took its default of `tools platform-tools`.
Google retired the obsolete standalone `tools` package (SDK Tools 26.1.1), so `sdkmanager`
exits 1 on it. Drift underneath a correctly pinned action, which is why it began failing
with no workflow change.

## Local reproduction

Against the local SDK at `/home/trinkle/Android`, no GitHub involved:

```
$ sdkmanager --sdk_root=/home/trinkle/Android tools
Warning: Failed to find package 'tools'
exit=1

$ sdkmanager --sdk_root=/home/trinkle/Android platform-tools
exit=0
```

Same message and exit code as CI, and the replacement package still resolves.

## Repair: already upstream

`loop/rc` already carries the fix. Verified by ancestry rather than assumed — both
`git merge-base --is-ancestor 31acff8e origin/loop/rc` and the same check for `7b2e81de`
exit 0:

- `31acff8e` pins `packages: platform-tools` at all three `setup-android` call sites
  (`ci.yml:371`, `release.yml:348`, `validate.yml:93`).
- `7b2e81de` adds the guardrail that fails closed when a workflow drops it.

`31acff8e` was authored roughly seven hours before this branch's duplicate. The promoted
commit `e86f14db` is itself already an ancestor of the integration tip, so nothing needed
carrying forward.

The upstream fix is green on a real runner: in CI run `35268656982` on `loop/rc` commit
`d77cbb05`, "Android unit, lint, and package checks" is SUCCESS, having failed on every
commit before the pin. That job needs a runner with KVM and the API 36 emulator, so the
runner result is cited rather than re-derived locally.

## Why this branch's own commits were discarded

This branch's only non-upstream commits were an independent duplicate of the same pin with
a weaker copy of the same guardrail (`551b7862`), plus its journal (`e4ba863b`). They are
why integration conflicted — read-only triage
`git merge-tree --write-tree --name-only origin/loop/rc e4ba863b` exits 1 with
`CONFLICT (content)` in all three workflow files, which differ from upstream only in
comment wording, while `tests/unit/ci-guardrails.test.ts` auto-merges into a second
near-duplicate test.

Resolved in favour of the integration branch: reset onto `524fc4d0`, superseded candidate
preserved at the local tag `backup/pre-reconcile-e86f14db4962`. Nothing is lost — the
upstream guardrail is strictly stronger. It additionally asserts that `platform-tools` is
still requested, which the discarded copy never checked, so the discarded version would
have passed a rewrite to `packages: emulator` that strips the platform-tools the Android
jobs need.

## Verification on the reset tree

Run against the reset tree, not inferred from upstream:

- all three call sites carry `packages: platform-tools`, action SHA `40fd30fb` unchanged
- `pnpm vitest run tests/unit/ci-guardrails.test.ts` — 14/14 passed
- `pnpm test:tooling` — 26 files, 192 tests passed
- `pnpm typecheck` — core + cloud-fns + gm-react, exit 0
- `pnpm lint` — raw-style, eslint, boundary, emphasis, a11y:contrast, exit 0 (15 eslint
  warnings and the emphasis baseline notice are pre-existing and unchanged by this branch)
- `pnpm check:android` — preflight passed (static checks only)

The retained upstream guardrail was mutation-checked against all three loss shapes, each
in a different workflow file to confirm the guard walks every workflow rather than only
`ci.yml`:

| mutation                                    | result                                                   |
| ------------------------------------------- | -------------------------------------------------------- |
| `ci.yml` → `packages: tools platform-tools` | FAILS: "ci.yml setup-android requests the retired tools" |
| `validate.yml` → `packages: emulator`       | FAILS: "validate.yml setup-android drops platform-tools" |
| `release.yml` → `with:` block deleted       | FAILS: "release.yml setup-android must pin packages"     |
| unmutated                                   | 14 passed                                                |

Each file was restored after its mutation and `git status` is empty. `actionlint` is not
installed in this environment and was not run; nothing is claimed from it.

## Out of scope

`loop/rc`'s remaining red is "visual regression (golden routes)" on the nine `/knowledge`
snapshots — a separately-tracked `formatRelativeTime` re-baseline item with its own owner
that predates this branch and was never scheduled on `e86f14db`. No duplicate re-baseline
attempt is added here.

This branch carries no workflow or test change. No gate, assertion or workflow protection
was weakened.
