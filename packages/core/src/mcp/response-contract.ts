import { z } from 'zod';
import { containsSensitiveData } from '../diagnostics/redaction';
import type { CommandResult, CoreStateSlice } from '../commands/types';
import type { McpToolResult } from './tool-dispatch';
import type { McpAgentToolResult } from './agent-dispatch';
import type { McpStagedProposal } from '../state/mcp-policy';
import { getContentItemDetailForActor, getContentItemsForActor } from '../queries/content-query';

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

const warningSchema = z.object({ code: z.string().min(1), message: z.string().min(1) }).strict();

const citationSchema = z.object({ kind: z.string().min(1), ref: z.string().min(1) }).strict();

const remediationSchema = z
	.object({ action: z.string().min(1), message: z.string().min(1) })
	.strict();

const errorSchema = z
	.object({
		code: z.string().min(1),
		message: z.string().min(1),
		issues: z.array(z.object({ path: z.string(), message: z.string() }).strict()).optional(),
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
		message:
			'This agent policy mode is disabled. The DM must grant a policy mode that permits tools.',
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
export function buildCertifiedMcpResponse(result: McpToolResult, id: string): McpResponseEnvelope {
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

// --- RC-AI-2.1 — the SEMANTIC DIFF PREVIEW for a staged proposal ------------------------------------

/**
 * RC-AI-2.1 — a DM-facing, human-reviewable PREVIEW of what a staged proposal would do if approved.
 *
 * The staged-proposal record (`McpStagedProposal`) deliberately captures only what the approval needs to
 * re-dispatch the write: tool, command type, and the schema-validated payload. That is enough to COMMIT
 * a proposal but not enough to REVIEW one — "content.update-item on note-7" tells a DM nothing about
 * whether the agent rewrote two lines or replaced the whole dossier. This section closes that gap: it
 * projects (proposal + CURRENT state) into a structural summary, a line delta, and the backlink impact.
 *
 * Three deliberate properties:
 *
 *   1. DERIVED, NOT SNAPSHOTTED. The preview is computed on demand from current state rather than
 *      frozen onto the proposal at staging time. It therefore needs no persisted-shape change (no
 *      `schemaVersion` bump, no migration for a value that is a pure function of state), and it stays
 *      HONEST: if a human edited the note between staging and approval, the preview diffs against what
 *      is actually there now — and reports the drift as a `stale-base-revision` warning — instead of
 *      showing the DM a diff against a base that no longer exists.
 *   2. ACTOR-FILTERED. Every baseline read goes through the actor-scoped content queries AS THE
 *      PROPOSAL'S BOUND ACTOR (`proposal.actorId`), never as the reviewing DM. A proposal whose target
 *      the agent's actor cannot see yields no baseline and says so, rather than leaking the note's
 *      current contents into the review panel through the preview side-channel.
 *   3. NOT ON THE AGENT WIRE. The preview is NOT embedded in {@link McpResponseEnvelope}. The envelope
 *      is what leaves the core TO AN AGENT; a staged write's receipt there is the proposal id and
 *      nothing more. Handing an agent a diff of the note it just proposed changing would widen what a
 *      staged (uncommitted!) write returns, and vault prose flowing through `certifyMcpResponse`'s leak
 *      scan would fail responses for content the DM legitimately wrote. AI proposes; the DM reviews.
 *
 * Pure + deterministic: same state + same proposal ⇒ same preview. Performs no I/O and mutates nothing.
 */

/** How a proposal changes the vault, coarsely — the one word that leads the review row. */
export type McpProposalChangeKind = 'create' | 'update' | 'append' | 'other';

/** ONE structural change line: which field moves, and (when a baseline exists) from what to what. */
export interface McpProposalFieldChange {
	/** The payload field path (e.g. `title`, `body`, `fields.status`). */
	path: string;
	change: 'added' | 'changed' | 'removed';
	/** The current value, truncated for display. `null` when there is no baseline to compare against. */
	before: string | null;
	/** The proposed value, truncated for display. `null` when the change removes the field. */
	after: string | null;
}

/** The LINE DELTA over a text body: how many lines the change adds, drops, and leaves alone. */
export interface McpProposalLineDelta {
	added: number;
	removed: number;
	unchanged: number;
}

/**
 * The BACKLINK IMPACT of a proposal. `added`/`removed` are the `[[wikilink]]` targets the proposed body
 * introduces or drops (outgoing links). `incoming` are the titles of notes that link TO the target note
 * today — the notes whose links a title change would strand. Titles only, all actor-filtered.
 */
export interface McpProposalBacklinkImpact {
	added: string[];
	removed: string[];
	incoming: string[];
}

/** THE PREVIEW a DM reviews before approving a staged write. Derived; carries no command authority. */
export interface McpProposalPreview {
	proposalId: string;
	toolId: string;
	commandType: string;
	changeKind: McpProposalChangeKind;
	/** What the write lands on. `resolved` is false when the baseline could not be read. */
	target: { kind: string; id: string | null; label: string | null; resolved: boolean };
	/** A concise, generic one-line summary of the change (safe to read aloud; no engine jargon). */
	summary: string;
	/** The structural summary: one line per changed field, in payload order. */
	fields: McpProposalFieldChange[];
	/** The line delta for a text body change. `null` when the proposal changes no body text. */
	lineDelta: McpProposalLineDelta | null;
	backlinks: McpProposalBacklinkImpact;
	/** Honest caveats: no baseline, a drifted base revision, a bounded scan. Empty when none. */
	warnings: McpResponseWarning[];
}

/** Display caps so one preview can never become an unbounded render (or an unbounded diff). */
const PREVIEW_VALUE_CHARS = 140;
const PREVIEW_DIFF_MAX_LINES = 400;
const PREVIEW_MAX_LINKS = 20;

/** Render any payload value as a short, single-line display string. Never throws. */
function previewValue(value: unknown): string {
	if (value === null || value === undefined) return '';
	const raw =
		typeof value === 'string'
			? value
			: typeof value === 'number' || typeof value === 'boolean'
				? String(value)
				: safeJson(value);
	const oneLine = raw.replace(/\s+/g, ' ').trim();
	return oneLine.length > PREVIEW_VALUE_CHARS
		? `${oneLine.slice(0, PREVIEW_VALUE_CHARS - 1)}…`
		: oneLine;
}

/** JSON that cannot throw on a cycle (a payload is schema-validated, but the preview stays total). */
function safeJson(value: unknown): string {
	try {
		return JSON.stringify(value) ?? '';
	} catch {
		return '';
	}
}

/** Every `[[wikilink]]` target named in a body, section anchor stripped, de-duplicated, in order. */
function wikilinkTargets(body: string): string[] {
	const targets: string[] = [];
	const seen = new Set<string>();
	for (const match of body.matchAll(/\[\[([^\]]+?)\]\]/g)) {
		const inner = match[1] ?? '';
		// `[[Note|alias]]` and `[[Note#Section]]` both point at `Note`.
		const target = inner.split('|')[0]!.split('#')[0]!.trim();
		if (target === '' || seen.has(target)) continue;
		seen.add(target);
		targets.push(target);
	}
	return targets;
}

/**
 * The LINE DELTA between two bodies, by longest-common-subsequence over lines: a moved or re-wrapped
 * paragraph counts once, not twice. Bounded — beyond {@link PREVIEW_DIFF_MAX_LINES} on either side the
 * quadratic table is refused and the caller reports the totals with a `diff-bounded` warning instead of
 * silently producing a wrong (or slow) number.
 */
function lineDelta(
	before: string,
	after: string,
): { delta: McpProposalLineDelta; bounded: boolean } {
	const a = before === '' ? [] : before.split(/\r?\n/);
	const b = after === '' ? [] : after.split(/\r?\n/);
	if (a.length > PREVIEW_DIFF_MAX_LINES || b.length > PREVIEW_DIFF_MAX_LINES) {
		return { delta: { added: b.length, removed: a.length, unchanged: 0 }, bounded: true };
	}
	// Classic LCS table over lines; `table[i][j]` = LCS length of a[i..] and b[j..].
	const table: number[][] = Array.from({ length: a.length + 1 }, () =>
		new Array<number>(b.length + 1).fill(0),
	);
	for (let i = a.length - 1; i >= 0; i -= 1) {
		for (let j = b.length - 1; j >= 0; j -= 1) {
			table[i]![j] =
				a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
		}
	}
	const unchanged = table[0]![0]!;
	return {
		delta: { added: b.length - unchanged, removed: a.length - unchanged, unchanged },
		bounded: false,
	};
}

/** The notes that currently link to `title`, read as the proposal's own actor. Titles only, bounded. */
function incomingBacklinks(
	state: CoreStateSlice,
	actorId: string,
	targetId: string,
	title: string,
): { titles: string[]; bounded: boolean } {
	if (title === '') return { titles: [], bounded: false };
	const needle = title.toLowerCase();
	const titles: string[] = [];
	for (const item of getContentItemsForActor(state.content, state.permissions, actorId)) {
		if (item.id === targetId) continue;
		if (!wikilinkTargets(item.body).some((target) => target.toLowerCase() === needle)) continue;
		if (titles.length >= PREVIEW_MAX_LINKS) return { titles, bounded: true };
		titles.push(item.title);
	}
	return { titles, bounded: false };
}

/** The empty backlink impact (no body text moves ⇒ no outgoing link changes). */
const NO_BACKLINKS: McpProposalBacklinkImpact = { added: [], removed: [], incoming: [] };

/** A field-by-field structural summary of a payload with NO baseline (a create, or an opaque target). */
function structuralFields(payload: unknown, skip: ReadonlySet<string>): McpProposalFieldChange[] {
	if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return [];
	const changes: McpProposalFieldChange[] = [];
	for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
		if (skip.has(key)) continue;
		if (value === undefined) continue;
		changes.push({ path: key, change: 'added', before: null, after: previewValue(value) });
	}
	return changes;
}

/** Payload keys that are plumbing, not content: never shown as a change line. */
const PREVIEW_SKIP_KEYS: ReadonlySet<string> = new Set([
	'itemId',
	'baseRevision',
	'cardId',
	'mapId',
]);

/** The one-line summary, composed from the change kind + what the write lands on. */
function previewSummary(
	kind: McpProposalChangeKind,
	targetLabel: string | null,
	delta: McpProposalLineDelta | null,
): string {
	const what = targetLabel === null || targetLabel === '' ? 'a vault entry' : `"${targetLabel}"`;
	const lines =
		delta === null
			? ''
			: ` (+${delta.added} / −${delta.removed} ${delta.added + delta.removed === 1 ? 'line' : 'lines'})`;
	switch (kind) {
		case 'create':
			return `Creates ${what}${lines}.`;
		case 'update':
			return `Updates ${what}${lines}.`;
		case 'append':
			return `Appends to ${what}${lines}.`;
		case 'other':
			return `Changes ${what}${lines}.`;
	}
}

/** The content-item change kinds, by the tool that staged the write. */
function contentChangeKind(toolId: string): McpProposalChangeKind {
	return toolId === 'note.append' ? 'append' : 'update';
}

/**
 * RC-AI-2.1 — compute the review preview for ONE staged proposal against CURRENT state.
 *
 * A `content.update-item` proposal (the only write that replaces existing prose) gets the full
 * treatment: the current note is read AS THE PROPOSAL'S ACTOR, the body is line-diffed, the outgoing
 * wikilinks are set-differenced, and — when the title moves — the notes that link to the old title are
 * listed as strandable incoming backlinks. Every other write is a creation, so it gets a structural
 * field summary plus the line count of any body it brings.
 *
 * Total: an unreadable target, a payload of an unexpected shape, and an unknown command type all
 * degrade to a preview that SAYS it has no baseline (`no-baseline`) rather than inventing one. Pure.
 */
export function computeMcpProposalPreview(
	state: CoreStateSlice,
	proposal: McpStagedProposal,
): McpProposalPreview {
	const base: Omit<McpProposalPreview, 'summary'> = {
		proposalId: proposal.id,
		toolId: proposal.toolId,
		commandType: proposal.commandType,
		changeKind: 'other',
		target: { kind: 'entry', id: null, label: null, resolved: false },
		fields: [],
		lineDelta: null,
		backlinks: NO_BACKLINKS,
		warnings: [],
	};
	const payload =
		proposal.payload !== null && typeof proposal.payload === 'object'
			? (proposal.payload as Record<string, unknown>)
			: {};

	if (proposal.commandType === 'content.update-item') {
		const itemId = typeof payload.itemId === 'string' ? payload.itemId : '';
		const detail = getContentItemDetailForActor(
			state.content,
			state.permissions,
			proposal.actorId,
			itemId,
		);
		const kind = contentChangeKind(proposal.toolId);
		if (!detail.visible) {
			// Fail honest, not closed: the proposal is still reviewable, but the panel must not pretend
			// it knows what the note says today.
			const fields = structuralFields(payload, PREVIEW_SKIP_KEYS);
			return {
				...base,
				changeKind: kind,
				target: { kind: 'note', id: itemId === '' ? null : itemId, label: null, resolved: false },
				fields,
				summary: previewSummary(kind, null, null),
				warnings: [
					{
						code: 'no-baseline',
						message:
							'The target is not available to the agent, so there is nothing to compare against.',
					},
				],
			};
		}
		const warnings: McpResponseWarning[] = [];
		if (typeof payload.baseRevision === 'number' && payload.baseRevision !== detail.revision) {
			warnings.push({
				code: 'stale-base-revision',
				message:
					'The target changed after this was staged. Approving would be rejected as a conflict.',
			});
		}
		const nextTitle = typeof payload.title === 'string' ? payload.title : undefined;
		const nextBody = typeof payload.body === 'string' ? payload.body : undefined;
		const fields: McpProposalFieldChange[] = [];
		if (nextTitle !== undefined && nextTitle !== detail.title) {
			fields.push({
				path: 'title',
				change: 'changed',
				before: previewValue(detail.title),
				after: previewValue(nextTitle),
			});
		}
		let delta: McpProposalLineDelta | null = null;
		let backlinks: McpProposalBacklinkImpact = NO_BACKLINKS;
		if (nextBody !== undefined && nextBody !== detail.body) {
			const computed = lineDelta(detail.body, nextBody);
			delta = computed.delta;
			if (computed.bounded) {
				warnings.push({
					code: 'diff-bounded',
					message: 'The note is too long to diff line by line; totals are shown instead.',
				});
			}
			const beforeLinks = wikilinkTargets(detail.body);
			const afterLinks = wikilinkTargets(nextBody);
			backlinks = {
				added: afterLinks.filter((link) => !beforeLinks.includes(link)).slice(0, PREVIEW_MAX_LINKS),
				removed: beforeLinks
					.filter((link) => !afterLinks.includes(link))
					.slice(0, PREVIEW_MAX_LINKS),
				incoming: [],
			};
			fields.push({
				path: 'body',
				change: 'changed',
				before: previewValue(detail.body),
				after: previewValue(nextBody),
			});
		}
		// A title change strands every link that names the OLD title, so those notes are the ones a DM
		// needs to see before approving. Only computed when the title actually moves.
		if (nextTitle !== undefined && nextTitle !== detail.title) {
			const incoming = incomingBacklinks(state, proposal.actorId, detail.id, detail.title);
			backlinks = { ...backlinks, incoming: incoming.titles };
			if (incoming.bounded) {
				warnings.push({
					code: 'backlinks-bounded',
					message: 'Only the first linked notes are listed; more link to this title.',
				});
			}
		}
		return {
			...base,
			changeKind: kind,
			target: { kind: 'note', id: detail.id, label: detail.title, resolved: true },
			fields,
			lineDelta: delta,
			backlinks,
			summary: previewSummary(kind, detail.title, delta),
			warnings,
		};
	}

	// Every other bound command CREATES something. There is no baseline by definition, so the preview is
	// the structural field summary plus the size of any prose the payload brings.
	const label =
		typeof payload.title === 'string'
			? payload.title
			: typeof payload.name === 'string'
				? payload.name
				: typeof payload.label === 'string'
					? payload.label
					: null;
	const body = typeof payload.body === 'string' ? payload.body : '';
	const delta = body === '' ? null : lineDelta('', body).delta;
	return {
		...base,
		changeKind: 'create',
		target: { kind: 'entry', id: null, label, resolved: true },
		fields: structuralFields(payload, PREVIEW_SKIP_KEYS),
		lineDelta: delta,
		backlinks:
			body === ''
				? NO_BACKLINKS
				: { added: wikilinkTargets(body).slice(0, PREVIEW_MAX_LINKS), removed: [], incoming: [] },
		summary: previewSummary('create', label, delta),
	};
}
