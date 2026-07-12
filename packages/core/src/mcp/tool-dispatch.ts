import type { z } from 'zod';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from '../commands/types';
import { dispatchCommand } from '../commands/dispatch';
import type { McpToolDefinition, McpToolRegistry } from './tool-registry';
import { getContentItemsForActor, getContentItemDetailForActor } from '../queries/content-query';
import { listCharactersForActor } from '../queries/character-query';
import { searchVaultForActor } from '../queries/search-query';
import { getGraphRelationships } from '../queries/graph-api';
import { getPrepRecapDigest } from '../queries/prep-recap-digest';
import { rollExpression } from '../state/dice';
import {
	buildSemanticBundle,
	type SemanticBundleKind,
} from './semantic-bundles';

/**
 * MCP-004 / MCP-011 (composition seam) — the SINGLE, FAIL-CLOSED ENTRY POINT for every MCP tool call.
 *
 * This is the security keystone of the MCP surface. An MCP agent NEVER reads or writes the vault
 * directly; it submits a {@link McpToolInvocation} and `invokeMcpTool` enforces, IN ORDER and each
 * gate fail-closed, the SAME Processing-Core enforcement a human actor gets — with NO privileged
 * side-channel:
 *
 *   1. UNKNOWN TOOL → deny. A tool id not in the registry allowlist is rejected before anything runs
 *      (there is no default tool). MCP-004: a tool can only do what the registry declares.
 *   2. UNDER-SCOPED / UNKNOWN ACTOR → deny. The agent acts through a SCOPED vault actor id. If that
 *      actor is not a registered participant, the call is rejected before any query/command runs —
 *      the same fail-closed posture every actor-filtered query already takes (an unknown actor reads
 *      nothing). This is the seam the MCP-011 identity mapping plugs into: this branch enforces that
 *      a tool call carries a resolvable actor; MCP-011 decides HOW the agent connection maps to one.
 *   3. SCHEMA VALIDATION → deny. The tool input must satisfy the tool's declared Zod schema. A write
 *      that fails schema validation accepts NO staged or direct durable mutation (MCP-004 AC2); a
 *      read with bad input never runs the query.
 *   4. ROUTE. A READ tool composes the EXISTING actor-filtered query (so visibility/redaction are
 *      enforced by the data layer BEFORE the agent sees anything — MCP-004 AC1: a non-DM agent
 *      reading character data gets hidden fields omitted by the query, not by the tool). A WRITE tool
 *      dispatches the bound command through {@link dispatchCommand} (so it inherits the command's
 *      validation, authority/permission checks, op-logging, and visibility — never a bypass).
 *
 * The agent identity is carried THROUGH every composed call as the `actorId`: a player-scoped agent
 * is filtered exactly like a player; a DM-scoped agent like the DM. There is no "MCP can see more"
 * path. Pure + deterministic: the same (state, env, registry, invocation) always yields the same
 * result envelope. Per ADR-014 the MCP transport is deferred; this composes only Processing-Core
 * surfaces and performs no I/O.
 */

/** One MCP tool call: which tool, acting as which vault actor, with what (unvalidated) input. */
export interface McpToolInvocation {
	/** The tool the agent is calling. An id not in the registry is denied (fail closed). */
	toolId: string;
	/** The SCOPED vault actor the agent acts as. Filtered exactly like that human actor. */
	actorId: string;
	/** The agent connection id, recorded for audit only. NEVER widens scope or visibility. */
	agentId: string;
	/** The raw tool-call arguments, validated against the tool's schema before anything runs. */
	input: unknown;
	/** Optional idempotency key forwarded to a write command's dispatch (idempotent replays). */
	idempotencyKey?: string;
}

/** Why an MCP tool call was denied at the policy layer, BEFORE any query/command ran. */
export type McpDenyReason =
	/** The tool id is not in the registry allowlist. */
	| 'unknown-tool'
	/** The acting actor id is not a registered vault participant (under-scoped / forged). */
	| 'unknown-actor'
	/** The tool input failed the tool's declared schema. */
	| 'invalid-input';

/**
 * MCP-010-shaped (minimal) structured RESULT ENVELOPE. Every tool call returns one of these — never a
 * thrown value, never raw state. The envelope separates status from data and carries NO hidden data:
 *
 *   - `denied`: a policy-layer denial (gates 1–3). `reason` is the machine code; `message` is generic
 *     and reveals nothing about whether a hidden entity exists (an under-scoped actor and a forged
 *     actor both read "unknown-actor"). No query/command ran.
 *   - `read-ok`: a read tool returned the actor-filtered query result as `data`.
 *   - `write`: a write tool dispatched its command; `commandResult` is the raw, unmodified
 *     {@link CommandResult} (accepted / rejected) — so the agent sees the SAME accept/reject the GUI
 *     would, including the structured rejection on a schema/authority/visibility failure.
 */
export type McpToolResult =
	| {
			status: 'denied';
			toolId: string;
			reason: McpDenyReason;
			message: string;
			/** Per-field schema issues, present only for an `invalid-input` denial. */
			issues?: Array<{ path: string; message: string }>;
	  }
	| {
			status: 'read-ok';
			toolId: string;
			/** The actor-filtered query result. Already visibility-redacted by the composed query. */
			data: unknown;
	  }
	| {
			status: 'write';
			toolId: string;
			/** The unmodified command dispatch result (accepted with op ids, or a structured rejection). */
			commandResult: CommandResult;
	  };

function deny(
	toolId: string,
	reason: McpDenyReason,
	message: string,
	issues?: Array<{ path: string; message: string }>,
): McpToolResult {
	return issues ? { status: 'denied', toolId, reason, message, issues } : { status: 'denied', toolId, reason, message };
}

/** Validate the tool input against the tool's declared schema, mapping a failure to per-field issues. */
function parseToolInput(
	schema: z.ZodType,
	input: unknown,
): { ok: true; data: unknown } | { ok: false; issues: Array<{ path: string; message: string }> } {
	const result = schema.safeParse(input);
	if (result.success) return { ok: true, data: result.data };
	return {
		ok: false,
		issues: result.error.issues.map((issue) => ({
			path: issue.path.map(String).join('.') || '(root)',
			message: issue.message,
		})),
	};
}

/**
 * Route a READ tool to its EXISTING actor-filtered query. Each branch passes the agent's `actorId`
 * straight through, so the query's own visibility filtering decides what the agent sees — a player-
 * scoped agent never receives a `dm-only` field/entity (MCP-004 AC1). The tool never touches raw
 * state; it reads the computed, redacted model the rest of the app reads.
 */
function runReadTool(
	state: CoreStateSlice,
	tool: Extract<McpToolDefinition, { kind: 'read' }>,
	actorId: string,
	input: unknown,
): unknown {
	switch (tool.queryId) {
		case 'content.items':
			// vault.summary / note.list — the actor-filtered content list (hidden notes omitted entirely).
			return getContentItemsForActor(state.content, state.permissions, actorId);
		case 'content.item-detail': {
			// note.read — the granular actor-filtered note detail (dm-only sections/fields omitted).
			const { entityId } = input as { entityId: string };
			const detail = getContentItemDetailForActor(state.content, state.permissions, actorId, entityId);
			// PERM-010 AC2: strip the DM-facing `accessDenialAudit` before returning to the requesting
			// agent. The audit record carries the precise denial reason (`not-visible`, etc.), which must
			// never reach a non-DM actor — the public denial is already indistinguishable from not-found.
			if ('accessDenialAudit' in detail) {
				const { accessDenialAudit: _, ...publicDetail } = detail;
				return publicDetail;
			}
			return detail;
		}
		case 'search.vault': {
			// note.search — the actor-filtered vault search (every candidate is an actor-filtered read,
			// so hidden artifacts are omitted AND never revealed by an inflated count). The agent-facing
			// `limit` only BOUNDS the returned hits (it cannot widen the visible set); the underlying
			// `totalCount` still reflects all visible matches.
			const { query, limit } = input as { query: string; limit?: number };
			const result = searchVaultForActor(
				state.content,
				state.maps,
				state.permissions,
				state.session,
				actorId,
				{ query },
			);
			if (limit === undefined || result.hits.length <= limit) return result;
			return { ...result, hits: result.hits.slice(0, limit) };
		}
		case 'graph.context': {
			const { nodeId } = input as { nodeId: string };
			// graph.context — the source-agnostic graph relationships, marked as an `mcp` consumer for
			// audit (the consumer kind NEVER widens visibility — a hidden node yields the empty result).
			return getGraphRelationships(
				state.content,
				state.maps,
				state.session,
				state.permissions,
				actorId,
				nodeId,
				'mcp',
			);
		}
		case 'character.list':
			// character.query — the actor-filtered character roster (hidden NPCs omitted; dm-only fields
			// stripped). MCP-004 AC1 keystone: a non-DM agent never receives a hidden character field.
			return listCharactersForActor(state.characters, state.permissions, actorId);
		case 'dice.roll': {
			// dice.roll — the PURE, deterministic dice engine (SES-003). It reads NO vault state, so there is
			// nothing to visibility-filter; the actor is irrelevant to the result. The agent's seed makes the
			// roll reproducible, and a malformed expression returns a structured parse error fail-closed (the
			// roll is never silently produced). The envelope carries the recorded result or the parse error.
			const { expression, seed } = input as { expression: string; seed: number | string };
			const rolled = rollExpression(expression, seed);
			return rolled.ok ? { ok: true, result: rolled.result } : { ok: false, error: rolled.error };
		}
		case 'session.prep-digest': {
			// session.prep — the DM-facing prep/recap bundle (SES-009), composed from the ALREADY actor-filtered
			// digest. A non-DM actor receives an EMPTY digest (no prep/recap content, no hidden source data —
			// MCP-002 AC2), so the agent inherits the same DM-only fail-closed gate a human gets.
			const { mode } = input as { mode: 'prep' | 'recap' };
			return getPrepRecapDigest(
				state.session,
				state.content,
				state.maps,
				state.characters,
				state.permissions,
				state.sync,
				actorId,
				mode,
			);
		}
		case 'bundle.session-prep':
		case 'bundle.session-recap':
		case 'bundle.continuity':
		case 'bundle.open-threads':
		case 'bundle.coverage-gaps':
		case 'bundle.campaign-health': {
			// SEMANTIC BUNDLES (MCP-006 / MCP-013) — the bounded, source-cited, calendar-aware context package.
			// Composed from the SAME actor-filtered deterministic reads, so a non-DM agent receives the
			// generalized, finding-free bundle (MCP-006 AC1 / MCP-013 AC2). An agent requests only the
			// DETERMINISTIC bundle: AI is the GUI/sidecar's optional seam, never an agent-toggled argument, so
			// no AI capability/annotator is forwarded here and no AI call is ever load-bearing for a tool read.
			const { referenceInstant, itemBudget } = input as {
				referenceInstant: string;
				itemBudget?: number;
			};
			// The bundle kind is the queryId suffix (`bundle.<kind>`); the registry guarantees a known suffix.
			const kind = tool.queryId.slice('bundle.'.length) as SemanticBundleKind;
			return buildSemanticBundle(
				{
					session: state.session,
					content: state.content,
					maps: state.maps,
					characters: state.characters,
					permissions: state.permissions,
					sync: state.sync,
					actorId,
				},
				kind,
				{ referenceInstant, ...(itemBudget !== undefined ? { itemBudget } : {}) },
			);
		}
		default:
			// Defensive: a registered read tool whose queryId is unrouted reads NOTHING (fail closed).
			// Unreachable for the baseline registry; guards a future tool added without a route.
			return null;
	}
}

/**
 * Map the (already schema-validated) write-tool input to the bound command payload. Returns the
 * payload the command's OWN validator will re-check. Centralized here so a write tool can never
 * smuggle a field the command does not accept, and so visibility-widening fields are never forwarded
 * (the note-create tool does NOT pass a visibility, so the command defaults it fail-closed).
 */
function writeCommandPayload(
	tool: Extract<McpToolDefinition, { kind: 'write' }>,
	input: unknown,
): unknown {
	switch (tool.commandType) {
		case 'content.create-item': {
			const { title, body, kind } = input as { title: string; body: string; kind: 'note' | 'object' };
			// Only the agent-safe fields cross over. No `visibility` ⇒ the command fails closed to
			// `dm-only`, so an agent can never publish content to players by a tool call alone.
			return { kind, title, body };
		}
		case 'scene-card.create': {
			const { title, mood, flavorText } = input as {
				title: string;
				mood: string;
				flavorText: string;
			};
			// Agent-safe presentation fields only. No `visibility` ⇒ the card fails closed to `dm-only`
			// (never pushed to players); no hero-image/audio refs (an agent cannot bind vault assets).
			return { title, mood, flavorText };
		}
		default:
			// A registered write tool with an unmapped command forwards its raw input; the command's
			// own validator still re-checks it fail-closed. Unreachable for the baseline registry.
			return input;
	}
}

/**
 * MCP-004 — invoke an MCP tool through the Processing Core, fail closed. See the module doc for the
 * gate order. Returns a structured {@link McpToolResult}; it NEVER throws for a denied/rejected call.
 *
 * For a WRITE, the returned `commandResult` is the UNMODIFIED dispatch result, so an accepted write
 * carries the durable op ids (it went through op-logging) and a rejected write carries the structured
 * rejection (schema/authority/visibility) — proving the mutation inherited full command enforcement.
 */
export function invokeMcpTool(
	state: CoreStateSlice,
	env: CoreEnvironment,
	registry: McpToolRegistry,
	invocation: McpToolInvocation,
): McpToolResult {
	// Gate 1 — UNKNOWN TOOL. Not in the allowlist ⇒ deny before anything runs.
	const tool = registry.get(invocation.toolId);
	if (!tool) {
		return deny(invocation.toolId, 'unknown-tool', `Tool "${invocation.toolId}" is not available.`);
	}

	// Gate 2 — UNDER-SCOPED / UNKNOWN / FORGED ACTOR. The agent must act as a registered vault actor.
	// An unregistered (forged or under-scoped) actor is denied with a GENERIC message before any
	// query/command runs — the same fail-closed posture the queries take, surfaced explicitly here so
	// a forged-id probe cannot even reach the (already-safe) query layer.
	if (!state.permissions.actors[invocation.actorId]) {
		return deny(invocation.toolId, 'unknown-actor', 'The acting actor is not a registered participant.');
	}

	// Gate 3 — SCHEMA VALIDATION. The tool input must satisfy the declared schema. Fail closed.
	const parsed = parseToolInput(tool.inputSchema, invocation.input);
	if (!parsed.ok) {
		return deny(invocation.toolId, 'invalid-input', `Input for "${invocation.toolId}" failed validation.`, parsed.issues);
	}

	// Gate 4 — ROUTE. Reads compose the actor-filtered query; writes dispatch the bound command.
	if (tool.kind === 'read') {
		const data = runReadTool(state, tool, invocation.actorId, parsed.data);
		return { status: 'read-ok', toolId: tool.id, data };
	}

	const payload = writeCommandPayload(tool, parsed.data);
	const commandResult = dispatchCommand(state, env, {
		type: tool.commandType,
		actorId: invocation.actorId,
		payload,
		...(invocation.idempotencyKey !== undefined ? { idempotencyKey: invocation.idempotencyKey } : {}),
	} as Parameters<typeof dispatchCommand>[2]);
	return { status: 'write', toolId: tool.id, commandResult };
}
