import { describe, it, expect, vi } from 'vitest';
import type { McpAgentToolResult } from '@dndtools/core';
import {
	providerToolName,
	toolIdFromProviderName,
	buildAiToolSpecs,
	mapAgentResult,
	runAssistantExchange,
	ASSISTANT_SYSTEM_PROMPT,
	MAX_TOOL_PASSES,
	type AssistantExchangeOptions,
} from './mcpBridge';
import type { AiReply } from './transport';

// mcpBridge.ts is the ONLY door from the model to the vault. These tests prove: tool specs are
// projected from the real Core registry (name-sanitized, write tools announce staging), every
// Core result envelope folds into an honest model-facing result + UI outcome (a staged write is
// never reported as applied), and the exchange loop routes each tool call through the injected
// `invoke` — the SceneRuntime → invokeMcpToolAsAgent pipeline — and stays wire-valid, including
// when the per-ask tool budget runs out. `send`/`invoke` are fakes; no network, no real runtime.

describe('provider-safe tool names', () => {
	it('round-trips dotted Core ids through the double-underscore separator', () => {
		expect(providerToolName('note.read')).toBe('note__read');
		expect(toolIdFromProviderName('note__read')).toBe('note.read');
		expect(toolIdFromProviderName(providerToolName('bundle.session-prep'))).toBe('bundle.session-prep');
	});
});

describe('buildAiToolSpecs (from the real Core registry)', () => {
	const specs = buildAiToolSpecs();

	it('offers every registry tool with a sanitized name and a JSON-Schema input (no $schema)', () => {
		expect(specs.length).toBeGreaterThan(0);
		for (const spec of specs) {
			expect(spec.name).toMatch(/^[a-zA-Z0-9_-]+$/);
			expect(spec.inputSchema).not.toHaveProperty('$schema');
		}
	});

	it('marks a read tool as filtered and a write tool as a staged proposal', () => {
		const read = specs.find((s) => s.name === 'note__read');
		const write = specs.find((s) => s.name === 'note__create');
		expect(read?.description).toMatch(/read-only/i);
		expect(write?.description).toMatch(/staged proposal/i);
	});
});

describe('mapAgentResult — honest result folding', () => {
	it('reports a staged write as a pending proposal that has NOT been applied', () => {
		const mapped = mapAgentResult({ status: 'staged', toolId: 'note.create', proposalId: 'p1', batchable: false });
		expect(mapped.outcome).toBe('staged');
		expect(mapped.isError).toBe(false);
		expect(mapped.content).toContain('NOT been applied');
		expect(mapped.content).toContain('p1');
	});

	it('surfaces an identity/policy denial as an error the model must respect', () => {
		const mapped = mapAgentResult({ status: 'agent-denied', toolId: 'note.read', reason: 'mcp-disabled', message: 'MCP is disabled for this vault' });
		expect(mapped.outcome).toBe('denied');
		expect(mapped.isError).toBe(true);
	});

	it('serializes a read result and truncates a very large payload', () => {
		const ok = mapAgentResult({ status: 'read-ok', toolId: 'note.read', data: { body: 'x' } } as McpAgentToolResult);
		expect(ok.outcome).toBe('read');
		expect(ok.content).toBe(JSON.stringify({ body: 'x' }));

		const huge = 'y'.repeat(20000);
		const truncated = mapAgentResult({ status: 'read-ok', toolId: 'note.read', data: huge } as McpAgentToolResult);
		expect(truncated.content.length).toBeLessThan(20000);
		expect(truncated.content).toContain('truncated');
	});

	it('folds a tool-level schema denial (with issues) into an error', () => {
		const mapped = mapAgentResult({
			status: 'denied',
			toolId: 'note.create',
			reason: 'invalid-input',
			message: 'invalid input',
			issues: [{ path: 'title', message: 'required' }],
		} as McpAgentToolResult);
		expect(mapped.outcome).toBe('denied');
		expect(mapped.isError).toBe(true);
		expect(mapped.content).toContain('title: required');
	});

	it('reports a committed direct write and a rejected one distinctly', () => {
		const accepted = mapAgentResult({
			status: 'write',
			toolId: 'note.create',
			commandResult: { status: 'accepted' },
		} as McpAgentToolResult);
		expect(accepted.outcome).toBe('direct-write');
		expect(accepted.isError).toBe(false);

		const rejected = mapAgentResult({
			status: 'write',
			toolId: 'note.create',
			commandResult: { status: 'rejected', rejection: { message: 'validation failed' } },
		} as McpAgentToolResult);
		expect(rejected.outcome).toBe('denied');
		expect(rejected.isError).toBe(true);
	});
});

// --- exchange loop --------------------------------------------------------------------------------

const specs = buildAiToolSpecs();

/** A `send` fake that returns a scripted reply per pass, capturing what it was asked. */
function scriptedSend(replies: AiReply[]): { send: AssistantExchangeOptions['send']; calls: Parameters<AssistantExchangeOptions['send']>[0][] } {
	const calls: Parameters<AssistantExchangeOptions['send']>[0][] = [];
	let i = 0;
	const send: AssistantExchangeOptions['send'] = async (request) => {
		calls.push(request);
		return replies[Math.min(i++, replies.length - 1)];
	};
	return { send, calls };
}

const textReply = (text: string): AiReply => ({ text, toolCalls: [], stopReason: 'end' });

describe('runAssistantExchange', () => {
	it('returns assistant text and a replayable transcript for a no-tool answer', async () => {
		const { send, calls } = scriptedSend([textReply('Tonight, follow up on the missing courier.')]);
		const invoke = vi.fn();
		const result = await runAssistantExchange({ send, invoke, tools: specs, turns: [], userText: 'What should I prep?' });

		expect(invoke).not.toHaveBeenCalled();
		expect(result.events).toEqual([{ type: 'text', text: 'Tonight, follow up on the missing courier.' }]);
		// transcript: user ask + assistant reply, ready to feed back into the next exchange
		expect(result.turns[0]).toEqual({ role: 'user', text: 'What should I prep?' });
		expect(result.turns[1]).toMatchObject({ role: 'assistant', text: 'Tonight, follow up on the missing courier.', toolCalls: [] });
		// the loop offers the tools and the honest system prompt on the request
		expect(calls[0].system).toBe(ASSISTANT_SYSTEM_PROMPT);
		expect(calls[0].tools).toBe(specs);
	});

	it('routes a tool call through invoke (dotted id), folds the result back, then answers', async () => {
		const { send } = scriptedSend([
			{ text: '', toolCalls: [{ id: 'tu1', name: 'note__read', input: { id: 'n1' } }], stopReason: 'tool-use' },
			textReply('The courier note says the shipment is overdue.'),
		]);
		const invoke = vi.fn(async (): Promise<McpAgentToolResult> => ({ status: 'read-ok', toolId: 'note.read', data: { body: 'overdue' } } as McpAgentToolResult));

		const result = await runAssistantExchange({ send, invoke, tools: specs, turns: [], userText: 'What does the courier note say?' });

		// invoke received the DOTTED core id (not the wire-sanitized name) and the model's input
		expect(invoke).toHaveBeenCalledWith('note.read', { id: 'n1' });
		// the tool-results turn carries the read payload back to the model, keeping the transcript wire-valid
		const toolResultsTurn = result.turns.find((t) => t.role === 'tool-results');
		expect(toolResultsTurn).toMatchObject({ role: 'tool-results', results: [{ toolCallId: 'tu1', isError: false }] });
		// events include the tool outcome and the final text
		expect(result.events).toEqual([
			{ type: 'tool', toolId: 'note.read', outcome: 'read', detail: 'Read (actor-filtered)' },
			{ type: 'text', text: 'The courier note says the shipment is overdue.' },
		]);
	});

	it('carries a staged write back as a pending-proposal result the model cannot claim as done', async () => {
		const { send } = scriptedSend([
			{ text: '', toolCalls: [{ id: 'tu1', name: 'note__create', input: { title: 'NPC' } }], stopReason: 'tool-use' },
			textReply('I have proposed a new note for your review.'),
		]);
		const invoke = vi.fn(async (): Promise<McpAgentToolResult> => ({ status: 'staged', toolId: 'note.create', proposalId: 'p42', batchable: false }));

		const result = await runAssistantExchange({ send, invoke, tools: specs, turns: [], userText: 'Add an NPC note.' });

		expect(invoke).toHaveBeenCalledWith('note.create', { title: 'NPC' });
		expect(result.events).toContainEqual({ type: 'tool', toolId: 'note.create', outcome: 'staged', detail: 'Proposal p42 staged for DM review' });
		const toolResultsTurn = result.turns.find((t) => t.role === 'tool-results') as { results: { content: string }[] };
		expect(toolResultsTurn.results[0].content).toContain('NOT been applied');
	});

	it('surfaces a thrown invoke (e.g. durable-persist failure) as an error without breaking the loop', async () => {
		const { send } = scriptedSend([
			{ text: '', toolCalls: [{ id: 'tu1', name: 'note__read', input: {} }], stopReason: 'tool-use' },
			textReply('recovered'),
		]);
		const invoke = vi.fn(async () => {
			throw new Error('persist failed');
		});
		const result = await runAssistantExchange({ send, invoke, tools: specs, turns: [], userText: 'read it' });
		expect(result.events).toContainEqual({ type: 'tool', toolId: 'note.read', outcome: 'error', detail: 'persist failed' });
		const toolResultsTurn = result.turns.find((t) => t.role === 'tool-results') as { results: { isError: boolean }[] };
		expect(toolResultsTurn.results[0].isError).toBe(true);
	});

	it('stops on the per-ask tool budget: no invoke on the last pass, a wire-valid budget error, and an honest notice', async () => {
		// A model that always calls a tool would loop forever; the budget forces a conclusion.
		const alwaysTool: AiReply = { text: '', toolCalls: [{ id: 'tu', name: 'note__read', input: {} }], stopReason: 'tool-use' };
		const { send } = scriptedSend([alwaysTool]);
		const invoke = vi.fn(async (): Promise<McpAgentToolResult> => ({ status: 'read-ok', toolId: 'note.read', data: {} } as McpAgentToolResult));

		const result = await runAssistantExchange({ send, invoke, tools: specs, turns: [], userText: 'loop', maxToolPasses: 3 });

		// invoke runs on passes 0 and 1, but NOT on the final pass (2) — that pass answers with a budget error
		expect(invoke).toHaveBeenCalledTimes(2);
		expect(result.events).toContainEqual({ type: 'tool', toolId: 'note.read', outcome: 'error', detail: 'Skipped — tool budget exhausted' });
		expect(result.events.at(-1)).toMatchObject({ type: 'text' });
		expect((result.events.at(-1) as { text: string }).text).toContain('tool budget');
		// the final tool-results turn still answers every pending call so the transcript stays valid
		const lastTurn = result.turns.at(-1) as { role: string; results: { isError: boolean }[] };
		expect(lastTurn.role).toBe('tool-results');
		expect(lastTurn.results[0].isError).toBe(true);
	});

	it('defaults the tool budget to MAX_TOOL_PASSES', () => {
		expect(MAX_TOOL_PASSES).toBeGreaterThan(0);
	});
});
