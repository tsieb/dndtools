import type { ActorId } from './ids';

/**
 * MCP-003 / MCP-009 / MCP-011 — the durable MCP IDENTITY, POLICY, and STAGED-WRITES VaultState slice.
 *
 * This is the state document the "Identity, policy, and staged writes" capability branch owns. It is a
 * bounded vault document modeled exactly like the other durable slices (`audio`, `characters`,
 * `encounters`): record maps keyed by id plus a schema version, with a fail-closed `ensure` hydration
 * helper so a vault persisted before this slice (or before a given field) existed restores to a SAFE,
 * MOST-RESTRICTIVE default without a destructive migration. It holds four things and NOTHING that confers
 * authority on its own:
 *
 *   1. AGENT BINDINGS (MCP-011) — the fail-closed map from an MCP agent CONNECTION to a SCOPED vault
 *      ACTOR. A binding is the ONLY thing that lets an agent act, and it can never resolve to MORE
 *      authority than its bound actor: the agent is filtered and permission-gated EXACTLY like that
 *      actor by the existing Processing Core. A binding holds NO capability/visibility data — it just
 *      names which registered actor a connection speaks as.
 *
 *   2. AGENT POLICIES + VAULT DEFAULT (MCP-009) — the DM-authored per-agent policy mode (`disabled`,
 *      `strict_review`, `balanced`, `trusted_direct`), tool allowlist, and audit-visibility flag, plus
 *      the vault-wide default posture a never-seen agent falls back to. Resolution is fail-closed: an
 *      unknown/under-scoped mode collapses to the MOST RESTRICTIVE.
 *
 *   3. PENDING PROPOSALS (MCP-003) — staged writes. Under `strict_review`/`balanced` an agent's write is
 *      captured here as a PENDING proposal a human (DM) must approve before it commits through the
 *      EXISTING authorized dispatch. A proposal NEVER auto-commits, never escalates, and re-validates
 *      authority + schema at approval time.
 *
 *   4. AUDIT ENTRIES (MCP-011 AC2 / MCP-003) — an append-only audit trail recording, for every staged or
 *      direct MCP write decision, the agent id, actor id, policy mode, tool id, and staged/direct mode.
 *
 * Pure data. No GUI, no storage, no clock — ids/clock are supplied by the command env. The IDENTITY,
 * POLICY, and STAGING decisions are pure functions in `mcp/`; this module owns only the shape + hydration.
 *
 * MCP-001 (OPTIONALITY) adds the vault-wide MASTER ENABLE switch above all of the above. It is the single
 * kill switch the requirement names ("MCP can be completely disabled"): the entire MCP/agent integration is
 * OFF by default and stays off until the DM EXPLICITLY enables it. When OFF, NO agent tool call resolves —
 * the master gate denies every call BEFORE identity, policy, or any core query runs, so there is no agent
 * side-channel and core app functionality (notes, maps, Scenes, characters, sessions, sync, search, graph)
 * is wholly unaffected. The master switch is DISTINCT from the per-agent `vaultDefaultMode` (which only
 * governs a never-configured agent's mode WHEN MCP is on); turning MCP off removes ALL agent capability
 * regardless of per-agent policy. Hydration fails closed to OFF, so an older vault — or a corrupt flag —
 * restores with MCP disabled.
 */

export const MCP_POLICY_STATE_SCHEMA_VERSION = 1 as const;

/** The entity type MCP policy/identity/proposal records are addressed by in ops/events. */
export const MCP_POLICY_ENTITY_TYPE = 'mcp-policy' as const;

/**
 * The per-agent MCP POLICY MODES (MCP-009), ordered MOST → LEAST restrictive. The order is meaningful:
 * fail-closed resolution always collapses an unknown/under-scoped mode to the MOST restrictive one, and
 * the staged-write decision reads the mode to decide stage vs direct vs deny.
 *
 *   - `disabled`       — the agent may do NOTHING. Every tool call returns disabled status BEFORE any
 *     core query/command runs (MCP-009 AC3).
 *   - `strict_review`  — every write is STAGED for human approval; a durable write never commits directly
 *     (MCP-003 default posture). The safest write-capable mode.
 *   - `balanced`       — low-risk writes are STAGED but BATCHABLE for a single approve/reject of the batch;
 *     durable writes still require explicit approval (MCP-003 AC3).
 *   - `trusted_direct` — an allowlisted write may commit DIRECTLY, but ONLY through the same Processing
 *     Core validation + audit a human gets (MCP-009 AC4); a non-allowlisted tool is still staged.
 */
export const MCP_POLICY_MODES = ['disabled', 'strict_review', 'balanced', 'trusted_direct'] as const;
export type McpPolicyMode = (typeof MCP_POLICY_MODES)[number];

/** Narrow an arbitrary value to a declared policy mode (fail closed: anything else is rejected). */
export function isMcpPolicyMode(value: unknown): value is McpPolicyMode {
	return typeof value === 'string' && (MCP_POLICY_MODES as readonly string[]).includes(value);
}

/**
 * The vault-wide DEFAULT posture a never-configured agent connection inherits (MCP-009 AC1). It is
 * deliberately restricted to the two SAFE defaults the requirement names: a new agent defaults to
 * `strict_review` (staged) or `disabled`, NEVER `balanced`/`trusted_direct`.
 */
export type McpVaultDefaultMode = Extract<McpPolicyMode, 'strict_review' | 'disabled'>;

/**
 * ONE MCP AGENT BINDING (MCP-011). Maps a connection/agent id to the registered vault ACTOR it speaks
 * as. This is the ONLY record that grants an agent a voice; it confers NO capability of its own — the
 * bound actor's role + grants + visibility decide everything downstream, so an agent can never exceed
 * its actor.
 */
export interface McpAgentBinding {
	/** The MCP agent/connection id (the transport-facing identity). */
	agentId: string;
	/** The SCOPED registered vault actor this agent acts as. Must be a real actor at resolve time. */
	actorId: ActorId;
	/** A DM-facing label for the agent (e.g. "Prep Assistant"). Carries no authority. */
	label: string;
	createdBy: ActorId;
	createdAt: string;
	updatedAt: string;
	revision: number;
}

/**
 * ONE per-agent MCP POLICY (MCP-009). The DM authors the mode, the tool allowlist (the explicit set of
 * tool ids this agent may invoke — an empty list means "no tool"), and whether the agent's actions are
 * visible in audit history. A policy carries no actor mapping; identity is the binding's job.
 */
export interface McpAgentPolicy {
	agentId: string;
	mode: McpPolicyMode;
	/**
	 * The explicit tool-id allowlist. A tool NOT in this list is denied for this agent before any core
	 * query/command runs (fail closed — there is no implicit "all tools"). For a `trusted_direct` agent,
	 * a write tool must ALSO be allowlisted before a direct write is permitted (MCP-009 AC4).
	 */
	allowedToolIds: string[];
	/** Whether this agent's writes appear in audit history (audit visibility, MCP-009). */
	auditVisible: boolean;
	createdBy: ActorId;
	createdAt: string;
	updatedAt: string;
	revision: number;
}

/** Whether a staged proposal is awaiting review, or was approved/rejected/expired (terminal). */
export type McpProposalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/**
 * ONE PENDING (or resolved) STAGED WRITE (MCP-003). It captures EVERYTHING needed to re-validate and
 * commit the write at approval time through the EXISTING authorized dispatch — never a copy of mutated
 * state, never a privileged side-channel. The bound command + payload are re-run through `dispatchCommand`
 * as the SAME `actorId` at approval, so a grant revoked between staging and approval blocks the commit.
 */
export interface McpStagedProposal {
	id: string;
	/** The agent connection that staged this write (for audit + grouping a `balanced` batch). */
	agentId: string;
	/** The SCOPED actor the write will be dispatched as at approval (never widened). */
	actorId: ActorId;
	/** The tool that produced the staged write. */
	toolId: string;
	/** The core command type the approval will dispatch (bound by the tool registry, never invented). */
	commandType: string;
	/** The already-schema-validated command payload captured at staging time. */
	payload: unknown;
	/** The policy mode in force when the write was staged (recorded for audit). */
	policyMode: McpPolicyMode;
	/** The tool's declared write-risk class (`low-risk` is batchable under `balanced`). */
	writeRisk: 'low-risk' | 'durable';
	/** Optional idempotency key forwarded to the dispatch at approval (idempotent commit). */
	idempotencyKey?: string;
	status: McpProposalStatus;
	createdAt: string;
	/** When the proposal was approved/rejected/expired; null while pending. */
	resolvedAt: string | null;
	/** The DM who approved/rejected; null while pending or on expiry. */
	resolvedBy: ActorId | null;
}

/**
 * ONE append-only AUDIT ENTRY (MCP-011 AC2 / MCP-003). Records the IDENTITY + POLICY decision for a
 * single MCP write attempt: agent id, actor id, policy mode, tool id, and the staged/direct mode. It
 * carries NO mutated content — just the decision metadata the DM needs to inspect what an agent did.
 */
export interface McpAuditEntry {
	id: string;
	agentId: string;
	actorId: ActorId;
	policyMode: McpPolicyMode;
	toolId: string;
	/** The decision: the write was STAGED for review, committed DIRECTLY, or DENIED by policy. */
	mode: 'staged' | 'direct' | 'denied';
	/** The staged proposal id when `mode` is `staged`; null otherwise. */
	proposalId: string | null;
	recordedAt: string;
}

/**
 * The durable MCP slice. Bindings, policies, and proposals are keyed by their id; the vault default mode
 * is the single posture a never-configured agent inherits; audit entries are an append-only ordered list.
 */
export interface McpPolicyState {
	/**
	 * MCP-001 — the vault-wide MASTER ENABLE switch. `false` (the default) means the ENTIRE MCP/agent
	 * integration is OFF: every agent tool call is denied at the master gate before identity/policy/queries
	 * run, no agent capability exists, and core app functionality is unaffected. Only an explicit DM action
	 * (`mcp.set-enabled`) flips it on; turning it off cleanly removes all agent capability. Default-off,
	 * fail-closed on hydration.
	 */
	enabled: boolean;
	/** Agent connection → scoped actor bindings, keyed by agent id (MCP-011). */
	bindings: Record<string, McpAgentBinding>;
	/** Per-agent policy modes + allowlists + audit visibility, keyed by agent id (MCP-009). */
	policies: Record<string, McpAgentPolicy>;
	/** Staged writes awaiting (or having had) human review, keyed by proposal id (MCP-003). */
	proposals: Record<string, McpStagedProposal>;
	/** The append-only MCP write audit trail (MCP-011 AC2). Ordered oldest → newest. */
	auditEntries: McpAuditEntry[];
	/** The vault-wide default mode a never-configured agent inherits (MCP-009 AC1). */
	vaultDefaultMode: McpVaultDefaultMode;
	schemaVersion: typeof MCP_POLICY_STATE_SCHEMA_VERSION;
}

/**
 * The fail-closed EMPTY MCP policy slice. MCP is DISABLED by default (MCP-001 optionality — the entire
 * integration is off until the DM explicitly enables it). The vault default is `strict_review` — the SAFE
 * staged posture — so when MCP IS enabled a brand-new vault still stages every write and never silently
 * allows a direct write.
 */
export const EMPTY_MCP_POLICY_STATE: McpPolicyState = Object.freeze({
	enabled: false,
	bindings: {},
	policies: {},
	proposals: {},
	auditEntries: [],
	vaultDefaultMode: 'strict_review',
	schemaVersion: MCP_POLICY_STATE_SCHEMA_VERSION,
});

/** A possibly-partial persisted MCP slice (a vault persisted before a field existed round-trips here). */
export type PersistedMcpPolicyState = Partial<McpPolicyState>;

/** Narrow a persisted vault default to a SAFE default, collapsing anything else to `strict_review`. */
function ensureVaultDefaultMode(value: unknown): McpVaultDefaultMode {
	return value === 'disabled' ? 'disabled' : 'strict_review';
}

/** Hydrate one binding fail-closed: keep only the shape; never invent an actor. */
function ensureBinding(binding: McpAgentBinding): McpAgentBinding {
	return {
		agentId: binding.agentId,
		actorId: binding.actorId,
		label: binding.label ?? '',
		createdBy: binding.createdBy,
		createdAt: binding.createdAt,
		updatedAt: binding.updatedAt ?? binding.createdAt,
		revision: typeof binding.revision === 'number' ? binding.revision : 0,
	};
}

/**
 * Hydrate one policy fail-closed: an UNKNOWN/under-scoped persisted mode collapses to the MOST
 * RESTRICTIVE (`disabled`), and a missing/invalid allowlist becomes the empty (deny-all) list. A corrupt
 * policy can therefore never restore into a more-permissive state than the DM authored.
 */
function ensurePolicy(policy: McpAgentPolicy): McpAgentPolicy {
	return {
		agentId: policy.agentId,
		mode: isMcpPolicyMode(policy.mode) ? policy.mode : 'disabled',
		allowedToolIds: Array.isArray(policy.allowedToolIds)
			? policy.allowedToolIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
			: [],
		auditVisible: policy.auditVisible !== false,
		createdBy: policy.createdBy,
		createdAt: policy.createdAt,
		updatedAt: policy.updatedAt ?? policy.createdAt,
		revision: typeof policy.revision === 'number' ? policy.revision : 0,
	};
}

/**
 * Hydrate one proposal fail-closed: a proposal persisted in a non-terminal `pending` state stays pending
 * (the DM must still review it), but an UNKNOWN status collapses to `rejected` so a corrupt record can
 * never restore as committable. The captured command/payload are preserved verbatim for re-validation.
 */
function ensureProposal(proposal: McpStagedProposal): McpStagedProposal | null {
	if (!proposal.id || !proposal.commandType) return null;
	const status: McpProposalStatus =
		proposal.status === 'pending' ||
		proposal.status === 'approved' ||
		proposal.status === 'rejected' ||
		proposal.status === 'expired'
			? proposal.status
			: 'rejected';
	return {
		id: proposal.id,
		agentId: proposal.agentId,
		actorId: proposal.actorId,
		toolId: proposal.toolId,
		commandType: proposal.commandType,
		payload: proposal.payload,
		policyMode: isMcpPolicyMode(proposal.policyMode) ? proposal.policyMode : 'disabled',
		writeRisk: proposal.writeRisk === 'low-risk' ? 'low-risk' : 'durable',
		...(proposal.idempotencyKey !== undefined ? { idempotencyKey: proposal.idempotencyKey } : {}),
		status,
		createdAt: proposal.createdAt,
		resolvedAt: proposal.resolvedAt ?? null,
		resolvedBy: proposal.resolvedBy ?? null,
	};
}

/** Tolerantly hydrate a possibly-undefined/partial persisted MCP slice (safe, fail-closed defaults). */
export function ensureMcpPolicyState(state: PersistedMcpPolicyState | undefined): McpPolicyState {
	const bindings: Record<string, McpAgentBinding> = {};
	for (const [id, binding] of Object.entries(state?.bindings ?? {})) {
		bindings[id] = ensureBinding(binding as McpAgentBinding);
	}
	const policies: Record<string, McpAgentPolicy> = {};
	for (const [id, policy] of Object.entries(state?.policies ?? {})) {
		policies[id] = ensurePolicy(policy as McpAgentPolicy);
	}
	const proposals: Record<string, McpStagedProposal> = {};
	for (const [id, proposal] of Object.entries(state?.proposals ?? {})) {
		const ensured = ensureProposal(proposal as McpStagedProposal);
		if (ensured) proposals[id] = ensured;
	}
	const auditEntries: McpAuditEntry[] = Array.isArray(state?.auditEntries)
		? state.auditEntries.filter((e): e is McpAuditEntry => Boolean(e && e.id))
		: [];
	return {
		// MCP-001 — fail closed to OFF: ONLY a persisted literal `true` enables MCP. An absent flag (an older
		// vault that predates the master switch) or any other value restores with MCP DISABLED, so a vault can
		// never silently come back with agent access turned on.
		enabled: state?.enabled === true,
		bindings,
		policies,
		proposals,
		auditEntries,
		vaultDefaultMode: ensureVaultDefaultMode(state?.vaultDefaultMode),
		schemaVersion: MCP_POLICY_STATE_SCHEMA_VERSION,
	};
}

/**
 * MCP-001 — whether the vault-wide MCP integration is ENABLED. The single, non-leaking predicate every
 * surface reads to decide whether MCP exists at all: the agent dispatch master-gates on it, and the GUI
 * uses it to absent/disable MCP navigation + agent commands (a disabled answer reveals nothing about
 * agents, policies, or proposals — it is just `false`). Fail closed: a slice without the flag reads off.
 */
export function isMcpEnabled(state: McpPolicyState): boolean {
	return state.enabled === true;
}

/** Look up an agent binding by agent id, or undefined. Pure. */
export function mcpBindingByAgentId(state: McpPolicyState, agentId: string): McpAgentBinding | undefined {
	return state.bindings[agentId];
}

/** Look up an agent policy by agent id, or undefined. Pure. */
export function mcpPolicyByAgentId(state: McpPolicyState, agentId: string): McpAgentPolicy | undefined {
	return state.policies[agentId];
}

/** Look up a staged proposal by id, or undefined. Pure. */
export function mcpProposalById(state: McpPolicyState, proposalId: string): McpStagedProposal | undefined {
	return state.proposals[proposalId];
}
