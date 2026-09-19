# ci-recovery-1f4c55540ea9 — repair GitHub CI for `1f4c5554`

Task: repair GitHub CI for promoted commit `1f4c55540ea9ba386c935a18ad60348ee112c943`
(`docs(design): correct the RC-DSN-2.4 drift record against the tree`).
Failing workflow: CI.

This is the third pass. The first two diagnosed and fixed both red jobs; the gate then
returned the branch with a rebase conflict against `bad7c0c7` in
`.github/workflows/{ci,release,validate}.yml`. That conflict is the finding: both repairs
had reached the integration branch in the meantime, so this pass is a reconciliation, and
the branch now carries no code at all.

## Reported failure

`CI` red on `1f4c5554` — runs
[35183764527](https://github.com/tsieb/dndtools/actions/runs/35183764527) (push) and
[35183768645](https://github.com/tsieb/dndtools/actions/runs/35183768645) (PR). Read from
the job list rather than the summary, two jobs failed and nothing else:

```
X visual regression (golden routes)        9 of 135 failed — every capture was /knowledge
X Android unit, lint, and package checks   died 35s in, at "Set up Android SDK"
```

`1f4c5554` is a docs-only commit, so it caused neither. Both are drift that every promoted
commit re-inherits until the repair lands on `loop/rc`.

## Diagnosis (unchanged from passes 1–2)

- **Android.** `android-actions/setup-android@40fd30fb` (v4.0.1) defaults its `packages`
  input to `tools platform-tools`. Google removed the obsolete `tools` package (SDK Tools
  26.1.1) from the SDK repository on 2026-09-16, so `sdkmanager` exits 1 with
  `Failed to find package 'tools'` before a single toolchain package installs. Reproduced
  locally against the live repository in pass 1:
  `sdkmanager --sdk_root=/home/trinkle/Android tools` → same warning, exit 1.
- **Visual.** RC-KNW-2.2 (`456b27f4`) swapped the `/knowledge` note card from
  `formatStamp(n.updatedAt, formatDate)` to `formatRelativeTime(...)` and did not
  re-baseline. The suite pins the clock to the seeded notes' own `updatedAt`, so the delta
  is exactly 0 and the card deterministically renders `updated now` where the baseline says
  `updated Mar 14`. A stale baseline, not a flake.

## Reconciliation — both repairs are already on the integration branch

`bad7c0c7` carries both, authored by sibling `ci-recovery` tasks:

| Repair  | On `loop/rc` as                                                |
| ------- | -------------------------------------------------------------- |
| Android | `31acff8e` ci(android) + `7b2e81de` test(ci) guardrail         |
| Visual  | `283580fc` test(visual): re-baseline /knowledge for RC-KNW-2.2 |

So this branch's two commits were duplicates, and that is precisely why the rebase
conflicted: both sides add the identical `packages: platform-tools` pin at the same three
call sites, differing only in the comment above it. Resolved in favour of the integration
branch, per the standing rule for sibling `ci-recovery` races — the duplicates were dropped
during `git rebase --onto bad7c0c7 6dda32b5`, not merged. `git diff bad7c0c7 HEAD` is now
this journal and nothing else.

Nothing was lost by dropping either one.

- The visual duplicate was redundant to the byte: `git diff bad7c0c7 HEAD -- tests/visual`
  was already empty before the rebase. Upstream's nine baselines and this branch's nine are
  the same blobs.
- The Android duplicate's guardrail was the weaker of the two. Upstream's
  `never asks the Android SDK for the retired 'tools' package` asserts everything this
  branch's copy did **and** that `platform-tools` is still requested, so it also fails
  closed against a rewrite to e.g. `packages: emulator` that would strip the platform-tools
  the Android jobs need.

The previous pass's commit `bd28435c` is preserved as this journal. The pre-rebase head is
kept at `refs/archive/ci-recovery-1f4c5554-pre-reconcile`.

## Verification

### The retained guardrail fails closed

Dropping a duplicate means the surviving test is one this branch did not author, so it was
mutation-checked rather than trusted for being green. Both regressions it exists to catch
were reintroduced in `ci.yml` and it caught each:

| Mutation                                            | Result                                                     |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `packages: platform-tools` → `tools platform-tools` | FAIL — `ci.yml setup-android requests the retired 'tools'` |
| deleted the whole `with:` block (takes the default) | FAIL — `ci.yml setup-android must pin 'packages'`          |

Reverted after each; `git status` clean. Unmutated, `pnpm vitest run
tests/unit/ci-guardrails.test.ts` → 14 passed.

### Both jobs are green in CI on this branch's base

The strongest evidence is GitHub's own, and it isolates the two repairs:

| Commit on `loop/rc`                      | Android job | Visual job | CI run                                 |
| ---------------------------------------- | ----------- | ---------- | -------------------------------------- |
| `1f4c5554` (reported)                    | FAIL        | FAIL       | 35183768645                            |
| `7b1621e4` (Android fix, no re-baseline) | pass        | FAIL       | 35274494699                            |
| `9c637eb0` (both fixes, = `bad7c0c7~1`)  | pass        | pass       | 35281645872 — whole workflow `success` |

Each fix closes exactly the job it targets, and the tip this branch sits on is fully green.

### Local gates on the reconciled head

Re-run here because `bad7c0c7` adds RC-SES-5.1, the storage-integrity work and
`995ec816 fix(knowledge): reset the saved-search form before its dispatch settles` on top
of what the earlier passes measured — the last of those touches the knowledge screen, so
the `/knowledge` baselines had to be re-proved against this tree rather than assumed.

| Gate                                                        | Result                                         |
| ----------------------------------------------------------- | ---------------------------------------------- |
| `pnpm lint`                                                 | exit 0                                         |
| `pnpm typecheck`                                            | exit 0                                         |
| `pnpm test`                                                 | exit 0 — 7002 tests (4830 + 499 + 1481 + 192)  |
| `pnpm build`                                                | exit 0 — `check-prod-bundle: OK`, 83 JS assets |
| golden routes, pinned container, `--update-snapshots=none`  | exit 0 — 135 passed, 0 failed, no retries      |
| `node apps/gm-react/tests/visual/check-baseline-budget.mjs` | exit 0 — 135 files, 12796.0 of 32768.0 KiB     |
| `pnpm format:check:changed -- --base loop/rc`               | exit 0 (after Prettier reflowed this journal)  |

The golden-route run used `--update-snapshots=none`, so it could only compare, never
rewrite; `git status` after it showed this journal as the sole modification, confirming no
baseline was silently refreshed to manufacture a pass.

No test or workflow protection was weakened; this pass removes only duplicated code and
leaves the integration branch's stricter versions of both in place.
