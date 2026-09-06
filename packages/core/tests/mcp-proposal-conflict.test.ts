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
	computeMcpProposalConflict,
	createBaselineMcpToolRegistry,
	dispatchCommand,
	ensureMcpPolicyState,
	invokeMcpToolAsAgent,
	type CommandResult,
	type CoreStateSlice,
	type McpAgentInvokeOutput,
	type McpStagedProposal,
} from '../src';

/**
 * RC-AI-2.2 — THREE-WAY CONFLICT UI (the Core half). A staged note rewrite records the revision the
 * agent read. When a human edits that note first, approving the proposal as staged used to write
 * NOTHING while reporting success. These tests prove the divergence is now a real three-way record —
 * base (captured at staging), the assistant's version, and the note as it stands — that the merge is
 * only offered when the edits do not overlap, and that each resolution lands exactly what it says.
 */

const env = makeEnvironment();
const registry = createBaselineMcpToolRegistry();

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	expect(result.status).toBe('rejected');
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function staged(
	output: McpAgentInvokeOutput,
): Extract<McpAgentInvokeOutput['result'], { status: 'staged' }> {
	expect(output.result.status).toBe('staged');
	if (output.result.status !== 'staged') throw new Error('expected staged');
	return output.result;
}

const BASE_BODY = [
	'# Ashfall',
	'The keep still stands.',
	'It is guarded by [[Sera Vance]].',
	'The cellars are flooded.',
].join('\n');

/** Bind `agent-dm` → the DM under `strict_review` with the note write tools. */
function seedDmAgent(): CoreStateSlice {
	let state = withMcpEnabled(buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR));
	state = accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-binding',
			actorId: DM_ACTOR.id,
			payload: { agentId: 'agent-dm', actorId: DM_ACTOR.id, label: 'prep bot' },
		}),
	).nextState;
	return accepted(
		dispatchCommand(state, env, {
			type: 'mcp.set-agent-policy',
			actorId: DM_ACTOR.id,
			payload: {
				agentId: 'agent-dm',
				mode: 'strict_review',
				allowedToolIds: ['note.update', 'note.append'],
			},
		}),
	).nextState;
}

function seedNote(state: CoreStateSlice, title: string, body: string) {
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

/** Stage a rewrite, then land a human edit on top so the staged base goes stale. */
function seedDivergence(
	aiBody: string,
	humanBody: string,
	options: { aiTitle?: string; humanTitle?: string } = {},
): { state: CoreStateSlice; proposal: McpStagedProposal; itemId: string } {
	const seeded = seedNote(seedDmAgent(), 'Ashfall Keep', BASE_BODY);
	const output = invokeMcpToolAsAgent(seeded.state, env, registry, {
		agentId: 'agent-dm',
		toolId: 'note.update',
		input: {
			itemId: seeded.itemId,
			baseRevision: seeded.state.content.items[seeded.itemId]!.revision,
			body: aiBody,
			...(options.aiTitle !== undefined ? { title: options.aiTitle } : {}),
		},
	});
	const { proposalId } = staged(output);
	const edited = accepted(
		dispatchCommand(output.nextState, env, {
			type: 'content.update-item',
			actorId: DM_ACTOR.id,
			payload: {
				itemId: seeded.itemId,
				body: humanBody,
				...(options.humanTitle !== undefined ? { title: options.humanTitle } : {}),
			},
		}),
	).nextState;
	return {
		state: edited,
		proposal: edited.mcp.proposals[proposalId]!,
		itemId: seeded.itemId,
	};
}

/** The AI rewrites line 2; the human rewrites line 4. Disjoint — a clean merge exists. */
const AI_BODY_DISJOINT = [
	'# Ashfall',
	'The keep is a ruin.',
	'It is guarded by [[Sera Vance]].',
	'The cellars are flooded.',
].join('\n');
const HUMAN_BODY_DISJOINT = [
	'# Ashfall',
	'The keep still stands.',
	'It is guarded by [[Sera Vance]].',
	'The cellars are dry again.',
].join('\n');

describe('RC-AI-2.2 — the three-way conflict record', () => {
	it('is null while the base the agent read is still the current revision', () => {
		const seeded = seedNote(seedDmAgent(), 'Ashfall Keep', BASE_BODY);
		const output = invokeMcpToolAsAgent(seeded.state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.update',
			input: {
				itemId: seeded.itemId,
				baseRevision: seeded.state.content.items[seeded.itemId]!.revision,
				body: AI_BODY_DISJOINT,
			},
		});
		const { proposalId } = staged(output);
		expect(
			computeMcpProposalConflict(output.nextState, output.nextState.mcp.proposals[proposalId]!),
		).toBeNull();
	});

	it('carries all three sides once a human edit lands first', () => {
		const { state, proposal } = seedDivergence(AI_BODY_DISJOINT, HUMAN_BODY_DISJOINT);
		const conflict = computeMcpProposalConflict(state, proposal)!;

		expect(conflict).not.toBeNull();
		expect(conflict.base.available).toBe(true);
		expect(conflict.base.available && conflict.base.body).toBe(BASE_BODY);
		expect(conflict.ai.body).toBe(AI_BODY_DISJOINT);
		expect(conflict.current.body).toBe(HUMAN_BODY_DISJOINT);
		expect(conflict.current.revision ?? 0).toBeGreaterThan(
			(conflict.base.available ? conflict.base.revision : 0) ?? 0,
		);
	});

	it('attributes each changed passage to the side that changed it', () => {
		const { state, proposal } = seedDivergence(AI_BODY_DISJOINT, HUMAN_BODY_DISJOINT);
		const conflict = computeMcpProposalConflict(state, proposal)!;

		expect(conflict.hunks.map((hunk) => hunk.kind)).toEqual(['ai-only', 'mine-only']);
		expect(conflict.hunks[0]!.ai).toEqual(['The keep is a ruin.']);
		expect(conflict.hunks[0]!.current).toEqual(['The keep still stands.']);
		expect(conflict.hunks[1]!.current).toEqual(['The cellars are dry again.']);
	});

	it('offers a clean merge that keeps both edits when they touch different lines', () => {
		const { state, proposal } = seedDivergence(AI_BODY_DISJOINT, HUMAN_BODY_DISJOINT);
		const conflict = computeMcpProposalConflict(state, proposal)!;

		expect(conflict.resolutions).toEqual(['keep-ai', 'keep-mine', 'merge']);
		expect(conflict.merge!.body).toBe(
			[
				'# Ashfall',
				'The keep is a ruin.',
				'It is guarded by [[Sera Vance]].',
				'The cellars are dry again.',
			].join('\n'),
		);
	});

	it('withholds the merge and says why when both edits rewrite the same line', () => {
		const humanSameLine = BASE_BODY.replace('The keep still stands.', 'The keep is besieged.');
		const { state, proposal } = seedDivergence(AI_BODY_DISJOINT, humanSameLine);
		const conflict = computeMcpProposalConflict(state, proposal)!;

		expect(conflict.hunks.map((hunk) => hunk.kind)).toEqual(['conflicting']);
		expect(conflict.merge).toBeNull();
		expect(conflict.resolutions).toEqual(['keep-ai', 'keep-mine']);
		expect(conflict.warnings.map((warning) => warning.code)).toContain('overlapping-edits');
	});

	it('treats an identical edit on both sides as agreement, not a conflict', () => {
		const { state, proposal } = seedDivergence(AI_BODY_DISJOINT, AI_BODY_DISJOINT);
		const conflict = computeMcpProposalConflict(state, proposal)!;

		expect(conflict.hunks.map((hunk) => hunk.kind)).toEqual(['agreed']);
		expect(conflict.merge!.body).toBe(AI_BODY_DISJOINT);
	});

	it('reports a title both sides renamed differently as a title conflict with no merge', () => {
		const { state, proposal } = seedDivergence(AI_BODY_DISJOINT, HUMAN_BODY_DISJOINT, {
			aiTitle: 'Ashfall Ruin',
			humanTitle: 'Ashfall Hold',
		});
		const conflict = computeMcpProposalConflict(state, proposal)!;

		expect(conflict.titleConflict).toBe(true);
		expect(conflict.merge).toBeNull();
		expect(conflict.warnings.map((warning) => warning.code)).toContain('title-conflict');
	});

	it('says so, and offers no merge, when the proposal was staged without a base snapshot', () => {
		const { state, proposal } = seedDivergence(AI_BODY_DISJOINT, HUMAN_BODY_DISJOINT);
		const legacy: McpStagedProposal = { ...proposal };
		delete (legacy as { baseSnapshot?: unknown }).baseSnapshot;
		const conflict = computeMcpProposalConflict(state, legacy)!;

		expect(conflict.base.available).toBe(false);
		expect(conflict.merge).toBeNull();
		expect(conflict.resolutions).toEqual(['keep-ai', 'keep-mine']);
		expect(conflict.warnings.map((warning) => warning.code)).toContain('no-base-snapshot');
	});

	it('carries the captured base across a reload, and drops a corrupt one', () => {
		const { state, proposal } = seedDivergence(AI_BODY_DISJOINT, HUMAN_BODY_DISJOINT);
		const rehydrated = ensureMcpPolicyState(state.mcp);
		expect(rehydrated.proposals[proposal.id]!.baseSnapshot!.body).toBe(BASE_BODY);

		const corrupt = ensureMcpPolicyState({
			...state.mcp,
			proposals: {
				...state.mcp.proposals,
				[proposal.id]: { ...proposal, baseSnapshot: { itemId: '', revision: 'x' } },
			},
		} as never);
		expect(corrupt.proposals[proposal.id]!.baseSnapshot).toBeUndefined();
	});
});

describe('RC-AI-2.2 — resolving the conflict is a validated, DM-only command', () => {
	it('keep-ai writes the assistant version onto the current revision and approves the proposal', () => {
		const { state, proposal, itemId } = seedDivergence(AI_BODY_DISJOINT, HUMAN_BODY_DISJOINT);
		const result = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.resolve-proposal-conflict',
				actorId: DM_ACTOR.id,
				payload: { proposalId: proposal.id, resolution: 'keep-ai' },
			}),
		);

		expect(result.nextState.content.items[itemId]!.body).toBe(AI_BODY_DISJOINT);
		expect(result.nextState.mcp.proposals[proposal.id]!.status).toBe('approved');
		expect(result.events.some((event) => event.kind === 'mcp.proposal-approved')).toBe(true);
	});

	it('merge writes the Core-computed merge, keeping both edits', () => {
		const { state, proposal, itemId } = seedDivergence(AI_BODY_DISJOINT, HUMAN_BODY_DISJOINT);
		const result = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.resolve-proposal-conflict',
				actorId: DM_ACTOR.id,
				payload: { proposalId: proposal.id, resolution: 'merge' },
			}),
		);

		expect(result.nextState.content.items[itemId]!.body).toContain('The keep is a ruin.');
		expect(result.nextState.content.items[itemId]!.body).toContain('The cellars are dry again.');
		expect(result.nextState.mcp.proposals[proposal.id]!.status).toBe('approved');
	});

	it('keep-mine leaves the note exactly as the human wrote it and ends the proposal', () => {
		const { state, proposal, itemId } = seedDivergence(AI_BODY_DISJOINT, HUMAN_BODY_DISJOINT);
		const before = state.content.items[itemId]!.revision;
		const result = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.resolve-proposal-conflict',
				actorId: DM_ACTOR.id,
				payload: { proposalId: proposal.id, resolution: 'keep-mine' },
			}),
		);

		expect(result.nextState.content.items[itemId]!.body).toBe(HUMAN_BODY_DISJOINT);
		expect(result.nextState.content.items[itemId]!.revision).toBe(before);
		expect(result.nextState.mcp.proposals[proposal.id]!.status).toBe('rejected');
	});

	it('refuses a merge that does not exist rather than guessing', () => {
		const humanSameLine = BASE_BODY.replace('The keep still stands.', 'The keep is besieged.');
		const { state, proposal, itemId } = seedDivergence(AI_BODY_DISJOINT, humanSameLine);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'mcp.resolve-proposal-conflict',
				actorId: DM_ACTOR.id,
				payload: { proposalId: proposal.id, resolution: 'merge' },
			}),
		);

		expect(result.rejection.code).toBe('invalid-state');
		expect(state.content.items[itemId]!.body).toBe(humanSameLine);
	});

	it('refuses to resolve a proposal that is not in conflict', () => {
		const seeded = seedNote(seedDmAgent(), 'Ashfall Keep', BASE_BODY);
		const output = invokeMcpToolAsAgent(seeded.state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.update',
			input: {
				itemId: seeded.itemId,
				baseRevision: seeded.state.content.items[seeded.itemId]!.revision,
				body: AI_BODY_DISJOINT,
			},
		});
		const { proposalId } = staged(output);
		const result = rejected(
			dispatchCommand(output.nextState, env, {
				type: 'mcp.resolve-proposal-conflict',
				actorId: DM_ACTOR.id,
				payload: { proposalId, resolution: 'keep-ai' },
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
	});

	it('is DM-only: a player cannot settle an agent write', () => {
		const { state, proposal, itemId } = seedDivergence(AI_BODY_DISJOINT, HUMAN_BODY_DISJOINT);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'mcp.resolve-proposal-conflict',
				actorId: PLAYER_ACTOR.id,
				payload: { proposalId: proposal.id, resolution: 'keep-ai' },
			}),
		);

		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(state.content.items[itemId]!.body).toBe(HUMAN_BODY_DISJOINT);
		expect(state.mcp.proposals[proposal.id]!.status).toBe('pending');
	});

	it('cannot settle the same proposal twice', () => {
		const { state, proposal } = seedDivergence(AI_BODY_DISJOINT, HUMAN_BODY_DISJOINT);
		const first = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.resolve-proposal-conflict',
				actorId: DM_ACTOR.id,
				payload: { proposalId: proposal.id, resolution: 'keep-ai' },
			}),
		);
		const second = rejected(
			dispatchCommand(first.nextState, env, {
				type: 'mcp.resolve-proposal-conflict',
				actorId: DM_ACTOR.id,
				payload: { proposalId: proposal.id, resolution: 'keep-mine' },
			}),
		);
		expect(second.rejection.code).toBe('mcp-proposal-not-pending');
	});
});
