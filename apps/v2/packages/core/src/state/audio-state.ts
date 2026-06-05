import { cloneAudioAsset, isAudioLicenseKind, type AudioAsset } from './audio-asset';
import {
	cloneAudioAssociation,
	isAudioAssociationTargetKind,
	isAudioPresetKind,
	type AudioAssociation,
} from './audio-association';
import {
	cloneAudioAutomationRule,
	isAudioAutomationAction,
	isAudioAutomationTriggerKind,
	type AudioAutomationRule,
} from './audio-automation';
import type { AudioCacheBehavior, AudioSource } from './audio-source';

/**
 * AUDIO-001 / AUDIO-004 / AUDIO-005 / AUDIO-009 / AUDIO-010 — the durable AUDIO VaultState slice: the local
 * audio ASSET LIBRARY (content-addressed records with license/tags/source), the declared audio SOURCE
 * registry, the DM-authored AUTOMATION RULES (AUDIO-005), and the DM-authored SCENE/MAP/LAYER AUDIO
 * ASSOCIATIONS (AUDIO-001).
 *
 * This is a bounded state document modeled exactly like the other vault slices (`maps`, `characters`,
 * `encounters`): a record map keyed by id plus a schema version, with a fail-closed `ensure` hydration
 * helper so a vault persisted before a given field existed restores to a safe empty default without a
 * destructive migration. Playback state is NOT here — currently-playing audio is SessionState (Contract 4
 * Widget State Ownership) and is owned by the AUDIO playback epic; this slice owns the durable LIBRARY,
 * SOURCE CONFIG, AUTOMATION RULE, and ASSOCIATION definitions only.
 */

export const AUDIO_STATE_SCHEMA_VERSION = 1 as const;

export interface AudioState {
	/** The content-addressed local audio asset library, keyed by content-hash id (AUDIO-004). */
	assets: Record<string, AudioAsset>;
	/** The declared, configured audio sources, keyed by source id (AUDIO-009 / AUDIO-010). */
	sources: Record<string, AudioSource>;
	/** The DM-authored atmosphere automation rules, keyed by rule id (AUDIO-005). DM-only config. */
	automationRules: Record<string, AudioAutomationRule>;
	/** The DM-authored scene/map/layer audio associations, keyed by association id (AUDIO-001). DM-only. */
	associations: Record<string, AudioAssociation>;
	schemaVersion: typeof AUDIO_STATE_SCHEMA_VERSION;
}

export const EMPTY_AUDIO_STATE: AudioState = Object.freeze({
	assets: {},
	sources: {},
	automationRules: {},
	associations: {},
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

/**
 * Hydrate a persisted automation rule fail-closed: re-clone, and DROP a rule whose trigger kind or action
 * is no longer declared (an undeclared trigger/action could never resolve, so a corrupt record is omitted
 * rather than restored into an un-evaluable armed state). Returns null when the record must be dropped.
 */
function ensureAudioAutomationRule(rule: AudioAutomationRule): AudioAutomationRule | null {
	if (!isAudioAutomationTriggerKind(rule.trigger) || !isAudioAutomationAction(rule.action)) {
		return null;
	}
	const cloned = cloneAudioAutomationRule(rule);
	return {
		...cloned,
		enabled: Boolean(cloned.enabled),
		triggerScopeId: cloned.triggerScopeId ?? null,
		assetId: cloned.assetId ?? null,
	};
}

/**
 * Hydrate a persisted association fail-closed: re-clone, and DROP a record whose target kind is no longer
 * declared (an undeclared target could never resolve, so a corrupt record is omitted rather than restored
 * into an un-resolvable state). A map-layer record missing its layer id, or a non-map-layer record carrying
 * a stray layer id, is corrected to the safe shape (layer id only on map-layer). Returns null when dropped.
 */
function ensureAudioAssociation(association: AudioAssociation): AudioAssociation | null {
	if (!isAudioAssociationTargetKind(association.targetKind)) {
		return null;
	}
	const cloned = cloneAudioAssociation(association);
	const layerId = cloned.targetKind === 'map-layer' ? (cloned.layerId ?? null) : null;
	// A map-layer record persisted without a layer id can never match its exact layer; drop it fail-closed.
	if (cloned.targetKind === 'map-layer' && layerId === null) {
		return null;
	}
	return {
		...cloned,
		presetKind: isAudioPresetKind(cloned.presetKind) ? cloned.presetKind : 'ambient',
		layerId,
		assetId: cloned.assetId ?? null,
	};
}

/**
 * A possibly-partial persisted audio slice. A vault persisted before a given field existed (e.g. before
 * AUDIO-005 added `automationRules`, or before AUDIO-001 added `associations`) round-trips through this
 * hydrator, so every field is optional here.
 */
export type PersistedAudioState = Partial<AudioState>;

/** Tolerantly hydrate a possibly-undefined/partial persisted audio slice (safe, fail-closed defaults). */
export function ensureAudioState(state: PersistedAudioState | undefined): AudioState {
	const assets: Record<string, AudioAsset> = {};
	for (const [id, asset] of Object.entries(state?.assets ?? {})) {
		assets[id] = ensureAudioAsset(asset);
	}
	const sources: Record<string, AudioSource> = {};
	for (const [id, source] of Object.entries(state?.sources ?? {})) {
		sources[id] = ensureAudioSource(source as AudioSource);
	}
	const automationRules: Record<string, AudioAutomationRule> = {};
	for (const [id, rule] of Object.entries(state?.automationRules ?? {})) {
		const ensured = ensureAudioAutomationRule(rule as AudioAutomationRule);
		if (ensured) automationRules[id] = ensured;
	}
	const associations: Record<string, AudioAssociation> = {};
	for (const [id, association] of Object.entries(state?.associations ?? {})) {
		const ensured = ensureAudioAssociation(association as AudioAssociation);
		if (ensured) associations[id] = ensured;
	}
	return {
		assets,
		sources,
		automationRules,
		associations,
		schemaVersion: AUDIO_STATE_SCHEMA_VERSION,
	};
}

/** Look up an audio asset by id, or undefined. Pure. */
export function audioAssetById(state: AudioState, assetId: string): AudioAsset | undefined {
	return state.assets[assetId];
}

/** Look up a configured audio source by id, or undefined. Pure. */
export function audioSourceById(state: AudioState, sourceId: string): AudioSource | undefined {
	return state.sources[sourceId];
}

/** Look up an audio automation rule by id, or undefined. Pure. */
export function audioAutomationRuleById(
	state: AudioState,
	ruleId: string,
): AudioAutomationRule | undefined {
	return state.automationRules[ruleId];
}

/** Look up an audio association by id, or undefined. Pure. */
export function audioAssociationById(
	state: AudioState,
	associationId: string,
): AudioAssociation | undefined {
	return state.associations[associationId];
}
