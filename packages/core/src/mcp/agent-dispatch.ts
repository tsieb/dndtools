import type { CoreEnvironment, CoreStateSlice } from '../commands/types';
import { appendOperationDraft } from '../commands/helpers';
import {
	MCP_POLICY_ENTITY_TYPE,
	type McpAuditEntry,
	type McpStagedProposal,
} from '../state/mcp-policy';
import type { McpToolRegistry } from './tool-registry';
import { resolveAgentIdentity, type McpIdentityDenyReason } from './identity';
import { decidePolicy, type McpPolicyDenyReason } from './policy';
import { invokeMcpTool, type McpToolInvocation, type McpToolResult } from './tool-dispatch';

/**
 * MCP-001 / MCP-003 / MCP-009 / MCP-011 — THE agent-facing entry point that COMPOSES the whole optionality +
 * identity + policy + staged-write contract onto the prior epic's fail-closed tool dispatch. The previous
 * MCP epics left explicit seams; this is where they are tied together, IN ORDER and each gate fail-closed:
 *
 *   0. OPTIONALITY (MCP-001) — the vault-wide MASTER ENABLE switch is checked FIRST. When MCP is DISABLED
 *      (the default), EVERY tool call (read or write, known or unknown tool) is denied at this master gate
 *      BEFORE identity resolves, before policy is read, and before any core query/command runs. There is no
 *      agent side-channel when MCP is off; core app functionality is wholly unaffected. The denial message
 *      is generic ("MCP is disabled for this vault") and leaks nothing about agents, policies, or proposals.
 *   1. IDENTITY (MCP-011) — resolve the agent CONNECTION to a SCOPED vault actor + role + policy profile
 *      + audit identity. An unmapped agent or a binding to an unregistered actor is DENIED here, BEFORE any
 *      core query/command runs. The agent then acts as exactly that actor — never widened.
 *   2. POLICY (MCP-009) — apply the per-agent mode + tool allowlist. `disabled` denies everything before
 *      core queries run (AC3); a non-allowlisted tool is denied; a write resolves to STAGE or DIRECT.
 *   3. ROUTE (MCP-003 / MCP-004) —
 *        - READ → delegate to the existing {@link invokeMcpTool}, which composes the actor-filtered query
 *          (visibility enforced by the data layer). No durable mutation.
 *        - WRITE, DIRECT (`trusted_direct`, allowlisted) → delegate to {@link invokeMcpTool}, which
 *          dispatches the bound command through `dispatchCommand` (Processing Core validation + audit still
 *          run — MCP-009 AC4). Record an audit entry. The command's own op-log captures the mutation.
 *        - WRITE, STAGE (`strict_review`/`balanced`) → capture a PENDING PROPOSAL (never commit). The write
 *          waits for a human `mcp.approve-proposal`. Append a durable op + an audit entry.
 *
 * The function is a pure transition: it returns the result envelope AND the `nextState`. Staging and direct
 * writes are durable mutations (they append ops), so the runtime persists `nextState` exactly as it does
 * for a normal command. There is no privileged path: a direct write reuses `dispatchCommand`; an approval
 * (elsewhere) reuses `dispatchCommand`; staging only PARKS a re-validatable command, it never mutates the
 * target entity. Per ADR-014 the MCP transport is deferred; this composes only Processing-Core surfaces.
 */

/** Why an agent tool call was denied at the optionality, identity, OR policy layer, BEFORE any query ran. */
export type McpAgentDenyReason =
	/** MCP-001 — the vault-wide MCP master switch is OFF (the default); no agent capability exists. */
	| 'mcp-disabled'
	| McpIdentityDenyReason
	| McpPolicyDenyReason
	/** The tool id is not in the registry allowlist (unknown tool). */
	| 'unknown-tool';

/**
 * The result of an AGENT tool call. It extends the tool-level envelope with the policy-layer outcomes:
 *
 *   - `agent-denied`: denied by identity/policy (unmapped agent, disabled mode, non-allowlisted tool,
 *     unknown tool) BEFORE any core query/command ran. The message is generic (leaks nothing about whether
 *     a target exists). `reason` is the machine code.
 *   - `staged`: a write was captured as a pending proposal (MCP-003). Carries the proposal id; NO durable
 *     mutation of the target occurred. `batchable` ⇒ a `balanced` low-risk write groupable into a batch.
 *   - `read-ok` / `write`: forwarded from {@link invokeMcpTool} for an allowed read or a direct write.
 */
export type McpAgentToolResult =
	| {
			status: 'agent-denied';
			toolId: string;
			reason: McpAgentDenyReason;
			message: string;
	  }
	| {
			status: 'staged';
			toolId: string;
			proposalId: string;
			batchable: boolean;
	  }
	| McpToolResult;

export interface McpAgentInvokeOutput {
	result: McpAgentToolResult;
	nextState: CoreStateSlice;
}

/** One agent tool call: which connection, which tool, with what (unvalidated) input. */
export interface McpAgentInvocation {
	/** The MCP agent/connection id. Resolved to a scoped actor by the binding (MCP-011). */
	agentId: string;
	/** The tool the agent is calling. An id not in the registry is denied (fail closed). */
	toolId: string;
	/** The raw tool-call arguments, validated against the tool's schema before anything runs. */
	input: unknown;
	/** Optional idempotency key forwarded to a direct write's dispatch / captured on a staged proposal. */
	idempotencyKey?: string;
}

/** A denial leaves durable state untouched: the unchanged `state` is threaded straight back. */
function agentDenied(
	state: CoreStateSlice,
	toolId: string,
	reason: McpAgentDenyReason,
	message: string,
): McpAgentInvokeOutput {
	return { result: { status: 'agent-denied', toolId, reason, message }, nextState: state };
}

/** Record a direct-write audit entry onto the (already-committed) state's mcp slice. Pure. */
function recordDirectAudit(
	state: CoreStateSlice,
	env: CoreEnvironment,
	entry: Omit<McpAuditEntry, 'id' | 'recordedAt' | 'mode' | 'proposalId'>,
): CoreStateSlice {
	const auditEntry: McpAuditEntry = {
		id: env.ids(),
		recordedAt: env.clock(),
		mode: 'direct',
		proposalId: null,
		...entry,
	};
	return { ...state, mcp: { ...state.mcp, auditEntries: [...state.mcp.auditEntries, auditEntry] } };
}

/**
 * MCP-003 / MCP-009 / MCP-011 — invoke an MCP tool AS AN AGENT through the full identity + policy + staged-
 * write pipeline. See the module doc for the gate order. Returns the result envelope plus the next state;
 * it NEVER throws for a denied/staged/rejected call.
 */
export function invokeMcpToolAsAgent(
	state: CoreStateSlice,
	env: CoreEnvironment,
	registry: McpToolRegistry,
	invocation: McpAgentInvocation,
): McpAgentInvokeOutput {
	// Gate 0a — OPTIONALITY (MCP-001). The vault-wide master switch is checked FIRST: when MCP is OFF (the
	// default) EVERY agent tool call — read or write, known or unknown tool — is denied here BEFORE the tool
	// is even resolved, before identity, before policy, and before any core query/command. No agent
	// capability exists when MCP is disabled, and the generic message leaks nothing (MCP-001 AC2: an
	// MCP-only call while disabled returns disabled status without touching core state).
	if (!state.mcp.enabled) {
		return agentDenied(state, invocation.toolId, 'mcp-disabled', 'MCP is disabled for this vault.');
	}

	// Gate 0b — UNKNOWN TOOL. Resolve the tool first so the allowlist/route can read its kind + write risk.
	const tool = registry.get(invocation.toolId);
	if (!tool) {
		return agentDenied(
			state,
			invocation.toolId,
			'unknown-tool',
			`Tool "${invocation.toolId}" is not available.`,
		);
	}

	// Gate 1 — IDENTITY (MCP-011). Resolve the connection to a scoped actor + role + policy. Fail closed.
	const resolution = resolveAgentIdentity(state.permissions, state.mcp, invocation.agentId);
	if (!resolution.ok) {
		return agentDenied(
			state,
			invocation.toolId,
			resolution.reason,
			'The agent connection is not mapped to a vault actor.',
		);
	}
	const identity = resolution.identity;

	// Gate 2 — POLICY (MCP-009). `disabled` / non-allowlisted deny BEFORE any core query/command runs.
	const decision = decidePolicy(identity, tool);
	if (decision.kind === 'denied') {
		const message =
			decision.reason === 'disabled'
				? 'MCP is disabled for this agent.'
				: 'This tool is not in the agent allowlist.';
		return agentDenied(state, invocation.toolId, decision.reason, message);
	}

	// Gate 3 — ROUTE. The agent acts as its bound actor for every composed call (never widened).
	const toolInvocation: McpToolInvocation = {
		toolId: invocation.toolId,
		actorId: identity.actorId,
		agentId: invocation.agentId,
		input: invocation.input,
		...(invocation.idempotencyKey !== undefined ? { idempotencyKey: invocation.idempotencyKey } : {}),
	};

	if (decision.kind === 'allow-read') {
		// READ — delegate to the existing actor-filtered tool dispatch. No durable mutation.
		const result = invokeMcpTool(state, env, registry, toolInvocation);
		return { result, nextState: state };
	}

	if (decision.kind === 'direct') {
		// DIRECT WRITE (`trusted_direct`, allowlisted) — the bound command still runs through dispatchCommand
		// (Processing Core validation + audit — MCP-009 AC4). On an accepted commit, record a `direct` audit
		// entry on top of the committed state so the write is attributable.
		const result = invokeMcpTool(state, env, registry, toolInvocation);
		if (result.status === 'write' && result.commandResult.status === 'accepted') {
			const committedState = result.commandResult.nextState;
			// MCP-011 AC2 — the attribution is ALWAYS recorded for the DM audit trail; `auditVisible`
			// only governs whether the entry is surfaced in the visible feed (its `visible` flag).
			const audited = recordDirectAudit(committedState, env, {
				agentId: invocation.agentId,
				actorId: identity.actorId,
				policyMode: identity.policyMode,
				toolId: invocation.toolId,
				visible: identity.auditVisible,
			});
			return { result, nextState: audited };
		}
		// A rejected direct write made no durable mutation; pass the envelope through unchanged.
		return { result, nextState: state };
	}

	// STAGE (MCP-003) — capture a PENDING proposal; do NOT commit. Only a write tool can reach here (a read
	// resolves to `allow-read`), so the tool is a write tool with a bound command + write risk. We validate
	// the tool input here (fail closed) so a schema-invalid write is rejected BEFORE it is ever staged.
	if (tool.kind !== 'write') {
		// Defensive: unreachable (the policy decision only returns `stage` for a write tool).
		return agentDenied(
			state,
			invocation.toolId,
			'unknown-tool',
			`Tool "${invocation.toolId}" cannot be staged.`,
		);
	}
	const parsed = tool.inputSchema.safeParse(invocation.input);
	if (!parsed.success) {
		// Reuse the tool-level invalid-input envelope so a staged write that fails schema is denied exactly
		// like a direct one (MCP-004 AC2 — a write that fails schema validation accepts no staged mutation).
		const result = invokeMcpTool(state, env, registry, toolInvocation);
		return { result, nextState: state };
	}

	const proposalId = env.ids();
	const now = env.clock();
	const proposal: McpStagedProposal = {
		id: proposalId,
		agentId: invocation.agentId,
		actorId: identity.actorId,
		toolId: invocation.toolId,
		commandType: tool.commandType,
		// Stage the SCHEMA-VALIDATED tool input. The approval re-dispatches the bound command, whose own
		// validator re-checks the full payload against current state (so staging can never smuggle a field
		// the command rejects, and the bound command — never the tool — decides the final durable shape).
		payload: parsed.data,
		policyMode: identity.policyMode,
		writeRisk: tool.writeRisk,
		...(invocation.idempotencyKey !== undefined ? { idempotencyKey: invocation.idempotencyKey } : {}),
		status: 'pending',
		createdAt: now,
		resolvedAt: null,
		resolvedBy: null,
	};

	// Append a durable op so the staging replays in order (the proposal is durable state). The op carries
	// only the staging metadata — never the target entity's data. The proposal id is the user-facing handle.
	const { log: nextLog } = appendOperationDraft(env, state.sync, identity.actorId, {
		entityType: MCP_POLICY_ENTITY_TYPE,
		entityId: proposalId,
		opType: 'mcp.stage-proposal',
		path: `proposals/${proposalId}`,
		value: { proposalId, toolId: invocation.toolId, commandType: tool.commandType },
	});

	// MCP-011 AC2 — always record the staged-write attribution; `auditVisible` only sets `visible`.
	const auditEntry: McpAuditEntry = {
		id: env.ids(),
		agentId: invocation.agentId,
		actorId: identity.actorId,
		policyMode: identity.policyMode,
		toolId: invocation.toolId,
		mode: 'staged',
		proposalId,
		visible: identity.auditVisible,
		recordedAt: now,
	};

	const nextState: CoreStateSlice = {
		...state,
		sync: nextLog,
		mcp: {
			...state.mcp,
			proposals: { ...state.mcp.proposals, [proposalId]: proposal },
			auditEntries: [...state.mcp.auditEntries, auditEntry],
		},
	};

	return {
		result: {
			status: 'staged',
			toolId: invocation.toolId,
			proposalId,
			batchable: decision.batchable,
		},
		nextState,
	};
}
