import { describe, expect, it } from 'vitest';
import { normalizeSessionState, type SessionConditionName } from './session-state.js';

describe('normalizeSessionState', () => {
	it('returns idle defaults for invalid input', () => {
		const state = normalizeSessionState(null);
		expect(state.mode).toBe('idle');
		expect(state.activeSession).toBeNull();
		expect(state.partyLocation).toBeNull();
		expect(state.sessionRollHistory).toEqual([]);
		expect(state.pinnedRollableTableIds).toEqual([]);
	});

	it('preserves valid active session payload', () => {
		const startedAt = '2026-03-07T12:00:00.000Z';
		const state = normalizeSessionState({
			version: 1,
			mode: 'active',
			activeSession: {
				sessionBoardId: 'board-1',
				startedAt,
				sceneId: 'scene-2',
				combatActive: true,
				combatants: [
					{
						id: 'combatant-1',
						name: 'Goblin',
						kind: 'creature',
						initiative: 14,
						currentHp: 7,
						maxHp: 7,
						tempHp: 0,
						conditions: [
							{
								name: 'Prone',
								roundsRemaining: 2,
							},
						],
					},
				],
				currentRound: 3,
				activeCombatantIndex: 0,
				selectedCombatantId: 'combatant-1',
				referenceObjectId: 'obj-goblin',
			},
		});
		expect(state.mode).toBe('active');
		expect(state.activeSession?.sessionBoardId).toBe('board-1');
		expect(state.activeSession?.startedAt).toBe(startedAt);
		expect(state.activeSession?.sceneId).toBe('scene-2');
		expect(state.activeSession?.combatActive).toBe(true);
		expect(state.activeSession?.combatants).toHaveLength(1);
		expect(state.activeSession?.currentRound).toBe(3);
		expect(state.activeSession?.activeCombatantIndex).toBe(0);
		expect(state.activeSession?.selectedCombatantId).toBe('combatant-1');
		expect(state.activeSession?.referenceObjectId).toBe('obj-goblin');
	});

	it('keeps party location while session is idle', () => {
		const state = normalizeSessionState({
			version: 1,
			partyLocation: {
				mapId: 'map-1',
				x: 0.3,
				y: 0.7,
				source: 'point',
				updatedAt: '2026-03-07T12:00:00.000Z',
			},
		});
		expect(state.mode).toBe('idle');
		expect(state.partyLocation?.mapId).toBe('map-1');
		expect(state.sessionRollHistory).toEqual([]);
	});

	it('normalizes session roll history and keeps only valid entries while active', () => {
		const state = normalizeSessionState({
			version: 1,
			mode: 'active',
			activeSession: {
				sessionBoardId: 'board-1',
				startedAt: '2026-03-07T12:00:00.000Z',
				sceneId: null,
				combatActive: false,
				combatants: [],
				currentRound: 1,
				activeCombatantIndex: 0,
				selectedCombatantId: null,
				referenceObjectId: null,
			},
			sessionRollHistory: [
				{
					id: 'roll-2',
					at: '2026-03-07T12:02:00.000Z',
					kind: 'table',
					source: 'table',
					expression: 'Loot',
					result: 'Silver goblet',
					breakdown: '',
					rolls: [],
					label: null,
					naturalResult: null,
				},
				{
					id: 'roll-1',
					at: '2026-03-07T12:01:00.000Z',
					kind: 'dice',
					source: 'tray',
					expression: '1d20+5',
					result: '25',
					breakdown: '1d20 (20) +5',
					rolls: [
						{
							notation: '1d20',
							rolls: [20],
							kept: [20],
							keptIndices: [0],
							subtotal: 20,
						},
					],
					label: 'Stealth check',
					naturalResult: 'nat20',
				},
				{ nope: true },
			],
			pinnedRollableTableIds: ['table-1', 'table-1', ' table-2 '],
		});

		expect(state.sessionRollHistory).toHaveLength(2);
		expect(state.sessionRollHistory[0]?.id).toBe('roll-2');
		expect(state.sessionRollHistory[1]?.naturalResult).toBe('nat20');
		expect(state.pinnedRollableTableIds).toEqual(['table-1', 'table-2']);
	});

	it('normalizes malformed combatant condition payloads', () => {
		const state = normalizeSessionState({
			version: 1,
			mode: 'active',
			activeSession: {
				sessionBoardId: 'board-1',
				startedAt: '2026-03-07T12:00:00.000Z',
				sceneId: null,
				combatActive: true,
				combatants: [
					{
						id: 'combatant-1',
						name: 'Bandit',
						kind: 'npc',
						initiative: '12',
						currentHp: -20,
						maxHp: '11',
						tempHp: '5',
						conditions: [
							{ name: 'Prone', roundsRemaining: 2 },
							{ name: 'Prone', roundsRemaining: 8 },
							{ name: 'Unknown', roundsRemaining: 1 },
						],
					},
				],
				currentRound: 0,
				activeCombatantIndex: 99,
				selectedCombatantId: 'missing-id',
				referenceObjectId: 'obj-bandit',
			},
		});

		const combatant = state.activeSession?.combatants[0];
		expect(combatant?.initiative).toBe(12);
		expect(combatant?.currentHp).toBe(0);
		expect(combatant?.maxHp).toBe(11);
		expect(combatant?.tempHp).toBe(5);
		expect(combatant?.conditions).toEqual([
			{
				name: 'Prone' as SessionConditionName,
				roundsRemaining: 2,
			},
		]);
		expect(state.activeSession?.currentRound).toBe(1);
		expect(state.activeSession?.activeCombatantIndex).toBe(0);
		expect(state.activeSession?.selectedCombatantId).toBeNull();
		expect(state.activeSession?.referenceObjectId).toBe('obj-bandit');
	});

	it('drops session roll history when no active session exists', () => {
		const state = normalizeSessionState({
			mode: 'idle',
			sessionRollHistory: [
				{
					id: 'roll-1',
					at: '2026-03-07T12:01:00.000Z',
					kind: 'dice',
					source: 'tray',
					expression: '1d20',
					result: '20',
					breakdown: '1d20 (20)',
					rolls: [],
					label: null,
					naturalResult: 'nat20',
				},
			],
		});

		expect(state.sessionRollHistory).toEqual([]);
	});
});
