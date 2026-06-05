/**
 * AUDIO-009 + AUDIO-010 — the DECLARED AUDIO SOURCE TYPE registry + per-source CACHE / OFFLINE behavior.
 *
 * This composes the existing source-capability-registry pattern (`sync/source-adapter-registry.ts`, the
 * MAP-020 adapter registry, the platform support-status artifact): a FROZEN table of declared source-type
 * descriptors, with resolution that FAILS CLOSED to `unsupported` for an unknown provider. The crux this
 * surface proves:
 *
 *   - AUDIO-009: only DECLARED source types (local file, bundled preset, web stream) can be configured.
 *     An UNDECLARED / unsupported provider is REJECTED with an unsupported-source diagnostic and NO
 *     playback state is created (fail closed). Each declared source records its licensing posture + cache
 *     behavior so a release review can classify every configured source.
 *
 *   - AUDIO-010: cache + offline behavior is DECLARED PER SOURCE TYPE and is a PREREQUISITE for enabling
 *     playback. A source whose offline behavior is undeclared cannot have playback enabled. Offline
 *     playability is resolved fail-closed: a local-file source uses local availability (no network retry);
 *     a web-stream source is unavailable offline UNLESS an explicitly cached asset exists; an evicted
 *     cache reports missing cached audio (never substitutes another track).
 *
 * Pure data + pure functions. No DOM, no network, no clock. The command layer composes this; the GUI
 * renders the computed classification/availability.
 */

export const AUDIO_SOURCE_SCHEMA_VERSION = 1 as const;

/** The entity type audio source registrations are addressed by in ops. Sources are DM-only config. */
export const AUDIO_SOURCE_ENTITY_TYPE = 'audio-source' as const;

/**
 * The DECLARED audio source TYPES (AUDIO-009 release-review classification). The union is OPEN (`string`)
 * so an unrecognized future/unsupported provider is accepted by the classifier and FAILS CLOSED to
 * `unsupported` rather than being a type error at a call site:
 *
 *   - `local-file`     — locally-imported audio assets (the AUDIO-004 asset library). Fully offline.
 *   - `bundled-preset` — atmosphere presets shipped with the app. Fully offline; pre-licensed.
 *   - `web-stream`     — a remote streaming URL. NOT offline-capable unless an asset is explicitly cached.
 *   - `unsupported`    — any provider that is not one of the declared types. Rejected before playback.
 */
export type AudioSourceType = 'local-file' | 'bundled-preset' | 'web-stream' | 'unsupported' | (string & {});

/** The three SUPPORTED, declared source types (excludes the catch-all `unsupported`). */
export const SUPPORTED_AUDIO_SOURCE_TYPES = Object.freeze([
	'local-file',
	'bundled-preset',
	'web-stream',
] as const);

/**
 * How a source TYPE behaves with respect to a local cache + offline availability (AUDIO-010). A typed enum
 * (never inferred at playback time) so playback enablement is a deterministic function of the declaration:
 *
 *   - `local`          — assets are stored locally; available offline by local availability (no network).
 *   - `cache-required` — a remote source that is ONLY available offline when an asset is explicitly cached.
 *   - `none`           — no caching; the source is unavailable offline (network-only).
 *   - `undeclared`     — cache behavior was never declared. Fail closed: playback CANNOT be enabled.
 */
export type AudioCacheBehavior = 'local' | 'cache-required' | 'none' | 'undeclared';

export const AUDIO_CACHE_BEHAVIORS: readonly AudioCacheBehavior[] = Object.freeze([
	'local',
	'cache-required',
	'none',
	'undeclared',
]);

/** Offline availability posture surfaced for a source (mirrors the SyncSourceCapabilities vocabulary). */
export type AudioOfflineAvailability = 'full' | 'cached' | 'none';

/**
 * A declared source-TYPE capability descriptor (modeled on `SourceAdapterCapability`). It pins the cache
 * behavior, offline availability, and licensing posture INHERENT to the type. A configured source instance
 * cannot declare a cache behavior the type does not allow (fail closed at configuration). Frozen.
 */
export interface AudioSourceTypeCapability {
	type: AudioSourceType;
	displayName: string;
	summary: string;
	/** The cache behaviors the type permits, in preference order. The first is the default. */
	allowedCacheBehaviors: readonly AudioCacheBehavior[];
	offlineAvailability: AudioOfflineAvailability;
	/**
	 * Whether assets from this type carry their OWN per-asset license (true ⇒ the AUDIO-004 license gate
	 * applies per asset) or the type is PRE-LICENSED as a whole (bundled presets ship cleared).
	 */
	requiresPerAssetLicense: boolean;
	/** Whether configuring this source requires a remote URL (web streams) vs. none (local/bundled). */
	requiresUrl: boolean;
}

/** The LOCAL-FILE source type: the AUDIO-004 asset library. Fully offline; assets carry their own license. */
export const LOCAL_FILE_SOURCE_CAPABILITY: AudioSourceTypeCapability = Object.freeze({
	type: 'local-file',
	displayName: 'Local file',
	summary:
		'Locally-imported audio assets. Fully offline-capable; playback uses local asset availability and never retries the network. Each asset carries its own license metadata.',
	allowedCacheBehaviors: Object.freeze(['local'] satisfies AudioCacheBehavior[]),
	offlineAvailability: 'full',
	requiresPerAssetLicense: true,
	requiresUrl: false,
});

/** The BUNDLED-PRESET source type: atmosphere presets shipped with the app. Fully offline; pre-licensed. */
export const BUNDLED_PRESET_SOURCE_CAPABILITY: AudioSourceTypeCapability = Object.freeze({
	type: 'bundled-preset',
	displayName: 'Bundled preset',
	summary:
		'Atmosphere presets shipped with the app. Fully offline-capable and pre-licensed as a whole; no per-asset license review is required.',
	allowedCacheBehaviors: Object.freeze(['local'] satisfies AudioCacheBehavior[]),
	offlineAvailability: 'full',
	requiresPerAssetLicense: false,
	requiresUrl: false,
});

/** The WEB-STREAM source type: a remote URL. Network-only unless an asset is explicitly cached. */
export const WEB_STREAM_SOURCE_CAPABILITY: AudioSourceTypeCapability = Object.freeze({
	type: 'web-stream',
	displayName: 'Web stream',
	summary:
		'A remote streaming URL. Not available offline unless an explicitly cached asset exists. Each stream carries its own license metadata.',
	allowedCacheBehaviors: Object.freeze(['cache-required', 'none'] satisfies AudioCacheBehavior[]),
	offlineAvailability: 'cached',
	requiresPerAssetLicense: true,
	requiresUrl: true,
});

/** THE declared source-type capability table. A future supported type is added here with the SAME shape. */
export const AUDIO_SOURCE_TYPE_CAPABILITIES: Readonly<Record<string, AudioSourceTypeCapability>> =
	Object.freeze({
		'local-file': LOCAL_FILE_SOURCE_CAPABILITY,
		'bundled-preset': BUNDLED_PRESET_SOURCE_CAPABILITY,
		'web-stream': WEB_STREAM_SOURCE_CAPABILITY,
	});

/** The declared source types in stable order — the GUI renders this as the source-capability table. */
export const REGISTERED_AUDIO_SOURCE_TYPES: readonly AudioSourceType[] = Object.freeze([
	'local-file',
	'bundled-preset',
	'web-stream',
]);

/** True when `type` is one of the declared, supported source types. Unknown providers fail closed. */
export function isSupportedAudioSourceType(type: string): boolean {
	return Object.prototype.hasOwnProperty.call(AUDIO_SOURCE_TYPE_CAPABILITIES, type);
}

/** Resolve the declared capability for a source type, or `null` for an unsupported provider (fail closed). */
export function capabilityForAudioSourceType(type: string): AudioSourceTypeCapability | null {
	return AUDIO_SOURCE_TYPE_CAPABILITIES[type] ?? null;
}

/** All declared capabilities, in registered order — the inspectable registry (AUDIO-009 AC1). */
export function listAudioSourceTypeCapabilities(): AudioSourceTypeCapability[] {
	return REGISTERED_AUDIO_SOURCE_TYPES.map((type) => AUDIO_SOURCE_TYPE_CAPABILITIES[type]!);
}

/**
 * A DURABLE configured audio source instance (AUDIO-009). It pins the DECLARED type, the per-source cache
 * behavior (within what the type allows), and a licensing note. A source whose type is unsupported never
 * becomes a record — it is rejected at configuration time (fail closed), so every persisted source is a
 * declared, classifiable source.
 */
export interface AudioSource {
	id: string;
	type: AudioSourceType;
	displayName: string;
	/** The remote URL for a `web-stream` source; null for local/bundled. Never an absolute filesystem path. */
	url: string | null;
	/** The DECLARED cache behavior (AUDIO-010 prerequisite). `undeclared` ⇒ playback cannot be enabled. */
	cacheBehavior: AudioCacheBehavior;
	/** Whether playback is ENABLED for this source. Can only be true once cache behavior is declared. */
	playbackEnabled: boolean;
	/** A DM-authored licensing note for the source as a whole (verbatim; never fabricated). */
	licenseNote: string;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
	revision: number;
}

/** The fail-closed configuration outcome. `ok` true ⇒ a declared source to persist; false ⇒ rejected. */
export type AudioSourceConfigResult =
	| { ok: true; source: AudioSource }
	| { ok: false; reason: AudioSourceRejectionReason; message: string };

/** Why a source configuration was rejected fail-closed (non-leaking; describes the reason, not payload). */
export type AudioSourceRejectionReason =
	| 'unsupported-source-type'
	| 'missing-url'
	| 'cache-behavior-not-allowed';

export interface ConfigureAudioSourceInput {
	id: string;
	type: string;
	displayName: string;
	url?: string | null;
	/** The declared cache behavior; omit/`undeclared` leaves playback disabled until declared (AUDIO-010). */
	cacheBehavior?: AudioCacheBehavior;
	licenseNote?: string;
	createdBy: string;
	createdAt: string;
	/** Existing record (for an update) so created-by/at + revision continuity are preserved. */
	previous?: AudioSource;
}

/**
 * AUDIO-009 / AUDIO-010 — CONFIGURE (or update) an audio source, fail-closed. Decision order:
 *
 *   1. UNSUPPORTED type ⇒ rejected `unsupported-source-type`. No source record is produced (and the
 *      command layer creates NO playback state). This is the AUDIO-009 AC2 unsupported-provider gate.
 *   2. A `web-stream` REQUIRES a url; a missing url is rejected `missing-url`.
 *   3. The declared cache behavior must be ALLOWED by the type (a local-file source cannot be
 *      `cache-required`, etc.). An out-of-range behavior is rejected `cache-behavior-not-allowed`.
 *
 * `playbackEnabled` is computed fail-closed: it stays FALSE while the cache behavior is `undeclared`
 * (AUDIO-010 prerequisite). When the behavior is declared, playback is enabled. The function never
 * touches storage; the command handler persists the returned source.
 */
export function configureAudioSource(input: ConfigureAudioSourceInput): AudioSourceConfigResult {
	const capability = capabilityForAudioSourceType(input.type);
	if (!capability) {
		return {
			ok: false,
			reason: 'unsupported-source-type',
			message: `Audio source type "${input.type}" is not a declared, supported source. Configuration is rejected and no playback state is created.`,
		};
	}

	const url = (input.url ?? '').trim() || null;
	if (capability.requiresUrl && !url) {
		return {
			ok: false,
			reason: 'missing-url',
			message: `A ${capability.displayName} source requires a stream URL.`,
		};
	}

	const cacheBehavior: AudioCacheBehavior = input.cacheBehavior ?? 'undeclared';
	if (
		cacheBehavior !== 'undeclared' &&
		!capability.allowedCacheBehaviors.includes(cacheBehavior)
	) {
		return {
			ok: false,
			reason: 'cache-behavior-not-allowed',
			message: `Cache behavior "${cacheBehavior}" is not permitted for a ${capability.displayName} source.`,
		};
	}

	// AUDIO-010 prerequisite: playback is enabled ONLY once cache behavior is declared.
	const playbackEnabled = cacheBehavior !== 'undeclared';
	const previous = input.previous;
	const source: AudioSource = {
		id: input.id,
		type: input.type,
		displayName: input.displayName.trim() || capability.displayName,
		url: capability.requiresUrl ? url : null,
		cacheBehavior,
		playbackEnabled,
		licenseNote: (input.licenseNote ?? previous?.licenseNote ?? '').trim(),
		createdBy: previous?.createdBy ?? input.createdBy,
		createdAt: previous?.createdAt ?? input.createdAt,
		updatedAt: input.createdAt,
		revision: (previous?.revision ?? 0) + 1,
	};
	return { ok: true, source };
}

/**
 * AUDIO-009 release-review classification of a configured source: its declared type + cache behavior +
 * offline availability + whether playback is currently enabled. The crux is that EVERY configured source
 * resolves to a declared type (because unsupported ones were rejected at configuration), so a release
 * review can classify the whole audio source set. An `unsupported` classification can only arise for a
 * legacy/corrupt persisted record whose type no longer resolves — it fails closed to `unsupported`.
 */
export interface AudioSourceClassification {
	sourceId: string;
	type: AudioSourceType;
	displayName: string;
	supported: boolean;
	cacheBehavior: AudioCacheBehavior;
	offlineAvailability: AudioOfflineAvailability;
	playbackEnabled: boolean;
	/** Whether assets from this source require per-asset license review (AUDIO-004 gate applies). */
	requiresPerAssetLicense: boolean;
}

/** Classify a configured source against its declared type capability (fail closed for an unknown type). */
export function classifyAudioSource(source: AudioSource): AudioSourceClassification {
	const capability = capabilityForAudioSourceType(source.type);
	if (!capability) {
		return {
			sourceId: source.id,
			type: 'unsupported',
			displayName: source.displayName,
			supported: false,
			cacheBehavior: source.cacheBehavior,
			offlineAvailability: 'none',
			playbackEnabled: false,
			requiresPerAssetLicense: true,
		};
	}
	return {
		sourceId: source.id,
		type: capability.type,
		displayName: source.displayName,
		supported: true,
		cacheBehavior: source.cacheBehavior,
		offlineAvailability: capability.offlineAvailability,
		// AUDIO-010: a source with undeclared cache behavior is never playback-enabled even if the record
		// somehow carries `playbackEnabled: true` — the classification recomputes it fail-closed.
		playbackEnabled: source.playbackEnabled && source.cacheBehavior !== 'undeclared',
		requiresPerAssetLicense: capability.requiresPerAssetLicense,
	};
}

/**
 * AUDIO-010 — the OFFLINE PLAYBACK availability of a request, resolved fail-closed without ANY network
 * retry. The result is a deterministic function of (source cache behavior + whether the requested asset is
 * locally available/cached). The `online` flag lets a caller model an online request; offline is the hard
 * case the requirement specifies.
 */
export type AudioPlaybackAvailability =
	// Playable: the asset is locally available (local source) or explicitly cached (web stream).
	| 'available'
	// A local-file asset is missing on this device (AUDIO-010 AC1 / AUDIO-001 AC2). Reported, no retry.
	| 'missing-asset'
	// A web-stream source is offline and the asset is NOT cached (AUDIO-010 AC2). Reported unavailable.
	| 'unavailable-offline'
	// The cache entry was evicted; the previously-cached asset is gone (AUDIO-010 AC3). Reported missing.
	| 'cache-evicted'
	// Playback is not enabled for the source (cache behavior undeclared — AUDIO-010 prerequisite).
	| 'playback-disabled';

export interface AudioPlaybackRequest {
	source: AudioSource;
	/** Whether the requested asset's bytes are locally available (a local-file asset present on device). */
	assetLocallyAvailable: boolean;
	/** Whether the requested asset is explicitly cached (a web-stream asset the DM pinned for offline). */
	assetCached: boolean;
	/** Whether a previously-cached asset was EVICTED (AUDIO-010 AC3). Takes precedence over `assetCached`. */
	cacheEvicted: boolean;
	/** Whether the device currently has network. Offline is the case the requirement specifies. */
	online: boolean;
}

/**
 * AUDIO-010 — resolve the offline/online playback availability of a request, FAIL-CLOSED, with NO network
 * retry loop and NO track substitution. Decision order:
 *
 *   0. If playback is disabled for the source (cache behavior undeclared), the request is `playback-disabled`.
 *   1. A cache that was EVICTED reports `cache-evicted` regardless of source type (AUDIO-010 AC3 — never
 *      substitute another track; the session state is preserved by the caller, this only REPORTS).
 *   2. A `local`/`local-file`/`bundled-preset` source uses LOCAL availability: present ⇒ `available`,
 *      absent ⇒ `missing-asset` (AUDIO-010 AC1 — local availability, no network retry).
 *   3. A `cache-required`/`web-stream` source: when ONLINE it is `available`; when OFFLINE it is
 *      `available` ONLY if an explicit cache exists, else `unavailable-offline` (AUDIO-010 AC2).
 *   4. A `none`-cache source is `available` only when online; offline ⇒ `unavailable-offline`.
 */
export function resolveAudioPlaybackAvailability(
	request: AudioPlaybackRequest,
): AudioPlaybackAvailability {
	const { source } = request;
	if (!source.playbackEnabled || source.cacheBehavior === 'undeclared') {
		return 'playback-disabled';
	}
	if (request.cacheEvicted) {
		return 'cache-evicted';
	}
	if (source.cacheBehavior === 'local') {
		return request.assetLocallyAvailable ? 'available' : 'missing-asset';
	}
	if (source.cacheBehavior === 'cache-required') {
		if (request.online) return 'available';
		return request.assetCached ? 'available' : 'unavailable-offline';
	}
	// `none`: network-only.
	return request.online ? 'available' : 'unavailable-offline';
}
