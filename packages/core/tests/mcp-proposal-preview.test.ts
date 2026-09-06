import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
	withMcpEnabled,
} from '../src/testing/fixtures';
import {
	computeMcpProposalPreview,
	createBaselineMcpToolRegistry,
	dispatchCommand,
	invokeMcpToolAsAgent,
	type CommandResult,
	type CoreStateSlice,
	type McpAgentInvokeOutput,
	type McpStagedProposal,
} from '../src';

/**
 * RC-AI-2.1 — SEMANTIC DIFF PREVIEW FOR PROPOSALS. A staged proposal records only what the approval
 * needs to re-dispatch the write; these tests prove the preview turns that into something a DM can
 * actually review — a structural field summary, a line delta over the body, and the backlink impact —
 * without snapshotting anything onto the durable proposal and without widening what an agent can read.
 */

const env = makeEnvironment();
const registry = createBaselineMcpToolRegistry();

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function staged(
	output: McpAgentInvokeOutput,
): Extract<McpAgentInvokeOutput['result'], { status: 'staged' }> {
	expect(output.result.status).toBe('staged');
	if (output.result.status !== 'staged') throw new Error('expected staged');
	return output.result;
}

/** Bind `agent-dm` → the DM under `strict_review` with the write tools the previews exercise. */
function seedDmAgent(): CoreStateSlice {
	let state = withMcpEnabled(buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR));
	state = accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-binding',
			actorId: DM_ACTOR.id,
			payload: { agentId: 'agent-dm', actorId: DM_ACTOR.id, label: 'prep bot' },
		}),
	).nextState;
	state = accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-policy',
			actorId: DM_ACTOR.id,
			payload: {
				agentId: 'agent-dm',
				mode: 'strict_review',
				allowedToolIds: ['note.create', 'note.update', 'note.append', 'quest.create'],
			},
		}),
	).nextState;
	return state;
}

/** Create a real note through the DM's own command, returning its id. */
function seedNote(
	state: CoreStateSlice,
	title: string,
	body: string,
): { state: CoreStateSlice; itemId: string } {
	const result = accepted(
		dispatchCommand(state, env, {
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: { kind: 'note', title, body, visibility: 'dm-only' },
		}),
	);
	const itemId = Object.values(result.nextState.content.items).find((i) => i.title === title)!.id;
	return { state: result.nextState, itemId };
}

/** Stage a tool call and hand back the resulting state + the durable proposal record. */
function stageTool(
	state: CoreStateSlice,
	toolId: string,
	input: unknown,
): { state: CoreStateSlice; proposal: McpStagedProposal } {
	const output = invokeMcpToolAsAgent(state, env, registry, { agentId: 'agent-dm', toolId, input });
	const { proposalId } = staged(output);
	return { state: output.nextState, proposal: output.nextState.mcp.proposals[proposalId]! };
}

const ORIGINAL_BODY = [
	'# Ashfall',
	'The keep still stands.',
	'It is guarded by [[Sera Vance]].',
].join('\n');

describe('RC-AI-2.1 — a note update previews as a structural summary + line delta', () => {
	it('reports the changed fields with before and after values', () => {
		const seeded = seedNote(seedDmAgent(), 'Ashfall Keep', ORIGINAL_BODY);
		const nextBody = ['# Ashfall', 'The keep is a ruin.', 'It is guarded by [[Sera Vance]].'].join(
			'\n',
		);
		const { state, proposal } = stageTool(seeded.state, 'note.update', {
			itemId: seeded.itemId,
			baseRevision: seeded.state.content.items[seeded.itemId]!.revision,
			body: nextBody,
		});

		const preview = computeMcpProposalPreview(state, proposal);
		expect(preview.changeKind).toBe('update');
		expect(preview.target).toMatchObject({ kind: 'note', id: seeded.itemId, resolved: true });
		const body = preview.fields.find((f) => f.path === 'body')!;
		expect(body.change).toBe('changed');
		expect(body.before).toContain('The keep still stands.');
		expect(body.after).toContain('The keep is a ruin.');
	});

	it('counts one changed line as one added and one removed, not a whole-file rewrite', () => {
		const seeded = seedNote(seedDmAgent(), 'Ashfall Keep', ORIGINAL_BODY);
		const nextBody = ['# Ashfall', 'The keep is a ruin.', 'It is guarded by [[Sera Vance]].'].join(
			'\n',
		);
		const { state, proposal } = stageTool(seeded.state, 'note.update', {
			itemId: seeded.itemId,
			baseRevision: seeded.state.content.items[seeded.itemId]!.revision,
			body: nextBody,
		});

		expect(computeMcpProposalPreview(state, proposal).lineDelta).toEqual({
			added: 1,
			removed: 1,
			unchanged: 2,
		});
	});

	it('an append shows only added lines and reads as an append', () => {
		const seeded = seedNote(seedDmAgent(), 'Ashfall Keep', ORIGINAL_BODY);
		const { state, proposal } = stageTool(seeded.state, 'note.append', {
			itemId: seeded.itemId,
			text: 'The well has run dry.',
		});

		const preview = computeMcpProposalPreview(state, proposal);
		expect(preview.changeKind).toBe('append');
		expect(preview.lineDelta!.removed).toBe(0);
		expect(preview.lineDelta!.added).toBeGreaterThan(0);
		expect(preview.summary).toContain('Appends to "Ashfall Keep"');
	});

	it('the preview is DETERMINISTIC — the same state + proposal yields the identical preview', () => {
		const seeded = seedNote(seedDmAgent(), 'Ashfall Keep', ORIGINAL_BODY);
		const { state, proposal } = stageTool(seeded.state, 'note.append', {
			itemId: seeded.itemId,
			text: 'again',
		});
		expect(computeMcpProposalPreview(state, proposal)).toEqual(
			computeMcpProposalPreview(state, proposal),
		);
	});
});

describe('RC-AI-2.1 — backlink impact', () => {
	it('lists the wikilinks the proposed body adds and drops', () => {
		const seeded = seedNote(seedDmAgent(), 'Ashfall Keep', ORIGINAL_BODY);
		const nextBody = ['# Ashfall', 'The keep is held by [[Iron Pact]].'].join('\n');
		const { state, proposal } = stageTool(seeded.state, 'note.update', {
			itemId: seeded.itemId,
			baseRevision: seeded.state.content.items[seeded.itemId]!.revision,
			body: nextBody,
		});

		const preview = computeMcpProposalPreview(state, proposal);
		expect(preview.backlinks.added).toEqual(['Iron Pact']);
		expect(preview.backlinks.removed).toEqual(['Sera Vance']);
	});

	it('a title change lists the notes whose links the rename would strand', () => {
		const first = seedNote(seedDmAgent(), 'Ashfall Keep', ORIGINAL_BODY);
		const second = seedNote(first.state, 'Road Warden', 'Patrols out from [[Ashfall Keep]].');
		const { state, proposal } = stageTool(second.state, 'note.update', {
			itemId: first.itemId,
			baseRevision: second.state.content.items[first.itemId]!.revision,
			title: 'Ashfall Ruin',
		});

		const preview = computeMcpProposalPreview(state, proposal);
		expect(preview.backlinks.incoming).toEqual(['Road Warden']);
		expect(preview.fields.find((f) => f.path === 'title')).toMatchObject({
			change: 'changed',
			before: 'Ashfall Keep',
			after: 'Ashfall Ruin',
		});
	});
});

describe('RC-AI-2.1 — the preview is honest when it cannot know', () => {
	it('warns that the base revision drifted when the note changed after staging', () => {
		const seeded = seedNote(seedDmAgent(), 'Ashfall Keep', ORIGINAL_BODY);
		const stagedResult = stageTool(seeded.state, 'note.update', {
			itemId: seeded.itemId,
			baseRevision: seeded.state.content.items[seeded.itemId]!.revision,
			body: 'agent prose',
		});
		// A human edits the same note between staging and review.
		const edited = accepted(
			dispatchCommand(stagedResult.state, env, {
				type: 'content.update-item',
				actorId: DM_ACTOR.id,
				payload: {
					itemId: seeded.itemId,
					baseRevision: stagedResult.state.content.items[seeded.itemId]!.revision,
					body: 'the DM got there first',
				},
			}),
		).nextState;

		const preview = computeMcpProposalPreview(edited, stagedResult.proposal);
		expect(preview.warnings.map((w) => w.code)).toContain('stale-base-revision');
		// It still diffs — against what is actually there now, not the vanished base.
		expect(preview.fields.find((f) => f.path === 'body')!.before).toContain(
			'the DM got there first',
		);
	});

	it('says it has no baseline when the target is not available to the agent actor', () => {
		const seeded = seedNote(seedDmAgent(), 'Ashfall Keep', ORIGINAL_BODY);
		const stagedResult = stageTool(seeded.state, 'note.update', {
			itemId: seeded.itemId,
			baseRevision: seeded.state.content.items[seeded.itemId]!.revision,
			body: 'agent prose',
		});
		// The note is deleted between staging and review; there is nothing left to compare against.
		const deleted = accepted(
			dispatchCommand(stagedResult.state, env, {
				type: 'content.remove-item',
				actorId: DM_ACTOR.id,
				payload: { itemId: seeded.itemId },
			}),
		).nextState;

		const preview = computeMcpProposalPreview(deleted, stagedResult.proposal);
		expect(preview.target.resolved).toBe(false);
		expect(preview.warnings.map((w) => w.code)).toContain('no-baseline');
		expect(preview.lineDelta).toBeNull();
	});

	it('never throws on a proposal whose payload is not an object', () => {
		const state = seedDmAgent();
		const preview = computeMcpProposalPreview(state, {
			id: 'p-bogus',
			agentId: 'agent-dm',
			actorId: DM_ACTOR.id,
			toolId: 'note.update',
			commandType: 'content.update-item',
			payload: 'not an object',
			policyMode: 'strict_review',
			writeRisk: 'durable',
			status: 'pending',
			createdAt: '2026-01-01T00:00:00.000Z',
			resolvedAt: null,
			resolvedBy: null,
		});
		expect(preview.target.resolved).toBe(false);
		expect(preview.warnings.map((w) => w.code)).toContain('no-baseline');
	});
});

describe('RC-AI-2.1 — a creation previews as a structural field summary', () => {
	it('lists the payload fields and omits the plumbing keys', () => {
		const { state, proposal } = stageTool(seedDmAgent(), 'quest.create', {
			title: 'Find the Warden',
			status: 'active',
			objectives: ['Reach the keep'],
			body: 'The party is hired to find the missing road warden.',
		});

		const preview = computeMcpProposalPreview(state, proposal);
		expect(preview.changeKind).toBe('create');
		expect(preview.target.label).toBe('Find the Warden');
		expect(preview.fields.map((f) => f.path)).toContain('title');
		expect(preview.fields.every((f) => f.before === null)).toBe(true);
		expect(preview.summary).toContain('Creates "Find the Warden"');
	});

	it('counts a new note body as added lines with no removals', () => {
		const { state, proposal } = stageTool(seedDmAgent(), 'note.create', {
			title: 'New Lore',
			body: 'one\ntwo\nthree',
			kind: 'note',
		});

		const preview = computeMcpProposalPreview(state, proposal);
		expect(preview.lineDelta).toEqual({ added: 3, removed: 0, unchanged: 0 });
	});
});
