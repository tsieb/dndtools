import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	CHARACTER_EXPOSURE_PATHS,
	SUPPORTED_EXPOSURE_SELECTORS,
	buildCharacterDataEnvironment,
	characterExposureValue,
	dispatchCommand,
	exposurePathsForGroup,
	isSupportedExposureSelector,
	resolveCharacterExposure,
	resolveWidgetBinding,
	type Actor,
	type CharacterExposureFieldGroup,
	type CharacterState,
	type CommandResult,
	type CoreEnvironment,
	type CoreStateSlice,
	type WidgetBinding,
} from '../src';

/**
 * CHAR-006 — the STRUCTURED, STABLE character data-exposure API a widget binds to. The exposure
 * contract covers every field group (HP, resources, conditions, spell slots, abilities, skills,
 * equipment, visible notes); resolution is ALWAYS actor-filtered through the existing resolver and
 * fails closed (hidden/conflicted/missing; unknown selector ⇒ missing). These tests prove each field
 * group resolves, the non-leak for DM-only/hidden fields, the conflicted/missing states, and the
 * unknown-path fail-closed — with HARD assertions.
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function withActors(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR, ...actors);
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function firstCharacterId(state: CharacterState): string {
	return Object.keys(state.characters)[0]!;
}

function binding(entityId: string, selector?: string): WidgetBinding {
	return {
		source: { entityType: 'character', entityId, selector },
		mode: 'read',
		requiredCapability: 'viewer',
	};
}

function startActiveSession(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
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
 * Build a richly-populated, player-visible character covering every field group:
 * HP/AC/conditions (combat), spell slots + class resource + spells (resources), abilities, and
 * skills/equipment/notes/backstory (data). `dmNotes` is declared DM-only.
 */
function setupRichCharacter(env: CoreEnvironment): { state: CoreStateSlice; characterId: string } {
	const created = accepted(
		dispatchCommand(withActors(), env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'sidekick',
				name: 'Pip',
				visibility: 'player-visible',
				abilityScores: { str: 10, dex: 14, con: 12, int: 8, wis: 13, cha: 16 },
				combat: { hp: 18, maxHp: 22, ac: 14, conditions: ['blessed'] },
				data: {
					skills: ['Stealth', 'Perception'],
					equipment: ['Shortsword', 'Lute'],
					notes: 'Friendly bard sidekick.',
					backstory: 'Wandered in from the coast.',
					dmNotes: 'Secretly a spy.',
				},
				dmOnlyFields: ['data.dmNotes'],
			},
		}),
	);
	let state = created.nextState;
	const characterId = firstCharacterId(state.characters);

	// Declare spell slots + spells + a class resource (owner-managed structure, DM may author).
	state = accepted(
		dispatchCommand(state, env, {
			type: 'character.set-spell-slots',
			actorId: DM_ACTOR.id,
			payload: { characterId, level: 1, max: 3 },
		}),
	).nextState;
	state = accepted(
		dispatchCommand(state, env, {
			type: 'character.set-spell',
			actorId: DM_ACTOR.id,
			payload: { characterId, id: 'spell-cure', name: 'Cure Wounds', level: 1, prepared: true },
		}),
	).nextState;
	state = accepted(
		dispatchCommand(state, env, {
			type: 'character.set-class-resource',
			actorId: DM_ACTOR.id,
			payload: { characterId, id: 'bardic', name: 'Bardic Inspiration', max: 3, recharge: 'short' },
		}),
	).nextState;
	return { state, characterId };
}

describe('CHAR-006 — exposure contract is stable + enumerable', () => {
	it('publishes a path for every field group the requirement names', () => {
		const groups = new Set<CharacterExposureFieldGroup>(
			CHARACTER_EXPOSURE_PATHS.map((path) => path.group),
		);
		// HP, resources, conditions, spell slots, abilities, skills, equipment, visible notes.
		for (const group of [
			'hp',
			'resources',
			'conditions',
			'spell-slots',
			'abilities',
			'skills',
			'equipment',
			'notes',
		] as CharacterExposureFieldGroup[]) {
			expect(groups.has(group)).toBe(true);
			expect(exposurePathsForGroup(group).length).toBeGreaterThan(0);
		}
	});

	it('the contract is the authority for supported selectors (membership + fail-closed predicate)', () => {
		expect(isSupportedExposureSelector('combat.hp')).toBe(true);
		expect(isSupportedExposureSelector('resources.spellSlots')).toBe(true);
		expect(isSupportedExposureSelector('abilities')).toBe(true);
		expect(isSupportedExposureSelector('data.skills')).toBe(true);
		// Unknown / undeclared / DM-notes-by-raw-path are NOT in the contract.
		expect(isSupportedExposureSelector('data.dmNotes')).toBe(false);
		expect(isSupportedExposureSelector('combat.secretPlan')).toBe(false);
		expect(isSupportedExposureSelector(undefined)).toBe(false);
		// The published list and the set agree.
		expect(SUPPORTED_EXPOSURE_SELECTORS.size).toBe(CHARACTER_EXPOSURE_PATHS.length);
	});

	it('the exposure value never surfaces an un-vetted data internal (dmNotes only via redactable key)', () => {
		const env = makeEnvironment();
		const { state, characterId } = setupRichCharacter(env);
		const value = characterExposureValue(state.characters.characters[characterId]!);
		// Only blessed data keys are exposed; an arbitrary data internal like the advancement-draft key
		// is not surfaced under the contract value.
		expect(value['data.skills']).toEqual(['Stealth', 'Perception']);
		expect(value['data.equipment']).toEqual(['Shortsword', 'Lute']);
		expect(value['data.notes']).toBe('Friendly bard sidekick.');
		expect(value['data.backstory']).toBe('Wandered in from the coast.');
		// dmNotes IS present in the actor-independent value (the resolver redacts it per actor), but it
		// is only addressable under its declared dm-only forms.
		expect(value['data.dmNotes']).toBeUndefined();
		expect(value['dmNotes']).toBeUndefined();
	});
});

describe('CHAR-006 — every field group resolves through the exposure API (DM)', () => {
	it('resolves HP, conditions, spell slots, resources, abilities, skills, equipment, notes', () => {
		const env = makeEnvironment();
		const { state, characterId } = setupRichCharacter(env);
		const dataEnv = buildCharacterDataEnvironment(state.characters);

		function value(selector: string): Record<string, unknown> {
			const resolved = resolveCharacterExposure(binding(characterId, selector), DM_ACTOR, dataEnv);
			expect(resolved.state).toBe('available');
			if (resolved.state !== 'available' || !resolved.value) throw new Error('expected value');
			return resolved.value;
		}

		// HP
		expect(value('combat.hp')['combat.hp']).toBe(18);
		expect(value('combat.maxHp')['combat.maxHp']).toBe(22);
		expect(value('combat.ac')['combat.ac']).toBe(14);
		// Conditions
		expect(value('combat.conditions')['combat.conditions']).toEqual(['blessed']);
		// Spell slots — derived availability is present and consistent.
		const slots = value('resources.spellSlots')['resources.spellSlots'] as Array<{
			level: number;
			max: number;
			expended: number;
			available: number;
		}>;
		expect(slots).toEqual([{ level: 1, max: 3, expended: 0, available: 3 }]);
		const spells = value('resources.spells')['resources.spells'] as Array<{ name: string }>;
		expect(spells.map((s) => s.name)).toEqual(['Cure Wounds']);
		// Resources — class resources with derived availability, plus death saves / concentration.
		const classResources = value('resources.classResources')['resources.classResources'] as Array<{
			id: string;
			available: number;
		}>;
		expect(classResources).toEqual([
			{ id: 'bardic', name: 'Bardic Inspiration', max: 3, expended: 0, available: 3, recharge: 'short' },
		]);
		expect(value('resources.deathSaves')['resources.deathSaves']).toEqual({
			successes: 0,
			failures: 0,
			stable: false,
		});
		expect(value('resources.concentration')['resources.concentration']).toEqual({
			effect: null,
			since: null,
		});
		// Abilities
		expect(value('abilities')['abilities']).toEqual({
			str: 10,
			dex: 14,
			con: 12,
			int: 8,
			wis: 13,
			cha: 16,
		});
		// Skills / equipment / visible notes
		expect(value('data.skills')['data.skills']).toEqual(['Stealth', 'Perception']);
		expect(value('data.equipment')['data.equipment']).toEqual(['Shortsword', 'Lute']);
		expect(value('data.notes')['data.notes']).toBe('Friendly bard sidekick.');
	});

	it('a bound HP value updates after a command mutates it (AC1)', () => {
		const env = makeEnvironment();
		const setup = setupRichCharacter(env);
		const characterId = setup.characterId;
		const activeState = startActiveSession(setup.state, env);

		const before = resolveCharacterExposure(
			binding(characterId, 'combat.hp'),
			DM_ACTOR,
			buildCharacterDataEnvironment(activeState.characters),
		);
		expect(before.state).toBe('available');
		if (before.state === 'available') expect(before.value?.['combat.hp']).toBe(18);

		// Damage the character through the combat-resource command.
		const damaged = accepted(
			dispatchCommand(activeState, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, kind: 'hp', delta: -5 },
			}),
		).nextState;

		const after = resolveCharacterExposure(
			binding(characterId, 'combat.hp'),
			DM_ACTOR,
			buildCharacterDataEnvironment(damaged.characters),
		);
		expect(after.state).toBe('available');
		if (after.state === 'available') expect(after.value?.['combat.hp']).toBe(13);
	});
});

describe('CHAR-006 — actor-filtered non-leak (fail closed)', () => {
	it('a player gets the visible groups but the DM-only field is omitted (AC2 non-leak)', () => {
		const env = makeEnvironment();
		const { state, characterId } = setupRichCharacter(env);
		const dataEnv = buildCharacterDataEnvironment(state.characters);

		// The whole entity is player-visible, so the player CAN read the visible groups.
		const hp = resolveCharacterExposure(binding(characterId, 'combat.hp'), PLAYER_ACTOR, dataEnv);
		expect(hp.state).toBe('available');
		if (hp.state === 'available') {
			expect(hp.value?.['combat.hp']).toBe(18);
			// The DM-only field never appears in the player's redacted value, in EITHER addressable form.
			expect(hp.value?.['data.dmNotes']).toBeUndefined();
			expect(hp.value?.['dmNotes']).toBeUndefined();
			// Visible notes ARE present.
			expect(hp.value?.['data.notes']).toBe('Friendly bard sidekick.');
		}

		// Binding directly to the DM-only field resolves to hidden (field-hidden), not the value.
		const dmField = resolveCharacterExposure(
			binding(characterId, 'data.dmNotes'),
			PLAYER_ACTOR,
			dataEnv,
		);
		expect(dmField.state).toBe('hidden');
		if (dmField.state === 'hidden') expect(dmField.reason).toBe('field-hidden');
		// The serialized resolution must not contain the secret text anywhere.
		expect(JSON.stringify(dmField)).not.toContain('Secretly a spy');
	});

	it('a dm-only character resolves to hidden for a player/observer — indistinguishable from missing', () => {
		const env = makeEnvironment();
		const created = accepted(
			dispatchCommand(withActors(), env, {
				type: 'character.quick-create',
				actorId: DM_ACTOR.id,
				// No visibility ⇒ dm-only (fail closed). Secret HP must not leak.
				payload: { kind: 'monster', name: 'Hidden Horror', combat: { hp: 99, maxHp: 99, ac: 18 } },
			}),
		);
		const characterId = firstCharacterId(created.nextState.characters);
		const dataEnv = buildCharacterDataEnvironment(created.nextState.characters);

		for (const actor of [PLAYER_ACTOR, OBSERVER_ACTOR]) {
			const resolved = resolveCharacterExposure(binding(characterId, 'combat.hp'), actor, dataEnv);
			expect(resolved.state).toBe('hidden');
			if (resolved.state === 'hidden') expect(resolved.reason).toBe('dm-only');
			expect(JSON.stringify(resolved)).not.toContain('99');
		}

		// The DM still sees it.
		const dmResolved = resolveCharacterExposure(binding(characterId, 'combat.hp'), DM_ACTOR, dataEnv);
		expect(dmResolved.state).toBe('available');
		if (dmResolved.state === 'available') expect(dmResolved.value?.['combat.hp']).toBe(99);
	});

	it('an unknown selector on a hidden character still resolves to hidden, never revealing the unsupported reason', () => {
		const env = makeEnvironment();
		const created = accepted(
			dispatchCommand(withActors(), env, {
				type: 'character.quick-create',
				actorId: DM_ACTOR.id,
				payload: { kind: 'monster', name: 'Hidden Horror', combat: { hp: 99, maxHp: 99, ac: 18 } },
			}),
		);
		const characterId = firstCharacterId(created.nextState.characters);
		const dataEnv = buildCharacterDataEnvironment(created.nextState.characters);
		// A player binding to a bogus selector on a hidden character sees `hidden` (visibility first),
		// not `missing` — so existence is not probeable via an unsupported selector.
		const resolved = resolveCharacterExposure(
			binding(characterId, 'combat.secretPlan'),
			PLAYER_ACTOR,
			dataEnv,
		);
		expect(resolved.state).toBe('hidden');
	});
});

describe('CHAR-006 — conflicted + missing states', () => {
	it('an unresolved same-path conflict makes the bound path resolve to conflicted (never one side)', () => {
		const env = makeEnvironment();
		// A finalized PC shared with its owner is the conflict-bearing case; reuse the field-edit
		// concurrent-edit flow on a player-visible character so both actors can write.
		const { state, characterId } = setupRichCharacter(env);
		const baseRevision = state.characters.characters[characterId]!.revision;
		// Grant owner so the player can edit; then concurrent same-path edits create a conflict.
		const granted = accepted(
			dispatchCommand(state, env, {
				type: 'permission.grant-capability-set',
				actorId: DM_ACTOR.id,
				payload: {
					entityType: 'character',
					entityId: characterId,
					playerActorId: PLAYER_ACTOR.id,
					capabilitySet: 'owner',
				},
			}),
		).nextState;
		const byOwner = accepted(
			dispatchCommand(granted, env, {
				type: 'character.edit-field',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, path: 'data.backstory', value: 'Owner version.', baseRevision },
			}),
		);
		const byDm = accepted(
			dispatchCommand(byOwner.nextState, env, {
				type: 'character.edit-field',
				actorId: DM_ACTOR.id,
				payload: { characterId, path: 'data.backstory', value: 'DM version.', baseRevision },
			}),
		);
		const dataEnv = buildCharacterDataEnvironment(byDm.nextState.characters);
		const resolved = resolveCharacterExposure(
			binding(characterId, 'data.backstory'),
			DM_ACTOR,
			dataEnv,
		);
		expect(resolved.state).toBe('conflicted');
		if (resolved.state === 'conflicted') expect(resolved.conflictPaths).toContain('data.backstory');
	});

	it('a binding to a deleted/never-known character resolves to missing', () => {
		const env = makeEnvironment();
		const { state } = setupRichCharacter(env);
		const dataEnv = buildCharacterDataEnvironment(state.characters);
		const resolved = resolveCharacterExposure(binding('character-gone', 'combat.hp'), DM_ACTOR, dataEnv);
		expect(resolved.state).toBe('missing');
	});
});

describe('CHAR-006 — unknown / unsupported path fails closed', () => {
	it('an unsupported selector on an existing, visible character resolves to missing (no leak)', () => {
		const env = makeEnvironment();
		const { state, characterId } = setupRichCharacter(env);
		const dataEnv = buildCharacterDataEnvironment(state.characters);

		for (const actor of [DM_ACTOR, PLAYER_ACTOR]) {
			const resolved = resolveCharacterExposure(
				binding(characterId, 'combat.secretPlan'),
				actor,
				dataEnv,
			);
			expect(resolved.state).toBe('missing');
		}

		// A raw dm-notes path is NOT in the contract; for the DM it is unsupported (missing), and for a
		// player it is hidden (field-hidden) — never the value.
		const dmRaw = resolveCharacterExposure(binding(characterId, 'data.dmNotes'), DM_ACTOR, dataEnv);
		// The DM CAN see dmNotes' value via the redacted full value, but the raw path is unsupported in
		// the contract: it fails closed to missing for the DM rather than exposing it as a blessed path.
		expect(dmRaw.state).toBe('missing');
	});

	it('a supported selector still resolves; the contract does not over-block known paths', () => {
		const env = makeEnvironment();
		const { state, characterId } = setupRichCharacter(env);
		const dataEnv = buildCharacterDataEnvironment(state.characters);
		const resolved = resolveCharacterExposure(binding(characterId, 'abilities'), DM_ACTOR, dataEnv);
		expect(resolved.state).toBe('available');
	});

	it('matches the existing resolver for a supported selector (extends, not replaces)', () => {
		const env = makeEnvironment();
		const { state, characterId } = setupRichCharacter(env);
		const dataEnv = buildCharacterDataEnvironment(state.characters);
		const viaExposure = resolveCharacterExposure(binding(characterId, 'combat.hp'), DM_ACTOR, dataEnv);
		const viaResolver = resolveWidgetBinding(binding(characterId, 'combat.hp'), DM_ACTOR, dataEnv);
		expect(viaExposure).toEqual(viaResolver);
	});
});
