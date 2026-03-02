// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	advanceCombatTurn,
	buildEncounterLogDraft,
	createDefaultCombatState,
	getLinkedCombatantDefaults,
	normalizeCombatState,
	reorderTieCombatants,
	sortCombatantsForInitiative,
	summarizeEncounter,
} from './combat-tracker.js';

describe('combat-tracker domain', () => {
	it('normalizes and sorts combatants by initiative and tie rank', () => {
		const normalized = normalizeCombatState({
			encounterName: ' Goblin Ambush ',
			combatants: [
				{ id: 'b', name: 'B', initiative: 10, tieRank: 1 },
				{ id: 'a', name: 'A', initiative: 10, tieRank: 0 },
				{ id: 'c', name: 'C', initiative: 14, tieRank: 5 },
			],
		});
		expect(normalized.encounterName).toBe('Goblin Ambush');
		expect(normalized.combatants.map((combatant) => combatant.id)).toEqual(['c', 'a', 'b']);
		expect(normalized.combatants.filter((combatant) => combatant.initiative === 10)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ tieRank: 0 }),
				expect.objectContaining({ tieRank: 1 }),
			]),
		);
	});

	it('reorders tie groups and blocks cross-initiative drag reorder', () => {
		const combatants = sortCombatantsForInitiative([
			{
				id: 'a',
				name: 'A',
				initiative: 12,
				tieRank: 0,
				initiativeModifier: 0,
				ready: false,
				delayed: false,
				isPlayerCharacter: false,
				currentHp: 8,
				maxHp: 8,
				armorClass: 13,
				conditions: [],
				concentration: false,
				deathSaves: { successes: 0, failures: 0 },
				outcome: 'active',
				damageDealt: 0,
			},
			{
				id: 'b',
				name: 'B',
				initiative: 12,
				tieRank: 1,
				initiativeModifier: 0,
				ready: false,
				delayed: false,
				isPlayerCharacter: false,
				currentHp: 8,
				maxHp: 8,
				armorClass: 13,
				conditions: [],
				concentration: false,
				deathSaves: { successes: 0, failures: 0 },
				outcome: 'active',
				damageDealt: 0,
			},
			{
				id: 'c',
				name: 'C',
				initiative: 9,
				tieRank: 0,
				initiativeModifier: 0,
				ready: false,
				delayed: false,
				isPlayerCharacter: false,
				currentHp: 8,
				maxHp: 8,
				armorClass: 13,
				conditions: [],
				concentration: false,
				deathSaves: { successes: 0, failures: 0 },
				outcome: 'active',
				damageDealt: 0,
			},
		]);
		const reordered = reorderTieCombatants(combatants, 'b', 'a');
		expect(reordered?.map((combatant) => combatant.id)).toEqual(['b', 'a', 'c']);
		expect(reorderTieCombatants(combatants, 'c', 'a')).toBeNull();
	});

	it('advances turns while skipping delayed combatants and increments round on wrap', () => {
		const state = normalizeCombatState({
			round: 1,
			activeCombatantId: 'a',
			combatants: [
				{ id: 'a', name: 'A', initiative: 15, tieRank: 0, delayed: false, ready: false },
				{ id: 'b', name: 'B', initiative: 13, tieRank: 0, delayed: true, ready: false },
				{ id: 'c', name: 'C', initiative: 9, tieRank: 0, delayed: false, ready: false },
			],
		});

		const next = advanceCombatTurn(state);
		expect(next.activeCombatantId).toBe('c');
		expect(next.round).toBe(1);

		const wrapped = advanceCombatTurn(next);
		expect(wrapped.activeCombatantId).toBe('a');
		expect(wrapped.round).toBe(2);
	});

	it('extracts linked defaults from stat blocks and character objects', () => {
		const statDefaults = getLinkedCombatantDefaults({
			id: 'wolf' as never,
			type: 'stat_block',
			name: 'Wolf',
			summary: '',
			tags: [],
			relationships: [],
			createdAt: '2026-03-02T00:00:00.000Z',
			updatedAt: '2026-03-02T00:00:00.000Z',
			data: {
				armorClass: 13,
				hitPoints: '11 (2d8 + 2)',
				abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
				traits: [{ name: 'Keen Hearing and Smell', description: 'Advantage.' }],
				actions: [{ name: 'Bite', description: 'Melee Weapon Attack.' }],
				reactions: [],
				legendaryActions: [],
			},
		} as never);
		expect(statDefaults?.armorClass).toBe(13);
		expect(statDefaults?.maxHp).toBe(11);
		expect(statDefaults?.initiativeModifier).toBe(2);
		expect(statDefaults?.statsPreview?.actions).toContain('Bite');
	});

	it('builds encounter logs with summary output and participant object ids', () => {
		const state = createDefaultCombatState('2026-03-02T00:00:00.000Z');
		const withCombatants = normalizeCombatState({
			...state,
			encounterName: 'Bridge Skirmish',
			round: 4,
			notes: 'The party pushed the goblins off the bridge.',
			loot: '- 17 gp\n- silver dagger',
			combatants: [
				{
					id: 'pc',
					name: 'Elyra',
					linkedObjectId: 'obj-pc',
					linkedObjectName: 'Elyra',
					currentHp: 7,
					maxHp: 23,
					damageDealt: 19,
					outcome: 'active',
				},
				{
					id: 'npc',
					name: 'Goblin Skirmisher',
					linkedObjectId: 'obj-goblin',
					linkedObjectName: 'Goblin Skirmisher',
					currentHp: 0,
					maxHp: 11,
					damageDealt: 4,
					outcome: 'fell',
				},
			],
		});
		const summary = summarizeEncounter(withCombatants);
		expect(summary.totalDamageDealt).toBe(23);
		expect(summary.fell.map((combatant) => combatant.name)).toContain('Goblin Skirmisher');

		const draft = buildEncounterLogDraft(withCombatants, {
			now: new Date('2026-03-02T12:00:00.000Z'),
		});
		expect(draft.title).toContain('Bridge Skirmish');
		expect(draft.tags).toEqual(expect.arrayContaining(['combat', 'encounter-log']));
		expect(draft.content).toContain('## Outcome Summary');
		expect(draft.content).toContain('Total Damage Dealt: 23');
		expect(draft.participantObjectIds).toEqual(expect.arrayContaining(['obj-pc', 'obj-goblin']));
	});
});
