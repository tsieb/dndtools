import type { PermissionState } from '../state/permission-state';
import { getActor } from '../state/permission-state';
import {
	resolveAudioAssociations,
	type AudioAssociation,
	type AudioAssociationActivation,
	type AudioAssociationTargetKind,
	type ResolvedAudioPreset,
} from '../state/audio-association';
import type { AudioState } from '../state/audio-state';

/**
 * AUDIO-001 — THE actor-filtered SCENE/MAP/LAYER AUDIO ASSOCIATION read model.
 *
 * Audio associations are DM-authored configuration (AUDIO-001 Player-safe: dm-only). This is the only
 * sanctioned read path: the data layer decides visibility BEFORE returning anything (Architecture Contract
 * 3 / Cross-Contract Non-Negotiable 2), so a NON-DM viewer receives EMPTY lists — the cue, its target
 * binding, and the source/asset refs never leak to a player.
 *
 * On a Scene/map/layer ACTIVATION the DM gets the resolved presets AVAILABLE to the audio widget (AUDIO-001
 * AC1), each with its computed device availability composed from the EXISTING gates: source supported +
 * playback-enabled (AUDIO-009), license cleared (AUDIO-004), and offline/cache availability (AUDIO-010) —
 * so a missing-on-device asset surfaces the MISSING-ASSET state (AUDIO-001 AC2) without a network retry or a
 * track substitution. The availability is RECOMPUTED here (not stored) so it always reflects the current
 * license/cache declaration + the device's live availability inputs.
 *
 * Pure + deterministic. No GUI, no storage, no clock, no network — identical inputs yield an identical view.
 */

/** A read-only association view (the DM-authored definition; DM-only). */
export interface AudioAssociationView {
	id: string;
	label: string;
	presetKind: AudioAssociation['presetKind'];
	targetKind: AudioAssociationTargetKind;
	targetId: string;
	layerId: string | null;
	sourceId: string;
	assetId: string | null;
}

function toAssociationView(association: AudioAssociation): AudioAssociationView {
	return {
		id: association.id,
		label: association.label,
		presetKind: association.presetKind,
		targetKind: association.targetKind,
		targetId: association.targetId,
		layerId: association.layerId,
		sourceId: association.sourceId,
		assetId: association.assetId,
	};
}

/**
 * AUDIO-001 — list the configured audio associations for the actor. The DM gets every association (stable id
 * order); a non-DM actor gets an EMPTY list (associations are DM-only — fail closed, no leak). Optionally
 * filter by a target kind + id (e.g. every cue authored on one Scene).
 */
export function listAudioAssociationsForActor(
	state: AudioState,
	permissions: PermissionState,
	actorId: string,
	filter?: { targetKind: AudioAssociationTargetKind; targetId: string },
): AudioAssociationView[] {
	const actor = getActor(permissions, actorId);
	if (actor?.role !== 'dm') return [];
	return Object.values(state.associations)
		.filter(
			(association) =>
				!filter ||
				(association.targetKind === filter.targetKind &&
					association.targetId === filter.targetId),
		)
		.sort((a, b) => a.id.localeCompare(b.id))
		.map(toAssociationView);
}

/**
 * AUDIO-001 AC1/AC2 — resolve the audio presets AVAILABLE to the audio widget when the given Scene/map/layer
 * is activated, for the DM. Returns `null` for a non-DM actor (associations are DM-only — fail closed; no
 * presets are resolved for an actor who cannot see the config). The resolution is the deterministic set of
 * matching cues with their computed device availability (available / missing-asset / unavailable /
 * license-blocked / source-unsupported); it triggers no network retry and never substitutes a track. The GUI
 * renders the presets and, for a `playable` one, dispatches the EXISTING `session.audio.play` command (AC1);
 * a missing-on-device asset surfaces the MISSING-ASSET state (AC2).
 */
export function resolveActivatedSceneAudioForActor(
	state: AudioState,
	permissions: PermissionState,
	actorId: string,
	activation: AudioAssociationActivation,
): ResolvedAudioPreset[] | null {
	const actor = getActor(permissions, actorId);
	if (actor?.role !== 'dm') return null;
	return resolveAudioAssociations(activation, state.associations, state);
}
