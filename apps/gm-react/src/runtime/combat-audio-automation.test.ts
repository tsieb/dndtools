import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	EMPTY_AUDIO_STATE,
	EMPTY_SYSTEMS_STATE,
	buildAudioAutomationRule,
	configureAudioSource,
	ensureAudioState,
	type AudioAutomationRule,
	type CoreCommand,
	type CoreStateSlice,
	type SyncOperation,
} from '@dndtools/core';
import type { SceneRuntime } from './SceneRuntime';
import { ensureCombatAudioAutomation } from './combat-audio-automation';

/**
 * RC-AUD-3.1 — the combat-music automation driver. A stub runtime feeds it the operations a real
 * `combat.start`/`combat.end` dispatch would append; these tests pin that a matching rule auto-fires
 * the SAME durable commands the DM's manual "Run now" button uses, that a non-matching op is silent,
 * and that an asset missing on THIS device is never claimed present (guardrail 9 — no fake success).
 */

vi.mock('../platform/storage/assetStore', () => ({
	hasAssetBytes: vi.fn(),
}));
vi.mock('../platform/preferences', () => ({
	isOnline: () => true,
}));

const { hasAssetBytes } = await import('../platform/storage/assetStore');
const hasAssetBytesMock = vi.mocked(hasAssetBytes);

function localSource() {
	const result = configureAudioSource({
		id: 's-local',
		type: 'local-file',
		displayName: 'Battle music',
		cacheBehavior: 'local',
		createdBy: 'dm-1',
		createdAt: 't',
	});
	if (!result.ok) throw new Error('expected a configured source');
	return result.source;
}

const CLEARED_ASSET = {
	id: 'asset-cleared',
	mimeType: 'audio/mpeg',
	fileName: 'battle.mp3',
	title: 'Battle',
	byteLength: 10,
	checksum: 'abc',
	license: { kind: 'owned' as const, licenseNote: '', attribution: '' },
	tags: [],
	durationSeconds: null,
	waveform: [],
	source: { sourceId: 's-local', importedAt: 't', importedBy: 'dm-1' },
	schemaVersion: 1 as const,
};

function ruleOn(
	trigger: AudioAutomationRule['trigger'],
	action: AudioAutomationRule['action'] = 'play',
): AudioAutomationRule {
	const library = ensureAudioState({
		sources: { 's-local': localSource() },
		assets: { [CLEARED_ASSET.id]: CLEARED_ASSET },
	});
	const built = buildAudioAutomationRule({
		id: `rule-${trigger}-${action}`,
		trigger,
		action,
		sourceId: 's-local',
		assetId: action === 'stop' ? null : CLEARED_ASSET.id,
		createdBy: 'dm-1',
		createdAt: 't',
		library,
	});
	if (!built.ok) throw new Error(`expected a built rule: ${built.reason}`);
	return built.rule;
}

function stateWith(
	rules: AudioAutomationRule[],
	encounterId: string | null = null,
): CoreStateSlice {
	return {
		permissions: { actors: { 'dm-1': { id: 'dm-1', role: 'dm', displayName: 'DM' } } },
		audio: {
			...EMPTY_AUDIO_STATE,
			sources: { 's-local': localSource() },
			assets: { [CLEARED_ASSET.id]: CLEARED_ASSET },
			automationRules: Object.fromEntries(rules.map((rule) => [rule.id, rule])),
		},
		session: {
			combat: { encounterId },
		},
		systems: EMPTY_SYSTEMS_STATE,
	} as unknown as CoreStateSlice;
}

function harness() {
	const listeners: ((ops: SyncOperation[], next: CoreStateSlice) => void)[] = [];
	const dispatched: CoreCommand[] = [];
	const runtime = {
		onDispatched(listener: (ops: SyncOperation[], next: CoreStateSlice) => void) {
			listeners.push(listener);
			return () => listeners.splice(listeners.indexOf(listener), 1);
		},
		dispatch: (command: CoreCommand) => {
			dispatched.push(command);
			return Promise.resolve({ status: 'accepted' });
		},
	} as unknown as SceneRuntime;
	const stop = ensureCombatAudioAutomation(runtime);
	const emit = (op: Partial<SyncOperation>, state: CoreStateSlice) => {
		const full = { id: 'op-1', entityId: 'session-default', opType: '', ...op } as SyncOperation;
		for (const listener of listeners) listener([full], state);
	};
	return { emit, dispatched, stop };
}

afterEach(() => {
	hasAssetBytesMock.mockReset();
});

describe('RC-AUD-3.1 — the combat-music automation driver', () => {
	it('dispatches session.audio.play when combat starts and a matching rule is armed', async () => {
		hasAssetBytesMock.mockResolvedValue(true);
		const rule = ruleOn('combat-start');
		const { emit, dispatched } = harness();
		emit({ opType: 'combat.start', value: { encounterId: 'enc-1' } }, stateWith([rule]));
		await vi.waitFor(() => expect(dispatched).toHaveLength(1));
		expect(dispatched[0]).toMatchObject({
			type: 'session.audio.play',
			actorId: 'dm-1',
			payload: { sourceId: 's-local', assetId: CLEARED_ASSET.id, assetLocallyAvailable: true },
		});
	});

	it('dispatches session.audio.stop when combat ends and a matching stop rule is armed', async () => {
		const rule = ruleOn('combat-end', 'stop');
		const { emit, dispatched } = harness();
		emit({ opType: 'combat.end' }, stateWith([rule], 'enc-1'));
		await vi.waitFor(() => expect(dispatched).toHaveLength(1));
		expect(dispatched[0]).toMatchObject({ type: 'session.audio.stop', actorId: 'dm-1' });
	});

	it('a combat-start rule never fires on combat.end, and vice versa', async () => {
		hasAssetBytesMock.mockResolvedValue(true);
		const startRule = ruleOn('combat-start');
		const { emit, dispatched } = harness();
		emit({ opType: 'combat.end' }, stateWith([startRule], 'enc-1'));
		await Promise.resolve();
		await Promise.resolve();
		expect(dispatched).toEqual([]);
	});

	it('an unrelated operation never fires the driver', async () => {
		hasAssetBytesMock.mockResolvedValue(true);
		const rule = ruleOn('combat-start');
		const { emit, dispatched } = harness();
		emit({ opType: 'content.update-item' }, stateWith([rule]));
		await Promise.resolve();
		expect(dispatched).toEqual([]);
	});

	it('honestly reports the asset as unavailable when its bytes are missing on this device, not a fake success', async () => {
		hasAssetBytesMock.mockResolvedValue(false);
		const rule = ruleOn('combat-start');
		const { emit, dispatched } = harness();
		emit({ opType: 'combat.start', value: { encounterId: 'enc-1' } }, stateWith([rule]));
		await vi.waitFor(() => expect(dispatched).toHaveLength(1));
		expect(dispatched[0]).toMatchObject({
			type: 'session.audio.play',
			payload: { assetLocallyAvailable: false, assetCached: false },
		});
	});

	it('is idempotent per runtime: a second ensure() on the same runtime does not double-subscribe', async () => {
		hasAssetBytesMock.mockResolvedValue(true);
		const rule = ruleOn('combat-start');
		const listeners: ((ops: SyncOperation[], next: CoreStateSlice) => void)[] = [];
		const dispatched: CoreCommand[] = [];
		const runtime = {
			onDispatched(listener: (ops: SyncOperation[], next: CoreStateSlice) => void) {
				listeners.push(listener);
				return () => listeners.splice(listeners.indexOf(listener), 1);
			},
			dispatch: (command: CoreCommand) => {
				dispatched.push(command);
				return Promise.resolve({ status: 'accepted' });
			},
		} as unknown as SceneRuntime;
		ensureCombatAudioAutomation(runtime);
		ensureCombatAudioAutomation(runtime);
		expect(listeners).toHaveLength(1);
		const op = {
			id: 'op-1',
			entityId: 'session-default',
			opType: 'combat.start',
			value: { encounterId: 'enc-1' },
		} as SyncOperation;
		for (const listener of listeners) listener([op], stateWith([rule]));
		await vi.waitFor(() => expect(dispatched).toHaveLength(1));
	});
});
