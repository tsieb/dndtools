import { describe, expect, it } from 'vitest';
import {
	challengePointsForCr,
	computeEncounterChallenge,
	dispatchCommand,
	getEncounterForActor,
	listEncountersForActor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type EncounterCombatantSelection,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * SES-006 — BUILD ENCOUNTERS: deterministic CR/difficulty challenge guidance, combatant selection,
 * terrain notes, legendary/lair actions, loot, generated session-log links (by reference), and the
 * encounter → combat flow. Tests are the primary evidence (fail-closed negative cases included).
 */

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

function selection(
	overrides: Partial<EncounterCombatantSelection> & { kind: EncounterCombatantSelection['kind']; name: string },
): EncounterCombatantSelection {
	return {
		id: overrides.id ?? overrides.name,
		kind: overrides.kind,
		name: overrides.name,
		characterId: overrides.characterId ?? null,
		challengeRating: overrides.challengeRating ?? 0,
		quantity: overrides.quantity ?? 1,
		maxHp: overrides.maxHp ?? 0,
		ac: overrides.ac ?? 10,
		initiative: overrides.initiative ?? 0,
		hidden: overrides.hidden ?? false,
	};
}

describe('SES-006 deterministic challenge guidance', () => {
	it('maps CR to challenge points deterministically and monotonically', () => {
		expect(challengePointsForCr(0)).toBe(1);
		expect(challengePointsForCr(0.25)).toBe(5);
		expect(challengePointsForCr(1)).toBe(20);
		expect(challengePointsForCr(5)).toBe(180);
		// Above the table it extends linearly and stays > the CR-10 anchor.
		expect(challengePointsForCr(12)).toBeGreaterThan(challengePointsForCr(10));
		// Negative / non-finite CRs clamp to 0.
		expect(challengePointsForCr(-1)).toBe(0);
	});

	it('is a PURE function of (combatants + party): same inputs ⇒ same difficulty band', () => {
		const party = { size: 4, averageLevel: 3 };
		const combatants = [selection({ kind: 'monster', name: 'Goblin', challengeRating: 0.25, quantity: 8 })];
		const a = computeEncounterChallenge(combatants, party);
		const b = computeEncounterChallenge(combatants, party);
		expect(a).toEqual(b);
		expect(a.threatCount).toBe(8);
	});

	it('escalates difficulty bands as the threat grows against a fixed party', () => {
		const party = { size: 4, averageLevel: 3 };
		const trivial = computeEncounterChallenge(
			[selection({ kind: 'monster', name: 'Rat', challengeRating: 0, quantity: 1 })],
			party,
		);
		const deadly = computeEncounterChallenge(
			[selection({ kind: 'monster', name: 'Ogre', challengeRating: 7, quantity: 6 })],
			party,
		);
		const order = ['trivial', 'easy', 'medium', 'hard', 'deadly'];
		expect(order.indexOf(deadly.difficulty)).toBeGreaterThan(order.indexOf(trivial.difficulty));
		expect(deadly.difficulty).toBe('deadly');
	});

	it('does not count party PCs as a threat', () => {
		const party = { size: 4, averageLevel: 5 };
		const withPc = computeEncounterChallenge(
			[
				selection({ kind: 'character', name: 'Hero', challengeRating: 5, quantity: 1 }),
				selection({ kind: 'monster', name: 'Wolf', challengeRating: 0.25, quantity: 2 }),
			],
			party,
		);
		const monstersOnly = computeEncounterChallenge(
			[selection({ kind: 'monster', name: 'Wolf', challengeRating: 0.25, quantity: 2 })],
			party,
		);
		expect(withPc.threatCount).toBe(2);
		expect(withPc.encounterPoints).toBe(monstersOnly.encounterPoints);
	});
});

describe('SES-006 build encounter (commands)', () => {
	it('builds a durable encounter with combatants, terrain, actions, loot, and guidance', () => {
		const env = makeEnvironment();
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const built = accept(
			dispatch(state, env, {
				type: 'encounter.build',
				actorId: DM_ACTOR.id,
				payload: {
					title: 'Ambush at the bridge',
					combatants: [
						{ kind: 'monster', name: 'Goblin', challengeRating: 0.25, quantity: 4, maxHp: 7, initiative: 14 },
					],
					party: { size: 4, averageLevel: 2 },
					terrainNotes: 'A rickety bridge over a ravine; difficult terrain at both ends.',
					specialActions: [{ kind: 'lair', name: 'Collapsing planks', detail: 'DC 12 Dex save or fall.' }],
					loot: [{ name: 'Goblin coin pouch', detail: '15 gp' }],
				},
			}),
		);
		const encounterId = Object.keys(built.nextState.encounters.encounters)[0]!;
		const encounter = built.nextState.encounters.encounters[encounterId]!;
		expect(encounter.title).toBe('Ambush at the bridge');
		expect(encounter.combatants).toHaveLength(1);
		expect(encounter.terrainNotes).toContain('ravine');
		expect(encounter.specialActions[0]!.kind).toBe('lair');
		expect(encounter.loot[0]!.name).toBe('Goblin coin pouch');
		// The build event carries the computed challenge guidance for the GUI.
		const event = built.events.find((e) => e.kind === 'encounter.built');
		expect(event).toBeDefined();
		expect(built.operationIds).toHaveLength(1);
	});

	it('is DM-only: a player cannot build an encounter (fail closed)', () => {
		const env = makeEnvironment();
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const result = rejected(
			dispatch(state, env, {
				type: 'encounter.build',
				actorId: PLAYER_ACTOR.id,
				payload: { title: 'Player encounter', combatants: [] },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('rejects a session-log NOTE link whose target does not exist (links are by reference)', () => {
		const env = makeEnvironment();
		const state = buildInitialState(DM_ACTOR);
		const result = rejected(
			dispatch(state, env, {
				type: 'encounter.build',
				actorId: DM_ACTOR.id,
				payload: {
					title: 'Linked encounter',
					sessionLogLinks: [{ kind: 'note', targetId: 'missing-note', label: 'Recap' }],
				},
			}),
		);
		expect(result.rejection.code).toBe('content-item-not-found');
	});

	it('links a generated session-log NOTE by reference (the encounter stores only the target id)', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR);
		// Create a note to link.
		const withNote = accept(
			dispatch(base, env, {
				type: 'content.create-item',
				actorId: DM_ACTOR.id,
				payload: { kind: 'note', title: 'Session 12 recap', visibility: 'dm-only' },
			}),
		).nextState;
		const noteId = Object.keys(withNote.content.items)[0]!;
		const built = accept(
			dispatch(withNote, env, {
				type: 'encounter.build',
				actorId: DM_ACTOR.id,
				payload: {
					title: 'Recapped encounter',
					sessionLogLinks: [{ kind: 'note', targetId: noteId, label: 'Recap' }],
				},
			}),
		);
		const encounter = Object.values(built.nextState.encounters.encounters)[0]!;
		expect(encounter.sessionLogLinks[0]).toMatchObject({ kind: 'note', targetId: noteId });
		// The link is a reference only — the encounter does NOT carry the note's title/body.
		expect(JSON.stringify(encounter.sessionLogLinks[0])).not.toContain('Session 12 recap');
	});
});

describe('SES-006 encounter → combat flow (AC2)', () => {
	it('flows the encounter combatant selection + party into session combat when combat starts', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const built = accept(
			dispatch(base, env, {
				type: 'encounter.build',
				actorId: DM_ACTOR.id,
				payload: {
					title: 'Goblin patrol',
					combatants: [
						{ kind: 'monster', name: 'Goblin', challengeRating: 0.25, quantity: 2, maxHp: 7, ac: 13, initiative: 14 },
						{ kind: 'monster', name: 'Hobgoblin', challengeRating: 0.5, quantity: 1, maxHp: 11, ac: 18, initiative: 12 },
					],
				},
			}),
		).nextState;
		const encounterId = Object.keys(built.encounters.encounters)[0]!;
		// Start a session and run combat FROM the encounter (by reference).
		const home = accept(
			dispatch(built, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		const active = accept(
			dispatch(home, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: home.commandCenter.homeSceneId },
			}),
		).nextState;
		const started = accept(
			dispatch(active, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { encounterId },
			}),
		).nextState;
		// 2 goblins + 1 hobgoblin = 3 tracker combatants; the link is recorded by reference.
		expect(started.session.combat.order).toHaveLength(3);
		expect(started.session.combat.encounterId).toBe(encounterId);
		// The combatants seeded their HP/AC from the encounter selection.
		const hob = Object.values(started.session.combat.combatants).find((c) => c.name === 'Hobgoblin')!;
		expect(hob.resources.maxHp).toBe(11);
		expect(hob.statBlock.ac).toBe(18);
	});

	it('flows terrain notes from the encounter into session combat state (SES-006 AC2)', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const built = accept(
			dispatch(base, env, {
				type: 'encounter.build',
				actorId: DM_ACTOR.id,
				payload: {
					title: 'Swamp ambush',
					combatants: [
						{ kind: 'monster', name: 'Lizardfolk', challengeRating: 0.5, quantity: 1, maxHp: 22, ac: 15, initiative: 10 },
					],
					terrainNotes: 'Knee-deep swamp water; difficult terrain. Reeds provide half cover.',
				},
			}),
		).nextState;
		const encounterId = Object.keys(built.encounters.encounters)[0]!;
		const home = accept(
			dispatch(built, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		const active = accept(
			dispatch(home, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: home.commandCenter.homeSceneId },
			}),
		).nextState;
		const started = accept(
			dispatch(active, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { encounterId },
			}),
		).nextState;
		// Terrain notes from the encounter must appear on the session combat state (SES-006 AC2).
		expect(started.session.combat.terrainNotes).toContain('difficult terrain');
		expect(started.session.combat.terrainNotes).toContain('half cover');
	});

	it('terrain notes are empty for ad-hoc combat (no encounter link)', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR);
		const home = accept(
			dispatch(base, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		const active = accept(
			dispatch(home, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: home.commandCenter.homeSceneId },
			}),
		).nextState;
		const started = accept(
			dispatch(active, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: {
					combatants: [
						{ kind: 'npc', name: 'Bandit', ac: 12, initiative: 8, maxHp: 11 },
					],
				},
			}),
		).nextState;
		expect(started.session.combat.terrainNotes).toBe('');
	});

	it('rejects starting combat from a non-existent encounter (fail closed)', () => {
		const env = makeEnvironment();
		const home = accept(
			dispatch(buildInitialState(DM_ACTOR), env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		).nextState;
		const active = accept(
			dispatch(home, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: home.commandCenter.homeSceneId },
			}),
		).nextState;
		const result = rejected(
			dispatch(active, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { encounterId: 'enc-missing' },
			}),
		);
		expect(result.rejection.code).toBe('encounter-not-found');
	});
});

describe('SES-006 actor-filtered encounter read model', () => {
	it('shows the DM every encounter with guidance, but a non-DM sees none (DM prep, fail closed)', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const built = accept(
			dispatch(base, env, {
				type: 'encounter.build',
				actorId: DM_ACTOR.id,
				payload: {
					title: 'Secret boss',
					combatants: [{ kind: 'monster', name: 'Dragon', challengeRating: 10, quantity: 1, maxHp: 200 }],
				},
			}),
		).nextState;
		const encounterId = Object.keys(built.encounters.encounters)[0]!;

		const dmList = listEncountersForActor(built.encounters, built.permissions, DM_ACTOR.id);
		expect(dmList).toHaveLength(1);
		expect(dmList[0]!.challenge.difficulty).toBeDefined();

		expect(listEncountersForActor(built.encounters, built.permissions, PLAYER_ACTOR.id)).toEqual([]);
		expect(getEncounterForActor(built.encounters, built.permissions, PLAYER_ACTOR.id, encounterId)).toBeNull();
		expect(
			listEncountersForActor(built.encounters, built.permissions, OBSERVER_ACTOR.id),
		).toEqual([]);
	});
});
