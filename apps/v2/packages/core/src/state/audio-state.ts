import { cloneAudioAsset, isAudioLicenseKind, type AudioAsset } from './audio-asset';
import type { AudioCacheBehavior, AudioSource } from './audio-source';

/**
 * AUDIO-004 / AUDIO-009 / AUDIO-010 — the durable AUDIO VaultState slice: the local audio ASSET LIBRARY
 * (content-addressed records with license/tags/source) + the declared audio SOURCE registry.
 *
 * This is a bounded state document modeled exactly like the other vault slices (`maps`, `characters`,
 * `encounters`): a record map keyed by id plus a schema version, with a fail-closed `ensure` hydration
 * helper so a vault persisted before this slice existed restores to a safe empty library without a
 * destructive migration. Playback state is NOT here — currently-playing audio is SessionState (Contract 4
 * Widget State Ownership) and is owned by the AUDIO playback epic; this slice owns the durable LIBRARY and
 * SOURCE CONFIG only.
 */

export const AUDIO_STATE_SCHEMA_VERSION = 1 as const;

export interface AudioState {
	/** The content-addressed local audio asset library, keyed by content-hash id (AUDIO-004). */
	assets: Record<string, AudioAsset>;
	/** The declared, configured audio sources, keyed by source id (AUDIO-009 / AUDIO-010). */
	sources: Record<string, AudioSource>;
	schemaVersion: typeof AUDIO_STATE_SCHEMA_VERSION;
}

export const EMPTY_AUDIO_STATE: AudioState = Object.freeze({
	assets: {},
	sources: {},
	schemaVersion: AUDIO_STATE_SCHEMA_VERSION,
});

/** Hydrate a persisted asset fail-closed: re-clone, default its license to `unknown` if absent/invalid. */
function ensureAudioAsset(asset: AudioAsset): AudioAsset {
	const cloned = cloneAudioAsset(asset);
	// Fail closed: a record persisted with no/invalid license kind hydrates to `unknown` so the review
	// gate stays armed (never silently cleared).
	if (!isAudioLicenseKind(cloned.license?.kind)) {
		cloned.license = { kind: 'unknown', licenseNote: '', attribution: '' };
	}
	return cloned;
}

/** The cache behaviors a persisted source may carry; anything else hydrates to `undeclared` (fail closed). */
const VALID_CACHE_BEHAVIORS: ReadonlySet<AudioCacheBehavior> = new Set<AudioCacheBehavior>([
	'local',
	'cache-required',
	'none',
	'undeclared',
]);

/**
 * Hydrate a persisted source fail-closed: re-default the cache behavior to `undeclared` if it is invalid,
 * and FORCE `playbackEnabled` false whenever the cache behavior is undeclared (AUDIO-010 prerequisite —
 * a persisted record can never re-enable playback without a declared cache behavior).
 */
function ensureAudioSource(source: AudioSource): AudioSource {
	const cacheBehavior: AudioCacheBehavior = VALID_CACHE_BEHAVIORS.has(source.cacheBehavior)
		? source.cacheBehavior
		: 'undeclared';
	return {
		...source,
		url: source.url ?? null,
		cacheBehavior,
		playbackEnabled: Boolean(source.playbackEnabled) && cacheBehavior !== 'undeclared',
		licenseNote: source.licenseNote ?? '',
	};
}

/** Tolerantly hydrate a possibly-undefined/partial persisted audio slice (safe, fail-closed defaults). */
export function ensureAudioState(state: AudioState | undefined): AudioState {
	const assets: Record<string, AudioAsset> = {};
	for (const [id, asset] of Object.entries(state?.assets ?? {})) {
		assets[id] = ensureAudioAsset(asset);
	}
	const sources: Record<string, AudioSource> = {};
	for (const [id, source] of Object.entries(state?.sources ?? {})) {
		sources[id] = ensureAudioSource(source as AudioSource);
	}
	return { assets, sources, schemaVersion: AUDIO_STATE_SCHEMA_VERSION };
}

/** Look up an audio asset by id, or undefined. Pure. */
export function audioAssetById(state: AudioState, assetId: string): AudioAsset | undefined {
	return state.assets[assetId];
}

/** Look up a configured audio source by id, or undefined. Pure. */
export function audioSourceById(state: AudioState, sourceId: string): AudioSource | undefined {
	return state.sources[sourceId];
}
