import type { McpPolicyMode } from '../state/mcp-policy';
import type { McpResolvedIdentity } from './identity';
import type { McpToolDefinition } from './tool-registry';

/**
 * MCP-009 / MCP-003 — the PURE POLICY DECISION that turns a resolved agent identity + a tool into a
 * single, fail-closed verdict. It composes ONTO the existing `McpWriteRisk` seam the prior epic left on
 * each write tool (`tool-registry.ts`) — the staged/direct decision is computed HERE without re-declaring
 * the tool surface. No I/O, no state mutation: the same (identity, tool) always yields the same verdict.
 *
 * The decision is layered most-restrictive-first, so it can never fail open:
 *
 *   1. DISABLED mode (MCP-009 AC3) → the agent may do NOTHING. Every call (read or write) returns
 *      `disabled` BEFORE any core query/command runs. The most restrictive verdict.
 *   2. ALLOWLIST (MCP-009) → a tool NOT in the agent's allowlist is `not-allowlisted`. There is no
 *      implicit "all tools"; an unconfigured agent's empty allowlist denies everything.
 *   3. READ tool → `allow-read`. The read is then routed through the EXISTING actor-filtered query, so
 *      visibility/redaction are still enforced by the data layer (MCP-004) for the bound actor.
 *   4. WRITE tool → the STAGED/DIRECT decision by mode (MCP-003):
 *        - `strict_review` → ALWAYS `stage` (every write staged for human approval — MCP-003 default).
 *        - `balanced`      → `stage`; a `low-risk` write is marked BATCHABLE (a `durable` write is not),
 *          so the GUI can offer a single approve/reject of the batch (MCP-003 AC3) while durable writes
 *          still require explicit approval.
 *        - `trusted_direct`→ `direct` ONLY for an allowlisted write (it already passed the allowlist gate);
 *          the direct write still goes through Processing Core validation + audit (MCP-009 AC4). (A
 *          non-allowlisted tool was already denied at step 2, so `trusted_direct` never bypasses the list.)
 *
 * Crucially, even a `direct` verdict is NOT a bypass: the caller still dispatches the bound command
 * through `dispatchCommand`, which re-runs the command's own authority/schema/visibility checks. The
 * verdict only chooses STAGE vs DIRECT vs DENY; it never confers authority.
 */

/** Why a tool call was denied by the policy layer, BEFORE any core query/command ran. */
export type McpPolicyDenyReason =
	/** The agent's policy mode is `disabled` (MCP-009 AC3). */
	| 'disabled'
	/** The tool is not in the agent's tool allowlist (MCP-009). */
	| 'not-allowlisted';

/**
 * The policy verdict for a tool call. A write verdict carries the chosen mode plus whether the staged
 * write is BATCHABLE (a `balanced` low-risk write), which the GUI uses to group a batch approval.
 */
export type McpPolicyDecision =
	| { kind: 'denied'; reason: McpPolicyDenyReason }
	| { kind: 'allow-read' }
	| { kind: 'stage'; batchable: boolean }
	| { kind: 'direct' };

/** Whether a tool id is in an agent's allowlist. An empty allowlist denies everything (fail closed). */
export function isToolAllowlisted(
	identity: Pick<McpResolvedIdentity, 'allowedToolIds'>,
	toolId: string,
): boolean {
	return identity.allowedToolIds.includes(toolId);
}

/**
 * MCP-009 / MCP-003 — decide the verdict for one tool call by a resolved agent. Fail closed at every
 * layer; see the module doc for the full decision table. The READ vs WRITE split reads the tool's
 * declared `kind`/`writeRisk` (the registry seam) — the decision never re-declares the tool.
 */
export function decidePolicy(
	identity: McpResolvedIdentity,
	tool: McpToolDefinition,
): McpPolicyDecision {
	// 1 — DISABLED: nothing runs (MCP-009 AC3). Most restrictive; checked first.
	if (identity.policyMode === 'disabled') {
		return { kind: 'denied', reason: 'disabled' };
	}
	// 2 — ALLOWLIST: a tool outside the agent's allowlist is denied before any query/command (MCP-009).
	if (!isToolAllowlisted(identity, tool.id)) {
		return { kind: 'denied', reason: 'not-allowlisted' };
	}
	// 3 — READ: allow; the actor-filtered query enforces visibility downstream (MCP-004).
	if (tool.kind === 'read') {
		return { kind: 'allow-read' };
	}
	// 4 — WRITE: stage vs direct by mode (MCP-003).
	return decideWrite(identity.policyMode, tool.writeRisk);
}

/**
 * The write-only sub-decision (MCP-003), separated so the staged-write contract is readable in one place.
 * `strict_review`/`balanced` always STAGE; `trusted_direct` commits DIRECTLY (the tool already passed the
 * allowlist gate). A `balanced` low-risk write is marked batchable for a single approve/reject (AC3).
 */
function decideWrite(
	mode: McpPolicyMode,
	writeRisk: 'low-risk' | 'durable',
): McpPolicyDecision {
	switch (mode) {
		case 'strict_review':
			// Every write staged for human approval — the MCP-003 default posture. Not batched.
			return { kind: 'stage', batchable: false };
		case 'balanced':
			// Low-risk staged writes are batchable for one approve/reject; durable writes are not (AC3).
			return { kind: 'stage', batchable: writeRisk === 'low-risk' };
		case 'trusted_direct':
			// Allowlisted direct write; still goes through Processing Core validation + audit (AC4).
			return { kind: 'direct' };
		case 'disabled':
			// Unreachable (step 1 already returned), but keep the switch exhaustive + fail-closed.
			return { kind: 'denied', reason: 'disabled' };
	}
}
