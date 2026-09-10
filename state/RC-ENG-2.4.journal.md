# RC-ENG-2.4 implement journal

- Scope: consolidate six Playwright install callers into one local composite action.
- Guard: match Chrome repository content in legacy list lines and deb822 stanzas;
  preserve unrelated source definitions and propagate install failures.
- Validation complete:
  - `pnpm exec vitest run tests/unit/setup-e2e.test.ts tests/unit/ci-guardrails.test.ts`: 15 passed.
  - `bash .github/actions/setup-e2e/test-broken-source.sh`: Ubuntu 24.04 apt rejected
    conflicting Signed-By values in `runner.sources`, then succeeded after the guard.
    Docker apt runs use no network and an empty local package index; host apt is untouched.
  - actionlint on all five changed workflows passed (ShellCheck disabled).
  - ESLint on both changed test files passed.
- Initial checks exposed two fixture/contract issues, both resolved and rerun:
  restrictive host umask prevented the container apt user reading the fixture (explicit
  fixture read permissions added); remote-action pinning check rejected the new local
  action (allow only this exact repository-local action).
- Browser download and full application gates are left to the central operator;
  the isolated proof exercises real apt, not a full Playwright install.
- No pushes, promotions, dispatcher state edits, or additional agents.

## Attempt 2 — review changes requested on 6e102ade

- Finding 1 (release/rollback): `release.yml` and `promote-production.yml` check out the
  release tag, so `./.github/actions/setup-e2e` resolved from the tag's tree. Confirmed
  v0.3.5–v0.3.7 (v0.3.7 is live in prod) contain no `.github/actions` → rolling back would
  fail at "Set up browser tests". Fix: a step just before the action restores
  `.github/actions/setup-e2e` from `$GITHUB_WORKFLOW_SHA` into the worktree only (fetching
  that commit if the clone lacks it). HEAD stays on the tag and the index is untouched; on a
  tag-push release the workflow SHA is the tag, so this is a no-op. The runner guard is
  runner-side infrastructure, so the current workflow's copy is the right one for old tags.
- Finding 2 (path filters): added `.github/actions/setup-e2e/**` to the ci.yml `runtime`
  filter and to both perf.yml `push`/`pull_request` path lists.
- Validation:
  - Manual: cloned the repo, checked out v0.3.7, ran the restore commands with the
    workflow SHA = 6e102ade → action restored byte-identical, HEAD = tag, nothing staged.
  - `vitest run tests/unit/setup-e2e.test.ts tests/unit/ci-guardrails.test.ts`: 17 passed.
    New tests execute the restore step from both workflows against a temp origin whose
    tag predates the action (first run fetches the missing SHA, second finds it locally),
    and assert both path filters.
  - Mutations: deleting the release.yml restore step fails the rollback test; deleting the
    perf.yml filter entry fails the filter test. Both files restored afterwards.
  - actionlint (Docker, ShellCheck disabled) on all five workflows: exit 0.
  - ESLint + Prettier check on the test file: clean.
  - The action and apt guard are unchanged, so the earlier Docker broken-source proof
    still applies; I didn't rerun it.

## Attempt 3 — rebase onto loop/rc (23309972)

- Upstream `8e376da7` + `d686558a` had already fixed the Chrome apt fault inline at all six
  sites (`sudo rm -f $(grep -rl 'dl\.google\.com' …)`, content-matched). So the apt half of
  the original acceptance was already met upstream, but the "one action, six callers" half
  was not: the fix was still copied six times. I didn't re-implement the guard.
- Resolution: every workflow conflict was upstream's inline guard+install versus my
  `uses:` step. I took the `uses:` step and moved upstream's guard line into
  `action.yml` byte-for-byte, with its explanatory comment. I dropped my Python guard
  (`guard-apt-sources.py`) and its unit test. A resolver script asserted that each upstream
  hunk held only guard/install lines before discarding it. `git diff loop/rc` confirms that
  the only upstream workflow lines removed are the six guard/install pairs; the other
  upstream changes (loop/rc CI trigger, per-run concurrency, e2e no longer needing build)
  are kept.
- Known tradeoff of keeping upstream's guard: it deletes a whole file that mentions
  dl.google.com. My Python guard removed only the matching stanza. The runner's Chrome
  source is its own file, so this is fine on hosted runners, and it's upstream's call.
- Rebuilt `test-broken-source.sh` to prove the action's own guard: it extracts the `sudo rm`
  line from action.yml and runs it inside ubuntu:24.04 against real `/etc/apt` (a fixture
  bind-mounted over `sources.list.d`). The fixture has a deb822 `runner.sources` with
  conflicting Chrome Signed-By stanzas. apt fails before the guard and succeeds after it; the
  Chrome file is gone and the local source is kept.
- Commit 2 (rollback overlay + path filters) re-applied cleanly on the workflows; only the
  test file conflicted, on placement, and both sides' tests were kept.
- Validation on the final tree:
  - `vitest run tests/unit/setup-e2e.test.ts tests/unit/ci-guardrails.test.ts`: 17 passed.
    The new guard unit test runs the action's own step against a fixture (deb822 + .list,
    neither named for Chrome) and reruns it cleanly.
  - `bash .github/actions/setup-e2e/test-broken-source.sh`: PASS (exit 0). Mutation: with the
    guard pattern changed to a non-matching host, the proof fails (apt exit 100, Signed-By
    conflict). So the proof depends on the guard doing its job.
  - actionlint (Docker, ShellCheck disabled) on all five workflows: exit 0.
  - Prettier check + ESLint on both test files: clean.
- Full browser install and full application gates are left to the central operator.
