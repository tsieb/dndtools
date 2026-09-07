import { describe, expect, it, vi } from 'vitest';
import {
	EMPTY_AUDIO_STATE,
	EMPTY_SYSTEMS_STATE,
	buildAudioAutomationRule,
	configureAudioSource,
	ensureAudioState,
	type AudioAutomationRule,
	type CoreStateSlice,
	type SyncOperation,
} from '@dndtools/core';
import type { SceneRuntime } from './SceneRuntime';
import type { AudioPlaybackHandle } from './audio-playback';
import { ensureSfxEvents } from './sfx-events';

/**
 * RC-AUD-3.2 — the SFX event driver. A stub runtime feeds it the operations a real dispatch would
 * append and a stub playback handle records every one-shot, so these tests pin the policy itself:
 * which table moments make a sound, which are silent, and what the DM is told when nothing plays.
 */

const STREAM_URL = 'https://example.com/nat20.mp3';

function streamSource() {
	const result = configureAudioSource({
		id: 's-stream',
		type: 'web-stream',
		displayName: 'Cues',
		url: STREAM_URL,
		cacheBehavior: 'cache-required',
		createdBy: 'dm-1',
		createdAt: 't',
	});
	if (!result.ok) throw new Error('expected a configured source');
	return result.source;
}

function ruleOn(trigger: AudioAutomationRule['trigger']): AudioAutomationRule {
	const library = ensureAudioState({ sources: { 's-stream': streamSource() } });
	const built = buildAudioAutomationRule({
		id: `rule-${trigger}`,
		trigger,
		action: 'play',
		sourceId: 's-stream',
		assetId: null,
		createdBy: 'dm-1',
		createdAt: 't',
		library,
	});
	if (!built.ok) throw new Error(`expected a built rule: ${built.reason}`);
	return built.rule;
}

/** A minimal core state: one DM, one declared stream source, and the given rules + toggles. */
function stateWith(
	rules: AudioAutomationRule[],
	sfxEvents: Record<string, boolean> = {},
	diceTerms: unknown = null,
): CoreStateSlice {
	return {
		permissions: { actors: { 'dm-1': { id: 'dm-1', role: 'dm', displayName: 'DM' } } },
		audio: {
			...EMPTY_AUDIO_STATE,
			sources: { 's-stream': streamSource() },
			automationRules: Object.fromEntries(rules.map((rule) => [rule.id, rule])),
			sfxEvents,
		},
		session: {
			diceHistory: diceTerms
				? [
						{
							id: 'roll-1',
							actorId: 'dm-1',
							expression: '1d20',
							total: 20,
							rolledAt: 't',
							terms: diceTerms,
						},
					]
				: [],
		},
		systems: EMPTY_SYSTEMS_STATE,
	} as unknown as CoreStateSlice;
}

/** The evaluated terms of a bare `1d20` that landed on `face`. */
function d20Terms(face: number) {
	return [
		{
			kind: 'dice',
			count: 1,
			sides: 20,
			keep: null,
			sign: 1,
			dice: [{ value: face, kept: true }],
			kept: [face],
			subtotal: face,
		},
	];
}

function harness() {
	const listeners: ((ops: SyncOperation[], next: CoreStateSlice) => void)[] = [];
	const dispatched: unknown[] = [];
	const runtime = {
		onDispatched(listener: (ops: SyncOperation[], next: CoreStateSlice) => void) {
			listeners.push(listener);
			return () => listeners.splice(listeners.indexOf(listener), 1);
		},
		dispatch: (command: unknown) => {
			dispatched.push(command);
			return Promise.resolve({ status: 'accepted' });
		},
	} as unknown as SceneRuntime;
	const played: string[] = [];
	const playback = {
		subscribe: () => () => {},
		getSnapshot: () => ({}),
		playSfx: (url: string) => played.push(url),
		setMasterVolume: () => {},
	} as unknown as AudioPlaybackHandle;
	const driver = ensureSfxEvents(runtime, playback);
	const emit = (op: Partial<SyncOperation>, state: CoreStateSlice) => {
		const full = { id: 'op-1', entityId: 'e-1', opType: '', ...op } as SyncOperation;
		for (const listener of listeners) listener([full], state);
	};
	return { driver, emit, played, dispatched };
}

describe('RC-AUD-3.2 — the SFX event driver', () => {
	it('plays the armed cue when a recorded roll comes up a natural 20', async () => {
		const rule = ruleOn('roll-critical-success');
		const { driver, emit, played } = harness();
		emit({ opType: 'session.roll-dice' }, stateWith([rule], {}, d20Terms(20)));
		await vi.waitFor(() => expect(played).toEqual([STREAM_URL]));
		expect(driver.getSnapshot().recent[0]).toMatchObject({
			event: 'roll-critical-success',
			status: 'played',
		});
	});

	it('an ordinary roll makes no sound at all', async () => {
		const rule = ruleOn('roll-critical-success');
		const { driver, emit, played } = harness();
		emit({ opType: 'session.roll-dice' }, stateWith([rule], {}, d20Terms(11)));
		await Promise.resolve();
		expect(played).toEqual([]);
		expect(driver.getSnapshot().recent).toEqual([]);
	});

	it('a natural 1 fires the failure cue, not the success cue', async () => {
		const success = ruleOn('roll-critical-success');
		const failure = ruleOn('roll-critical-failure');
		const { driver, emit, played } = harness();
		emit({ opType: 'session.roll-dice' }, stateWith([success, failure], {}, d20Terms(1)));
		await vi.waitFor(() => expect(played).toHaveLength(1));
		expect(driver.getSnapshot().recent[0]).toMatchObject({
			event: 'roll-critical-failure',
			status: 'played',
		});
	});

	it('a switched-off event stays silent and says so, leaving the rule armed', async () => {
		const rule = ruleOn('roll-critical-success');
		const { driver, emit, played } = harness();
		emit(
			{ opType: 'session.roll-dice' },
			stateWith([rule], { 'roll-critical-success': false }, d20Terms(20)),
		);
		await Promise.resolve();
		expect(played).toEqual([]);
		expect(driver.getSnapshot().recent[0]).toMatchObject({
			event: 'roll-critical-success',
			status: 'muted',
		});
	});

	it('reports an event with no rule instead of pretending something played', async () => {
		const { driver, emit, played } = harness();
		emit({ opType: 'session.roll-dice' }, stateWith([], {}, d20Terms(20)));
		await Promise.resolve();
		expect(played).toEqual([]);
		expect(driver.getSnapshot().recent[0]).toMatchObject({ status: 'no-rule' });
	});

	it('reads a death save off the recorded ledger delta, either way', async () => {
		const made = ruleOn('death-save-success');
		const failed = ruleOn('death-save-failure');
		const { driver, emit, played } = harness();
		const state = stateWith([made, failed]);
		emit({ opType: 'combat.resource.death-save', value: { delta: 1 } }, state);
		await vi.waitFor(() => expect(played).toHaveLength(1));
		expect(driver.getSnapshot().recent[0]).toMatchObject({ event: 'death-save-success' });
		emit({ opType: 'combat.resource.death-save', value: { delta: -1 } }, state);
		await vi.waitFor(() => expect(played).toHaveLength(2));
		expect(driver.getSnapshot().recent[0]).toMatchObject({ event: 'death-save-failure' });
		// A death-save RESET is not a table moment; it carries no delta and makes no sound.
		emit({ opType: 'combat.resource.death-save', value: {} }, state);
		await Promise.resolve();
		expect(played).toHaveLength(2);
	});

	it('a revealed map area sounds; hiding one behind fog does not', async () => {
		const rule = ruleOn('map-reveal');
		const { emit, played } = harness();
		const state = stateWith([rule]);
		emit({ opType: 'map.fog.append' }, state);
		await Promise.resolve();
		expect(played).toEqual([]);
		emit({ opType: 'map.fog.remove' }, state);
		await vi.waitFor(() => expect(played).toEqual([STREAM_URL]));
	});

	it('a delivered handout sounds its cue', async () => {
		const rule = ruleOn('handout-delivery');
		const { emit, played } = harness();
		emit({ opType: 'session.deliver-handout' }, stateWith([rule]));
		await vi.waitFor(() => expect(played).toEqual([STREAM_URL]));
	});

	it('an unrelated operation never makes a noise', async () => {
		const rule = ruleOn('roll-critical-success');
		const { driver, emit, played } = harness();
		emit({ opType: 'content.update-item' }, stateWith([rule], {}, d20Terms(20)));
		await Promise.resolve();
		expect(played).toEqual([]);
		expect(driver.getSnapshot().recent).toEqual([]);
	});
});
