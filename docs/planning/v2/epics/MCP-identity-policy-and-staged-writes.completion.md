# Completion Evidence: MCP-identity-policy-and-staged-writes

Workpack status: `complete`

Epic: MCP-identity-policy-and-staged-writes — "MCP: Identity, policy, and staged writes"
Requirements: MCP-003, MCP-009, MCP-011
Branch: `epic/MCP-identity-policy-and-staged-writes` (chained off the prior tip `740eaaa`)

## Summary

This epic composes the MCP enforcement layer the prior epic built (`apps/v2/packages/core/src/mcp/` —
`tool-registry.ts`, `tool-dispatch.ts` with `invokeMcpTool`, `fs-allowlist.ts`) onto the PERM actor/grant
model and the command dispatch + op-log, filling the three explicit seams it left:

- **MCP-011 (identity):** a fail-closed mapping from an MCP agent CONNECTION to a SCOPED vault actor +
  session role + policy profile + audit identity. An agent can never resolve to more authority than its
  bound actor; an unmapped agent or a binding to an unregistered actor is denied before any core query.
- **MCP-009 (policy):** DM-authored per-agent policy modes (`disabled`, `strict_review`, `balanced`,
  `trusted_direct`) + tool allowlists + audit visibility, plus a vault default posture. Resolution is
  fail-closed (unknown/under-scoped → most restrictive).
- **MCP-003 (staged writes):** an agent's write under `strict_review`/`balanced` is captured as a PENDING
  proposal a human (DM) must approve. Approval re-validates authority + schema and commits through the
  EXISTING authorized `dispatchCommand` (no privileged side-channel). A proposal never auto-commits, never
  escalates, expires/rejects cleanly, and can never be committed twice.

All identity-resolution, policy-mode, and staged-write logic lives in the Processing Core. The GUI was not
touched (no new route/layout/Svelte). Per ADR-014 the MCP transport is deferred; this composes only
Processing-Core surfaces and performs no I/O.

## Demo Path (programmatic)

The behavior is exercised programmatically through the Processing Core (the MCP transport/sidecar is
deferred per ADR-014). A reviewer can run the dedicated suites:

```
pnpm --filter @dndtools/v2-core test -- mcp-identity-mapping mcp-policy-modes mcp-staged-writes \
  mcp-policy-commands mcp-policy-hydration
```

Representative end-to-end flow (see `apps/v2/packages/core/tests/mcp-staged-writes.test.ts`):

1. The DM binds an agent to a scoped actor (`mcp.set-agent-binding`) and sets its policy
   (`mcp.set-agent-policy`, mode `strict_review`, allowlist `['note.create']`).
2. The agent invokes `invokeMcpToolAsAgent(..., { agentId, toolId: 'note.create', input })`. Under
   `strict_review` the write is STAGED — a pending proposal appears, no durable note is written.
3. The DM approves (`mcp.approve-proposal`). The captured `content.create-item` command re-dispatches as the
   bound actor through `dispatchCommand`; the durable note is created, the proposal becomes `approved`, and
   an audit entry records agent id, actor id, policy mode, tool id, and staged mode.
4. Adversarial: if the bound actor's grant is revoked between staging and approval, the re-dispatch rejects
   and the commit is blocked (proposal stays pending). A second approve of an already-approved proposal is
   rejected. Unbinding the agent expires its pending proposals.

## Requirement Traceability

### MCP-003 — staged writes (strict_review default; trusted_direct for direct)

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| `strict_review` → MCP note-create STAGES a change for approval, not an immediate write | `apps/v2/packages/core/src/mcp/policy.ts` `decideWrite` (strict_review ⇒ stage); `apps/v2/packages/core/src/mcp/agent-dispatch.ts` stage path; `state/mcp-policy.ts` `McpStagedProposal` | `mcp-staged-writes.test.ts` "AC1 — strict_review stages…", "approving the proposal commits…" |
| `trusted_direct` write records mode + agent identity in audit | `apps/v2/packages/core/src/mcp/agent-dispatch.ts` `recordDirectAudit`; `commands/mcp-policy.ts` audit on approve | `mcp-policy-modes.test.ts` "AC4 — trusted_direct write … audited" |
| `balanced` batches low-risk staged changes for approve/reject before durable write | `apps/v2/packages/core/src/mcp/policy.ts` `decideWrite` (balanced ⇒ stage, batchable=low-risk) | `mcp-staged-writes.test.ts` "AC3 — balanced … batchable" (durable + low-risk) |
| `strict_review` write to object/widget/map/session/character is staged or rejected by declared tool capability, not written | `apps/v2/packages/core/src/mcp/agent-dispatch.ts` routes ALL write tools through the stage decision (not just note-create); custom `character.hp.adjust` tool proves it generalizes | `mcp-staged-writes.test.ts` "AC4 — staged by declared capability"; revocation tests use a character-resource write tool |

### MCP-009 — per-agent policy modes + allowlist + audit visibility

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| New agent defaults to `strict_review` or `disabled` per vault setting | `state/mcp-policy.ts` `vaultDefaultMode` (default `strict_review`); `apps/v2/packages/core/src/mcp/identity.ts` `resolvePolicyMode`; `commands/mcp-policy.ts` `handleSetMcpVaultDefault` | `mcp-policy-modes.test.ts` "AC1 — never-configured agent defaults…" |
| DM policy change enforced on the agent's next call | policy read live on each `invokeMcpToolAsAgent` (no caching) | `mcp-policy-modes.test.ts` "AC2 — policy change enforced next call" |
| `disabled` returns disabled status BEFORE core queries run | `apps/v2/packages/core/src/mcp/policy.ts` `decidePolicy` (disabled checked first) | `mcp-policy-modes.test.ts` "AC3 — disabled before core queries" |
| `trusted_direct` direct write still runs Core validation + audit | `apps/v2/packages/core/src/mcp/agent-dispatch.ts` direct path delegates to `invokeMcpTool` → `dispatchCommand`, then audits | `mcp-policy-modes.test.ts` "AC4 — trusted_direct … validation + audit" |

### MCP-011 — agent connection → authenticated actor/role/policy/audit identity

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| Agent without a valid actor mapping → tool call rejected before core queries run | `apps/v2/packages/core/src/mcp/identity.ts` `resolveAgentIdentity` (no-binding / unknown-actor); `apps/v2/packages/core/src/mcp/agent-dispatch.ts` gate 1 | `mcp-identity-mapping.test.ts` "AC1 — unmapped agent", "binding to an unregistered actor" |
| DM-scoped agent staging a write records agent id, actor id, policy mode, tool id, staged/direct mode | `state/mcp-policy.ts` `McpAuditEntry`; `apps/v2/packages/core/src/mcp/agent-dispatch.ts` stage path; `commands/mcp-policy.ts` approve audit | `mcp-identity-mapping.test.ts` "AC2 — staged write records full audit identity" |

## Durable State, Persistence, and Migration

A new durable `mcp` slice (`state/mcp-policy.ts`, `MCP_POLICY_STATE_SCHEMA_VERSION = 1`) holds bindings,
policies, proposals, the audit trail, and the vault default. It is wired into:

- `CoreStateSlice` (`commands/types.ts`)
- fixtures `buildInitialState` (`testing/fixtures.ts`) and runtime initial state (`runtime.svelte.ts`)
- persistence load/persist + slice-change guard (`app/.../storage/scene-store.ts`, key `mcp-policy-state`)
- the migration/schema-version registry (`migration/schema-versions.ts`: `DurableStateDocumentId` += `mcp`,
  `DURABLE_STATE_DOCUMENT_IDS`, `TARGET_SCHEMA_VERSIONS`)
- fail-closed hydration `ensureMcpPolicyState`: an absent document → empty `strict_review`-default slice;
  an unknown policy mode → `disabled`; an unknown proposal status → `rejected`; a non-array allowlist →
  empty (deny-all); a non-safe vault default → `strict_review`.

## Adversarial / security tests added

- **Unmapped / forged agent** (`mcp-identity-mapping.test.ts`): an agent with no binding, and a binding to
  an unregistered actor, are both denied before any core query — generic message, no leak.
- **No escalation** (`mcp-identity-mapping.test.ts`, `mcp-staged-writes.test.ts`): a player-bound agent
  resolves to the PLAYER role; a staged write commits as the scoped actor, so a write the player may not
  perform is rejected at approval by the bound command (no authority gained via staging).
- **Approval after revocation** (`mcp-staged-writes.test.ts`): a grant revoked between staging and approval
  blocks the commit (authority re-validated at COMMIT time); the same write commits when the grant remains.
- **Double-commit / replay** (`mcp-staged-writes.test.ts`): a second approve of an approved proposal is
  rejected (`mcp-proposal-not-pending`); no second durable write.
- **Expire on unbind** (`mcp-staged-writes.test.ts`): unbinding the agent expires its pending proposals;
  approving an expired proposal is rejected fail-closed.
- **Disabled / allowlist / DM-only authoring** (`mcp-policy-modes.test.ts`, `mcp-policy-commands.test.ts`):
  `disabled` denies before queries; a non-allowlisted tool is denied even under `trusted_direct`; an
  unknown policy mode is rejected; a player/observer cannot author MCP policy/bindings.
- **Schema-invalid write** (`mcp-policy-modes.test.ts`): a write failing schema validation accepts no
  staged or direct durable mutation.
- **Fail-closed hydration** (`mcp-policy-hydration.test.ts`): corrupt/older-vault records collapse to the
  most restrictive default.

## Quality gates (all run; results)

| Gate | Command | Result |
| --- | --- | --- |
| Core tests | `pnpm --filter @dndtools/v2-core test` | PASS — 149 files, 2152 tests (44 new) |
| App unit tests | `pnpm --filter @dndtools/v2-app test` | PASS — 12 files, 60 tests |
| Typecheck | `pnpm v2:typecheck` | PASS — core `tsc --noEmit` clean; app `svelte-check` 0 errors / 0 warnings (853 files) |
| Boundary lint | `pnpm v2:lint` | PASS — v2 boundary lint passed |
| Full eslint (CI) | `pnpm lint` | PASS — eslint + nav-layer + token-compliance + repo-boundary-audit |
| Docs validate (CI) | `pnpm docs:validate` | PASS |
| Workpack validate | `pnpm v2:workpack:validate` | PASS |
| E2E (both projects) | `pnpm e2e` (from `apps/v2/app`) | PASS — 521 passed / 21 skipped across desktop-chromium + mobile-chromium (known `sync-conflict-lifecycle.spec.ts:71` flake passed cleanly) |

E2E was run because the durable slice wiring touched the persistence adapter (`scene-store.ts`) and the
runtime initial state (`runtime.svelte.ts`); the full reload-flow suite confirms no regression. No new
route/layout/Svelte/GUI surface was added.

## Changed files (full repo-relative paths)

Modified:
- `apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts`
- `apps/v2/app/src/lib/platform/storage/scene-store.ts`
- `apps/v2/packages/core/src/commands/dispatch.ts`
- `apps/v2/packages/core/src/commands/helpers.ts`
- `apps/v2/packages/core/src/commands/types.ts`
- `apps/v2/packages/core/src/index.ts`
- `apps/v2/packages/core/src/migration/schema-versions.ts`
- `apps/v2/packages/core/src/schemas/commands.ts`
- `apps/v2/packages/core/src/testing/fixtures.ts`
- `docs/planning/v2/epics/MCP-identity-policy-and-staged-writes.yaml` (generated)
- `docs/planning/v2/status.yaml` (generated)
- `docs/planning/v2/workpack-state.yaml` (generated)

Added:
- `apps/v2/packages/core/src/state/mcp-policy.ts`
- `apps/v2/packages/core/src/mcp/identity.ts`
- `apps/v2/packages/core/src/mcp/policy.ts`
- `apps/v2/packages/core/src/mcp/agent-dispatch.ts`
- `apps/v2/packages/core/src/commands/mcp-policy.ts`
- `apps/v2/packages/core/tests/mcp-identity-mapping.test.ts`
- `apps/v2/packages/core/tests/mcp-policy-modes.test.ts`
- `apps/v2/packages/core/tests/mcp-staged-writes.test.ts`
- `apps/v2/packages/core/tests/mcp-policy-commands.test.ts`
- `apps/v2/packages/core/tests/mcp-policy-hydration.test.ts`
- `docs/planning/v2/epics/MCP-identity-policy-and-staged-writes.completion.md` (this file)

## Known gaps / deferred

- No GUI was built (a DM approval-queue UI). This epic is the Processing-Core identity/policy/staged-write
  layer; the visible DM approval surface is a separate concern and out of scope for this requirement set
  (the requirements are core-enforcement statements). The staged proposals, audit entries, and policy
  state are all exposed through typed core APIs ready for a future GUI epic.
- The MCP transport/sidecar remains deferred per ADR-014; this composes only Processing-Core surfaces.
- The baseline tool registry still ships only `note.create` as its write tool; the staged/direct decision
  is proven to generalize to any write tool via custom registries in the tests (e.g. a character-resource
  write tool used for the approval-after-revocation case).

## Git

- Branch: `epic/MCP-identity-policy-and-staged-writes`
- Feature + evidence commit: `af48fcaf3ca794df1445cdcbfa8f60d5f044aad9`
- Workpack-complete (regenerated planning files) commit: `e84c9d67747dfe08718f4f8ddad48504fb3704a0`
- This SHA-recording commit follows.

### `git status --short` (after the final commits)

```
```

The final `git status --short` is empty — the working tree is a clean slate after the completion commits.
