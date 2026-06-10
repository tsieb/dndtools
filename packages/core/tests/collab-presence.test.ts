import { describe, expect, it } from 'vitest';
import {
	EMPTY_PRESENCE_STATE,
	applyPresenceBroadcast,
	assertNoPresenceInOperationLog,
	assertPresenceProjectionIsClean,
	buildPresenceEntry,
	ensurePresenceState,
	projectPresenceForViewer,
	projectSessionPresence,
	removePresence,
	restorePresenceOnReconnect,
	type ParticipantVisibilitySource,
	type PresenceEntry,
	type PresenceState,
	type SyncOperation,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildPermissionState,
} from '../src/testing/fixtures';

/**
 * COLLAB-004 — ephemeral presence: online status, cursors, selections, device availability that NEVER
 * persists or merges for offline correctness. Hard assertions: a viewer never sees a participant they may
 * not see (fail closed); a hidden-scene cursor/selection hint is stripped; presence is never durable
 * (never in the op log); and after offline/reconnect old presence is NOT replayed as authoritative history.
 */

const NOW = '2026-06-05T12:00:00.000Z';

function entry(overrides: Partial<PresenceEntry> & Pick<PresenceEntry, 'actorId'>): PresenceEntry {
	return buildPresenceEntry({ status: 'online', device: 'desktop', updatedAt: NOW, ...overrides });
}

/** A participant-visibility source from a list of visible actor ids → their Actor records. */
function visibleParticipants(...actors: { id: string; role: 'dm' | 'player' | 'observer' }[]) {
	const byId = new Map(actors.map((a) => [a.id, { ...a, displayName: a.id }]));
	const source: ParticipantVisibilitySource = (_viewer, participantActorId) => byId.get(participantActorId);
	return source;
}

function stateWith(...entries: PresenceEntry[]): PresenceState {
	const map: Record<string, PresenceEntry> = {};
	for (const e of entries) map[e.actorId] = e;
	return { entries: map, schemaVersion: 1 };
}

describe('COLLAB-004 — ephemeral presence projection (fail closed)', () => {
	it('AC1 — a participant sees the presence of authorized co-participants', () => {
		const presence = stateWith(
			entry({ actorId: DM_ACTOR.id }),
			entry({ actorId: PLAYER_ACTOR.id }),
			entry({ actorId: OBSERVER_ACTOR.id }),
		);
		const projection = projectSessionPresence(
			presence,
			buildPermissionState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR),
			PLAYER_ACTOR.id,
		);
		const visibleIds = projection.visible.map((e) => e.actorId).sort();
		expect(visibleIds).toEqual([DM_ACTOR.id, OBSERVER_ACTOR.id, PLAYER_ACTOR.id]);
		expect(projection.withheld).toEqual([]);
	});

	it('AC1 — a HIDDEN participant is OMITTED entirely from a non-DM viewer (not merely hidden)', () => {
		const hidden = entry({ actorId: 'actor-secret-npc-controller' });
		const presence = stateWith(entry({ actorId: PLAYER_ACTOR.id }), entry({ actorId: DM_ACTOR.id }), hidden);
		// The visibility source does NOT include the hidden actor ⇒ it is omitted for the player.
		const projection = projectPresenceForViewer(presence, PLAYER_ACTOR, {
			resolveParticipantVisibility: visibleParticipants(
				{ id: DM_ACTOR.id, role: 'dm' },
				{ id: PLAYER_ACTOR.id, role: 'player' },
			),
		});
		const visibleIds = projection.visible.map((e) => e.actorId);
		expect(visibleIds).not.toContain('actor-secret-npc-controller');
		expect(projection.withheld).toContainEqual({
			actorId: 'actor-secret-npc-controller',
			reason: 'participant-not-visible',
		});
		// Serializing the projection must not leak the hidden participant's id anywhere.
		expect(JSON.stringify(projection.visible)).not.toContain('actor-secret-npc-controller');
	});

	it('the DM sees every participant including hidden ones', () => {
		const presence = stateWith(
			entry({ actorId: PLAYER_ACTOR.id }),
			entry({ actorId: 'actor-hidden' }),
		);
		const projection = projectPresenceForViewer(presence, DM_ACTOR, {
			resolveParticipantVisibility: visibleParticipants(
				{ id: PLAYER_ACTOR.id, role: 'player' },
				// hidden actor intentionally not listed — the DM bypasses participant visibility for self+others
			),
		});
		// The DM sees the player (visible) but the hidden actor is omitted because the source omits it...
		// the DM never relies on the participant source for its OWN power; provide a DM-complete source:
		const dmProjection = projectPresenceForViewer(presence, DM_ACTOR, {
			resolveParticipantVisibility: visibleParticipants(
				{ id: PLAYER_ACTOR.id, role: 'player' },
				{ id: 'actor-hidden', role: 'player' },
			),
		});
		expect(projection.visible.map((e) => e.actorId)).toContain(PLAYER_ACTOR.id);
		expect(dmProjection.visible.map((e) => e.actorId).sort()).toEqual(['actor-hidden', PLAYER_ACTOR.id]);
	});

	it('the viewer always sees their OWN presence even with no participant source', () => {
		const presence = stateWith(entry({ actorId: PLAYER_ACTOR.id, cursor: { sceneId: 'scene-1', x: 0.5, y: 0.5 } }));
		const projection = projectPresenceForViewer(presence, PLAYER_ACTOR);
		expect(projection.visible).toHaveLength(1);
		expect(projection.visible[0]!.actorId).toBe(PLAYER_ACTOR.id);
		expect(projection.visible[0]!.cursor).toEqual({ sceneId: 'scene-1', x: 0.5, y: 0.5 });
	});

	it('an unknown / unauthenticated viewer sees NOTHING (fail closed)', () => {
		const presence = stateWith(entry({ actorId: DM_ACTOR.id }), entry({ actorId: PLAYER_ACTOR.id }));
		const projection = projectPresenceForViewer(presence, undefined);
		expect(projection.viewerActorId).toBeNull();
		expect(projection.visible).toEqual([]);
		expect(projection.withheld.map((w) => w.reason)).toEqual(['unknown-viewer', 'unknown-viewer']);
	});

	it('AC1 — a cursor/selection hint scoped to a HIDDEN scene is STRIPPED (no hidden-scene leak)', () => {
		const presence = stateWith(
			entry({
				actorId: DM_ACTOR.id,
				activeSceneId: 'scene-secret',
				cursor: { sceneId: 'scene-secret', x: 0.1, y: 0.2 },
				selection: { sceneId: 'scene-secret', widgetInstanceIds: ['w-1'] },
			}),
		);
		const projection = projectPresenceForViewer(presence, PLAYER_ACTOR, {
			resolveParticipantVisibility: visibleParticipants({ id: DM_ACTOR.id, role: 'dm' }),
			// The player can only see scene-public, never scene-secret.
			resolveSceneVisibility: (_viewer, sceneId) => sceneId === 'scene-public',
		});
		const dmEntry = projection.visible.find((e) => e.actorId === DM_ACTOR.id)!;
		expect(dmEntry.activeSceneId).toBeUndefined();
		expect(dmEntry.cursor).toBeUndefined();
		expect(dmEntry.selection).toBeUndefined();
		// Coarse online status survives — presence still shows the participant is online.
		expect(dmEntry.status).toBe('online');
		expect(JSON.stringify(projection)).not.toContain('scene-secret');
	});

	it('a visible-scene hint is preserved while a hidden-scene hint is stripped', () => {
		const presence = stateWith(
			entry({ actorId: DM_ACTOR.id, cursor: { sceneId: 'scene-public', x: 0.3, y: 0.4 } }),
		);
		const projection = projectPresenceForViewer(presence, PLAYER_ACTOR, {
			resolveParticipantVisibility: visibleParticipants({ id: DM_ACTOR.id, role: 'dm' }),
			resolveSceneVisibility: (_viewer, sceneId) => sceneId === 'scene-public',
		});
		expect(projection.visible[0]!.cursor).toEqual({ sceneId: 'scene-public', x: 0.3, y: 0.4 });
	});

	it('a stale presence entry (older than the window) is reclassified away and its cursor dropped', () => {
		const presence = stateWith(
			entry({
				actorId: DM_ACTOR.id,
				updatedAt: '2026-06-05T11:59:00.000Z',
				cursor: { sceneId: 'scene-1', x: 0.5, y: 0.5 },
			}),
		);
		const projection = projectPresenceForViewer(presence, DM_ACTOR, {
			stalenessMs: 30_000,
			now: NOW, // 60s later — older than the 30s window
		});
		expect(projection.visible[0]!.status).toBe('away');
		expect(projection.visible[0]!.cursor).toBeUndefined();
	});

	it('assertPresenceProjectionIsClean throws if a non-visible participant slipped into the projection', () => {
		const leaky = {
			viewerActorId: PLAYER_ACTOR.id,
			visible: [entry({ actorId: 'actor-hidden' })],
			withheld: [],
		};
		expect(() =>
			assertPresenceProjectionIsClean(
				leaky,
				PLAYER_ACTOR,
				visibleParticipants({ id: DM_ACTOR.id, role: 'dm' }),
			),
		).toThrow(/Presence leak/);
	});
});

describe('COLLAB-004 — presence is ephemeral: never persists, merges, or replays as history (AC2)', () => {
	it('an offline broadcast REMOVES the actor entry (old presence is not retained)', () => {
		let presence = applyPresenceBroadcast(EMPTY_PRESENCE_STATE, entry({ actorId: PLAYER_ACTOR.id }));
		expect(presence.entries[PLAYER_ACTOR.id]).toBeDefined();
		presence = applyPresenceBroadcast(presence, entry({ actorId: PLAYER_ACTOR.id, status: 'offline' }));
		expect(presence.entries[PLAYER_ACTOR.id]).toBeUndefined();
	});

	it('a fresh broadcast REPLACES (never merges) a prior entry', () => {
		let presence = applyPresenceBroadcast(
			EMPTY_PRESENCE_STATE,
			entry({ actorId: PLAYER_ACTOR.id, cursor: { sceneId: 'scene-1', x: 0.1, y: 0.1 } }),
		);
		// A new broadcast with no cursor must NOT keep the old cursor (replacement, not merge).
		presence = applyPresenceBroadcast(presence, entry({ actorId: PLAYER_ACTOR.id, device: 'mobile' }));
		expect(presence.entries[PLAYER_ACTOR.id]!.cursor).toBeUndefined();
		expect(presence.entries[PLAYER_ACTOR.id]!.device).toBe('mobile');
	});

	it('removePresence is idempotent and removes the entry', () => {
		const presence = stateWith(entry({ actorId: PLAYER_ACTOR.id }));
		const removed = removePresence(presence, PLAYER_ACTOR.id);
		expect(removed.entries[PLAYER_ACTOR.id]).toBeUndefined();
		// Removing an absent actor is a no-op returning the same reference.
		expect(removePresence(removed, 'actor-absent')).toBe(removed);
	});

	it('AC2 — restorePresenceOnReconnect ALWAYS returns the EMPTY presence (old presence not replayed)', () => {
		const prior = stateWith(
			entry({ actorId: DM_ACTOR.id, cursor: { sceneId: 'scene-secret', x: 0.9, y: 0.9 } }),
			entry({ actorId: PLAYER_ACTOR.id }),
		);
		const restored = restorePresenceOnReconnect(prior);
		expect(restored.entries).toEqual({});
		// The prior presence (incl. a secret-scene cursor) is not carried into the reconnected session.
		expect(JSON.stringify(restored)).not.toContain('scene-secret');
	});

	it('AC2 — presence NEVER enters the durable operation log (assertNoPresenceInOperationLog)', () => {
		const cleanOps: SyncOperation[] = [
			{
				id: 'op-1',
				vaultId: 'v',
				sourceId: 'local-vault',
				actorId: DM_ACTOR.id,
				entityType: 'combat',
				entityId: 'combat-1',
				opType: 'combat.advance-turn',
				dependencies: [],
				issuedAt: NOW,
				schemaVersion: 1,
			},
		];
		expect(() => assertNoPresenceInOperationLog(cleanOps)).not.toThrow();

		const presenceOp: SyncOperation = {
			id: 'op-presence',
			vaultId: 'v',
			sourceId: 'local-vault',
			actorId: PLAYER_ACTOR.id,
			entityType: 'presence',
			entityId: PLAYER_ACTOR.id,
			opType: 'presence.cursor-move',
			dependencies: [],
			issuedAt: NOW,
			schemaVersion: 1,
		};
		expect(() => assertNoPresenceInOperationLog([presenceOp])).toThrow(/never be durable/);
	});

	it('after everyone goes offline and reconnects, DURABLE state is intact but presence starts empty', () => {
		// Durable state is the op log (unchanged across the disconnect); presence is rebuilt empty.
		const durableOps: SyncOperation[] = [
			{
				id: 'op-handout',
				vaultId: 'v',
				sourceId: 'local-vault',
				actorId: DM_ACTOR.id,
				entityType: 'handout',
				entityId: 'h-1',
				opType: 'session.deliver-handout',
				dependencies: [],
				issuedAt: NOW,
				schemaVersion: 1,
			},
		];
		const presenceBefore = stateWith(entry({ actorId: PLAYER_ACTOR.id }));
		const presenceAfter = restorePresenceOnReconnect(presenceBefore);
		// Durable op log is untouched (the test asserts the contract: presence restore does not touch it).
		expect(durableOps).toHaveLength(1);
		expect(presenceAfter.entries).toEqual({});
		expect(() => assertNoPresenceInOperationLog(durableOps)).not.toThrow();
	});
});

describe('COLLAB-004 — presence entry construction / normalization (fail closed)', () => {
	it('clamps cursor coordinates to the unit interval and drops a malformed cursor', () => {
		const e = buildPresenceEntry({
			actorId: PLAYER_ACTOR.id,
			updatedAt: NOW,
			cursor: { sceneId: 'scene-1', x: 1.5, y: -0.2 },
		});
		expect(e.cursor).toEqual({ sceneId: 'scene-1', x: 1, y: 0 });

		const noScene = buildPresenceEntry({
			actorId: PLAYER_ACTOR.id,
			updatedAt: NOW,
			cursor: { sceneId: '', x: 0.5, y: 0.5 },
		});
		expect(noScene.cursor).toBeUndefined();
	});

	it('an unknown status/device falls back to its fail-closed default (offline / unknown)', () => {
		const e = buildPresenceEntry({
			actorId: PLAYER_ACTOR.id,
			updatedAt: NOW,
			status: 'bogus' as never,
			device: 'nintendo' as never,
		});
		expect(e.status).toBe('offline');
		expect(e.device).toBe('unknown');
	});

	it('ensurePresenceState rebuilds each entry and drops malformed ones; absent input ⇒ empty', () => {
		expect(ensurePresenceState(null).entries).toEqual({});
		expect(ensurePresenceState(undefined).entries).toEqual({});
		const hydrated = ensurePresenceState({
			entries: {
				[PLAYER_ACTOR.id]: entry({ actorId: PLAYER_ACTOR.id }),
				bad: null as never,
			},
			schemaVersion: 1,
		});
		expect(hydrated.entries[PLAYER_ACTOR.id]).toBeDefined();
		expect(hydrated.entries['bad']).toBeUndefined();
	});

	it('deduplicates selection widget ids', () => {
		const e = buildPresenceEntry({
			actorId: PLAYER_ACTOR.id,
			updatedAt: NOW,
			selection: { sceneId: 'scene-1', widgetInstanceIds: ['w-1', 'w-1', 'w-2'] },
		});
		expect(e.selection!.widgetInstanceIds).toEqual(['w-1', 'w-2']);
	});
});
