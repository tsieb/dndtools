import { describe, expect, it } from 'vitest';
import {
	DEFAULT_FEATURE_TIER,
	FEATURE_GATES,
	FEATURE_TIERS,
	isFeatureVisible,
	isFreshVault,
	isMaturitySignalReached,
	MATURITY_SIGNALS,
	resolveMaturitySignals,
	resolveOnboarding,
	tierMeets,
	visibleFeatures,
	dispatchCommand,
	FEATURE_SPOTLIGHTS,
	markSpotlightSeen,
	parseSeenSpotlights,
	pendingSpotlights,
	serializeSeenSpotlights,
	spotlightsSeenIn,
	spotlightVaultId,
	type CoreStateSlice,
	type SeenSpotlights,
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

/** Create `count` linked notes so the vault's total `[[wikilink]]` count reaches `count`. */
function withLinkedNotes(
	state: CoreStateSlice,
	env: ReturnType<typeof makeEnvironment>,
	count: number,
): CoreStateSlice {
	let next = state;
	for (let i = 0; i < count; i++) {
		const result = dispatchCommand(next, env, {
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: { kind: 'note', title: `Note ${i}`, body: `See [[Target ${i}]].` },
		});
		expect(result.status).toBe('accepted');
		if (result.status === 'accepted') next = result.nextState;
	}
	return next;
}

describe('RC-UX-3.5 maturity-signal disclosure', () => {
	it('declares the graph signal at a threshold of 3 links', () => {
		const graph = MATURITY_SIGNALS.find((s) => s.id === 'graph');
		expect(graph).toMatchObject({ metric: 'links', threshold: 3, surface: '/graph' });
	});

	it('a fresh vault has not reached the graph signal', () => {
		const state = buildInitialState(DM_ACTOR);
		expect(isMaturitySignalReached('graph', state)).toBe(false);
		const statuses = resolveMaturitySignals(state);
		const graph = statuses.find((s) => s.signal.id === 'graph');
		expect(graph).toMatchObject({ count: 0, reached: false });
	});

	it('reaches the graph signal at exactly 3 links, not before', () => {
		const env = makeEnvironment();
		const state = buildInitialState(DM_ACTOR);

		const twoLinks = withLinkedNotes(state, env, 2);
		expect(isMaturitySignalReached('graph', twoLinks)).toBe(false);

		const threeLinks = withLinkedNotes(twoLinks, env, 1);
		expect(isMaturitySignalReached('graph', threeLinks)).toBe(true);
		const graph = resolveMaturitySignals(threeLinks).find((s) => s.signal.id === 'graph');
		expect(graph).toMatchObject({ count: 3, reached: true });
	});

	it("a soft-deleted note's links no longer count toward the signal", () => {
		const env = makeEnvironment();
		const state = buildInitialState(DM_ACTOR);
		const withNotes = withLinkedNotes(state, env, 3);
		expect(isMaturitySignalReached('graph', withNotes)).toBe(true);

		const [itemId] = Object.keys(withNotes.content.items);
		const removed = dispatchCommand(withNotes, env, {
			type: 'content.remove-item',
			actorId: DM_ACTOR.id,
			payload: { itemId },
		});
		expect(removed.status).toBe('accepted');
		if (removed.status !== 'accepted') return;
		expect(isMaturitySignalReached('graph', removed.nextState)).toBe(false);
	});

	it('resolveOnboarding surfaces the same signal statuses the view reads', () => {
		const env = makeEnvironment();
		const state = withLinkedNotes(buildInitialState(DM_ACTOR), env, 3);
		const view = resolveOnboarding(state, DM_ACTOR.id);
		expect(view.maturitySignals.find((s) => s.signal.id === 'graph')?.reached).toBe(true);
	});

	it('isMaturitySignalReached fails closed for an unknown signal id', () => {
		expect(isMaturitySignalReached('not-a-signal', buildInitialState(DM_ACTOR))).toBe(false);
	});
});

describe('RC-UX-3.2 feature spotlights', () => {
	const VAULT = 'vault-a';
	const pending = (
		state: CoreStateSlice,
		seen: SeenSpotlights = {},
		vaultId = VAULT,
		keyboard = true,
	) => pendingSpotlights(state, DM_ACTOR.id, vaultId, seen, { keyboard }).map((s) => s.id);

	it('declares every spotlight id once', () => {
		const ids = FEATURE_SPOTLIGHTS.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('queues due spotlights in declaration order, an earned surface first', () => {
		const fresh = buildInitialState(DM_ACTOR);
		expect(pending(fresh)).toEqual(['command-palette', 'shortcuts']);
		const linked = withLinkedNotes(fresh, makeEnvironment(), 3);
		expect(pending(linked)).toEqual(['graph', 'command-palette', 'shortcuts']);
	});

	it('never offers a keyboard tip to a touch-only device', () => {
		const fresh = buildInitialState(DM_ACTOR);
		expect(pending(fresh, {}, VAULT, false)).toEqual([]);
		const linked = withLinkedNotes(fresh, makeEnvironment(), 3);
		expect(pending(linked, {}, VAULT, false)).toEqual(['graph']);
	});

	it('a seen spotlight never comes back in that vault, and is still due in another', () => {
		const state = withLinkedNotes(buildInitialState(DM_ACTOR), makeEnvironment(), 3);
		const seen = markSpotlightSeen({}, VAULT, 'graph');
		expect(pending(state, seen)).toEqual(['command-palette', 'shortcuts']);
		expect(pending(state, seen, 'vault-b')).toContain('graph');
		// The same answer after a round trip through the stored device preference.
		const stored = parseSeenSpotlights(serializeSeenSpotlights(seen));
		expect(pending(state, stored)).toEqual(['command-palette', 'shortcuts']);
		const everything = ['graph', 'command-palette', 'shortcuts'].reduce(
			(acc, id) => markSpotlightSeen(acc, VAULT, id),
			stored,
		);
		expect(pending(state, everything)).toEqual([]);
	});

	it('marking is idempotent', () => {
		const once = markSpotlightSeen({}, VAULT, 'graph');
		expect(markSpotlightSeen(once, VAULT, 'graph')).toBe(once);
		expect(spotlightsSeenIn(once, VAULT)).toEqual(['graph']);
		expect(spotlightsSeenIn(once, 'vault-b')).toEqual([]);
	});

	it('preserves seen history beyond 64 vaults after reloading preferences', () => {
		const seen = Object.fromEntries(
			Array.from({ length: 65 }, (_, index) => [`vault-${index}`, ['graph']]),
		);
		const restored = parseSeenSpotlights(serializeSeenSpotlights(seen));
		expect(restored).toEqual(seen);
		const state = withLinkedNotes(buildInitialState(DM_ACTOR), makeEnvironment(), 3);
		expect(pending(state, restored, 'vault-64')).not.toContain('graph');
	});

	it('is DM-only: a player is never shown a spotlight', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		expect(pending(state)).not.toEqual([]);
		expect(pendingSpotlights(state, PLAYER_ACTOR.id, VAULT, {}, { keyboard: true })).toEqual([]);
	});

	it('parses a corrupt or hostile preference without throwing', () => {
		expect(parseSeenSpotlights(null)).toEqual({});
		expect(parseSeenSpotlights('not json')).toEqual({});
		expect(parseSeenSpotlights('["graph"]')).toEqual({});
		expect(parseSeenSpotlights('{"a":"graph","b":[1,"graph","graph",""]}')).toEqual({
			b: ['graph'],
		});
		const hostile = parseSeenSpotlights('{"__proto__":["graph"]}');
		expect(Object.getPrototypeOf(hostile)).toBe(Object.prototype);
		expect(spotlightsSeenIn(hostile, '__proto__')).toEqual(['graph']);
		expect(spotlightsSeenIn(hostile, 'constructor')).toEqual([]);
	});

	it('keys the seen record by the vault id stamped on durable operations', () => {
		const env = makeEnvironment();
		const fresh = buildInitialState(DM_ACTOR);
		expect(spotlightVaultId(fresh, 'fallback')).toBe('fallback');
		expect(spotlightVaultId(withLinkedNotes(fresh, env, 1), 'fallback')).toBe(env.vaultId);
	});
});
