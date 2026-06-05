import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	ABILITY_POINT_BUDGET,
	buildCharacterDataEnvironment,
	computeDraftCompleteness,
	dispatchCommand,
	getCharacterForActor,
	getDraftForActor,
	listCharactersForActor,
	listDraftsForActor,
	resolveWidgetBinding,
	transferDraftOwnership,
	validateDraftStep,
	type Actor,
	type CharacterState,
	type CoreStateSlice,
	type WidgetBinding,
} from '../src';

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function withActors(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR, ...actors);
}

function lastCharacterId(state: CharacterState): string {
	return Object.keys(state.characters)[0]!;
}

describe('CHAR-001 — DM quick-create', () => {
	it('creates a finalized NPC with widget-bindable combat state (AC1)', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(withActors(), env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'npc',
				name: 'Goblin Sentry',
				combat: { hp: 7, maxHp: 7, ac: 13 },
				attacks: [{ name: 'Scimitar', detail: '+4 to hit, 1d6+2' }],
			},
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const character = Object.values(result.nextState.characters.characters)[0]!;
		expect(character.name).toBe('Goblin Sentry');
		expect(character.combat.hp).toBe(7);
		expect(character.attacks).toHaveLength(1);
		// A durable operation was appended (replayable, persisted via adapter).
		expect(result.operationIds).toHaveLength(1);
		expect(result.nextState.sync.operations).toHaveLength(1);

		// Widget-bindable: the character resolves through the EXISTING binding model.
		const env2 = buildCharacterDataEnvironment(result.nextState.characters);
		const binding: WidgetBinding = {
			source: { entityType: 'character', entityId: character.id, selector: 'combat.hp' },
			mode: 'read',
			requiredCapability: 'viewer',
		};
		const resolved = resolveWidgetBinding(binding, DM_ACTOR, env2);
		expect(resolved.state).toBe('available');
		if (resolved.state === 'available') {
			expect(resolved.value?.['combat.hp']).toBe(7);
		}
	});

	it('defaults visibility to dm-only and omits the NPC from player queries (AC2, fail closed)', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(withActors(), env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: { kind: 'npc', name: 'Hidden Cultist' }, // visibility omitted
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const id = lastCharacterId(result.nextState.characters);
		expect(result.nextState.characters.characters[id]!.visibility).toBe('dm-only');

		// DM sees it; a player does NOT (omitted, not redacted).
		expect(
			getCharacterForActor(result.nextState.characters, result.nextState.permissions, DM_ACTOR.id, id),
		).not.toBeNull();
		expect(
			getCharacterForActor(
				result.nextState.characters,
				result.nextState.permissions,
				PLAYER_ACTOR.id,
				id,
			),
		).toBeNull();
		expect(
			listCharactersForActor(
				result.nextState.characters,
				result.nextState.permissions,
				PLAYER_ACTOR.id,
			),
		).toHaveLength(0);
	});

	it('a player-visible NPC still hides declared dm-only fields and bindings for non-DM', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(withActors(), env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'monster',
				name: 'Ogre',
				visibility: 'player-visible',
				data: { lore: 'public lore', dmNotes: 'secret weakness' },
				dmOnlyFields: ['dmNotes'],
			},
		});
		if (result.status !== 'accepted') return;
		const id = lastCharacterId(result.nextState.characters);
		const playerView = getCharacterForActor(
			result.nextState.characters,
			result.nextState.permissions,
			PLAYER_ACTOR.id,
			id,
		);
		expect(playerView).not.toBeNull();
		expect(playerView!.data['lore']).toBe('public lore');
		expect(playerView!.data['dmNotes']).toBeUndefined();

		// The binding resolver also reports the hidden field as field-hidden for the player.
		const bindEnv = buildCharacterDataEnvironment(result.nextState.characters);
		const resolved = resolveWidgetBinding(
			{
				source: { entityType: 'character', entityId: id, selector: 'dmNotes' },
				mode: 'read',
				requiredCapability: 'viewer',
			},
			PLAYER_ACTOR,
			bindEnv,
		);
		expect(resolved.state).toBe('hidden');
	});

	it('rejects a non-DM author (fail closed)', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(withActors(), env, {
			type: 'character.quick-create',
			actorId: PLAYER_ACTOR.id,
			payload: { kind: 'npc', name: 'Nope' },
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.rejection.code).toBe('actor-not-authorized');
	});
});

describe('CHAR-013 — draft ownership (exactly one owner, atomic transfer)', () => {
	function createDraft(state: CoreStateSlice, ownerId: string) {
		return dispatchCommand(state, makeEnvironment(), {
			type: 'character.create-draft',
			actorId: DM_ACTOR.id,
			payload: { ownerActorId: ownerId },
		});
	}

	it('the DM creates a draft assigned to exactly one owner (AC1)', () => {
		const result = createDraft(withActors(), PLAYER_ACTOR.id);
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const drafts = Object.values(result.nextState.characters.drafts);
		expect(drafts).toHaveLength(1);
		expect(drafts[0]!.ownerActorId).toBe(PLAYER_ACTOR.id);
		expect(drafts[0]!.finalized).toBe(false);
	});

	it('transfer atomically moves ownership leaving exactly one owner; prior owner cannot edit (AC2)', () => {
		const created = createDraft(withActors(), PLAYER_ACTOR.id);
		if (created.status !== 'accepted') throw new Error('setup');
		const draftId = Object.keys(created.nextState.characters.drafts)[0]!;

		const transferred = dispatchCommand(created.nextState, makeEnvironment(), {
			type: 'character.transfer-draft',
			actorId: DM_ACTOR.id,
			payload: { draftId, toOwnerActorId: PLAYER_B.id },
		});
		expect(transferred.status).toBe('accepted');
		if (transferred.status !== 'accepted') return;
		const draft = transferred.nextState.characters.drafts[draftId]!;
		// Exactly one owner — the new one. Never zero or two (scalar field).
		expect(draft.ownerActorId).toBe(PLAYER_B.id);

		// Prior owner (Player A) can no longer edit (fail closed); new owner (Player B) can.
		const aEdit = dispatchCommand(transferred.nextState, makeEnvironment(), {
			type: 'character.update-draft-step',
			actorId: PLAYER_ACTOR.id,
			payload: { draftId, stepId: 'identity', values: { name: 'X', background: 'sage' } },
		});
		expect(aEdit.status).toBe('rejected');
		if (aEdit.status === 'rejected') expect(aEdit.rejection.code).toBe('not-draft-owner');

		const bEdit = dispatchCommand(transferred.nextState, makeEnvironment(), {
			type: 'character.update-draft-step',
			actorId: PLAYER_B.id,
			payload: { draftId, stepId: 'identity', values: { name: 'X', background: 'sage' } },
		});
		expect(bEdit.status).toBe('accepted');
	});

	it('the pure transfer reducer never produces zero or two owners and rejects a no-op self-transfer', () => {
		const created = createDraft(withActors(), PLAYER_ACTOR.id);
		if (created.status !== 'accepted') throw new Error('setup');
		const draftId = Object.keys(created.nextState.characters.drafts)[0]!;

		// Re-assigning the same owner is rejected (no empty transfer recorded).
		const same = transferDraftOwnership(
			created.nextState.characters,
			draftId,
			PLAYER_ACTOR.id,
			'2026-06-03T13:00:00.000Z',
		);
		expect(same.ok).toBe(false);
		if (!same.ok) expect(same.error).toBe('same-owner');

		// A real transfer yields exactly one owner.
		const moved = transferDraftOwnership(
			created.nextState.characters,
			draftId,
			PLAYER_B.id,
			'2026-06-03T13:00:00.000Z',
		);
		expect(moved.ok).toBe(true);
		if (moved.ok) {
			expect(moved.draft.ownerActorId).toBe(PLAYER_B.id);
			expect(moved.previousOwnerActorId).toBe(PLAYER_ACTOR.id);
		}
	});

	it('rejects a non-DM transfer author and an unknown draft (fail closed)', () => {
		const created = createDraft(withActors(), PLAYER_ACTOR.id);
		if (created.status !== 'accepted') throw new Error('setup');
		const draftId = Object.keys(created.nextState.characters.drafts)[0]!;

		const byPlayer = dispatchCommand(created.nextState, makeEnvironment(), {
			type: 'character.transfer-draft',
			actorId: PLAYER_ACTOR.id,
			payload: { draftId, toOwnerActorId: PLAYER_B.id },
		});
		expect(byPlayer.status).toBe('rejected');

		const unknown = dispatchCommand(created.nextState, makeEnvironment(), {
			type: 'character.transfer-draft',
			actorId: DM_ACTOR.id,
			payload: { draftId: 'nope', toOwnerActorId: PLAYER_B.id },
		});
		expect(unknown.status).toBe('rejected');
		if (unknown.status === 'rejected') expect(unknown.rejection.code).toBe('draft-not-found');
	});

	it('the DM can revoke a draft', () => {
		const created = createDraft(withActors(), PLAYER_ACTOR.id);
		if (created.status !== 'accepted') throw new Error('setup');
		const draftId = Object.keys(created.nextState.characters.drafts)[0]!;
		const revoked = dispatchCommand(created.nextState, makeEnvironment(), {
			type: 'character.revoke-draft',
			actorId: DM_ACTOR.id,
			payload: { draftId },
		});
		expect(revoked.status).toBe('accepted');
		if (revoked.status === 'accepted') {
			expect(revoked.nextState.characters.drafts[draftId]).toBeUndefined();
		}
	});
});

describe('CHAR-002 — guided PC creation (validation, resume, owner-only)', () => {
	function seedDraft(): { state: CoreStateSlice; draftId: string } {
		const created = dispatchCommand(withActors(), makeEnvironment(), {
			type: 'character.create-draft',
			actorId: DM_ACTOR.id,
			payload: { ownerActorId: PLAYER_ACTOR.id },
		});
		if (created.status !== 'accepted') throw new Error('setup');
		return { state: created.nextState, draftId: Object.keys(created.nextState.characters.drafts)[0]! };
	}

	it('per-step validation enforces rules and the point-buy budget', () => {
		// Missing required field.
		expect(validateDraftStep('identity', { name: '' }).valid).toBe(false);
		// Out-of-range ability.
		expect(
			validateDraftStep('abilities', {
				str: 20,
				dex: 10,
				con: 10,
				int: 10,
				wis: 10,
				cha: 10,
			}).valid,
		).toBe(false);
		// Over budget (all 15s).
		const overBudget = validateDraftStep('abilities', {
			str: 15,
			dex: 15,
			con: 15,
			int: 15,
			wis: 15,
			cha: 15,
		});
		expect(overBudget.valid).toBe(false);
		expect(overBudget.issues.some((i) => i.message.includes(`${ABILITY_POINT_BUDGET}`))).toBe(true);
		// A legal point-buy spread.
		expect(
			validateDraftStep('abilities', {
				str: 15,
				dex: 14,
				con: 13,
				int: 12,
				wis: 10,
				cha: 8,
			}).valid,
		).toBe(true);
	});

	it('a non-owner player and an observer cannot edit the draft (AC3 fail closed)', () => {
		const { state, draftId } = seedDraft();
		for (const actor of [PLAYER_B, OBSERVER_ACTOR]) {
			const result = dispatchCommand(state, makeEnvironment(), {
				type: 'character.update-draft-step',
				actorId: actor.id,
				payload: { draftId, stepId: 'identity', values: { name: 'X', background: 'sage' } },
			});
			expect(result.status).toBe('rejected');
			if (result.status === 'rejected') expect(result.rejection.code).toBe('not-draft-owner');
		}
		// A non-owner also gets NO draft fields back (CHAR-002 AC3).
		expect(getDraftForActor(state.characters, state.permissions, PLAYER_B.id, draftId)).toBeNull();
		expect(
			getDraftForActor(state.characters, state.permissions, OBSERVER_ACTOR.id, draftId),
		).toBeNull();
		// The owner and DM both see it.
		expect(
			getDraftForActor(state.characters, state.permissions, PLAYER_ACTOR.id, draftId),
		).not.toBeNull();
		expect(getDraftForActor(state.characters, state.permissions, DM_ACTOR.id, draftId)).not.toBeNull();
	});

	it('completed steps and unresolved validation issues are restored on resume (AC2 round-trip)', () => {
		const { state, draftId } = seedDraft();
		// Save a VALID identity step and an INVALID abilities step (out of range).
		let s = dispatchCommand(state, makeEnvironment(), {
			type: 'character.update-draft-step',
			actorId: PLAYER_ACTOR.id,
			payload: { draftId, stepId: 'identity', values: { name: 'Aria', background: 'sage' } },
		});
		if (s.status !== 'accepted') throw new Error('step1');
		s = dispatchCommand(s.nextState, makeEnvironment(), {
			type: 'character.update-draft-step',
			actorId: PLAYER_ACTOR.id,
			payload: {
				draftId,
				stepId: 'abilities',
				values: { str: 99, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
			},
		});
		if (s.status !== 'accepted') throw new Error('step2');

		// "Reopen": recompute completeness purely from the persisted draft.
		const draft = s.nextState.characters.drafts[draftId]!;
		const completeness = computeDraftCompleteness(draft);
		expect(completeness.completedStepIds).toContain('identity');
		expect(completeness.completedStepIds).toContain('abilities');
		expect(completeness.readyToFinalize).toBe(false);
		// The unresolved abilities issue is restored.
		expect(completeness.issues.some((i) => i.stepId === 'abilities')).toBe(true);
		expect(completeness.nextStepId).toBe('abilities');
	});

	it('finalize is blocked until every step is valid, then yields a usable character (AC1)', () => {
		const { state, draftId } = seedDraft();
		// Finalizing an empty draft is rejected with the unresolved issues.
		const early = dispatchCommand(state, makeEnvironment(), {
			type: 'character.finalize-draft',
			actorId: PLAYER_ACTOR.id,
			payload: { draftId },
		});
		expect(early.status).toBe('rejected');
		if (early.status === 'rejected') {
			expect(early.rejection.code).toBe('draft-incomplete');
			expect(early.rejection.issues?.length).toBeGreaterThan(0);
		}

		// Complete every step validly.
		let s: CoreStateSlice = state;
		const steps: Array<[string, Record<string, unknown>]> = [
			['identity', { name: 'Aria', background: 'sage' }],
			['abilities', { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }],
			['class', { class: 'wizard' }],
		];
		for (const [stepId, values] of steps) {
			const r = dispatchCommand(s, makeEnvironment(), {
				type: 'character.update-draft-step',
				actorId: PLAYER_ACTOR.id,
				payload: { draftId, stepId, values },
			});
			if (r.status !== 'accepted') throw new Error(`step ${stepId}`);
			s = r.nextState;
		}
		expect(computeDraftCompleteness(s.characters.drafts[draftId]!).readyToFinalize).toBe(true);

		const finalized = dispatchCommand(s, makeEnvironment(), {
			type: 'character.finalize-draft',
			actorId: PLAYER_ACTOR.id,
			payload: { draftId },
		});
		expect(finalized.status).toBe('accepted');
		if (finalized.status !== 'accepted') return;
		// The draft is marked finalized and a finalized PC character exists.
		expect(finalized.nextState.characters.drafts[draftId]!.finalized).toBe(true);
		const pcs = Object.values(finalized.nextState.characters.characters).filter(
			(c) => c.kind === 'pc',
		);
		expect(pcs).toHaveLength(1);
		expect(pcs[0]!.name).toBe('Aria');
		expect(pcs[0]!.finalizedFromDraftId).toBe(draftId);
		// The finalized character is usable in session widgets (bindable) and visible to its owner
		// list — it carries the player-authored class/background.
		expect(pcs[0]!.data['class']).toBe('wizard');

		// The owner can see/use their own finalized PC; another player cannot (it is `shared` with
		// the owner only, not the whole party — broader party visibility is a later CHAR epic).
		const ownerView = listCharactersForActor(
			finalized.nextState.characters,
			finalized.nextState.permissions,
			PLAYER_ACTOR.id,
		);
		expect(ownerView.map((c) => c.name)).toContain('Aria');
		const otherView = listCharactersForActor(
			finalized.nextState.characters,
			finalized.nextState.permissions,
			PLAYER_B.id,
		);
		expect(otherView.map((c) => c.name)).not.toContain('Aria');
	});

	it('a draft inspected by id is a pre-finalization character entity, not a grant entity (AC4)', () => {
		const { state, draftId } = seedDraft();
		const view = getDraftForActor(state.characters, state.permissions, PLAYER_ACTOR.id, draftId);
		expect(view).not.toBeNull();
		// It exposes draft character state (steps, owner, finalize flag) — not a capabilitySet grant.
		expect(view).toMatchObject({ id: draftId, finalized: false, ownerActorId: PLAYER_ACTOR.id });
		expect(view).toHaveProperty('steps');
		expect((view as unknown as Record<string, unknown>)['capabilitySet']).toBeUndefined();
	});

	it('lists only the drafts an actor may see', () => {
		const { state } = seedDraft();
		expect(listDraftsForActor(state.characters, state.permissions, DM_ACTOR.id)).toHaveLength(1);
		expect(listDraftsForActor(state.characters, state.permissions, PLAYER_ACTOR.id)).toHaveLength(1);
		expect(listDraftsForActor(state.characters, state.permissions, PLAYER_B.id)).toHaveLength(0);
		expect(listDraftsForActor(state.characters, state.permissions, OBSERVER_ACTOR.id)).toHaveLength(0);
	});
});
