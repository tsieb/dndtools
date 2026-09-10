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
