import type { AudioState, SessionAudioState } from '@dndtools/core';

/**
 * audio-plan — the PURE planning layer for the device-output audio driver (`audio-playback.ts`).
 *
 * Given only core state (the audio library + the session-owned playback slice), it computes WHAT the
 * driver should be outputting: the primary track's byte/stream resolution and one plan per ambience
 * layer. The driver owns the impure half (HTMLAudioElement pool, object URLs, autoplay gestures,
 * `setSinkId`); everything here is deterministic and DOM-free so the reconciliation policy is unit-
 * testable under Node (`pnpm test:app`).
 *
 * Resolution policy (honest, fail closed — never pretend):
 *   - A source with a stream URL (web-stream) plays the URL directly; the stream IS the track.
 *   - Otherwise a plan names the content-addressed ASSET whose bytes the driver looks up in the
 *     device's asset-byte store (`platform/storage/assetStore`). The primary track carries its asset
 *     id explicitly; an ambience layer references only a SOURCE, so its asset resolves ONLY when the
 *     source has exactly one imported file (anything else is ambiguous and stays honestly silent).
 *   - When neither resolves, the plan carries a human-readable `silentReason` — the driver reports it
 *     verbatim instead of guessing, retrying, or substituting a track.
 */

/** How a plan's audio bytes resolve on this device. The driver uses `url` when set, else `assetId`. */
export interface AudioByteResolution {
	/** A directly streamable URL (web-stream source). Preferred when present — the stream IS the track. */
	url: string | null;
	/** The content-addressed asset whose bytes the driver resolves from the local asset-byte store. */
	assetId: string | null;
	/** The honest reason nothing can sound when BOTH `url` and `assetId` are null; null otherwise. */
	silentReason: string | null;
}

/** The primary session track's output plan. `active === false` ⇒ stopped/idle (silence everything). */
export interface AudioTrackPlan {
	active: boolean;
	paused: boolean;
	/** The authoritative session volume (0..1, clamped). */
	volume: number;
	resolution: AudioByteResolution;
}

/** One ambience layer's output plan (a looped secondary bed, reconciled by `layerId`). */
export interface AmbienceLayerPlan {
	layerId: string;
	sourceId: string;
	/** The layer's authoritative session volume (0..1, clamped). */
	volume: number;
	muted: boolean;
	resolution: AudioByteResolution;
}

function clampVolume(value: number): number {
	if (!Number.isFinite(value)) return 1;
	return Math.min(1, Math.max(0, value));
}

const silent = (silentReason: string): AudioByteResolution => ({ url: null, assetId: null, silentReason });

/**
 * Resolve how a (source, optional explicit asset) pair can produce audio bytes on this device.
 * Pure; fail closed with an honest reason — never invents an asset when the choice is ambiguous.
 */
export function resolveAudioBytes(
	audio: AudioState,
	sourceId: string,
	explicitAssetId: string | null = null,
): AudioByteResolution {
	const source = audio.sources[sourceId];
	if (!source) {
		return silent('The source is no longer configured — nothing to output.');
	}
	const url = source.type === 'web-stream' && typeof source.url === 'string' && source.url.length > 0 ? source.url : null;
	if (url) return { url, assetId: null, silentReason: null };
	if (explicitAssetId !== null) {
		if (!audio.assets[explicitAssetId]) {
			return silent('The referenced audio asset is no longer in the library — nothing to output.');
		}
		return { url: null, assetId: explicitAssetId, silentReason: null };
	}
	// No URL and no explicit asset: a local/bundled source can still resolve when it owns exactly ONE
	// imported file. Zero files ⇒ nothing to play; several ⇒ ambiguous (never guess a track).
	const owned = Object.values(audio.assets)
		.filter((asset) => asset.source.sourceId === sourceId)
		.sort((a, b) => a.id.localeCompare(b.id));
	if (owned.length === 1) return { url: null, assetId: owned[0].id, silentReason: null };
	if (owned.length === 0) {
		return silent('This source has no stream URL and no imported audio file — nothing to output.');
	}
	return silent(
		`This source has ${owned.length} imported files and no stream URL — it does not name a single track to loop.`,
	);
}

/** Plan the primary session track's device output from the session-owned playback state. Pure. */
export function planSessionTrack(session: SessionAudioState, audio: AudioState): AudioTrackPlan {
	const track = session.track;
	if (!track || track.status === 'stopped') {
		return { active: false, paused: false, volume: 1, resolution: silent('No session audio is playing.') };
	}
	return {
		active: true,
		paused: track.status === 'paused',
		volume: clampVolume(track.volume),
		resolution: resolveAudioBytes(audio, track.sourceId, track.assetId),
	};
}

/** Plan every ambience layer's device output, in stable layer-id order. Pure. */
export function planAmbienceLayers(session: SessionAudioState, audio: AudioState): AmbienceLayerPlan[] {
	return Object.entries(session.ambienceLayers ?? {})
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([layerId, layer]) => ({
			layerId,
			sourceId: layer.sourceId,
			volume: clampVolume(layer.volume),
			muted: layer.muted === true,
			resolution: resolveAudioBytes(audio, layer.sourceId),
		}));
}

/** The pool reconciliation diff: which per-layer elements to create, keep, and tear down. Pure. */
export interface AmbiencePoolDiff {
	added: string[];
	kept: string[];
	removed: string[];
}

/** Diff the driver's existing per-layer element pool against the planned layers, by layerId. Pure. */
export function diffAmbiencePool(existingLayerIds: Iterable<string>, plans: readonly AmbienceLayerPlan[]): AmbiencePoolDiff {
	const planned = new Set(plans.map((p) => p.layerId));
	const existing = new Set(existingLayerIds);
	const added: string[] = [];
	const kept: string[] = [];
	const removed: string[] = [];
	for (const id of planned) (existing.has(id) ? kept : added).push(id);
	for (const id of existing) if (!planned.has(id)) removed.push(id);
	added.sort((a, b) => a.localeCompare(b));
	kept.sort((a, b) => a.localeCompare(b));
	removed.sort((a, b) => a.localeCompare(b));
	return { added, kept, removed };
}

/**
 * The asset ids the CURRENT plans actually use for byte playback — the driver revokes any cached
 * object URL for an asset outside this set (a stale track/layer's blob URL is released promptly).
 */
export function assetIdsInUse(track: AudioTrackPlan, layers: readonly AmbienceLayerPlan[]): Set<string> {
	const ids = new Set<string>();
	if (track.active && track.resolution.assetId) ids.add(track.resolution.assetId);
	for (const layer of layers) if (layer.resolution.assetId) ids.add(layer.resolution.assetId);
	return ids;
}
