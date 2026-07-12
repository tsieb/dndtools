import {
	applyAudioPresetInputSchema,
	deleteAudioPresetInputSchema,
	saveAudioPresetInputSchema,
} from '../schemas/commands';
import { assetNeedsLicenseReview } from '../state/audio-asset';
import {
	classifyAudioSource,
	resolveAudioPlaybackAvailability,
	type AudioSource,
} from '../state/audio-source';
import {
	AUDIO_PRESET_ENTITY_TYPE,
	MAX_AUDIO_PRESET_LAYERS,
	buildAudioPreset,
	type AudioPreset,
	type BuildAudioPresetLayerInput,
} from '../state/audio-preset';
import { builtinAudioPresetById, isBuiltinAudioPresetId } from '../state/audio-preset-library';
import { audioPresetById, type AudioState } from '../state/audio-state';
import {
	SESSION_AUDIO_ENTITY_TYPE,
	ambienceLayersOf,
	type SessionAmbienceLayer,
	type SessionAudioState,
	type SessionAudioTrack,
} from '../state/session-audio';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

/**
 * AUDIO-014 (Epic 11.3 — AUDIO PRESETS + SCENE PACKAGES) — the DM applies a categorized atmosphere PRESET
 * to the session's audio in ONE action, and saves the CURRENT audio setup as a reusable USER preset / scene
 * package (then re-applies or deletes it). This composes the EXISTING models rather than adding a second
 * playback path (Architecture Contract 1 / 2 / 4), fail-closed:
 *
 *   - APPLY drives the SAME session-owned audio model as `session.audio.play` / `set-ambience-layer` (the
 *     primary track + the ambience-layer bag), through the EXACT SAME AUDIO-009 (declared/supported/
 *     playback-enabled source), AUDIO-004 (asset license cleared), and AUDIO-010 (offline/cache available)
 *     gates. A preset LAYER only becomes audible when it is BOUND to a source that passes every gate — an
 *     unbound (template) or un-ready layer is honestly skipped, never guessed. Applying a preset with no
 *     ready layer is rejected (no half-applied atmosphere).
 *   - SAVE captures the live track + ambience into a durable, categorized user preset via the fail-closed
 *     `buildAudioPreset` builder (references only — never asset bytes, Contract 2). DELETE removes a user
 *     preset; a BUILT-IN preset id is refused (shipped code, non-deletable — copy to customize).
 *   - DM-only authority throughout (audio config is dm-only; the player surface is a read-only view). Every
 *     durable mutation appends a sync op (actor + entity — the audit), exactly like the sibling audio
 *     commands. PURE + DETERMINISTIC: identical command sequences produce identical state (the env clock/ids
 *     are the only non-determinism, injected for tests).
 */

const SESSION_ENTITY_ID = 'session-default';

function withSessionAudio(state: CoreStateSlice, audioPlayback: SessionAudioState): CoreStateSlice {
	return { ...state, session: { ...state.session, audioPlayback } };
}

function withAudioState(state: CoreStateSlice, audio: AudioState): CoreStateSlice {
	return { ...state, audio };
}

/** One preset layer resolved to a READY, GATE-PASSING session source. Pure intermediate. */
interface PlayableLayer {
	sourceId: string;
	assetId: string | null;
	/** The session volume (0..1), converted from the preset layer's 0..100 volume. */
	volume: number;
}

/** Device inputs for the AUDIO-010 availability gate (default online + locally available). */
interface DeviceInputs {
	assetLocallyAvailable: boolean;
	assetCached: boolean;
	cacheEvicted: boolean;
	online: boolean;
}

const layerVolume01 = (volume: number): number => Math.min(1, Math.max(0, volume / 100));

/**
 * Resolve ONE preset layer to a PRIMARY-TRACK-capable session source, or null. Runs the EXACT gates
 * `session.audio.play` runs (AUDIO-009 source, AUDIO-004 license, AUDIO-010 availability): the primary track
 * must reference a ready, licensed, available source with a specific asset (or a web stream). A layer with no
 * `sourceId` binding (a template layer) resolves to null (needs binding — never guessed).
 */
function resolveTrackLayer(
	audio: AudioState,
	layer: AudioPreset['layers'][number],
	device: DeviceInputs,
): PlayableLayer | null {
	if (layer.sourceId === null) return null;
	const source = audio.sources[layer.sourceId];
	if (!source) return null;

	// AUDIO-009 — the source must be a declared, supported, playback-enabled type.
	const classification = classifyAudioSource(source);
	if (!classification.supported || !classification.playbackEnabled) return null;

	// A local-file / bundled-preset track plays a SPECIFIC local asset; a web-stream track may omit it.
	const assetId = layer.assetId ?? null;
	if (assetId === null && source.type !== 'web-stream') return null;

	// AUDIO-004 — a referenced local asset must exist and its license must be cleared (no silent bypass).
	if (assetId !== null) {
		const asset = audio.assets[assetId];
		if (!asset || assetNeedsLicenseReview(asset)) return null;
	}

	// AUDIO-010 — the offline/cache availability must resolve `available` for the device inputs.
	const availability = resolveAudioPlaybackAvailability({
		source,
		assetLocallyAvailable: device.assetLocallyAvailable,
		assetCached: device.assetCached,
		cacheEvicted: device.cacheEvicted,
		online: device.online,
	});
	if (availability !== 'available') return null;

	return { sourceId: source.id, assetId, volume: layerVolume01(layer.volume) };
}

/**
 * Resolve ONE preset layer to an AMBIENCE bed, or null. Ambience uses the SAME lighter gate as
 * `session.audio.set-ambience-layer` — the source must exist and be a declared, supported, playback-enabled
 * type — WITHOUT the primary track's per-asset / availability requirements (an ambience bed references a
 * source, not a specific asset). A template (unbound) layer resolves to null (never guessed).
 */
function resolveAmbienceLayer(
	audio: AudioState,
	layer: AudioPreset['layers'][number],
): { sourceId: string; volume: number } | null {
	if (layer.sourceId === null) return null;
	const source = audio.sources[layer.sourceId];
	if (!source) return null;
	const classification = classifyAudioSource(source);
	if (!classification.supported || !classification.playbackEnabled) return null;
	return { sourceId: source.id, volume: layerVolume01(layer.volume) };
}

/**
 * AUDIO-014 — APPLY a preset / scene package to the session audio (DM-only). The preset id resolves to a
 * built-in library preset OR a user preset; each of its layers is resolved through the full playback gate.
 * The FIRST ready layer becomes the primary track; the rest become ambience layers (REPLACING the current
 * ambience — applying a preset is a whole-atmosphere swap). Fail closed: rejected when the preset does not
 * exist, or when NO layer is bound to a ready source (nothing audible to apply — never a guessed track).
 */
export function handleApplyAudioPreset(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(applyAudioPresetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const preset = builtinAudioPresetById(input.presetId) ?? audioPresetById(state.audio, input.presetId);
	if (!preset) {
		return reject(
			{ code: 'audio-preset-not-found', message: `Audio preset ${input.presetId} does not exist.` },
			state,
		);
	}

	const device: DeviceInputs = {
		assetLocallyAvailable: input.assetLocallyAvailable ?? true,
		assetCached: input.assetCached ?? false,
		cacheEvicted: input.cacheEvicted ?? false,
		online: input.online ?? true,
	};
	// The FIRST layer that passes the full primary-track gate becomes the track; the atmosphere needs a
	// primary track (never a guessed / silent track). Fail closed when none qualifies.
	let primary: PlayableLayer | null = null;
	let primaryIndex = -1;
	for (let i = 0; i < preset.layers.length; i += 1) {
		const resolved = resolveTrackLayer(state.audio, preset.layers[i]!, device);
		if (resolved) {
			primary = resolved;
			primaryIndex = i;
			break;
		}
	}
	if (!primary) {
		return reject(
			{
				code: 'audio-preset-not-playable',
				message: `Preset “${preset.name}” has no layers bound to a ready audio source. Bind its layers to configured sources first.`,
			},
			state,
		);
	}
	// Every OTHER bound, playback-ready layer becomes an ambience bed (track + beds ≤ the engine budget).
	const rest: Array<{ sourceId: string; volume: number }> = [];
	for (let i = 0; i < preset.layers.length && rest.length < MAX_AUDIO_PRESET_LAYERS - 1; i += 1) {
		if (i === primaryIndex) continue;
		const resolved = resolveAmbienceLayer(state.audio, preset.layers[i]!);
		if (resolved) rest.push(resolved);
	}

	const now = env.clock();
	const previousTrack = state.session.audioPlayback.track;
	const track: SessionAudioTrack = {
		sourceId: primary.sourceId,
		assetId: primary.assetId,
		status: 'playing',
		volume: primary.volume,
		crossfadeSeconds: 0,
		previousSourceId: null,
		createdBy: actor.id,
		startedAt: now,
		updatedAt: now,
		revision: (previousTrack?.revision ?? 0) + 1,
	};
	// The ambience bag is REPLACED (not merged): applying a preset swaps the whole atmosphere. Deterministic
	// layer ids are minted from the env id source so an identical command sequence yields identical state.
	const ambienceLayers: Record<string, SessionAmbienceLayer> = {};
	for (const layer of rest) {
		ambienceLayers[env.ids()] = { sourceId: layer.sourceId, volume: layer.volume, muted: false };
	}
	const nextAudio: SessionAudioState = {
		...state.session.audioPlayback,
		track,
		ambienceLayers,
		// The whole scene changed; the prior track's per-player delivery queue is stale (mirrors stop).
		deliveries: {},
	};

	const usedSourceIds = [primary.sourceId, ...rest.map((l) => l.sourceId)];
	const dependencies = Array.from(new Set(usedSourceIds)).map((sourceId) => {
		const source = state.audio.sources[sourceId]!;
		return `audio-source:${source.id}@${source.revision}`;
	});
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SESSION_AUDIO_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'session.audio.apply-preset',
		path: 'audioPlayback',
		// The op carries the applied preset id + resulting track REFERENCE (source/asset id) + ambience
		// count — never asset bytes (Contract 2).
		value: {
			presetId: preset.id,
			sourceId: track.sourceId,
			assetId: track.assetId,
			ambienceLayers: rest.length,
		},
		beforeRevision: previousTrack?.revision ?? 0,
		afterRevision: track.revision,
		dependencies,
	});

	return {
		status: 'accepted',
		nextState: withSessionAudio({ ...state, sync: nextLog }, nextAudio),
		events: [
			{
				kind: 'session.audio-changed',
				actorId: actor.id,
				status: track.status,
				sourceId: track.sourceId,
				assetId: track.assetId,
				crossfade: false,
			},
		],
		operationIds: [op.id],
	};
}

/** Capture ONE live session source (track or ambience) into a preset build-layer input, or null when the
 *  source is no longer configured (a stale reference is dropped rather than saved as an unplayable layer). */
function captureLayer(
	source: AudioSource | undefined,
	assetId: string | null,
	volume: number,
	label: string,
): BuildAudioPresetLayerInput | null {
	if (!source) return null;
	// A web-stream layer must reference a safe URL (the builder re-validates the scheme); a local/bundled
	// layer references its content-addressed asset id (or the source id when it is a pure-source track).
	const ref = source.type === 'web-stream' ? (source.url ?? '') : (assetId ?? source.id);
	return {
		label,
		sourceKind: source.type,
		ref: ref || source.id,
		sourceId: source.id,
		assetId,
		loop: true,
		volume: Math.round(Math.min(1, Math.max(0, volume)) * 100),
	};
}

/**
 * AUDIO-014 — SAVE the CURRENT session audio (primary track + ambience layers) as a named, categorized USER
 * preset / scene package (DM-only). `presetId` present UPDATES an existing user preset (a built-in id is
 * refused); absent creates a new one (`env.ids()`). The layers are captured as REFERENCES via the fail-closed
 * `buildAudioPreset` builder (never asset bytes). Fail closed: rejected when nothing is playing (empty
 * capture), when a built-in id is targeted, or when the build rejects (blank name, undeclared category).
 */
export function handleSaveAudioPreset(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(saveAudioPresetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	if (input.presetId !== undefined && isBuiltinAudioPresetId(input.presetId)) {
		return reject(
			{
				code: 'audio-preset-builtin',
				message: 'A built-in preset cannot be overwritten. Save it under a new name to customize it.',
			},
			state,
		);
	}

	const layers: BuildAudioPresetLayerInput[] = [];
	const track = state.session.audioPlayback.track;
	if (track) {
		const captured = captureLayer(state.audio.sources[track.sourceId], track.assetId, track.volume, 'Main track');
		if (captured) layers.push(captured);
	}
	const ambience = ambienceLayersOf(state.session.audioPlayback);
	for (const layerId of Object.keys(ambience).sort()) {
		if (layers.length >= MAX_AUDIO_PRESET_LAYERS) break;
		const layer = ambience[layerId]!;
		const captured = captureLayer(state.audio.sources[layer.sourceId], null, layer.volume, 'Ambience');
		if (captured) layers.push(captured);
	}
	if (layers.length === 0) {
		return reject(
			{
				code: 'audio-preset-empty',
				message: 'Start a track or add an ambience layer before saving it as a preset.',
			},
			state,
		);
	}

	const previous = input.presetId !== undefined ? audioPresetById(state.audio, input.presetId) : undefined;
	const built = buildAudioPreset({
		id: input.presetId ?? env.ids(),
		name: input.name,
		category: input.category,
		layers,
		createdBy: actor.id,
		createdAt: env.clock(),
		previous,
	});
	if (!built.ok) {
		return reject({ code: 'invalid-payload', message: built.message }, state);
	}
	const preset = built.preset;
	const nextAudio: AudioState = {
		...state.audio,
		presets: { ...state.audio.presets, [preset.id]: preset },
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: AUDIO_PRESET_ENTITY_TYPE,
		entityId: preset.id,
		opType: 'audio.save-preset',
		path: `presets/${preset.id}`,
		value: { id: preset.id, name: preset.name, category: preset.category, layers: preset.layers.length },
		beforeRevision: previous?.revision ?? 0,
		afterRevision: preset.revision,
	});

	return {
		status: 'accepted',
		nextState: withAudioState({ ...state, sync: nextLog }, nextAudio),
		events: [{ kind: 'audio.preset-saved', presetId: preset.id, actorId: actor.id }],
		operationIds: [op.id],
	};
}

/**
 * AUDIO-014 — DELETE a USER audio preset / scene package by id (DM-only). Fail closed: a BUILT-IN preset id
 * is refused (shipped code, non-deletable — copy to customize), and an unknown user preset id is rejected
 * (nothing to remove — mirrors `session.audio.stop` on an idle session).
 */
export function handleDeleteAudioPreset(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(deleteAudioPresetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const { presetId } = parsed.data;

	if (isBuiltinAudioPresetId(presetId)) {
		return reject(
			{ code: 'audio-preset-builtin', message: 'Built-in presets cannot be deleted. Copy one to customize it.' },
			state,
		);
	}
	const existing = audioPresetById(state.audio, presetId);
	if (!existing) {
		return reject(
			{ code: 'audio-preset-not-found', message: `Audio preset ${presetId} does not exist.` },
			state,
		);
	}

	const nextPresets = { ...state.audio.presets };
	delete nextPresets[presetId];
	const nextAudio: AudioState = { ...state.audio, presets: nextPresets };

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: AUDIO_PRESET_ENTITY_TYPE,
		entityId: presetId,
		opType: 'audio.delete-preset',
		path: `presets/${presetId}`,
		value: { id: presetId },
		beforeRevision: existing.revision,
		afterRevision: existing.revision + 1,
	});

	return {
		status: 'accepted',
		nextState: withAudioState({ ...state, sync: nextLog }, nextAudio),
		events: [{ kind: 'audio.preset-deleted', presetId, actorId: actor.id }],
		operationIds: [op.id],
	};
}
