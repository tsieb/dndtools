import { hasDmAuthority } from '../state/permission-state';
import { setPresenceInputSchema } from '../schemas/commands';
import {
	applyPresenceBroadcast,
	buildPresenceEntry,
	ensurePresenceState,
} from '../state/presence-state';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import { parseInput, reject, requireActor } from './helpers';

/**
 * COLLAB-004 — `session.set-presence`: set/clear an EPHEMERAL presence entry in the in-memory
 * `PresenceState` document.
 *
 * Presence is the ONLY non-durable state document (Contract 1 State Shape; Contract 2 "Ephemeral
 * broadcast, no durable merge"), so this handler deliberately breaks the usual command tail: it
 * appends NO durable sync operation (`operationIds: []`) — presence must never enter the operation
 * log or be replayed as authoritative history. Hosts that persist the whole slice must treat the
 * presence slice as disposable: `session.set-workflow` RESETS it on session start/end.
 *
 * Authority, fail-closed:
 *   - A participant may set ONLY THEIR OWN presence (the command actor is the subject).
 *   - The DM may additionally CLEAR another participant's stale entry (`targetActorId` +
 *     `status: 'offline'`); the DM never authors another participant's live presence.
 *   - Observers never reach this handler (the global observer write gate rejects every command), so
 *     observer presence remains transport-broadcast-only.
 */
export function handleSetPresence(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const parsed = parseInput(setPresenceInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const targetActorId = parsed.data.targetActorId ?? actor.id;
	if (targetActorId !== actor.id) {
		// Fail closed: only the DM may touch another participant's presence, and only to CLEAR it.
		if (!hasDmAuthority(actor.role)) {
			return reject(
				{ code: 'actor-not-authorized', message: 'You may only set your own presence.' },
				state,
			);
		}
		if (parsed.data.status !== 'offline') {
			return reject(
				{
					code: 'invalid-payload',
					message: 'The DM may only CLEAR another participant\'s presence (status: offline).',
				},
				state,
			);
		}
		if (!state.permissions.actors[targetActorId]) {
			return reject(
				{ code: 'unknown-actor', message: `Actor ${targetActorId} is not registered.` },
				state,
			);
		}
	}

	const entry = buildPresenceEntry({
		actorId: targetActorId,
		status: parsed.data.status,
		device: parsed.data.device,
		...(parsed.data.activeSceneId ? { activeSceneId: parsed.data.activeSceneId } : {}),
		...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
		...(parsed.data.selection ? { selection: parsed.data.selection } : {}),
		updatedAt: env.clock(),
	});
	const nextPresence = applyPresenceBroadcast(ensurePresenceState(state.presence), entry);

	// EPHEMERAL: no durable op is appended — presence never enters the operation log (Contract 2).
	return {
		status: 'accepted',
		nextState: { ...state, presence: nextPresence },
		events: [
			{
				kind: 'session.presence-changed',
				subjectActorId: targetActorId,
				status: parsed.data.status,
				actorId: actor.id,
			},
		],
		operationIds: [],
	};
}
