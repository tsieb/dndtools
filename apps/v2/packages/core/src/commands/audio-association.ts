import {
	associateSceneAudioInputSchema,
	disassociateSceneAudioInputSchema,
} from '../schemas/commands';
import {
	AUDIO_ASSOCIATION_ENTITY_TYPE,
	buildAudioAssociation,
	type AudioAssociation,
} from '../state/audio-association';
import type { AudioState } from '../state/audio-state';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

/**
 * AUDIO-001 — SCENE / MAP / MAP-LAYER AUDIO ASSOCIATION command handlers (Architecture Contract 1 / 4).
 *
 * The DM ASSOCIATES + DISASSOCIATES durable cues binding an ambient track / playlist / atmosphere preset to
 * a Scene, a map, or a single map layer. Both are DM-only (audio association is Player-safe: dm-only). The
 * architecture invariants this slice upholds, fail-closed:
 *
 *   - DM-only. A non-DM cannot associate/disassociate a cue (a player has no audio config authority), and
 *     the read model omits associations for non-DM actors so a hidden cue/target never leaks to players.
 *   - Declared targets only. An undeclared target kind, a map-layer association missing/with a stray layer
 *     id, or a local/bundled cue missing its required asset is rejected; the association is never persisted
 *     in an un-resolvable state.
 *   - Live references. A cue references a DECLARED source (and optional local asset) BY ID; a dangling
 *     reference is rejected at association. The license/scope/offline gate is NOT baked into the record — it
 *     is RESOLVED at ACTIVATION time against the LIVE library/online state (see `state/audio-association.ts`
 *     `resolveAudioAssociations`), so an association can never bypass a license/scope/offline block added
 *     after it was authored (the resolver fails closed). Creating an association creates NO playback state.
 *
 * Each durable mutation appends an `audio.association.*` op (actor + entity — the audit). The GUI dispatches
 * the intent; it never writes the association set. On activation the GUI renders the resolved presets and
 * (for a cleared one) dispatches the EXISTING `session.audio.play` command — there is no second playback path.
 */

function withAudio(state: CoreStateSlice, audio: AudioState): CoreStateSlice {
	return { ...state, audio };
}

export function handleAssociateSceneAudio(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(associateSceneAudioInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const previous = input.associationId ? state.audio.associations[input.associationId] : undefined;
	const associationId = previous?.id ?? input.associationId ?? env.ids();
	const result = buildAudioAssociation({
		id: associationId,
		label: input.label,
		presetKind: input.presetKind,
		targetKind: input.targetKind,
		targetId: input.targetId,
		layerId: input.layerId ?? null,
		sourceId: input.sourceId,
		assetId: input.assetId ?? null,
		createdBy: actor.id,
		createdAt: env.clock(),
		library: state.audio,
		previous,
	});

	if (!result.ok) {
		// Fail closed: a dangling source/asset, undeclared target, a map-layer association missing its layer,
		// or a local/bundled cue missing its asset is rejected — no record is written, so no cue arms invalid.
		const code =
			result.reason === 'source-not-found' || result.reason === 'asset-not-found'
				? 'audio-asset-not-found'
				: 'invalid-audio-association';
		return reject({ code, message: result.message }, state);
	}

	const association: AudioAssociation = result.association;
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: AUDIO_ASSOCIATION_ENTITY_TYPE,
		entityId: association.id,
		opType: 'audio.association.associate',
		path: `audio/associations/${association.id}`,
		// The op value carries the association DEFINITION (target/cue refs) — never asset bytes or player content.
		value: {
			associationId: association.id,
			targetKind: association.targetKind,
			targetId: association.targetId,
			layerId: association.layerId,
			sourceId: association.sourceId,
			assetId: association.assetId,
			presetKind: association.presetKind,
		},
		beforeRevision: previous?.revision ?? 0,
		afterRevision: association.revision,
	});

	return {
		status: 'accepted',
		nextState: withAudio(
			{ ...state, sync: nextLog },
			{
				...state.audio,
				associations: { ...state.audio.associations, [association.id]: association },
			},
		),
		events: [
			{
				kind: 'audio.association-changed',
				associationId: association.id,
				targetKind: association.targetKind,
				targetId: association.targetId,
				layerId: association.layerId,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

export function handleDisassociateSceneAudio(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(disassociateSceneAudioInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const previous = state.audio.associations[input.associationId];
	if (!previous) {
		return reject(
			{
				code: 'audio-association-not-found',
				message: `Audio association ${input.associationId} does not exist.`,
			},
			state,
		);
	}

	const nextAssociations = { ...state.audio.associations };
	delete nextAssociations[input.associationId];

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: AUDIO_ASSOCIATION_ENTITY_TYPE,
		entityId: input.associationId,
		opType: 'audio.association.disassociate',
		path: `audio/associations/${input.associationId}`,
		value: { associationId: input.associationId },
		beforeRevision: previous.revision,
	});

	return {
		status: 'accepted',
		nextState: withAudio(
			{ ...state, sync: nextLog },
			{ ...state.audio, associations: nextAssociations },
		),
		events: [
			{ kind: 'audio.association-removed', associationId: input.associationId, actorId: actor.id },
		],
		operationIds: [op.id],
	};
}
