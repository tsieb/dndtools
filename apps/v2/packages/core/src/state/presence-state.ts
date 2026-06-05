import type { ActorId, SceneId, WidgetInstanceId } from './ids';

/**
 * COLLAB-004 — the EPHEMERAL `PresenceState` document (Architecture Contract 1 `PresenceState`; Yjs
 * awareness model). Presence carries online status, cursor/selection hints, and device availability for
 * the participants currently connected to a session.
 *
 * It is the SEVENTH state document in Contract 1's State Shape — and the ONLY non-durable one:
 *
 *   - "Only the first six [state documents] are durable. `PresenceState` is ephemeral and must never be
 *     required for offline correctness." (Contract 1, State Shape)
 *   - "Presence | Ephemeral broadcast, no durable merge." (Contract 2, entity-level merge strategy)
 *   - "Presence state" is DEVICE-LOCAL only and "Cloud storage must not contain … presence" beyond a
 *     live broadcast (Contract 2, Cloud Storage Model). It is classified `presence-state` /
 *     `device-local` in the storage-classification registry, so it is never written to a durable store
 *     and never enters the operation log.
 *
 * THE DEFINING INVARIANT (COLLAB-004 AC2): presence is NEVER persisted, NEVER merged, and NEVER replayed
 * as authoritative history. It is rebuilt from live broadcasts each time the session connects; an old
 * presence record is meaningless once its owner disconnects. This module models presence as a plain,
 * timestamped, fully-replaceable snapshot keyed by actor — there is no revision, no dependency, no
 * before/after base, and no idempotency key, exactly because presence must not behave like a durable
 * operation. When a participant goes offline their presence entry simply ceases to exist; when they
 * reconnect a FRESH entry is broadcast.
 *
 * Pure plain-data types + small constructors/normalizers. No DOM, storage, clock, or network — the live
 * presence broadcast transport is deferred per ADR-014; this is the ephemeral shape that transport fills.
 */

export const PRESENCE_STATE_SCHEMA_VERSION = 1 as const;

/** Whether a participant is currently connected to the session (COLLAB-004 online status). */
export type PresenceOnlineStatus = 'online' | 'away' | 'offline';

export const PRESENCE_ONLINE_STATUSES: readonly PresenceOnlineStatus[] = Object.freeze([
	'online',
	'away',
	'offline',
]);

/** The kind of device a participant is connected from (COLLAB-004 device availability). */
export type PresenceDeviceKind = 'desktop' | 'tablet' | 'mobile' | 'web' | 'unknown';

export const PRESENCE_DEVICE_KINDS: readonly PresenceDeviceKind[] = Object.freeze([
	'desktop',
	'tablet',
	'mobile',
	'web',
	'unknown',
]);

/**
 * A participant's ephemeral CURSOR hint, scoped to a scene (and, when relevant, a widget). Coordinates
 * are NORMALIZED (0..1) so they survive any viewport/scale, mirroring the map-annotation coordinate
 * model. Absent ⇒ the participant has no published cursor (e.g. not pointing at anything shareable).
 */
export interface PresenceCursor {
	sceneId: SceneId;
	/** The widget the cursor is over, when the cursor is widget-scoped. */
	widgetInstanceId?: WidgetInstanceId;
	/** Normalized x within the scene/widget surface (0..1). */
	x: number;
	/** Normalized y within the scene/widget surface (0..1). */
	y: number;
}

/**
 * A participant's ephemeral SELECTION hint: the scene + the widget instances they currently have
 * selected. A selection is a UI hint only — it confers NO authority and is never durable.
 */
export interface PresenceSelection {
	sceneId: SceneId;
	widgetInstanceIds: WidgetInstanceId[];
}

/**
 * ONE participant's ephemeral presence entry. It is a fully-replaceable SNAPSHOT — there is deliberately
 * no revision/dependency/base, because presence must never merge or replay. `updatedAt` is a broadcast
 * timestamp used only for freshness/expiry, never for authoritative ordering of durable state.
 */
export interface PresenceEntry {
	actorId: ActorId;
	status: PresenceOnlineStatus;
	device: PresenceDeviceKind;
	/** The scene the participant is currently viewing, when any. */
	activeSceneId?: SceneId;
	/** The participant's published cursor hint, when any. */
	cursor?: PresenceCursor;
	/** The participant's published selection hint, when any. */
	selection?: PresenceSelection;
	/** ISO broadcast time — used for ephemeral freshness/expiry only, never durable ordering. */
	updatedAt: string;
}

/**
 * The ephemeral `PresenceState` document: the live presence entries keyed by actor id. This is REBUILT
 * from broadcasts each connection; it is never durably stored or merged. The empty state is the correct
 * OFFLINE state — when there is no live connection there is no presence (COLLAB-004 AC2).
 */
export interface PresenceState {
	entries: Record<ActorId, PresenceEntry>;
	schemaVersion: typeof PRESENCE_STATE_SCHEMA_VERSION;
}

/** The empty presence state — the canonical OFFLINE presence (no live participants). */
export const EMPTY_PRESENCE_STATE: PresenceState = Object.freeze({
	entries: Object.freeze({}) as Record<ActorId, PresenceEntry>,
	schemaVersion: PRESENCE_STATE_SCHEMA_VERSION,
});

function clampUnit(value: number): number {
	if (!Number.isFinite(value)) return 0;
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}

/** Whether a value is a recognized online status (fail closed: an unknown value is treated as offline). */
export function normalizeOnlineStatus(value: unknown): PresenceOnlineStatus {
	return (PRESENCE_ONLINE_STATUSES as readonly string[]).includes(value as string)
		? (value as PresenceOnlineStatus)
		: 'offline';
}

/** Whether a value is a recognized device kind (fail closed: an unknown value is treated as unknown). */
export function normalizeDeviceKind(value: unknown): PresenceDeviceKind {
	return (PRESENCE_DEVICE_KINDS as readonly string[]).includes(value as string)
		? (value as PresenceDeviceKind)
		: 'unknown';
}

/**
 * Build a normalized presence entry from a possibly-partial broadcast. Cursor coordinates are clamped to
 * the unit interval; an unknown status/device falls back to its fail-closed default; a malformed cursor
 * (missing scene) or selection is dropped rather than carried as garbage. Presence is a snapshot, so this
 * never merges with a prior entry — it builds a fresh, self-contained entry.
 */
export function buildPresenceEntry(
	input: Partial<PresenceEntry> & Pick<PresenceEntry, 'actorId' | 'updatedAt'>,
): PresenceEntry {
	const entry: PresenceEntry = {
		actorId: input.actorId,
		status: normalizeOnlineStatus(input.status),
		device: normalizeDeviceKind(input.device),
		updatedAt: input.updatedAt,
	};
	if (input.activeSceneId) entry.activeSceneId = input.activeSceneId;
	if (input.cursor && input.cursor.sceneId) {
		const cursor: PresenceCursor = {
			sceneId: input.cursor.sceneId,
			x: clampUnit(input.cursor.x),
			y: clampUnit(input.cursor.y),
		};
		if (input.cursor.widgetInstanceId) cursor.widgetInstanceId = input.cursor.widgetInstanceId;
		entry.cursor = cursor;
	}
	if (input.selection && input.selection.sceneId) {
		entry.selection = {
			sceneId: input.selection.sceneId,
			widgetInstanceIds: [...new Set(input.selection.widgetInstanceIds ?? [])],
		};
	}
	return entry;
}

/**
 * Apply a single fresh presence broadcast to the ephemeral state, REPLACING (never merging) any prior
 * entry for that actor. An `offline` broadcast REMOVES the actor's entry entirely — once a participant
 * disconnects there is no presence for them (COLLAB-004 AC2: old presence is not retained). Pure: returns
 * a new state; the input is unchanged.
 */
export function applyPresenceBroadcast(state: PresenceState, entry: PresenceEntry): PresenceState {
	const next = { ...state.entries };
	if (entry.status === 'offline') {
		delete next[entry.actorId];
	} else {
		next[entry.actorId] = entry;
	}
	return { entries: next, schemaVersion: PRESENCE_STATE_SCHEMA_VERSION };
}

/**
 * Remove a participant's presence entry (they disconnected / left). Pure; idempotent (removing an absent
 * actor is a no-op). This is the explicit form of the offline-removal rule above.
 */
export function removePresence(state: PresenceState, actorId: ActorId): PresenceState {
	if (!(actorId in state.entries)) return state;
	const next = { ...state.entries };
	delete next[actorId];
	return { entries: next, schemaVersion: PRESENCE_STATE_SCHEMA_VERSION };
}

/**
 * Hydrate a possibly-partial persisted/received presence state fail-closed. Because presence is
 * EPHEMERAL it should generally be reconstructed empty rather than rehydrated; this exists only so a
 * received snapshot is normalized (each entry rebuilt, malformed entries dropped) and never trusted as
 * durable. An absent/empty input yields the canonical empty (offline) presence.
 */
export function ensurePresenceState(state?: Partial<PresenceState> | null): PresenceState {
	if (!state || !state.entries) return { entries: {}, schemaVersion: PRESENCE_STATE_SCHEMA_VERSION };
	const entries: Record<ActorId, PresenceEntry> = {};
	for (const [actorId, raw] of Object.entries(state.entries)) {
		if (!raw || typeof raw !== 'object') continue;
		entries[actorId] = buildPresenceEntry({ ...raw, actorId, updatedAt: raw.updatedAt ?? '' });
	}
	return { entries, schemaVersion: PRESENCE_STATE_SCHEMA_VERSION };
}
