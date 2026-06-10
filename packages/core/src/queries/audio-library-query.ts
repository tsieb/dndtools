import type { PermissionState } from '../state/permission-state';
import { getActor } from '../state/permission-state';
import {
	assetNeedsLicenseReview,
	licenseReviewReason,
	type AudioAsset,
	type AudioLicenseReviewReason,
} from '../state/audio-asset';
import {
	classifyAudioSource,
	resolveAudioPlaybackAvailability,
	type AudioPlaybackAvailability,
	type AudioSourceClassification,
} from '../state/audio-source';
import {
	resolveAudioAutomation,
	type AudioAutomationResolution,
	type AudioAutomationRule,
	type AudioAutomationTrigger,
} from '../state/audio-automation';
import type { AudioState } from '../state/audio-state';

/**
 * AUDIO-004 / AUDIO-005 / AUDIO-009 / AUDIO-010 — THE single actor-filtered AUDIO LIBRARY read model.
 *
 * The audio asset library, the source registry, and the automation rules are DM-authored configuration
 * (AUDIO-004/005/009/011 are Player-safe: dm-only). This is the only sanctioned read path: the data layer
 * decides visibility BEFORE returning anything (Architecture Contract 3), so a NON-DM viewer receives EMPTY
 * lists — asset filenames, license notes, stream URLs, source config, and automation triggers/cues never
 * leak.
 *
 * The DM sees each asset with its computed license-review flag (AUDIO-004 AC2), each source with its
 * computed classification (AUDIO-009) and offline availability (AUDIO-010), and each automation rule
 * (AUDIO-005). The review flag + classification are RECOMPUTED here (not stored) so they always reflect the
 * current license/cache declaration.
 *
 * Pure + deterministic. No GUI, no storage, no clock.
 */

/** A read-only audio asset view with its computed license-review flag (DM-only). */
export interface AudioAssetView {
	id: string;
	fileName: string;
	title: string;
	mimeType: string;
	byteLength: number;
	checksum: string;
	licenseKind: AudioAsset['license']['kind'];
	licenseNote: string;
	attribution: string;
	tags: string[];
	sourceId: string;
	/** AUDIO-004 AC2 — true when the asset is flagged for license review (undeclared/restricted/no-attribution). */
	needsLicenseReview: boolean;
	/** The precise review reason, or null when the license is cleared. */
	reviewReason: AudioLicenseReviewReason | null;
	importedAt: string;
}

function toAssetView(asset: AudioAsset): AudioAssetView {
	return {
		id: asset.id,
		fileName: asset.fileName,
		title: asset.title,
		mimeType: asset.mimeType,
		byteLength: asset.byteLength,
		checksum: asset.checksum,
		licenseKind: asset.license.kind,
		licenseNote: asset.license.licenseNote,
		attribution: asset.license.attribution,
		tags: [...asset.tags],
		sourceId: asset.source.sourceId,
		needsLicenseReview: assetNeedsLicenseReview(asset),
		reviewReason: licenseReviewReason(asset),
		importedAt: asset.source.importedAt,
	};
}

/**
 * AUDIO-004 — list audio assets for the actor. The DM gets every asset (stable id order); a non-DM actor
 * gets an EMPTY list (the audio library is DM-only — fail closed, no leak).
 */
export function listAudioAssetsForActor(
	state: AudioState,
	permissions: PermissionState,
	actorId: string,
): AudioAssetView[] {
	const actor = getActor(permissions, actorId);
	if (actor?.role !== 'dm') return [];
	return Object.values(state.assets)
		.sort((a, b) => a.id.localeCompare(b.id))
		.map(toAssetView);
}

/**
 * AUDIO-004 AC2 — the assets FLAGGED FOR REVIEW (missing/restricted license). The DM uses this list to fix
 * licensing before export; a non-DM gets an empty list (no leak).
 */
export function listAudioAssetsNeedingReview(
	state: AudioState,
	permissions: PermissionState,
	actorId: string,
): AudioAssetView[] {
	return listAudioAssetsForActor(state, permissions, actorId).filter((a) => a.needsLicenseReview);
}

/**
 * AUDIO-009 — list the configured sources with their release-review CLASSIFICATION. The DM gets every
 * source (stable id order) classified by declared type + cache/offline behavior; a non-DM gets an empty
 * list (source config is DM-only — fail closed, no leak).
 */
export function listAudioSourceClassificationsForActor(
	state: AudioState,
	permissions: PermissionState,
	actorId: string,
): AudioSourceClassification[] {
	const actor = getActor(permissions, actorId);
	if (actor?.role !== 'dm') return [];
	return Object.values(state.sources)
		.sort((a, b) => a.id.localeCompare(b.id))
		.map(classifyAudioSource);
}

/**
 * AUDIO-010 — resolve the OFFLINE/ONLINE playback availability of a (source, asset) request for the DM.
 * Returns `null` for a non-DM actor, an unknown source, or an unknown asset (fail closed: no playback is
 * resolved against config the actor cannot see). The availability NEVER triggers a network retry and never
 * substitutes another track — it only REPORTS the deterministic availability state (AUDIO-010 AC1/2/3).
 */
export function resolveAudioPlaybackForActor(
	state: AudioState,
	permissions: PermissionState,
	actorId: string,
	request: {
		sourceId: string;
		assetId?: string | null;
		assetLocallyAvailable: boolean;
		assetCached: boolean;
		cacheEvicted: boolean;
		online: boolean;
	},
): AudioPlaybackAvailability | null {
	const actor = getActor(permissions, actorId);
	if (actor?.role !== 'dm') return null;
	const source = state.sources[request.sourceId];
	if (!source) return null;
	// When the request names a local asset, it must exist; a missing asset id fails closed (no playback).
	if (request.assetId != null && !state.assets[request.assetId]) return null;
	return resolveAudioPlaybackAvailability({
		source,
		assetLocallyAvailable: request.assetLocallyAvailable,
		assetCached: request.assetCached,
		cacheEvicted: request.cacheEvicted,
		online: request.online,
	});
}

/**
 * AUDIO-005 — list the configured atmosphere AUTOMATION RULES for the actor. The DM gets every rule (stable
 * id order); a non-DM actor gets an EMPTY list (automation config is DM-only — fail closed, so a hidden
 * trigger or cue never leaks to a player). Rules carry only the DM-authored definition, never player content.
 */
export function listAudioAutomationRulesForActor(
	state: AudioState,
	permissions: PermissionState,
	actorId: string,
): AudioAutomationRule[] {
	const actor = getActor(permissions, actorId);
	if (actor?.role !== 'dm') return [];
	return Object.values(state.automationRules)
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((rule) => ({ ...rule }));
}

/**
 * AUDIO-005 — resolve the automation OUTCOME of a fired session-event trigger for the DM. Returns `null`
 * for a non-DM actor (automation is DM-only — fail closed; no automation is resolved for an actor who
 * cannot see the config). The resolution is the deterministic set of requested audio commands + blocked
 * diagnostics computed against the LIVE rules + library; it triggers no network retry and never substitutes
 * a track. The GUI dispatches each `request` as a real audio command through the Processing Core (AC1); a
 * blocked rule is a flagged no-op with a diagnostic (AC2 — no hidden bypass).
 */
export function resolveAudioAutomationForActor(
	state: AudioState,
	permissions: PermissionState,
	actorId: string,
	trigger: AudioAutomationTrigger,
): AudioAutomationResolution | null {
	const actor = getActor(permissions, actorId);
	if (actor?.role !== 'dm') return null;
	return resolveAudioAutomation(trigger, state.automationRules, state);
}
