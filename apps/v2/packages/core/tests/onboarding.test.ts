import { describe, expect, it } from 'vitest';
import {
	DEFAULT_FEATURE_TIER,
	FEATURE_GATES,
	FEATURE_TIERS,
	isFeatureVisible,
	isFreshVault,
	resolveOnboarding,
	tierMeets,
	visibleFeatures,
	dispatchCommand,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

describe('PLAT-013 feature-tier visibility (AC2)', () => {
	it('core tier shows only core capabilities and hides intermediate/advanced', () => {
		const core = visibleFeatures('core').map((f) => f.id);
		expect(core).toContain('command-center');
		expect(core).toContain('scenes');
		expect(core).not.toContain('widget-library'); // intermediate
		expect(core).not.toContain('diagnostics'); // advanced
	});

	it('intermediate tier reveals intermediate but still hides advanced', () => {
		const inter = visibleFeatures('intermediate').map((f) => f.id);
		expect(inter).toContain('command-center'); // inherited core
		expect(inter).toContain('widget-library'); // intermediate
		expect(inter).toContain('player-views'); // intermediate
		expect(inter).not.toContain('diagnostics'); // advanced
		expect(inter).not.toContain('permissions'); // advanced
	});

	it('advanced tier reveals every capability', () => {
		const advanced = visibleFeatures('advanced').map((f) => f.id);
		for (const gate of FEATURE_GATES) {
			expect(advanced).toContain(gate.id);
		}
	});

	it('each tier strictly contains the previous tier (monotonic disclosure)', () => {
		const core = new Set(visibleFeatures('core').map((f) => f.id));
		const inter = new Set(visibleFeatures('intermediate').map((f) => f.id));
		const advanced = new Set(visibleFeatures('advanced').map((f) => f.id));
		for (const id of core) expect(inter.has(id)).toBe(true);
		for (const id of inter) expect(advanced.has(id)).toBe(true);
		expect(inter.size).toBeGreaterThan(core.size);
		expect(advanced.size).toBeGreaterThan(inter.size);
	});

	it('isFeatureVisible fails closed for an unknown feature', () => {
		expect(isFeatureVisible('not-a-feature', 'advanced')).toBe(false);
	});

	it('tierMeets compares maturity ranks correctly', () => {
		expect(tierMeets('core', 'core')).toBe(true);
		expect(tierMeets('core', 'intermediate')).toBe(false);
		expect(tierMeets('advanced', 'core')).toBe(true);
		expect(FEATURE_TIERS).toEqual(['core', 'intermediate', 'advanced']);
	});
});

describe('PLAT-013 fresh-vault onboarding (AC1)', () => {
	it('a fresh-vault fixture is detected as fresh', () => {
		const state = buildInitialState(DM_ACTOR);
		expect(isFreshVault(state)).toBe(true);
	});

	it('first-run onboarding defaults: core tier, first-run status, setup steps undone', () => {
		const state = buildInitialState(DM_ACTOR);
		const view = resolveOnboarding(state, DM_ACTOR.id);
		expect(view.status).toBe('first-run');
		expect(view.tier).toBe(DEFAULT_FEATURE_TIER);
		expect(view.tier).toBe('core');
		expect(view.isFresh).toBe(true);
		expect(view.steps.find((s) => s.id === 'command-center')?.done).toBe(false);
		expect(view.steps.find((s) => s.id === 'first-scene')?.done).toBe(false);
		// Core navigation + Command Center are the default-visible features (AC1).
		expect(view.visibleFeatures.map((f) => f.id)).toContain('command-center');
		expect(view.visibleFeatures.map((f) => f.id)).toContain('navigation');
		expect(view.helpSurfaces.length).toBeGreaterThan(0);
	});

	it('onboarding setup is DM-only: a player view cannot trigger setup', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		expect(resolveOnboarding(state, DM_ACTOR.id).canSetup).toBe(true);
		expect(resolveOnboarding(state, PLAYER_ACTOR.id).canSetup).toBe(false);
	});

	it('completing first-run Command Center setup transitions out of first-run (real command)', () => {
		const env = makeEnvironment();
		const state = buildInitialState(DM_ACTOR);
		expect(resolveOnboarding(state, DM_ACTOR.id).status).toBe('first-run');

		// Dispatch the REAL first-run command the GUI uses, then re-derive onboarding.
		const result = dispatchCommand(state, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;

		const after = result.nextState;
		expect(isFreshVault(after)).toBe(false);
		const view = resolveOnboarding(after, DM_ACTOR.id);
		expect(view.isFresh).toBe(false);
		expect(view.steps.find((s) => s.id === 'command-center')?.done).toBe(true);
		// Command Center exists but no Scene has been authored yet → in-progress, not complete.
		expect(view.status).toBe('in-progress');
	});
});
