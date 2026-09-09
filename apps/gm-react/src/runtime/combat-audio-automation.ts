import {
	resolveAudioAutomationForActor,
	type CoreStateSlice,
	type SyncOperation,
} from '@dndtools/core';
import type { SceneRuntime } from './SceneRuntime';
import { hasAssetBytes } from '../platform/storage/assetStore';
import { isOnline } from '../platform/preferences';

/**
 * RC-AUD-3.1 — COMBAT MUSIC AUTOMATION: fires the DM's `combat-start`/`combat-end` automation rules
 * (`state/audio-automation.ts`) the instant combat actually starts or ends, dispatching the resolved
 * request through the SAME durable session-audio commands the DM's own "Run now" button and every other
 * device's audio sync already use (`session.audio.play` / `session.audio.stop`). No new playback surface
 * — this only adds the auto-fire that until now required a manual click after every fight.
 *
 * Modeled on `sfx-events.ts`'s driver (watch `runtime.onDispatched`, recognise the durable op, resolve
 * through the core, dispatch the result) but distinct in one respect: a combat-music request is a
 * DURABLE session change, not a one-shot local SFX, so it goes back through the real command instead of
 * the SFX strip.
 *
 * Honest by construction (guardrail 9): the requested asset's LOCAL bytes are checked for real before the
 * play command is dispatched, so a track missing on this device fails the command's own AUDIO-010 gate
 * exactly as a manual play would — never a fake "playing" and never a substituted track. The rule list's
 * live outcome badge (Audio › Automation) already reports the same would-be block reactively.
 */

const drivers = new WeakMap<SceneRuntime, () => void>();

/** Start (or return the already-started) combat-music automation driver for this runtime. App-lifetime. */
export function ensureCombatAudioAutomation(runtime: SceneRuntime): () => void {
	let stop = drivers.get(runtime);
	if (!stop) {
		stop = createCombatAudioAutomationDriver(runtime);
		drivers.set(runtime, stop);
	}
	return stop;
}

function dmActorId(state: CoreStateSlice): string | null {
	return Object.values(state.permissions.actors).find((actor) => actor.role === 'dm')?.id ?? null;
}

/** The encounter id a fired `combat-start`/`combat-end` op is scoped to, or null (matches any rule). */
function encounterScopeOf(
	kind: 'combat-start' | 'combat-end',
	op: SyncOperation,
	state: CoreStateSlice,
): string | null {
	if (kind === 'combat-start') {
		const value = op.value as { encounterId?: unknown } | undefined;
		return typeof value?.encounterId === 'string' ? value.encounterId : null;
	}
	// `combat.end`'s op value carries no encounter id; the just-ended combat's is still on session state.
	return state.session.combat.encounterId ?? null;
}

/** The `combat-start`/`combat-end` trigger one appended operation is worth, or null for everything else. */
function triggerForOperation(op: SyncOperation): 'combat-start' | 'combat-end' | null {
	if (op.opType === 'combat.start') return 'combat-start';
	if (op.opType === 'combat.end') return 'combat-end';
	return null;
}

function createCombatAudioAutomationDriver(runtime: SceneRuntime): () => void {
	let stopped = false;

	const fire = async (
		kind: 'combat-start' | 'combat-end',
		scopeId: string | null,
		state: CoreStateSlice,
	) => {
		const dmId = dmActorId(state);
		if (!dmId) return;
		const resolution = resolveAudioAutomationForActor(state.audio, state.permissions, dmId, {
			kind,
			scopeId,
			online: isOnline(),
			assetLocallyAvailable: true,
			assetCached: true,
			cacheEvicted: false,
		});
		if (!resolution) return;

		for (const outcome of resolution.outcomes) {
			if (outcome.status !== 'requested') continue;
			if (stopped) return;
			const request = outcome.request;
			if (request.action === 'stop') {
				void runtime.dispatch({ type: 'session.audio.stop', actorId: dmId, payload: {} });
				continue;
			}
			// The REAL local byte presence, not the best-case assumption the resolver above used — the
			// command's own AUDIO-010 gate honestly rejects an unavailable track (no substitution).
			const bytesReady = request.assetId ? await hasAssetBytes(request.assetId) : true;
			if (stopped) return;
			void runtime.dispatch({
				type: 'session.audio.play',
				actorId: dmId,
				payload: {
					sourceId: request.sourceId,
					assetId: request.assetId,
					crossfadeSeconds: request.action === 'crossfade' ? 3 : 0,
					assetLocallyAvailable: bytesReady,
					assetCached: bytesReady,
					online: isOnline(),
				},
			});
		}
	};

	const unsubscribe = runtime.onDispatched((operations, nextState) => {
		if (stopped) return;
		for (const op of operations) {
			const trigger = triggerForOperation(op);
			if (!trigger) continue;
			void fire(trigger, encounterScopeOf(trigger, op, nextState), nextState);
		}
	});

	return () => {
		stopped = true;
		unsubscribe();
	};
}
