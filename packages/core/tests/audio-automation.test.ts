import { describe, expect, it } from 'vitest';
import {
	buildAudioAutomationRule,
	configureAudioSource,
	dispatchCommand,
	ensureAudioState,
	evaluateAudioAutomationRule,
	listAudioAutomationRulesForActor,
	resolveAudioAutomation,
	resolveAudioAutomationForActor,
	type AudioAutomationRule,
	type AudioAutomationTrigger,
	type AudioSource,
	type AudioState,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * AUDIO-005 — ATMOSPHERE AUTOMATION. The DM configures rules mapping a session event (combat start, map
 * reveal, Scene activation, handout delivery) to a declared audio command. AC1: a configured combat-start
 * trigger requests the declared audio command when combat starts. AC2: a rule whose command fails
 * permission or asset/license/source/offline validation produces NO hidden bypass and records a diagnostic.
 *
 * The tests are the primary fail-closed + DETERMINISM evidence: an automation rule can never bypass the
 * AUDIO-004 license gate, the AUDIO-009 source-scope gate, or the AUDIO-010 offline gate into a silent
 * playback, and identical event sequences produce identical automation outcomes.
 */

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

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

/** A cleared local asset (license owned ⇒ never flagged for review). */
const CLEARED_ASSET = {
	id: 'asset-cleared',
	mimeType: 'audio/mpeg',
	fileName: 'tavern.mp3',
	title: 'Tavern',
	byteLength: 10,
	checksum: 'abc',
	license: { kind: 'owned' as const, licenseNote: '', attribution: '' },
	tags: [],
	source: { sourceId: 's-local', importedAt: 't', importedBy: 'd' },
	schemaVersion: 1 as const,
};

/** An unlicensed local asset (license unknown ⇒ flagged for review — must never auto-play). */
const FLAGGED_ASSET = { ...CLEARED_ASSET, id: 'asset-flagged', license: { kind: 'unknown' as const, licenseNote: '', attribution: '' } };

function localSource(): AudioSource {
	const result = configureAudioSource({
		id: 's-local',
		type: 'local-file',
		displayName: 'Local',
		cacheBehavior: 'local',
		createdBy: 'd',
		createdAt: 't',
	});
	if (!result.ok) throw new Error('expected ok');
	return result.source;
}

function streamSource(): AudioSource {
	const result = configureAudioSource({
		id: 's-stream',
		type: 'web-stream',
		displayName: 'Stream',
		url: 'https://example.com/s',
		cacheBehavior: 'cache-required',
		createdBy: 'd',
		createdAt: 't',
	});
	if (!result.ok) throw new Error('expected ok');
	return result.source;
}

/** A library with both sources + both assets, plus the given rules. */
function library(rules: Record<string, AudioAutomationRule> = {}): AudioState {
	return ensureAudioState({
		assets: { [CLEARED_ASSET.id]: CLEARED_ASSET, [FLAGGED_ASSET.id]: FLAGGED_ASSET },
		sources: { 's-local': localSource(), 's-stream': streamSource() },
		automationRules: rules,
		schemaVersion: 1 as const,
	});
}

function buildRule(input: Partial<Parameters<typeof buildAudioAutomationRule>[0]> = {}): AudioAutomationRule {
	const result = buildAudioAutomationRule({
		id: input.id ?? 'rule-1',
		trigger: input.trigger ?? 'combat-start',
		action: input.action ?? 'play',
		sourceId: input.sourceId ?? 's-local',
		assetId: input.assetId ?? CLEARED_ASSET.id,
		createdBy: 'd',
		createdAt: 't',
		library: input.library ?? library(),
		...input,
	});
	if (!result.ok) throw new Error(`expected ok rule build, got ${result.reason}`);
	return result.rule;
}

const ONLINE_AVAILABLE: Omit<AudioAutomationTrigger, 'kind' | 'scopeId'> = {
	online: true,
	assetLocallyAvailable: true,
	assetCached: false,
	cacheEvicted: false,
};

function trigger(kind: AudioAutomationTrigger['kind'], over: Partial<AudioAutomationTrigger> = {}): AudioAutomationTrigger {
	return { kind, scopeId: null, ...ONLINE_AVAILABLE, ...over };
}

describe('AUDIO-005 — building automation rules (fail closed)', () => {
	it('builds a valid combat-start play rule against a declared source + cleared asset', () => {
		const rule = buildRule({ trigger: 'combat-start', action: 'play' });
		expect(rule).toMatchObject({ trigger: 'combat-start', action: 'play', sourceId: 's-local', assetId: CLEARED_ASSET.id, enabled: true });
	});

	it('rejects an undeclared trigger kind and an undeclared action', () => {
		const lib = library();
		expect(buildAudioAutomationRule({ id: 'r', trigger: 'long-rest', action: 'play', sourceId: 's-local', assetId: CLEARED_ASSET.id, createdBy: 'd', createdAt: 't', library: lib })).toMatchObject({ ok: false, reason: 'unsupported-trigger' });
		expect(buildAudioAutomationRule({ id: 'r', trigger: 'combat-start', action: 'duck', sourceId: 's-local', assetId: CLEARED_ASSET.id, createdBy: 'd', createdAt: 't', library: lib })).toMatchObject({ ok: false, reason: 'unsupported-action' });
	});

	it('rejects a dangling source / asset reference', () => {
		const lib = library();
		expect(buildAudioAutomationRule({ id: 'r', trigger: 'combat-start', action: 'play', sourceId: 'nope', assetId: CLEARED_ASSET.id, createdBy: 'd', createdAt: 't', library: lib })).toMatchObject({ ok: false, reason: 'source-not-found' });
		expect(buildAudioAutomationRule({ id: 'r', trigger: 'combat-start', action: 'play', sourceId: 's-local', assetId: 'nope', createdBy: 'd', createdAt: 't', library: lib })).toMatchObject({ ok: false, reason: 'asset-not-found' });
	});

	it('requires an asset for a local-file play, but not for a web-stream play', () => {
		const lib = library();
		expect(buildAudioAutomationRule({ id: 'r', trigger: 'combat-start', action: 'play', sourceId: 's-local', assetId: null, createdBy: 'd', createdAt: 't', library: lib })).toMatchObject({ ok: false, reason: 'asset-required' });
		const stream = buildAudioAutomationRule({ id: 'r', trigger: 'combat-start', action: 'play', sourceId: 's-stream', assetId: null, createdBy: 'd', createdAt: 't', library: lib });
		expect(stream.ok).toBe(true);
	});
});

describe('AUDIO-005 AC1 — a configured combat-start trigger requests the declared audio command', () => {
	it('evaluates a matching combat-start rule to a requested command', () => {
		const rule = buildRule({ trigger: 'combat-start', action: 'play' });
		const outcome = evaluateAudioAutomationRule(rule, trigger('combat-start'), library({ [rule.id]: rule }));
		expect(outcome).toEqual({
			ruleId: rule.id,
			status: 'requested',
			request: { action: 'play', sourceId: 's-local', assetId: CLEARED_ASSET.id },
		});
	});

	it('resolveAudioAutomation returns the requested command for a fired combat-start trigger', () => {
		const rule = buildRule({ trigger: 'combat-start', action: 'play' });
		const resolution = resolveAudioAutomation(trigger('combat-start'), { [rule.id]: rule }, library({ [rule.id]: rule }));
		expect(resolution.requests).toEqual([{ action: 'play', sourceId: 's-local', assetId: CLEARED_ASSET.id }]);
		expect(resolution.blockedCount).toBe(0);
	});

	it('does NOT fire on a non-matching trigger kind, a disabled rule, or a non-matching scope', () => {
		const lib = library();
		const rule = buildRule({ trigger: 'combat-start', action: 'play', library: lib });
		expect(evaluateAudioAutomationRule(rule, trigger('handout-delivery'), lib)).toBeNull();
		const disabled = buildRule({ trigger: 'combat-start', action: 'play', enabled: false, library: lib });
		expect(evaluateAudioAutomationRule(disabled, trigger('combat-start'), lib)).toBeNull();
		const scoped = buildRule({ trigger: 'scene-activation', action: 'play', triggerScopeId: 'scene-A', library: lib });
		expect(evaluateAudioAutomationRule(scoped, trigger('scene-activation', { scopeId: 'scene-B' }), lib)).toBeNull();
		expect(evaluateAudioAutomationRule(scoped, trigger('scene-activation', { scopeId: 'scene-A' }), lib)?.status).toBe('requested');
	});

	it('fires for handout-delivery, map-reveal, and scene-activation triggers (all declared events)', () => {
		for (const kind of ['handout-delivery', 'map-reveal', 'scene-activation'] as const) {
			const rule = buildRule({ id: `rule-${kind}`, trigger: kind, action: 'play' });
			const outcome = evaluateAudioAutomationRule(rule, trigger(kind), library({ [rule.id]: rule }));
			expect(outcome?.status).toBe('requested');
		}
	});

	it('a stop action requests without needing an asset/license/offline gate', () => {
		const lib = library();
		const rule = buildRule({ trigger: 'combat-start', action: 'stop', assetId: null, library: lib });
		// stop offline + no asset available is still requested (no track is played).
		const outcome = evaluateAudioAutomationRule(rule, trigger('combat-start', { online: false, assetLocallyAvailable: false }), lib);
		expect(outcome).toMatchObject({ status: 'requested', request: { action: 'stop' } });
	});
});

describe('AUDIO-005 AC2 — no hidden bypass; a blocked rule is a flagged no-op with a diagnostic', () => {
	it('an UNLICENSED asset blocks the play (AUDIO-004 license gate is never bypassed)', () => {
		const lib = library();
		const rule = buildRule({ trigger: 'combat-start', action: 'play', assetId: FLAGGED_ASSET.id, library: lib });
		const outcome = evaluateAudioAutomationRule(rule, trigger('combat-start'), lib);
		expect(outcome).toMatchObject({ status: 'blocked', reason: 'license-blocked', licenseReviewReason: 'license-undeclared' });
		// The declared command is NOT requested.
		const resolution = resolveAudioAutomation(trigger('combat-start'), { [rule.id]: rule }, lib);
		expect(resolution.requests).toHaveLength(0);
		expect(resolution.blockedCount).toBe(1);
	});

	it('a source whose playback is DISABLED (AUDIO-010 prerequisite) blocks the play', () => {
		// Build a local source with UNDECLARED cache behavior ⇒ playback disabled.
		const undeclared = configureAudioSource({ id: 's-local', type: 'local-file', displayName: 'Local', createdBy: 'd', createdAt: 't' });
		if (!undeclared.ok) throw new Error('ok');
		const lib = ensureAudioState({ assets: { [CLEARED_ASSET.id]: CLEARED_ASSET }, sources: { 's-local': undeclared.source }, automationRules: {}, schemaVersion: 1 as const });
		const rule = buildRule({ trigger: 'combat-start', action: 'play', library: lib });
		const outcome = evaluateAudioAutomationRule(rule, trigger('combat-start'), lib);
		expect(outcome).toMatchObject({ status: 'blocked', reason: 'playback-disabled' });
	});

	it('a missing local asset on the device blocks the play with a missing diagnostic (no retry/substitution)', () => {
		const lib = library();
		const rule = buildRule({ trigger: 'combat-start', action: 'play', library: lib });
		// A local-file asset whose bytes are not on the device resolves to the specific `asset-missing` reason
		// (AUDIO-010 AC1 — local availability, no network retry, no substitution).
		const outcome = evaluateAudioAutomationRule(rule, trigger('combat-start', { assetLocallyAvailable: false }), lib);
		expect(outcome).toMatchObject({ status: 'blocked', reason: 'asset-missing' });
	});

	it('a web-stream play OFFLINE without a cached asset blocks (AUDIO-010 offline gate is never bypassed)', () => {
		const lib = library();
		const rule = buildRule({ trigger: 'combat-start', action: 'play', sourceId: 's-stream', assetId: null, library: lib });
		const blocked = evaluateAudioAutomationRule(rule, trigger('combat-start', { online: false, assetCached: false }), lib);
		expect(blocked).toMatchObject({ status: 'blocked', reason: 'unavailable' });
		// Cached offline ⇒ allowed.
		const allowed = evaluateAudioAutomationRule(rule, trigger('combat-start', { online: false, assetCached: true }), lib);
		expect(allowed?.status).toBe('requested');
	});

	it('an evicted cache reports unavailable and never substitutes another track (AUDIO-010 AC3)', () => {
		const lib = library();
		const rule = buildRule({ trigger: 'combat-start', action: 'play', sourceId: 's-stream', assetId: null, library: lib });
		const outcome = evaluateAudioAutomationRule(rule, trigger('combat-start', { online: false, assetCached: true, cacheEvicted: true }), lib);
		expect(outcome).toMatchObject({ status: 'blocked', reason: 'unavailable' });
	});

	it('a rule referencing a now-deleted asset blocks (asset removed after the rule was authored)', () => {
		// Author the rule against a full library, then evaluate against a library missing the asset.
		const rule = buildRule({ trigger: 'combat-start', action: 'play' });
		const libWithoutAsset = ensureAudioState({ assets: {}, sources: { 's-local': localSource() }, automationRules: {}, schemaVersion: 1 as const });
		const outcome = evaluateAudioAutomationRule(rule, trigger('combat-start'), libWithoutAsset);
		expect(outcome).toMatchObject({ status: 'blocked', reason: 'asset-missing' });
	});
});

describe('AUDIO-005 — determinism', () => {
	it('identical (trigger, rules, library) inputs produce identical resolutions', () => {
		const r1 = buildRule({ id: 'rule-b', trigger: 'combat-start', action: 'play' });
		const r2 = buildRule({ id: 'rule-a', trigger: 'combat-start', action: 'play', assetId: FLAGGED_ASSET.id });
		const rules = { [r1.id]: r1, [r2.id]: r2 };
		const lib = library(rules);
		const first = resolveAudioAutomation(trigger('combat-start'), rules, lib);
		const second = resolveAudioAutomation(trigger('combat-start'), rules, lib);
		expect(first).toEqual(second);
		// Outcomes are in stable rule-id order (rule-a before rule-b) regardless of insertion order.
		expect(first.outcomes.map((o) => o.ruleId)).toEqual(['rule-a', 'rule-b']);
		expect(first.requests).toHaveLength(1); // only the cleared rule-b requests; rule-a is license-blocked
		expect(first.blockedCount).toBe(1);
	});
});

describe('AUDIO-005 — DM-only command + visibility (no leak of triggers/cues)', () => {
	function configureCommand(payload: Record<string, unknown>, actorId = DM_ACTOR.id): CoreCommand {
		return { type: 'audio.configure-automation', actorId, payload };
	}

	function seedSourceAndAsset(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
		// Configure a local-file source + import a cleared asset through the real commands.
		let next = accept(dispatch(state, env, { type: 'audio.configure-source', actorId: DM_ACTOR.id, payload: { sourceId: 's-local', type: 'local-file', displayName: 'Local', cacheBehavior: 'local' } })).nextState;
		next = accept(dispatch(next, env, {
			type: 'audio.import-asset',
			actorId: DM_ACTOR.id,
			payload: { sourceId: 's-local', bytes: [1, 2, 3, 4], mimeType: 'audio/mpeg', fileName: 'tavern.mp3', license: { kind: 'owned' } },
		})).nextState;
		return next;
	}

	it('AC1: the DM configures a combat-start rule; it lands in the registry and resolves to a request', () => {
		const env = makeEnvironment();
		let state = seedSourceAndAsset(buildInitialState(DM_ACTOR), env);
		const assetId = Object.keys(state.audio.assets)[0]!;
		const result = accept(dispatch(state, env, configureCommand({ trigger: 'combat-start', action: 'play', sourceId: 's-local', assetId })));
		expect(result.events[0]).toMatchObject({ kind: 'audio.automation-configured', trigger: 'combat-start', action: 'play', enabled: true });
		state = result.nextState;

		const rules = listAudioAutomationRulesForActor(state.audio, state.permissions, DM_ACTOR.id);
		expect(rules).toHaveLength(1);

		const resolution = resolveAudioAutomationForActor(state.audio, state.permissions, DM_ACTOR.id, trigger('combat-start'));
		expect(resolution?.requests).toEqual([{ action: 'play', sourceId: 's-local', assetId }]);
	});

	it('rejects a non-DM configuring a rule (fail closed)', () => {
		const env = makeEnvironment();
		const state = seedSourceAndAsset(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const assetId = Object.keys(state.audio.assets)[0]!;
		const result = rejected(dispatch(state, env, configureCommand({ trigger: 'combat-start', action: 'play', sourceId: 's-local', assetId }, PLAYER_ACTOR.id)));
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('a player sees an EMPTY automation rule list and null resolution (no trigger/cue leak)', () => {
		const env = makeEnvironment();
		let state = seedSourceAndAsset(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const assetId = Object.keys(state.audio.assets)[0]!;
		state = accept(dispatch(state, env, configureCommand({ trigger: 'combat-start', action: 'play', sourceId: 's-local', assetId }))).nextState;
		expect(listAudioAutomationRulesForActor(state.audio, state.permissions, PLAYER_ACTOR.id)).toHaveLength(0);
		expect(resolveAudioAutomationForActor(state.audio, state.permissions, PLAYER_ACTOR.id, trigger('combat-start'))).toBeNull();
	});

	it('rejects an undeclared trigger via the command (invalid-payload) and a dangling source (asset-not-found)', () => {
		const env = makeEnvironment();
		const state = seedSourceAndAsset(buildInitialState(DM_ACTOR), env);
		// Undeclared trigger is caught by the schema (closed enum).
		expect(rejected(dispatch(state, env, configureCommand({ trigger: 'long-rest', action: 'play', sourceId: 's-local', assetId: null }))).rejection.code).toBe('invalid-payload');
		// A dangling source reference is caught by the handler.
		expect(rejected(dispatch(state, env, configureCommand({ trigger: 'combat-start', action: 'stop', sourceId: 'nope', assetId: null }))).rejection.code).toBe('audio-asset-not-found');
	});

	it('configuring a rule appends an audit op and creates NO playback state', () => {
		const env = makeEnvironment();
		let state = seedSourceAndAsset(buildInitialState(DM_ACTOR), env);
		const assetId = Object.keys(state.audio.assets)[0]!;
		const before = state.sync.operations.length;
		const result = accept(dispatch(state, env, configureCommand({ trigger: 'combat-start', action: 'play', sourceId: 's-local', assetId })));
		state = result.nextState;
		expect(state.sync.operations.length).toBe(before + 1);
		expect(state.sync.operations.at(-1)).toMatchObject({ entityType: 'audio-automation-rule', opType: 'audio.automation.configure' });
		// No session audio/playback state was created by configuring the rule (it is a dormant definition).
		expect(result.operationIds).toHaveLength(1);
	});

	it('deletes a rule (DM-only); a missing rule id is rejected fail closed', () => {
		const env = makeEnvironment();
		let state = seedSourceAndAsset(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const assetId = Object.keys(state.audio.assets)[0]!;
		state = accept(dispatch(state, env, configureCommand({ trigger: 'combat-start', action: 'play', sourceId: 's-local', assetId }))).nextState;
		const ruleId = listAudioAutomationRulesForActor(state.audio, state.permissions, DM_ACTOR.id)[0]!.id;

		expect(rejected(dispatch(state, env, { type: 'audio.delete-automation', actorId: PLAYER_ACTOR.id, payload: { ruleId } })).rejection.code).toBe('actor-not-authorized');
		const deleted = accept(dispatch(state, env, { type: 'audio.delete-automation', actorId: DM_ACTOR.id, payload: { ruleId } }));
		expect(deleted.events[0]).toMatchObject({ kind: 'audio.automation-deleted', ruleId });
		expect(listAudioAutomationRulesForActor(deleted.nextState.audio, deleted.nextState.permissions, DM_ACTOR.id)).toHaveLength(0);

		expect(rejected(dispatch(deleted.nextState, env, { type: 'audio.delete-automation', actorId: DM_ACTOR.id, payload: { ruleId } })).rejection.code).toBe('audio-automation-not-found');
	});

	it('updates an existing rule (revision continuity preserved)', () => {
		const env = makeEnvironment();
		let state = seedSourceAndAsset(buildInitialState(DM_ACTOR), env);
		const assetId = Object.keys(state.audio.assets)[0]!;
		state = accept(dispatch(state, env, configureCommand({ trigger: 'combat-start', action: 'play', sourceId: 's-local', assetId }))).nextState;
		const rule = listAudioAutomationRulesForActor(state.audio, state.permissions, DM_ACTOR.id)[0]!;
		const updated = accept(dispatch(state, env, configureCommand({ ruleId: rule.id, trigger: 'combat-start', action: 'stop', sourceId: 's-local', assetId: null })));
		const next = listAudioAutomationRulesForActor(updated.nextState.audio, updated.nextState.permissions, DM_ACTOR.id)[0]!;
		expect(next.id).toBe(rule.id);
		expect(next.action).toBe('stop');
		expect(next.revision).toBe(rule.revision + 1);
		expect(next.createdAt).toBe(rule.createdAt);
	});
});

describe('AUDIO-005 — durable hydration (offline/sync continuity)', () => {
	it('round-trips an automation rule through ensureAudioState (persisted slice restores)', () => {
		const rule = buildRule({ trigger: 'combat-start', action: 'play' });
		const hydrated = ensureAudioState({ assets: { [CLEARED_ASSET.id]: CLEARED_ASSET }, sources: { 's-local': localSource() }, automationRules: { [rule.id]: rule }, schemaVersion: 1 as const });
		expect(hydrated.automationRules[rule.id]).toMatchObject({ trigger: 'combat-start', action: 'play' });
	});

	it('hydration DROPS a corrupt rule whose trigger/action is no longer declared (fail closed)', () => {
		const corrupt = { ...buildRule(), trigger: 'long-rest' as unknown as AudioAutomationRule['trigger'] };
		const hydrated = ensureAudioState({ assets: {}, sources: {}, automationRules: { 'bad': corrupt }, schemaVersion: 1 as const });
		expect(hydrated.automationRules['bad']).toBeUndefined();
	});

	it('a vault persisted before AUDIO-005 hydrates to an empty automation rule set (no destructive migration)', () => {
		const legacy = ensureAudioState({ assets: {}, sources: {} });
		expect(legacy.automationRules).toEqual({});
	});
});
