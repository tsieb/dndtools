// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	autoPlaceCombatTokens,
	cellsForTemplate,
	conditionIconsForCombatant,
	findShortestPath,
	hpBarToneForCombatant,
	movementSquaresForCombatant,
	parseSpeedFeet,
	rangeProfileForCombatant,
	reachableCells,
} from './combat-map.js';
import type { SessionBoardCombatant } from '$lib/types/session-board.js';

function mockCombatant(overrides: Partial<SessionBoardCombatant>): SessionBoardCombatant {
	return {
		id: overrides.id ?? 'c-1',
		name: overrides.name ?? 'Combatant',
		initiative: overrides.initiative ?? null,
		initiativeModifier: overrides.initiativeModifier ?? 0,
		tieRank: overrides.tieRank ?? 0,
		ready: overrides.ready ?? false,
		delayed: overrides.delayed ?? false,
		isPlayerCharacter: overrides.isPlayerCharacter ?? false,
		currentHp: overrides.currentHp ?? 10,
		maxHp: overrides.maxHp ?? 10,
		armorClass: overrides.armorClass ?? null,
		conditions: overrides.conditions ?? [],
		concentration: overrides.concentration ?? false,
		deathSaves: overrides.deathSaves ?? { successes: 0, failures: 0 },
		outcome: overrides.outcome ?? 'active',
		damageDealt: overrides.damageDealt ?? 0,
		startingHp: overrides.startingHp ?? 10,
		linkedObjectId: overrides.linkedObjectId,
		linkedObjectType: overrides.linkedObjectType,
		linkedObjectName: overrides.linkedObjectName,
		statsPreview: overrides.statsPreview,
		statsExpanded: overrides.statsExpanded ?? false,
	};
}

describe('combat-map domain', () => {
	it('parses speed text and converts to movement squares', () => {
		expect(parseSpeedFeet('30 ft.')).toBe(30);
		expect(parseSpeedFeet('walk 25 ft., fly 50 ft.')).toBe(25);
		const combatant = mockCombatant({
			statsPreview: {
				speed: '40 ft.',
				traits: [],
				actions: [],
				reactions: [],
				legendaryActions: [],
			},
		});
		expect(movementSquaresForCombatant(combatant)).toBe(8);
	});

	it('derives range profiles from action text hints', () => {
		const combatant = mockCombatant({
			statsPreview: {
				traits: [],
				actions: ['Longbow 150/600'],
				reactions: [],
				legendaryActions: [],
			},
		});
		const profile = rangeProfileForCombatant(combatant);
		expect(profile?.feet).toBe(150);
		expect(profile?.squares).toBe(30);
	});

	it('finds shortest path around blocked cells and counts difficult terrain cost', () => {
		const path = findShortestPath(
			{ x: 0, y: 0 },
			{ x: 2, y: 0 },
			{
				gridType: 'square',
				blocked: new Set(['1,0']),
				difficultTerrain: new Set(['1,1']),
			},
		);
		expect(path).not.toBeNull();
		expect(path?.cells.some((cell) => cell.x === 1 && cell.y === 0)).toBe(false);
		expect(path?.cost).toBeGreaterThanOrEqual(4);
	});

	it('computes reachable cells with weighted difficult terrain', () => {
		const reachable = reachableCells({ x: 0, y: 0 }, 2, {
			gridType: 'square',
			blocked: new Set(),
			difficultTerrain: new Set(['1,0']),
		});
		const byKey = new Set(reachable.map((entry) => `${entry.cell.x},${entry.cell.y}`));
		expect(byKey.has('1,0')).toBe(true);
		expect(byKey.has('2,0')).toBe(false);
	});

	it('builds template coverage for sphere, cone, cube, and line', () => {
		const sphere = cellsForTemplate(
			{
				id: 's1',
				shape: 'sphere',
				originX: 0,
				originY: 0,
				targetX: 0,
				targetY: 0,
				radiusSquares: 1,
				createdAt: '2026-03-04T00:00:00.000Z',
			},
			'square',
		);
		const cone = cellsForTemplate(
			{
				id: 'c1',
				shape: 'cone',
				originX: 0,
				originY: 0,
				targetX: 3,
				targetY: 0,
				radiusSquares: 3,
				createdAt: '2026-03-04T00:00:00.000Z',
			},
			'square',
		);
		const line = cellsForTemplate(
			{
				id: 'l1',
				shape: 'line',
				originX: 0,
				originY: 0,
				targetX: 4,
				targetY: 0,
				widthSquares: 1,
				lengthSquares: 4,
				createdAt: '2026-03-04T00:00:00.000Z',
			},
			'square',
		);
		const cube = cellsForTemplate(
			{
				id: 'q1',
				shape: 'cube',
				originX: 1,
				originY: 1,
				targetX: 1,
				targetY: 1,
				radiusSquares: 1,
				createdAt: '2026-03-04T00:00:00.000Z',
			},
			'square',
		);
		expect(sphere).toHaveLength(5);
		expect(cone.length).toBeGreaterThan(0);
		expect(line.length).toBeGreaterThanOrEqual(4);
		expect(cube).toHaveLength(9);
	});

	it('auto-places missing combat tokens while keeping existing placements', () => {
		const combatants = [
			mockCombatant({ id: 'a', name: 'Aria' }),
			mockCombatant({ id: 'b', name: 'Borin' }),
			mockCombatant({ id: 'c', name: 'Cinder' }),
		];
		const tokens = autoPlaceCombatTokens(combatants, [{ combatantId: 'a', x: 4, y: 2 }]);
		expect(tokens).toHaveLength(3);
		expect(tokens.find((token) => token.combatantId === 'a')).toEqual(
			expect.objectContaining({ x: 4, y: 2 }),
		);
		const uniqueCells = new Set(tokens.map((token) => `${token.x},${token.y}`));
		expect(uniqueCells.size).toBe(tokens.length);
	});

	it('maps conditions and hp state to token indicators', () => {
		const combatant = mockCombatant({
			currentHp: 3,
			maxHp: 20,
			conditions: ['Frozen', 'Poisoned'],
			concentration: true,
		});
		expect(conditionIconsForCombatant(combatant)).toEqual(expect.arrayContaining(['❄', '☣']));
		expect(hpBarToneForCombatant(combatant)).toBe('low');
	});
});
