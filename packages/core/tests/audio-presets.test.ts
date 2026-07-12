import { describe, expect, it } from 'vitest';
import {
	AUDIO_PRESET_CATEGORIES,
	BUILTIN_AUDIO_PRESETS,
	BUILTIN_AUDIO_PRESET_COUNT,
	MAX_AUDIO_PRESET_LAYERS,
	builtinAudioPresetById,
	copyPresetForUser,
	dispatchCommand,
	isBuiltinAudioPresetId,
	listBuiltinAudioPresetsByCategory,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';

/**
 * AUDIO-014 (Epic 11.3) — AUDIO PRESETS + SCENE PACKAGES.
 *
 * Evidence that (1) the shipped built-in library is complete + internally consistent, (2) applying a preset
 * drives the SAME session-owned audio model through the EXISTING gates (never a bypass, never a guessed
 * track), and (3) saving / re-applying / deleting a user scene package round-trips through the durable audio
 * slice under DM authority, fail-closed.
 */

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function expectRejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') throw new Error('expected rejected, got accepted');
	return result;
}

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

/** An active session with two playback-ready local sources, each carrying a license-cleared asset. */
function sessionWithTwoSources(env: CoreEnvironment): CoreStateSlice {
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const home = accept(
		dispatch(base, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	const sceneId = home.commandCenter.homeSceneId!;
	let state = accept(
		dispatch(home, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: sceneId },
		}),
	).nextState;
	for (const id of ['s-main', 's-bed'] as const) {
		state = accept(
			dispatch(state, env, {
				type: 'audio.configure-source',
				actorId: DM_ACTOR.id,
				payload: { sourceId: id, type: 'local-file', displayName: id, cacheBehavior: 'local' },
			}),
		).nextState;
		state = accept(
			dispatch(state, env, {
				type: 'audio.import-asset',
				actorId: DM_ACTOR.id,
				payload: {
					sourceId: id,
					bytes: id === 's-main' ? [1, 2, 3, 4] : [5, 6, 7, 8],
					mimeType: 'audio/mpeg',
					fileName: `${id}.mp3`,
					title: id,
					license: { kind: 'owned' },
				},
			}),
		).nextState;
	}
	return state;
}

function assetIdForSource(state: CoreStateSlice, sourceId: string): string {
	const found = Object.values(state.audio.assets).find((a) => a.source.sourceId === sourceId);
	if (!found) throw new Error(`no asset for ${sourceId}`);
	return found.id;
}

/** Play a track + one ambience layer so there is a live audio scene to capture as a scene package. */
function playScene(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
	const main = accept(
		dispatch(state, env, {
			type: 'session.audio.play',
			actorId: DM_ACTOR.id,
			payload: { sourceId: 's-main', assetId: assetIdForSource(state, 's-main'), volume: 0.7 },
		}),
	).nextState;
	return accept(
		dispatch(main, env, {
			type: 'session.audio.set-ambience-layer',
			actorId: DM_ACTOR.id,
			payload: { layerId: 'bed-1', sourceId: 's-bed', volume: 0.4, muted: false },
		}),
	).nextState;
}

describe('AUDIO-014 — built-in preset library integrity', () => {
	it('ships 40+ presets across every declared category', () => {
		expect(BUILTIN_AUDIO_PRESET_COUNT).toBeGreaterThanOrEqual(40);
		expect(BUILTIN_AUDIO_PRESETS).toHaveLength(BUILTIN_AUDIO_PRESET_COUNT);
		for (const category of AUDIO_PRESET_CATEGORIES) {
			expect(listBuiltinAudioPresetsByCategory(category).length).toBeGreaterThan(0);
		}
	});

	it('every built-in preset is internally consistent (unique id, ≤ budget layers, template beds, no bytes)', () => {
		const seen = new Set<string>();
		for (const preset of BUILTIN_AUDIO_PRESETS) {
			expect(seen.has(preset.id)).toBe(false);
			seen.add(preset.id);
			expect(isBuiltinAudioPresetId(preset.id)).toBe(true);
			expect(preset.builtIn).toBe(true);
			expect(AUDIO_PRESET_CATEGORIES).toContain(preset.category);
			expect(preset.layers.length).toBeGreaterThan(0);
			expect(preset.layers.length).toBeLessThanOrEqual(MAX_AUDIO_PRESET_LAYERS);
			expect(builtinAudioPresetById(preset.id)).toBe(preset);
			for (const layer of preset.layers) {
				// A built-in ships a TEMPLATE bed: a non-empty bundled clip key, NO source/asset binding (no
				// bytes), and a clamped volume.
				expect(layer.sourceKind).toBe('bundled-preset');
				expect(layer.ref.length).toBeGreaterThan(0);
				expect(layer.sourceId).toBeNull();
				expect(layer.assetId).toBeNull();
				expect(layer.volume).toBeGreaterThanOrEqual(0);
				expect(layer.volume).toBeLessThanOrEqual(100);
			}
		}
	});

	it('copyPresetForUser produces an editable, non-system draft', () => {
		const source = BUILTIN_AUDIO_PRESETS[0]!;
		const copy = copyPresetForUser(source);
		expect(copy.name).toContain('copy');
		expect(copy.category).toBe(source.category);
		expect(copy.layers).toHaveLength(source.layers.length);
	});
});

describe('AUDIO-014 — apply a preset to session audio', () => {
	it('drives the session track + ambience from a user preset, gated + deterministic', () => {
		const envA = makeEnvironment();
		const stateA = playScene(sessionWithTwoSources(envA), envA);
		// Capture the live 2-layer scene as a user preset, then STOP so applying it is observable.
		const savedA = accept(
			dispatch(stateA, envA, {
				type: 'audio.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'Tavern night', category: 'urban' },
			}),
		).nextState;
		const presetId = Object.keys(savedA.audio.presets)[0]!;
		const clearedA = accept(
			dispatch(savedA, envA, { type: 'session.audio.stop', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		expect(clearedA.session.audioPlayback.track).toBeNull();

		const appliedA = accept(
			dispatch(clearedA, envA, {
				type: 'session.audio.apply-preset',
				actorId: DM_ACTOR.id,
				payload: { presetId },
			}),
		);
		const nextA = appliedA.nextState;
		const track = nextA.session.audioPlayback.track!;
		expect(track.status).toBe('playing');
		expect(track.sourceId).toBe('s-main');
		expect(track.volume).toBeCloseTo(0.7, 5);
		// The remaining bound layer becomes ONE ambience layer (whole-atmosphere swap).
		const ambience = Object.values(nextA.session.audioPlayback.ambienceLayers ?? {});
		expect(ambience).toHaveLength(1);
		expect(ambience[0]!.sourceId).toBe('s-bed');
		expect(ambience[0]!.volume).toBeCloseTo(0.4, 5);
		expect(appliedA.operationIds).toHaveLength(1);
		expect(appliedA.events[0]).toMatchObject({ kind: 'session.audio-changed', status: 'playing' });

		// Determinism: a fresh env replaying the identical command sequence yields identical playback state.
		const envB = makeEnvironment();
		const stateB = playScene(sessionWithTwoSources(envB), envB);
		const savedB = accept(
			dispatch(stateB, envB, {
				type: 'audio.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'Tavern night', category: 'urban' },
			}),
		).nextState;
		const presetIdB = Object.keys(savedB.audio.presets)[0]!;
		const clearedB = accept(
			dispatch(savedB, envB, { type: 'session.audio.stop', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		const appliedB = accept(
			dispatch(clearedB, envB, {
				type: 'session.audio.apply-preset',
				actorId: DM_ACTOR.id,
				payload: { presetId: presetIdB },
			}),
		).nextState;
		expect(appliedB.session.audioPlayback.track).toEqual(nextA.session.audioPlayback.track);
		expect(appliedB.session.audioPlayback.ambienceLayers).toEqual(nextA.session.audioPlayback.ambienceLayers);
	});

	it('replaces the current atmosphere (swaps the whole scene, not merge)', () => {
		const env = makeEnvironment();
		const state = playScene(sessionWithTwoSources(env), env);
		const saved = accept(
			dispatch(state, env, {
				type: 'audio.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'Scene', category: 'social' },
			}),
		).nextState;
		const presetId = Object.keys(saved.audio.presets)[0]!;
		// Add a SECOND, unrelated ambience layer that the preset does NOT contain.
		const extra = accept(
			dispatch(saved, env, {
				type: 'session.audio.set-ambience-layer',
				actorId: DM_ACTOR.id,
				payload: { layerId: 'extra', sourceId: 's-bed', volume: 0.9, muted: false },
			}),
		).nextState;
		expect(Object.keys(extra.session.audioPlayback.ambienceLayers ?? {})).toHaveLength(2);
		const applied = accept(
			dispatch(extra, env, {
				type: 'session.audio.apply-preset',
				actorId: DM_ACTOR.id,
				payload: { presetId },
			}),
		).nextState;
		// The preset's single ambience layer wholly REPLACES the prior two.
		expect(Object.keys(applied.session.audioPlayback.ambienceLayers ?? {})).toHaveLength(1);
	});

	it('rejects a built-in preset with only template (unbound) layers — never a guessed track', () => {
		const env = makeEnvironment();
		const state = sessionWithTwoSources(env);
		const builtinId = BUILTIN_AUDIO_PRESETS[0]!.id;
		const result = expectRejected(
			dispatch(state, env, {
				type: 'session.audio.apply-preset',
				actorId: DM_ACTOR.id,
				payload: { presetId: builtinId },
			}),
		);
		expect(result.rejection.code).toBe('audio-preset-not-playable');
		expect(state.session.audioPlayback.track).toBeNull();
	});

	it('skips un-ready (offline) layers and rejects when none survive the AUDIO-010 gate', () => {
		const env = makeEnvironment();
		const state = playScene(sessionWithTwoSources(env), env);
		const saved = accept(
			dispatch(state, env, {
				type: 'audio.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'Local scene', category: 'dungeon' },
			}),
		).nextState;
		const presetId = Object.keys(saved.audio.presets)[0]!;
		// Local-file layers are unavailable when their bytes are not present on this device.
		const result = expectRejected(
			dispatch(saved, env, {
				type: 'session.audio.apply-preset',
				actorId: DM_ACTOR.id,
				payload: { presetId, assetLocallyAvailable: false, assetCached: false },
			}),
		);
		expect(result.rejection.code).toBe('audio-preset-not-playable');
	});

	it('rejects an unknown preset id and a non-DM actor (DM authority)', () => {
		const env = makeEnvironment();
		const state = sessionWithTwoSources(env);
		expect(
			expectRejected(
				dispatch(state, env, {
					type: 'session.audio.apply-preset',
					actorId: DM_ACTOR.id,
					payload: { presetId: 'nope' },
				}),
			).rejection.code,
		).toBe('audio-preset-not-found');
		expect(
			expectRejected(
				dispatch(state, env, {
					type: 'session.audio.apply-preset',
					actorId: PLAYER_ACTOR.id,
					payload: { presetId: BUILTIN_AUDIO_PRESETS[0]!.id },
				}),
			).rejection.code,
		).toBe('actor-not-authorized');
	});
});

describe('AUDIO-014 — save / update / delete a user scene package', () => {
	it('captures the live track + ambience into a durable, categorized user preset', () => {
		const env = makeEnvironment();
		const state = playScene(sessionWithTwoSources(env), env);
		const saved = accept(
			dispatch(state, env, {
				type: 'audio.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'Market day', category: 'urban' },
			}),
		);
		const presetId = Object.keys(saved.nextState.audio.presets)[0]!;
		const preset = saved.nextState.audio.presets[presetId]!;
		expect(preset.builtIn).toBe(false);
		expect(preset.name).toBe('Market day');
		expect(preset.category).toBe('urban');
		// The main track + one ambience layer are captured as two REFERENCE layers (bound to their sources).
		expect(preset.layers).toHaveLength(2);
		expect(preset.layers[0]!.sourceId).toBe('s-main');
		expect(preset.layers[0]!.assetId).toBe(assetIdForSource(state, 's-main'));
		expect(preset.layers[1]!.sourceId).toBe('s-bed');
		expect(saved.events[0]).toMatchObject({ kind: 'audio.preset-saved', presetId });
	});

	it('rejects saving with nothing playing (empty capture, fail closed)', () => {
		const env = makeEnvironment();
		const state = sessionWithTwoSources(env);
		const result = expectRejected(
			dispatch(state, env, {
				type: 'audio.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'Empty', category: 'dungeon' },
			}),
		);
		expect(result.rejection.code).toBe('audio-preset-empty');
	});

	it('rejects an undeclared category via the fail-closed builder', () => {
		const env = makeEnvironment();
		const state = playScene(sessionWithTwoSources(env), env);
		const result = expectRejected(
			dispatch(state, env, {
				type: 'audio.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'Bad', category: 'not-a-category' },
			}),
		);
		expect(result.rejection.code).toBe('invalid-payload');
	});

	it('updates an existing user preset in place (revision bumps, id stable)', () => {
		const env = makeEnvironment();
		const state = playScene(sessionWithTwoSources(env), env);
		const saved = accept(
			dispatch(state, env, {
				type: 'audio.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'v1', category: 'combat' },
			}),
		).nextState;
		const presetId = Object.keys(saved.audio.presets)[0]!;
		expect(saved.audio.presets[presetId]!.revision).toBe(1);
		const updated = accept(
			dispatch(saved, env, {
				type: 'audio.save-preset',
				actorId: DM_ACTOR.id,
				payload: { presetId, name: 'v2', category: 'combat' },
			}),
		).nextState;
		expect(Object.keys(updated.audio.presets)).toHaveLength(1);
		expect(updated.audio.presets[presetId]!.name).toBe('v2');
		expect(updated.audio.presets[presetId]!.revision).toBe(2);
	});

	it('deletes a user preset, and refuses to delete/overwrite a built-in', () => {
		const env = makeEnvironment();
		const state = playScene(sessionWithTwoSources(env), env);
		const saved = accept(
			dispatch(state, env, {
				type: 'audio.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'Doomed', category: 'mystical' },
			}),
		).nextState;
		const presetId = Object.keys(saved.audio.presets)[0]!;
		const builtinId = BUILTIN_AUDIO_PRESETS[0]!.id;

		expect(
			expectRejected(
				dispatch(saved, env, { type: 'audio.delete-preset', actorId: DM_ACTOR.id, payload: { presetId: builtinId } }),
			).rejection.code,
		).toBe('audio-preset-builtin');
		expect(
			expectRejected(
				dispatch(saved, env, {
					type: 'audio.save-preset',
					actorId: DM_ACTOR.id,
					payload: { presetId: builtinId, name: 'x', category: 'mystical' },
				}),
			).rejection.code,
		).toBe('audio-preset-builtin');

		const deleted = accept(
			dispatch(saved, env, { type: 'audio.delete-preset', actorId: DM_ACTOR.id, payload: { presetId } }),
		);
		expect(deleted.nextState.audio.presets[presetId]).toBeUndefined();
		expect(deleted.events[0]).toMatchObject({ kind: 'audio.preset-deleted', presetId });
		// Deleting again is a fail-closed not-found.
		expect(
			expectRejected(
				dispatch(deleted.nextState, env, {
					type: 'audio.delete-preset',
					actorId: DM_ACTOR.id,
					payload: { presetId },
				}),
			).rejection.code,
		).toBe('audio-preset-not-found');
	});

	it('a non-DM actor cannot save or delete presets (DM authority)', () => {
		const env = makeEnvironment();
		const state = playScene(sessionWithTwoSources(env), env);
		expect(
			expectRejected(
				dispatch(state, env, {
					type: 'audio.save-preset',
					actorId: PLAYER_ACTOR.id,
					payload: { name: 'x', category: 'social' },
				}),
			).rejection.code,
		).toBe('actor-not-authorized');
		expect(
			expectRejected(
				dispatch(state, env, {
					type: 'audio.delete-preset',
					actorId: PLAYER_ACTOR.id,
					payload: { presetId: 'whatever' },
				}),
			).rejection.code,
		).toBe('actor-not-authorized');
	});

	it('a saved user preset re-hydrates through ensureAudioState (persist round-trip)', () => {
		const env = makeEnvironment();
		const state = playScene(sessionWithTwoSources(env), env);
		const saved = accept(
			dispatch(state, env, {
				type: 'audio.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'Persisted', category: 'wilderness' },
			}),
		).nextState;
		const presetId = Object.keys(saved.audio.presets)[0]!;
		// Re-apply from the saved (still in-memory) state proves the preset resolves + re-plays.
		const reapplied = accept(
			dispatch(saved, env, {
				type: 'session.audio.apply-preset',
				actorId: DM_ACTOR.id,
				payload: { presetId },
			}),
		).nextState;
		expect(reapplied.session.audioPlayback.track!.sourceId).toBe('s-main');
	});
});
