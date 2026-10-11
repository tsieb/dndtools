import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	FEATURE_SPOTLIGHTS,
	FEATURE_TIERS,
	SECTION_FEATURE_GATES,
	pendingSpotlights,
	tierMeets,
	type CoreStateSlice,
	type SpotlightContext,
} from '../src';
import {
	buildInitialState,
	DM_ACTOR,
	PLAYER_ACTOR,
	makeEnvironment,
} from '../src/testing/fixtures';

const targets = FEATURE_SPOTLIGHTS.flatMap((s) => (s.target ? [s.target] : []));
const context: SpotlightContext = {
	keyboard: true,
	onboarded: true,
	route: '/session',
	visibleTargets: targets,
};
const due = (state: CoreStateSlice, options: SpotlightContext = context) =>
	pendingSpotlights(state, DM_ACTOR.id, 'vault', {}, options).map((s) => s.id);
function withScreens(count: number) {
	let state = buildInitialState(DM_ACTOR);
	const env = makeEnvironment();
	for (let n = 0; n < count; n++) {
		const result = dispatchCommand(state, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: `Screen ${n}` },
		});
		if (result.status !== 'accepted') throw new Error(result.rejection.message);
		state = result.nextState;
	}
	return state;
}
function withMap() {
	const state = withScreens(2);
	const result = dispatchCommand(state, makeEnvironment(), {
		type: 'map.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Keep' },
	});
	if (result.status !== 'accepted') throw new Error(result.rejection.message);
	const next = result.nextState;
	next.session.activeMap = {
		mapId: Object.keys(next.maps.maps)[0]!,
		regionId: null,
		sceneId: Object.keys(next.scenes.scenes)[0]!,
		widgetInstanceId: 'map-widget',
		updatedBy: DM_ACTOR.id,
		updatedAt: '2026-10-11T00:00:00Z',
		revision: 1,
	};
	return next;
}

describe('RC-UX-6.7 primary path spotlights', () => {
	it('offers the switcher only after a second live non-template screen exists', () => {
		expect(due(withScreens(1))).not.toContain('screen-switcher');
		const state = withScreens(2);
		expect(due(state)).toContain('screen-switcher');
		Object.values(state.scenes.scenes)[1]!.templateMeta.isTemplate = true;
		expect(due(state)).not.toContain('screen-switcher');
	});
	it('offers Standby versus Go live only while Session is open', () => {
		const state = buildInitialState(DM_ACTOR);
		expect(due(state)).toContain('session-standby');
		expect(due(state, { ...context, route: '/' })).not.toContain('session-standby');
	});
	it('offers projection only for a real opened map in Session', () => {
		expect(due(buildInitialState(DM_ACTOR))).not.toContain('project-map');
		const state = withMap();
		expect(due(state)).toContain('project-map');
		expect(due(state, { ...context, route: '/atlas' })).not.toContain('project-map');
		state.maps.maps = {};
		expect(due(state)).not.toContain('project-map');
	});
	it('offers preview only when a player actor exists', () => {
		expect(due(buildInitialState(DM_ACTOR))).not.toContain('preview-player');
		expect(due(buildInitialState(DM_ACTOR, PLAYER_ACTOR))).toContain('preview-player');
	});
	it('offers the vault switcher and demo only after onboarding with the chip visible', () => {
		const state = buildInitialState(DM_ACTOR);
		expect(due(state)).toContain('vault-switcher');
		expect(due(state, { ...context, onboarded: false })).not.toContain('vault-switcher');
		expect(due(state, { ...context, visibleTargets: [] })).not.toContain('vault-switcher');
	});
	it.each(['editing', 'sheetOpen'] as const)('suppresses every spotlight while %s', (key) => {
		expect(due(withMap(), { ...context, [key]: true })).toEqual([]);
	});
	it('never offers a primary target hidden on the current viewport', () => {
		expect(
			pendingSpotlights(
				withMap(),
				DM_ACTOR.id,
				'vault',
				{},
				{ ...context, visibleTargets: [] },
			).every((s) => !s.target),
		).toBe(true);
	});
	it('uses the complexity map for every control and excludes gates hidden at each tier', () => {
		const state = withMap();
		state.permissions.actors[PLAYER_ACTOR.id] = PLAYER_ACTOR;
		for (const spotlight of FEATURE_SPOTLIGHTS.filter((s) => s.target || s.gate)) {
			const gate = SECTION_FEATURE_GATES.find((g) => g.id === spotlight.gate);
			expect(gate, spotlight.id).toBeDefined();
			for (const tier of FEATURE_TIERS) {
				const pending = pendingSpotlights(state, DM_ACTOR.id, 'vault', {}, { ...context, tier }, [
					spotlight,
				]);
				if (!tierMeets(tier, gate!.minTier)) expect(pending).toEqual([]);
				else if (spotlight.target) expect(pending).toEqual([spotlight]);
			}
		}
	});
});
