import { describe, expect, it } from 'vitest';
import {
	MAX_COMBAT_TEMPLATES,
	MAX_TEMPLATE_SIZE_UNITS,
	cloneCombatTemplate,
	createDemoMapState,
	dispatchCommand,
	ensureSessionCombatState,
	isCombatTemplate,
	templateCellCount,
	templatesOnMap,
	type CombatTemplate,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type TemplateGrid,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * RC-MAP-1.2 — AoE TEMPLATES as EPHEMERAL SESSION STATE.
 *
 * The claims these tests hold down:
 *   - a template only ever enters state through a core command, DM-only, and only while a combat is
 *     actually running in an active session;
 *   - each write appends a durable op carrying before AND after, so it replays and inverts;
 *   - ending combat CLEARS every template — an area of effect never outlives the fight it was cast
 *     in and so can never surface on a map a player is shown later;
 *   - the stored shape feeds the coverage geometry directly, so "who is in the fireball" is answered
 *     from state rather than from something a renderer measured.
 */

const WESTERN = 'map-western-reaches';
const KEEP = 'map-ruined-keep';
const GRID: TemplateGrid = { kind: 'square', size: 40, unitsPerCell: 5 };

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

/** An ACTIVE session holding the demo maps. */
function activeSession(): { state: CoreStateSlice; env: CoreEnvironment } {
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
	const state = accept(
		dispatch(home, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: home.commandCenter.homeSceneId! },
		}),
	).nextState;
	return { state, env };
}

const GOBLIN_AND_OGRE = [
	{ kind: 'monster' as const, name: 'Goblin', initiative: 18, maxHp: 7 },
	{ kind: 'monster' as const, name: 'Ogre', initiative: 12, maxHp: 30 },
];

function startCombat(
	state: CoreStateSlice,
	env: CoreEnvironment,
): { state: CoreStateSlice; idOf: (name: string) => string } {
	const started = accept(
		dispatch(state, env, {
			type: 'combat.start',
			actorId: DM_ACTOR.id,
			payload: { combatants: GOBLIN_AND_OGRE },
		}),
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

const FIREBALL = {
	kind: 'sphere' as const,
	mapId: WESTERN,
	label: 'Fireball',
	x: 0.5,
	y: 0.5,
	size: 20,
};

/** Place a fireball and return the new state plus the template it created. */
function placeFireball(
	state: CoreStateSlice,
	env: CoreEnvironment,
	overrides: Record<string, unknown> = {},
): { state: CoreStateSlice; template: CombatTemplate } {
	const result = accept(
		dispatch(state, env, {
			type: 'combat.place-template',
			actorId: DM_ACTOR.id,
			payload: { ...FIREBALL, ...overrides },
		}),
	);
	const templates = result.nextState.session.combat.templates;
	return { state: result.nextState, template: templates[templates.length - 1]! };
}

// ── The pure template model ──────────────────────────────────────────────────────────────────────

describe('RC-MAP-1.2 the pure template model', () => {
	const good: CombatTemplate = {
		id: 'tpl-1',
		kind: 'cone',
		mapId: WESTERN,
		label: 'Breath weapon',
		origin: { x: 0.4, y: 0.6 },
		rotation: 90,
		size: 30,
		sourceCombatantId: null,
		placedBy: DM_ACTOR.id,
		placedAt: '2026-01-01T00:00:00.000Z',
	};

	it('accepts a well-formed template and refuses every malformed one', () => {
		expect(isCombatTemplate(good)).toBe(true);
		expect(isCombatTemplate({ ...good, id: '  ' })).toBe(false);
		expect(isCombatTemplate({ ...good, mapId: '' })).toBe(false);
		expect(isCombatTemplate({ ...good, label: '   ' })).toBe(false);
		expect(isCombatTemplate({ ...good, size: 0 })).toBe(false);
		expect(isCombatTemplate({ ...good, size: MAX_TEMPLATE_SIZE_UNITS + 1 })).toBe(false);
		expect(isCombatTemplate({ ...good, rotation: 360 })).toBe(false);
		expect(isCombatTemplate({ ...good, origin: { x: 1.5, y: 0.5 } })).toBe(false);
		expect(isCombatTemplate({ ...good, width: MAX_TEMPLATE_SIZE_UNITS + 1 })).toBe(false);
	});

	it('clones without sharing structure', () => {
		const copy = cloneCombatTemplate({ ...good, width: 10 });
		expect(copy).toEqual({ ...good, width: 10 });
		copy.origin.x = 0.9;
		expect(good.origin.x).toBe(0.4);
	});

	it('hydrates an older combat with no templates, and drops corrupted ones', () => {
		expect(ensureSessionCombatState(undefined).templates).toEqual([]);
		const hydrated = ensureSessionCombatState({
			templates: [good, { ...good, id: 'tpl-2', size: -4 }],
		});
		expect(hydrated.templates.map((t) => t.id)).toEqual(['tpl-1']);
	});

	it('reports the templates on one map without the ones on another', () => {
		const state = ensureSessionCombatState({
			templates: [good, { ...good, id: 'tpl-2', mapId: KEEP }],
		});
		expect(templatesOnMap(state, WESTERN).map((t) => t.id)).toEqual(['tpl-1']);
		expect(templatesOnMap(state, KEEP).map((t) => t.id)).toEqual(['tpl-2']);
	});
});

// ── Placing and removing ─────────────────────────────────────────────────────────────────────────

describe('RC-MAP-1.2 placing an area of effect', () => {
	it('stores the shape the DM placed and announces it', () => {
		const { state, env } = activeSession();
		const started = startCombat(state, env).state;
		const result = accept(
			dispatch(started, env, {
				type: 'combat.place-template',
				actorId: DM_ACTOR.id,
				payload: FIREBALL,
			}),
		);
		const templates = result.nextState.session.combat.templates;
		expect(templates).toHaveLength(1);
		const template = templates[0]!;
		expect(template.kind).toBe('sphere');
		expect(template.label).toBe('Fireball');
		expect(template.mapId).toBe(WESTERN);
		expect(template.origin).toEqual({ x: 0.5, y: 0.5 });
		expect(template.size).toBe(20);
		expect(template.rotation).toBe(0);
		expect(template.placedBy).toBe(DM_ACTOR.id);
		expect(result.events).toContainEqual(
			expect.objectContaining({
				kind: 'combat.template-placed',
				templateId: template.id,
				templateKind: 'sphere',
				mapId: WESTERN,
			}),
		);
	});

	it('writes a durable op carrying before and after, so it replays and inverts', () => {
		const { state, env } = activeSession();
		const started = startCombat(state, env).state;
		const before = started.sync.operations.length;
		const { state: placed, template } = placeFireball(started, env);
		const op = placed.sync.operations[before]!;
		expect(op.opType).toBe('combat.place-template');
		expect(op.path).toBe(`combat/templates/${template.id}`);
		expect(op.value).toEqual({ before: null, after: cloneCombatTemplate(template) });
		expect(op.afterRevision).toBeGreaterThan(op.beforeRevision ?? 0);

		const removed = accept(
			dispatch(placed, env, {
				type: 'combat.remove-template',
				actorId: DM_ACTOR.id,
				payload: { templateId: template.id },
			}),
		);
		const removeOp = removed.nextState.sync.operations.at(-1)!;
		expect(removeOp.opType).toBe('combat.remove-template');
		expect(removeOp.value).toEqual({ before: cloneCombatTemplate(template), after: null });
		expect(removed.nextState.session.combat.templates).toEqual([]);
	});

	it('keeps the encounter log about the fight, not about the shapes on the board', () => {
		const { state, env } = activeSession();
		const started = startCombat(state, env).state;
		const logBefore = started.session.combat.log.length;
		const { state: placed, template } = placeFireball(started, env);
		const cleared = accept(
			dispatch(placed, env, {
				type: 'combat.remove-template',
				actorId: DM_ACTOR.id,
				payload: { templateId: template.id },
			}),
		).nextState;
		expect(cleared.session.combat.log).toHaveLength(logBefore);
	});

	it('records the combatant the effect came from when one is named', () => {
		const { state, env } = activeSession();
		const { state: started, idOf } = startCombat(state, env);
		const { template } = placeFireball(started, env, { sourceCombatantId: idOf('Ogre') });
		expect(template.sourceCombatantId).toBe(idOf('Ogre'));
	});

	it('accepts all four shapes, with a rotation and a line width', () => {
		const { state, env } = activeSession();
		let current = startCombat(state, env).state;
		for (const shape of [
			{ kind: 'cone' as const, label: 'Breath weapon', rotation: 90, size: 30 },
			{ kind: 'line' as const, label: 'Lightning bolt', rotation: 45, size: 100, width: 5 },
			{ kind: 'cube' as const, label: 'Wall of force', rotation: 180, size: 15 },
		]) {
			current = placeFireball(current, env, shape).state;
		}
		expect(current.session.combat.templates.map((t) => t.kind)).toEqual(['cone', 'line', 'cube']);
		expect(current.session.combat.templates[1]!.width).toBe(5);
		expect(current.session.combat.templates[0]!.rotation).toBe(90);
	});

	it('feeds the coverage geometry straight from state', () => {
		const { state, env } = activeSession();
		const started = startCombat(state, env).state;
		const { template } = placeFireball(started, env);
		expect(templateCellCount(template, GRID)).toBe(52);
	});
});

// ── Fail-closed ──────────────────────────────────────────────────────────────────────────────────

describe('RC-MAP-1.2 templates fail closed', () => {
	it('refuses a player and an observer — what a spell covers is the DM ruling', () => {
		const { state, env } = activeSession();
		const started = startCombat(state, env).state;
		for (const actor of [PLAYER_ACTOR, OBSERVER_ACTOR]) {
			const result = rejected(
				dispatch(started, env, {
					type: 'combat.place-template',
					actorId: actor.id,
					payload: FIREBALL,
				}),
			);
			expect(result.rejection.code).toBe('actor-not-authorized');
		}
	});

	it('refuses when no combat is running', () => {
		const { state, env } = activeSession();
		const result = rejected(
			dispatch(state, env, {
				type: 'combat.place-template',
				actorId: DM_ACTOR.id,
				payload: FIREBALL,
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
	});

	it('refuses a map that does not exist', () => {
		const { state, env } = activeSession();
		const started = startCombat(state, env).state;
		const result = rejected(
			dispatch(started, env, {
				type: 'combat.place-template',
				actorId: DM_ACTOR.id,
				payload: { ...FIREBALL, mapId: 'map-nowhere' },
			}),
		);
		expect(result.rejection.code).toBe('map-not-found');
	});

	it('refuses a source combatant that is not in the fight', () => {
		const { state, env } = activeSession();
		const started = startCombat(state, env).state;
		const result = rejected(
			dispatch(started, env, {
				type: 'combat.place-template',
				actorId: DM_ACTOR.id,
				payload: { ...FIREBALL, sourceCombatantId: 'combatant-nobody' },
			}),
		);
		expect(result.rejection.code).toBe('combatant-not-found');
	});

	it('refuses an off-map origin, a blank label and a rotation past one full turn', () => {
		const { state, env } = activeSession();
		const started = startCombat(state, env).state;
		for (const payload of [
			{ ...FIREBALL, x: 1.4 },
			{ ...FIREBALL, label: '' },
			{ ...FIREBALL, rotation: 360 },
			{ ...FIREBALL, size: 0 },
		]) {
			expect(
				rejected(
					dispatch(started, env, {
						type: 'combat.place-template',
						actorId: DM_ACTOR.id,
						payload,
					}),
				).rejection.code,
			).toBe('invalid-payload');
		}
	});

	it('refuses to remove a template that is not on the board', () => {
		const { state, env } = activeSession();
		const started = startCombat(state, env).state;
		const result = rejected(
			dispatch(started, env, {
				type: 'combat.remove-template',
				actorId: DM_ACTOR.id,
				payload: { templateId: 'template-nobody' },
			}),
		);
		expect(result.rejection.code).toBe('template-not-found');
	});

	it('stops at the board limit instead of accumulating noise', () => {
		const { state, env } = activeSession();
		let current = startCombat(state, env).state;
		for (let index = 0; index < MAX_COMBAT_TEMPLATES; index += 1) {
			current = placeFireball(current, env, { label: `Fireball ${index + 1}` }).state;
		}
		expect(current.session.combat.templates).toHaveLength(MAX_COMBAT_TEMPLATES);
		const result = rejected(
			dispatch(current, env, {
				type: 'combat.place-template',
				actorId: DM_ACTOR.id,
				payload: FIREBALL,
			}),
		);
		expect(result.rejection.code).toBe('template-limit-reached');
	});
});

// ── Ephemeral ────────────────────────────────────────────────────────────────────────────────────

describe('RC-MAP-1.2 templates are ephemeral', () => {
	it('starts a fight with a clear board', () => {
		const { state, env } = activeSession();
		const started = startCombat(state, env).state;
		expect(started.session.combat.templates).toEqual([]);
	});

	it('clears every template when combat ends, and says how many it cleared', () => {
		const { state, env } = activeSession();
		const started = startCombat(state, env).state;
		const placed = placeFireball(placeFireball(started, env).state, env, {
			kind: 'cone',
			label: 'Breath weapon',
			rotation: 90,
			size: 30,
		}).state;
		expect(placed.session.combat.templates).toHaveLength(2);

		const ended = accept(
			dispatch(placed, env, { type: 'combat.end', actorId: DM_ACTOR.id, payload: {} }),
		);
		expect(ended.nextState.session.combat.templates).toEqual([]);
		expect(ended.nextState.session.combat.status).toBe('ended');
		expect(ended.nextState.sync.operations.at(-1)!.value).toMatchObject({ templatesCleared: 2 });
		// The encounter log survives — it is the record of the fight; the shapes were not.
		expect(ended.nextState.session.combat.log.length).toBeGreaterThan(0);
	});
});
