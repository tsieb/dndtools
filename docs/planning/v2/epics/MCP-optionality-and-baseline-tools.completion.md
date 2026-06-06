# Completion Evidence: MCP-optionality-and-baseline-tools

Workpack status: `complete`

Epic: MCP-optionality-and-baseline-tools — "MCP: Optionality and baseline tools"
Requirements: MCP-001, MCP-002
Branch: `epic/MCP-optionality-and-baseline-tools` (chained off the prior tip `5bd09e8`)

## Summary

This epic completes the optionality + baseline-tools capability branch for MCP by COMPOSING onto the MCP
layer the prior epics already built (`apps/v2/packages/core/src/mcp/` — `tool-registry.ts`,
`tool-dispatch.ts` / `invokeMcpTool`, `agent-dispatch.ts` / `invokeMcpToolAsAgent`, `identity.ts`,
`policy.ts`, `fs-allowlist.ts`; the `apps/v2/packages/core/src/commands/mcp-policy.ts` + `apps/v2/packages/core/src/state/mcp-policy.ts` slice). Nothing was
duplicated — the new behavior is a master-switch GATE in front of the existing pipeline and two new tool
DEFINITIONS that bind to existing actor-filtered reads.

- **MCP-001 (Optionality — default-off master switch):** added a vault-wide `enabled` boolean to the durable
  MCP slice. It is **off by default** and **fail-closed on hydration** (only a persisted literal `true`
  enables it). A new DM-only command `mcp.set-enabled` is the ONLY way to flip it (explicit DM action). The
  agent-facing entry point `invokeMcpToolAsAgent` checks the master switch as **gate 0a — BEFORE the tool is
  resolved, before identity, before policy, before any core query/command**. While MCP is off, EVERY agent
  call (read, write, unknown tool, even a fully-bound + allowlisted DM agent) returns a generic
  `mcp-disabled` denial with the state returned UNCHANGED — there is no side-channel. Disabling cleanly
  removes agent capability while leaving bindings/policies intact (re-enabling restores them). Core app
  functionality (notes, sessions, content reads, etc.) is wholly unaffected because the master switch only
  gates the MCP agent pipeline, never the core commands/queries.

- **MCP-002 (Baseline read tools):** the registry already shipped vault summary, note read/list/search,
  graph context, and character query. This branch adds the two read tools the requirement statement still
  named — **`dice.roll`** (composes the pure, deterministic `rollExpression` dice engine; the agent supplies
  the seed so the roll is reproducible; a malformed expression returns a structured engine error fail-closed)
  and **`session.prep`** (composes the DM-facing `getPrepRecapDigest` bundle; a non-DM agent receives an
  EMPTY, visibility-filtered digest — no hidden source content leaks). Both are read tools that mutate no
  durable state, are permission-gated through the existing allowlist/policy pipeline, and have dedicated
  per-tool coverage rows so the MCP-005 registry↔manifest gate stays green.

All optionality / tool-binding logic lives in the Processing Core, fail-closed and default-off. The GUI was
not touched beyond wiring the new durable field into the runtime initial-state block (no new
route/layout/Svelte component; the MCP nav section remains `planned`/unbuilt, so MCP surfaces are already
absent from released navigation). Per ADR-014 the MCP transport is deferred; this composes only
Processing-Core surfaces and performs no I/O. No v1 runtime imports.

## Demo Path (programmatic)

The capability is exercised entirely through the Processing Core (the MCP transport/GUI is deferred per
ADR-014). A reviewer can see the behavior via the dedicated tests, or in a REPL/test against `@dndtools/v2-core`:

1. `buildInitialState(DM_ACTOR, PLAYER_ACTOR)` → `state.mcp.enabled === false` (MCP off by default).
2. Bind + allowlist a DM agent (`mcp.set-agent-binding` + `mcp.set-agent-policy` as `trusted_direct`), then
   `invokeMcpToolAsAgent({ toolId: 'note.list' })` → `{ status: 'agent-denied', reason: 'mcp-disabled' }`,
   `nextState === state` (no side-channel; the most-permissive agent still can do nothing while MCP is off).
3. Meanwhile `dispatchCommand({ type: 'content.create-item' })` and `session.set-workflow` succeed — core
   workflows continue with MCP disabled (MCP-001 AC1).
4. `dispatchCommand({ type: 'mcp.set-enabled', payload: { enabled: true } })` (DM-only) → the same agent's
   `note.list` now returns `read-ok`; `dice.roll` returns the recorded deterministic roll; `session.prep`
   returns the DM structured digest (and an EMPTY digest for a player-scoped agent).
5. `mcp.set-enabled { enabled: false }` removes access again with bindings/policies preserved (round-trip).

Requirement IDs exercised by the demo: MCP-001, MCP-002.

## Requirement Coverage / Traceability

### MCP-001 — The DM can disable MCP completely without losing core app functionality
- **AC1 (core workflows continue with MCP disabled, no MCP processes):**
  - Code: `apps/v2/packages/core/src/state/mcp-policy.ts` (`enabled` field, default off, `isMcpEnabled`); the master gate only sits in
    front of the MCP agent pipeline (`apps/v2/packages/core/src/mcp/agent-dispatch.ts`), never the core command/query path.
  - Tests: `apps/v2/packages/core/tests/mcp-optionality.test.ts` › "core app functionality continues with MCP disabled" (DM edits
    notes; DM runs a session workflow transition — both succeed while `mcp.enabled === false`).
- **AC2 (an MCP-only command while disabled returns disabled status without affecting core state):**
  - Code: `apps/v2/packages/core/src/mcp/agent-dispatch.ts` gate 0a (`if (!state.mcp.enabled) return agentDenied(..., 'mcp-disabled')`)
    — fires before identity/policy/queries, even for an unknown tool / unmapped agent (no leak); returns the
    unchanged state.
  - Tests: `apps/v2/packages/core/tests/mcp-optionality.test.ts` › "an MCP-only call while disabled returns disabled status…",
    "core state is byte-identical before and after a disabled agent call", "no agent tool resolves while MCP
    is disabled, even a fully-bound + allowlisted DM agent".
- **Optionality plumbing (default-off, explicit enable, round-trip, DM-only, hydration):**
  - Code: `apps/v2/packages/core/src/schemas/commands.ts` (`setMcpEnabledInputSchema`), `apps/v2/packages/core/src/commands/mcp-policy.ts`
    (`handleSetMcpEnabled` — DM-only, durable op, `mcp.enabled-changed` event), `apps/v2/packages/core/src/commands/dispatch.ts` +
    `apps/v2/packages/core/src/commands/types.ts` (`mcp.set-enabled` command + event), `apps/v2/packages/core/src/state/mcp-policy.ts` (`ensureMcpPolicyState`
    fail-closed to off), `EMPTY_MCP_POLICY_STATE.enabled = false`.
  - Tests: `apps/v2/packages/core/tests/mcp-optionality.test.ts` (default-off, enable/disable round-trip, DM-only fail-closed,
    invalid payload, hydration default-off + corrupt flag → off + `enabled:true` round-trip).

### MCP-002 — Baseline read tools (vault summary, note read/list/search, graph context, character query, dice roll, session prep bundles)
- **AC1 (an enabled DM agent gets structured context from core indexes):**
  - Code: `apps/v2/packages/core/src/mcp/tool-registry.ts` (`dice.roll`, `session.prep` definitions + input schemas),
    `apps/v2/packages/core/src/mcp/tool-dispatch.ts` (`runReadTool` routes `dice.roll` → `rollExpression`, `session.prep-digest` →
    `getPrepRecapDigest`). The pre-existing `vault.summary`/`note.*`/`graph.context`/`character.query` reads
    are unchanged.
  - Tests: `apps/v2/packages/core/tests/mcp-baseline-tools.test.ts` (dice determinism + DM prep bundle returns structured context);
    `apps/v2/packages/core/tests/mcp-core-enforcement.test.ts` (the pre-existing structured-context + visibility reads).
- **AC2 (a player-scoped context is visibility-filtered before output):**
  - Code: each read tool composes an ALREADY actor-filtered query; `session.prep` inherits the DM-only
    fail-closed gate (`getPrepRecapDigest` returns an empty digest for a non-DM).
  - Tests: `apps/v2/packages/core/tests/mcp-baseline-tools.test.ts` › "a player agent receives an EMPTY, visibility-filtered prep
    bundle — no hidden content leaks (AC2)"; the pre-existing `mcp-core-enforcement.test.ts` visibility cases.
- **AC3 (with MCP tools disabled by policy, core stays usable through non-MCP UI/commands):**
  - Tests: `apps/v2/packages/core/tests/mcp-optionality.test.ts` (core content read/write + session workflow with MCP off);
    `apps/v2/packages/core/tests/mcp-policy-modes.test.ts` (allowlist/disabled-policy denials never block the core path).
- **AC4 (with MCP disabled, MCP sections/agent commands/tool-only actions are absent or disabled with a
  non-leaking disabled status):**
  - Code: the MCP navigation section is `releaseStatus: 'planned'` + DM-only in `apps/v2/packages/core/src/queries/navigation-sections.ts`
    (already absent from released navigation); `isMcpEnabled` is the non-leaking predicate a future GUI reads;
    every agent tool-only action returns the generic `mcp-disabled` status while off.
  - Tests: `apps/v2/packages/core/tests/mcp-optionality.test.ts` (`mcp-disabled` is generic — an unknown tool / unmapped agent both
    read `mcp-disabled`, leaking nothing about whether a tool/agent exists).
- **MCP-005 coverage gate (a baseline read tool without dedicated tests fails CI):**
  - Tests: `apps/v2/packages/core/tests/mcp-tool-coverage.test.ts` — added `dice.roll` + `session.prep` rows
    (invalid + valid input, behavior dimensions); the meta-test cross-checks the manifest against the live
    registry.

## Quality Gates (all run; all green)

- `pnpm --filter @dndtools/v2-core test` → **151 files, 2184 tests passed** (was 149/2156; +2 files,
  +28 tests from the new optionality + baseline-tools suites; 23 pre-existing agent-dispatch assertions
  updated to enable MCP first since MCP is now default-off).
- `pnpm --filter @dndtools/v2-app test` → **12 files, 60 tests passed.**
- `pnpm v2:typecheck` (core `tsc --noEmit` + app `svelte-check`) → **clean** (0 errors / 0 warnings,
  853 files).
- `pnpm v2:lint` (boundary) → **passed.**
- `pnpm lint` (full eslint + nav-lint + token-lint + repo-audit, CI gate) → **passed** (132 Svelte files;
  repo guardrails 2 files / 5 tests pass).
- `pnpm docs:validate` (CI gate, runs the workpack validator) → **passed.**
- `pnpm v2:workpack:validate` → **passed.**
- `pnpm e2e` (full Playwright suite, BOTH projects desktop-chromium + mobile-chromium) → **521 passed,
  21 skipped** — matches the documented green baseline exactly; no flakes (the runtime initial-state block
  was touched to wire the new durable `enabled` field, so a reload/load flow was exercised across the whole
  suite). No GUI overflow risk — no new GUI was added.

## Changed Files (full repo-relative paths)

Core (Processing Core):
- `apps/v2/packages/core/src/state/mcp-policy.ts` — added the `enabled` master switch + `isMcpEnabled`;
  fail-closed hydration to off; updated `EMPTY_MCP_POLICY_STATE`.
- `apps/v2/packages/core/src/mcp/agent-dispatch.ts` — gate 0a master-switch denial (`mcp-disabled`).
- `apps/v2/packages/core/src/mcp/tool-registry.ts` — `dice.roll` + `session.prep` tool definitions + input
  schemas; extended `MCP_BASELINE_TOOL_IDS`.
- `apps/v2/packages/core/src/mcp/tool-dispatch.ts` — `runReadTool` routes the two new read tools.
- `apps/v2/packages/core/src/commands/mcp-policy.ts` — `handleSetMcpEnabled` (DM-only command handler).
- `apps/v2/packages/core/src/commands/dispatch.ts` — `mcp.set-enabled` routing + import.
- `apps/v2/packages/core/src/commands/types.ts` — `mcp.set-enabled` command + `mcp.enabled-changed` event.
- `apps/v2/packages/core/src/schemas/commands.ts` — `setMcpEnabledInputSchema`.
- `apps/v2/packages/core/src/index.ts` — exports `isMcpEnabled`, `mcpDiceRollInputSchema`,
  `mcpSessionPrepInputSchema`.
- `apps/v2/packages/core/src/testing/fixtures.ts` — `enabled` in the fixture slice; `withMcpEnabled` helper.

App (runtime initial-state wiring only):
- `apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts` — `enabled` in the MCP initial-state block.

Tests:
- `apps/v2/packages/core/tests/mcp-optionality.test.ts` — NEW (MCP-001).
- `apps/v2/packages/core/tests/mcp-baseline-tools.test.ts` — NEW (MCP-002 dice.roll + session.prep).
- `apps/v2/packages/core/tests/mcp-tool-coverage.test.ts` — coverage rows for the two new tools (MCP-005).
- `apps/v2/packages/core/tests/mcp-policy-modes.test.ts` — seed now enables MCP first (default-off).
- `apps/v2/packages/core/tests/mcp-identity-mapping.test.ts` — seed now enables MCP first.
- `apps/v2/packages/core/tests/mcp-staged-writes.test.ts` — initial states wrapped with `withMcpEnabled`.

Generated planning files (via `pnpm v2:workpack:set-status` / `:complete`, never hand-edited):
- `docs/planning/v2/epics/MCP-optionality-and-baseline-tools.yaml`
- `docs/planning/v2/status.yaml`
- `docs/planning/v2/workpack-state.yaml`

Completion evidence:
- `docs/planning/v2/epics/MCP-optionality-and-baseline-tools.completion.md` (this file).

## Adversarial / optionality + per-tool permission tests added (and what each proves)

- **Default-off:** a brand-new vault has `mcp.enabled === false` — no tool resolves until the DM enables it.
- **No side-channel while disabled:** even a fully-bound, allowlisted, `trusted_direct` DM agent is denied
  `mcp-disabled` with state returned unchanged (no audit entry, no proposal, no op) — proving no policy or
  allowlist can re-open access while the master switch is off.
- **Master gate beats identity/tool resolution:** an unknown tool and an unmapped agent both read
  `mcp-disabled` (not `unknown-tool`/`no-binding`), so a disabled vault leaks nothing about which
  tools/agents exist.
- **Core unaffected:** content create/read and session workflow transitions succeed with MCP off.
- **Enable/disable round-trip:** enabling grants access; disabling removes it again with bindings/policies
  intact; re-enabling restores access with no reconfiguration.
- **DM-only enablement:** a player and an observer are rejected (`actor-not-authorized`); a non-boolean
  payload is rejected (`invalid-payload`).
- **Hydration fail-closed:** an older vault (no flag), a corrupt non-boolean flag → MCP off;
  `enabled:true` round-trips.
- **dice.roll:** determinism (same expression+seed ⇒ identical recorded roll matching the pure engine),
  reproducibility, structured engine error on a malformed expression, missing-seed schema denial,
  player/DM parity (dice carry no vault visibility), and allowlist gating through the agent pipeline.
- **session.prep:** DM structured bundle from core indexes (AC1); EMPTY visibility-filtered bundle for a
  player (AC2, no leak); unknown digest mode schema denial; recap mode accepted; not-allowlisted denial
  through the agent pipeline (no implicit access).

## Known Gaps / Deferred

- The MCP SIDECAR transport + the MCP/agent-tools GUI (settings toggle, agent console, staged-review queue)
  remain deferred per ADR-014. This branch delivers the pure Processing-Core optionality + baseline-tool
  POLICY/BINDING the future sidecar/GUI plug into; `isMcpEnabled` is the non-leaking predicate the GUI will
  read to absent/disable MCP surfaces. The MCP navigation section is intentionally `planned`/unbuilt, so no
  MCP UI is exposed yet (consistent with MCP-002 AC4's "absent" posture by default).
- `session.prep` exposes `prep`/`recap` modes; the richer semantic bundle tools (MCP-006/MCP-013 — recap,
  continuity, open threads, coverage gaps, campaign health, calendar-aware bundles) are scoped to the
  "Semantic bundles and AI boundaries" capability branch, not this one.

## Git

- Branch: `epic/MCP-optionality-and-baseline-tools` (from prior tip `5bd09e8`).
- Implementation commit SHA: `4d86717` (`feat(v2): complete MCP-optionality-and-baseline-tools epic`).
- Workpack-complete commit SHA: `e942497` (`docs(v2): mark MCP-optionality-and-baseline-tools complete`).
- This SHA-record commit follows as `docs(v2): record commit SHA …`.

### Final `git status --short`

```
(clean — empty working tree after the completion commits)
```
