import type { ActorId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import type { SessionState } from '../state/session-state';
import { getSessionParticipantStatus } from '../queries/session-control';
import type { CapabilityAvailability, DiagnosticsContextInput } from './health';

/**
 * Participant-safe status (PLAT-017). A participant sees the health of their own session
 * — connection, sync, platform capability, and session delivery — with no DM/admin
 * diagnostics, no support bundle, no hidden entity names, and no source paths. Every
 * reason string is generic and action-oriented so it never reveals whether hidden
 * content exists.
 */

export type ParticipantConnectionState =
	| 'live'
	| 'reconnecting'
	| 'offline'
	| 'stale'
	| 'unavailable';

export type ParticipantSyncState = 'up-to-date' | 'syncing' | 'queued-offline' | 'unavailable';

export type ParticipantDeliveryState = 'delivered' | 'pending' | 'unavailable';

export interface ParticipantCapabilityStatus {
	id: string;
	displayName: string;
	availability: CapabilityAvailability;
	/** Generic, action-oriented note. Never references hidden content or paths. */
	note: string | null;
}

export interface ParticipantStatusView {
	kind: 'participant-status';
	actorId: ActorId;
	role: 'player' | 'observer';
	connection: ParticipantConnectionState;
	connectionMessage: string;
	sync: ParticipantSyncState;
	syncMessage: string;
	delivery: ParticipantDeliveryState;
	deliveryMessage: string;
	capabilities: ParticipantCapabilityStatus[];
}

export type ParticipantStatusResult =
	| ParticipantStatusView
	| { kind: 'denied'; reason: 'unknown-actor' | 'not-a-participant' };

/**
 * Optional, already-redacted participant inputs the shell may pass. These never include
 * source ids/paths, entity names, or DM diagnostics — only the participant's own
 * delivery/connection facts.
 */
export interface ParticipantStatusInput {
	/** Whether the participant's device currently has a live connection. */
	online: boolean;
	/** True when the last known participant state is older than the freshness window. */
	stale?: boolean;
	/** True while a reconnect attempt is in progress. */
	reconnecting?: boolean;
	/** Count of the participant's own locally queued operations. */
	queuedOperations?: number;
}

const CONNECTION_MESSAGES: Record<ParticipantConnectionState, string> = {
	live: 'Connected to the session.',
	reconnecting: 'Reconnecting to the session…',
	offline:
		'You are offline. Your changes are saved on this device and will sync when you reconnect.',
	stale: 'Your session view may be out of date. Reconnect to refresh.',
	unavailable: 'No active session is available right now.',
};

const SYNC_MESSAGES: Record<ParticipantSyncState, string> = {
	'up-to-date': 'Your session is up to date.',
	syncing: 'Syncing your session…',
	'queued-offline': 'Changes are queued and will sync when you reconnect.',
	unavailable: 'Sync is unavailable while no session is active.',
};

const DELIVERY_MESSAGES: Record<ParticipantDeliveryState, string> = {
	delivered: 'Shared content is available.',
	pending: 'Shared content is on its way. Check back shortly.',
	unavailable: 'Shared content is not available right now.',
};

function connectionState(
	sessionConnection: 'live' | 'paused-degraded' | 'inactive',
	input: ParticipantStatusInput,
): ParticipantConnectionState {
	if (sessionConnection === 'inactive') return 'unavailable';
	if (!input.online) return 'offline';
	if (input.reconnecting) return 'reconnecting';
	if (input.stale || sessionConnection === 'paused-degraded') return 'stale';
	return 'live';
}

function syncState(connection: ParticipantConnectionState, queued: number): ParticipantSyncState {
	if (connection === 'unavailable') return 'unavailable';
	if (connection === 'offline' || queued > 0) return 'queued-offline';
	if (connection === 'reconnecting' || connection === 'stale') return 'syncing';
	return 'up-to-date';
}

function deliveryState(
	session: SessionState,
	actorId: ActorId,
	connection: ParticipantConnectionState,
): ParticipantDeliveryState {
	if (connection === 'unavailable') return 'unavailable';
	const assignment = session.playerViewAssignments[actorId];
	const projection = session.activeMapProjections[actorId];
	// A participant may have a player-view assignment and/or a projected active map.
	// Report delivered only when everything assigned has actually been delivered;
	// otherwise pending. Crucially this never reveals what is hidden or its name.
	const relevant = [assignment?.deliveryStatus, projection?.deliveryStatus].filter(
		(status): status is 'delivered' | 'queued' => status !== undefined,
	);
	if (relevant.length === 0) return 'delivered';
	return relevant.every((status) => status === 'delivered') ? 'delivered' : 'pending';
}

/**
 * Map a DM-facing capability into a participant-safe capability status. The detail string
 * from the DM context is dropped entirely (it may name a path or feature internals); the
 * participant only sees a generic note keyed off availability.
 */
function participantCapability(
	id: string,
	displayName: string,
	availability: CapabilityAvailability,
): ParticipantCapabilityStatus {
	const note =
		availability === 'available'
			? null
			: availability === 'degraded'
				? 'Limited on your device. Some actions may be slower or use a fallback.'
				: 'Not available on your device.';
	return { id, displayName, availability, note };
}

/**
 * The participant-safe subset of a status view that is safe to embed in a DM support
 * bundle (PLAT-017 AC3). It carries only generic states/messages — no actor id, no
 * source ids/paths, no entity names, no DM diagnostics.
 */
export interface ParticipantSafeStatusSummary {
	role: 'player' | 'observer';
	connection: ParticipantConnectionState;
	connectionMessage: string;
	sync: ParticipantSyncState;
	syncMessage: string;
	delivery: ParticipantDeliveryState;
	deliveryMessage: string;
}

/**
 * Reduce a full participant status view to the bundle-safe summary. By construction the
 * source view already excludes secrets, raw paths, and hidden titles; this drops the
 * actor id and capability detail so nothing identifies a specific player.
 */
export function toParticipantSafeSummary(
	view: ParticipantStatusView,
): ParticipantSafeStatusSummary {
	return {
		role: view.role,
		connection: view.connection,
		connectionMessage: view.connectionMessage,
		sync: view.sync,
		syncMessage: view.syncMessage,
		delivery: view.delivery,
		deliveryMessage: view.deliveryMessage,
	};
}

/**
 * Build the participant-safe status view (PLAT-017 AC1/AC2). Denied for unknown actors;
 * the DM is not a "participant" for this surface and receives the DM diagnostics view
 * instead (and must not consume this player-safe API as if it were privileged).
 */
export function getParticipantStatus(
	permissions: PermissionState,
	session: SessionState,
	context: Pick<DiagnosticsContextInput, 'capabilities'>,
	actorId: ActorId,
	input: ParticipantStatusInput,
): ParticipantStatusResult {
	const actor = permissions.actors[actorId];
	if (!actor) return { kind: 'denied', reason: 'unknown-actor' };
	if (actor.role !== 'player' && actor.role !== 'observer') {
		return { kind: 'denied', reason: 'not-a-participant' };
	}

	const sessionStatus = getSessionParticipantStatus(session, permissions, actorId);
	const connection = connectionState(sessionStatus.connection, input);
	const sync = syncState(connection, input.queuedOperations ?? 0);
	const delivery = deliveryState(session, actorId, connection);

	return {
		kind: 'participant-status',
		actorId,
		role: actor.role,
		connection,
		connectionMessage: CONNECTION_MESSAGES[connection],
		sync,
		syncMessage: SYNC_MESSAGES[sync],
		delivery,
		deliveryMessage: DELIVERY_MESSAGES[delivery],
		capabilities: context.capabilities.map((capability) =>
			participantCapability(capability.id, capability.displayName, capability.availability),
		),
	};
}
