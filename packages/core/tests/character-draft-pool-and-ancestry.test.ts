import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	DND5E_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE,
	ancestryBonuses,
	applyAncestryBonuses,
	computeDraftCompleteness,
	dispatchCommand,
	getDraftStep,
	validateDraftStep,
	type Character,
	type CoreStateSlice,
} from '../src';

/**
 * RC-ENG-8.8 / DEBT-2026-006 — a guided PC carries what the builder promised: the ancestry bonus is
 * added at finalize (after the point-buy check), and a DM-witnessed score pool replaces point buy for
 * the draft it was created with.
 */

const ROLLED = [17, 16, 12, 11, 9, 7];
const POINT_BUY = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };

function createDraft(payload: Record<string, unknown> = {}, state?: CoreStateSlice) {
	return dispatchCommand(state ?? buildInitialState(DM_ACTOR, PLAYER_ACTOR), makeEnvironment(), {
		type: 'character.create-draft',
		actorId: DM_ACTOR.id,
		payload: { ownerActorId: PLAYER_ACTOR.id, ...payload },
	});
}

function seedDraft(payload: Record<string, unknown> = {}): {
	state: CoreStateSlice;
	draftId: string;
} {
	const created = createDraft(payload);
	if (created.status !== 'accepted') throw new Error('setup');
	return {
		state: created.nextState,
		draftId: Object.keys(created.nextState.characters.drafts)[0]!,
	};
}

function saveSteps(
	start: CoreStateSlice,
	draftId: string,
	steps: Array<[string, Record<string, unknown>]>,
): CoreStateSlice {
	let state = start;
	for (const [stepId, values] of steps) {
		const r = dispatchCommand(state, makeEnvironment(), {
			type: 'character.update-draft-step',
			actorId: PLAYER_ACTOR.id,
			payload: { draftId, stepId, values },
		});
		if (r.status !== 'accepted') throw new Error(`step ${stepId}`);
		state = r.nextState;
	}
	return state;
}

function finalize(state: CoreStateSlice, draftId: string) {
	return dispatchCommand(state, makeEnvironment(), {
		type: 'character.finalize-draft',
		actorId: PLAYER_ACTOR.id,
		payload: { draftId },
	});
}

function finalizedPc(result: ReturnType<typeof finalize>): Character {
	if (result.status !== 'accepted')
		throw new Error(`finalize rejected: ${result.rejection.message}`);
	return Object.values(result.nextState.characters.characters).find((c) => c.kind === 'pc')!;
}

describe('RC-ENG-8.8 — ancestry ability bonuses', () => {
	it('names every ancestry the builder lists, with its SRD increase', () => {
		expect(ancestryBonuses('dwarf')).toEqual({ str: 0, dex: 0, con: 2, int: 0, wis: 0, cha: 0 });
		expect(ancestryBonuses('human')).toEqual({ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 });
		expect(ancestryBonuses('tiefling')).toMatchObject({ cha: 2, int: 1 });
		expect(ancestryBonuses('dragonborn')).toMatchObject({ str: 2, cha: 1 });
		// Unknown / absent ancestry: nothing.
		expect(Object.values(ancestryBonuses('orc')).every((b) => b === 0)).toBe(true);
		expect(Object.values(ancestryBonuses(undefined)).every((b) => b === 0)).toBe(true);
	});

	it("counts a half-elf's free picks only when they are legal", () => {
		expect(ancestryBonuses('half-elf', ['str', 'con'])).toEqual({
			str: 1,
			dex: 0,
			con: 1,
			int: 0,
			wis: 0,
			cha: 2,
		});
		// CHA is excluded and a repeat counts once — an illegal pick never adds anything.
		expect(ancestryBonuses('half-elf', ['cha', 'str', 'str'])).toMatchObject({ str: 1, cha: 2 });
		expect(applyAncestryBonuses({ str: 29, dex: 10 }, 'half-elf', ['str', 'dex'])).toEqual({
			str: 30,
			dex: 11,
		});
	});

	it('the identity step declares ancestry under 5e only, and validates the free picks', () => {
		const identity = getDraftStep('identity', DND5E_SYSTEM_PACKAGE)!;
		const field = identity.fields.find((f) => f.id === 'ancestry');
		expect(field).toMatchObject({ kind: 'choice', required: false });
		expect(field!.options!.map((o) => o.value)).toContain('dwarf');
		expect(
			getDraftStep('identity', GENERIC_SYSTEM_PACKAGE)!.fields.some((f) => f.id === 'ancestry'),
		).toBe(false);

		const base = { name: 'Tam', background: 'sage' };
		expect(validateDraftStep('identity', base).valid).toBe(true);
		expect(validateDraftStep('identity', { ...base, ancestry: 'dwarf' }).valid).toBe(true);
		expect(validateDraftStep('identity', { ...base, ancestry: 'orc' }).valid).toBe(false);
		const missingPicks = validateDraftStep('identity', { ...base, ancestry: 'half-elf' });
		expect(missingPicks.valid).toBe(false);
		expect(missingPicks.issues[0]!.fieldId).toBe('ancestryAbilities');
		expect(
			validateDraftStep('identity', {
				...base,
				ancestry: 'half-elf',
				ancestryAbilities: ['cha', 'str'],
			}).valid,
		).toBe(false);
		expect(
			validateDraftStep('identity', {
				...base,
				ancestry: 'half-elf',
				ancestryAbilities: ['dex', 'wis'],
			}).valid,
		).toBe(true);
		expect(
			validateDraftStep('identity', { ...base, ancestry: 'dwarf', ancestryAbilities: ['str'] })
				.valid,
		).toBe(false);
	});

	it('a point-buy Dwarf finalizes with +2 CON added after the budget check', () => {
		const { state, draftId } = seedDraft();
		const saved = saveSteps(state, draftId, [
			['identity', { name: 'Brom', background: 'folk-hero', ancestry: 'dwarf' }],
			// 13 CON spends 5 points; the bonus that makes it 15 is not charged to the budget.
			['abilities', { ...POINT_BUY }],
			['class', { class: 'fighter' }],
		]);
		const pc = finalizedPc(finalize(saved, draftId));
		expect(pc.abilityScores).toEqual({ ...POINT_BUY, con: 15 });
		expect(pc.data['ancestry']).toBe('dwarf');
	});

	it('a 15 can finalize as a 17 — the bonus is not held to the 8–15 point-buy range', () => {
		const { state, draftId } = seedDraft();
		const saved = saveSteps(state, draftId, [
			['identity', { name: 'Ash', background: 'sage', ancestry: 'gnome' }],
			['abilities', { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 }],
			['class', { class: 'wizard' }],
		]);
		expect(finalizedPc(finalize(saved, draftId)).abilityScores.int).toBe(17);
	});

	it('a draft with no ancestry finalizes exactly as before (no bonus, no data.ancestry)', () => {
		const { state, draftId } = seedDraft();
		const saved = saveSteps(state, draftId, [
			['identity', { name: 'Plain', background: 'sage' }],
			['abilities', { ...POINT_BUY }],
			['class', { class: 'rogue' }],
		]);
		const pc = finalizedPc(finalize(saved, draftId));
		expect(pc.abilityScores).toEqual(POINT_BUY);
		expect('ancestry' in pc.data).toBe(false);
	});

	it('finalize refuses a half-elf without its two picks', () => {
		const { state, draftId } = seedDraft();
		const saved = saveSteps(state, draftId, [
			['identity', { name: 'Vel', background: 'sage', ancestry: 'half-elf' }],
			['abilities', { ...POINT_BUY }],
			['class', { class: 'rogue' }],
		]);
		const result = finalize(saved, draftId);
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') {
			expect(result.rejection.code).toBe('draft-incomplete');
			expect(result.rejection.issues?.map((i) => i.path)).toContain('identity.ancestryAbilities');
		}
	});
});

describe('RC-ENG-8.8 — a DM-witnessed ability score pool (DEBT-2026-006)', () => {
	it('records the pool on the draft; a draft without one stores no pool key', () => {
		const pooled = seedDraft({ abilityScorePool: ROLLED });
		expect(pooled.state.characters.drafts[pooled.draftId]!.abilityScorePool).toEqual(ROLLED);
		const plain = seedDraft();
		expect('abilityScorePool' in plain.state.characters.drafts[plain.draftId]!).toBe(false);
	});

	it('only the DM sets a pool, and it must hold one score per attribute', () => {
		const playerAttempt = dispatchCommand(
			buildInitialState(DM_ACTOR, PLAYER_ACTOR),
			makeEnvironment(),
			{
				type: 'character.create-draft',
				actorId: PLAYER_ACTOR.id,
				payload: { ownerActorId: PLAYER_ACTOR.id, abilityScorePool: ROLLED },
			},
		);
		expect(playerAttempt.status).toBe('rejected');

		const short = createDraft({ abilityScorePool: [18, 18, 18] });
		expect(short.status).toBe('rejected');
		if (short.status === 'rejected') {
			expect(short.rejection.code).toBe('invalid-payload');
			expect(short.rejection.message).toContain('needs 6 scores');
		}
		expect(createDraft({ abilityScorePool: [31, 10, 10, 10, 10, 10] }).status).toBe('rejected');
		expect(createDraft({ abilityScorePool: [12.5, 10, 10, 10, 10, 10] }).status).toBe('rejected');
	});

	it('the owner cannot widen the pool through a step save', () => {
		const { state, draftId } = seedDraft({ abilityScorePool: ROLLED });
		const r = dispatchCommand(state, makeEnvironment(), {
			type: 'character.update-draft-step',
			actorId: PLAYER_ACTOR.id,
			payload: {
				draftId,
				stepId: 'abilities',
				values: { str: 18, dex: 18, con: 18, int: 18, wis: 18, cha: 18, abilityScorePool: [] },
			},
		});
		expect(r.status).toBe('accepted');
		if (r.status !== 'accepted') return;
		const draft = r.nextState.characters.drafts[draftId]!;
		expect(draft.abilityScorePool).toEqual(ROLLED);
		const report = computeDraftCompleteness(draft);
		expect(report.steps.find((s) => s.stepId === 'abilities')!.valid).toBe(false);
	});

	it('the abilities step is valid as any permutation of the pool, with no point-buy bounds', () => {
		const rules = { abilityScorePool: ROLLED };
		const rolled = { str: 17, dex: 12, con: 16, int: 7, wis: 11, cha: 9 };
		// Point buy would refuse the 17, the 16 and the 7.
		expect(validateDraftStep('abilities', rolled).valid).toBe(false);
		expect(validateDraftStep('abilities', rolled, DND5E_SYSTEM_PACKAGE, rules).valid).toBe(true);
		// A score the DM did not witness is refused, and so is using one value twice.
		const invented = validateDraftStep(
			'abilities',
			{ ...rolled, int: 18 },
			DND5E_SYSTEM_PACKAGE,
			rules,
		);
		expect(invented.valid).toBe(false);
		expect(invented.issues[0]!.message).toContain('17, 16, 12, 11, 9, 7');
		expect(
			validateDraftStep('abilities', { ...rolled, int: 17 }, DND5E_SYSTEM_PACKAGE, rules).valid,
		).toBe(false);
		// Duplicates in the pool are honoured by multiplicity.
		const twins = { abilityScorePool: [12, 12, 10, 10, 8, 8] };
		expect(
			validateDraftStep(
				'abilities',
				{ str: 12, dex: 10, con: 12, int: 8, wis: 10, cha: 8 },
				DND5E_SYSTEM_PACKAGE,
				twins,
			).valid,
		).toBe(true);
		expect(
			validateDraftStep(
				'abilities',
				{ str: 12, dex: 12, con: 12, int: 8, wis: 10, cha: 8 },
				DND5E_SYSTEM_PACKAGE,
				twins,
			).valid,
		).toBe(false);
	});

	it('a rolled Dwarf Fighter finalizes from its pool with the bonus on top', () => {
		const { state, draftId } = seedDraft({ abilityScorePool: ROLLED });
		const saved = saveSteps(state, draftId, [
			['identity', { name: 'Rolled Brom', background: 'folk-hero', ancestry: 'dwarf' }],
			['abilities', { str: 17, dex: 12, con: 16, int: 7, wis: 11, cha: 9 }],
			['class', { class: 'fighter' }],
		]);
		const pc = finalizedPc(finalize(saved, draftId));
		expect(pc.abilityScores).toEqual({ str: 17, dex: 12, con: 18, int: 7, wis: 11, cha: 9 });
	});

	it('the standard array is the same mechanism with a fixed pool', () => {
		const { state, draftId } = seedDraft({ abilityScorePool: [15, 14, 13, 12, 10, 8] });
		const saved = saveSteps(state, draftId, [
			['identity', { name: 'Array', background: 'acolyte' }],
			['abilities', { str: 8, dex: 10, con: 12, int: 13, wis: 15, cha: 14 }],
			['class', { class: 'cleric' }],
		]);
		expect(finalizedPc(finalize(saved, draftId)).abilityScores.wis).toBe(15);
	});
});
