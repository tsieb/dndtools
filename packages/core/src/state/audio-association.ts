import {
	assetNeedsLicenseReview,
	licenseReviewReason,
	type AudioLicenseReviewReason,
} from './audio-asset';
import {
	classifyAudioSource,
	resolveAudioPlaybackAvailability,
	type AudioPlaybackAvailability,
} from './audio-source';
import type { AudioState } from './audio-state';

/**
 * AUDIO-001 — SCENE / MAP / MAP-LAYER AUDIO ASSOCIATION: a DM-authored binding of an ambient track,
 * playlist, or atmosphere preset to a Scene, a map, or a single map layer.
 *
 * "A Scene HAS an audio preset" (AUDIO-001 AC1) is a DURABLE ASSOCIATION authored ON the audio config and
 * keyed by its TARGET entity — distinct from a free-floating AUDIO-005 automation rule (which is a session-
 * EVENT → command mapping). When the DM activates a Scene (or reveals a map / map layer), the Processing
 * Core RESOLVES which associations match that target and computes, for each, whether its cue is AVAILABLE
 * to the audio widget — COMPOSING the EXISTING audio gates rather than duplicating any policy:
 *
 *   - AUDIO-009: the referenced source must be a DECLARED, supported, playback-enabled type. An
 *     unsupported/disabled source resolves the preset BLOCKED (a legacy/corrupt record fails closed).
 *   - AUDIO-004: a preset whose local asset's license is NOT cleared resolves BLOCKED (license review gate
 *     reused verbatim) — an association can never surface a silent unlicensed cue.
 *   - AUDIO-010: a missing-on-device / uncached / evicted asset resolves to the MISSING-ASSET state
 *     (AUDIO-001 AC2) — the UI shows it without a network retry loop or a track substitution.
 *
 * The resolution makes the cleared preset AVAILABLE to the audio widget (the DM selects it and dispatches
 * the existing `session.audio.play` command); it does NOT itself start playback (Contract 4: a widget
 * mutates durable state only by dispatching a command the core validates). Associations are DM-only config
 * (AUDIO-001 Player-safe: dm-only); the read model omits them for a non-DM so a hidden cue never leaks.
 *
 * This module is PURE + DETERMINISTIC (no DOM, no clock, no network): identical (target, associations,
 * library, device inputs) always yields an identical resolution, so identical Scene/map activations produce
 * identical audio resolution.
 */

export const AUDIO_ASSOCIATION_SCHEMA_VERSION = 1 as const;

/** The entity type audio associations are addressed by in ops. Associations are DM-only config (dm-only). */
export const AUDIO_ASSOCIATION_ENTITY_TYPE = 'audio-association' as const;

/**
 * The TARGET KIND an audio cue is associated with (AUDIO-001). A CLOSED enum mapped to the existing
 * activatable/revealable entities, so an association can never bind to an undeclared target:
 *
 *   - `scene`     — a Scene. Resolved when the Scene is activated (`session.workflow-changed`).
 *   - `map`       — a whole map entity. Resolved when the map is activated/made the active map.
 *   - `map-layer` — a SINGLE map layer. Resolved when that layer is revealed (`map.layer-changed`).
 */
export type AudioAssociationTargetKind = 'scene' | 'map' | 'map-layer';

export const AUDIO_ASSOCIATION_TARGET_KINDS: readonly AudioAssociationTargetKind[] = Object.freeze([
	'scene',
	'map',
	'map-layer',
]);

/** True when `value` is a declared target kind. Unknown values fail closed (the association is not built). */
export function isAudioAssociationTargetKind(value: unknown): value is AudioAssociationTargetKind {
	return (
		typeof value === 'string' &&
		(AUDIO_ASSOCIATION_TARGET_KINDS as readonly string[]).includes(value)
	);
}

/**
 * The KIND of audio cue an association carries (AUDIO-001 — "ambient audio, playlists, and atmosphere
 * presets"). Descriptive metadata for the widget/list surface; it does NOT change the gate/resolution rules
 * (every kind passes the same source/asset/license/offline gate). Fails closed to `ambient` on hydrate.
 */
export type AudioPresetKind = 'ambient' | 'playlist' | 'preset';

export const AUDIO_PRESET_KINDS: readonly AudioPresetKind[] = Object.freeze([
	'ambient',
	'playlist',
	'preset',
]);

/** True when `value` is a declared preset kind. Unknown values fail closed to `ambient`. */
export function isAudioPresetKind(value: unknown): value is AudioPresetKind {
	return typeof value === 'string' && (AUDIO_PRESET_KINDS as readonly string[]).includes(value);
}

/**
 * A durable AUDIO ASSOCIATION (AUDIO-001). The DM authors it; it references a DECLARED source (and an
 * optional declared local asset) BY ID — never a copy of the asset bytes (Contract 2). It is DM-only config:
 * it carries no player-facing content, so a player never sees the cue or its target binding.
 */
export interface AudioAssociation {
	id: string;
	/** A short DM-authored label for the preset list (verbatim; defaults to a derived label). */
	label: string;
	/** The cue kind (ambient / playlist / preset). Descriptive only. */
	presetKind: AudioPresetKind;
	/** The kind of entity this cue is associated with (scene / map / map-layer). */
	targetKind: AudioAssociationTargetKind;
	/**
	 * The id of the entity the cue is bound to. For `scene` it is a Scene id; for `map`/`map-layer` it is the
	 * MAP id (a `map-layer` association additionally pins `layerId` to one layer of that map).
	 */
	targetId: string;
	/** For a `map-layer` association, the specific layer id within {@link targetId}; null for scene/map. */
	layerId: string | null;
	/** The declared source the cue plays through (a configured `AudioSource` id). */
	sourceId: string;
	/** The declared local asset to play, or null (a web-stream cue where the stream IS the track). */
	assetId: string | null;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
	revision: number;
}

/** The fail-closed build outcome. `ok` true ⇒ a valid association to persist; false ⇒ rejected with reason. */
export type AudioAssociationResult =
	| { ok: true; association: AudioAssociation }
	| { ok: false; reason: AudioAssociationRejectionReason; message: string };

/** Why an association build was rejected fail-closed (non-leaking; describes the reason, not the payload). */
export type AudioAssociationRejectionReason =
	| 'unsupported-target'
	| 'missing-layer-id'
	| 'unexpected-layer-id'
	| 'source-not-found'
	| 'asset-not-found'
	| 'asset-required';

export interface BuildAudioAssociationInput {
	id: string;
	label?: string;
	presetKind?: string;
	targetKind: string;
	targetId: string;
	layerId?: string | null;
	sourceId: string;
	assetId?: string | null;
	createdBy: string;
	createdAt: string;
	/** The library the source/asset references resolve against (fail closed: a dangling ref is rejected). */
	library: AudioState;
	/** Existing record (for an update) so created-by/at + revision continuity are preserved. */
	previous?: AudioAssociation;
}

/** Default human label for an association when the DM did not author one. */
function defaultAssociationLabel(
	presetKind: AudioPresetKind,
	targetKind: AudioAssociationTargetKind,
): string {
	return `${presetKind} for ${targetKind}`;
}

/**
 * AUDIO-001 — BUILD (or update) an audio association, fail-closed. Decision order (reject BEFORE any state
 * mutation, so no half-formed association is ever persisted):
 *
 *   1. An UNDECLARED target kind is rejected `unsupported-target`.
 *   2. A `map-layer` association MUST carry a `layerId`; a missing one is rejected `missing-layer-id`. A
 *      `scene`/`map` association must NOT carry a `layerId`; a stray one is rejected `unexpected-layer-id`.
 *   3. The referenced SOURCE must exist in the library; a dangling source is rejected `source-not-found`.
 *   4. A referenced ASSET (when given) must exist; a dangling asset is rejected `asset-not-found`.
 *   5. A LOCAL-FILE / BUNDLED-PRESET source plays a SPECIFIC local asset; a missing asset is rejected
 *      `asset-required`. A web-stream cue may omit the asset (the stream is the track).
 *
 * License/offline enforcement is NOT done here — it is RESOLVED at activation time (against the live library
 * + device state) so an association authored while an asset was licensed still fails closed if the license
 * is later revoked or the asset goes missing. The function never touches storage; the command persists it.
 */
export function buildAudioAssociation(input: BuildAudioAssociationInput): AudioAssociationResult {
	if (!isAudioAssociationTargetKind(input.targetKind)) {
		return {
			ok: false,
			reason: 'unsupported-target',
			message: `Audio association target "${input.targetKind}" is not a declared target kind.`,
		};
	}

	const layerId = (input.layerId ?? '').toString().trim() || null;
	if (input.targetKind === 'map-layer' && layerId === null) {
		return {
			ok: false,
			reason: 'missing-layer-id',
			message: 'A map-layer audio association must reference a specific layer id.',
		};
	}
	if (input.targetKind !== 'map-layer' && layerId !== null) {
		return {
			ok: false,
			reason: 'unexpected-layer-id',
			message: `A ${input.targetKind} audio association must not reference a layer id.`,
		};
	}

	const source = input.library.sources[input.sourceId];
	if (!source) {
		return {
			ok: false,
			reason: 'source-not-found',
			message: `Audio association references source ${input.sourceId}, which is not configured.`,
		};
	}

	const assetId = input.assetId ?? null;
	if (assetId !== null && !input.library.assets[assetId]) {
		return {
			ok: false,
			reason: 'asset-not-found',
			message: `Audio association references asset ${assetId}, which is not in the library.`,
		};
	}

	// A local/bundled cue needs a specific asset; a web-stream cue does not (the stream is the track).
	if (assetId === null && source.type !== 'web-stream') {
		return {
			ok: false,
			reason: 'asset-required',
			message: `A ${source.type} audio association must reference a local asset.`,
		};
	}

	const presetKind: AudioPresetKind = isAudioPresetKind(input.presetKind)
		? input.presetKind
		: 'ambient';
	const previous = input.previous;
	const association: AudioAssociation = {
		id: input.id,
		label: (input.label ?? '').trim() || defaultAssociationLabel(presetKind, input.targetKind),
		presetKind,
		targetKind: input.targetKind,
		targetId: input.targetId,
		layerId,
		sourceId: input.sourceId,
		assetId,
		createdBy: previous?.createdBy ?? input.createdBy,
		createdAt: previous?.createdAt ?? input.createdAt,
		updatedAt: input.createdAt,
		revision: (previous?.revision ?? 0) + 1,
	};
	return { ok: true, association };
}

/** Deep-clone an audio association so callers never mutate shared state. Pure. */
export function cloneAudioAssociation(association: AudioAssociation): AudioAssociation {
	return { ...association };
}

/**
 * The ACTIVATION the resolver evaluates associations against (AUDIO-001 AC1). Built by the GUI/runtime when
 * a Scene is activated / a map is made active / a map layer is revealed. It carries the device's CURRENT
 * availability inputs (online + per-asset local availability/cache state) so the resolver can reuse the
 * AUDIO-010 offline gate WITHOUT any network I/O of its own.
 */
export interface AudioAssociationActivation {
	targetKind: AudioAssociationTargetKind;
	/** The activated entity id (Scene id, or MAP id for map / map-layer). */
	targetId: string;
	/** For a `map-layer` activation, the revealed layer id; null for scene/map (match any non-layer record). */
	layerId: string | null;
	/** Whether the device currently has network (AUDIO-010 offline gate input). Defaults to online. */
	online: boolean;
	/** Whether the referenced local asset's bytes are available on this device. */
	assetLocallyAvailable: boolean;
	/** Whether the referenced asset is explicitly cached (a web-stream pinned for offline). */
	assetCached: boolean;
	/** Whether a previously-cached asset was evicted (AUDIO-010 AC3 — reports missing, never substitutes). */
	cacheEvicted: boolean;
}

/**
 * The AVAILABILITY of an associated preset's cue on this device (AUDIO-001 AC1/AC2). Composed from the
 * existing gates:
 *
 *   - `available`      — the cue passed every gate; it is available to the audio widget to play.
 *   - `missing-asset`  — the local asset is missing/uncached/evicted on this device (AUDIO-001 AC2). The UI
 *                        shows the MISSING-ASSET state; no network retry, no substitution.
 *   - `unavailable`    — a web-stream cue is offline-unavailable (AUDIO-010 AC2). Reported, not retried.
 *   - `license-blocked`— the local asset's license is not cleared (AUDIO-004) — never a silent cue.
 *   - `source-unsupported` — the source no longer resolves to a declared, playback-enabled type (AUDIO-009).
 */
export type AudioPresetAvailability =
	| 'available'
	| 'missing-asset'
	| 'unavailable'
	| 'license-blocked'
	| 'source-unsupported';

/** ONE resolved associated preset: the DM-authored cue + its computed device availability + diagnostics. */
export interface ResolvedAudioPreset {
	associationId: string;
	label: string;
	presetKind: AudioPresetKind;
	targetKind: AudioAssociationTargetKind;
	targetId: string;
	layerId: string | null;
	sourceId: string;
	assetId: string | null;
	/** The computed availability of the cue on this device (AUDIO-001 AC1/AC2). */
	availability: AudioPresetAvailability;
	/** Whether the cue is available to PLAY (availability === `available`). */
	playable: boolean;
	/** The precise license-review reason when availability is `license-blocked`, else null. */
	licenseReviewReason: AudioLicenseReviewReason | null;
	/** A non-leaking human reason for a non-available cue (DM-facing), or '' when available. */
	message: string;
}

/** Whether an association binds to the activated target (kind + id, and exact layer for a map-layer). */
function associationMatchesActivation(
	association: AudioAssociation,
	activation: AudioAssociationActivation,
): boolean {
	if (association.targetKind !== activation.targetKind) return false;
	if (association.targetId !== activation.targetId) return false;
	// A map-layer association fires only for its exact layer; a scene/map association has no layer.
	if (association.targetKind === 'map-layer') {
		return association.layerId !== null && association.layerId === activation.layerId;
	}
	return true;
}

/** Map an AUDIO-010 availability state to the preset availability + non-leaking message. */
function presetForPlaybackAvailability(
	association: AudioAssociation,
	availability: AudioPlaybackAvailability,
): { availability: AudioPresetAvailability; message: string } {
	if (availability === 'missing-asset' || availability === 'cache-evicted') {
		return {
			availability: 'missing-asset',
			message: `Preset "${association.label}" is missing its audio asset on this device.`,
		};
	}
	if (availability === 'playback-disabled') {
		return {
			availability: 'source-unsupported',
			message: `Preset "${association.label}" source has no declared cache/offline behavior.`,
		};
	}
	// `unavailable-offline`.
	return {
		availability: 'unavailable',
		message: `Preset "${association.label}" is unavailable offline.`,
	};
}

/**
 * AUDIO-001 — resolve ONE matching association into a {@link ResolvedAudioPreset}, fail-closed. The cue is
 * validated through the FULL existing gate: source supported + playback-enabled (AUDIO-009) → license
 * cleared (AUDIO-004) → offline availability `available` (AUDIO-010). Any failure yields a non-`available`
 * preset with a non-leaking diagnostic; only a fully-cleared cue is `available`/`playable`.
 */
function resolveAssociation(
	association: AudioAssociation,
	library: AudioState,
	activation: AudioAssociationActivation,
): ResolvedAudioPreset {
	const base = {
		associationId: association.id,
		label: association.label,
		presetKind: association.presetKind,
		targetKind: association.targetKind,
		targetId: association.targetId,
		layerId: association.layerId,
		sourceId: association.sourceId,
		assetId: association.assetId,
		licenseReviewReason: null as AudioLicenseReviewReason | null,
	};

	// AUDIO-009 — the source must resolve to a declared, supported, playback-enabled type.
	const source = library.sources[association.sourceId];
	const classification = source ? classifyAudioSource(source) : null;
	if (!source || !classification || !classification.supported || !classification.playbackEnabled) {
		return {
			...base,
			availability: 'source-unsupported',
			playable: false,
			message: `Preset "${association.label}" source is unsupported or has playback disabled.`,
		};
	}

	// AUDIO-004 — license gate for a local asset (a flagged asset never becomes a playable preset).
	if (association.assetId !== null) {
		const asset = library.assets[association.assetId];
		if (!asset) {
			return {
				...base,
				availability: 'missing-asset',
				playable: false,
				message: `Preset "${association.label}" references an asset that is no longer in the library.`,
			};
		}
		if (assetNeedsLicenseReview(asset)) {
			return {
				...base,
				availability: 'license-blocked',
				playable: false,
				licenseReviewReason: licenseReviewReason(asset),
				message: `Preset "${association.label}" asset license is not cleared.`,
			};
		}
	}

	// AUDIO-010 — offline/cache availability on this device (no network retry, no substitution).
	const availability = resolveAudioPlaybackAvailability({
		source,
		assetLocallyAvailable: activation.assetLocallyAvailable,
		assetCached: activation.assetCached,
		cacheEvicted: activation.cacheEvicted,
		online: activation.online,
	});
	if (availability !== 'available') {
		const mapped = presetForPlaybackAvailability(association, availability);
		return { ...base, availability: mapped.availability, playable: false, message: mapped.message };
	}

	return { ...base, availability: 'available', playable: true, message: '' };
}

/**
 * AUDIO-001 — THE deterministic association resolver. Given an activation (the activated Scene/map/layer +
 * device inputs) + the live association set + the live library, it resolves EVERY matching association
 * (stable id order) into its computed preset availability. Pure + deterministic: identical inputs always
 * yield the identical list, so identical Scene/map activations produce identical audio resolution. It
 * performs NO mutation and NO network I/O; the GUI renders the presets and (for a `playable` preset)
 * dispatches the existing `session.audio.play` command through the Processing Core.
 */
export function resolveAudioAssociations(
	activation: AudioAssociationActivation,
	associations: Record<string, AudioAssociation>,
	library: AudioState,
): ResolvedAudioPreset[] {
	return Object.values(associations)
		.filter((association) => associationMatchesActivation(association, activation))
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((association) => resolveAssociation(association, library, activation));
}
