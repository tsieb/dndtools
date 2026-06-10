import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SESSION_LATENCY_BUDGET,
	bufferOutOfOrderUpdate,
	deliverableSessionUpdates,
	deriveLiveSessionStatus,
	drainApplicableUpdates,
	isLiveSessionUpdate,
	percentile,
	reportLatencyBudget,
	type EntityVisibilityMetadata,
	type SyncOperation,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR, buildPermissionState } from '../src/testing/fixtures';

/**
 * COLLAB-003 — participants share near-real-time session state for active scenes, combat, dice, timers,
 * handouts, and visible map updates. Hard assertions: a projected combat update reaches the player but a
 * hidden op never enters their stream; pending/disconnected/out-of-order state surfaces stale/reconnecting;
 * an out-of-order op is held until its dependency arrives (never applied out of order); measured latency is
 * reported against the configured product budget (p95 + stale thresholds).
 */

const NOW = '2026-06-05T12:00:00.000Z';
const SECRET = 'THE-HIDDEN-ENEMY-IS-A-LICH';

function op(overrides: Partial<SyncOperation> & Pick<SyncOperation, 'id' | 'entityType' | 'entityId'>): SyncOperation {
	return {
		vaultId: 'vault-1',
		sourceId: 'local-vault',
		actorId: DM_ACTOR.id,
		opType: 'update',
		dependencies: [],
		issuedAt: NOW,
		schemaVersion: 1,
		...overrides,
	};
}

function visibilitySource(records: EntityVisibilityMetadata[]) {
	const byKey = new Map(records.map((r) => [`${r.entityType}:${r.entityId}`, r]));
	return (o: SyncOperation): EntityVisibilityMetadata | undefined => byKey.get(`${o.entityType}:${o.entityId}`);
}

describe('COLLAB-003 AC1 — near-real-time projected session updates (filter-before-send)', () => {
	it('a projected combat advance reaches a connected player', () => {
		const stream = [
			op({
				id: 'op-advance',
				entityType: 'combat',
				entityId: 'combat-1',
				opType: 'combat.advance-turn',
				value: { turn: 2 },
			}),
		];
		const visibility = visibilitySource([
			{ entityType: 'combat', entityId: 'combat-1', entity: { level: 'player-visible' } },
		]);
		const delivered = deliverableSessionUpdates(
			stream,
			PLAYER_ACTOR,
			visibility,
			new Set(),
			buildPermissionState(DM_ACTOR, PLAYER_ACTOR),
		);
		expect(delivered.map((o) => o.id)).toEqual(['op-advance']);
	});

	it('a DM-only/hidden session op NEVER enters the player live stream (the secret is absent)', () => {
		const stream = [
			op({ id: 'op-public', entityType: 'combat', entityId: 'combat-1', opType: 'combat.advance-turn' }),
			op({
				id: 'op-secret',
				entityType: 'combat',
				entityId: 'combat-hidden',
				opType: 'combat.reveal',
				value: { note: SECRET },
			}),
		];
		const visibility = visibilitySource([
			{ entityType: 'combat', entityId: 'combat-1', entity: { level: 'player-visible' } },
			{ entityType: 'combat', entityId: 'combat-hidden', entity: { level: 'dm-only' } },
		]);
		const delivered = deliverableSessionUpdates(
			stream,
			PLAYER_ACTOR,
			visibility,
			new Set(),
			buildPermissionState(DM_ACTOR, PLAYER_ACTOR),
		);
		expect(delivered.map((o) => o.id)).toEqual(['op-public']);
		expect(JSON.stringify(delivered)).not.toContain(SECRET);
	});

	it('the DM receives every live session update; an unknown recipient receives none', () => {
		const stream = [
			op({ id: 'op-a', entityType: 'combat', entityId: 'combat-1', opType: 'combat.advance-turn' }),
			op({ id: 'op-b', entityType: 'handout', entityId: 'h-1', opType: 'session.deliver-handout' }),
		];
		const visibility = visibilitySource([]); // nothing recorded ⇒ fail closed dm-only for a non-DM
		const dm = deliverableSessionUpdates(stream, DM_ACTOR, visibility, new Set(), buildPermissionState(DM_ACTOR));
		expect(dm.map((o) => o.id)).toEqual(['op-a', 'op-b']);
		const unknown = deliverableSessionUpdates(stream, undefined, visibility, new Set());
		expect(unknown).toEqual([]);
	});

	it('already-applied updates are not re-delivered, and non-session ops are excluded from the live channel', () => {
		const stream = [
			op({ id: 'op-applied', entityType: 'combat', entityId: 'combat-1', opType: 'combat.advance-turn' }),
			op({ id: 'op-new', entityType: 'handout', entityId: 'h-1', opType: 'session.deliver-handout' }),
			op({ id: 'op-note', entityType: 'note', entityId: 'note-1', opType: 'note.update' }),
		];
		const visibility = visibilitySource([
			{ entityType: 'combat', entityId: 'combat-1', entity: { level: 'player-visible' } },
			{ entityType: 'handout', entityId: 'h-1', entity: { level: 'player-visible' } },
		]);
		const delivered = deliverableSessionUpdates(
			stream,
			PLAYER_ACTOR,
			visibility,
			new Set(['op-applied']),
			buildPermissionState(DM_ACTOR, PLAYER_ACTOR),
		);
		// op-applied already applied; op-note is not a live-session op ⇒ only op-new remains.
		expect(delivered.map((o) => o.id)).toEqual(['op-new']);
	});

	it('classifies live-session ops by entity type and opType prefix', () => {
		expect(isLiveSessionUpdate(op({ id: '1', entityType: 'combat', entityId: 'c', opType: 'update' }))).toBe(true);
		expect(isLiveSessionUpdate(op({ id: '2', entityType: 'handout', entityId: 'h', opType: 'update' }))).toBe(true);
		expect(
			isLiveSessionUpdate(op({ id: '3', entityType: 'note', entityId: 'n', opType: 'session.project-player-view' })),
		).toBe(true);
		expect(isLiveSessionUpdate(op({ id: '4', entityType: 'note', entityId: 'n', opType: 'note.update' }))).toBe(false);
	});
});

describe('COLLAB-003 AC2 — stale / reconnecting status when updates pend', () => {
	it('disconnected ⇒ reconnecting (fail closed: view presumed behind)', () => {
		const result = deriveLiveSessionStatus({ connected: false, pendingUpdateCount: 0 });
		expect(result.status).toBe('reconnecting');
		expect(result.stale).toBe(true);
	});

	it('connected and caught up ⇒ live', () => {
		const result = deriveLiveSessionStatus({ connected: true, pendingUpdateCount: 0 });
		expect(result.status).toBe('live');
		expect(result.stale).toBe(false);
	});

	it('connected with pending updates within threshold ⇒ syncing', () => {
		const result = deriveLiveSessionStatus({
			connected: true,
			pendingUpdateCount: 2,
			oldestPendingAgeMs: 100,
			staleThresholdMs: 2000,
		});
		expect(result.status).toBe('syncing');
		expect(result.stale).toBe(true);
	});

	it('connected with pending updates older than the stale threshold ⇒ stale', () => {
		const result = deriveLiveSessionStatus({
			connected: true,
			pendingUpdateCount: 1,
			oldestPendingAgeMs: 5000,
			staleThresholdMs: 2000,
		});
		expect(result.status).toBe('stale');
	});

	it('AC3 cross-check — any undeliverable (out-of-order) update ⇒ stale even within threshold', () => {
		const result = deriveLiveSessionStatus({
			connected: true,
			pendingUpdateCount: 1,
			undeliverableUpdateCount: 1,
			oldestPendingAgeMs: 10,
			staleThresholdMs: 2000,
		});
		expect(result.status).toBe('stale');
	});
});

describe('COLLAB-003 AC3 — out-of-order delivery is deferred until dependencies arrive', () => {
	it('an op delivered before its dependency is HELD, then applies once the dependency arrives', () => {
		const dependent = op({
			id: 'op-2',
			entityType: 'combat',
			entityId: 'combat-1',
			opType: 'combat.advance-turn',
			dependencies: ['op-1'],
		});
		// op-2 arrives first (out of order): it is buffered, not applied.
		let pending = bufferOutOfOrderUpdate([], dependent);
		let drain = drainApplicableUpdates(pending, new Set());
		expect(drain.applied).toEqual([]);
		expect(drain.pending.map((o) => o.id)).toEqual(['op-2']);

		// op-1 arrives: now op-2's dependency is satisfied; both apply in order.
		const dependency = op({ id: 'op-1', entityType: 'combat', entityId: 'combat-1', opType: 'combat.start' });
		pending = bufferOutOfOrderUpdate(drain.pending, dependency);
		drain = drainApplicableUpdates(pending, new Set());
		expect(drain.applied.map((o) => o.id)).toEqual(['op-1', 'op-2']);
		expect(drain.pending).toEqual([]);
	});

	it('a dependency satisfied BEFORE the disconnect (in the applied set) lets the op apply immediately', () => {
		const dependent = op({
			id: 'op-2',
			entityType: 'combat',
			entityId: 'combat-1',
			opType: 'combat.advance-turn',
			dependencies: ['op-1'],
		});
		const drain = drainApplicableUpdates([dependent], new Set(['op-1']));
		expect(drain.applied.map((o) => o.id)).toEqual(['op-2']);
	});

	it('a base-state revision-marker dependency (carrying @) is treated as satisfied', () => {
		const dependent = op({
			id: 'op-2',
			entityType: 'combat',
			entityId: 'combat-1',
			opType: 'combat.advance-turn',
			dependencies: ['combat-1@7'],
		});
		const drain = drainApplicableUpdates([dependent], new Set());
		expect(drain.applied.map((o) => o.id)).toEqual(['op-2']);
	});

	it('an op whose dependency NEVER arrives stays held (never applied out of order)', () => {
		const orphan = op({
			id: 'op-orphan',
			entityType: 'combat',
			entityId: 'combat-1',
			opType: 'combat.advance-turn',
			dependencies: ['op-missing'],
		});
		const drain = drainApplicableUpdates([orphan], new Set());
		expect(drain.applied).toEqual([]);
		expect(drain.pending.map((o) => o.id)).toEqual(['op-orphan']);
	});

	it('bufferOutOfOrderUpdate dedupes by id', () => {
		const u = op({ id: 'op-1', entityType: 'combat', entityId: 'c', opType: 'combat.start' });
		const buffered = bufferOutOfOrderUpdate(bufferOutOfOrderUpdate([], u), u);
		expect(buffered.map((o) => o.id)).toEqual(['op-1']);
	});

	it('drains in deterministic dependency order regardless of input order', () => {
		const a = op({ id: 'op-a', entityType: 'combat', entityId: 'c', opType: 'combat.start', issuedAt: '2026-06-05T00:00:01.000Z' });
		const b = op({
			id: 'op-b',
			entityType: 'combat',
			entityId: 'c',
			opType: 'combat.advance-turn',
			dependencies: ['op-a'],
			issuedAt: '2026-06-05T00:00:02.000Z',
		});
		const drain = drainApplicableUpdates([b, a], new Set());
		expect(drain.applied.map((o) => o.id)).toEqual(['op-a', 'op-b']);
	});
});

describe('COLLAB-003 AC4 — latency budget reporting (p95 + stale thresholds)', () => {
	it('reports measured p95 and max against the configured budget', () => {
		// 20 samples mostly fast, one slow; p95 (nearest-rank, rank=19) is the 19th smallest.
		const latencies = [
			50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 3000,
		];
		const report = reportLatencyBudget(latencies, { p95DeliveryMs: 500, staleThresholdMs: 2000 });
		expect(report.sampleCount).toBe(20);
		expect(report.measuredMaxMs).toBe(3000);
		expect(report.measuredP95Ms).toBe(230); // 19th smallest
		expect(report.withinP95Budget).toBe(true);
		// One delivery (3000ms) exceeded the 2000ms stale threshold.
		expect(report.staleDeliveryCount).toBe(1);
		expect(report.withinStaleThreshold).toBe(false);
	});

	it('flags a p95 over budget', () => {
		const latencies = Array.from({ length: 20 }, (_v, i) => (i >= 18 ? 900 : 100));
		const report = reportLatencyBudget(latencies, { p95DeliveryMs: 500, staleThresholdMs: 2000 });
		expect(report.measuredP95Ms).toBe(900);
		expect(report.withinP95Budget).toBe(false);
	});

	it('with no samples, the thresholds are reported as met', () => {
		const report = reportLatencyBudget([]);
		expect(report.sampleCount).toBe(0);
		expect(report.measuredP95Ms).toBe(0);
		expect(report.withinP95Budget).toBe(true);
		expect(report.withinStaleThreshold).toBe(true);
		expect(report.budget).toBe(DEFAULT_SESSION_LATENCY_BUDGET);
	});

	it('ignores non-finite / negative latency samples', () => {
		const report = reportLatencyBudget([100, NaN, -5, 200, Infinity], { p95DeliveryMs: 500, staleThresholdMs: 2000 });
		expect(report.sampleCount).toBe(2);
		expect(report.measuredMaxMs).toBe(200);
	});

	it('percentile uses nearest-rank and handles edge percentiles', () => {
		expect(percentile([], 95)).toBe(0);
		expect(percentile([10], 95)).toBe(10);
		expect(percentile([1, 2, 3, 4], 100)).toBe(4);
		expect(percentile([1, 2, 3, 4], 0)).toBe(1);
		expect(percentile([1, 2, 3, 4], 50)).toBe(2);
	});

	it('the default budget is the documented near-real-time product target', () => {
		expect(DEFAULT_SESSION_LATENCY_BUDGET).toEqual({ p95DeliveryMs: 500, staleThresholdMs: 2000 });
	});
});

describe('COLLAB-003 — observers receive only visible shared updates', () => {
	it('an observer never receives a dm-only session op', () => {
		const stream = [
			op({ id: 'op-shared', entityType: 'scene', entityId: 'scene-1', opType: 'session.project-player-view' }),
			op({ id: 'op-dm', entityType: 'combat', entityId: 'combat-hidden', opType: 'combat.reveal', value: { note: SECRET } }),
		];
		const visibility = visibilitySource([
			{ entityType: 'scene', entityId: 'scene-1', entity: { level: 'player-visible' } },
			{ entityType: 'combat', entityId: 'combat-hidden', entity: { level: 'dm-only' } },
		]);
		const delivered = deliverableSessionUpdates(
			stream,
			OBSERVER_ACTOR,
			visibility,
			new Set(),
			buildPermissionState(DM_ACTOR, OBSERVER_ACTOR),
		);
		expect(delivered.map((o) => o.id)).toEqual(['op-shared']);
		expect(JSON.stringify(delivered)).not.toContain(SECRET);
	});
});
