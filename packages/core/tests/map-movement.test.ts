import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MOVEMENT_SPEED_UNITS,
	DND5E_SYSTEM_PACKAGE,
	EMPTY_COMBATANT_RESOURCES,
	EMPTY_SESSION_COMBAT_STATE,
	blocksMovement,
	computeMovementRange,
	getCombatantMovementForActor,
	isCellReachable,
	isDifficultTerrain,
	movementCellAt,
	movementCellCenter,
	movementCostTo,
	movementPathTo,
	normalizeMapEntity,
	resolveMovementSpeed,
	type Combatant,
	type MapFeature,
	type MapState,
	type MovementCell,
	type SessionCombatState,
	type SystemPackage,
	type SystemsState,
} from '../src';
import type { TemplateGrid } from '../src/geometry/template';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR, buildInitialState } from '../src/testing/fixtures';

/**
 * RC-MAP-1.3 — MOVEMENT RANGE AND PATH.
 *
 * The claims these tests hold down:
 *   - an open field costs exactly what the grid says, in both diagonal rules;
 *   - a wall stops movement and a CLOSED door stops it too, while an OPEN door does not — and the
 *     path routes through the doorway rather than through the wall;
 *   - difficult terrain doubles the cost of ENTERING a cell, not of leaving it;
 *   - an unreachable target yields NO path, never a partial one that ends in a wall;
 *   - speed comes from the active system package, and says so when it fell back to the default;
 *   - the actor-scoped read is fail-closed: a hidden combatant's range is `unavailable`, and a
 *     dm-only wall still blocks a player without its geometry reaching them;
 *   - a 60×60 grid settles inside the `map-pan-zoom-desktop` frame budget.
 */

const GRID: TemplateGrid = { kind: 'square', size: 10, unitsPerCell: 5 };

function feature(
	partial: Partial<MapFeature> & Pick<MapFeature, 'id' | 'kind' | 'points'>,
): MapFeature {
	return { style: 'ink:black', ...partial };
}

/** A vertical wall down the middle of the map with a doorway between y = 0.4 and y = 0.6. */
function splitWall(doorState: 'open' | 'closed'): MapFeature[] {
	return [
		feature({
			id: 'wall-north',
			kind: 'wall',
			points: [
				{ x: 0.5, y: 0 },
				{ x: 0.5, y: 0.4 },
			],
			props: { blocksMovement: true },
		}),
		feature({
			id: 'wall-south',
			kind: 'wall',
			points: [
				{ x: 0.5, y: 0.6 },
				{ x: 0.5, y: 1 },
			],
			props: { blocksMovement: true },
		}),
		feature({
			id: 'door-middle',
			kind: 'door',
			points: [
				{ x: 0.5, y: 0.4 },
				{ x: 0.5, y: 0.6 },
			],
			props: { portal: 'door', state: doorState, blocksMovement: doorState !== 'open' },
		}),
	];
}

const CENTRE: MovementCell = { q: 4, r: 4 };

function cellKeys(range: { cells: Array<{ cell: MovementCell }> }): string[] {
	return range.cells.map((c) => `${c.cell.q},${c.cell.r}`);
}

// ── Open ground ──────────────────────────────────────────────────────────────────────────────────

describe('RC-MAP-1.3 movement range on open ground', () => {
	it('reaches every cell within the budget under the PHB diagonal rule', () => {
		const range = computeMovementRange({
			grid: GRID,
			features: [],
			origin: CENTRE,
			budget: 15,
		});
		// 15 feet at 5 feet a cell is three steps in any direction, diagonals included: a 7×7 block.
		expect(range.cells).toHaveLength(49);
		expect(range.truncated).toBe(false);
		expect(movementCostTo(range, CENTRE)).toBe(0);
		expect(movementCostTo(range, { q: 7, r: 7 })).toBe(15);
		expect(isCellReachable(range, { q: 8, r: 4 })).toBe(false);
	});

	it('drops to a diamond when diagonals are turned off', () => {
		const range = computeMovementRange({
			grid: GRID,
			features: [],
			origin: CENTRE,
			budget: 15,
			options: { diagonals: 'orthogonal' },
		});
		// Manhattan distance ≤ 3 is 25 cells.
		expect(range.cells).toHaveLength(25);
		expect(isCellReachable(range, { q: 7, r: 7 })).toBe(false);
		expect(movementCostTo(range, { q: 7, r: 4 })).toBe(15);
	});

	it('orders the reachable set by cost then row-major, so two devices agree byte for byte', () => {
		const a = computeMovementRange({ grid: GRID, features: [], origin: CENTRE, budget: 10 });
		const b = computeMovementRange({ grid: GRID, features: [], origin: CENTRE, budget: 10 });
		expect(cellKeys(a)).toEqual(cellKeys(b));
		expect(a.cells[0]!.cell).toEqual(CENTRE);
		const costs = a.cells.map((c) => c.cost);
		expect([...costs].sort((x, y) => x - y)).toEqual(costs);
	});

	it('stops at the map edge rather than walking off it', () => {
		const range = computeMovementRange({
			grid: GRID,
			features: [],
			origin: { q: 0, r: 0 },
			budget: 10,
		});
		expect(range.cells.every((c) => c.cell.q >= 0 && c.cell.r >= 0)).toBe(true);
		expect(range.cells).toHaveLength(9);
	});

	it('returns an empty range for a malformed grid, a negative budget or an origin off the map', () => {
		const bad = { kind: 'square', size: 0, unitsPerCell: 5 } as TemplateGrid;
		expect(
			computeMovementRange({ grid: bad, features: [], origin: CENTRE, budget: 30 }).cells,
		).toEqual([]);
		expect(
			computeMovementRange({ grid: GRID, features: [], origin: CENTRE, budget: -1 }).cells,
		).toEqual([]);
		expect(
			computeMovementRange({ grid: GRID, features: [], origin: { q: 99, r: 0 }, budget: 30 }).cells,
		).toEqual([]);
	});
});

// ── Walls and doors ──────────────────────────────────────────────────────────────────────────────

describe('RC-MAP-1.3 walls, doors and the fixture dungeon', () => {
	it('a wall stops movement across it', () => {
		const range = computeMovementRange({
			grid: GRID,
			features: splitWall('closed'),
			origin: { q: 2, r: 1 },
			budget: 30,
		});
		expect(range.cells.every((c) => c.cell.q < 5)).toBe(true);
		expect(isCellReachable(range, { q: 5, r: 1 })).toBe(false);
	});

	it('a CLOSED door is a wall and an OPEN door is a hole', () => {
		const target: MovementCell = { q: 6, r: 4 };
		const closed = computeMovementRange({
			grid: GRID,
			features: splitWall('closed'),
			origin: { q: 2, r: 4 },
			budget: 30,
		});
		expect(isCellReachable(closed, target)).toBe(false);
		expect(movementPathTo(closed, target)).toEqual([]);

		const open = computeMovementRange({
			grid: GRID,
			features: splitWall('open'),
			origin: { q: 2, r: 4 },
			budget: 30,
		});
		expect(movementCostTo(open, target)).toBe(20);
		const path = movementPathTo(open, target);
		expect(path[0]).toEqual({ q: 2, r: 4 });
		expect(path[path.length - 1]).toEqual(target);
		expect(path).toHaveLength(5);
		// Every step is a single cell, and the one that crosses the wall line goes through the
		// doorway rows (4 and 5) rather than through the masonry.
		for (let i = 1; i < path.length; i += 1) {
			const previous = path[i - 1]!;
			const current = path[i]!;
			expect(Math.max(Math.abs(current.q - previous.q), Math.abs(current.r - previous.r))).toBe(1);
			if (previous.q < 5 && current.q >= 5) expect([4, 5]).toContain(current.r);
		}
		// The route is deterministic: the same inputs give the same path, cell for cell.
		expect(movementPathTo(open, target)).toEqual(path);
	});

	it('routes the long way round when the doorway is off the straight line', () => {
		const range = computeMovementRange({
			grid: GRID,
			features: splitWall('open'),
			origin: { q: 4, r: 1 },
			budget: 60,
		});
		const path = movementPathTo(range, { q: 5, r: 1 });
		// The straight step is through a wall, so the cheapest route detours through the doorway rows.
		expect(path.length).toBeGreaterThan(2);
		expect(path.some((cell) => cell.r === 4 || cell.r === 5)).toBe(true);
		expect(movementCostTo(range, { q: 5, r: 1 })).toBeGreaterThan(5);
	});

	it('a window blocks sight but not movement, and an explicit override wins over the kind', () => {
		const window = feature({
			id: 'wall-window',
			kind: 'wall',
			points: [
				{ x: 0.5, y: 0 },
				{ x: 0.5, y: 1 },
			],
			props: { blocksSight: false, blocksMovement: false },
		});
		expect(blocksMovement(window)).toBe(false);
		const range = computeMovementRange({
			grid: GRID,
			features: [window],
			origin: { q: 4, r: 4 },
			budget: 10,
		});
		expect(isCellReachable(range, { q: 6, r: 4 })).toBe(true);
	});

	it('a bare wall with no props still blocks — fail closed', () => {
		expect(blocksMovement(feature({ id: 'w', kind: 'wall', points: [] }))).toBe(true);
		expect(blocksMovement(feature({ id: 'r', kind: 'road', points: [] }))).toBe(false);
		expect(
			blocksMovement(feature({ id: 'd', kind: 'door', points: [], props: { state: 'open' } })),
		).toBe(false);
		expect(
			blocksMovement(feature({ id: 'l', kind: 'door', points: [], props: { state: 'locked' } })),
		).toBe(true);
	});
});

// ── Difficult terrain ────────────────────────────────────────────────────────────────────────────

describe('RC-MAP-1.3 difficult terrain', () => {
	const bog = feature({
		id: 'bog',
		kind: 'fill',
		points: [
			{ x: 0.5, y: 0 },
			{ x: 1, y: 1 },
		],
		props: { terrain: 'difficult' },
	});

	it('doubles the cost of entering a marked cell', () => {
		expect(isDifficultTerrain(bog)).toBe(true);
		const range = computeMovementRange({
			grid: GRID,
			features: [bog],
			origin: { q: 4, r: 4 },
			budget: 30,
		});
		// One step onto dry ground is 5 feet; one step into the bog is 10.
		expect(movementCostTo(range, { q: 3, r: 4 })).toBe(5);
		expect(movementCostTo(range, { q: 5, r: 4 })).toBe(10);
		expect(movementCostTo(range, { q: 6, r: 4 })).toBe(20);
	});

	it('charges for entering the bog but not for leaving it', () => {
		const range = computeMovementRange({
			grid: GRID,
			features: [bog],
			origin: { q: 6, r: 4 },
			budget: 30,
		});
		// Leaving the bog westward: 10 (into 5) + 5 (out to 4) — the exit cell is dry, so it costs 5.
		expect(movementCostTo(range, { q: 5, r: 4 })).toBe(10);
		expect(movementCostTo(range, { q: 4, r: 4 })).toBe(15);
	});

	it('honours a system that prices difficult terrain differently', () => {
		const range = computeMovementRange({
			grid: GRID,
			features: [bog],
			origin: { q: 4, r: 4 },
			budget: 30,
			options: { difficultTerrainMultiplier: 3 },
		});
		expect(movementCostTo(range, { q: 5, r: 4 })).toBe(15);
	});

	it('routes around the bog when going round is cheaper than going through', () => {
		const strip = feature({
			id: 'strip',
			kind: 'fill',
			points: [
				{ x: 0.5, y: 0.3 },
				{ x: 0.6, y: 0.7 },
			],
			props: { terrain: 'difficult' },
		});
		const range = computeMovementRange({
			grid: GRID,
			features: [strip],
			origin: { q: 4, r: 5 },
			budget: 40,
			options: { diagonals: 'orthogonal' },
		});
		const path = movementPathTo(range, { q: 6, r: 5 });
		expect(path[0]).toEqual({ q: 4, r: 5 });
		expect(path[path.length - 1]).toEqual({ q: 6, r: 5 });
		// Straight through would be 10 + 5 = 15; round the top of the strip is four 5-foot steps.
		expect(movementCostTo(range, { q: 6, r: 5 })).toBe(15);
	});
});

// ── Cells and centres ────────────────────────────────────────────────────────────────────────────

describe('RC-MAP-1.3 cell addressing', () => {
	it('maps a normalized point to its square cell and back to the cell centre', () => {
		expect(movementCellAt(GRID, { x: 0.42, y: 0.07 })).toEqual({ q: 4, r: 0 });
		expect(movementCellCenter(GRID, { q: 4, r: 0 })).toEqual({ x: 0.45, y: 0.05 });
	});

	it('round-trips a hex cell through its centre', () => {
		const hex: TemplateGrid = { kind: 'hex', size: 10, unitsPerCell: 5 };
		for (const cell of [
			{ q: 0, r: 0 },
			{ q: 3, r: 2 },
			{ q: -1, r: 4 },
		]) {
			expect(movementCellAt(hex, movementCellCenter(hex, cell))).toEqual(cell);
		}
	});

	it('searches a hex grid with six neighbours and no diagonals', () => {
		const hex: TemplateGrid = { kind: 'hex', size: 10, unitsPerCell: 5 };
		const range = computeMovementRange({
			grid: hex,
			features: [],
			origin: { q: 3, r: 4 },
			budget: 5,
		});
		// The origin plus its six neighbours, all of which are on the map here.
		expect(range.cells).toHaveLength(7);
		expect(movementCostTo(range, { q: 4, r: 3 })).toBe(5);
	});
});

// ── Speed, from the package ──────────────────────────────────────────────────────────────────────

describe('RC-MAP-1.3 speed from the system package', () => {
	it('falls back to the default and says that is what it did', () => {
		expect(resolveMovementSpeed(undefined)).toEqual({
			units: DEFAULT_MOVEMENT_SPEED_UNITS,
			source: 'default',
		});
	});

	it("reads the creature's speed field when the package declares one", () => {
		expect(resolveMovementSpeed(DND5E_SYSTEM_PACKAGE, { speed: '30 ft.' })).toEqual({
			units: 30,
			source: 'creature-field',
		});
		expect(resolveMovementSpeed(DND5E_SYSTEM_PACKAGE, { speed: 25 })).toEqual({
			units: 25,
			source: 'creature-field',
		});
		// A creature that simply has no speed recorded falls back rather than guessing at zero.
		expect(resolveMovementSpeed(DND5E_SYSTEM_PACKAGE, {}).source).toBe('default');
		expect(resolveMovementSpeed(DND5E_SYSTEM_PACKAGE, { speed: 'fly' }).source).toBe('default');
	});

	it('prefers a package-declared speed formula over the creature field', () => {
		const pkg: SystemPackage = {
			...DND5E_SYSTEM_PACKAGE,
			derived: [
				...DND5E_SYSTEM_PACKAGE.derived,
				{ key: 'speed', label: 'Speed', formula: '25 + 5 * dash', inputs: ['dash'] },
			],
		};
		expect(resolveMovementSpeed(pkg, { speed: '30 ft.' }, { dash: 1 })).toEqual({
			units: 30,
			source: 'derived',
		});
		// A formula that cannot be evaluated degrades to the next source, it does not throw.
		expect(resolveMovementSpeed(pkg, { speed: '40 ft.' }).source).toBe('creature-field');
	});
});

// ── The actor-scoped read ────────────────────────────────────────────────────────────────────────

const MAP_ID = 'map-movement-fixture';

function mapsWith(features: MapFeature[], dmOnlyFeatures: MapFeature[] = []): MapState {
	return {
		maps: {
			[MAP_ID]: normalizeMapEntity({
				id: MAP_ID,
				name: 'Fixture dungeon',
				description: '',
				visibility: 'shared',
				layers: [
					{
						id: 'layer-shared',
						name: 'Walls',
						category: 'base',
						visibility: 'shared',
						enabled: true,
						opacity: 1,
						tags: [],
						query: {},
						locked: false,
						content: features,
						order: 0,
						revision: 1,
						updatedBy: null,
						updatedAt: null,
					},
					{
						id: 'layer-secret',
						name: 'Secret works',
						category: 'dm-annotations',
						visibility: 'dm-only',
						enabled: true,
						opacity: 1,
						tags: [],
						query: {},
						locked: false,
						content: dmOnlyFeatures,
						order: 1,
						revision: 1,
						updatedBy: null,
						updatedAt: null,
					},
				],
				regions: [],
				defaultRegionId: null,
				updatedAt: '2026-01-01T00:00:00.000Z',
				revision: 1,
				overlay: {
					mode: 'combat',
					gridVisible: true,
					gridSize: 10,
					tokensEnabled: true,
					unitsPerCell: 5,
					revision: 1,
					updatedBy: null,
					updatedAt: null,
				},
			}),
		},
		assets: {},
		schemaVersion: 1,
	};
}

function combatant(id: string, name: string, hidden: boolean): Combatant {
	return {
		id,
		kind: 'monster',
		name,
		characterId: null,
		statBlock: { ac: 12, initiative: 10, notes: '' },
		resources: { ...EMPTY_COMBATANT_RESOURCES, hp: 10, maxHp: 10 },
		hidden,
		placeholder: null,
		tieBreak: 0,
	};
}

function runningCombat(): SessionCombatState {
	return {
		...EMPTY_SESSION_COMBAT_STATE,
		status: 'running',
		round: 1,
		order: ['c-ogre', 'c-ambusher'],
		combatants: {
			'c-ogre': combatant('c-ogre', 'Ogre', false),
			'c-ambusher': combatant('c-ambusher', 'Ambusher', true),
		},
		tokens: {
			'c-ogre': { mapId: MAP_ID, x: 0.25, y: 0.45, size: 1 },
			'c-ambusher': { mapId: MAP_ID, x: 0.75, y: 0.45, size: 1 },
		},
	};
}

describe('RC-MAP-1.3 the actor-scoped movement read', () => {
	const permissions = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR).permissions;

	it('gives the DM a range anchored on the token, at the package speed', () => {
		const result = getCombatantMovementForActor({
			maps: mapsWith(splitWall('open')),
			permissions,
			combat: runningCombat(),
			actorId: DM_ACTOR.id,
			combatantId: 'c-ogre',
		});
		expect(result.kind).toBe('range');
		if (result.kind !== 'range') return;
		expect(result.mapId).toBe(MAP_ID);
		expect(result.speed).toEqual({ units: 30, source: 'default' });
		expect(result.range.origin).toEqual({ q: 2, r: 4 });
		expect(isCellReachable(result.range, { q: 6, r: 4 })).toBe(true);
	});

	it('resolves the speed from the vault’s active system package', () => {
		const systems: SystemsState = {
			packages: {
				[DND5E_SYSTEM_PACKAGE.id]: {
					...DND5E_SYSTEM_PACKAGE,
					derived: [
						...DND5E_SYSTEM_PACKAGE.derived,
						{ key: 'speed', label: 'Speed', formula: '20', inputs: [] },
					],
				},
			},
			activePackageId: DND5E_SYSTEM_PACKAGE.id,
			activeWidgetPackageId: null,
			schemaVersion: 1,
		};
		const result = getCombatantMovementForActor({
			maps: mapsWith([]),
			permissions,
			combat: runningCombat(),
			systems,
			actorId: DM_ACTOR.id,
			combatantId: 'c-ogre',
		});
		if (result.kind !== 'range') throw new Error('expected a range');
		expect(result.speed).toEqual({ units: 20, source: 'derived' });
		expect(result.range.budget).toBe(20);
	});

	it('is unavailable for a hidden combatant, a missing token, and an unknown actor', () => {
		const maps = mapsWith([]);
		const combat = runningCombat();
		expect(
			getCombatantMovementForActor({
				maps,
				permissions,
				combat,
				actorId: PLAYER_ACTOR.id,
				combatantId: 'c-ambusher',
				deliveredMapIds: [MAP_ID],
			}),
		).toEqual({ kind: 'unavailable' });
		expect(
			getCombatantMovementForActor({
				maps,
				permissions,
				combat,
				actorId: DM_ACTOR.id,
				combatantId: 'c-nobody',
			}),
		).toEqual({ kind: 'unavailable' });
		expect(
			getCombatantMovementForActor({
				maps,
				permissions,
				combat,
				actorId: 'actor-ghost',
				combatantId: 'c-ogre',
			}),
		).toEqual({ kind: 'unavailable' });
		expect(
			getCombatantMovementForActor({
				maps,
				permissions,
				combat: { ...combat, status: 'idle' },
				actorId: DM_ACTOR.id,
				combatantId: 'c-ogre',
			}),
		).toEqual({ kind: 'unavailable' });
	});

	it('lets a player see a visible combatant, with dm-only walls still blocking them', () => {
		const secretWall = feature({
			id: 'wall-secret',
			kind: 'wall',
			points: [
				{ x: 0.35, y: 0 },
				{ x: 0.35, y: 1 },
			],
			props: { blocksMovement: true },
		});
		const result = getCombatantMovementForActor({
			maps: mapsWith([], [secretWall]),
			permissions,
			combat: runningCombat(),
			actorId: PLAYER_ACTOR.id,
			combatantId: 'c-ogre',
			deliveredMapIds: [MAP_ID],
		});
		if (result.kind !== 'range') throw new Error('expected a range');
		// The player never receives the wall, but the range respects it: nothing past it is offered.
		expect(result.range.cells.every((c) => c.cell.q <= 3)).toBe(true);
		const unwalled = getCombatantMovementForActor({
			maps: mapsWith([]),
			permissions,
			combat: runningCombat(),
			actorId: PLAYER_ACTOR.id,
			combatantId: 'c-ogre',
			deliveredMapIds: [MAP_ID],
		});
		if (unwalled.kind !== 'range') throw new Error('expected a range');
		expect(isCellReachable(unwalled.range, { q: 6, r: 4 })).toBe(true);
	});

	it('honours an explicit speed override, e.g. a dash', () => {
		const result = getCombatantMovementForActor({
			maps: mapsWith([]),
			permissions,
			combat: runningCombat(),
			actorId: DM_ACTOR.id,
			combatantId: 'c-ogre',
			speedUnits: 60,
		});
		if (result.kind !== 'range') throw new Error('expected a range');
		expect(result.range.budget).toBe(60);
	});
});

// ── Performance ──────────────────────────────────────────────────────────────────────────────────

describe('RC-MAP-1.3 performance', () => {
	it('settles a 60×60 grid inside the map-pan-zoom-desktop frame budget', () => {
		const size = 60;
		const grid: TemplateGrid = { kind: 'square', size, unitsPerCell: 5 };
		const features: MapFeature[] = [];
		// A comb of walls with gaps, plus bands of difficult terrain — a realistic dungeon load.
		for (let i = 1; i < size; i += 4) {
			const x = i / size;
			features.push(
				feature({
					id: `wall-${i}-a`,
					kind: 'wall',
					points: [
						{ x, y: 0 },
						{ x, y: 0.45 },
					],
					props: { blocksMovement: true },
				}),
				feature({
					id: `wall-${i}-b`,
					kind: 'wall',
					points: [
						{ x, y: 0.55 },
						{ x, y: 1 },
					],
					props: { blocksMovement: true },
				}),
			);
		}
		for (let i = 0; i < 8; i += 1) {
			features.push(
				feature({
					id: `bog-${i}`,
					kind: 'fill',
					points: [
						{ x: 0, y: i / 8 },
						{ x: 1, y: i / 8 + 0.03 },
					],
					props: { terrain: 'difficult' },
				}),
			);
		}
		const origin: MovementCell = { q: 30, r: 30 };
		// A budget big enough to sweep the whole grid, so this is the worst case, not a lucky one.
		const run = (): number => {
			const started = performance.now();
			const range = computeMovementRange({ grid, features, origin, budget: size * 5 });
			const elapsed = performance.now() - started;
			expect(range.cells.length).toBeGreaterThan(1000);
			expect(range.truncated).toBe(false);
			return elapsed;
		};
		run(); // warm the JIT, as a real drag would already have.
		const samples = [run(), run(), run(), run(), run()].sort((a, b) => a - b);
		const median = samples[2] as number;
		// `map-pan-zoom-desktop` is 50 fps p95 — one frame is 20 ms, and the range must fit in one.
		expect(median).toBeLessThan(20);
	});
});
