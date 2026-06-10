import type { PermissionState } from '../state/permission-state';
import type {
	McpAgentBinding,
	McpAgentPolicy,
	McpPolicyMode,
	McpPolicyState,
} from '../state/mcp-policy';

/**
 * MCP-011 — the FAIL-CLOSED AGENT-CONNECTION → SCOPED-VAULT-ACTOR IDENTITY RESOLUTION.
 *
 * This is the gate the entire MCP identity contract rests on: BEFORE any tool can read or stage data,
 * an agent connection must resolve to an AUTHENTICATED vault actor, session role, policy profile, and
 * audit identity. It resolves all four together, fail closed, and NEVER fabricates or widens any of them:
 *
 *   - An agent with NO binding → no actor → DENY (an unmapped/unknown connection resolves to nothing).
 *   - A binding whose actor is NOT a registered participant → DENY (a stale/forged binding cannot
 *     conjure an actor; the actor must exist in {@link PermissionState} at resolve time).
 *   - A resolved agent's ROLE is exactly its bound actor's role — it can never resolve to MORE authority
 *     than that actor. The downstream Processing Core then filters/permission-gates the agent EXACTLY
 *     like that human actor; there is no "MCP can see more" path.
 *
 * The resolution is pure: the same (permissions, policy, connection) always yields the same identity.
 * The POLICY MODE comes from the per-agent policy (or the vault default for a bound-but-unconfigured
 * agent); an unknown/under-scoped mode is collapsed to the most restrictive by {@link resolvePolicyMode}.
 */

/** Why an agent connection failed to resolve to a scoped identity (fail closed, BEFORE any tool runs). */
export type McpIdentityDenyReason =
	/** The agent connection has no binding to a vault actor (unmapped / unknown agent). */
	| 'no-binding'
	/** The bound actor is not a registered vault participant (stale / forged binding). */
	| 'unknown-actor';

/**
 * A fully-resolved MCP agent identity. Carrying the actor id, role, policy mode, and audit-visibility
 * flag together means every downstream gate (read filtering, staged-write decision, audit) reads ONE
 * authenticated identity — never a re-derived or widened one.
 */
export interface McpResolvedIdentity {
	agentId: string;
	/** The SCOPED vault actor this agent acts as. Filtered exactly like that actor downstream. */
	actorId: string;
	/** The bound actor's session role. The agent can never exceed this. */
	role: PermissionState['actors'][string]['role'];
	/** The resolved policy mode governing what this agent may do (fail closed to most-restrictive). */
	policyMode: McpPolicyMode;
	/** The per-agent allowlist of tool ids; a tool outside it is denied (fail closed). */
	allowedToolIds: readonly string[];
	/** Whether this agent's writes are recorded in audit history. */
	auditVisible: boolean;
}

export type McpIdentityResolution =
	| { ok: true; identity: McpResolvedIdentity }
	| { ok: false; reason: McpIdentityDenyReason };

/**
 * Resolve the effective POLICY MODE for a (possibly unconfigured) agent, fail closed (MCP-009 AC1):
 *
 *   - A bound agent with a configured policy uses that policy's mode (already hydrated fail-closed).
 *   - A bound agent with NO policy inherits the VAULT DEFAULT (`strict_review` or `disabled`) — a new
 *     agent is never silently more permissive than the vault posture.
 *
 * The policy's mode is already narrowed to a declared {@link McpPolicyMode} on hydration, so an unknown
 * persisted mode has already collapsed to `disabled` before it reaches here.
 */
export function resolvePolicyMode(
	policy: McpAgentPolicy | undefined,
	vaultDefaultMode: McpPolicyMode,
): McpPolicyMode {
	if (!policy) return vaultDefaultMode;
	return policy.mode;
}

/**
 * MCP-011 — resolve an agent CONNECTION to a scoped vault identity, or deny fail closed.
 *
 * Order (each step fail-closed):
 *   1. The agent must have a BINDING. No binding ⇒ `no-binding` (unmapped/unknown agent).
 *   2. The bound actor must be a REGISTERED participant. Missing ⇒ `unknown-actor` (stale/forged binding).
 *   3. Resolve the agent's role from the actor (never widened) and its policy mode from the per-agent
 *      policy or the vault default. The allowlist + audit-visibility come from the policy (or the safe
 *      defaults: an unconfigured bound agent has an EMPTY allowlist, so it may invoke NOTHING until the
 *      DM configures it — fail closed).
 */
export function resolveAgentIdentity(
	permissions: PermissionState,
	mcp: McpPolicyState,
	agentId: string,
): McpIdentityResolution {
	const binding: McpAgentBinding | undefined = mcp.bindings[agentId];
	if (!binding) {
		return { ok: false, reason: 'no-binding' };
	}
	const actor = permissions.actors[binding.actorId];
	if (!actor) {
		return { ok: false, reason: 'unknown-actor' };
	}
	const policy = mcp.policies[agentId];
	return {
		ok: true,
		identity: {
			agentId,
			actorId: actor.id,
			role: actor.role,
			policyMode: resolvePolicyMode(policy, mcp.vaultDefaultMode),
			// Fail closed: a bound-but-unconfigured agent has NO allowlisted tools (it may invoke nothing
			// until the DM grants a policy). A configured agent uses its explicit allowlist.
			allowedToolIds: policy?.allowedToolIds ?? [],
			auditVisible: policy?.auditVisible ?? true,
		},
	};
}
