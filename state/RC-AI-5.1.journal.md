# RC-AI-5.1 run journal

- Implement deterministic assistant transcript replay and ten-prompt eval through the real Core agent pipeline.
- No AGENTS.md found; dispatch Headroom tools are unavailable. No delegation or dispatcher state changes.
- Required scope addition: vitest.app.config.ts must include the assigned tests/unit/ai-eval.test.ts, which the existing app glob excludes.
- Plan: strict replay provider, fixed fixture corpus with exact proposal payload baselines and refusal coverage, unchanged-domain assertions after every invocation, live smoke regression check, focused checks and commit.

## Implementation and validation

- Added an explicitly injected replay provider with cloned recordings, cancellation/stream callbacks, strict conversation/tool-result ordering, exhaustion checks, and expected/received drift diagnostics.
- Added ten sanitized hand-authored transcripts with read-before-write sequences and three real Core denials. Exact tool outcomes, error flags, pending proposal payloads and staging-only sync operations are asserted; every invocation compares all domain slices with a deep copy of the initial state.
- First fixture run exposed an invalid scene-card seed (lighting is set by scene-card.update, with `moonlit`); corrected the seed and reviewed the generated inline payload baseline.
- `pnpm test:app`: exit 0, 127 files / 1,330 tests, 32.07 seconds for the entire app suite. This included the ten-prompt corpus and its original three tests. After adding the provider's missing-result/unoffered-tool regression, the focused eval passed all four tests in 2.85 seconds (86 ms test execution).
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0. Targeted ESLint: exit 0.
- Deliberately changed an expected encounter title to `INTENTIONAL DRIFT PROBE`: the eval failed and printed the exact minus/plus title diff. Restored the original fixture in a finally block and reran successfully. Evidence: /tmp/rc-ai-5.1-drift.log.
- Default `pnpm ai:smoke` skipped because no daemon was listening. Found an installed model and started a temporary localhost-only Ollama server on port 11439 for strict live validation; pending result in /tmp/rc-ai-5.1-live.log. The process wrapper stops this temporary server on exit.
- Full app output: /tmp/rc-ai-5.1-app.log; typecheck output: /tmp/rc-ai-5.1-types.log. Independent operator gates/review and integration remain outside this implement task.
- `pnpm test:tooling tests/unit/ai-eval.test.ts`: exit 0, four tests, 2.74 seconds; the assigned root test also works under the existing tooling config.
- Final targeted ESLint, Prettier checks and `git diff --check`: passed.
- First live attempt failed with the runner's default 4,096-token context. Original Ollama log explicitly reported `truncating input prompt` (4,573 tokens cut to 2,050). Removed an unnecessary added completion-status gate to preserve the original smoke's proposal-based success contract; retained the unapproved-domain and pending-proposal checks.
- Reran the final smoke with a temporary `OLLAMA_CONTEXT_LENGTH=16384` server: `OLLAMA_BASE_URL=http://127.0.0.1:11439 OLLAMA_REQUIRE_LIVE=1 pnpm ai:smoke` exited 0, **6/6 scenarios passed**, every expected proposal schema-valid, with the final no-approval assertions active. Exact output: /tmp/rc-ai-5.1-live-context.log. Runner context evidence: /tmp/rc-ai-5.1-ollama-context.log. Temporary server stopped on command exit. Documented the tested context setting.
