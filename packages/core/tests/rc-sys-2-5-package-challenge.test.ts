import { describe, expect, it } from 'vitest';
import {
	DND5E_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE_ID,
	SYSTEM_CHALLENGE_FIELD_KEY,
	computeEncounterChallenge,
	dispatchCommand,
	getEncounterForActor,
	listEncountersForActor,
	systemDeclaresChallenge,
	type CommandResult,
	type CoreEnvironment,
	type CoreStateSlice,
	type EncounterCombatantSelection,
	type SystemPackage,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * RC-SYS-2.5 — the CR/XP encounter budget belongs to the ACTIVE system package, not to the app.
 *
 * A package earns a challenge meter by declaring both halves of the sum: a `challengeRating` field
 * on its creature schema (the threat side) and an `xp-table` advancement (the party side). D&D 5e
 * declares both; the built-in Generic package declares neither, so the guidance is `null` and the
 * meter has nothing to draw — an honest absence rather than 5e math quoted at a system that never
 * asked for it.
 */

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function selection(
	over: Partial<EncounterCombatantSelection> & Pick<EncounterCombatantSelection, 'kind' | 'name'>,
): EncounterCombatantSelection {
	return {
		id: over.id ?? `sel-${over.name}`,
		kind: over.kind,
		name: over.name,
		characterId: over.characterId ?? null,
		challengeRating: over.challengeRating ?? 0,
		quantity: over.quantity ?? 1,
		maxHp: over.maxHp ?? 10,
		ac: over.ac ?? 12,
		initiative: over.initiative ?? 0,
		hidden: over.hidden ?? false,
	};
}

const OGRES = [selection({ kind: 'monster', name: 'Ogre', challengeRating: 3, quantity: 6 })];
const PARTY = { size: 4, averageLevel: 3 };

function selectGeneric(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
	return accept(
		dispatchCommand(state, env, {
			type: 'system.select',
			actorId: DM_ACTOR.id,
			payload: { packageId: GENERIC_SYSTEM_PACKAGE_ID, acknowledgeLoss: true },
		}),
	).nextState;
}

function buildOgres(state: CoreStateSlice, env: CoreEnvironment): CommandResult {
	return dispatchCommand(state, env, {
		type: 'encounter.build',
		actorId: DM_ACTOR.id,
		payload: {
			title: 'Ambush at the bridge',
			combatants: [{ kind: 'monster', name: 'Ogre', challengeRating: 3, quantity: 6, maxHp: 59 }],
			party: PARTY,
		},
	});
}

describe('RC-SYS-2.5 — systemDeclaresChallenge', () => {
	it('D&D 5e declares a challenge budget; the Generic package does not', () => {
		expect(systemDeclaresChallenge(DND5E_SYSTEM_PACKAGE)).toBe(true);
		expect(systemDeclaresChallenge(GENERIC_SYSTEM_PACKAGE)).toBe(false);
	});

	it('needs BOTH halves: creature CR alone, or an xp table alone, is not a budget', () => {
		const crOnly: SystemPackage = {
			...GENERIC_SYSTEM_PACKAGE,
			creatureSchema: [
				...GENERIC_SYSTEM_PACKAGE.creatureSchema,
				{
					key: SYSTEM_CHALLENGE_FIELD_KEY,
					label: 'Challenge rating',
					type: 'string',
					required: false,
					options: null,
				},
			],
		};
		expect(systemDeclaresChallenge(crOnly)).toBe(false);

		const xpOnly: SystemPackage = {
			...GENERIC_SYSTEM_PACKAGE,
			advancement: { model: 'xp-table', levelCap: 10, xpThresholds: [0, 300, 900] },
		};
		expect(systemDeclaresChallenge(xpOnly)).toBe(false);

		const both: SystemPackage = { ...crOnly, advancement: xpOnly.advancement };
		expect(systemDeclaresChallenge(both)).toBe(true);
	});
});

describe('RC-SYS-2.5 — computeEncounterChallenge honours the package', () => {
	it('keeps the 5e math byte-identical to the un-parameterised default', () => {
		const withPackage = computeEncounterChallenge(OGRES, PARTY, DND5E_SYSTEM_PACKAGE);
		expect(withPackage).toEqual(computeEncounterChallenge(OGRES, PARTY));
		expect(withPackage!.difficulty).toBe('deadly');
		expect(withPackage!.threatCount).toBe(6);
	});

	it('returns null under a package that declares no challenge budget', () => {
		expect(computeEncounterChallenge(OGRES, PARTY, GENERIC_SYSTEM_PACKAGE)).toBeNull();
	});

	it('a package that declares the budget gets real numbers, not a placeholder', () => {
		const homebrew: SystemPackage = {
			...GENERIC_SYSTEM_PACKAGE,
			creatureSchema: [
				...GENERIC_SYSTEM_PACKAGE.creatureSchema,
				{
					key: SYSTEM_CHALLENGE_FIELD_KEY,
					label: 'Threat',
					type: 'number',
					required: false,
					options: null,
				},
			],
			advancement: { model: 'xp-table', levelCap: 10, xpThresholds: [0, 300, 900] },
		};
		const challenge = computeEncounterChallenge(OGRES, PARTY, homebrew);
		expect(challenge).not.toBeNull();
		expect(challenge!.encounterPoints).toBeGreaterThan(0);
	});
});

describe('RC-SYS-2.5 — the encounter command and read model follow the active package', () => {
	it('under 5e the build event and the DM read model both carry guidance', () => {
		const env = makeEnvironment();
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const built = accept(buildOgres(state, env));
		const event = built.events.find((e) => e.kind === 'encounter.built');
		expect(event).toBeDefined();
		expect(event && 'difficulty' in event ? event.difficulty : undefined).toBe('deadly');

		const view = listEncountersForActor(
			built.nextState.encounters,
			built.nextState.permissions,
			DM_ACTOR.id,
			built.nextState.systems,
		)[0]!;
		expect(view.challenge).not.toBeNull();
		expect(view.challenge!.difficulty).toBe('deadly');
	});

	it('under Generic the event reports no band and the read model reports no challenge', () => {
		const env = makeEnvironment();
		const generic = selectGeneric(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const built = accept(buildOgres(generic, env));

		const event = built.events.find((e) => e.kind === 'encounter.built');
		expect(event && 'difficulty' in event ? event.difficulty : 'missing').toBeNull();
		expect(event && 'encounterPoints' in event ? event.encounterPoints : 'missing').toBeNull();

		const encounterId = Object.keys(built.nextState.encounters.encounters)[0]!;
		const view = getEncounterForActor(
			built.nextState.encounters,
			built.nextState.permissions,
			DM_ACTOR.id,
			encounterId,
			built.nextState.systems,
		)!;
		expect(view.challenge).toBeNull();
		// The encounter itself is untouched — only the guidance goes away.
		expect(view.combatants).toHaveLength(1);
		expect(view.title).toBe('Ambush at the bridge');
	});

	it('a caller that passes no systems state keeps the 5e default (no silent behaviour change)', () => {
		const env = makeEnvironment();
		const generic = selectGeneric(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const built = accept(buildOgres(generic, env));
		const view = listEncountersForActor(
			built.nextState.encounters,
			built.nextState.permissions,
			DM_ACTOR.id,
		)[0]!;
		expect(view.challenge).not.toBeNull();
	});
});
