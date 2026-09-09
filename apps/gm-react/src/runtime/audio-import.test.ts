import { describe, expect, it } from 'vitest';
import {
	EMPTY_AUDIO_STATE,
	type AudioAsset,
	type AudioState,
	type CommandResult,
	type CoreCommand,
} from '@dndtools/core';
import {
	analyzeAudioBytes,
	audioTitleFromFileName,
	importAudioFile,
	type AudioAnalysisContext,
	type AudioImportRuntime,
} from './audio-import';

/**
 * RC-AUD-1.2 — the import flow's asset-metadata extension: a decoded duration + waveform thumbnail is
 * measured client-side (Web Audio has no core equivalent) and attached as a follow-up
 * `audio.update-asset-metadata` dispatch. Best-effort: a platform with no decoder never fails the import.
 */

function bytesOf(length: number): Uint8Array {
	return Uint8Array.from({ length }, (_, i) => (i * 7) % 251);
}

/** A minimal fake SceneRuntime: applies the two commands `importAudioFile` dispatches, nothing else. */
function fakeRuntime(): { runtime: AudioImportRuntime; dispatched: CoreCommand[] } {
	let audio: AudioState = EMPTY_AUDIO_STATE;
	const dispatched: CoreCommand[] = [];
	const runtime: AudioImportRuntime = {
		get state() {
			return { audio };
		},
		async dispatch(command: CoreCommand): Promise<CommandResult> {
			dispatched.push(command);
			if (command.type === 'audio.configure-source') {
				return {
					status: 'accepted',
					nextState: {} as never,
					events: [{ kind: 'audio.source-configured', sourceId: 'src-1' } as never],
					operationIds: [],
				};
			}
			if (command.type === 'audio.import-asset') {
				const payload = command.payload as {
					sourceId: string;
					bytes: number[];
					mimeType: string;
					fileName: string;
					title?: string;
				};
				const assetId = `asset-${payload.bytes.length}`;
				const asset: AudioAsset = {
					id: assetId,
					mimeType: payload.mimeType,
					fileName: payload.fileName,
					title: payload.title ?? payload.fileName,
					byteLength: payload.bytes.length,
					checksum: 'chk',
					license: { kind: 'unknown', licenseNote: '', attribution: '' },
					tags: [],
					durationSeconds: null,
					waveform: [],
					source: { sourceId: payload.sourceId, importedAt: 't', importedBy: 'dm-1' },
					schemaVersion: 1,
				};
				audio = { ...audio, assets: { ...audio.assets, [assetId]: asset } };
				return {
					status: 'accepted',
					nextState: {} as never,
					events: [
						{
							kind: 'audio.asset-imported',
							assetId,
							deduped: false,
							needsLicenseReview: true,
						} as never,
					],
					operationIds: [],
				};
			}
			if (command.type === 'audio.update-asset-metadata') {
				const payload = command.payload as {
					assetId: string;
					durationSeconds?: number;
					waveform?: number[];
				};
				const previous = audio.assets[payload.assetId];
				if (!previous) throw new Error('unknown asset in fake runtime');
				const updated: AudioAsset = {
					...previous,
					durationSeconds: payload.durationSeconds ?? previous.durationSeconds,
					waveform: payload.waveform ?? previous.waveform,
				};
				audio = { ...audio, assets: { ...audio.assets, [payload.assetId]: updated } };
				return {
					status: 'accepted',
					nextState: {} as never,
					events: [{ kind: 'audio.asset-metadata-updated', assetId: payload.assetId } as never],
					operationIds: [],
				};
			}
			throw new Error(`fakeRuntime does not model ${command.type}`);
		},
	};
	return { runtime, dispatched };
}

describe('RC-AUD-1.2 — audioTitleFromFileName', () => {
	it('strips a short extension and keeps the rest verbatim', () => {
		expect(audioTitleFromFileName('tavern-ambience.mp3')).toBe('tavern-ambience');
		expect(audioTitleFromFileName('no-extension')).toBe('no-extension');
	});
});

describe('RC-AUD-1.2 — analyzeAudioBytes', () => {
	it('returns null when no decode context is available on this platform (fail-soft, not fail-closed)', async () => {
		const result = await analyzeAudioBytes(bytesOf(16), () => null);
		expect(result).toBeNull();
	});

	it('returns null when decoding throws (a corrupt/unsupported file never crashes the import)', async () => {
		const context: AudioAnalysisContext = {
			decodeAudioData: () => Promise.reject(new Error('bad data')),
			close: () => Promise.resolve(),
		};
		const result = await analyzeAudioBytes(bytesOf(16), () => context);
		expect(result).toBeNull();
	});

	it('measures a duration and a capped, clamped waveform thumbnail from a mocked decode', async () => {
		const channel = Float32Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? 1.5 : -0.25));
		const context: AudioAnalysisContext = {
			decodeAudioData: () =>
				Promise.resolve({
					duration: 12.5,
					numberOfChannels: 1,
					getChannelData: () => channel,
				}),
			close: () => Promise.resolve(),
		};
		const result = await analyzeAudioBytes(bytesOf(10), () => context);
		expect(result).not.toBeNull();
		expect(result?.durationSeconds).toBe(12.5);
		expect(result?.waveform).toHaveLength(10);
		// A sample of 1.5 clamps to the [0,1] amplitude ceiling.
		expect(Math.max(...(result?.waveform ?? []))).toBe(1);
	});
});

describe('RC-AUD-1.2 — importAudioFile attaches measured metadata', () => {
	it('dispatches update-asset-metadata with the measured duration/waveform after a successful import', async () => {
		const { runtime, dispatched } = fakeRuntime();
		const bytes = bytesOf(32);
		const outcome = await importAudioFile(
			runtime,
			'dm-1',
			{ name: 'tavern.mp3', mime: 'audio/mpeg', bytes },
			() => Promise.resolve({ durationSeconds: 183.4, waveform: [0.1, 0.9] }),
		);
		expect(outcome.ok).toBe(true);
		const update = dispatched.find((c) => c.type === 'audio.update-asset-metadata');
		expect(update).toBeDefined();
		expect(update?.payload).toMatchObject({ durationSeconds: 183.4, waveform: [0.1, 0.9] });
		if (outcome.ok) {
			expect(runtime.state.audio.assets[outcome.assetId]?.durationSeconds).toBe(183.4);
		}
	});

	it('still succeeds when analysis measures nothing (no decoder) — no metadata dispatch is sent', async () => {
		const { runtime, dispatched } = fakeRuntime();
		const bytes = bytesOf(32);
		const outcome = await importAudioFile(
			runtime,
			'dm-1',
			{ name: 'tavern.mp3', mime: 'audio/mpeg', bytes },
			() => Promise.resolve(null),
		);
		expect(outcome.ok).toBe(true);
		expect(dispatched.some((c) => c.type === 'audio.update-asset-metadata')).toBe(false);
	});
});
