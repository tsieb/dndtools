/**
 * mcpBridge — the glue between the raw provider transport (transport.ts) and the Core's
 * FAIL-CLOSED MCP agent pipeline (ADR-002 staged writes; MCP-001/003/009/011 gate order). It does
 * three things, and confers NO authority doing any of them:
 *
 *   1. TOOL SURFACE — projects the Core's declared tool registry into provider tool specs
 *      (name-sanitized for both wire formats + JSON Schema derived from each tool's own Zod
 *      schema), so the model can only ever be OFFERED what the registry declares. The per-agent
 *      allowlist/policy still decides what actually RUNS — a spec here is an offer, not a grant.
 *   2. RESULT MAPPING — folds every {@link McpAgentToolResult} envelope into an honest tool
 *      result for the model: reads return the actor-filtered data; STAGED writes return an
 *      explicit "pending proposal, NOT applied" message (so the model cannot truthfully claim a
 *      mutation happened); denials return the generic fail-closed message as an error.
 *   3. THE EXCHANGE LOOP — one user ask, N bounded tool passes. Every tool call routes through
 *      the injected `invoke` (SceneRuntime.invokeAgentTool → invokeMcpToolAsAgent), which runs
 *      the full optionality → identity → policy → stage/direct pipeline. There is no other path
 *      from the model to the vault.
 *
 * `send`/`invoke` are injected so unit tests drive the loop with fakes and NEVER touch the
 * network — the UI passes the real `sendAiChat` + runtime method.
 */

import { z } from 'zod';
import {
	MCP_BASELINE_TOOL_IDS,
	createBaselineMcpToolRegistry,
	type McpAgentToolResult,
	type McpToolRegistry,
} from '@dndtools/core';
import type { AiChatRequest, AiReply, AiToolResult, AiToolSpec, AiTurn } from './transport';

// Bound read payloads so one broad query cannot blow the context window (or the wallet).
const MAX_TOOL_RESULT_CHARS = 16000;
// Bounded tool passes per exchange — the model must land on an answer, not loop forever. Sized for an
// AUTONOMOUS multi-step run (ADR-025): the model prompts once and works a whole process — read the
// vault, generate, stage — across many passes. Still bounded so a stuck model cannot loop forever.
export const MAX_TOOL_PASSES = 16;

// --- provider-safe tool names -----------------------------------------------------------------------
// Both wire formats restrict tool names to [a-zA-Z0-9_-], but Core tool ids are dotted
// (`note.read`). `__` is the reversible separator (no baseline id contains a double underscore).

export function providerToolName(toolId: string): string {
	return toolId.replace(/\./g, '__');
}

export function toolIdFromProviderName(name: string): string {
	return name.replace(/__/g, '.');
}

/** How much of the canonical baseline an agent's explicit allowlist currently contains. */
export interface BaselineAllowlistMembership {
	count: number;
	total: number;
	some: boolean;
	all: boolean;
}

/**
 * Inspect exact baseline membership. A non-empty custom/legacy allowlist is not the same as granting
 * the complete current baseline, especially after a release adds new tools.
 */
export function baselineAllowlistMembership(
	allowedToolIds: readonly string[],
): BaselineAllowlistMembership {
	const allowed = new Set(allowedToolIds);
	const count = MCP_BASELINE_TOOL_IDS.filter((toolId) => allowed.has(toolId)).length;
	return {
		count,
		total: MCP_BASELINE_TOOL_IDS.length,
		some: count > 0,
		all: count === MCP_BASELINE_TOOL_IDS.length,
	};
}

/**
 * Toggle the canonical baseline without destroying custom/non-baseline grants. A partial baseline is
 * completed; a complete baseline is removed. The returned allowlist is de-duplicated and stable.
 */
export function toggleBaselineToolAllowlist(allowedToolIds: readonly string[]): string[] {
	const membership = baselineAllowlistMembership(allowedToolIds);
	const baseline = new Set<string>(MCP_BASELINE_TOOL_IDS);
	if (membership.all) {
		return [...new Set(allowedToolIds.filter((toolId) => !baseline.has(toolId)))];
	}
	return [...new Set([...allowedToolIds, ...MCP_BASELINE_TOOL_IDS])];
}

// --- tool specs from the Core registry ----------------------------------------------------------------

/**
 * Project the declared tool registry into provider tool specs. The JSON Schema comes from each
 * tool's OWN Zod input schema (`io: 'input'`, so defaulted fields stay optional for the model) —
 * one source of truth, no hand-copied schemas to drift. Write tools say out loud that they stage.
 */
export function buildAiToolSpecs(
	registry: McpToolRegistry = createBaselineMcpToolRegistry(),
): AiToolSpec[] {
	return registry.list().map((tool) => {
		const schema = z.toJSONSchema(tool.inputSchema, { io: 'input' }) as Record<string, unknown>;
		delete schema.$schema;
		const kindNote =
			tool.kind === 'read'
				? 'Read-only; results are already filtered to what your bound actor may see.'
				: 'Write — captured as a STAGED PROPOSAL that a human DM must approve; it never applies immediately.';
		// A tool may ship a richer `description` telling the model HOW to work through a task (ADR-025);
		// it already states its own staging contract, so it is trusted verbatim. Otherwise fall back to
		// the short title plus the generic kind note.
		return {
			name: providerToolName(tool.id),
			description: tool.description ?? `${tool.title}. ${kindNote}`,
			inputSchema: schema,
		};
	});
}

// --- result mapping -----------------------------------------------------------------------------------

/** What a tool call turned into, for the UI's activity feed (never shown as more than it is). */
export type AssistantToolOutcome = 'read' | 'staged' | 'direct-write' | 'denied' | 'error';

/** One structured validation issue the Core surfaced for a denied write, shown so a user watches the
 *  model self-correct (ADR-025 inline validation). */
export interface AssistantToolIssue {
	path: string;
	message: string;
}

export type AssistantEvent =
	| { type: 'text'; text: string }
	| {
			type: 'tool';
			toolId: string;
			outcome: AssistantToolOutcome;
			detail: string;
			/** Present when the Core rejected the call on schema/validation grounds. */
			issues?: AssistantToolIssue[];
	  };

/**
 * The lifecycle of one autonomous run (ADR-025), surfaced live so the UI can drive a skeleton, a
 * status line, and a completion notification. `working` carries the current pass and the active tool.
 */
export type AssistantRunStatus =
	| 'starting'
	| 'working'
	| 'completed'
	| 'failed'
	| 'cancelled'
	| 'budget-exhausted';

/**
 * A streamed run event. `status` transitions drive the phase indicator; `feed` events are the same
 * display items as the returned `events` array, delivered incrementally as they happen (so a long
 * multi-pass run is not a silent spinner). Wire this via {@link AssistantExchangeOptions.onEvent}.
 */
export type AssistantRunEvent =
	| {
			type: 'status';
			status: AssistantRunStatus;
			/** 1-based current pass and the ceiling, for a "pass k of N" readout. */
			pass: number;
			maxPasses: number;
			/** The tool being invoked while `working`, if any. */
			activeToolId?: string;
	  }
	| { type: 'feed'; event: AssistantEvent };

interface MappedResult {
	content: string;
	isError: boolean;
	outcome: AssistantToolOutcome;
	detail: string;
	issues?: AssistantToolIssue[];
}

function truncate(text: string): string {
	if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
	return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}… [truncated — narrow the query for the rest]`;
}

/** Fold a Core agent-tool envelope into the model-facing result + the UI-facing outcome. */
export function mapAgentResult(result: McpAgentToolResult): MappedResult {
	switch (result.status) {
		case 'agent-denied':
			return {
				content: `Denied (${result.reason}): ${result.message}`,
				isError: true,
				outcome: 'denied',
				detail: result.message,
			};
		case 'staged':
			return {
				content:
					`Staged as pending proposal ${result.proposalId}. The write has NOT been applied — ` +
					'a human DM must approve or reject it in Settings → AI & tools. Tell the user it is ' +
					'awaiting review; never claim the change already happened.',
				isError: false,
				outcome: 'staged',
				detail: `Proposal ${result.proposalId} staged for DM review`,
			};
		case 'denied': {
			const structured: AssistantToolIssue[] | undefined = result.issues?.map((issue) => ({
				path: String(issue.path),
				message: issue.message,
			}));
			const issues = structured?.map((issue) => `${issue.path}: ${issue.message}`).join('; ') ?? '';
			return {
				content: `Denied (${result.reason}): ${result.message}${issues ? ` — ${issues}` : ''}`,
				isError: true,
				outcome: 'denied',
				detail: result.message,
				...(structured && structured.length > 0 ? { issues: structured } : {}),
			};
		}
		case 'read-ok':
			return {
				content: truncate(JSON.stringify(result.data ?? null)),
				isError: false,
				outcome: 'read',
				detail: 'Read (actor-filtered)',
			};
		case 'write':
			return result.commandResult.status === 'accepted'
				? {
						content: 'Write committed directly (this agent runs under the trusted_direct policy).',
						isError: false,
						outcome: 'direct-write',
						detail: 'Committed directly (trusted_direct)',
					}
				: {
						content: `Write rejected: ${result.commandResult.rejection.message}`,
						isError: true,
						outcome: 'denied',
						detail: result.commandResult.rejection.message,
					};
	}
}

// --- the exchange loop ----------------------------------------------------------------------------------

/** The honest operating contract the model works under — matches what the Core actually enforces. */
export const ASSISTANT_SYSTEM_PROMPT = [
	'You are the campaign assistant inside Lamplight, a DM (dungeon master) command platform.',
	'You act as a scoped campaign actor: every tool read is already filtered to what that actor may',
	'see, and every write you attempt is captured as a STAGED PROPOSAL that a human DM must approve',
	'before anything changes — never describe a staged write as done. Use the tools to ground answers',
	'in the real campaign data instead of inventing content. You can take MANY tool passes to complete',
	'a multi-step task: work step by step — first read what you need, reason it through (for a character,',
	'build it up level by level), then stage the write(s). Finish the whole task the user asked for',
	'before giving your final summary. Keep prose concise and practical for a DM preparing or running a',
	'session. If a tool call is denied, read the reason, fix your input, and try once more; if it is',
	'denied again, say so plainly and work with what you have — do not loop on the same denied call.',
].join(' ');

export interface AssistantExchangeOptions {
	/** The transport call (the UI passes `sendAiChat` bound to the resolved config). */
	send: (request: AiChatRequest) => Promise<AiReply>;
	/** Routes one tool call through the Core agent pipeline (SceneRuntime.invokeAgentTool). */
	invoke: (toolId: string, input: unknown) => Promise<McpAgentToolResult>;
	/** The offered tool surface (buildAiToolSpecs()). */
	tools: AiToolSpec[];
	/** Prior conversation turns (replayed verbatim so follow-ups keep their context). */
	turns: AiTurn[];
	/** The new user ask. */
	userText: string;
	maxToolPasses?: number;
	/**
	 * Fires for every status transition and every display event, live — so a long autonomous run
	 * (ADR-025) drives a skeleton + status line instead of a silent spinner. Optional; when omitted the
	 * exchange behaves exactly as before and the caller reads the batched `events` on resolve.
	 */
	onEvent?: (event: AssistantRunEvent) => void;
	/**
	 * Cancels the run BETWEEN passes: a request already in flight completes (the transport takes no
	 * signal), then the loop stops and resolves with status `cancelled`. Lets the UI's Cancel button
	 * halt a runaway multi-step run without a dangling promise.
	 */
	signal?: AbortSignal;
}

export interface AssistantExchangeResult {
	/** The full conversation including this exchange — pass back in for the next ask. */
	turns: AiTurn[];
	/** Display events in order: assistant text + each tool call's honest outcome. */
	events: AssistantEvent[];
	/** How the run ended (drives the completion notification). */
	status: AssistantRunStatus;
}

/**
 * Run one user ask to completion: send → (tool calls → Core pipeline → results → send)* → final
 * text. Bounded by `maxToolPasses`; when the budget runs out the pending calls are answered with an
 * explicit budget error and then receives one tools-disabled final model response (keeping the transcript
 * wire-valid) instead of silently dropping them. Every status transition and display event is streamed
 * through `onEvent` as it happens (ADR-025), and an aborted `signal` stops the loop between passes. Always
 * resolves (never rejects): transport and observer failures are isolated so the caller can notify without
 * a try/catch around this call.
 */
export async function runAssistantExchange(
	options: AssistantExchangeOptions,
): Promise<AssistantExchangeResult> {
	const { send, invoke, tools, onEvent, signal } = options;
	const maxToolPasses = options.maxToolPasses ?? MAX_TOOL_PASSES;
	const turns: AiTurn[] = [...options.turns, { role: 'user', text: options.userText }];
	const events: AssistantEvent[] = [];

	let currentPass = 0;
	const emit = (event: AssistantRunEvent): void => {
		try {
			onEvent?.(event);
		} catch {
			// Progress observers are UI niceties. A broken observer must never abort the authoritative run.
		}
	};
	const emitStatus = (status: AssistantRunStatus, activeToolId?: string): void =>
		emit({
			type: 'status',
			status,
			pass: currentPass + 1,
			maxPasses: maxToolPasses,
			...(activeToolId ? { activeToolId } : {}),
		});
	const pushEvent = (event: AssistantEvent): void => {
		events.push(event);
		emit({ type: 'feed', event });
	};
	const finish = (status: AssistantRunStatus): AssistantExchangeResult => {
		emitStatus(status);
		return { turns, events, status };
	};

	if (signal?.aborted) return finish('cancelled');
	emitStatus('starting');

	for (let pass = 0; pass < maxToolPasses; pass += 1) {
		currentPass = pass;
		if (signal?.aborted) return finish('cancelled');
		emitStatus('working');

		let reply: AiReply;
		try {
			reply = await send({ system: ASSISTANT_SYSTEM_PROMPT, turns, tools });
		} catch (error) {
			// The transport threw (auth/network/api). Surface it honestly and end the run failed.
			const message = error instanceof Error ? error.message : String(error);
			pushEvent({ type: 'text', text: `[The run stopped: ${message}]` });
			return finish('failed');
		}
		turns.push({ role: 'assistant', text: reply.text, toolCalls: reply.toolCalls });
		if (reply.text !== '') pushEvent({ type: 'text', text: reply.text });

		if (reply.toolCalls.length === 0) {
			if (reply.stopReason === 'max-tokens') {
				pushEvent({
					type: 'text',
					text: '[The reply hit the length limit — ask to continue for the rest.]',
				});
			}
			return finish('completed');
		}

		if (signal?.aborted) return finish('cancelled');

		const lastPass = pass === maxToolPasses - 1;
		const results: AiToolResult[] = [];
		for (const call of reply.toolCalls) {
			const toolId = toolIdFromProviderName(call.name);
			if (lastPass) {
				// Answer (wire-valid) but stop the loop: the model must conclude with what it has.
				results.push({
					toolCallId: call.id,
					content: 'Tool budget for this exchange is used up — answer with what you already have.',
					isError: true,
				});
				pushEvent({
					type: 'tool',
					toolId,
					outcome: 'error',
					detail: 'Skipped — tool budget exhausted',
				});
				continue;
			}
			emitStatus('working', toolId);
			let mapped: MappedResult;
			try {
				mapped = mapAgentResult(await invoke(toolId, call.input));
			} catch (error) {
				// A thrown invoke (e.g. a durable-persist failure) surfaces honestly to model AND user.
				const message = error instanceof Error ? error.message : String(error);
				mapped = {
					content: `Tool call failed: ${message}`,
					isError: true,
					outcome: 'error',
					detail: message,
				};
			}
			results.push({ toolCallId: call.id, content: mapped.content, isError: mapped.isError });
			pushEvent({
				type: 'tool',
				toolId,
				outcome: mapped.outcome,
				detail: mapped.detail,
				...(mapped.issues ? { issues: mapped.issues } : {}),
			});
		}
		turns.push({ role: 'tool-results', results });
		if (lastPass) {
			if (signal?.aborted) return finish('cancelled');
			// Give the model one tools-disabled turn to summarize what it accomplished. This both produces a
			// useful final answer and closes the provider transcript with an assistant turn after tool results.
			let finalReply: AiReply;
			try {
				finalReply = await send({ system: ASSISTANT_SYSTEM_PROMPT, turns, tools: [] });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const text = `[The tool budget was exhausted and the final summary failed: ${message}]`;
				turns.push({ role: 'assistant', text, toolCalls: [] });
				pushEvent({ type: 'text', text });
				return finish('failed');
			}
			const finalText =
				finalReply.text !== ''
					? finalReply.text
					: '[Stopped after the per-ask tool budget — the result may be incomplete.]';
			// Tools were not offered on the final request. Ignore any non-conformant returned calls so the
			// transcript cannot end with unanswered tool use.
			turns.push({ role: 'assistant', text: finalText, toolCalls: [] });
			pushEvent({ type: 'text', text: finalText });
			if (finalReply.stopReason === 'max-tokens') {
				pushEvent({
					type: 'text',
					text: '[The final summary hit the length limit — ask to continue for the rest.]',
				});
			}
			return finish('budget-exhausted');
		}
	}
	// Unreachable (every path above returns), but keeps the function total for TypeScript.
	return finish('budget-exhausted');
}

export const __testing = { MAX_TOOL_RESULT_CHARS };
