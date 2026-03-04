// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	buildEnvironmentChecklist,
	buildLegendaryActionsFromStatBlock,
	buildLairActionsFromStatBlock,
	buildPartyThresholds,
	buildXpAwards,
	calculateEncounterBudget,
	classifyEncounterDifficulty,
	createDefaultEncounterState,
	estimateEncounterTreasureTier,
	getEncounterDifficultyMeterPercent,
	getTreasureTableNameForTier,
	inferEnvironmentTypeFromNote,
	normalizeEncounterState,
	parseChallengeRating,
	parseLegendaryActionCost,
	xpForChallengeRating,
} from './encounter-builder.js';

describe('encounter-builder domain', () => {
	it('parses challenge ratings and resolves XP values', () => {
		expect(parseChallengeRating('CR 1/2')).toMatchObject({
			normalized: '1/2',
			xp: 100,
		});
		expect(parseChallengeRating('5')).toMatchObject({
			normalized: '5',
			xp: 1800,
		});
		expect(parseChallengeRating('invalid')).toBeNull();
		expect(xpForChallengeRating('CR 3')).toBe(700);
		expect(xpForChallengeRating('not-a-cr')).toBe(0);
	});

	it('builds party thresholds and encounter budget with multipliers', () => {
		const partyMembers = [
			{ id: 'p1', name: 'A', level: 5 },
			{ id: 'p2', name: 'B', level: 5 },
			{ id: 'p3', name: 'C', level: 5 },
			{ id: 'p4', name: 'D', level: 5 },
		];
		const thresholds = buildPartyThresholds(partyMembers);
		expect(thresholds).toEqual({
			easy: 1000,
			medium: 2000,
			hard: 3000,
			deadly: 4400,
		});

		const budget = calculateEncounterBudget(partyMembers, [
			{
				id: 'c1',
				name: 'Ogre',
				count: 2,
				challengeRating: '2',
				xpPerCreature: 450,
				legendaryActions: [],
				lairActions: [],
			},
			{
				id: 'c2',
				name: 'Goblin',
				count: 4,
				challengeRating: '1/4',
				xpPerCreature: 50,
				legendaryActions: [],
				lairActions: [],
			},
		]);
		expect(budget.baseXp).toBe(1100);
		expect(budget.multiplier).toBe(2);
		expect(budget.adjustedXp).toBe(2200);
		expect(budget.difficulty).toBe('medium');
	});

	it('classifies difficulty and exposes meter percentage against deadly threshold', () => {
		expect(classifyEncounterDifficulty(0, { easy: 100, medium: 200, hard: 300, deadly: 400 })).toBe(
			'trivial',
		);
		expect(
			classifyEncounterDifficulty(350, { easy: 100, medium: 200, hard: 300, deadly: 400 }),
		).toBe('hard');
		expect(
			classifyEncounterDifficulty(1000, { easy: 100, medium: 200, hard: 300, deadly: 400 }),
		).toBe('overwhelming');
		expect(
			getEncounterDifficultyMeterPercent({
				easy: 100,
				medium: 200,
				hard: 300,
				deadly: 400,
				baseXp: 200,
				adjustedXp: 300,
				multiplier: 1.5,
				difficulty: 'hard',
			}),
		).toBe(75);
	});

	it('derives environment types from note metadata and checklist guidance', () => {
		const inferred = inferEnvironmentTypeFromNote({
			tags: ['map', 'dungeon'],
			frontmatter: {
				map: {
					environmentType: 'dungeon',
				},
			},
		} as never);
		expect(inferred).toBe('dungeon');
		const checklist = buildEnvironmentChecklist(inferred, { includeLairHint: true });
		expect(checklist.length).toBeGreaterThan(1);
		expect(checklist.some((entry) => entry.label.includes('initiative count 20'))).toBe(true);
	});

	it('extracts legendary/lair actions from stat blocks and parses legendary costs', () => {
		const statBlock = {
			id: 'obj-dragon',
			type: 'stat_block',
			name: 'Adult Blue Dragon',
			summary: '',
			tags: [],
			relationships: [],
			createdAt: '2026-03-02T00:00:00.000Z',
			updatedAt: '2026-03-02T00:00:00.000Z',
			data: {
				abilities: { str: 23, dex: 10, con: 21, int: 16, wis: 15, cha: 19 },
				traits: [
					{ name: 'Lair Actions', description: '- Arc lightning pulse\n- Shifting sand cloud' },
				],
				actions: [],
				reactions: [],
				legendaryActions: [
					{ name: 'Tail Attack', description: 'Melee Weapon Attack.' },
					{ name: 'Wing Attack (Costs 2 Actions)', description: 'The dragon beats its wings.' },
				],
			},
		} as never;
		const legendary = buildLegendaryActionsFromStatBlock(statBlock);
		expect(legendary).toHaveLength(2);
		expect(legendary[1]?.cost).toBe(2);
		expect(parseLegendaryActionCost('Wing Attack', 'Costs 2 Actions')).toBe(2);
		const lair = buildLairActionsFromStatBlock(statBlock);
		expect(lair.map((entry) => entry.name)).toEqual(
			expect.arrayContaining(['Arc lightning pulse', 'Shifting sand cloud']),
		);
	});

	it('normalizes encounter state and recalculates budget fields', () => {
		const normalized = normalizeEncounterState({
			encounterName: '  Bridge Fight  ',
			partyMembers: [{ id: 'p1', name: 'Elyra', level: 5 }],
			combatants: [
				{
					id: 'c1',
					name: 'Goblin',
					count: 3,
					challengeRating: '1/4',
					xpPerCreature: 50,
					legendaryActions: [],
					lairActions: [],
				},
			],
			budget: {
				easy: 0,
				medium: 0,
				hard: 0,
				deadly: 0,
				baseXp: 0,
				adjustedXp: 0,
				multiplier: 1,
				difficulty: 'easy',
			},
			notableRolls: [
				{
					id: 'roll-1',
					kind: 'critical_hit',
					combatantName: 'Elyra',
					round: 1,
					recordedAt: '2026-03-02T00:00:00.000Z',
				},
			],
		});
		expect(normalized.encounterName).toBe('Bridge Fight');
		expect(normalized.budget.baseXp).toBe(150);
		expect(normalized.notableRolls).toHaveLength(1);
		expect(normalized.round).toBe(1);
	});

	it('builds XP awards and treasure tier/table selections', () => {
		const party = [
			{ id: 'party-1', name: 'Elyra', level: 5, linkedObjectId: 'obj-elyra' },
			{ id: 'party-2', name: 'Thorn', level: 5 },
		];
		const awards = buildXpAwards(party as never, 1200);
		expect(awards).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: 'Elyra', xp: 600 }),
				expect.objectContaining({ name: 'Thorn', xp: 600 }),
			]),
		);
		const tier = estimateEncounterTreasureTier([
			{
				id: 'c1',
				name: 'Dragon',
				count: 1,
				challengeRating: '13',
				xpPerCreature: 10000,
				legendaryActions: [],
				lairActions: [],
			},
		]);
		expect(tier).toBe(3);
		expect(getTreasureTableNameForTier(tier)).toBe('5e Treasure Hoard Tier 3');
	});

	it('creates safe default encounter state', () => {
		const state = createDefaultEncounterState('2026-03-02T00:00:00.000Z');
		expect(state.round).toBe(1);
		expect(state.budget.difficulty).toBe('trivial');
		expect(state.startedAt).toBe('2026-03-02T00:00:00.000Z');
	});
});
