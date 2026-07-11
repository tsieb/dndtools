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
	createBaselineMcpToolRegistry,
	type McpAgentToolResult,
	type McpToolRegistry,
} from '@dndtools/core';
import type { AiChatRequest, AiReply, AiToolResult, AiToolSpec, AiTurn } from './transport';

// Bound read payloads so one broad query cannot blow the context window (or the wallet).
const MAX_TOOL_RESULT_CHARS = 16000;
// Bounded tool passes per exchange — the model must land on an answer, not loop forever.
export const MAX_TOOL_PASSES = 6;

// --- provider-safe tool names -----------------------------------------------------------------------
// Both wire formats restrict tool names to [a-zA-Z0-9_-], but Core tool ids are dotted
// (`note.read`). `__` is the reversible separator (no baseline id contains a double underscore).

export function providerToolName(toolId: string): string {
	return toolId.replace(/\./g, '__');
}

export function toolIdFromProviderName(name: string): string {
	return name.replace(/__/g, '.');
}

// --- tool specs from the Core registry ----------------------------------------------------------------

/**
 * Project the declared tool registry into provider tool specs. The JSON Schema comes from each
 * tool's OWN Zod input schema (`io: 'input'`, so defaulted fields stay optional for the model) —
 * one source of truth, no hand-copied schemas to drift. Write tools say out loud that they stage.
 */
export function buildAiToolSpecs(registry: McpToolRegistry = createBaselineMcpToolRegistry()): AiToolSpec[] {
	return registry.list().map((tool) => {
		const schema = z.toJSONSchema(tool.inputSchema, { io: 'input' }) as Record<string, unknown>;
		delete schema.$schema;
		const kindNote =
			tool.kind === 'read'
				? 'Read-only; results are already filtered to what your bound actor may see.'
				: 'Write — captured as a STAGED PROPOSAL that a human DM must approve; it never applies immediately.';
		return {
			name: providerToolName(tool.id),
			description: `${tool.title}. ${kindNote}`,
			inputSchema: schema,
		};
	});
}

// --- result mapping -----------------------------------------------------------------------------------

/** What a tool call turned into, for the UI's activity feed (never shown as more than it is). */
export type AssistantToolOutcome = 'read' | 'staged' | 'direct-write' | 'denied' | 'error';

export type AssistantEvent =
	| { type: 'text'; text: string }
	| { type: 'tool'; toolId: string; outcome: AssistantToolOutcome; detail: string };

interface MappedResult {
	content: string;
	isError: boolean;
	outcome: AssistantToolOutcome;
	detail: string;
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
			const issues = result.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('; ') ?? '';
			return {
				content: `Denied (${result.reason}): ${result.message}${issues ? ` — ${issues}` : ''}`,
				isError: true,
				outcome: 'denied',
				detail: result.message,
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
	'You are the campaign assistant inside DND Tools, a DM (dungeon master) command platform.',
	'You act as a scoped campaign actor: every tool read is already filtered to what that actor may',
	'see, and every write you attempt is captured as a STAGED PROPOSAL that a human DM must approve',
	'before anything changes — never describe a staged write as done. Use the tools to ground answers',
	'in the real campaign data instead of inventing content. Keep answers concise and practical for a',
	'DM preparing or running a session. If a tool call is denied, say so plainly and work with what',
	'you have — do not retry the same denied call.',
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
}

export interface AssistantExchangeResult {
	/** The full conversation including this exchange — pass back in for the next ask. */
	turns: AiTurn[];
	/** Display events in order: assistant text + each tool call's honest outcome. */
	events: AssistantEvent[];
}

/**
 * Run one user ask to completion: send → (tool calls → Core pipeline → results → send)* → final
 * text. Bounded by `maxToolPasses`; when the budget runs out the pending calls are answered with
 * an explicit budget error (keeping the transcript wire-valid) instead of silently dropping them.
 */
export async function runAssistantExchange(options: AssistantExchangeOptions): Promise<AssistantExchangeResult> {
	const { send, invoke, tools } = options;
	const maxToolPasses = options.maxToolPasses ?? MAX_TOOL_PASSES;
	const turns: AiTurn[] = [...options.turns, { role: 'user', text: options.userText }];
	const events: AssistantEvent[] = [];

	for (let pass = 0; pass < maxToolPasses; pass += 1) {
		const reply = await send({ system: ASSISTANT_SYSTEM_PROMPT, turns, tools });
		turns.push({ role: 'assistant', text: reply.text, toolCalls: reply.toolCalls });
		if (reply.text !== '') events.push({ type: 'text', text: reply.text });

		if (reply.toolCalls.length === 0) {
			if (reply.stopReason === 'max-tokens') {
				events.push({ type: 'text', text: '[The reply hit the length limit — ask to continue for the rest.]' });
			}
			return { turns, events };
		}

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
				events.push({ type: 'tool', toolId, outcome: 'error', detail: 'Skipped — tool budget exhausted' });
				continue;
			}
			let mapped: MappedResult;
			try {
				mapped = mapAgentResult(await invoke(toolId, call.input));
			} catch (error) {
				// A thrown invoke (e.g. a durable-persist failure) surfaces honestly to model AND user.
				const message = error instanceof Error ? error.message : String(error);
				mapped = { content: `Tool call failed: ${message}`, isError: true, outcome: 'error', detail: message };
			}
			results.push({ toolCallId: call.id, content: mapped.content, isError: mapped.isError });
			events.push({ type: 'tool', toolId, outcome: mapped.outcome, detail: mapped.detail });
		}
		turns.push({ role: 'tool-results', results });
		if (lastPass) {
			events.push({
				type: 'text',
				text: '[Stopped after the per-ask tool budget — the answer above may be incomplete.]',
			});
			return { turns, events };
		}
	}
	// Unreachable (every path above returns), but keeps the function total for TypeScript.
	return { turns, events };
}

export const __testing = { MAX_TOOL_RESULT_CHARS };
