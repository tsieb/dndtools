import {
	approveMcpProposalInputSchema,
	rejectMcpProposalInputSchema,
	resolveMcpProposalConflictInputSchema,
	removeMcpAgentBindingInputSchema,
	setMcpAgentBindingInputSchema,
	setMcpAgentPolicyInputSchema,
	setMcpEnabledInputSchema,
	setMcpVaultDefaultInputSchema,
} from '../schemas/commands';
import {
	MCP_POLICY_ENTITY_TYPE,
	isMcpPolicyMode,
	type McpAgentBinding,
	type McpAgentPolicy,
	type McpAuditEntry,
	type McpPolicyState,
	type McpStagedProposal,
} from '../state/mcp-policy';
import type { CommandResult, CoreCommand, CoreEnvironment, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';
import { dispatchCommand } from './dispatch';
import { computeMcpProposalConflict } from '../mcp/proposal-conflict';

/**
 * MCP-003 / MCP-009 / MCP-011 — the DM-ONLY administrative command handlers for the MCP identity, policy,
 * and staged-writes slice. Architecture Contract 1 (the Processing Core is the only owner of durable
 * mutation) + Contract 3 (only the DM authors identity/policy). Every handler:
 *
 *   - re-checks DM authority (a player/observer/agent can never author MCP policy);
 *   - mutates ONLY the `mcp` slice (and, for an approval, the underlying entity via `dispatchCommand`);
 *   - appends a durable `mcp.*` op (the change replays in order) + an audit metadata trail; and
 *   - fails closed — an unknown actor, an unbound agent, an unknown mode, a missing/non-pending proposal,
 *     or a write whose authority was revoked since staging is REJECTED with no durable mutation.
 *
 * Crucially, the APPROVAL path (MCP-003) has NO privileged side-channel: it re-runs the captured command
 * through the SAME `dispatchCommand` as the SAME bound actor, so the command's own authority/schema/
 * visibility checks decide whether the commit succeeds. A grant revoked between staging and approval makes
 * that re-dispatch reject, which blocks the commit; a proposal can never be committed twice.
 */

function withMcp(state: CoreStateSlice, mcp: McpPolicyState): CoreStateSlice {
	return { ...state, mcp };
}

/** MCP-011 — set (create or update) an agent → scoped actor binding. DM-only; the actor must exist. */
export function handleSetMcpAgentBinding(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setMcpAgentBindingInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	// Fail closed: an agent can only ever be bound to a REGISTERED participant. Binding to a non-existent
	// actor would let a later resolution conjure an actor that does not exist; refuse it here.
	if (!state.permissions.actors[input.actorId]) {
		return reject(
			{
				code: 'mcp-actor-not-registered',
				message: `Actor ${input.actorId} is not a registered participant.`,
			},
			state,
		);
	}

	const previous = state.mcp.bindings[input.agentId];
	const now = env.clock();
	const binding: McpAgentBinding = {
		agentId: input.agentId,
		actorId: input.actorId,
		label: input.label,
		createdBy: previous?.createdBy ?? actor.id,
		createdAt: previous?.createdAt ?? now,
		updatedAt: now,
		revision: (previous?.revision ?? 0) + 1,
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: MCP_POLICY_ENTITY_TYPE,
		entityId: input.agentId,
		opType: 'mcp.set-agent-binding',
		path: `bindings/${input.agentId}`,
		value: { agentId: input.agentId, actorId: input.actorId },
		beforeRevision: previous?.revision ?? 0,
		afterRevision: binding.revision,
	});

	return {
		status: 'accepted',
		nextState: withMcp(
			{ ...state, sync: nextLog },
			{ ...state.mcp, bindings: { ...state.mcp.bindings, [input.agentId]: binding } },
		),
		events: [
			{
				kind: 'mcp.agent-binding-changed',
				agentId: input.agentId,
				boundActorId: input.actorId,
				mutation: 'set',
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

/**
 * MCP-011 — remove an agent binding. The agent can no longer resolve to an actor, so every later tool call
 * is denied fail-closed. Any of the agent's still-PENDING proposals are EXPIRED in the same command (a
 * proposal whose author can no longer act must never commit — fail closed against approval-after-unbind).
 */
export function handleRemoveMcpAgentBinding(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(removeMcpAgentBindingInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const previous = state.mcp.bindings[input.agentId];
	if (!previous) {
		return reject(
			{ code: 'mcp-agent-not-bound', message: `Agent ${input.agentId} has no binding.` },
			state,
		);
	}

	const nextBindings = { ...state.mcp.bindings };
	delete nextBindings[input.agentId];

	// Expire any of this agent's pending proposals so they can never be approved after the agent is unbound.
	const now = env.clock();
	const nextProposals: Record<string, McpStagedProposal> = {};
	for (const [id, proposal] of Object.entries(state.mcp.proposals)) {
		nextProposals[id] =
			proposal.agentId === input.agentId && proposal.status === 'pending'
				? { ...proposal, status: 'expired', resolvedAt: now, resolvedBy: actor.id }
				: proposal;
	}

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: MCP_POLICY_ENTITY_TYPE,
		entityId: input.agentId,
		opType: 'mcp.remove-agent-binding',
		path: `bindings/${input.agentId}`,
		value: { agentId: input.agentId },
		beforeRevision: previous.revision,
		afterRevision: previous.revision + 1,
	});

	return {
		status: 'accepted',
		nextState: withMcp(
			{ ...state, sync: nextLog },
			{ ...state.mcp, bindings: nextBindings, proposals: nextProposals },
		),
		events: [
			{
				kind: 'mcp.agent-binding-changed',
				agentId: input.agentId,
				boundActorId: null,
				mutation: 'removed',
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

/** MCP-009 — configure a per-agent policy (mode + allowlist + audit visibility). DM-only. */
export function handleSetMcpAgentPolicy(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setMcpAgentPolicyInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	// The enum already rejects an unknown mode; re-check defensively so a future schema change can never
	// let an unknown mode through into the durable policy (fail closed).
	if (!isMcpPolicyMode(input.mode)) {
		return reject(
			{ code: 'mcp-unknown-policy-mode', message: `Unknown MCP policy mode "${input.mode}".` },
			state,
		);
	}

	const previous = state.mcp.policies[input.agentId];
	const now = env.clock();
	const policy: McpAgentPolicy = {
		agentId: input.agentId,
		mode: input.mode,
		allowedToolIds: [...new Set(input.allowedToolIds)],
		auditVisible: input.auditVisible,
		createdBy: previous?.createdBy ?? actor.id,
		createdAt: previous?.createdAt ?? now,
		updatedAt: now,
		revision: (previous?.revision ?? 0) + 1,
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: MCP_POLICY_ENTITY_TYPE,
		entityId: input.agentId,
		opType: 'mcp.set-agent-policy',
		path: `policies/${input.agentId}`,
		value: { agentId: input.agentId, mode: input.mode, allowedToolIds: policy.allowedToolIds },
		beforeRevision: previous?.revision ?? 0,
		afterRevision: policy.revision,
	});

	return {
		status: 'accepted',
		nextState: withMcp(
			{ ...state, sync: nextLog },
			{ ...state.mcp, policies: { ...state.mcp.policies, [input.agentId]: policy } },
		),
		events: [
			{
				kind: 'mcp.agent-policy-changed',
				agentId: input.agentId,
				mode: policy.mode,
				allowedToolCount: policy.allowedToolIds.length,
				auditVisible: policy.auditVisible,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

/**
 * MCP-001 — flip the vault-wide MASTER ENABLE switch. DM-only and the ONLY way to turn the entire MCP/agent
 * integration on (it is off by default). Enabling is an explicit DM action; disabling cleanly removes all
 * agent capability — every later agent tool call is denied at the master gate regardless of per-agent
 * policy, with no durable mutation of bindings/policies/proposals (turning MCP back on restores them
 * unchanged). The change appends a durable op so it replays in order across devices.
 */
export function handleSetMcpEnabled(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setMcpEnabledInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: MCP_POLICY_ENTITY_TYPE,
		entityId: 'vault-enabled',
		opType: 'mcp.set-enabled',
		path: 'enabled',
		value: { enabled: input.enabled },
	});

	return {
		status: 'accepted',
		nextState: withMcp({ ...state, sync: nextLog }, { ...state.mcp, enabled: input.enabled }),
		events: [{ kind: 'mcp.enabled-changed', enabled: input.enabled, actorId: actor.id }],
		operationIds: [op.id],
	};
}

/** MCP-009 — set the vault-wide default policy posture a never-configured agent inherits. DM-only. */
export function handleSetMcpVaultDefault(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setMcpVaultDefaultInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: MCP_POLICY_ENTITY_TYPE,
		entityId: 'vault-default',
		opType: 'mcp.set-vault-default',
		path: 'vaultDefaultMode',
		value: { mode: input.mode },
	});

	return {
		status: 'accepted',
		nextState: withMcp({ ...state, sync: nextLog }, { ...state.mcp, vaultDefaultMode: input.mode }),
		events: [{ kind: 'mcp.vault-default-changed', mode: input.mode, actorId: actor.id }],
		operationIds: [op.id],
	};
}

/** Append an audit entry recording the resolution of a staged proposal. Pure (clock/id from env). */
function appendAuditEntry(mcp: McpPolicyState, entry: McpAuditEntry): McpPolicyState {
	return { ...mcp, auditEntries: [...mcp.auditEntries, entry] };
}

/**
 * MCP-003 — APPROVE a staged write. This is the keystone fail-closed path:
 *
 *   1. DM-only, and the proposal must EXIST and be PENDING (a non-pending proposal — already approved,
 *      rejected, or expired — is rejected: a proposal can never be committed twice; replay/double-commit
 *      guard).
 *   2. Mark the proposal `approved` FIRST, then re-dispatch the captured command through the EXISTING
 *      authorized `dispatchCommand` as the SAME bound actor. The re-dispatch re-runs the command's own
 *      authority + schema + visibility checks against the CURRENT state — so a grant revoked between
 *      staging and approval makes the re-dispatch reject, and we propagate that rejection (the commit is
 *      blocked, the proposal stays terminal-but-uncommitted). There is no privileged commit; the agent's
 *      write gets EXACTLY the enforcement a human dispatch would.
 *   3. On an accepted commit, thread the underlying command's nextState/ops through and record the audit
 *      entry (agent id, actor id, policy mode, tool id, staged mode) tied to the proposal.
 */
export function handleApproveMcpProposal(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(approveMcpProposalInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const proposal = state.mcp.proposals[input.proposalId];
	if (!proposal) {
		return reject(
			{ code: 'mcp-proposal-not-found', message: `Proposal ${input.proposalId} does not exist.` },
			state,
		);
	}
	if (proposal.status !== 'pending') {
		// Replay / double-commit guard: a proposal resolved once can never commit again (fail closed).
		return reject(
			{
				code: 'mcp-proposal-not-pending',
				message: `Proposal ${input.proposalId} is ${proposal.status}, not pending.`,
			},
			state,
		);
	}

	// Re-dispatch the captured command as the SAME bound actor through the existing authorized dispatch.
	// This re-validates authority + schema against CURRENT state (a revoked grant blocks the commit).
	const commitResult = dispatchCommand(state, env, {
		type: proposal.commandType,
		actorId: proposal.actorId,
		payload: proposal.payload,
		...(input.idempotencyKey !== undefined
			? { idempotencyKey: input.idempotencyKey }
			: proposal.idempotencyKey !== undefined
				? { idempotencyKey: proposal.idempotencyKey }
				: {}),
	} as CoreCommand);

	if (commitResult.status !== 'accepted') {
		// The underlying command rejected at approval time (e.g. authority revoked since staging). Block the
		// commit and surface the SAME rejection — no durable mutation, the proposal stays pending for the DM.
		return reject(commitResult.rejection, state);
	}

	// The commit went through op-logging and produced the real durable mutation. Thread its nextState
	// through, then mark the proposal approved + append the audit entry on top of the committed state.
	const committedState = commitResult.nextState;
	const now = env.clock();
	const approvedProposal: McpStagedProposal = {
		...proposal,
		status: 'approved',
		resolvedAt: now,
		resolvedBy: actor.id,
	};
	const auditEntry: McpAuditEntry = {
		id: env.ids(),
		agentId: proposal.agentId,
		actorId: proposal.actorId,
		policyMode: proposal.policyMode,
		toolId: proposal.toolId,
		mode: 'staged',
		proposalId: proposal.id,
		// A DM-approved write is always visible in the audit feed (the DM authorized it).
		visible: true,
		recordedAt: now,
	};
	const nextMcp = appendAuditEntry(
		{
			...committedState.mcp,
			proposals: { ...committedState.mcp.proposals, [proposal.id]: approvedProposal },
		},
		auditEntry,
	);

	return {
		status: 'accepted',
		nextState: withMcp(committedState, nextMcp),
		events: [
			...commitResult.events,
			{
				kind: 'mcp.proposal-approved',
				proposalId: proposal.id,
				agentId: proposal.agentId,
				boundActorId: proposal.actorId,
				commandType: proposal.commandType,
				committedOperationIds: commitResult.operationIds,
				actorId: actor.id,
			},
		],
		operationIds: commitResult.operationIds,
	};
}

/** MCP-003 — REJECT a staged write. No durable mutation; the proposal becomes terminal. DM-only. */
export function handleRejectMcpProposal(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(rejectMcpProposalInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const proposal = state.mcp.proposals[input.proposalId];
	if (!proposal) {
		return reject(
			{ code: 'mcp-proposal-not-found', message: `Proposal ${input.proposalId} does not exist.` },
			state,
		);
	}
	if (proposal.status !== 'pending') {
		return reject(
			{
				code: 'mcp-proposal-not-pending',
				message: `Proposal ${input.proposalId} is ${proposal.status}, not pending.`,
			},
			state,
		);
	}

	const now = env.clock();
	const rejectedProposal: McpStagedProposal = {
		...proposal,
		status: 'rejected',
		resolvedAt: now,
		resolvedBy: actor.id,
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: MCP_POLICY_ENTITY_TYPE,
		entityId: proposal.id,
		opType: 'mcp.reject-proposal',
		path: `proposals/${proposal.id}`,
		value: { proposalId: proposal.id, status: 'rejected' },
	});

	return {
		status: 'accepted',
		nextState: withMcp(
			{ ...state, sync: nextLog },
			{ ...state.mcp, proposals: { ...state.mcp.proposals, [proposal.id]: rejectedProposal } },
		),
		events: [
			{
				kind: 'mcp.proposal-rejected',
				proposalId: proposal.id,
				agentId: proposal.agentId,
				reason: 'rejected',
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

// --- RC-AI-2.2 — RESOLVE A STAGED WRITE'S THREE-WAY CONFLICT (append-only block) --------------------

/**
 * RC-AI-2.2 — settle a staged note rewrite whose base revision went stale.
 *
 * Approving such a proposal AS STAGED is the one place the staged-write pipeline could still report a
 * fake success: `content.update-item` sees the stale `baseRevision`, records a `content.item-conflict`
 * op, leaves the note UNCHANGED — and the approval nonetheless marks the proposal approved and tells
 * the DM the write landed. This command replaces that with an explicit three-way decision:
 *
 *   - `keep-ai`   — the assistant's version wins. The captured payload is re-dispatched REBASED onto the
 *                   note's CURRENT revision, as the SAME bound actor, through the SAME authorized
 *                   dispatch. The human edit is overwritten because the DM said so, not silently.
 *   - `keep-mine` — the note stands. No durable write; the proposal becomes terminal (rejected).
 *   - `merge`     — the Core's own diff3 result is written. Offered ONLY when the merge is clean (the
 *                   two edits touch different lines) and only when a base snapshot exists; the merged
 *                   text comes from the Core record, never from the caller.
 *
 * Fail closed: DM-only; the proposal must exist and be PENDING; the proposal must actually BE in
 * conflict (a proposal with a live base is `invalid-state` here — approve or reject it instead); and a
 * `merge` with no clean merge to take is `invalid-state` rather than a guess. The re-dispatch re-runs
 * the command's own authority/schema/visibility checks, so a grant revoked since staging still blocks
 * the write exactly as it blocks an approval.
 */
export function handleResolveMcpProposalConflict(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(resolveMcpProposalConflictInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const proposal = state.mcp.proposals[input.proposalId];
	if (!proposal) {
		return reject(
			{ code: 'mcp-proposal-not-found', message: `Proposal ${input.proposalId} does not exist.` },
			state,
		);
	}
	if (proposal.status !== 'pending') {
		return reject(
			{
				code: 'mcp-proposal-not-pending',
				message: `Proposal ${input.proposalId} is ${proposal.status}, not pending.`,
			},
			state,
		);
	}

	const conflict = computeMcpProposalConflict(state, proposal);
	if (!conflict) {
		return reject(
			{
				code: 'invalid-state',
				message: 'This proposal is not in conflict. Approve or reject it instead.',
			},
			state,
		);
	}
	if (!conflict.resolutions.includes(input.resolution)) {
		return reject(
			{
				code: 'invalid-state',
				message:
					input.resolution === 'merge'
						? 'The two edits touch the same lines, so there is no merge to take.'
						: `Resolution ${input.resolution} is not available for this conflict.`,
			},
			state,
		);
	}

	const now = env.clock();

	// KEEP MINE — the note stands as written. No durable write; the proposal becomes terminal so it can
	// never be approved later against a base that is now two edits old.
	if (input.resolution === 'keep-mine') {
		const rejectedProposal: McpStagedProposal = {
			...proposal,
			status: 'rejected',
			resolvedAt: now,
			resolvedBy: actor.id,
		};
		const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
			entityType: MCP_POLICY_ENTITY_TYPE,
			entityId: proposal.id,
			opType: 'mcp.reject-proposal',
			path: `proposals/${proposal.id}`,
			value: { proposalId: proposal.id, status: 'rejected', resolution: 'keep-mine' },
		});
		return {
			status: 'accepted',
			nextState: withMcp(
				{ ...state, sync: nextLog },
				{ ...state.mcp, proposals: { ...state.mcp.proposals, [proposal.id]: rejectedProposal } },
			),
			events: [
				{
					kind: 'mcp.proposal-rejected',
					proposalId: proposal.id,
					agentId: proposal.agentId,
					reason: 'rejected',
					actorId: actor.id,
				},
			],
			operationIds: [op.id],
		};
	}

	// KEEP AI / MERGE — both write, both REBASE onto the note's current revision, and both go through
	// the ordinary authorized dispatch as the proposal's bound actor. The only difference is whose text.
	const chosen = input.resolution === 'merge' ? conflict.merge! : conflict.ai;
	const commitResult = dispatchCommand(state, env, {
		type: 'content.update-item',
		actorId: proposal.actorId,
		payload: {
			itemId: conflict.itemId,
			baseRevision: conflict.current.revision,
			title: chosen.title,
			body: chosen.body,
		},
		...(proposal.idempotencyKey !== undefined ? { idempotencyKey: proposal.idempotencyKey } : {}),
	} as CoreCommand);
	if (commitResult.status !== 'accepted') return reject(commitResult.rejection, state);

	const committedState = commitResult.nextState;
	const approvedProposal: McpStagedProposal = {
		...proposal,
		status: 'approved',
		resolvedAt: now,
		resolvedBy: actor.id,
	};
	const auditEntry: McpAuditEntry = {
		id: env.ids(),
		agentId: proposal.agentId,
		actorId: proposal.actorId,
		policyMode: proposal.policyMode,
		toolId: proposal.toolId,
		mode: 'staged',
		proposalId: proposal.id,
		visible: true,
		recordedAt: now,
	};
	const nextMcp = appendAuditEntry(
		{
			...committedState.mcp,
			proposals: { ...committedState.mcp.proposals, [proposal.id]: approvedProposal },
		},
		auditEntry,
	);

	return {
		status: 'accepted',
		nextState: withMcp(committedState, nextMcp),
		events: [
			...commitResult.events,
			{
				kind: 'mcp.proposal-approved',
				proposalId: proposal.id,
				agentId: proposal.agentId,
				boundActorId: proposal.actorId,
				commandType: proposal.commandType,
				committedOperationIds: commitResult.operationIds,
				actorId: actor.id,
			},
		],
		operationIds: commitResult.operationIds,
	};
}
