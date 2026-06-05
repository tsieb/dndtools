import { describe, expect, it } from 'vitest';
import {
	EMPTY_SESSION_STATE,
	PERMISSION_STATE_SCHEMA_VERSION,
	containsSensitiveData,
	exportSupportBundle,
	getParticipantStatus,
	toParticipantSafeSummary,
	type DiagnosticsContextInput,
	type PermissionState,
	type SessionPlayerViewAssignment,
	type SessionState,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR } from '../src/testing/fixtures';

function permissions(): PermissionState {
	return {
		actors: {
			[DM_ACTOR.id]: DM_ACTOR,
			[PLAYER_ACTOR.id]: PLAYER_ACTOR,
			[OBSERVER_ACTOR.id]: OBSERVER_ACTOR,
		},
		grants: [],
		schemaVersion: PERMISSION_STATE_SCHEMA_VERSION,
	};
}

function session(overrides: Partial<SessionState> = {}): SessionState {
	return {
		...EMPTY_SESSION_STATE,
		combat: { ...EMPTY_SESSION_STATE.combat, combatantIds: [] },
		diceHistory: [],
		timers: {},
		playerViewAssignments: {},
		activeMapProjections: {},
		archives: {},
		...overrides,
	};
}

const CAPABILITIES: Pick<DiagnosticsContextInput, 'capabilities'> = {
	capabilities: [
		{
			id: 'filesystem',
			displayName: 'Local files',
			availability: 'unsupported',
			// This DM-facing detail must never reach the participant.
			detail: 'No filesystem on web; vault at /Users/dm/campaigns/vault',
		},
		{ id: 'audio', displayName: 'Audio', availability: 'degraded', detail: 'codec fallback' },
	],
};

function liveInput() {
	return { online: true, queuedOperations: 0 };
}

describe('PLAT-017 participant status (AC1: non-leaking connection/sync/delivery state)', () => {
	it('shows live state for an active session', () => {
		const result = getParticipantStatus(
			permissions(),
			session({ workflow: 'active' }),
			CAPABILITIES,
			PLAYER_ACTOR.id,
			liveInput(),
		);
		expect(result.kind).toBe('participant-status');
		if (result.kind !== 'participant-status') return;
		expect(result.connection).toBe('live');
		expect(result.sync).toBe('up-to-date');
	});

	it('shows offline + queued state without leaking entity names or paths', () => {
		const result = getParticipantStatus(
			permissions(),
			session({ workflow: 'active' }),
			CAPABILITIES,
			PLAYER_ACTOR.id,
			{ online: false, queuedOperations: 2 },
		);
		if (result.kind !== 'participant-status') throw new Error('expected status');
		expect(result.connection).toBe('offline');
		expect(result.sync).toBe('queued-offline');
		// Messages are generic and action-oriented; no paths, no entity names.
		expect(result.connectionMessage).not.toMatch(/\/Users|vault/i);
		expect(containsSensitiveData(result)).toBe(false);
	});

	it('reports stale state when the session is paused/degraded', () => {
		const result = getParticipantStatus(
			permissions(),
			session({ workflow: 'paused' }),
			CAPABILITIES,
			PLAYER_ACTOR.id,
			liveInput(),
		);
		expect(result.kind === 'participant-status' && result.connection).toBe('stale');
	});

	it('reports reconnecting state', () => {
		const result = getParticipantStatus(
			permissions(),
			session({ workflow: 'active' }),
			CAPABILITIES,
			PLAYER_ACTOR.id,
			{ online: true, reconnecting: true, queuedOperations: 0 },
		);
		expect(result.kind === 'participant-status' && result.connection).toBe('reconnecting');
	});

	it('reports unavailable when no session is active', () => {
		const result = getParticipantStatus(
			permissions(),
			session({ workflow: 'idle' }),
			CAPABILITIES,
			PLAYER_ACTOR.id,
			liveInput(),
		);
		if (result.kind !== 'participant-status') throw new Error('expected status');
		expect(result.connection).toBe('unavailable');
		expect(result.delivery).toBe('unavailable');
	});
});

describe('PLAT-017 capability + delivery status (AC2: generic, action-oriented reasons)', () => {
	it('drops DM-facing capability detail and gives a generic note', () => {
		const result = getParticipantStatus(
			permissions(),
			session({ workflow: 'active' }),
			CAPABILITIES,
			PLAYER_ACTOR.id,
			liveInput(),
		);
		if (result.kind !== 'participant-status') throw new Error('expected status');
		const filesystem = result.capabilities.find((capability) => capability.id === 'filesystem');
		expect(filesystem?.availability).toBe('unsupported');
		expect(filesystem?.note).toBe('Not available on your device.');
		// The DM-facing detail (which named a path) is gone entirely.
		expect(JSON.stringify(result.capabilities)).not.toContain('/Users/dm');
		expect(JSON.stringify(result.capabilities)).not.toContain('codec');
	});

	it('reports pending delivery without revealing whether hidden content exists', () => {
		const assignment: SessionPlayerViewAssignment = {
			id: 'pv-1',
			playerActorId: PLAYER_ACTOR.id,
			target: {
				kind: 'scene',
				sceneId: 'scene-secret',
				sectionIds: null,
				widgetInstanceIds: null,
				displayState: null,
				mapRegion: null,
			},
			deliveryStatus: 'queued',
			deliveryReason: 'offline',
			createdBy: DM_ACTOR.id,
			createdAt: '2026-06-04T10:00:00.000Z',
			updatedAt: '2026-06-04T10:00:00.000Z',
			revision: 1,
		};
		const result = getParticipantStatus(
			permissions(),
			session({
				workflow: 'active',
				playerViewAssignments: { [PLAYER_ACTOR.id]: assignment },
			}),
			CAPABILITIES,
			PLAYER_ACTOR.id,
			liveInput(),
		);
		if (result.kind !== 'participant-status') throw new Error('expected status');
		expect(result.delivery).toBe('pending');
		// The hidden scene id must never appear in the participant-facing status.
		expect(JSON.stringify(result)).not.toContain('scene-secret');
		expect(result.deliveryMessage).not.toMatch(/scene-secret|hidden/i);
	});

	it('reports delivered when an assignment is delivered', () => {
		const assignment: SessionPlayerViewAssignment = {
			id: 'pv-2',
			playerActorId: PLAYER_ACTOR.id,
			target: {
				kind: 'scene',
				sceneId: 'scene-1',
				sectionIds: null,
				widgetInstanceIds: null,
				displayState: null,
				mapRegion: null,
			},
			deliveryStatus: 'delivered',
			deliveryReason: 'connected',
			createdBy: DM_ACTOR.id,
			createdAt: '2026-06-04T10:00:00.000Z',
			updatedAt: '2026-06-04T10:00:00.000Z',
			revision: 1,
		};
		const result = getParticipantStatus(
			permissions(),
			session({
				workflow: 'active',
				playerViewAssignments: { [PLAYER_ACTOR.id]: assignment },
			}),
			CAPABILITIES,
			PLAYER_ACTOR.id,
			liveInput(),
		);
		expect(result.kind === 'participant-status' && result.delivery).toBe('delivered');
	});
});

describe('PLAT-017 participant status permissions', () => {
	it('denies the DM the participant-safe surface (DM uses the diagnostics view instead)', () => {
		const result = getParticipantStatus(
			permissions(),
			session({ workflow: 'active' }),
			CAPABILITIES,
			DM_ACTOR.id,
			liveInput(),
		);
		expect(result).toEqual({ kind: 'denied', reason: 'not-a-participant' });
	});

	it('serves an observer the participant-safe surface', () => {
		const result = getParticipantStatus(
			permissions(),
			session({ workflow: 'active' }),
			CAPABILITIES,
			OBSERVER_ACTOR.id,
			liveInput(),
		);
		expect(result.kind === 'participant-status' && result.role).toBe('observer');
	});

	it('denies an unknown actor', () => {
		const result = getParticipantStatus(
			permissions(),
			session({ workflow: 'active' }),
			CAPABILITIES,
			'ghost',
			liveInput(),
		);
		expect(result).toEqual({ kind: 'denied', reason: 'unknown-actor' });
	});
});

describe('PLAT-017 AC3: participant-safe status embedded in a DM bundle excludes private data', () => {
	it('embeds only generic participant summaries with no secrets, paths, or hidden titles', () => {
		const status = getParticipantStatus(
			permissions(),
			session({ workflow: 'active' }),
			CAPABILITIES,
			PLAYER_ACTOR.id,
			{ online: false, queuedOperations: 1 },
		);
		if (status.kind !== 'participant-status') throw new Error('expected status');
		const summary = toParticipantSafeSummary(status);
		// The summary drops the actor id (no private player identity).
		expect(summary).not.toHaveProperty('actorId');
		expect(summary).not.toHaveProperty('capabilities');

		const bundle = exportSupportBundle(
			permissions(),
			{
				appVersion: '0.2.0',
				platformProfileId: 'desktop',
				generatedAt: '2026-06-04T12:00:00.000Z',
				online: true,
				syncSources: [],
				capabilities: [],
				schema: [],
				environment: {},
			},
			DM_ACTOR.id,
			{ participantStatus: [summary] },
		);
		if (bundle.kind !== 'bundle') throw new Error('expected bundle');
		expect(bundle.participantStatus).toHaveLength(1);
		expect(bundle.participantStatus[0]?.connection).toBe('offline');
		expect(containsSensitiveData(bundle.participantStatus)).toBe(false);
		expect(JSON.stringify(bundle.participantStatus)).not.toContain('actor-player');
	});
});
