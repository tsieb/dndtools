/**
 * ai-agent-smoke — drive the REAL agentic MCP pipeline against a LIVE local model (ADR-025).
 *
 * This is the "test the AI's MCP capabilities against a real model" harness. It boots a headless
 * Processing-Core state (no browser, no runtime), enables MCP, binds a DM agent under a staging
 * policy, then runs the SAME exchange loop the app uses (`runAssistantExchange`) with:
 *   - `send`  → a minimal OpenAI-compatible call to a local Ollama server (default qwen2.5:7b), and
 *   - `invoke`→ the Core's fail-closed `invokeMcpToolAsAgent` (identity → policy → stage pipeline).
 *
 * It asserts that, from a plain-English ask, the model works through the tools and lands a STAGED,
 * schema-valid proposal — proving the write tools (table.create, character.create, and the RC-AI-1.2
 * encounter/quest/faction creators) are usable by a real model end to end. The tools that need an
 * existing target (map.poi.create, scene.card.update, note.append) are not scenarios here: this
 * harness runs an EMPTY headless vault, so they are covered by dedicated core tests instead. Skips
 * cleanly (exit 0) when Ollama is not running, so CI without a local model is unaffected.
 *
 * Run:  pnpm tsx scripts/ai-agent-smoke.ts   (or: OLLAMA_MODEL=llama3.1:8b pnpm tsx scripts/ai-agent-smoke.ts)
 */
import { z } from 'zod';
import {
	MCP_BASELINE_TOOL_IDS,
	MCP_POLICY_MODES,
	buildEncounterInputSchema,
	createBaselineMcpToolRegistry,
	createContentItemInputSchema,
	dispatchCommand,
	invokeMcpToolAsAgent,
	quickCreateCharacterInputSchema,
	type CoreEnvironment,
	type CoreStateSlice,
	type McpAgentToolResult,
	type McpStagedProposal,
} from '../packages/core/src/index';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../packages/core/src/testing/fixtures';
import { buildAiToolSpecs, runAssistantExchange } from '../apps/gm-react/src/ai/mcpBridge';
import { LOCAL_OLLAMA } from '../apps/gm-react/src/ai/localLlmGuidance';
import type { AiChatRequest, AiReply, AiToolCall } from '../apps/gm-react/src/ai/transport';

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? new URL(LOCAL_OLLAMA.baseUrl).origin;
const MODEL = process.env.OLLAMA_MODEL ?? LOCAL_OLLAMA.defaultModel;
// `ai:smoke` stays convenient on machines without a local runner; `ai:verify:local` sets this so
// automation fails loudly instead of silently skipping the only live-model portion of the suite.
const REQUIRE_LIVE = process.env.OLLAMA_REQUIRE_LIVE === '1';
const AGENT_ID = 'smoke-agent';

// A staging mode (never trusted_direct) so every write becomes a proposal we can inspect.
const STAGING_MODE =
	MCP_POLICY_MODES.find((m) => m === 'balanced') ??
	MCP_POLICY_MODES.find((m) => m !== 'trusted_direct') ??
	MCP_POLICY_MODES[0];

// --- a tiny OpenAI-compatible client for Ollama (mirrors transport.ts shaping; no network policy) ---

interface OpenAiMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | null;
	tool_call_id?: string;
	tool_calls?: Array<{
		id: string;
		type: 'function';
		function: { name: string; arguments: string };
	}>;
}

function toOpenAiMessages(request: AiChatRequest): OpenAiMessage[] {
	const messages: OpenAiMessage[] = [{ role: 'system', content: request.system }];
	for (const turn of request.turns) {
		if (turn.role === 'user') {
			messages.push({ role: 'user', content: turn.text });
		} else if (turn.role === 'assistant') {
			messages.push({
				role: 'assistant',
				content: turn.text === '' ? null : turn.text,
				...(turn.toolCalls.length > 0
					? {
							tool_calls: turn.toolCalls.map((call) => ({
								id: call.id,
								type: 'function' as const,
								function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) },
							})),
						}
					: {}),
			});
		} else {
			for (const result of turn.results) {
				messages.push({
					role: 'tool',
					tool_call_id: result.toolCallId,
					content: `${result.isError ? 'ERROR: ' : ''}${result.content}`,
				});
			}
		}
	}
	return messages;
}

async function sendOllama(request: AiChatRequest): Promise<AiReply> {
	const body = {
		model: MODEL,
		messages: toOpenAiMessages(request),
		...(request.tools.length > 0
			? {
					tools: request.tools.map((tool) => ({
						type: 'function' as const,
						function: {
							name: tool.name,
							description: tool.description,
							parameters: tool.inputSchema,
						},
					})),
				}
			: {}),
	};
	const response = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (!response.ok) throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
	const parsed = (await response.json()) as {
		choices?: Array<{
			message?: {
				content?: string | null;
				tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
			};
			finish_reason?: string;
		}>;
	};
	const choice = parsed.choices?.[0];
	const toolCalls: AiToolCall[] = (choice?.message?.tool_calls ?? [])
		.filter((c) => typeof c.id === 'string' && typeof c.function?.name === 'string')
		.map((c) => {
			let input: unknown;
			try {
				input = JSON.parse(c.function?.arguments || '{}');
			} catch {
				input = {};
			}
			return { id: c.id as string, name: c.function?.name as string, input };
		});
	const finish = choice?.finish_reason;
	const stopReason: AiReply['stopReason'] =
		finish === 'stop'
			? 'end'
			: finish === 'tool_calls'
				? 'tool-use'
				: finish === 'length'
					? 'max-tokens'
					: 'other';
	return { text: choice?.message?.content ?? '', toolCalls, stopReason };
}

// --- headless Core state: DM actor, MCP on, a staged DM-bound agent with the full tool surface -------

function seedState(): { state: CoreStateSlice; env: CoreEnvironment } {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const run = (command: Parameters<typeof dispatchCommand>[2]): void => {
		const result = dispatchCommand(state, env, command);
		if (result.status !== 'accepted') {
			throw new Error(`setup command ${command.type} rejected: ${result.rejection.message}`);
		}
		state = result.nextState;
	};
	run({ type: 'mcp.set-enabled', actorId: DM_ACTOR.id, payload: { enabled: true } });
	run({
		type: 'mcp.set-agent-binding',
		actorId: DM_ACTOR.id,
		payload: { agentId: AGENT_ID, actorId: DM_ACTOR.id, label: 'Smoke agent' },
	});
	run({
		type: 'mcp.set-agent-policy',
		actorId: DM_ACTOR.id,
		payload: { agentId: AGENT_ID, mode: STAGING_MODE, allowedToolIds: [...MCP_BASELINE_TOOL_IDS] },
	});
	return { state, env };
}

// --- one scenario: prompt the model, then assert a staged, schema-valid proposal exists --------------

interface Scenario {
	name: string;
	prompt: string;
	commandType: string;
	schema: z.ZodType;
	/**
	 * The tool the scenario expects. Required whenever several tools share one `commandType` (quest,
	 * faction, table, and note creation all dispatch `content.create-item`), so the assertion cannot
	 * pass on a proposal the model staged with a different tool.
	 */
	toolId?: string;
}

const SCENARIOS: Scenario[] = [
	{
		name: 'random-table generation → table.create',
		prompt:
			'Generate a random d8 table of eerie sounds heard in a haunted swamp at night, and SAVE it as a ' +
			'rollable table. The table needs a title, the dice expression "1d8", and exactly 8 result rows.',
		commandType: 'content.create-item',
		toolId: 'table.create',
		schema: createContentItemInputSchema,
	},
	{
		name: 'NPC creation → character.create',
		prompt:
			'Create a CR2 goblin boss NPC named Gralk for my campaign. Give it ability scores, a small combat ' +
			'block (hp, maxHp, ac), and put its class and level in the data field. Stage it for my review.',
		commandType: 'character.quick-create',
		schema: quickCreateCharacterInputSchema,
	},
	// RC-AI-1.2 — the campaign-authoring write tools. Each proves a real model can drive the tool from
	// plain English to a staged, schema-valid proposal for the bound command.
	{
		name: 'encounter building → encounter.create',
		prompt:
			'Build me a combat encounter called "Bridge ambush" for a party of four level-3 characters: ' +
			'four CR 1/2 bandits and one CR 2 bandit captain, on a rope bridge over a gorge. Stage it for ' +
			'my review.',
		commandType: 'encounter.build',
		toolId: 'encounter.create',
		schema: buildEncounterInputSchema,
	},
	{
		name: 'quest authoring → quest.create',
		prompt:
			'Create an active quest called "Find the drowned crown" with three objectives the party works ' +
			'through in order, and a short paragraph of hooks and rewards in the body. Stage it for review.',
		commandType: 'content.create-item',
		toolId: 'quest.create',
		schema: createContentItemInputSchema,
	},
	{
		name: 'faction authoring → faction.create',
		prompt:
			'Write me a faction dossier for a hostile swamp cult called The Fen Circle: give it a leader, ' +
			'two or three goals in priority order, and one secret only I should know. Stage it for review.',
		commandType: 'content.create-item',
		toolId: 'faction.create',
		schema: createContentItemInputSchema,
	},
];

async function runScenario(scenario: Scenario): Promise<boolean> {
	const { state: seeded, env } = seedState();
	let state = seeded;
	const registry = createBaselineMcpToolRegistry();

	const invoke = async (toolId: string, input: unknown): Promise<McpAgentToolResult> => {
		const { result, nextState } = invokeMcpToolAsAgent(state, env, registry, {
			agentId: AGENT_ID,
			toolId,
			input,
		});
		state = nextState;
		return result;
	};

	console.log(`\n▶ ${scenario.name}`);
	const result = await runAssistantExchange({
		send: sendOllama,
		invoke,
		tools: buildAiToolSpecs(registry),
		turns: [],
		userText: scenario.prompt,
		maxToolPasses: 8,
	});

	for (const event of result.events) {
		if (event.type === 'tool') {
			console.log(
				`   · ${event.toolId} → ${event.outcome}${event.detail ? ` (${event.detail})` : ''}`,
			);
		}
	}

	// The proof: a staged proposal for the expected command whose captured payload is schema-valid.
	const proposals = Object.values(state.mcp.proposals) as McpStagedProposal[];
	const match = proposals.find(
		(p) =>
			p.commandType === scenario.commandType &&
			(scenario.toolId === undefined || p.toolId === scenario.toolId),
	);
	if (!match) {
		console.log(
			`   ✗ FAIL — no staged proposal for ${scenario.toolId ?? scenario.commandType} (model did not complete the task)`,
		);
		return false;
	}
	const parsed = scenario.schema.safeParse(match.payload);
	if (!parsed.success) {
		console.log(
			`   ✗ FAIL — staged payload did not validate: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
		);
		return false;
	}
	console.log(`   ✓ PASS — staged ${match.toolId} proposal ${match.id}, payload schema-valid`);
	return true;
}

async function main(): Promise<void> {
	// Skip cleanly when the local model isn't running — CI without Ollama stays green. Strict local
	// verification opts in to failure so a scheduled/local gate cannot mistake a skipped run for proof.
	let tags: { models?: Array<{ name?: string }> } | null = null;
	try {
		const res = await fetch(`${OLLAMA_BASE}/api/tags`);
		if (res.ok) tags = (await res.json()) as typeof tags;
	} catch {
		tags = null;
	}
	if (!tags) {
		const prefix = REQUIRE_LIVE ? '✗ FAIL' : '⏭';
		console.log(`${prefix} Ollama not reachable at ${OLLAMA_BASE}.`);
		console.log(`    Start it with:  ~/.local/bin/ollama serve   and   ollama pull ${MODEL}`);
		process.exit(REQUIRE_LIVE ? 1 : 0);
	}
	const names = (tags.models ?? []).map((m) => m.name).filter(Boolean);
	if (!names.includes(MODEL)) {
		const prefix = REQUIRE_LIVE ? '✗ FAIL' : '⏭';
		console.log(`${prefix} Model "${MODEL}" not pulled (have: ${names.join(', ') || 'none'}).`);
		console.log(`    Pull it with:  ollama pull ${MODEL}`);
		process.exit(REQUIRE_LIVE ? 1 : 0);
	}

	console.log(`Running MCP agent smoke test against ${MODEL} (policy: ${STAGING_MODE})`);
	const results: boolean[] = [];
	for (const scenario of SCENARIOS) {
		try {
			results.push(await runScenario(scenario));
		} catch (error) {
			console.log(`   ✗ FAIL — ${error instanceof Error ? error.message : String(error)}`);
			results.push(false);
		}
	}
	const passed = results.filter(Boolean).length;
	console.log(`\n${passed}/${results.length} scenarios passed.`);
	process.exit(passed === results.length ? 0 : 1);
}

void main();
