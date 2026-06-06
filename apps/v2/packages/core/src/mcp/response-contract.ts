import { z } from 'zod';
import { containsSensitiveData } from '../diagnostics/redaction';
import type { CommandResult } from '../commands/types';
import type { McpToolResult } from './tool-dispatch';
import type { McpAgentToolResult } from './agent-dispatch';

/**
 * MCP-010 — the STABLE, VERSIONED, SCHEMA-VALIDATED MCP/AI RESPONSE CONTRACT.
 *
 * Every MCP/AI tool already returns a structured envelope (`McpToolResult` from `tool-dispatch.ts`,
 * `McpAgentToolResult` from `agent-dispatch.ts`): a `denied`/`agent-denied` policy outcome, a
 * `read-ok` payload, a `write` command result, or a `staged` proposal. Those envelopes are the
 * INTERNAL routing shapes — they differ by tool kind and carry raw `CommandResult`/`unknown` data.
 *
 * MCP-010 FORMALIZES the OUTWARD contract those envelopes are projected into before they leave the
 * Processing Core to an agent: ONE stable, concise, machine-checkable shape with `id`, `status`,
 * `summary`, `data`, `warnings`, `citations`, and `remediation` (the exact fields the requirement
 * names), with warnings/data SEPARATED and errors STRUCTURED + NON-LEAKING. This module does NOT
 * duplicate the dispatch layer or invent a parallel result type — it COMPOSES onto the existing
 * envelopes:
 *
 *   - {@link toMcpResponseEnvelope} / {@link toMcpAgentResponseEnvelope} project an existing
 *     `McpToolResult` / `McpAgentToolResult` into the stable contract. A success with warnings keeps
 *     `warnings` and `data` in SEPARATE fields (MCP-010 AC1); a failure becomes a STRUCTURED, actionable
 *     error envelope that embeds NO hidden data (MCP-010 AC2).
 *   - {@link MCP_RESPONSE_ENVELOPE_SCHEMA} is the Zod contract every envelope is validated against,
 *     reconciled with the registry's existing Zod usage rather than a hand-rolled type guard.
 *   - {@link certifyMcpResponse} is the FAIL-CLOSED GATE: it validates an envelope against the
 *     declared contract AND scans it for leaks (raw paths / auth-token-shaped secrets, via the shared
 *     diagnostics redaction guard) BEFORE it is returned. An internally MALFORMED or LEAKY envelope is
 *     REPLACED with a safe, contract-conformant error envelope — never passed through. A response can
 *     therefore only ever leave the core if it conforms to its declared contract.
 *
 * The contract is VERSIONED ({@link MCP_RESPONSE_CONTRACT_VERSION}) and DETERMINISTIC: the same input
 * envelope always projects to the same response (the envelope `id` is supplied by the caller's env, not
 * generated here, so projection itself is pure). Per ADR-014 the MCP transport is deferred; this is the
 * pure Processing-Core contract the future sidecar serializes — it performs no I/O.
 */

/**
 * The contract version. Bumped only on a BREAKING envelope-shape change. It rides every envelope so a
 * consumer can fail closed on an unsupported future version rather than partial-parse (mirrors the
 * sync payload-versioning stance — "unsupported future versions fail closed").
 */
export const MCP_RESPONSE_CONTRACT_VERSION = 1 as const;

/**
 * The outward STATUS of an MCP response. Deliberately COARSER than the internal routing union: an agent
 * consumer cares whether the call succeeded, was denied, staged for review, or failed — not which of the
 * internal `denied`/`agent-denied`/`write`-rejected shapes produced it. The four states are stable.
 *
 *   - `ok`      — the tool succeeded; `data` carries the (already actor-filtered) result.
 *   - `staged`  — a write was captured as a pending proposal awaiting human approval (no mutation yet).
 *   - `denied`  — the call was denied by an optionality/identity/policy/schema gate before it ran.
 *   - `error`   — the call ran but the bound command was rejected (schema/authority/visibility, etc.).
 */
export const MCP_RESPONSE_STATUSES = ['ok', 'staged', 'denied', 'error'] as const;
export type McpResponseStatus = (typeof MCP_RESPONSE_STATUSES)[number];

/**
 * A single, machine-readable diagnostic carried in `warnings`. It is SEPARATE from `data` (MCP-010 AC1)
 * and from the terminal error: a successful response can still carry warnings (e.g. a result was bounded
 * by a limit) without the call being a failure. `code` is a stable token; `message` is a generic,
 * non-leaking human string.
 */
export interface McpResponseWarning {
	code: string;
	message: string;
}

/**
 * A bounded SOURCE CITATION (MCP-010). It references WHERE a datum came from by stable id/kind only —
 * never the cited entity's content/title/value — so a citation can never become a leak side-channel
 * for hidden data. The `ref` is an opaque entity id the agent already has visibility to (the data it
 * cites was actor-filtered upstream).
 */
export interface McpResponseCitation {
	/** The kind of source the datum is attributed to (e.g. `note`, `map`, `character`, `tool`). */
	kind: string;
	/** A stable, opaque reference id for the source. Carries no content — id only. */
	ref: string;
}

/**
 * A REMEDIATION ACTION (MCP-010 "remediation actions where applicable"). It tells the agent/UI what to
 * do next when a call is denied/errored/staged — by a stable `action` token plus a generic `message`.
 * It never reveals WHY at a level that leaks hidden state (e.g. an unknown-actor denial remediation is
 * "ensure the agent is bound to a registered actor", not "actor X does not exist").
 */
export interface McpResponseRemediation {
	action: string;
	message: string;
}

/**
 * The STRUCTURED ERROR a `denied`/`error` response carries (MCP-010 AC2). It is structured + actionable
 * and embeds NO hidden data: `code` is the machine-readable reason (the existing deny/rejection codes),
 * `message` is a generic human string, and `issues` carries per-FIELD schema diagnostics ONLY (a field
 * path + a validation message — never an entity value). There is intentionally no `stack`, no internal
 * id, and no raw exception text field; an internal failure is mapped to a generic code here.
 */
export interface McpResponseError {
	code: string;
	message: string;
	/** Per-field schema issues (path + message only). Present only for an input-validation failure. */
	issues?: Array<{ path: string; message: string }>;
}

/**
 * THE STABLE MCP RESPONSE ENVELOPE (MCP-010). One shape for every tool, every status. `warnings` and
 * `data` are SEPARATE fields; the terminal `error` is separate from both. A `data`-bearing response
 * (`ok`) omits `error`; a `denied`/`error` response omits `data`. Every field below the discriminant is
 * present on every envelope (as `null`/`[]` when not applicable) so the shape is stable to parse.
 */
export interface McpResponseEnvelope {
	/** The contract version this envelope conforms to (fail-closed versioning). */
	contractVersion: typeof MCP_RESPONSE_CONTRACT_VERSION;
	/** A stable correlation id for the response (supplied by the caller — projection stays pure). */
	id: string;
	/** The tool the response is for (audit/routing). Carries no vault data. */
	toolId: string;
	/** The coarse outward status. */
	status: McpResponseStatus;
	/** A concise, generic, non-leaking human summary of the outcome. */
	summary: string;
	/** The actor-filtered result payload for a successful read/write. `null` when not applicable. */
	data: unknown;
	/** Warnings, SEPARATE from data (MCP-010 AC1). Empty when none. */
	warnings: McpResponseWarning[];
	/** Bounded source citations. Id/kind only — never content. Empty when none. */
	citations: McpResponseCitation[];
	/** Remediation actions where applicable (MCP-010). Empty when none. */
	remediation: McpResponseRemediation[];
	/** The structured, non-leaking error for a `denied`/`error` response. `null` for `ok`/`staged`. */
	error: McpResponseError | null;
}

// --- The Zod CONTRACT the envelope is validated against (machine-checkable, deterministic) ----------

const warningSchema = z
	.object({ code: z.string().min(1), message: z.string().min(1) })
	.strict();

const citationSchema = z
	.object({ kind: z.string().min(1), ref: z.string().min(1) })
	.strict();

const remediationSchema = z
	.object({ action: z.string().min(1), message: z.string().min(1) })
	.strict();

const errorSchema = z
	.object({
		code: z.string().min(1),
		message: z.string().min(1),
		issues: z
			.array(z.object({ path: z.string(), message: z.string() }).strict())
			.optional(),
	})
	.strict();

/**
 * The declared response contract as a Zod schema. `.strict()` everywhere rejects an EXTRA field — so a
 * tool that tries to smuggle an undeclared key onto its response fails the contract (it can never widen
 * the envelope). `contractVersion` is pinned to the supported literal so an unsupported version fails
 * closed. This is the single machine-checkable source of truth `certifyMcpResponse` validates against.
 */
export const MCP_RESPONSE_ENVELOPE_SCHEMA = z
	.object({
		contractVersion: z.literal(MCP_RESPONSE_CONTRACT_VERSION),
		id: z.string().min(1),
		toolId: z.string().min(1),
		status: z.enum(MCP_RESPONSE_STATUSES),
		summary: z.string().min(1),
		// `data` is opaque (already actor-filtered by the composed query); the contract validates its
		// PRESENCE and the envelope shape around it, not the data's internal schema.
		data: z.unknown(),
		warnings: z.array(warningSchema),
		citations: z.array(citationSchema),
		remediation: z.array(remediationSchema),
		error: errorSchema.nullable(),
	})
	.strict()
	// Cross-field invariants the flat schema cannot express: a terminal status MUST carry an error and
	// MUST NOT carry data; a non-terminal status MUST NOT carry an error. This is what makes the contract
	// guarantee "errors are structured" enforceable — an `error` status with a null error is rejected.
	.superRefine((envelope, ctx) => {
		const terminal = envelope.status === 'denied' || envelope.status === 'error';
		if (terminal && envelope.error === null) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['error'],
				message: 'A denied/error response must carry a structured error.',
			});
		}
		if (terminal && envelope.data !== null) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['data'],
				message: 'A denied/error response must not carry data.',
			});
		}
		if (!terminal && envelope.error !== null) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['error'],
				message: 'An ok/staged response must not carry an error.',
			});
		}
	});

// --- Generic, non-leaking summary + remediation text by status --------------------------------------

/** A generic remediation for a denial/error, keyed by the stable reason code. Never leaks internals. */
const REMEDIATION_BY_CODE: Record<string, McpResponseRemediation> = {
	'mcp-disabled': {
		action: 'enable-mcp',
		message: 'MCP is disabled for this vault. The DM must enable MCP before agents can act.',
	},
	'no-binding': {
		action: 'bind-agent',
		message: 'The agent connection is not bound to a vault actor. Bind it to a registered actor.',
	},
	'unknown-actor': {
		action: 'bind-agent',
		message: 'The agent is bound to an actor that is not a registered participant. Re-bind it.',
	},
	'unknown-tool': {
		action: 'use-listed-tool',
		message: 'The requested tool is not available. Use a tool from the agent tool list.',
	},
	disabled: {
		action: 'adjust-policy',
		message: 'This agent policy mode is disabled. The DM must grant a policy mode that permits tools.',
	},
	'not-allowlisted': {
		action: 'allowlist-tool',
		message: 'This tool is not in the agent allowlist. The DM must add it to the agent policy.',
	},
	'invalid-input': {
		action: 'fix-input',
		message: 'The tool input failed validation. Correct the reported fields and retry.',
	},
};

/** The fallback remediation for any error code without a specific entry (still generic + non-leaking). */
const GENERIC_REMEDIATION: McpResponseRemediation = {
	action: 'review-request',
	message: 'The request could not be completed. Review the request and retry, or contact the DM.',
};

/** A concise, generic summary line for a status (no vault data; safe to surface verbatim). */
function summaryForStatus(status: McpResponseStatus, toolId: string): string {
	switch (status) {
		case 'ok':
			return `Tool "${toolId}" completed successfully.`;
		case 'staged':
			return `Tool "${toolId}" was staged for human review.`;
		case 'denied':
			return `Tool "${toolId}" was denied by policy.`;
		case 'error':
			return `Tool "${toolId}" could not be completed.`;
	}
}

/** Build the remediation list for a terminal response from its reason code (always non-empty). */
function remediationForCode(code: string): McpResponseRemediation[] {
	return [REMEDIATION_BY_CODE[code] ?? GENERIC_REMEDIATION];
}

/** A base envelope with every field defaulted, so each projection only sets what it needs. */
function baseEnvelope(id: string, toolId: string, status: McpResponseStatus): McpResponseEnvelope {
	return {
		contractVersion: MCP_RESPONSE_CONTRACT_VERSION,
		id,
		toolId,
		status,
		summary: summaryForStatus(status, toolId),
		data: null,
		warnings: [],
		citations: [],
		remediation: [],
		error: null,
	};
}

/**
 * Project a `write` command result into the terminal half of a response. An ACCEPTED command becomes an
 * `ok` response whose `data` is the durable op ids (the agent's receipt that the write was logged) —
 * never the mutated entity's content. A REJECTED command becomes a structured `error` carrying the
 * command's own rejection code/message + per-field issues (so the agent sees the SAME structured reject
 * the GUI would), with NO `nextState`, no internal ids, and no exception text crossing over.
 */
function projectCommandResult(
	envelope: McpResponseEnvelope,
	result: CommandResult,
): McpResponseEnvelope {
	if (result.status === 'accepted') {
		return { ...envelope, status: 'ok', data: { operationIds: [...result.operationIds] } };
	}
	return {
		...envelope,
		status: 'error',
		summary: summaryForStatus('error', envelope.toolId),
		data: null,
		error: {
			code: result.rejection.code,
			message: result.rejection.message,
			...(result.rejection.issues ? { issues: result.rejection.issues } : {}),
		},
		remediation: remediationForCode(result.rejection.code),
	};
}

/**
 * MCP-010 — project a tool-level {@link McpToolResult} into the stable response contract. Pure: the
 * envelope `id` is supplied (not generated), so the same (result, id) always yields the same envelope.
 *
 *   - `denied`   → a structured `error` envelope (code/message/issues), with remediation. No data.
 *   - `read-ok`  → an `ok` envelope carrying the actor-filtered `data` (already redacted upstream).
 *   - `write`    → projected from the command result (accepted ⇒ op ids; rejected ⇒ structured error).
 */
export function toMcpResponseEnvelope(result: McpToolResult, id: string): McpResponseEnvelope {
	const base = baseEnvelope(id, result.toolId, 'ok');
	switch (result.status) {
		case 'denied':
			return {
				...base,
				status: 'denied',
				summary: summaryForStatus('denied', result.toolId),
				error: {
					code: result.reason,
					message: result.message,
					...(result.issues ? { issues: result.issues } : {}),
				},
				remediation: remediationForCode(result.reason),
			};
		case 'read-ok':
			return { ...base, status: 'ok', data: result.data };
		case 'write':
			return projectCommandResult(base, result.commandResult);
	}
}

/**
 * MCP-010 — project an AGENT-level {@link McpAgentToolResult} into the stable response contract. It
 * extends {@link toMcpResponseEnvelope} with the agent-only outcomes (optionality/identity/policy denial
 * and staging):
 *
 *   - `agent-denied` → a structured `denied` envelope with the policy reason code + remediation. No data.
 *   - `staged`       → a `staged` envelope carrying the proposal id as the agent's handle. No mutation.
 *   - otherwise      → delegated to {@link toMcpResponseEnvelope} (read/write/tool-level deny).
 */
export function toMcpAgentResponseEnvelope(
	result: McpAgentToolResult,
	id: string,
): McpResponseEnvelope {
	switch (result.status) {
		case 'agent-denied':
			return {
				...baseEnvelope(id, result.toolId, 'denied'),
				error: { code: result.reason, message: result.message },
				remediation: remediationForCode(result.reason),
			};
		case 'staged':
			return {
				...baseEnvelope(id, result.toolId, 'staged'),
				data: { proposalId: result.proposalId, batchable: result.batchable },
			};
		default:
			return toMcpResponseEnvelope(result, id);
	}
}

// --- The FAIL-CLOSED certification gate -------------------------------------------------------------

/** Why a candidate response failed certification (so the safe replacement names the cause for audit). */
export type McpResponseContractViolation =
	/** The envelope did not satisfy the declared Zod contract (missing/extra/mistyped field, or a */
	/** cross-field invariant — e.g. a terminal status with no error, or data on an error). */
	| 'schema-invalid'
	/** The envelope (data/summary/warnings/citations) carried a raw path or auth-token-shaped secret. */
	| 'leaky';

export interface McpResponseCertification {
	/** The contract-conformant envelope that is SAFE to return (the input if it passed, else a replacement). */
	envelope: McpResponseEnvelope;
	/** Whether the input passed unchanged. `false` ⇒ it was replaced with the safe error envelope. */
	conformant: boolean;
	/** The violation that forced a replacement (only when `conformant` is false). */
	violation?: McpResponseContractViolation;
}

/** The stable error code a replaced (internally-malformed/leaky) response carries. Never leaks the cause. */
export const MCP_RESPONSE_CONTRACT_ERROR_CODE = 'response-contract-violation' as const;

/**
 * Build the SAFE replacement returned when a candidate response fails certification. It is a minimal,
 * contract-conformant `error` envelope that reveals NOTHING about what was wrong with the original (no
 * field names, no values, no exception text) — only that the response was withheld for safety. This is
 * the fail-closed substitution: a malformed/leaky response is never passed through.
 */
function safeReplacement(id: string, toolId: string): McpResponseEnvelope {
	return {
		...baseEnvelope(id, toolId, 'error'),
		summary: 'The tool response was withheld because it did not conform to the response contract.',
		error: {
			code: MCP_RESPONSE_CONTRACT_ERROR_CODE,
			message: 'The tool response failed contract validation and was replaced with a safe error.',
		},
		remediation: [GENERIC_REMEDIATION],
	};
}

/**
 * Scan a candidate envelope for LEAKS using the shared diagnostics redaction guard. The whole envelope
 * is scanned (summary, data, warnings, citations, remediation, error) so a raw absolute filesystem path
 * or an auth-token-shaped secret ANYWHERE in the response is caught — including a value that slipped
 * into `data` from a composed query. This is the same guard that scrubs support bundles and cloud
 * payloads, so the non-leak guarantee is evidence, not aspiration.
 */
function responseContainsLeak(candidate: McpResponseEnvelope): boolean {
	return containsSensitiveData(candidate);
}

/**
 * MCP-010 — CERTIFY a candidate response against its declared contract BEFORE it is returned. Two gates,
 * both fail-closed:
 *
 *   1. SCHEMA. The envelope must satisfy {@link MCP_RESPONSE_ENVELOPE_SCHEMA} (shape + cross-field
 *      invariants + supported contract version). A malformed envelope is `schema-invalid`.
 *   2. LEAK. The (schema-valid) envelope must carry no raw path / auth-token-shaped secret anywhere.
 *      A leaky envelope is `leaky`.
 *
 * On EITHER failure the candidate is REPLACED with {@link safeReplacement} — a generic, contract-
 * conformant error that reveals nothing about the original. A conformant candidate is returned unchanged.
 * This is the single choke-point every MCP response passes through: an internally-malformed or leaky
 * response can never reach an agent. Pure + deterministic.
 */
export function certifyMcpResponse(candidate: McpResponseEnvelope): McpResponseCertification {
	const parsed = MCP_RESPONSE_ENVELOPE_SCHEMA.safeParse(candidate);
	if (!parsed.success) {
		return {
			envelope: safeReplacement(candidate.id, candidate.toolId),
			conformant: false,
			violation: 'schema-invalid',
		};
	}
	if (responseContainsLeak(candidate)) {
		return {
			envelope: safeReplacement(candidate.id, candidate.toolId),
			conformant: false,
			violation: 'leaky',
		};
	}
	return { envelope: candidate, conformant: true };
}

/** Convenience predicate: does a candidate envelope conform to the declared response contract? */
export function isConformantMcpResponse(candidate: unknown): candidate is McpResponseEnvelope {
	return MCP_RESPONSE_ENVELOPE_SCHEMA.safeParse(candidate).success;
}

/**
 * Project a tool-level result into the stable contract AND certify it in one fail-closed step — the
 * function the future MCP transport calls to obtain the response it serializes. The returned envelope is
 * ALWAYS contract-conformant (a malformed/leaky projection is replaced with the safe error).
 */
export function buildCertifiedMcpResponse(
	result: McpToolResult,
	id: string,
): McpResponseEnvelope {
	return certifyMcpResponse(toMcpResponseEnvelope(result, id)).envelope;
}

/**
 * The agent-level counterpart of {@link buildCertifiedMcpResponse}: project an agent result into the
 * stable contract and certify it fail-closed. Always returns a contract-conformant envelope.
 */
export function buildCertifiedMcpAgentResponse(
	result: McpAgentToolResult,
	id: string,
): McpResponseEnvelope {
	return certifyMcpResponse(toMcpAgentResponseEnvelope(result, id)).envelope;
}
