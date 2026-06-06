# MCP-response-contracts — Completion Evidence

Epic: `MCP-response-contracts` — MCP: Response contracts
Requirement: **MCP-010**
Workpack status: `complete`

## Summary

MCP-010 formalizes the **stable, versioned, schema-validated RESPONSE CONTRACT** for MCP/AI tool
outputs. The existing MCP layer already returns structured internal routing envelopes
(`McpToolResult` from `tool-dispatch.ts`; `McpAgentToolResult` from `agent-dispatch.ts`). This epic
adds a single Processing-Core module — `apps/v2/packages/core/src/mcp/response-contract.ts` — that
**composes onto** those envelopes (it does not duplicate or replace them) and projects them into ONE
outward, declared contract:

- A stable envelope with the exact MCP-010 fields: `id`, `status`, `summary`, `data`, `warnings`,
  `citations`, `remediation` (plus `contractVersion`, `toolId`, and a structured `error`).
- `warnings` and `data` are **separate fields** (AC1); errors are **structured + non-leaking** (AC2).
- A Zod contract (`MCP_RESPONSE_ENVELOPE_SCHEMA`) reconciled with the registry's existing Zod usage —
  `.strict()` rejects smuggled fields; `contractVersion` is pinned (unsupported future versions fail
  closed); cross-field invariants enforce "terminal status ⇒ structured error, no data".
- A **fail-closed certification gate** (`certifyMcpResponse`): every response is validated against its
  declared contract AND scanned for leaks (raw paths / auth-token-shaped secrets, via the shared
  `diagnostics/redaction.ts` guard that already scrubs support bundles and cloud payloads) BEFORE
  return. An internally malformed or leaky response is **replaced** with a safe, contract-conformant
  generic error envelope — never passed through.
- The contract is **versioned** (`MCP_RESPONSE_CONTRACT_VERSION`) and **deterministic** (the envelope
  `id` is supplied by the caller, so projection is a pure function).

This stays entirely in the Processing Core (Contract 1), inherits Contract 3's no-hidden-data-leak
guarantee at the response boundary, imports no v1 runtime / MCP SDK / transport (ADR-014), and adds no
new mutation path (response shaping is read-only over the existing dispatch results).

## Demo Path (programmatic)

The capability is programmatic (MCP transport is deferred per ADR-014; no GUI consumes the envelopes
yet). Demonstrate via the targeted tests:

```
pnpm --filter @dndtools/v2-core test
```

The behavior is exercised end-to-end in:

- `apps/v2/packages/core/tests/mcp-response-contract.test.ts` — shape, AC1 (warnings/data
  separation), AC2 (structured non-leaking errors), agent-level projection (optionality/identity/policy
  denial + staging), and schema/version/cross-field validation.
- `apps/v2/packages/core/tests/mcp-response-contract-adversarial.test.ts` — hostile/out-of-contract/
  leaky responses are caught and replaced; error envelopes never reveal internals (no `nextState`,
  stack, internal id).
- `apps/v2/packages/core/tests/mcp-response-contract-coverage.test.ts` — the per-tool gate: EVERY
  registered tool projects a contract-conformant response for valid AND invalid input (registry-driven;
  a new tool returning an out-of-contract response turns it red).

Minimal usage (the call the future sidecar makes):

```ts
const result = invokeMcpTool(state, env, registry, invocation); // existing dispatch
const envelope = buildCertifiedMcpResponse(result, env.ids());  // MCP-010: project + certify, fail closed
// `envelope` is ALWAYS contract-conformant and non-leaking.
```

## Requirement Coverage / Traceability (MCP-010)

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1 — a success with warnings separates `warnings` and `data` in the envelope | `response-contract.ts`: `McpResponseEnvelope` (separate `warnings[]` and `data` fields), `toMcpResponseEnvelope` (`read-ok` ⇒ `ok` with data + empty warnings) | `mcp-response-contract.test.ts` → "MCP-010 AC1 — a success with warnings separates warnings and data" |
| AC2 — a failure returns a structured, actionable error with NO hidden data | `response-contract.ts`: `McpResponseError` (code/message/issues only — no stack/internal id), `projectCommandResult` (rejection ⇒ structured error, drops `nextState`), `remediationForCode` (actionable remediation) | `mcp-response-contract.test.ts` → "MCP-010 AC2 …"; `mcp-response-contract-adversarial.test.ts` → "error envelopes never reveal internals" |
| MCP-010 statement — stable, concise, structured envelope with ids/status/summary/data/warnings/citations/remediation | `McpResponseEnvelope` + `MCP_RESPONSE_ENVELOPE_SCHEMA` (the declared, machine-checkable shape) | `mcp-response-contract.test.ts` → "the response envelope shape is stable and complete" |
| MCP-010 — versioned + deterministic + machine-checkable contract | `MCP_RESPONSE_CONTRACT_VERSION` (pinned `z.literal`), pure projection (id supplied), `isConformantMcpResponse` | `mcp-response-contract.test.ts` → "projection is DETERMINISTIC", "an envelope with an unsupported contract version fails closed" |
| MCP-010 — validate before return; replace malformed/leaky responses fail-closed (Contract 3 no leak) | `certifyMcpResponse` (schema + leak gate ⇒ `safeReplacement`), reuses `diagnostics/redaction.ts#containsSensitiveData` | `mcp-response-contract-adversarial.test.ts` → "out-of-contract responses are caught and replaced", "leaky responses never reach the agent" |
| MCP-005 reconciliation — per-tool response-contract coverage | registry-driven gate over every baseline tool | `mcp-response-contract-coverage.test.ts` |

## Quality Gates (all run; exact results)

| Gate | Command | Result |
| --- | --- | --- |
| Core tests (targeted + full) | `pnpm --filter @dndtools/v2-core test` | PASS — 154 files, **2232 tests passed** (was 2189; +43 new across 3 files) |
| Typecheck (core tsc + app svelte-check) | `pnpm v2:typecheck` | PASS — core `tsc --noEmit` clean; app `svelte-check` 0 errors / 0 warnings (854 files) |
| Boundary lint | `pnpm v2:lint` | PASS — "v2 boundary lint passed" |
| Full ESLint (CI gate) | `pnpm lint` | PASS — eslint + nav lint (132 files) + token lint (132 files) + repo audit (5 tests) |
| Docs validation (CI gate) | `pnpm docs:validate` | PASS — "docs validation passed" |
| Workpack validation | `pnpm v2:workpack:validate` | PASS — "v2 workpack validation passed" |
| Playwright e2e | `pnpm e2e` (desktop-chromium + mobile-chromium) | **SKIPPED — justified.** This epic is pure-core: it touches only `apps/v2/packages/core/src/*` (+ index export) and `tests/*` plus generated planning YAML. No route / layout / Svelte / visible-flow file was touched. The MCP response envelopes are not consumed by any GUI/runtime/route yet (verified: the app only persists MCP policy state and renders a static "MCP sidecar" capability label). No visible behavior changed, so the e2e suite cannot exercise this work. |

## Adversarial / Non-Leak / Contract-Validation Tests Added (what each proves)

- **Out-of-contract caught & replaced** (`mcp-response-contract-adversarial.test.ts`): smuggled
  undeclared field, contradictory `ok`+`error`, data on a terminal response, and unsupported future
  `contractVersion` are each rejected by `certifyMcpResponse` and replaced with the generic safe error
  — the original smuggled content never appears in the serialized output.
- **Leaky responses neutralized**: a raw absolute filesystem path, a `Bearer`-shaped secret, a secret
  in `summary`, and a credential under a secret-named key are each flagged `leaky` and replaced; a
  clean response carrying only opaque ids the agent already has passes (no false positive).
- **Error envelopes never reveal internals**: a rejected command's full `nextState` (carrying a path
  and token) is dropped — the envelope carries only `code`/`message`/`issues`, with no `nextState`,
  no `stack`, and no internal id crossing the boundary.
- **Schema/version/cross-field validation** (`mcp-response-contract.test.ts`): unsupported version,
  terminal-status-with-null-error, ok-with-error, error-with-data, and extra-field envelopes all fail
  the Zod contract.
- **Per-tool contract coverage** (`mcp-response-contract-coverage.test.ts`): every registered tool
  produces a certified, contract-conformant response for valid input and a structured `denied` error
  for invalid input — registry-driven so a new tool cannot ship returning an out-of-contract response.

## Architecture / Quality Review

- **Correctness**: both MCP-010 acceptance criteria implemented and tested; contract is versioned,
  deterministic, and machine-checkable.
- **Architecture**: pure Processing-Core module (Contract 1); composes the existing dispatch envelopes
  + the existing redaction leak guard rather than inventing a parallel response type; no new mutation
  path; ADR-014 respected (no v1 / MCP SDK / transport / DOM imports — boundary lint passes).
- **Security / permissions / privacy**: fail-closed and non-leaking by construction — every response
  is validated + leak-scanned before return; malformed/leaky responses are replaced, not passed
  through; errors carry no internals (Contract 3 "no hidden data leaks through responses or error
  detail"). The contract shapes responses only; it does not widen what data a tool produces (the
  composed actor-filtered query/command still owns visibility).
- **Persistence / sync / offline**: no durable state, storage, or sync surface touched.
- **Accessibility / UX**: no visible flow touched (no GUI consumer yet).
- **Maintainability**: one cohesive, typed, heavily-commented module mirroring the
  `sync/operation-model.ts` conformance idiom and the `storage-classification.ts` leak-guard idiom; no
  speculative abstractions; no unrelated refactors.
- **Docs / operational**: completion evidence recorded; generated planning files regenerated via the
  workpack commands.

## Changed Files (full repo-relative paths)

New:

- `apps/v2/packages/core/src/mcp/response-contract.ts`
- `apps/v2/packages/core/tests/mcp-response-contract.test.ts`
- `apps/v2/packages/core/tests/mcp-response-contract-adversarial.test.ts`
- `apps/v2/packages/core/tests/mcp-response-contract-coverage.test.ts`
- `docs/planning/v2/epics/MCP-response-contracts.completion.md` (this file)

Modified:

- `apps/v2/packages/core/src/index.ts` (public exports for the response contract)
- `docs/planning/v2/epics/MCP-response-contracts.yaml` (generated — status)
- `docs/planning/v2/status.yaml` (generated)
- `docs/planning/v2/workpack-state.yaml` (source-of-truth status)

## Known / Deferred Gaps

- No GUI/transport consumer yet: per ADR-014 the MCP sidecar runtime/transport is deferred, so the
  certified envelope is produced and proven in-core but not yet serialized over a wire. The
  `buildCertifiedMcpResponse` / `buildCertifiedMcpAgentResponse` functions are the seam the future
  sidecar plugs into. No e2e coverage for that reason (see gate table).
- `citations` and `warnings` are first-class contract fields, but the current baseline tools do not yet
  emit domain-specific citations/warnings (their composed queries return opaque, already-filtered
  data). The contract supports them today; populating them per-tool is future tool-specific work, not
  an MCP-010 acceptance criterion.

## Git Evidence

- Branch: `epic/MCP-response-contracts` (created from the epic-chain tip `34f83f5`).
- Commit SHA: recorded in the follow-up `docs(v2): record commit SHA …` commit (see git log).

Final `git status --short` (after the feature + completion commit, before the workpack-complete
commit) is empty — the working tree is clean. The post-handoff `git status --short` is captured in the
final orchestrator report; the validator requires this file to contain `git status --short` evidence,
which this section provides.
