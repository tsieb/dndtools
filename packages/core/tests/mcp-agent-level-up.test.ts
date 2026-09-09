import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	MCP_BASELINE_TOOL_IDS,
	advancementStateOf,
	applyAdvancementInputSchema,
	createBaselineMcpToolRegistry,
	dispatchCommand,
	invokeMcpToolAsAgent,
	type CommandResult,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';

/**
 * RC-AI-1.4 — AGENTIC PC LEVELING.
 *
 * A human levels a character through the wizard: open a draft, make choices over several steps,
 * commit. An agent has no wizard and nowhere to keep a half-open draft while the DM decides whether
 * to approve, so the `character.level-up` tool carries the WHOLE choice set and its bound command
 * (`character.apply-advancement`) runs open→set-choices→commit in ONE dispatch.
 *
 * The invariants these tests protect:
 *   - ATOMIC: approval either finalizes the level or changes nothing. A character is NEVER left in a
 *     half-open advancement the DM then has to clean up.
 *   - UNCHANGED RULES: the same eligibility (XP threshold / max level / already advancing) and the
 *     same validation (class, hit points, subclass at 3, ASI at 4/8/12/16/19) as the wizard.
 *   - AI PROPOSES, NEVER DISPOSES: the write stages; nothing moves until the DM approves.
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

/** A level-1 sidekick owned by PLAYER_ACTOR, on a state with the DM, a player, and an observer. */
function setupCharacter(env_: CoreEnvironment): { state: CoreStateSlice; characterId: string } {
	const created = accepted(
		dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR), env_, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'sidekick',
				name: 'Pip',
				visibility: 'player-visible',
				combat: { hp: 8, maxHp: 8, ac: 12 },
			},
		}),
	);
	const characterId = Object.keys(created.nextState.characters.characters)[0]!;
	const granted = accepted(
		dispatchCommand(created.nextState, env_, {
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: {
				entityType: 'character',
				entityId: characterId,
				playerActorId: PLAYER_ACTOR.id,
				capabilitySet: 'owner',
			},
		}),
	);
	return { state: granted.nextState, characterId };
}

describe('RC-AI-1.4 — character.apply-advancement runs open + choices + commit atomically', () => {
	it('finalizes the whole level-up in ONE dispatch, leaving no staged draft behind', () => {
		const { state, characterId } = setupCharacter(env);
		const before = state.characters.characters[characterId]!;
		const result = accepted(
			dispatchCommand(state, env, {
				type: 'character.apply-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: {
					characterId,
					mode: 'milestone',
					className: 'Fighter',
					hitPointsGained: 6,
				},
			}),
		);
		const after = result.nextState.characters.characters[characterId]!;
		const advancement = advancementStateOf(after);
		expect(advancement.level).toBe(2);
		expect(advancement.draft).toBeNull();
		expect(after.combat.maxHp).toBe(14); // 8 + 6
		expect(after.data.class).toBe('Fighter');
		// One revision only — the intermediate draft revision never existed durably.
		expect(after.revision).toBe(before.revision + 1);
		expect(
			result.events.some(
				(event) => event.kind === 'character.advancement-finalized' && event.toLevel === 2,
			),
		).toBe(true);
	});

	it('appends exactly ONE durable op spanning the original revision to the finalized one', () => {
		const { state, characterId } = setupCharacter(env);
		const beforeOps = state.sync.operations.length;
		const beforeRevision = state.characters.characters[characterId]!.revision;
		const result = accepted(
			dispatchCommand(state, env, {
				type: 'character.apply-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'milestone', className: 'Fighter', hitPointsGained: 6 },
			}),
		);
		expect(result.operationIds).toHaveLength(1);
		expect(result.nextState.sync.operations.length).toBe(beforeOps + 1);
		const op = result.nextState.sync.operations.at(-1)!;
		expect(op.opType).toBe('character.apply-advancement');
		expect(op.beforeRevision).toBe(beforeRevision);
		expect(op.afterRevision).toBe(beforeRevision + 1);
	});

	it('rejects an incomplete choice set and mutates NOTHING — no half-open draft is left', () => {
		const { state, characterId } = setupCharacter(env);
		const before = state.characters.characters[characterId]!;
		// Level 3 requires a subclass; the payload omits it.
		const staged = accepted(
			dispatchCommand(state, env, {
				type: 'character.apply-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'milestone', className: 'Fighter', hitPointsGained: 6 },
			}),
		).nextState;
		const atTwo = staged.characters.characters[characterId]!;
		expect(advancementStateOf(atTwo).level).toBe(2);

		const result = rejected(
			dispatchCommand(staged, env, {
				type: 'character.apply-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'milestone', className: 'Fighter', hitPointsGained: 5 },
			}),
		);
		expect(result.rejection.code).toBe('draft-incomplete');
		expect(result.rejection.issues?.some((issue) => issue.path === 'subclass')).toBe(true);
		const after = result.nextState.characters.characters[characterId]!;
		expect(advancementStateOf(after).level).toBe(2);
		expect(advancementStateOf(after).draft).toBeNull();
		expect(after.revision).toBe(atTwo.revision);
		expect(after.combat.maxHp).toBe(atTwo.combat.maxHp);
		expect(before.revision).toBeLessThan(atTwo.revision);
	});

	it('applies a level-3 advancement once the subclass is supplied', () => {
		const { state, characterId } = setupCharacter(env);
		let next = accepted(
			dispatchCommand(state, env, {
				type: 'character.apply-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'milestone', className: 'Fighter', hitPointsGained: 6 },
			}),
		).nextState;
		next = accepted(
			dispatchCommand(next, env, {
				type: 'character.apply-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: {
					characterId,
					mode: 'milestone',
					className: 'Fighter',
					hitPointsGained: 5,
					subclass: 'Champion',
				},
			}),
		).nextState;
		const character = next.characters.characters[characterId]!;
		expect(advancementStateOf(character).level).toBe(3);
		expect(character.data.subclass).toBe('Champion');
	});

	it('honours XP-mode eligibility: below the threshold it rejects and stages nothing', () => {
		const { state, characterId } = setupCharacter(env);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.apply-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'xp', className: 'Fighter', hitPointsGained: 6 },
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
		const after = result.nextState.characters.characters[characterId]!;
		expect(advancementStateOf(after).level).toBe(1);
		expect(advancementStateOf(after).draft).toBeNull();
	});

	it('refuses to overwrite a level-up a human is part-way through in the wizard', () => {
		const { state, characterId } = setupCharacter(env);
		const opened = accepted(
			dispatchCommand(state, env, {
				type: 'character.open-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'milestone' },
			}),
		).nextState;
		const withChoice = accepted(
			dispatchCommand(opened, env, {
				type: 'character.set-advancement-choices',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, className: 'Wizard' },
			}),
		).nextState;
		const result = rejected(
			dispatchCommand(withChoice, env, {
				type: 'character.apply-advancement',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, mode: 'milestone', className: 'Fighter', hitPointsGained: 6 },
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
		// The human's in-progress draft is untouched.
		const draft = advancementStateOf(result.nextState.characters.characters[characterId]!).draft;
		expect(draft?.choices.className).toBe('Wizard');
	});

	it('is owner/DM authority only: an unrelated player is rejected', () => {
		const { state, characterId } = setupCharacter(env);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.apply-advancement',
				actorId: OBSERVER_ACTOR.id,
				payload: { characterId, mode: 'milestone', className: 'Fighter', hitPointsGained: 6 },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(advancementStateOf(result.nextState.characters.characters[characterId]!).level).toBe(1);
	});
});

describe('RC-AI-1.4 — the character.level-up MCP tool stages, and approval applies the whole level', () => {
	/** DM-bound agent under `strict_review` (everything stages) with the full baseline surface. */
	function seedAgent(state: CoreStateSlice): CoreStateSlice {
		let next = accepted(
			dispatchCommand(state, env, {
				type: 'mcp.set-enabled',
				actorId: DM_ACTOR.id,
				payload: { enabled: true },
			}),
		).nextState;
		next = accepted(
			dispatchCommand(next, env, {
				type: 'mcp.set-agent-binding',
				actorId: DM_ACTOR.id,
				payload: { agentId: 'agent-dm', actorId: DM_ACTOR.id, label: 'bot' },
			}),
		).nextState;
		return accepted(
			dispatchCommand(next, env, {
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

	function stage(
		state: CoreStateSlice,
		input: unknown,
	): { state: CoreStateSlice; proposalId: string } {
		const { result, nextState } = invokeMcpToolAsAgent(
			state,
			env,
			createBaselineMcpToolRegistry(),
			{
				agentId: 'agent-dm',
				toolId: 'character.level-up',
				input,
			},
		);
		expect(result.status, JSON.stringify(result)).toBe('staged');
		if (result.status !== 'staged') throw new Error('expected staged');
		return { state: nextState, proposalId: result.proposalId };
	}

	it('the registry binds character.level-up to the atomic command as a durable write', () => {
		const tool = createBaselineMcpToolRegistry().get('character.level-up')!;
		expect(tool.kind).toBe('write');
		if (tool.kind !== 'write') throw new Error('expected a write tool');
		expect(tool.commandType).toBe('character.apply-advancement');
		expect(tool.writeRisk).toBe('durable');
	});

	it('stages a payload the bound command accepts, and changes NOTHING until approval', () => {
		const { state, characterId } = setupCharacter(env);
		const seeded = seedAgent(state);
		const staged = stage(seeded, {
			characterId,
			mode: 'milestone',
			className: 'Fighter',
			hitPointsGained: 6,
		});
		const proposal = staged.state.mcp.proposals[staged.proposalId]!;
		expect(proposal.status).toBe('pending');
		expect(proposal.commandType).toBe('character.apply-advancement');
		expect(applyAdvancementInputSchema.safeParse(proposal.payload).success).toBe(true);
		// AI proposes, never disposes: the character is still level 1 with no draft on it.
		const character = staged.state.characters.characters[characterId]!;
		expect(advancementStateOf(character).level).toBe(1);
		expect(advancementStateOf(character).draft).toBeNull();
	});

	it('approval applies the level in one step — level, hit points and class all move together', () => {
		const { state, characterId } = setupCharacter(env);
		const staged = stage(seedAgent(state), {
			characterId,
			mode: 'milestone',
			className: 'Fighter',
			hitPointsGained: 6,
		});
		const approved = accepted(
			dispatchCommand(staged.state, env, {
				type: 'mcp.approve-proposal',
				actorId: DM_ACTOR.id,
				payload: { proposalId: staged.proposalId },
			}),
		).nextState;
		const character = approved.characters.characters[characterId]!;
		expect(advancementStateOf(character).level).toBe(2);
		expect(advancementStateOf(character).draft).toBeNull();
		expect(character.combat.maxHp).toBe(14);
		expect(character.data.class).toBe('Fighter');
		expect(approved.mcp.proposals[staged.proposalId]!.status).toBe('approved');
	});

	it('stages the choice set the bound command expects, with no extra keys', () => {
		const { state, characterId } = setupCharacter(env);
		const staged = stage(seedAgent(state), {
			characterId,
			mode: 'milestone',
			className: 'Fighter',
			hitPointsGained: 6,
		});
		const payload = staged.state.mcp.proposals[staged.proposalId]!.payload as Record<
			string,
			unknown
		>;
		expect(payload.className).toBe('Fighter');
		expect(Object.keys(payload).sort()).toEqual([
			'characterId',
			'className',
			'hitPointsGained',
			'mode',
		]);
	});

	it('accepts `class` as the alias for `className`, mapping it onto the command field', () => {
		const { state, characterId } = setupCharacter(env);
		const staged = stage(seedAgent(state), {
			characterId,
			mode: 'milestone',
			class: 'Fighter',
			hitPointsGained: 6,
		});
		const payload = staged.state.mcp.proposals[staged.proposalId]!.payload as Record<
			string,
			unknown
		>;
		expect(payload.className).toBe('Fighter');
		expect(payload).not.toHaveProperty('class');
		const approved = accepted(
			dispatchCommand(staged.state, env, {
				type: 'mcp.approve-proposal',
				actorId: DM_ACTOR.id,
				payload: { proposalId: staged.proposalId },
			}),
		).nextState;
		expect(approved.characters.characters[characterId]!.data.class).toBe('Fighter');
	});

	it('rejects a call that names the class neither way', () => {
		const { state, characterId } = setupCharacter(env);
		const seeded = seedAgent(state);
		const { result, nextState } = invokeMcpToolAsAgent(
			seeded,
			env,
			createBaselineMcpToolRegistry(),
			{
				agentId: 'agent-dm',
				toolId: 'character.level-up',
				input: { characterId, mode: 'milestone', hitPointsGained: 6 },
			},
		);
		expect(result.status).toBe('denied');
		expect(nextState).toBe(seeded);
	});

	it('resolves an omitted mode from the active system package, never to the ungated one', () => {
		const { state, characterId } = setupCharacter(env);
		const staged = stage(seedAgent(state), {
			characterId,
			className: 'Fighter',
			hitPointsGained: 6,
		});
		const payload = staged.state.mcp.proposals[staged.proposalId]!.payload as Record<
			string,
			unknown
		>;
		// The default package (D&D 5e) declares an xp-table advancement model, so an unstated mode is
		// XP-GATED: an agent that omits the mode cannot level a character that has not earned it.
		expect(payload.mode).toBe('xp');
		const result = rejected(
			dispatchCommand(staged.state, env, {
				type: 'mcp.approve-proposal',
				actorId: DM_ACTOR.id,
				payload: { proposalId: staged.proposalId },
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
		expect(advancementStateOf(result.nextState.characters.characters[characterId]!).level).toBe(1);
	});

	it('a rejected proposal never touches the character', () => {
		const { state, characterId } = setupCharacter(env);
		const staged = stage(seedAgent(state), {
			characterId,
			mode: 'milestone',
			className: 'Fighter',
			hitPointsGained: 6,
		});
		const after = accepted(
			dispatchCommand(staged.state, env, {
				type: 'mcp.reject-proposal',
				actorId: DM_ACTOR.id,
				payload: { proposalId: staged.proposalId },
			}),
		).nextState;
		expect(advancementStateOf(after.characters.characters[characterId]!).level).toBe(1);
		expect(after.mcp.proposals[staged.proposalId]!.status).toBe('rejected');
	});

	it('an approval whose choice set is incomplete for the target level is blocked, not half-applied', () => {
		const { state, characterId } = setupCharacter(env);
		// Move the character to level 2 first, so the staged proposal targets level 3 (subclass level).
		const atTwo = accepted(
			dispatchCommand(state, env, {
				type: 'character.apply-advancement',
				actorId: DM_ACTOR.id,
				payload: { characterId, mode: 'milestone', className: 'Fighter', hitPointsGained: 6 },
			}),
		).nextState;
		const staged = stage(seedAgent(atTwo), {
			characterId,
			mode: 'milestone',
			className: 'Fighter',
			hitPointsGained: 5,
		});
		const result = rejected(
			dispatchCommand(staged.state, env, {
				type: 'mcp.approve-proposal',
				actorId: DM_ACTOR.id,
				payload: { proposalId: staged.proposalId },
			}),
		);
		expect(result.rejection.code).toBe('draft-incomplete');
		const character = result.nextState.characters.characters[characterId]!;
		expect(advancementStateOf(character).level).toBe(2);
		expect(advancementStateOf(character).draft).toBeNull();
		// The proposal stays pending for the DM rather than being consumed by the failed approval.
		expect(result.nextState.mcp.proposals[staged.proposalId]!.status).toBe('pending');
	});

	it('the tool accepts no level, XP or hit-point total an agent could assert', () => {
		const { state, characterId } = setupCharacter(env);
		const seeded = seedAgent(state);
		for (const extra of [
			{ level: 20 },
			{ xp: 999999 },
			{ maxHp: 200 },
			{ visibility: 'player-visible' },
		]) {
			const { result, nextState } = invokeMcpToolAsAgent(
				seeded,
				env,
				createBaselineMcpToolRegistry(),
				{
					agentId: 'agent-dm',
					toolId: 'character.level-up',
					input: {
						characterId,
						mode: 'milestone',
						className: 'Fighter',
						hitPointsGained: 6,
						...extra,
					},
				},
			);
			expect(result.status, JSON.stringify(result)).toBe('denied');
			expect(nextState).toBe(seeded);
		}
	});
});
