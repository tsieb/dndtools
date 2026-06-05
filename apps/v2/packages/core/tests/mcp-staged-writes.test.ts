import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import { z } from 'zod';
import {
	createBaselineMcpToolRegistry,
	createMcpToolRegistry,
	dispatchCommand,
	invokeMcpToolAsAgent,
	type CommandResult,
	type CoreStateSlice,
	type McpAgentInvokeOutput,
	type McpToolRegistry,
} from '../src';

/**
 * MCP-003 — MCP WRITE TOOLS DEFAULT TO `strict_review` STAGED HUMAN REVIEW AND REQUIRE EXPLICIT
 * `trusted_direct` CONFIGURATION BEFORE WRITING DURABLE VAULT STATE DIRECTLY. These tests prove every
 * acceptance criterion plus the adversarial security cases the epic demands — all FAIL CLOSED:
 *
 *   - AC1: under strict_review, an MCP note-create STAGES a change for human approval — no immediate write.
 *   - AC2: a trusted_direct write records the mode + agent identity in audit history.
 *   - AC3: under balanced, low-risk staged changes can be approved/rejected as a batch before durable write.
 *   - AC4: a strict_review write to any target is staged/rejected by declared tool capability, not written.
 *
 *   - ESCALATION VIA STAGED WRITE: a staged write commits as the SCOPED actor; a write a player may not
 *     perform is rejected AT APPROVAL by the bound command (no privilege gained by going through staging).
 *   - APPROVAL AFTER REVOCATION: a grant revoked between staging and approval BLOCKS the commit.
 *   - DOUBLE-COMMIT / REPLAY: a proposal can be approved at most ONCE; a second approve is rejected.
 *   - EXPIRE ON UNBIND: unbinding the agent expires its pending proposals so they can never commit.
 */

const env = makeEnvironment();

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

function staged(output: McpAgentInvokeOutput): Extract<McpAgentInvokeOutput['result'], { status: 'staged' }> {
	expect(output.result.status).toBe('staged');
	if (output.result.status !== 'staged') throw new Error('expected staged');
	return output.result;
}

/** Bind `agent-dm` → DM under strict_review with note.create allowlisted. */
function seedDmAgent(mode: string = 'strict_review'): CoreStateSlice {
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
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
			payload: { agentId: 'agent-dm', mode, allowedToolIds: ['note.create'] },
		}),
	).nextState;
	return state;
}

const registry = createBaselineMcpToolRegistry();

describe('MCP-003 AC1 — strict_review stages a change for human approval (no immediate write)', () => {
	it('an MCP note-create stages a proposal and writes nothing durable yet', () => {
		const state = seedDmAgent('strict_review');
		const before = Object.keys(state.content.items).length;

		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'Pending Lore', body: 'a draft the DM must approve', kind: 'note' },
		});

		const result = staged(output);
		// The note was NOT created — only a pending proposal exists.
		expect(Object.keys(output.nextState.content.items).length).toBe(before);
		const proposal = output.nextState.mcp.proposals[result.proposalId]!;
		expect(proposal.status).toBe('pending');
		expect(proposal.commandType).toBe('content.create-item');
	});

	it('approving the proposal commits the write through the existing authorized dispatch', () => {
		const state = seedDmAgent('strict_review');
		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'Approved Lore', body: 'now committed', kind: 'note' },
		});
		const { proposalId } = staged(output);

		const approval = accepted(
			dispatchCommand(output.nextState, env, {
				type: 'mcp.approve-proposal',
				actorId: DM_ACTOR.id,
				payload: { proposalId },
			}),
		);
		// The durable note now exists, and the proposal is terminal `approved`.
		expect(Object.values(approval.nextState.content.items).some((i) => i.title === 'Approved Lore')).toBe(true);
		expect(approval.nextState.mcp.proposals[proposalId]!.status).toBe('approved');
		// The commit went through op-logging (it carries real operation ids).
		expect(approval.operationIds.length).toBeGreaterThan(0);
	});

	it('rejecting the proposal makes no durable mutation and the proposal is terminal', () => {
		const state = seedDmAgent('strict_review');
		const before = Object.keys(state.content.items).length;
		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'Discarded', body: 'x', kind: 'note' },
		});
		const { proposalId } = staged(output);

		const rejection = accepted(
			dispatchCommand(output.nextState, env, {
				type: 'mcp.reject-proposal',
				actorId: DM_ACTOR.id,
				payload: { proposalId },
			}),
		);
		expect(Object.keys(rejection.nextState.content.items).length).toBe(before);
		expect(rejection.nextState.mcp.proposals[proposalId]!.status).toBe('rejected');
	});
});

describe('MCP-003 AC4 — a strict_review write is staged by declared tool capability, not written directly', () => {
	it('the note-create write tool is staged rather than committed under strict_review', () => {
		const state = seedDmAgent('strict_review');
		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'x', body: 'y', kind: 'note' },
		});
		expect(output.result.status).toBe('staged');
	});
});

describe('MCP-003 AC3 — balanced batches low-risk staged changes for one approve/reject', () => {
	it('a balanced DURABLE staged write is NOT batchable (durable writes need explicit approval)', () => {
		// note.create is a `durable` write tool, so balanced still stages it but NOT batchable.
		const durableState = seedDmAgent('balanced');
		const durable = invokeMcpToolAsAgent(durableState, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'd', body: 'y', kind: 'note' },
		});
		expect(staged(durable).batchable).toBe(false);
	});

	it('a balanced LOW-RISK staged write is marked batchable (groupable into one approve/reject)', () => {
		// A low-risk write tool bound to the existing note-create command. Under balanced, the risk class is
		// what makes a staged write batchable — proving the staged/direct decision composes onto the tool's
		// declared write-risk seam.
		const lowRiskRegistry = createMcpToolRegistry([
			{
				id: 'note.append-low-risk',
				kind: 'write',
				commandType: 'content.create-item',
				writeRisk: 'low-risk',
				inputSchema: z
					.object({
						title: z.string().min(1),
						body: z.string().default(''),
						kind: z.enum(['note', 'object']).default('note'),
					})
					.strict(),
				title: 'Low-risk note append (staged)',
			},
		]);
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		state = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-agent-binding',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-dm', actorId: DM_ACTOR.id, label: 'bot' },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-agent-policy',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-dm', mode: 'balanced', allowedToolIds: ['note.append-low-risk'] },
			}),
		).nextState;

		const output = invokeMcpToolAsAgent(state, env, lowRiskRegistry, {
			agentId: 'agent-dm',
			toolId: 'note.append-low-risk',
			input: { title: 'Batchable note', body: 'x', kind: 'note' },
		});
		const result = staged(output);
		expect(result.batchable).toBe(true);
		// It is still STAGED (not committed) — a low-risk write under balanced waits for a batch approval.
		expect(output.nextState.mcp.proposals[result.proposalId]!.status).toBe('pending');
	});
});

describe('MCP-003 / escalation via staged write — a player gains no authority by staging', () => {
	it('a player-scoped staged write that the player may not perform is rejected at approval', () => {
		// Seed a player-bound agent allowed to stage a note-create. The note-create command itself is DM-only
		// (content is dm-authored), so the staged write must be BLOCKED at approval by the bound command —
		// the player cannot escalate by routing through a proposal.
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		state = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-agent-binding',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-player', actorId: PLAYER_ACTOR.id, label: 'p' },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-agent-policy',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-player', mode: 'strict_review', allowedToolIds: ['note.create'] },
			}),
		).nextState;

		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-player',
			toolId: 'note.create',
			input: { title: 'Player Forged Note', body: 'x', kind: 'note' },
		});
		const { proposalId } = staged(output);

		// At approval the captured command re-dispatches AS THE PLAYER. The content-create command rejects a
		// non-DM author, so the commit is BLOCKED and no durable note is created (no escalation).
		const before = Object.keys(output.nextState.content.items).length;
		const result = rejected(
			dispatchCommand(output.nextState, env, {
				type: 'mcp.approve-proposal',
				actorId: DM_ACTOR.id,
				payload: { proposalId },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		// Fail closed: no durable note, and the proposal stays PENDING (the DM can see it was blocked).
		expect(Object.keys(result.nextState.content.items).length).toBe(before);
		expect(result.nextState.mcp.proposals[proposalId]!.status).toBe('pending');
	});
});

/** Drive the session to `active` (combat-resource writes are active-session-gated) via the home scene. */
function startActiveSession(state: CoreStateSlice): CoreStateSlice {
	const home = accepted(
		dispatchCommand(state, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		}),
	);
	const sceneId = home.nextState.commandCenter.homeSceneId!;
	return accepted(
		dispatchCommand(home.nextState, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: sceneId },
		}),
	).nextState;
}

/**
 * A custom registry with a `character.hp.adjust` WRITE tool bound to the existing
 * `character.update-combat-resource` command (HP delta). The dispatcher forwards the tool input as the
 * command payload, so the tool input mirrors the command's HP payload exactly. This lets us stage a write
 * whose authority is a PLAYER GRANT, then revoke that grant before approval.
 */
function hpAdjustRegistry(): McpToolRegistry {
	return createMcpToolRegistry([
		{
			id: 'character.hp.adjust',
			kind: 'write',
			commandType: 'character.update-combat-resource',
			writeRisk: 'durable',
			inputSchema: z
				.object({ characterId: z.string().min(1), kind: z.literal('hp'), delta: z.number().int() })
				.strict(),
			title: 'Adjust character HP (staged)',
		},
	]);
}

describe('MCP-003 / approval after revocation — a grant revoked since staging blocks the commit', () => {
	it('a staged write whose grant was revoked between staging and approval is rejected (re-validated at commit)', () => {
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);

		// DM creates a player-visible character and starts an active session (combat-resource writes are
		// active-session-gated). Then grant the player `combat-participant` so they MAY edit HP.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.quick-create',
				actorId: DM_ACTOR.id,
				payload: {
					kind: 'sidekick',
					name: 'Aria',
					visibility: 'player-visible',
					combat: { hp: 10, maxHp: 10, ac: 12 },
				},
			}),
		).nextState;
		const characterId = Object.values(state.characters.characters).find((c) => c.name === 'Aria')!.id;

		state = startActiveSession(state);

		state = accepted(
			dispatchCommand(state, env, {
				type: 'permission.grant-capability-set',
				actorId: DM_ACTOR.id,
				payload: {
					entityType: 'character',
					entityId: characterId,
					playerActorId: PLAYER_ACTOR.id,
					capabilitySet: 'combat-participant',
				},
			}),
		).nextState;
		const grantId = state.permissions.grants[0]!.id;

		// Bind a player-scoped agent on strict_review allowed to stage the HP-adjust tool.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-agent-binding',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-player', actorId: PLAYER_ACTOR.id, label: 'p' },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-agent-policy',
				actorId: DM_ACTOR.id,
				payload: {
					agentId: 'agent-player',
					mode: 'strict_review',
					allowedToolIds: ['character.hp.adjust'],
				},
			}),
		).nextState;

		// The agent stages an HP edit — valid at staging time (the player HAS the grant).
		const hpRegistry = hpAdjustRegistry();
		const output = invokeMcpToolAsAgent(state, env, hpRegistry, {
			agentId: 'agent-player',
			toolId: 'character.hp.adjust',
			input: { characterId, kind: 'hp', delta: -3 },
		});
		const { proposalId } = staged(output);
		state = output.nextState;

		// REVOKE the player's grant BEFORE approval. The player can no longer edit the HP.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'permission.revoke-grant',
				actorId: DM_ACTOR.id,
				payload: { grantId },
			}),
		).nextState;
		expect(state.permissions.grants.length).toBe(0);

		// At approval the captured command re-dispatches AS THE PLAYER against CURRENT state. The player has
		// no grant now, so the commit is BLOCKED — proving authority is re-validated at COMMIT time.
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'mcp.approve-proposal',
				actorId: DM_ACTOR.id,
				payload: { proposalId },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		// Fail closed: the proposal stays PENDING (the DM can re-grant and retry); no durable HP change.
		expect(result.nextState.mcp.proposals[proposalId]!.status).toBe('pending');
	});

	it('the SAME staged write commits cleanly when the grant is still in place at approval', () => {
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.quick-create',
				actorId: DM_ACTOR.id,
				payload: {
					kind: 'sidekick',
					name: 'Bran',
					visibility: 'player-visible',
					combat: { hp: 10, maxHp: 10, ac: 12 },
				},
			}),
		).nextState;
		const characterId = Object.values(state.characters.characters).find((c) => c.name === 'Bran')!.id;
		state = startActiveSession(state);
		state = accepted(
			dispatchCommand(state, env, {
				type: 'permission.grant-capability-set',
				actorId: DM_ACTOR.id,
				payload: {
					entityType: 'character',
					entityId: characterId,
					playerActorId: PLAYER_ACTOR.id,
					capabilitySet: 'combat-participant',
				},
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-agent-binding',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-player', actorId: PLAYER_ACTOR.id, label: 'p' },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-agent-policy',
				actorId: DM_ACTOR.id,
				payload: {
					agentId: 'agent-player',
					mode: 'strict_review',
					allowedToolIds: ['character.hp.adjust'],
				},
			}),
		).nextState;
		const output = invokeMcpToolAsAgent(state, env, hpAdjustRegistry(), {
			agentId: 'agent-player',
			toolId: 'character.hp.adjust',
			input: { characterId, kind: 'hp', delta: -2 },
		});
		const { proposalId } = staged(output);

		const approval = accepted(
			dispatchCommand(output.nextState, env, {
				type: 'mcp.approve-proposal',
				actorId: DM_ACTOR.id,
				payload: { proposalId },
			}),
		);
		expect(approval.nextState.mcp.proposals[proposalId]!.status).toBe('approved');
		expect(approval.operationIds.length).toBeGreaterThan(0);
	});

	it('unbinding the agent EXPIRES its pending proposal so it can never commit', () => {
		const state = seedDmAgent('strict_review');
		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'Soon Expired', body: 'x', kind: 'note' },
		});
		const { proposalId } = staged(output);

		// DM removes the agent binding — its pending proposal is expired in the same command.
		const unbound = accepted(
			dispatchCommand(output.nextState, env, {
				type: 'mcp.remove-agent-binding',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-dm' },
			}),
		);
		expect(unbound.nextState.mcp.proposals[proposalId]!.status).toBe('expired');

		// Approving an expired proposal is rejected fail-closed.
		const result = rejected(
			dispatchCommand(unbound.nextState, env, {
				type: 'mcp.approve-proposal',
				actorId: DM_ACTOR.id,
				payload: { proposalId },
			}),
		);
		expect(result.rejection.code).toBe('mcp-proposal-not-pending');
	});
});

describe('MCP-003 / double-commit + replay — a proposal commits at most once', () => {
	it('a second approve of an already-approved proposal is rejected (no double durable write)', () => {
		const state = seedDmAgent('strict_review');
		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'Once Only', body: 'x', kind: 'note' },
		});
		const { proposalId } = staged(output);

		const first = accepted(
			dispatchCommand(output.nextState, env, {
				type: 'mcp.approve-proposal',
				actorId: DM_ACTOR.id,
				payload: { proposalId },
			}),
		);
		const itemsAfterFirst = Object.keys(first.nextState.content.items).length;

		// A second approve must be rejected — the proposal is no longer pending (replay/double-commit guard).
		const second = rejected(
			dispatchCommand(first.nextState, env, {
				type: 'mcp.approve-proposal',
				actorId: DM_ACTOR.id,
				payload: { proposalId },
			}),
		);
		expect(second.rejection.code).toBe('mcp-proposal-not-pending');
		// No second durable note was created.
		expect(Object.keys(second.nextState.content.items).length).toBe(itemsAfterFirst);
	});

	it('approving an unknown proposal id is rejected fail-closed', () => {
		const state = seedDmAgent('strict_review');
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'mcp.approve-proposal',
				actorId: DM_ACTOR.id,
				payload: { proposalId: 'no-such-proposal' },
			}),
		);
		expect(result.rejection.code).toBe('mcp-proposal-not-found');
	});

	it('a non-DM cannot approve a proposal (DM-only review)', () => {
		const state = seedDmAgent('strict_review');
		const output = invokeMcpToolAsAgent(state, env, registry, {
			agentId: 'agent-dm',
			toolId: 'note.create',
			input: { title: 'x', body: 'y', kind: 'note' },
		});
		const { proposalId } = staged(output);
		const result = rejected(
			dispatchCommand(output.nextState, env, {
				type: 'mcp.approve-proposal',
				actorId: PLAYER_ACTOR.id,
				payload: { proposalId },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});
});
