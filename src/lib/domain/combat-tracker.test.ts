// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	advanceCombatTurn,
	buildEncounterLogDraft,
	buildEncounterRewardSummary,
	createDefaultCombatState,
	getLinkedCombatantDefaults,
	moveTieCombatantByDirection,
	normalizeCombatState,
	recordCombatNotableRoll,
	reorderTieCombatants,
	sortCombatantsForInitiative,
	spendLegendaryAction,
	startCombatantTurn,
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
		const movedDown = moveTieCombatantByDirection(combatants, 'a', 'down');
		expect(movedDown?.map((combatant) => combatant.id)).toEqual(['b', 'a', 'c']);
		expect(moveTieCombatantByDirection(combatants, 'c', 'up')).toBeNull();
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
		expect(draft.content).toContain('## Combat Map Archive');
		expect(draft.content).toContain('Token Placements');
		expect(draft.content).toContain('Total Damage Dealt: 23');
		expect(draft.participantObjectIds).toEqual(expect.arrayContaining(['obj-pc', 'obj-goblin']));
	});

	it('normalizes combat map state and binds selection to active combatant', () => {
		const normalized = normalizeCombatState({
			activeCombatantId: 'pc',
			combatants: [{ id: 'pc', name: 'Elyra', initiative: 14, tieRank: 0 }],
			mapState: {
				mapId: 'map-bridge',
				selectedCombatantId: 'unknown',
				tokens: [
					{ combatantId: 'pc', x: 3, y: 2 },
					{ combatantId: 'missing', x: 9, y: 9 },
				],
				difficultTerrain: [
					{ x: 2, y: 1 },
					{ x: 2, y: 1 },
				],
				templates: [
					{
						id: 'template-1',
						shape: 'sphere',
						originX: 3,
						originY: 2,
						targetX: 3,
						targetY: 2,
						radiusSquares: 2,
						createdAt: '2026-03-04T00:00:00.000Z',
					},
				],
				history: [
					{
						id: 'history-1',
						at: '2026-03-04T00:00:00.000Z',
						kind: 'movement',
						message: 'Elyra moved.',
					},
				],
				fogState: {
					revealedPolygons: [
						{
							points: [
								{ x: 0.1, y: 0.1 },
								{ x: 0.2, y: 0.1 },
								{ x: 0.2, y: 0.2 },
							],
						},
					],
				},
			},
		});
		expect(normalized.mapState.mapId).toBe('map-bridge');
		expect(normalized.mapState.tokens).toHaveLength(1);
		expect(normalized.mapState.selectedCombatantId).toBe('pc');
		expect(normalized.mapState.difficultTerrain).toHaveLength(1);
		expect(normalized.mapState.templates).toHaveLength(1);
		expect(normalized.mapState.history).toHaveLength(1);
		expect(normalized.mapState.fogState?.polygons).toHaveLength(1);
		expect(normalized.mapState.fogState?.polygons[0]?.mode).toBe('reveal');
	});

	it('resets legendary charges on turn start and auto-triggers lair actions at initiative 20', () => {
		const state = normalizeCombatState({
			round: 1,
			activeCombatantId: 'a',
			combatants: [
				{ id: 'a', name: 'Dragon', initiative: 22, tieRank: 0, delayed: false, ready: false },
				{ id: 'b', name: 'Lich', initiative: 18, tieRank: 0, delayed: false, ready: false },
			],
			legendaryTrackers: [
				{
					combatantId: 'b',
					combatantName: 'Lich',
					chargesMax: 3,
					chargesRemaining: 0,
					actions: [{ id: 'l-1', name: 'Cantrip', cost: 1, usedCount: 0 }],
				},
			],
			lairTracker: {
				enabled: true,
				initiativeCount: 20,
				lastTriggeredRound: null,
				actions: [{ id: 'la-1', name: 'Arcane Pulse', autoTrigger: true, usedCount: 0 }],
			},
		});

		const advanced = advanceCombatTurn(state);
		expect(advanced.activeCombatantId).toBe('b');
		expect(advanced.legendaryTrackers[0]?.chargesRemaining).toBe(3);
		expect(advanced.lairTracker.lastTriggeredRound).toBe(1);
		expect(advanced.lairTracker.actions[0]?.usedCount).toBe(1);
	});

	it('spends legendary action charges and records notable rolls', () => {
		const state = normalizeCombatState({
			round: 3,
			activeCombatantId: 'drake',
			combatants: [{ id: 'drake', name: 'Drake', initiative: 16, tieRank: 0 }],
			legendaryTrackers: [
				{
					combatantId: 'drake',
					combatantName: 'Drake',
					chargesMax: 3,
					chargesRemaining: 3,
					actions: [{ id: 'tail', name: 'Tail Swipe', cost: 2, usedCount: 0 }],
				},
			],
		});
		const spent = spendLegendaryAction(state, 'drake', 'tail');
		expect(spent.legendaryTrackers[0]?.chargesRemaining).toBe(1);
		expect(spent.legendaryTrackers[0]?.actions[0]?.usedCount).toBe(1);

		const withRoll = recordCombatNotableRoll(spent, {
			kind: 'critical_hit',
			combatantName: 'Drake',
		});
		expect(withRoll.notableRolls).toHaveLength(1);
		expect(withRoll.notableRolls[0]?.kind).toBe('critical_hit');
		expect(withRoll.notableRolls[0]?.round).toBe(3);
	});

	it('derives reward summary and includes timeline/reward details in encounter logs', () => {
		const state = normalizeCombatState({
			encounterName: 'Crypt Break',
			round: 5,
			outcome: 'Party sealed the crypt and escaped.',
			combatants: [
				{
					id: 'pc1',
					name: 'Iris',
					isPlayerCharacter: true,
					linkedObjectType: 'character',
					linkedObjectId: 'obj-iris',
					statsPreview: { traits: [], actions: [], reactions: [], legendaryActions: [], level: 5 },
				},
				{
					id: 'pc2',
					name: 'Bran',
					isPlayerCharacter: true,
					linkedObjectType: 'character',
					linkedObjectId: 'obj-bran',
					statsPreview: { traits: [], actions: [], reactions: [], legendaryActions: [], level: 5 },
				},
				{
					id: 'wight',
					name: 'Wight',
					isPlayerCharacter: false,
					statsPreview: {
						traits: [],
						actions: [],
						reactions: [],
						legendaryActions: [],
						challengeRating: '3',
					},
				},
			],
		});
		const rewardSummary = buildEncounterRewardSummary(state);
		expect(rewardSummary.totalBaseXp).toBe(700);
		expect(rewardSummary.xpAwards.map((entry) => entry.xp)).toEqual([350, 350]);

		const draft = buildEncounterLogDraft(state, {
			now: new Date('2026-03-02T12:00:00.000Z'),
			timelineEventId: 'timeline-42',
			timelineEventTitle: 'Battle of the Crypt',
			xpAwards: rewardSummary.xpAwards,
			treasureRoll: {
				tableName: rewardSummary.treasureTableName,
				tier: rewardSummary.treasureTier,
				result: 'Gem cache worth 120 gp',
			},
		});
		expect(draft.tags).toContain('timeline-linked');
		expect(draft.content).toContain('Timeline Event: [[Battle of the Crypt]] (timeline-42)');
		expect(draft.content).toContain('Gem cache worth 120 gp');
		expect(draft.content).toContain('XP [[Iris]]: 350');
	});

	it('can set an explicit active combatant turn', () => {
		const state = normalizeCombatState({
			round: 2,
			activeCombatantId: null,
			combatants: [
				{ id: 'a', name: 'A', initiative: 17, tieRank: 0 },
				{ id: 'b', name: 'B', initiative: 12, tieRank: 0 },
			],
			legendaryTrackers: [
				{
					combatantId: 'b',
					combatantName: 'B',
					chargesMax: 3,
					chargesRemaining: 0,
					actions: [{ id: 'b-1', name: 'Swipe', cost: 1, usedCount: 0 }],
				},
			],
		});
		const activated = startCombatantTurn(state, 'b');
		expect(activated.activeCombatantId).toBe('b');
		expect(activated.legendaryTrackers[0]?.chargesRemaining).toBe(3);
	});
});
