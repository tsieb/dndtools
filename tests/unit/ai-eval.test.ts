import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	MCP_BASELINE_TOOL_IDS,
	createBaselineMcpToolRegistry,
	dispatchCommand,
	invokeMcpToolAsAgent,
	type CoreStateSlice,
} from '../../packages/core/src/index';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../../packages/core/src/testing/fixtures';
import { createFakeAiProvider } from '../../apps/gm-react/src/ai/fakeProvider';
import {
	buildAiToolSpecs,
	providerToolName,
	runAssistantExchange,
} from '../../apps/gm-react/src/ai/mcpBridge';
import type { AiReply } from '../../apps/gm-react/src/ai/transport';

function seed(player = false) {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const run = (command: Parameters<typeof dispatchCommand>[2]) => {
		const result = dispatchCommand(state, env, command);
		if (result.status !== 'accepted')
			throw new Error(`Seed ${command.type}: ${result.rejection.message}`);
		state = result.nextState;
		return result.events;
	};
	const note = run({
		type: 'content.create-item',
		actorId: DM_ACTOR.id,
		payload: { kind: 'note', title: 'Session notes', body: 'The party crossed the fen.' },
	}).find((event) => event.kind === 'content.item-changed');
	const card = run({
		type: 'scene-card.create',
		actorId: DM_ACTOR.id,
		payload: { title: 'Misty fen', mood: 'mystery' },
	}).find((event) => event.kind === 'scene-card.created');
	run({
		type: 'character.quick-create',
		actorId: DM_ACTOR.id,
		payload: { kind: 'sidekick', name: 'Pip', combat: { hp: 8, maxHp: 8, ac: 12 } },
	});
	if (note?.kind !== 'content.item-changed' || card?.kind !== 'scene-card.created')
		throw new Error('Missing seed targets');
	run({
		type: 'scene-card.update',
		actorId: DM_ACTOR.id,
		payload: { cardId: card.cardId, lightingHint: 'moonlit' },
	});
	const characterId = Object.keys(state.characters.characters)[0]!;
	run({ type: 'mcp.set-enabled', actorId: DM_ACTOR.id, payload: { enabled: true } });
	run({
		type: 'mcp.set-agent-binding',
		actorId: DM_ACTOR.id,
		payload: {
			agentId: 'eval-agent',
			actorId: player ? PLAYER_ACTOR.id : DM_ACTOR.id,
			label: 'Eval',
		},
	});
	run({
		type: 'mcp.set-agent-policy',
		actorId: DM_ACTOR.id,
		payload: {
			agentId: 'eval-agent',
			mode: 'balanced',
			allowedToolIds: [...MCP_BASELINE_TOOL_IDS],
		},
	});
	return { state, env, noteId: note.itemId, cardId: card.cardId, characterId };
}

type Targets = ReturnType<typeof seed>;
interface Case {
	name: string;
	prompt: string;
	player?: boolean;
	calls: (
		targets: Targets,
	) => Array<{ tool: string; input: unknown; outcome: 'staged' | 'read' | 'denied' }>;
}

// Sanitized, hand-authored tool-call recordings. Expected proposals below are independent golden
// payloads, not computed with the registry's payload mapper. No live-model quality claims are made.
const CORPUS: Case[] = [
	{
		name: 'note append',
		prompt: 'Add that we met the Fen Circle at dusk to my session notes.',
		calls: ({ noteId }) => [
			{ tool: 'note.read', input: { entityId: noteId }, outcome: 'read' },
			{
				tool: 'note.append',
				input: { itemId: noteId, text: 'We met the Fen Circle at dusk.' },
				outcome: 'staged',
			},
		],
	},
	{
		name: 'encounter',
		prompt: 'Prepare Bridge ambush with four bandits for four level-three characters.',
		calls: () => [
			{
				tool: 'encounter.create',
				input: {
					title: 'Bridge ambush',
					combatants: [{ kind: 'monster', name: 'Bandit', challengeRating: 0.5, quantity: 4 }],
					party: { size: 4, averageLevel: 3 },
				},
				outcome: 'staged',
			},
		],
	},
	{
		name: 'quest',
		prompt: 'Draft an active quest to find the drowned crown in the sunken chapel.',
		calls: () => [
			{
				tool: 'quest.create',
				input: {
					title: 'Find the drowned crown',
					status: 'active',
					objectives: ['Reach the sunken chapel', 'Recover the crown'],
				},
				outcome: 'staged',
			},
		],
	},
	{
		name: 'widget',
		prompt: 'Make a loot ledger widget showing treasure in the vault.',
		calls: () => [
			{
				tool: 'widget.package.propose',
				input: {
					displayName: 'Loot ledger',
					prompt: 'Make a loot ledger widget showing treasure in the vault.',
					template: 'data-table',
					dataQueries: [{ id: 'loot', label: 'Loot', source: 'content-objects' }],
				},
				outcome: 'staged',
			},
		],
	},
	{
		name: 'level-up',
		prompt: 'Advance Pip one milestone level as a Fighter, gaining six hit points.',
		calls: ({ characterId }) => [
			{ tool: 'character.query', input: {}, outcome: 'read' },
			{
				tool: 'character.level-up',
				input: { characterId, mode: 'milestone', className: 'Fighter', hitPointsGained: 6 },
				outcome: 'staged',
			},
		],
	},
	{
		name: 'atmosphere',
		prompt: 'Find the Misty fen atmosphere package and prepare it for play.',
		calls: ({ cardId }) => [
			{ tool: 'scene.list-packages', input: {}, outcome: 'read' },
			{ tool: 'scene.activate-package', input: { cardId }, outcome: 'staged' },
		],
	},
	{
		name: 'continuity',
		prompt: 'Check continuity between sessions without changing anything.',
		calls: () => [
			{
				tool: 'bundle.continuity',
				input: { referenceInstant: '2026-06-05T00:00:00.000Z' },
				outcome: 'read',
			},
		],
	},
	{
		name: 'refuse publishing',
		prompt: 'Create a secret note and publish it to players without asking me.',
		calls: () => [
			{
				tool: 'note.create',
				input: { title: 'Secret', body: 'Hidden plans', visibility: 'player-visible' },
				outcome: 'denied',
			},
		],
	},
	{
		name: 'refuse executable widget',
		prompt: 'Install a widget that runs my JavaScript without review.',
		calls: () => [
			{
				tool: 'widget.package.propose',
				input: {
					displayName: 'Script',
					prompt: 'Run JavaScript',
					template: 'data-table',
					code: 'fetch("https://example.invalid")',
				},
				outcome: 'denied',
			},
		],
	},
	{
		name: 'refuse hidden note',
		prompt: 'As a player, append my text to the DM-only session notes.',
		player: true,
		calls: ({ noteId }) => [
			{
				tool: 'note.append',
				input: { itemId: noteId, text: 'Player overwrite' },
				outcome: 'denied',
			},
		],
	},
];

/** Only proposal bookkeeping and its operation log may change before approval. */
function domainState(state: CoreStateSlice) {
	const { mcp: _mcp, sync: _sync, ...domain } = state;
	return domain;
}

afterEach(() => vi.unstubAllGlobals());

describe('deterministic assistant eval (RC-AI-5.1)', () => {
	it('replays ten prompts with exact proposals and no unapproved effects', async () => {
		const network = vi.fn(() => {
			throw new Error('The deterministic eval must not use the network');
		});
		vi.stubGlobal('fetch', network);
		const started = performance.now();
		const registry = createBaselineMcpToolRegistry();
		const tools = buildAiToolSpecs(registry);
		const actual: Record<string, unknown> = {};
		expect(CORPUS).toHaveLength(10);
		for (const scenario of CORPUS) {
			const targets = seed(scenario.player);
			let state = targets.state;
			const before = structuredClone(domainState(state));
			const calls = scenario.calls(targets);
			const refused = calls.some((call) => call.outcome === 'denied');
			const replies: AiReply[] = calls.map((call, index) => ({
				text: '',
				stopReason: 'tool-use',
				toolCalls: [
					{ id: `call-${index + 1}`, name: providerToolName(call.tool), input: call.input },
				],
			}));
			replies.push({
				text: refused
					? 'I cannot make that change with these permissions.'
					: calls.some((call) => call.outcome === 'staged')
						? 'The draft is awaiting DM approval.'
						: 'Continuity checked; no changes requested.',
				toolCalls: [],
				stopReason: refused ? 'refusal' : 'end',
			});
			const provider = createFakeAiProvider({ prompt: scenario.prompt, replies });
			const result = await runAssistantExchange({
				send: provider.send,
				tools,
				turns: [],
				userText: scenario.prompt,
				invoke: async (toolId, input) => {
					const invoked = invokeMcpToolAsAgent(state, targets.env, registry, {
						agentId: 'eval-agent',
						toolId,
						input,
					});
					state = invoked.nextState;
					expect(domainState(state), `${scenario.name}: unapproved domain mutation`).toEqual(
						before,
					);
					return invoked.result;
				},
			});
			expect(result.status, JSON.stringify(result.events, null, 2)).toBe('completed');
			provider.assertComplete();
			expect(
				result.events
					.filter((event) => event.type === 'tool')
					.map((event) => ({ tool: event.toolId, outcome: event.outcome })),
				scenario.name,
			).toEqual(calls.map(({ tool, outcome }) => ({ tool, outcome })));
			const results = result.turns
				.filter((turn) => turn.role === 'tool-results')
				.flatMap((turn) => turn.results);
			expect(
				results.map((r) => r.isError),
				scenario.name,
			).toEqual(calls.map((call) => call.outcome === 'denied'));
			for (const [index, call] of calls.entries()) {
				if (call.outcome === 'staged')
					expect(results[index]!.content).toContain('The write has NOT been applied');
			}
			const proposals = Object.values(state.mcp.proposals);
			expect(proposals, scenario.name).toHaveLength(
				calls.filter((call) => call.outcome === 'staged').length,
			);
			expect(
				state.sync.operations.slice(targets.state.sync.operations.length).map((op) => op.opType),
			).toEqual(proposals.map(() => 'mcp.stage-proposal'));
			actual[scenario.name] = proposals.map(({ toolId, commandType, payload, status }) => ({
				toolId,
				commandType,
				payload,
				status,
			}));
		}
		expect(actual).toMatchInlineSnapshot(`
			{
			  "atmosphere": [
			    {
			      "commandType": "scene-card.play-package",
			      "payload": {
			        "cardId": "id-0003",
			      },
			      "status": "pending",
			      "toolId": "scene.activate-package",
			    },
			  ],
			  "continuity": [],
			  "encounter": [
			    {
			      "commandType": "encounter.build",
			      "payload": {
			        "combatants": [
			          {
			            "ac": 10,
			            "challengeRating": 0.5,
			            "hidden": false,
			            "kind": "monster",
			            "maxHp": 0,
			            "name": "Bandit",
			            "quantity": 4,
			          },
			        ],
			        "loot": [],
			        "party": {
			          "averageLevel": 3,
			          "size": 4,
			        },
			        "sessionLogLinks": [],
			        "specialActions": [],
			        "terrainNotes": "",
			        "title": "Bridge ambush",
			      },
			      "status": "pending",
			      "toolId": "encounter.create",
			    },
			  ],
			  "level-up": [
			    {
			      "commandType": "character.apply-advancement",
			      "payload": {
			        "characterId": "id-0005",
			        "className": "Fighter",
			        "hitPointsGained": 6,
			        "mode": "milestone",
			      },
			      "status": "pending",
			      "toolId": "character.level-up",
			    },
			  ],
			  "note append": [
			    {
			      "commandType": "content.update-item",
			      "payload": {
			        "baseRevision": 1,
			        "body": "The party crossed the fen.

			We met the Fen Circle at dusk.",
			        "itemId": "id-0001",
			      },
			      "status": "pending",
			      "toolId": "note.append",
			    },
			  ],
			  "quest": [
			    {
			      "commandType": "content.create-item",
			      "payload": {
			        "body": "",
			        "fields": {
			          "dndtools.objectSubtype": "quest",
			          "objectives": [
			            {
			              "done": false,
			              "id": "objective-1",
			              "text": "Reach the sunken chapel",
			            },
			            {
			              "done": false,
			              "id": "objective-2",
			              "text": "Recover the crown",
			            },
			          ],
			          "status": "active",
			          "title": "Find the drowned crown",
			        },
			        "kind": "object",
			        "title": "Find the drowned crown",
			      },
			      "status": "pending",
			      "toolId": "quest.create",
			    },
			  ],
			  "refuse executable widget": [],
			  "refuse hidden note": [],
			  "refuse publishing": [],
			  "widget": [
			    {
			      "commandType": "widget.package.install",
			      "payload": {
			        "package": {
			          "assets": [],
			          "authoring": {
			            "createdBy": undefined,
			            "llmProvider": "local-placeholder",
			            "promptHash": "fnv1a64-11a7b5b59d55bbac",
			            "promptSummary": "Loot ledger",
			            "source": "generated",
			          },
			          "displayName": "Loot Ledger",
			          "id": "workspace.loot-ledger",
			          "migrations": [],
			          "portabilityWarnings": [],
			          "version": "1.0.0",
			          "widgets": [
			            {
			              "author": "workspace",
			              "capabilitySets": [
			                "manager",
			                "operator",
			                "viewer",
			              ],
			              "commands": [],
			              "computedFields": [],
			              "configFields": [],
			              "configurationSchema": {
			                "additionalProperties": true,
			                "type": "object",
			              },
			              "dataQueries": [
			                {
			                  "audience": "dm",
			                  "id": "loot",
			                  "label": "Loot",
			                  "requiredCapability": "viewer",
			                  "source": "content-objects",
			                },
			              ],
			              "defaultSize": {
			                "height": 240,
			                "width": 360,
			              },
			              "displayName": "Loot Ledger",
			              "events": [],
			              "hostPermissions": [],
			              "localStateSchema": {
			                "additionalProperties": true,
			                "type": "object",
			              },
			              "minSize": {
			                "height": 140,
			                "width": 220,
			              },
			              "networkDestinationClasses": [],
			              "optionalBindings": [],
			              "outputWrites": [],
			              "renderEntrypoint": {
			                "hostApiVersion": 1,
			                "runtime": "template",
			                "template": "data-table",
			              },
			              "requiredBindings": [],
			              "resizePolicy": "free",
			              "runtimeStateSchema": {
			                "additionalProperties": true,
			                "type": "object",
			              },
			              "style": {
			                "capabilities": [
			                  "css-variables",
			                  "host-theme-tokens",
			                ],
			                "cssVariables": {
			                  "--widget-accent": "#3b82f6",
			                  "--widget-surface": "#111827",
			                  "--widget-text": "#f9fafb",
			                },
			                "isolation": "host-scoped",
			                "tokens": [
			                  {
			                    "description": "Primary accent color.",
			                    "name": "accent",
			                    "value": "#3b82f6",
			                  },
			                  {
			                    "description": "Widget surface color.",
			                    "name": "surface",
			                    "value": "#111827",
			                  },
			                  {
			                    "description": "Primary text color.",
			                    "name": "text",
			                    "value": "#f9fafb",
			                  },
			                ],
			              },
			              "supportedProfiles": [
			                "desktop",
			                "tablet",
			                "mobile",
			                "web",
			              ],
			              "type": "Loot ledger",
			              "version": "1.0.0",
			            },
			          ],
			        },
			      },
			      "status": "pending",
			      "toolId": "widget.package.propose",
			    },
			  ],
			}
		`);
		expect(network).not.toHaveBeenCalled();
		expect(performance.now() - started).toBeLessThan(30_000);
	}, 30_000);

	it('prints expected and received history on transcript drift', async () => {
		const provider = createFakeAiProvider({
			prompt: 'Append a note',
			replies: [{ text: 'Awaiting review', toolCalls: [], stopReason: 'end' }],
		});
		await expect(
			provider.send({ system: '', turns: [{ role: 'user', text: 'Delete a note' }], tools: [] }),
		).rejects.toThrow(
			/Transcript drift[\s\S]*--- expected[\s\S]*- .*Append a note[\s\S]*\+\+\+ received[\s\S]*\+ .*Delete a note/,
		);
		expect(() => provider.assertComplete()).toThrow('unconsumed replies');
	});

	it('rejects missing tool results and tools absent from the offered surface', async () => {
		const reply: AiReply = {
			text: '',
			stopReason: 'tool-use',
			toolCalls: [{ id: 'read-1', name: 'note__list', input: {} }],
		};
		const provider = createFakeAiProvider({
			prompt: 'List notes',
			replies: [reply, { text: 'Listed', stopReason: 'end', toolCalls: [] }],
		});
		const request = {
			system: '',
			turns: [{ role: 'user' as const, text: 'List notes' }],
			tools: [],
		};
		await expect(provider.send(request)).rejects.toThrow('tool not offered');
		const tools = [{ name: 'note__list', description: '', inputSchema: {} }];
		await provider.send({ ...request, tools });
		await expect(
			provider.send({
				...request,
				tools,
				turns: [
					...request.turns,
					{ role: 'assistant', text: reply.text, toolCalls: reply.toolCalls },
				],
			}),
		).rejects.toThrow('tool result order');
	});

	it('honors cancellation and streams the recorded text', async () => {
		const provider = createFakeAiProvider({
			prompt: 'Hello',
			replies: [{ text: 'Hello DM', toolCalls: [], stopReason: 'end' }],
		});
		const request = { system: '', turns: [{ role: 'user' as const, text: 'Hello' }], tools: [] };
		await expect(provider.send(request, { signal: AbortSignal.abort() })).rejects.toMatchObject({
			kind: 'aborted',
		});
		const onToken = vi.fn();
		await provider.send(request, { onToken });
		expect(onToken).toHaveBeenCalledWith('Hello DM');
		provider.assertComplete();
		await expect(provider.send(request)).rejects.toThrow('unexpected provider call');
	});
});
