import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	ALL_WIDGET_DATA_QUERY_SOURCES,
	ALL_WIDGET_TEMPLATE_KINDS,
	MCP_BASELINE_TOOL_IDS,
	createBaselineMcpToolRegistry,
	dispatchCommand,
	hashWidgetPromptText,
	invokeMcpToolAsAgent,
	type CommandResult,
	type CoreStateSlice,
	type WidgetPackageDefinition,
} from '../src';
import { installWidgetPackageInputSchema } from '../src/schemas/commands';

/**
 * RC-WID-3.1 — `widget.package.propose`.
 *
 * The invariants these tests protect:
 *   - the STAGED payload is a fully validated `WidgetPackageDefinition` (approval re-dispatches
 *     `proposal.payload` verbatim, so a raw tool input parked here would install nothing);
 *   - a proposed widget is a TEMPLATE widget: no code assets, no host permissions, no network
 *     classes — an agent cannot author executable widget code;
 *   - provenance is `generated` and carries the prompt's fingerprint, not the prompt;
 *   - approving it installs the package UNREVIEWED, DISABLED, permission-denied.
 */

const env = makeEnvironment();

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status, JSON.stringify(result)).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function seedAgent(): CoreStateSlice {
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	state = accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-enabled',
			actorId: DM_ACTOR.id,
			payload: { enabled: true },
		}),
	).nextState;
	state = accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-binding',
			actorId: DM_ACTOR.id,
			payload: { agentId: 'agent-dm', actorId: DM_ACTOR.id, label: 'bot' },
		}),
	).nextState;
	return accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-policy',
			actorId: DM_ACTOR.id,
			payload: {
				agentId: 'agent-dm',
				mode: 'strict_review',
				allowedToolIds: [...MCP_BASELINE_TOOL_IDS],
			},
		}),
	).nextState;
}

function propose(
	state: CoreStateSlice,
	input: unknown,
): { state: CoreStateSlice; proposalId: string } {
	const { result, nextState } = invokeMcpToolAsAgent(state, env, createBaselineMcpToolRegistry(), {
		agentId: 'agent-dm',
		toolId: 'widget.package.propose',
		input,
	});
	expect(result.status, JSON.stringify(result)).toBe('staged');
	if (result.status !== 'staged') throw new Error('expected staged');
	return { state: nextState, proposalId: result.proposalId };
}

/** The "make me a loot ledger widget" draft the smoke harness asks a real model to produce. */
const LOOT_LEDGER = {
	displayName: 'Party loot ledger',
	description: 'What the party is carrying and what it is worth.',
	prompt: 'Make me a loot ledger widget that shows what the party has picked up.',
	template: 'data-table',
	dataQueries: [
		{ id: 'loot', label: 'Loot items', source: 'content-objects', audience: 'shared' },
		{ id: 'party', label: 'Party', source: 'visible-characters' },
	],
	configFields: [{ key: 'show-value', label: 'Show gold value', control: 'toggle' }],
	commands: [{ type: 'mark-sold', displayName: 'Mark as sold', writesTo: 'entity' }],
	styleTokens: [{ name: 'accent', value: 'var(--color-accent)' }],
} as const;

describe('widget.package.propose — a structured draft becomes a staged, installable package', () => {
	it('is an allowlisted durable write tool bound to widget.package.install', () => {
		const tool = createBaselineMcpToolRegistry().get('widget.package.propose');
		expect(tool?.kind).toBe('write');
		if (tool?.kind !== 'write') throw new Error('expected a write tool');
		expect(tool.commandType).toBe('widget.package.install');
		expect(tool.writeRisk).toBe('durable');
		expect(MCP_BASELINE_TOOL_IDS).toContain('widget.package.propose');
	});

	it('teaches the model every template kind and every data source', () => {
		const tool = createBaselineMcpToolRegistry().get('widget.package.propose');
		const description = tool?.description ?? '';
		for (const kind of ALL_WIDGET_TEMPLATE_KINDS) expect(description).toContain(kind);
		for (const source of ALL_WIDGET_DATA_QUERY_SOURCES) expect(description).toContain(source);
	});

	it('stages a validated WidgetPackageDefinition, not the raw tool input', () => {
		const { state, proposalId } = propose(seedAgent(), LOOT_LEDGER);
		const payload = state.mcp.proposals[proposalId]!.payload;
		const parsed = installWidgetPackageInputSchema.safeParse(payload);
		expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
		const definition = (payload as { package: WidgetPackageDefinition }).package;
		expect(definition.id).toBe('workspace.party-loot-ledger');
		expect(definition.widgets[0]!.renderEntrypoint).toMatchObject({
			runtime: 'template',
			template: 'data-table',
		});
		expect(definition.widgets[0]!.dataQueries?.map((query) => query.source)).toEqual([
			'content-objects',
			'visible-characters',
		]);
		expect(definition.widgets[0]!.configFields?.[0]).toMatchObject({
			key: 'show-value',
			control: 'toggle',
		});
		expect(definition.widgets[0]!.commands[0]).toMatchObject({
			type: 'mark-sold',
			writesTo: 'entity',
		});
	});

	it('records provenance generated plus the prompt fingerprint, never the prompt', () => {
		const { state, proposalId } = propose(seedAgent(), LOOT_LEDGER);
		const definition = (
			state.mcp.proposals[proposalId]!.payload as { package: WidgetPackageDefinition }
		).package;
		expect(definition.authoring?.source).toBe('generated');
		expect(definition.authoring?.promptHash).toBe(hashWidgetPromptText(LOOT_LEDGER.prompt));
		expect(JSON.stringify(definition)).not.toContain(LOOT_LEDGER.prompt);
	});

	it('can never author executable code, host permissions, or network access', () => {
		const { state, proposalId } = propose(seedAgent(), LOOT_LEDGER);
		const definition = (
			state.mcp.proposals[proposalId]!.payload as { package: WidgetPackageDefinition }
		).package;
		expect(definition.assets).toEqual([]);
		expect(definition.widgets[0]!.hostPermissions).toEqual([]);
		expect(definition.widgets[0]!.networkDestinationClasses).toEqual([]);
	});

	it('defaults an unclassified query to the DM audience', () => {
		const { state, proposalId } = propose(seedAgent(), LOOT_LEDGER);
		const definition = (
			state.mcp.proposals[proposalId]!.payload as { package: WidgetPackageDefinition }
		).package;
		const party = definition.widgets[0]!.dataQueries?.find((query) => query.id === 'party');
		expect(party?.audience).toBe('dm');
	});

	it('approval installs the package unreviewed, disabled, and permission-denied', () => {
		const { state, proposalId } = propose(seedAgent(), LOOT_LEDGER);
		const approved = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.approve-proposal',
				actorId: DM_ACTOR.id,
				payload: { proposalId },
			}),
		).nextState;
		const record = approved.widgets.packages['workspace.party-loot-ledger'];
		expect(record).toBeDefined();
		expect(record!.enabled).toBe(false);
		expect(record!.trust.state).toBe('unreviewed');
		expect(Object.values(record!.trust.hostPermissions)).not.toContain('approved');
	});

	it.each([
		[
			'an unknown template kind',
			{ ...LOOT_LEDGER, template: 'timeline', dataQueries: [], commands: [] },
		],
		[
			'an unknown data source',
			{
				...LOOT_LEDGER,
				dataQueries: [{ id: 'x', label: 'X', source: 'everything' }],
				commands: [],
			},
		],
		[
			'a binding query naming no binding',
			{
				...LOOT_LEDGER,
				dataQueries: [{ id: 'x', label: 'X', source: 'binding', bindingIds: ['ghost'] }],
				commands: [],
			},
		],
		[
			'smuggled custom code',
			{ ...LOOT_LEDGER, javascript: 'fetch("https://example.com")', commands: [] },
		],
		[
			'a requested host permission',
			{ ...LOOT_LEDGER, hostPermissions: ['clipboard'], commands: [] },
		],
		[
			'a command declaring a player-visible destination',
			{
				...LOOT_LEDGER,
				commands: [
					{
						type: 'push',
						displayName: 'Push to players',
						writesTo: 'scene',
						destinationClass: 'player-visible-state',
					},
				],
			},
		],
	])('denies %s before anything is staged', (_label, input) => {
		const seeded = seedAgent();
		const { result, nextState } = invokeMcpToolAsAgent(
			seeded,
			env,
			createBaselineMcpToolRegistry(),
			{ agentId: 'agent-dm', toolId: 'widget.package.propose', input },
		);
		expect(result.status).toBe('denied');
		if (result.status !== 'denied') throw new Error('expected denied');
		expect(result.reason).toBe('invalid-input');
		expect(nextState).toBe(seeded);
		expect(Object.values(nextState.mcp.proposals)).toHaveLength(0);
	});
});
