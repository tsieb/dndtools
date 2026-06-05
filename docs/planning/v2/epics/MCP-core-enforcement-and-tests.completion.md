# MCP-core-enforcement-and-tests — Completion Evidence

Workpack status: `complete`

Epic: **MCP-core-enforcement-and-tests** — MCP: Core enforcement and tests
Requirements: **MCP-004**, **MCP-005**, **MCP-012** (all Must-have)
Branch: `epic/MCP-core-enforcement-and-tests` (chained off the prior tip `2cb4459`)

## Summary

This epic delivers the **MCP tool POLICY-ENFORCEMENT layer** in the Processing Core. It is
SECURITY-SENSITIVE and built entirely by **composing** the existing permission/command/query
infrastructure — there is no duplicated policy and no privileged side-channel. Per ADR-014 the MCP
sidecar runtime/transport is deferred, so this is the pure, deterministic Processing-Core policy +
binding layer the future sidecar plugs into (it imports no MCP SDK, no transport, no filesystem).

An MCP agent acts through a **scoped vault actor** and is filtered + permission-gated **exactly like
a human actor**:

- **Reads** compose the EXISTING actor-filtered queries (`getContentItemsForActor`,
  `getContentItemDetailForActor`, `listCharactersForActor`, `searchVaultForActor`,
  `getGraphRelationships`), so visibility/redaction are enforced by the data layer BEFORE the agent
  sees anything (Contract 1 / Contract 3 / Cross-Contract Non-Negotiable 2).
- **Writes** dispatch the EXISTING authorized command through `dispatchCommand`, so they inherit
  validation, authority/permission checks, op-logging, and visibility — never a bypass.

The enforcement layer FAILS CLOSED in order: unknown tool → deny; unknown/under-scoped/forged actor →
deny (before any query/command runs); schema-invalid input → deny; then route. No tool can invoke a
command the registry did not bind, fabricate a capability, or widen an actor's scope.

New core modules (all pure, deterministic, no I/O):

- `apps/v2/packages/core/src/mcp/tool-registry.ts` — the typed, fail-closed **tool allowlist**. Each
  tool is a DECLARED binding onto an existing query (read) or command (write) + a Zod input schema.
  The registry confers NO authority; it only declares WHICH query/command a tool maps to.
- `apps/v2/packages/core/src/mcp/tool-dispatch.ts` — `invokeMcpTool(...)`, the SINGLE fail-closed
  entry point. Enforces the gate order, routes reads to actor-filtered queries and writes to
  `dispatchCommand`, and returns a structured (MCP-010-shaped) result envelope that leaks no hidden
  data.
- `apps/v2/packages/core/src/mcp/fs-allowlist.ts` — the **explicit MCP filesystem / platform-service
  exception allowlist** + the pure `gateMcpFsOperation(...)` validator (containment math, size limit,
  schema, audit), mirroring the PLAT-007 platform-service boundary.

Lint (MCP-012):

- `scripts/v2-boundary-lint.ts` gains an MCP-module rule: any `src/mcp/**` module that imports a
  filesystem API (`fs`/`node:`/`path`/`os`) or calls a filesystem primitive / Node process global
  directly fails the gate. Filesystem access is permitted only through the declared, gated allowlist.

## Demo path (programmatic — pure-core enforcement; no visible route)

This branch is the agent tool / policy layer (no GUI surface; MCP sidecar deferred per ADR-014). The
behavior is demonstrated programmatically:

1. Build a vault with a `dm-only` NPC (with a `data.secretWeakness` dm-only field), a
   `player-visible` character (with a `data.dmSecret` dm-only field), a `dm-only` note, and a
   `player-visible` note (see `apps/v2/packages/core/tests/mcp-core-enforcement.test.ts` `seedVault`).
2. `invokeMcpTool(state, env, createBaselineMcpToolRegistry(), { toolId: 'character.query', actorId:
   <player>, agentId, input: {} })` → the hidden NPC is **omitted entirely**, and the visible
   character's `dmSecret` field is **stripped** — by the data layer, identical to the player's own
   query (MCP-004 AC1).
3. `invokeMcpTool(..., { toolId: 'note.create', actorId: <dm>, input: { title: '' } })` → `denied`
   with `reason: 'invalid-input'`; **no op appended, state unchanged** (MCP-004 AC2).
4. `invokeMcpTool(..., { toolId: 'note.create', actorId: <player>, input: { title: 'x' } })` → reaches
   dispatch and is **rejected** `actor-not-authorized` exactly as a human player would be (privilege
   escalation blocked). A forged actor id → `denied` `unknown-actor` before any query/command runs.
5. `gateMcpFsOperation(createBaselineMcpFsExceptionRegistry(), { operationId: 'vault-export.read',
   relativePath: '../../etc/passwd' })` → `denied` `path-escapes-root`; an oversized
   `staged-preview.write` → `payload-too-large`; an unknown operation → `unknown-operation`
   (MCP-012 AC2).

## Requirement coverage / traceability

### MCP-004 — read/write tools use Processing Core queries and commands

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1 — an MCP tool reads character data as a non-DM ⇒ hidden fields omitted by the data layer | `apps/v2/packages/core/src/mcp/tool-dispatch.ts` `runReadTool` composes `listCharactersForActor` / `getContentItemDetailForActor` / `getContentItemsForActor` / `searchVaultForActor` / `getGraphRelationships`, passing the agent's `actorId` straight through | `apps/v2/packages/core/tests/mcp-core-enforcement.test.ts` "MCP-004 AC1" (hidden NPC omitted; dm-only field stripped; DM sees it; tool == underlying query; dm-only note non-visible detail; vault.summary/note.list omit dm-only note) |
| AC2 — an MCP write fails schema validation ⇒ no staged or direct durable mutation accepted | `apps/v2/packages/core/src/mcp/tool-dispatch.ts` gate 3 (`parseToolInput`) denies before `dispatchCommand` is reached; `apps/v2/packages/core/src/mcp/tool-registry.ts` per-tool Zod `inputSchema` | `apps/v2/packages/core/tests/mcp-core-enforcement.test.ts` "MCP-004 AC2" (invalid input denied, no op appended, state unchanged; valid write appends a durable op and defaults visibility dm-only) |
| (security) privilege escalation blocked through the same dispatch | write tool → `dispatchCommand` (inherits authority/observer gate) | "privilege escalation is blocked" (player and observer writes rejected `actor-not-authorized`) |
| (security) forged/under-scoped actor + unknown tool fail closed | gate 1 (unknown tool), gate 2 (unknown actor) | "forged / under-scoped actor and unknown tool fail closed" |

### MCP-005 — every write-capable + baseline read/report tool has dedicated behavior tests

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1 — a new tool added without dedicated tests ⇒ merge gate fails | `apps/v2/packages/core/tests/mcp-tool-coverage.test.ts` COVERAGE MANIFEST cross-checked against the live `createBaselineMcpToolRegistry()` ids: a registered tool with no manifest row FAILS; a stale row FAILS; write tools must cover idempotency/staged-preview/direct-mode; reads must cover visibility/actor-policy | `apps/v2/packages/core/tests/mcp-tool-coverage.test.ts` "MCP-005 AC1" describe block |
| AC2 — a tool receives invalid input ⇒ expected structured error asserted | every manifest row exercises an invalid input and asserts the `invalid-input` denial envelope with per-field `issues` | `apps/v2/packages/core/tests/mcp-tool-coverage.test.ts` "MCP-005 AC2" (one case per tool) + the valid-input end-to-end pass per tool |

The 7 baseline tools (`vault.summary`, `note.read`, `note.list`, `note.search`, `graph.context`,
`character.query`, `note.create`) each have a coverage row; the meta-test makes adding an untested
tool a red gate.

### MCP-012 — MCP filesystem/platform-service exceptions explicitly allowlisted, linted, regression-tested

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1 — an MCP tool imports filesystem APIs outside the allowlist ⇒ boundary lint gate fails | `scripts/v2-boundary-lint.ts` `scanMcpFilesystem` (MCP-module fs-import + fs-primitive + process-global rules), wired into `collectViolations` | `apps/v2/app/tests/unit/boundary-lint.test.ts` "MCP-012" (node:fs import; bare `fs`/`path`; `readFileSync` call; `process.env`; clean pure-policy module passes) |
| AC2 — an allowlisted MCP filesystem operation ⇒ containment, size limits, schema validation, audit asserted | `apps/v2/packages/core/src/mcp/fs-allowlist.ts` `createBaselineMcpFsExceptionRegistry` + `gateMcpFsOperation` + `isPathContained` (pure traversal math) | `apps/v2/packages/core/tests/mcp-fs-allowlist.test.ts` (containment incl. `../`, absolute, drive, UNC, NUL, sibling-prefix; size limit; schema; audited=true; unknown-operation; construction fail-closed; determinism) |

## Adversarial / security tests (what each proves — all denied fail-closed)

- **Privilege escalation** — a player-scoped and an observer-scoped agent invoking `note.create` reach
  the real dispatch and are **rejected `actor-not-authorized`** (the DM-only command + observer
  write-gate), exactly as a human would be. An agent cannot publish to players: `note.create` never
  forwards a visibility, so the command defaults `dm-only`.
- **Hidden-data exfiltration** — a player-scoped agent's `character.query` / `note.read` /
  `vault.summary` / `note.list` / `graph.context` return ONLY the actor-filtered view: a `dm-only`
  NPC/note is **omitted entirely** (not redacted-but-listed), a `dm-only` field is **stripped**, and a
  `dm-only` note's `note.read` is a non-visible detail with empty title/body. The tool result is
  asserted EQUAL to the underlying query — the agent gets no more.
- **Forged ids** — an unregistered (forged/under-scoped) actor id → `denied unknown-actor` before any
  query/command runs, with a generic message (`Hidden` never appears); a forged write actor → denied
  with **no op appended**. An unknown/forged tool id → `denied unknown-tool` before anything runs.
- **Path traversal / filesystem escape** — `../`, `../../etc/passwd`, mid-path `..` escape, absolute,
  Windows drive, UNC, NUL-byte, and shared-prefix sibling paths are all **denied `path-escapes-root`**;
  an oversized payload → `payload-too-large`; an op outside the allowlist → `unknown-operation`;
  construction throws fail-closed on a forbidden id / duplicate / traversing root.
- **Determinism** — identical invocations and identical fs gate requests produce identical results.

## Quality gates (all run; results)

| Gate | Command | Result |
| --- | --- | --- |
| Core unit/integration + adversarial tests | `pnpm --filter @dndtools/v2-core test` | PASS — 144 files, 2103 tests (incl. 67 new MCP tests across 3 files) |
| App unit tests (incl. MCP-012 lint regression) | `pnpm --filter @dndtools/v2-app test` | PASS — 12 files, 60 tests (boundary-lint.test.ts: 20, incl. 5 new MCP-012 cases) |
| Type checks | `pnpm v2:typecheck` (core `tsc --noEmit` + app `svelte-check`) | PASS — 0 errors, 0 warnings |
| Boundary lint | `pnpm v2:lint` | PASS |
| Full ESLint (CI gate) | `pnpm lint` | PASS (eslint + nav-layer + token + repo audit) |
| Docs validate (CI gate) | `pnpm docs:validate` | PASS |
| Workpack validate | `pnpm v2:workpack:validate` | PASS |
| Playwright e2e | `pnpm e2e` (both projects) | SKIPPED — pure-core change; no route/layout/Svelte/visible-flow file touched (see below) |

### e2e justification

The implementation touches only the core MCP modules under `apps/v2/packages/core/src/mcp/` plus the
core `apps/v2/packages/core/src/index.ts` re-export, the `scripts/v2-boundary-lint.ts` lint tool, and
test files. No app route directory (`apps/v2/app/src/routes/`), GUI directory
(`apps/v2/app/src/lib/gui/`), canvas-runtime, platform, or state directory, and no `.svelte` /
visible-flow file was modified. There is no new or changed user-visible route or layout, so the
Playwright suite is not exercised by this epic. The app-side boundary-lint regression is a Vitest unit
test and was run.

## Changed files (full repo-relative paths)

New:
- `apps/v2/packages/core/src/mcp/tool-registry.ts`
- `apps/v2/packages/core/src/mcp/tool-dispatch.ts`
- `apps/v2/packages/core/src/mcp/fs-allowlist.ts`
- `apps/v2/packages/core/tests/mcp-core-enforcement.test.ts`
- `apps/v2/packages/core/tests/mcp-tool-coverage.test.ts`
- `apps/v2/packages/core/tests/mcp-fs-allowlist.test.ts`
- `docs/planning/v2/epics/MCP-core-enforcement-and-tests.completion.md`

Modified:
- `apps/v2/packages/core/src/index.ts` (public MCP exports)
- `scripts/v2-boundary-lint.ts` (MCP-012 MCP-module filesystem lint rule)
- `apps/v2/app/tests/unit/boundary-lint.test.ts` (MCP-012 lint regression cases)
- `docs/planning/v2/epics/MCP-core-enforcement-and-tests.yaml` (generated — status)
- `docs/planning/v2/status.yaml` (generated — status)
- `docs/planning/v2/workpack-state.yaml` (status)

## Known gaps / deferred (out of this epic's scope)

- **MCP-011 (agent identity mapping)** and **MCP-009 (per-agent policy modes:
  disabled/strict_review/balanced/trusted_direct)** are in OTHER MCP capability branches. This branch
  enforces that a tool call carries a RESOLVABLE scoped actor and that writes declare a write-risk
  class so the staged/direct decision composes onto them — it does NOT implement the connection→actor
  mapping or the policy-mode staging decision. The seam is explicit (`McpToolInvocation.actorId` /
  `agentId`, `McpWriteRisk`).
- **MCP-003 (strict_review staging)** is the identity-policy branch; here the representative write tool
  routes through the authorized command, proving staged/direct enforcement composes onto it.
- Per ADR-014 the MCP sidecar runtime/transport and the actual filesystem I/O are deferred. The
  filesystem allowlist is the pure POLICY the future platform layer gates I/O through; this branch
  performs no I/O.

## Git

- Branch: `epic/MCP-core-enforcement-and-tests`
- Base tip: `2cb4459`
- Commit SHA: _recorded in the follow-up `docs(v2): record commit SHA` commit._

## Final `git status --short`

```
<recorded after the completion + workpack-complete commits; clean working tree>
```
