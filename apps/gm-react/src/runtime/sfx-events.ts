import {
	audioSfxEventSettingsForActor,
	readRollUnderSystem,
	activeSystemPackage,
	resolveAudioAutomationForActor,
	type AudioAutomationCommandRequest,
	type AudioSfxEventKind,
	type CoreStateSlice,
	type DiceRollResult,
	type SessionDiceRoll,
	type SyncOperation,
} from '@dndtools/core';
import type { SceneRuntime } from './SceneRuntime';
import type { AudioPlaybackHandle } from './audio-playback';
import { getAssetBytes } from '../platform/storage/assetStore';

/**
 * sfx-events — RC-AUD-3.2. The bridge from a TABLE MOMENT to a one-shot SOUND EFFECT.
 *
 * The core already owns every part of this decision: `state/audio-automation.ts` holds the DM's rules and
 * the per-event toggles, and `resolveAudioAutomationForActor` resolves a fired trigger into the requested
 * audio commands plus fail-closed diagnostics. This file does the two things the core deliberately cannot:
 *
 *   1. SPOT the moment. It watches the operations each accepted dispatch appends (`runtime.onDispatched`)
 *      and recognises the five events a sound punctuates — a natural high or low on a recorded roll, a
 *      death save going either way, a map area revealed, a handout delivered. It reads them off the
 *      DURABLE records the table already sees, so a cue can never disagree with what is on screen. Crit is
 *      judged by the CORE (`readRollUnderSystem` against the active system package), so a system with no
 *      crit rule fires no cue rather than having 5e's numbers assumed for it.
 *   2. MAKE the sound. A resolved `play`/`crossfade` request becomes ONE one-shot on the engine's SFX
 *      strip (`AudioPlaybackHandle.playSfx`) — it never touches the music beds, never loops, and never
 *      becomes session state. A `stop` request is dispatched as the real `session.audio.stop` command,
 *      because that IS a durable session change and the core must own it.
 *
 * Honest by construction: every firing is recorded in a short device-local LOG with what actually
 * happened — played, turned off, or blocked with the core's own diagnostic — and the Audio screen shows
 * it. A rule whose asset is missing, unlicensed or offline reports "nothing played" instead of going
 * quiet, and no cue is ever substituted for another. The log is device-local and never durable: it is a
 * readout of what this device did, not a record the vault or a player can see.
 */

/** The most recent firings kept for the readout. Older entries fall off; nothing is persisted. */
const MAX_RECENT = 12;

/** What happened when an SFX event fired on this device. */
export type SfxFiringStatus = 'played' | 'muted' | 'blocked' | 'no-rule';

export interface SfxFiring {
	/** Monotonic per-driver id, so the list can key rows without a clock collision. */
	id: string;
	event: AudioSfxEventKind;
	status: SfxFiringStatus;
	/** The core's diagnostic for a blocked rule, else null. Never leaks player content. */
	detail: string | null;
	at: number;
}

export interface SfxEventsSnapshot {
	/** Most recent first. */
	recent: SfxFiring[];
}

export interface SfxEventsHandle {
	subscribe(listener: () => void): () => void;
	getSnapshot(): SfxEventsSnapshot;
	/** Stop watching. Used by tests; the app keeps one driver for its lifetime. */
	stop(): void;
}

const EMPTY_SNAPSHOT: SfxEventsSnapshot = { recent: [] };

const drivers = new WeakMap<SceneRuntime, SfxEventsHandle>();

/** Start (or return the already-started) SFX event driver for this runtime. Idempotent; app-lifetime. */
export function ensureSfxEvents(
	runtime: SceneRuntime,
	playback: AudioPlaybackHandle,
): SfxEventsHandle {
	let driver = drivers.get(runtime);
	if (!driver) {
		driver = createSfxEventsDriver(runtime, playback);
		drivers.set(runtime, driver);
	}
	return driver;
}

/** A fired trigger: the SFX event plus the entity it happened on (a map, a handout), when there is one. */
interface DetectedEvent {
	event: AudioSfxEventKind;
	scopeId: string | null;
}

/**
 * Read a recorded roll as the core's own `DiceRollResult` for {@link readRollUnderSystem}, which needs
 * only the terms, the total and the modifier. A legacy record with no `terms` cannot be judged (there are
 * no faces to read), so it produces no event rather than a guessed one.
 */
function rollResultOf(roll: SessionDiceRoll): DiceRollResult | null {
	if (!roll.terms || roll.terms.length === 0) return null;
	return {
		expression: roll.expression,
		seed: roll.seed ?? 0,
		terms: roll.terms,
		dice: roll.dice ?? [],
		kept: roll.kept ?? [],
		modifier: roll.modifier ?? 0,
		total: roll.total,
	} as DiceRollResult;
}

/** The SFX event a newly recorded roll is worth, judged by the ACTIVE system package. */
function eventForRoll(
	state: CoreStateSlice,
	roll: SessionDiceRoll | undefined,
): DetectedEvent | null {
	if (!roll) return null;
	const result = rollResultOf(roll);
	if (!result) return null;
	const readout = readRollUnderSystem(activeSystemPackage(state.systems), result);
	if (readout.crit === 'success') return { event: 'roll-critical-success', scopeId: null };
	if (readout.crit === 'fail') return { event: 'roll-critical-failure', scopeId: null };
	return null;
}

/**
 * The SFX event one appended operation is worth, or null. Only the five declared moments are recognised;
 * every other operation is ignored, so an ordinary edit can never make a noise.
 */
function eventForOperation(op: SyncOperation, state: CoreStateSlice): DetectedEvent | null {
	switch (op.opType) {
		case 'session.roll-dice':
			return eventForRoll(state, state.session.diceHistory.at(-1));
		case 'combat.resource.death-save': {
			// The op records the ledger delta: +1 a save made, -1 a save failed. A `reset` carries no
			// delta and is not a table moment, so it makes no sound.
			const delta = (op.value as { delta?: unknown } | undefined)?.delta;
			if (delta === 1) return { event: 'death-save-success', scopeId: op.entityId };
			if (delta === -1) return { event: 'death-save-failure', scopeId: op.entityId };
			return null;
		}
		// Two shapes of the same table moment. Taking a conceal op back off the stack uncovers ground,
		// and so does appending a `reveal` op over it (RC-MAP-2.4 — the way the fog tool's reveal mode
		// actually works). Appending a CONCEAL hides and is deliberately silent.
		case 'map.fog.remove':
			return { event: 'map-reveal', scopeId: op.entityId };
		case 'map.fog.append': {
			// The append op records the sub-kind under `mutation` (packages/core/src/commands/
			// map-annotations.ts:469), the same field name the remove op uses for its own verb.
			const mutation = (op.value as { mutation?: unknown } | undefined)?.mutation;
			return mutation === 'reveal' ? { event: 'map-reveal', scopeId: op.entityId } : null;
		}
		case 'session.deliver-handout':
			return { event: 'handout-delivery', scopeId: op.entityId };
		default:
			return null;
	}
}

/** The DM actor whose configuration the automation is resolved against, or null on a player device. */
function dmActorId(state: CoreStateSlice): string | null {
	return Object.values(state.permissions.actors).find((actor) => actor.role === 'dm')?.id ?? null;
}

function createSfxEventsDriver(
	runtime: SceneRuntime,
	playback: AudioPlaybackHandle,
): SfxEventsHandle {
	const listeners = new Set<() => void>();
	let snapshot: SfxEventsSnapshot = EMPTY_SNAPSHOT;
	let sequence = 0;
	let stopped = false;

	const notify = () => {
		for (const listener of listeners) listener();
	};

	const record = (event: AudioSfxEventKind, status: SfxFiringStatus, detail: string | null) => {
		const firing: SfxFiring = { id: `sfx-${++sequence}`, event, status, detail, at: Date.now() };
		snapshot = { recent: [firing, ...snapshot.recent].slice(0, MAX_RECENT) };
		notify();
	};

	/**
	 * Resolve the URL one request should sound from. A web stream plays its declared URL; a local or
	 * bundled cue plays the imported asset's bytes. Missing bytes return null — the honest "nothing
	 * played", never a substitute (AUDIO-010).
	 */
	const urlForRequest = async (
		request: AudioAutomationCommandRequest,
		state: CoreStateSlice,
	): Promise<string | null> => {
		if (request.assetId) {
			const blob = await getAssetBytes(request.assetId).catch(() => null);
			return blob ? URL.createObjectURL(blob) : null;
		}
		return state.audio.sources[request.sourceId]?.url ?? null;
	};

	const fire = (detected: DetectedEvent, state: CoreStateSlice) => {
		const dmId = dmActorId(state);
		if (!dmId) return;
		// A player device holds no automation config; the read model returns null and nothing sounds.
		if (!audioSfxEventSettingsForActor(state.audio, state.permissions, dmId)) return;

		const resolution = resolveAudioAutomationForActor(state.audio, state.permissions, dmId, {
			kind: detected.event,
			scopeId: detected.scopeId,
			online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
			// The device-byte check happens per request below; the resolver's availability inputs
			// describe an imported asset, which is the only kind an automation cue can name.
			assetLocallyAvailable: true,
			assetCached: false,
			cacheEvicted: false,
		});
		if (!resolution) return;

		if (resolution.outcomes.length === 0) {
			record(detected.event, 'no-rule', null);
			return;
		}
		for (const outcome of resolution.outcomes) {
			if (outcome.status === 'muted') {
				record(detected.event, 'muted', null);
				continue;
			}
			if (outcome.status === 'blocked') {
				record(detected.event, 'blocked', outcome.message);
				continue;
			}
			const request = outcome.request;
			if (request.action === 'stop') {
				// A stop IS a durable session change, so it goes back through the core as a real command.
				void runtime.dispatch({ type: 'session.audio.stop', actorId: dmId, payload: {} });
				record(detected.event, 'played', null);
				continue;
			}
			void urlForRequest(request, state).then((url) => {
				if (stopped) return;
				if (!url) {
					record(detected.event, 'blocked', 'The cue has no sound on this device.');
					return;
				}
				playback.playSfx(url);
				record(detected.event, 'played', null);
			});
		}
	};

	const unsubscribe = runtime.onDispatched((operations, nextState) => {
		if (stopped) return;
		for (const op of operations) {
			const detected = eventForOperation(op, nextState);
			if (detected) fire(detected, nextState);
		}
	});

	return {
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getSnapshot: () => snapshot,
		stop() {
			stopped = true;
			unsubscribe();
			listeners.clear();
		},
	};
}
