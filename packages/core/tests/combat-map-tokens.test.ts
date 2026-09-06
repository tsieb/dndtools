import { describe, expect, it } from 'vitest';
import {
	COMBAT_TRACKER_SCHEMA_VERSION,
	DEFAULT_COMBAT_TOKEN_SIZE,
	autoPlaceCombatTokens,
	cloneCombatToken,
	createDemoMapState,
	dispatchCommand,
	ensureSessionCombatState,
	getCombatTrackerForActor,
	getMapViewForActor,
	isCombatTokenPlacement,
	type CombatToken,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type MapViewResult,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * RC-MAP-1.1 — SESSION COMBAT TOKENS: where each combatant is standing while combat runs.
 *
 * The load-bearing claims these tests hold down:
 *   - a token is combat state, placed/moved/removed only through core commands, with a durable op
 *     carrying before AND after so every change replays and inverts;
 *   - starting combat with an active map puts the whole initiative order on the board in a
 *     deterministic formation;
 *   - a token inherits its COMBATANT's visibility exactly — a hidden foe's token is ABSENT from a
 *     player's map view, never a redacted marker at a real position.
 */

const WESTERN = 'map-western-reaches';
const KEEP = 'map-ruined-keep';

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

function dispatch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	command: CoreCommand,
): CommandResult {
	return dispatchCommand(state, env, command);
}

function available(view: MapViewResult): Extract<MapViewResult, { kind: 'available' }> {
	if (view.kind !== 'available')
		throw new Error(`expected an available map view, got ${view.kind}`);
	return view;
}

/**
 * An ACTIVE session that already holds the demo maps, optionally with `activeMap` pointing at one of
 * them (which is what makes `combat.start` auto-place the order).
 */
function activeSession(activeMapId: string | null = null): {
	state: CoreStateSlice;
	env: CoreEnvironment;
} {
	const env = makeEnvironment();
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const withMaps: CoreStateSlice = { ...base, maps: createDemoMapState() };
	const home = accept(
		dispatch(withMaps, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		}),
	).nextState;
	const homeSceneId = home.commandCenter.homeSceneId!;
	const active = accept(
		dispatch(home, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: homeSceneId },
		}),
	).nextState;
	if (!activeMapId) return { state: active, env };
	return {
		state: {
			...active,
			session: {
				...active.session,
				activeMap: {
					mapId: activeMapId,
					regionId: null,
					sceneId: homeSceneId,
					widgetInstanceId: 'widget-map',
					updatedBy: DM_ACTOR.id,
					updatedAt: '2026-01-01T00:00:00.000Z',
					revision: 1,
				},
			},
		},
		env,
	};
}

const GOBLIN_AND_OGRE = [
	{ kind: 'monster' as const, name: 'Goblin', initiative: 18, maxHp: 7 },
	{ kind: 'monster' as const, name: 'Ogre', initiative: 12, maxHp: 30 },
];

/** Start combat with the given rows and return the state plus the combatant ids by name. */
function startCombat(
	state: CoreStateSlice,
	env: CoreEnvironment,
	combatants: unknown[] = GOBLIN_AND_OGRE,
): { state: CoreStateSlice; idOf: (name: string) => string } {
	const started = accept(
		dispatch(state, env, { type: 'combat.start', actorId: DM_ACTOR.id, payload: { combatants } }),
	).nextState;
	const idOf = (name: string): string => {
		const found = started.session.combat.order.find(
			(id) => started.session.combat.combatants[id]!.name === name,
		);
		if (!found) throw new Error(`no combatant named ${name}`);
		return found;
	};
	return { state: started, idOf };
}

// ── The pure placement model ─────────────────────────────────────────────────────────────────────

describe('RC-MAP-1.1 the pure token placement model', () => {
	it('puts a lone combatant dead centre of the map', () => {
		expect(autoPlaceCombatTokens(['c1'], WESTERN)).toEqual({
			c1: { mapId: WESTERN, x: 0.5, y: 0.5, size: DEFAULT_COMBAT_TOKEN_SIZE },
		});
	});

	it('gives nine combatants nine distinct, in-bounds, well-formed positions', () => {
		const ids = Array.from({ length: 9 }, (_unused, index) => `c${index}`);
		const tokens = autoPlaceCombatTokens(ids, WESTERN);
		expect(Object.keys(tokens)).toHaveLength(9);
		const seen = new Set<string>();
		for (const id of ids) {
			const token = tokens[id]!;
			expect(isCombatTokenPlacement(token)).toBe(true);
			expect(token.mapId).toBe(WESTERN);
			seen.add(`${token.x},${token.y}`);
		}
		expect(seen.size).toBe(9);
	});

	it('is deterministic — the same order lays out identically, so a replay reproduces it', () => {
		const ids = ['a', 'b', 'c', 'd', 'e'];
		expect(autoPlaceCombatTokens(ids, KEEP)).toEqual(autoPlaceCombatTokens(ids, KEEP));
		// The formation follows the ORDER, not the id set: swapping two combatants swaps their cells.
		const swapped = autoPlaceCombatTokens(['b', 'a', 'c', 'd', 'e'], KEEP);
		expect(swapped['b']).toEqual(autoPlaceCombatTokens(ids, KEEP)['a']);
	});

	it('places nothing for an empty order', () => {
		expect(autoPlaceCombatTokens([], WESTERN)).toEqual({});
	});

	it('accepts a well-formed placement and refuses every malformed one', () => {
		const good: CombatToken = { mapId: WESTERN, x: 0.25, y: 0.75, size: 2, facing: 90 };
		expect(isCombatTokenPlacement(good)).toBe(true);
		expect(isCombatTokenPlacement({ ...good, mapId: '  ' })).toBe(false);
		expect(isCombatTokenPlacement({ ...good, x: -0.01 })).toBe(false);
		expect(isCombatTokenPlacement({ ...good, y: 1.5 })).toBe(false);
		expect(isCombatTokenPlacement({ ...good, size: 0 })).toBe(false);
		expect(isCombatTokenPlacement({ ...good, size: 21 })).toBe(false);
		expect(isCombatTokenPlacement({ ...good, facing: 360 })).toBe(false);
		expect(isCombatTokenPlacement({ ...good, facing: -1 })).toBe(false);
		expect(isCombatTokenPlacement({ ...good, x: Number.NaN })).toBe(false);
	});

	it('clones a token without sharing structure, and omits an absent facing', () => {
		const withFacing: CombatToken = { mapId: WESTERN, x: 0.1, y: 0.2, size: 1, facing: 45 };
		const copy = cloneCombatToken(withFacing);
		expect(copy).toEqual(withFacing);
		expect(copy).not.toBe(withFacing);
		expect(
			Object.keys(cloneCombatToken({ mapId: WESTERN, x: 0.1, y: 0.2, size: 1 })),
		).not.toContain('facing');
	});
});

describe('RC-MAP-1.1 tokens are an ADDITIVE field — no schema bump, tolerant hydration', () => {
	it('hydrates a combat persisted before tokens existed to an empty token map', () => {
		const legacy = ensureSessionCombatState({ status: 'running', round: 1, turn: 0 });
		expect(legacy.tokens).toEqual({});
		expect(legacy.schemaVersion).toBe(COMBAT_TRACKER_SCHEMA_VERSION);
	});

	it('keeps the slice schema version at 1 — the field is additive, so restores stay readable', () => {
		expect(COMBAT_TRACKER_SCHEMA_VERSION).toBe(1);
	});

	it('drops a corrupted placement on hydrate rather than handing a renderer bad coordinates', () => {
		const hydrated = ensureSessionCombatState({
			tokens: {
				good: { mapId: WESTERN, x: 0.5, y: 0.5, size: 1 },
				offMap: { mapId: WESTERN, x: 4, y: 0.5, size: 1 },
				noMap: { mapId: '', x: 0.5, y: 0.5, size: 1 },
			},
		});
		expect(Object.keys(hydrated.tokens)).toEqual(['good']);
	});
});

// ── Auto-placement on combat.start ───────────────────────────────────────────────────────────────

describe('RC-MAP-1.1 combat.start puts the order on the active map', () => {
	it('places every combatant when the session has an active map', () => {
		const { state, env } = activeSession(WESTERN);
		const { state: started, idOf } = startCombat(state, env);
		const tokens = started.session.combat.tokens;
		expect(Object.keys(tokens).sort()).toEqual([idOf('Goblin'), idOf('Ogre')].sort());
		for (const token of Object.values(tokens)) {
			expect(token.mapId).toBe(WESTERN);
			expect(isCombatTokenPlacement(token)).toBe(true);
		}
	});

	it('places nobody when no map is active — combat still runs, tokens come later', () => {
		const { state, env } = activeSession(null);
		const { state: started } = startCombat(state, env);
		expect(started.session.combat.tokens).toEqual({});
	});

	it('records the placement map on the start op so a replay reproduces the formation', () => {
		const { state, env } = activeSession(WESTERN);
		const { state: started } = startCombat(state, env);
		const op = started.sync.operations.at(-1)!;
		expect(op.opType).toBe('combat.start');
		expect(op.value).toMatchObject({ tokenMapId: WESTERN });
	});

	it('lays the auto-placed order out in the initiative sequence', () => {
		const { state, env } = activeSession(WESTERN);
		const { state: started } = startCombat(state, env);
		expect(started.session.combat.tokens).toEqual(
			autoPlaceCombatTokens(started.session.combat.order, WESTERN),
		);
	});
});

// ── place / move / remove ────────────────────────────────────────────────────────────────────────

describe('RC-MAP-1.1 combat.place-token', () => {
	it('places a token, logs it, and records a before/after op', () => {
		const { state, env } = activeSession(null);
		const { state: started, idOf } = startCombat(state, env);
		const goblin = idOf('Goblin');
		const placed = accept(
			dispatch(started, env, {
				type: 'combat.place-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblin, mapId: KEEP, x: 0.3, y: 0.4, size: 2, facing: 180 },
			}),
		);
		expect(placed.nextState.session.combat.tokens[goblin]).toEqual({
			mapId: KEEP,
			x: 0.3,
			y: 0.4,
			size: 2,
			facing: 180,
		});
		const op = placed.nextState.sync.operations.at(-1)!;
		expect(op.opType).toBe('combat.place-token');
		expect(op.path).toBe(`combat/tokens/${goblin}`);
		expect(op.value).toMatchObject({ before: null, after: { mapId: KEEP, x: 0.3, y: 0.4 } });
		expect(op.beforeRevision).toBeLessThan(op.afterRevision!);
		const entry = placed.nextState.session.combat.log.at(-1)!;
		expect(entry.kind).toBe('token-placed');
		expect(entry.combatantId).toBe(goblin);
		expect(placed.events).toContainEqual(
			expect.objectContaining({ kind: 'combat.token-placed', combatantId: goblin, mapId: KEEP }),
		);
	});

	it('defaults an unspecified footprint to one grid cell and carries no facing', () => {
		const { state, env } = activeSession(null);
		const { state: started, idOf } = startCombat(state, env);
		const placed = accept(
			dispatch(started, env, {
				type: 'combat.place-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: idOf('Ogre'), mapId: KEEP, x: 0.1, y: 0.1 },
			}),
		).nextState;
		const token = placed.session.combat.tokens[idOf('Ogre')]!;
		expect(token.size).toBe(DEFAULT_COMBAT_TOKEN_SIZE);
		expect(token.facing).toBeUndefined();
	});

	it('refuses a combatant who is not in the combat', () => {
		const { state, env } = activeSession(null);
		const { state: started } = startCombat(state, env);
		const result = rejected(
			dispatch(started, env, {
				type: 'combat.place-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: 'combatant-nope', mapId: KEEP, x: 0.5, y: 0.5 },
			}),
		);
		expect(result.rejection.code).toBe('combatant-not-found');
	});

	it('refuses a map that does not exist', () => {
		const { state, env } = activeSession(null);
		const { state: started, idOf } = startCombat(state, env);
		const result = rejected(
			dispatch(started, env, {
				type: 'combat.place-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: idOf('Goblin'), mapId: 'map-nope', x: 0.5, y: 0.5 },
			}),
		);
		expect(result.rejection.code).toBe('map-not-found');
	});

	it('refuses a position outside the map', () => {
		const { state, env } = activeSession(null);
		const { state: started, idOf } = startCombat(state, env);
		const result = rejected(
			dispatch(started, env, {
				type: 'combat.place-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: idOf('Goblin'), mapId: KEEP, x: 1.4, y: 0.5 },
			}),
		);
		expect(result.rejection.code).toBe('invalid-payload');
	});

	it('is DM-only — a player cannot put a combatant on the board', () => {
		const { state, env } = activeSession(null);
		const { state: started, idOf } = startCombat(state, env);
		const result = rejected(
			dispatch(started, env, {
				type: 'combat.place-token',
				actorId: PLAYER_ACTOR.id,
				payload: { combatantId: idOf('Goblin'), mapId: KEEP, x: 0.5, y: 0.5 },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(result.nextState.session.combat.tokens).toEqual({});
	});

	it('refuses when no combat is running', () => {
		const { state, env } = activeSession(null);
		const result = rejected(
			dispatch(state, env, {
				type: 'combat.place-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: 'combatant-1', mapId: KEEP, x: 0.5, y: 0.5 },
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
	});
});

describe('RC-MAP-1.1 combat.move-token', () => {
	it('repositions a placed token and records before/after, without flooding the encounter log', () => {
		const { state, env } = activeSession(WESTERN);
		const { state: started, idOf } = startCombat(state, env);
		const goblin = idOf('Goblin');
		const before = started.session.combat.tokens[goblin]!;
		const logLengthBefore = started.session.combat.log.length;
		const moved = accept(
			dispatch(started, env, {
				type: 'combat.move-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblin, x: 0.9, y: 0.1 },
			}),
		);
		expect(moved.nextState.session.combat.tokens[goblin]).toEqual({
			mapId: WESTERN,
			x: 0.9,
			y: 0.1,
			size: before.size,
		});
		// A drag happens many times a turn: it writes an op, never an encounter-log line.
		expect(moved.nextState.session.combat.log).toHaveLength(logLengthBefore);
		const op = moved.nextState.sync.operations.at(-1)!;
		expect(op.opType).toBe('combat.move-token');
		expect(op.value).toMatchObject({ before: { x: before.x }, after: { x: 0.9, y: 0.1 } });
		expect(moved.events).toContainEqual(
			expect.objectContaining({ kind: 'combat.token-moved', combatantId: goblin }),
		);
	});

	it('keeps the map, size and facing a move does not mention, and clears facing on an explicit null', () => {
		const { state, env } = activeSession(null);
		const { state: started, idOf } = startCombat(state, env);
		const ogre = idOf('Ogre');
		const placed = accept(
			dispatch(started, env, {
				type: 'combat.place-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: ogre, mapId: KEEP, x: 0.2, y: 0.2, size: 3, facing: 270 },
			}),
		).nextState;
		const kept = accept(
			dispatch(placed, env, {
				type: 'combat.move-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: ogre, x: 0.4, y: 0.4 },
			}),
		).nextState;
		expect(kept.session.combat.tokens[ogre]).toEqual({
			mapId: KEEP,
			x: 0.4,
			y: 0.4,
			size: 3,
			facing: 270,
		});
		const cleared = accept(
			dispatch(kept, env, {
				type: 'combat.move-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: ogre, x: 0.4, y: 0.4, facing: null },
			}),
		).nextState;
		expect(cleared.session.combat.tokens[ogre]!.facing).toBeUndefined();
	});

	it('refuses to move a combatant who was never placed', () => {
		const { state, env } = activeSession(null);
		const { state: started, idOf } = startCombat(state, env);
		const result = rejected(
			dispatch(started, env, {
				type: 'combat.move-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: idOf('Goblin'), x: 0.5, y: 0.5 },
			}),
		);
		expect(result.rejection.code).toBe('combat-token-not-placed');
	});

	it('refuses a player moving a monster they hold no authority over', () => {
		const { state, env } = activeSession(WESTERN);
		const { state: started, idOf } = startCombat(state, env);
		const result = rejected(
			dispatch(started, env, {
				type: 'combat.move-token',
				actorId: PLAYER_ACTOR.id,
				payload: { combatantId: idOf('Goblin'), x: 0.5, y: 0.5 },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('refuses an observer outright', () => {
		const { state, env } = activeSession(WESTERN);
		const { state: started, idOf } = startCombat(state, env);
		const result = rejected(
			dispatch(started, env, {
				type: 'combat.move-token',
				actorId: OBSERVER_ACTOR.id,
				payload: { combatantId: idOf('Goblin'), x: 0.5, y: 0.5 },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it("lets an authorized combat-participant walk their OWN character, but not the DM's monster", () => {
		const { state, env } = activeSession(WESTERN);
		const withChar = accept(
			dispatch(state, env, {
				type: 'character.quick-create',
				actorId: DM_ACTOR.id,
				payload: {
					kind: 'npc',
					name: 'Hero',
					visibility: 'player-visible',
					combat: { hp: 10, maxHp: 10, ac: 15 },
				},
			}),
		).nextState;
		const characterId = Object.keys(withChar.characters.characters)[0]!;
		const granted = accept(
			dispatch(withChar, env, {
				type: 'permission.grant-capability-set',
				actorId: DM_ACTOR.id,
				payload: {
					entityType: 'character',
					entityId: characterId,
					playerActorId: PLAYER_ACTOR.id,
					capabilitySet: 'combat-participant',
				},
			}),
		).nextState;
		const { state: started, idOf } = startCombat(granted, env, [
			{ kind: 'character', name: 'Hero', characterId, initiative: 16, maxHp: 10 },
			{ kind: 'monster', name: 'Goblin', initiative: 10, maxHp: 7 },
		]);
		const hero = idOf('Hero');
		const walked = accept(
			dispatch(started, env, {
				type: 'combat.move-token',
				actorId: PLAYER_ACTOR.id,
				payload: { combatantId: hero, x: 0.8, y: 0.8 },
			}),
		).nextState;
		expect(walked.session.combat.tokens[hero]).toMatchObject({ x: 0.8, y: 0.8 });
		expect(
			rejected(
				dispatch(walked, env, {
					type: 'combat.move-token',
					actorId: PLAYER_ACTOR.id,
					payload: { combatantId: idOf('Goblin'), x: 0.1, y: 0.1 },
				}),
			).rejection.code,
		).toBe('actor-not-authorized');
	});
});

describe('RC-MAP-1.1 combat.remove-token', () => {
	it('takes a combatant off the map, logs it, and leaves them in the initiative order', () => {
		const { state, env } = activeSession(WESTERN);
		const { state: started, idOf } = startCombat(state, env);
		const goblin = idOf('Goblin');
		const removed = accept(
			dispatch(started, env, {
				type: 'combat.remove-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblin },
			}),
		);
		expect(removed.nextState.session.combat.tokens[goblin]).toBeUndefined();
		expect(removed.nextState.session.combat.order).toContain(goblin);
		expect(removed.nextState.session.combat.log.at(-1)!.kind).toBe('token-removed');
		const op = removed.nextState.sync.operations.at(-1)!;
		expect(op.opType).toBe('combat.remove-token');
		expect(op.value).toMatchObject({ after: null });
		expect(removed.events).toContainEqual(
			expect.objectContaining({ kind: 'combat.token-removed', combatantId: goblin }),
		);
	});

	it('refuses a second removal — there is nothing left to take off', () => {
		const { state, env } = activeSession(WESTERN);
		const { state: started, idOf } = startCombat(state, env);
		const once = accept(
			dispatch(started, env, {
				type: 'combat.remove-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: idOf('Goblin') },
			}),
		).nextState;
		expect(
			rejected(
				dispatch(once, env, {
					type: 'combat.remove-token',
					actorId: DM_ACTOR.id,
					payload: { combatantId: idOf('Goblin') },
				}),
			).rejection.code,
		).toBe('combat-token-not-placed');
	});

	it('is DM-only', () => {
		const { state, env } = activeSession(WESTERN);
		const { state: started, idOf } = startCombat(state, env);
		expect(
			rejected(
				dispatch(started, env, {
					type: 'combat.remove-token',
					actorId: PLAYER_ACTOR.id,
					payload: { combatantId: idOf('Goblin') },
				}),
			).rejection.code,
		).toBe('actor-not-authorized');
	});

	it('removing the COMBATANT takes their token with them — no orphaned marker', () => {
		const { state, env } = activeSession(WESTERN);
		const { state: started, idOf } = startCombat(state, env);
		const goblin = idOf('Goblin');
		const removed = accept(
			dispatch(started, env, {
				type: 'combat.remove-combatant',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblin },
			}),
		).nextState;
		expect(removed.session.combat.tokens[goblin]).toBeUndefined();
		expect(Object.keys(removed.session.combat.tokens)).toEqual([idOf('Ogre')]);
	});
});

// ── Replay + inverse ─────────────────────────────────────────────────────────────────────────────

describe('RC-MAP-1.1 replay', () => {
	it('replaying the same command sequence on a fresh runtime reproduces identical tokens', () => {
		const run = (): CoreStateSlice => {
			const { state, env } = activeSession(WESTERN);
			const { state: started, idOf } = startCombat(state, env);
			const goblin = idOf('Goblin');
			const ogre = idOf('Ogre');
			const moved = accept(
				dispatch(started, env, {
					type: 'combat.move-token',
					actorId: DM_ACTOR.id,
					payload: { combatantId: goblin, x: 0.12, y: 0.34, facing: 90 },
				}),
			).nextState;
			const placed = accept(
				dispatch(moved, env, {
					type: 'combat.place-token',
					actorId: DM_ACTOR.id,
					payload: { combatantId: ogre, mapId: KEEP, x: 0.6, y: 0.6, size: 4 },
				}),
			).nextState;
			return placed;
		};
		const first = run();
		const second = run();
		expect(second.session.combat.tokens).toEqual(first.session.combat.tokens);
		expect(second.session.combat.revision).toBe(first.session.combat.revision);
		// The durable ops replay identically too — same types, same paths, same values.
		const tokenOps = (s: CoreStateSlice) =>
			s.sync.operations
				.filter(
					(op) => op.opType.startsWith('combat.') && (op.path ?? '').startsWith('combat/tokens/'),
				)
				.map((op) => ({ opType: op.opType, path: op.path, value: op.value }));
		expect(tokenOps(second)).toEqual(tokenOps(first));
	});

	it('a move op inverts: dispatching its `before` puts the combatant back where they stood', () => {
		const { state, env } = activeSession(WESTERN);
		const { state: started, idOf } = startCombat(state, env);
		const goblin = idOf('Goblin');
		const origin = started.session.combat.tokens[goblin]!;
		const moved = accept(
			dispatch(started, env, {
				type: 'combat.move-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblin, x: 0.05, y: 0.95 },
			}),
		).nextState;
		const op = moved.sync.operations.at(-1)!;
		const before = (op.value as { before: CombatToken }).before;
		const undone = accept(
			dispatch(moved, env, {
				type: 'combat.move-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblin, x: before.x, y: before.y, size: before.size },
			}),
		).nextState;
		expect(undone.session.combat.tokens[goblin]).toEqual(origin);
	});
});

// ── The actor-filtered reads ─────────────────────────────────────────────────────────────────────

/** Start combat on the player-visible Western Reaches with one hidden ambusher. */
function combatWithAmbusher(placeholder: string | null): {
	state: CoreStateSlice;
	env: CoreEnvironment;
	idOf: (name: string) => string;
} {
	const { state, env } = activeSession(WESTERN);
	const { state: started, idOf } = startCombat(state, env, [
		{ kind: 'monster', name: 'Goblin', initiative: 18, maxHp: 7 },
		{
			kind: 'monster',
			name: 'Shadow Assassin',
			initiative: 14,
			maxHp: 40,
			hidden: true,
			placeholder,
		},
	]);
	return { state: started, env, idOf };
}

describe('RC-MAP-1.1 tokens join the single actor-filtered map read', () => {
	it('the DM sees every token with its position, active-turn flag and move authority', () => {
		const { state, idOf } = combatWithAmbusher(null);
		const view = available(
			getMapViewForActor(state.maps, state.permissions, DM_ACTOR.id, WESTERN, {
				combat: state.session.combat,
			}),
		);
		expect(view.combatTokens.map((t) => t.combatantId)).toEqual(state.session.combat.order);
		expect(view.combatTokens.every((t) => t.canMove)).toBe(true);
		// The Goblin rolled highest, so it holds the turn.
		expect(view.combatTokens.find((t) => t.isActive)!.combatantId).toBe(idOf('Goblin'));
		expect(view.combatTokens[0]).toMatchObject({ name: 'Goblin', size: 1, facing: null });
	});

	it('a player sees the visible combatant and NOT the hidden one — no id, name, or coordinate', () => {
		const { state, env, idOf } = combatWithAmbusher(null);
		const assassin = idOf('Shadow Assassin');
		// Move the ambusher somewhere unmistakable, so the coordinate assertions below cannot pass by
		// coincidentally matching the visible combatant's position.
		const lurking = accept(
			dispatch(state, env, {
				type: 'combat.move-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: assassin, x: 0.777, y: 0.123 },
			}),
		).nextState;
		const view = available(
			getMapViewForActor(lurking.maps, lurking.permissions, PLAYER_ACTOR.id, WESTERN, {
				combat: lurking.session.combat,
			}),
		);
		expect(view.combatTokens.map((t) => t.combatantId)).toEqual([idOf('Goblin')]);
		const hiddenToken = lurking.session.combat.tokens[assassin]!;
		// The hard leak assertion: nothing about the ambusher survives into the player payload.
		const serialized = JSON.stringify(view);
		expect(serialized).not.toContain(assassin);
		expect(serialized).not.toContain('Shadow Assassin');
		expect(serialized).not.toContain(String(hiddenToken.x));
		expect(serialized).not.toContain(String(hiddenToken.y));
	});

	it('a DM-approved PLACEHOLDER gets a tracker row but still no token — never "unknown at (x, y)"', () => {
		const { state, idOf } = combatWithAmbusher('Unknown figure');
		const assassin = idOf('Shadow Assassin');
		// The tracker DOES show the placeholder row (the order must not reveal a moving gap)…
		const tracker = getCombatTrackerForActor(
			state.session.combat,
			state.permissions,
			PLAYER_ACTOR.id,
		);
		const row = tracker.combatants.find((c) => c.id === assassin)!;
		expect(row.redacted).toBe(true);
		expect(row.name).toBe('Unknown figure');
		// …but it carries NO position, and the map join omits the token outright.
		expect(row.token).toBeNull();
		const view = available(
			getMapViewForActor(state.maps, state.permissions, PLAYER_ACTOR.id, WESTERN, {
				combat: state.session.combat,
			}),
		);
		expect(view.combatTokens.map((t) => t.combatantId)).toEqual([idOf('Goblin')]);
		expect(JSON.stringify(view.combatTokens)).not.toContain('Unknown figure');
	});

	it('an observer sees the visible tokens but may move none of them', () => {
		const { state } = combatWithAmbusher(null);
		const view = available(
			getMapViewForActor(state.maps, state.permissions, OBSERVER_ACTOR.id, WESTERN, {
				combat: state.session.combat,
			}),
		);
		expect(view.combatTokens).toHaveLength(1);
		expect(view.combatTokens[0]!.canMove).toBe(false);
	});

	it('the DM hidden count reports the ambusher on the board; a player is told nothing', () => {
		const { state } = combatWithAmbusher(null);
		const dm = available(
			getMapViewForActor(state.maps, state.permissions, DM_ACTOR.id, WESTERN, {
				combat: state.session.combat,
			}),
		);
		const player = available(
			getMapViewForActor(state.maps, state.permissions, PLAYER_ACTOR.id, WESTERN, {
				combat: state.session.combat,
			}),
		);
		expect(dm.hidden.combatTokens).toBe(1);
		expect(player.hidden.combatTokens).toBe(0);
	});

	it('a caller that passes no combat gets no tokens — a read cannot leak what it never received', () => {
		const { state } = combatWithAmbusher(null);
		const view = available(getMapViewForActor(state.maps, state.permissions, DM_ACTOR.id, WESTERN));
		expect(view.combatTokens).toEqual([]);
		expect(view.hidden.combatTokens).toBe(0);
	});

	it('only tokens standing on THIS map are joined', () => {
		const { state, env } = activeSession(WESTERN);
		const { state: started, idOf } = startCombat(state, env);
		const moved = accept(
			dispatch(started, env, {
				type: 'combat.place-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: idOf('Ogre'), mapId: KEEP, x: 0.5, y: 0.5 },
			}),
		).nextState;
		const western = available(
			getMapViewForActor(moved.maps, moved.permissions, DM_ACTOR.id, WESTERN, {
				combat: moved.session.combat,
			}),
		);
		const keep = available(
			getMapViewForActor(moved.maps, moved.permissions, DM_ACTOR.id, KEEP, {
				combat: moved.session.combat,
			}),
		);
		expect(western.combatTokens.map((t) => t.combatantId)).toEqual([idOf('Goblin')]);
		expect(keep.combatTokens.map((t) => t.combatantId)).toEqual([idOf('Ogre')]);
	});

	it('an ENDED combat draws nothing, though its placements survive for the archive', () => {
		const { state, env } = activeSession(WESTERN);
		const { state: started, idOf } = startCombat(state, env);
		const ended = accept(
			dispatch(started, env, { type: 'combat.end', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		expect(Object.keys(ended.session.combat.tokens)).toHaveLength(2);
		const view = available(
			getMapViewForActor(ended.maps, ended.permissions, DM_ACTOR.id, WESTERN, {
				combat: ended.session.combat,
			}),
		);
		expect(view.combatTokens).toEqual([]);
		const tracker = getCombatTrackerForActor(ended.session.combat, ended.permissions, DM_ACTOR.id);
		expect(tracker.combatants.find((c) => c.id === idOf('Goblin'))!.token).toBeNull();
	});

	it('a map the actor cannot see stays unavailable — tokens never make it reachable', () => {
		const { state, env } = activeSession(null);
		const { state: started, idOf } = startCombat(state, env);
		const placed = accept(
			dispatch(started, env, {
				type: 'combat.place-token',
				actorId: DM_ACTOR.id,
				payload: { combatantId: idOf('Goblin'), mapId: 'map-hidden-outpost', x: 0.5, y: 0.5 },
			}),
		).nextState;
		const view = getMapViewForActor(
			placed.maps,
			placed.permissions,
			PLAYER_ACTOR.id,
			'map-hidden-outpost',
			{ combat: placed.session.combat },
		);
		expect(view.kind).toBe('unavailable');
		expect(JSON.stringify(view)).not.toContain(idOf('Goblin'));
	});
});

describe('RC-MAP-1.1 the tracker view carries the placement it may show', () => {
	it("gives a visible combatant's row its live token", () => {
		const { state, idOf } = combatWithAmbusher(null);
		const tracker = getCombatTrackerForActor(state.session.combat, state.permissions, DM_ACTOR.id);
		const goblin = tracker.combatants.find((c) => c.id === idOf('Goblin'))!;
		expect(goblin.token).toEqual(state.session.combat.tokens[idOf('Goblin')]);
	});

	it('omits the hidden combatant entirely when no placeholder was approved', () => {
		const { state, idOf } = combatWithAmbusher(null);
		const tracker = getCombatTrackerForActor(
			state.session.combat,
			state.permissions,
			PLAYER_ACTOR.id,
		);
		expect(tracker.combatants.map((c) => c.id)).toEqual([idOf('Goblin')]);
		expect(JSON.stringify(tracker)).not.toContain(idOf('Shadow Assassin'));
	});
});
