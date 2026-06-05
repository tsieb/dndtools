import { describe, expect, it } from 'vitest';
import {
	assetPortability,
	buildAudioAsset,
	configureAudioSource,
	dispatchCommand,
	ensureAudioState,
	validateAudioPackage,
	type AudioPackagePreset,
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
 * AUDIO-011 — IMPORT/EXPORT Scene audio package references ONLY when required assets, licensing metadata,
 * and unsupported-stream behavior are validated BEFORE commit. Missing assets/license, unsupported streams,
 * and device-local output routes are reported; each included asset carries source + license + content hash
 * + portability status. Tests are the primary fail-closed evidence.
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

function buildLibrary(): { audio: AudioState; licensedAssetId: string; unlicensedAssetId: string } {
	const licensed = buildAudioAsset({
		bytes: Uint8Array.from([1, 2, 3]),
		mimeType: 'audio/mpeg',
		fileName: 'licensed.mp3',
		license: { kind: 'owned' },
		sourceId: 's-local',
		importedBy: 'd',
		importedAt: 't',
	});
	const unlicensed = buildAudioAsset({
		bytes: Uint8Array.from([4, 5, 6]),
		mimeType: 'audio/mpeg',
		fileName: 'unlicensed.mp3',
		sourceId: 's-local',
		importedBy: 'd',
		importedAt: 't',
	});
	if ('error' in licensed || 'error' in unlicensed) throw new Error('built');
	const localSrc = configureAudioSource({ id: 's-local', type: 'local-file', displayName: 'Local', cacheBehavior: 'local', createdBy: 'd', createdAt: 't' });
	const streamSrc = configureAudioSource({ id: 's-stream', type: 'web-stream', displayName: 'Stream', url: 'https://e.com/s', cacheBehavior: 'cache-required', createdBy: 'd', createdAt: 't' });
	if (!localSrc.ok || !streamSrc.ok) throw new Error('src');
	const audio = ensureAudioState({
		assets: { [licensed.id]: licensed, [unlicensed.id]: unlicensed },
		sources: { 's-local': localSrc.source, 's-stream': streamSrc.source },
		schemaVersion: 1 as const,
	});
	return { audio, licensedAssetId: licensed.id, unlicensedAssetId: unlicensed.id };
}

describe('AUDIO-011 — pure package validation', () => {
	it('AC2: each included asset gets source, license metadata, content hash, and portability', () => {
		const { audio, licensedAssetId } = buildLibrary();
		const presets: AudioPackagePreset[] = [
			{ id: 'p1', label: 'Tavern', assetId: licensedAssetId, sourceId: 's-local', outputRouteId: null },
		];
		const report = validateAudioPackage({ direction: 'export', presets, library: audio });
		expect(report.committable).toBe(true);
		expect(report.manifest).toHaveLength(1);
		expect(report.manifest[0]).toMatchObject({
			assetId: licensedAssetId,
			sourceId: 's-local',
			contentHash: licensedAssetId,
			licenseKind: 'owned',
			portability: 'portable',
		});
		expect(report.manifest[0]?.checksum).toBeTruthy();
	});

	it('AC1: a missing asset is reported as a blocking finding and is not committable', () => {
		const { audio } = buildLibrary();
		const presets: AudioPackagePreset[] = [
			{ id: 'p1', label: 'Gone', assetId: 'fnv1a64-deadbeefdeadbeef', sourceId: null, outputRouteId: null },
		];
		const report = validateAudioPackage({ direction: 'import', presets, library: audio });
		expect(report.committable).toBe(false);
		expect(report.findings.some((f) => f.kind === 'missing-asset' && f.severity === 'blocking')).toBe(true);
	});

	it('AC1: a referenced asset with missing licensing metadata is blocking (reuses the AUDIO-004 gate)', () => {
		const { audio, unlicensedAssetId } = buildLibrary();
		const presets: AudioPackagePreset[] = [
			{ id: 'p1', label: 'Unlicensed', assetId: unlicensedAssetId, sourceId: null, outputRouteId: null },
		];
		const report = validateAudioPackage({ direction: 'export', presets, library: audio });
		expect(report.committable).toBe(false);
		expect(report.findings.some((f) => f.kind === 'missing-license' && f.severity === 'blocking')).toBe(true);
		// The asset still appears in the manifest, marked license-blocked.
		expect(report.manifest.find((m) => m.assetId === unlicensedAssetId)?.portability).toBe('license-blocked');
	});

	it('AC1: an unsupported stream reference is a blocking finding', () => {
		const { audio } = buildLibrary();
		const presets: AudioPackagePreset[] = [
			{ id: 'p1', label: 'Bad stream', assetId: null, sourceId: 'unknown-source', outputRouteId: null },
		];
		const report = validateAudioPackage({ direction: 'export', presets, library: audio });
		expect(report.committable).toBe(false);
		expect(report.findings.some((f) => f.kind === 'unsupported-stream')).toBe(true);
	});

	it('AC1: a device-local output route is reported as a non-blocking WARNING (it will not travel)', () => {
		const { audio, licensedAssetId } = buildLibrary();
		const presets: AudioPackagePreset[] = [
			{ id: 'p1', label: 'Routed', assetId: licensedAssetId, sourceId: 's-local', outputRouteId: 'speaker-3' },
		];
		const report = validateAudioPackage({ direction: 'export', presets, library: audio });
		// Warning does not block the commit.
		expect(report.committable).toBe(true);
		const route = report.findings.find((f) => f.kind === 'device-local-output-route');
		expect(route?.severity).toBe('warning');
	});

	it('assetPortability resolves missing / license-blocked / portable', () => {
		const { audio, licensedAssetId, unlicensedAssetId } = buildLibrary();
		expect(assetPortability(audio, licensedAssetId)).toBe('portable');
		expect(assetPortability(audio, unlicensedAssetId)).toBe('license-blocked');
		expect(assetPortability(audio, 'nope')).toBe('missing');
	});

	it('findings are non-leaking: they describe the preset + reason, never raw bytes', () => {
		const { audio, unlicensedAssetId } = buildLibrary();
		const report = validateAudioPackage({
			direction: 'export',
			presets: [{ id: 'p1', label: 'X', assetId: unlicensedAssetId, sourceId: null, outputRouteId: null }],
			library: audio,
		});
		const serialized = JSON.stringify(report.findings);
		expect(serialized).not.toContain('bytes');
	});
});

describe('AUDIO-011 — validate-package command', () => {
	function stateWithLibrary(): CoreStateSlice {
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const { audio } = buildLibrary();
		return { ...base, audio };
	}

	it('a committable package is accepted with NO durable mutation; the report rides the event', () => {
		const state = stateWithLibrary();
		const env = makeEnvironment();
		const { licensedAssetId } = buildLibrary();
		const before = JSON.stringify(state.audio);
		const result = accept(
			dispatch(state, env, {
				type: 'audio.validate-package',
				actorId: DM_ACTOR.id,
				payload: {
					direction: 'export',
					presets: [{ id: 'p1', label: 'Tavern', assetId: licensedAssetId, sourceId: 's-local', outputRouteId: null }],
				},
			}),
		);
		expect(result.operationIds).toHaveLength(0);
		expect(JSON.stringify(result.nextState.audio)).toBe(before);
		const event = result.events[0];
		expect(event).toMatchObject({ kind: 'audio.package-validated', committable: true, blockingCount: 0 });
	});

	it('AC1: a package with blocking issues is REJECTED before commit; the findings ride the rejection', () => {
		const state = stateWithLibrary();
		const env = makeEnvironment();
		const { unlicensedAssetId } = buildLibrary();
		const result = rejected(
			dispatch(state, env, {
				type: 'audio.validate-package',
				actorId: DM_ACTOR.id,
				payload: {
					direction: 'import',
					presets: [
						{ id: 'p1', label: 'Missing', assetId: 'fnv1a64-0000000000000000', sourceId: null, outputRouteId: null },
						{ id: 'p2', label: 'Unlicensed', assetId: unlicensedAssetId, sourceId: null, outputRouteId: null },
					],
				},
			}),
		);
		expect(result.rejection.code).toBe('audio-package-invalid');
		expect(result.rejection.issues?.length).toBeGreaterThanOrEqual(2);
	});

	it('rejects a non-DM validating a package fail-closed', () => {
		const state = stateWithLibrary();
		const env = makeEnvironment();
		const result = rejected(
			dispatch(state, env, {
				type: 'audio.validate-package',
				actorId: PLAYER_ACTOR.id,
				payload: { direction: 'export', presets: [] },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});
});
