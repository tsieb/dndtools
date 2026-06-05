import { describe, expect, it } from 'vitest';
import {
	appendFogOp,
	createPoi,
	createRoute,
	createToken,
	deletePoi,
	isNormalizedPoint,
	isNormalizedRegion,
	moveToken,
	removeFogOp,
	updatePoi,
	updateRoute,
	updateToken,
	type MapFogOp,
	type MapPoi,
	type MapRoute,
	type MapToken,
} from '../src';

/**
 * MAP-010/011/012/013/019 — pure annotation reducers. Deterministic, side-effect-free, fail-closed on
 * out-of-bounds coordinates / empty labels / degenerate routes, and they never mutate their input.
 */

const STAMP = { actorId: 'actor-dm', now: '2026-06-04T00:00:00.000Z' };

describe('normalized-space guards', () => {
	it('accepts in-bounds points and rejects out-of-bounds', () => {
		expect(isNormalizedPoint({ x: 0, y: 1 })).toBe(true);
		expect(isNormalizedPoint({ x: -0.01, y: 0.5 })).toBe(false);
		expect(isNormalizedPoint({ x: 0.5, y: 1.5 })).toBe(false);
		expect(isNormalizedPoint({ x: Number.NaN, y: 0.5 })).toBe(false);
	});

	it('validates fog regions stay within the map', () => {
		expect(isNormalizedRegion({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 })).toBe(true);
		expect(isNormalizedRegion({ x: 0.8, y: 0.1, w: 0.5, h: 0.2 })).toBe(false); // overruns width
		expect(isNormalizedRegion({ x: 0.1, y: 0.1, w: 0, h: 0.2 })).toBe(false); // zero width
	});
});

describe('MAP-010 POI reducers', () => {
	const pois: MapPoi[] = [];

	it('creates a POI in normalized space with its own visibility and links', () => {
		const result = createPoi(
			pois,
			{
				id: 'poi-1',
				layerId: 'layer-1',
				label: 'Tower',
				category: 'landmark',
				position: { x: 0.5, y: 0.5 },
				visibility: 'dm-only',
				notes: 'secret',
				linkedEntityType: 'note',
				linkedEntityId: 'note-1',
			},
			STAMP,
		);
		expect('created' in result).toBe(true);
		if ('created' in result) {
			expect(result.created.position).toEqual({ x: 0.5, y: 0.5 });
			expect(result.created.visibility).toBe('dm-only');
			expect(result.created.linkedEntityId).toBe('note-1');
			expect(result.created.revision).toBe(1);
		}
	});

	it('rejects an out-of-bounds position and an empty label fail-closed', () => {
		const bad = createPoi(
			pois,
			{ id: 'p', layerId: 'l', label: 'X', category: 'other', position: { x: 2, y: 0 }, visibility: 'dm-only' },
			STAMP,
		);
		expect('error' in bad && bad.error.kind).toBe('invalid-position');
		const empty = createPoi(
			pois,
			{ id: 'p', layerId: 'l', label: '  ', category: 'other', position: { x: 0, y: 0 }, visibility: 'dm-only' },
			STAMP,
		);
		expect('error' in empty && empty.error.kind).toBe('invalid-label');
	});

	it('moves/re-categorizes/re-targets visibility independently and bumps revision', () => {
		const created = createPoi(
			pois,
			{ id: 'poi-2', layerId: 'l', label: 'Camp', category: 'other', position: { x: 0.2, y: 0.2 }, visibility: 'dm-only' },
			STAMP,
		);
		if (!('created' in created)) throw new Error('create failed');
		const moved = updatePoi(created.pois, 'poi-2', { position: { x: 0.8, y: 0.9 }, visibility: 'player-visible' }, STAMP);
		if (!('updated' in moved)) throw new Error('update failed');
		expect(moved.updated.position).toEqual({ x: 0.8, y: 0.9 });
		expect(moved.updated.visibility).toBe('player-visible');
		expect(moved.updated.revision).toBe(2);
		// Input array untouched.
		expect(created.pois.find((p) => p.id === 'poi-2')!.position).toEqual({ x: 0.2, y: 0.2 });
	});

	it('deletes a POI and reports not-found for an unknown id', () => {
		const created = createPoi(pois, { id: 'poi-3', layerId: 'l', label: 'Z', category: 'other', position: { x: 0, y: 0 }, visibility: 'dm-only' }, STAMP);
		if (!('created' in created)) throw new Error('create failed');
		const del = deletePoi(created.pois, 'poi-3');
		expect('pois' in del && del.pois).toHaveLength(0);
		expect('error' in deletePoi(created.pois, 'nope')).toBe(true);
	});
});

describe('MAP-013 route reducers', () => {
	const routes: MapRoute[] = [];
	it('creates a route from >=2 waypoints', () => {
		const result = createRoute(
			routes,
			{
				id: 'route-1',
				layerId: 'l',
				label: 'March',
				visibility: 'player-visible',
				waypoints: [
					{ id: 'w1', position: { x: 0.1, y: 0.1 } },
					{ id: 'w2', position: { x: 0.4, y: 0.5 }, linkedEntityType: 'poi', linkedEntityId: 'poi-1' },
				],
			},
			STAMP,
		);
		expect('created' in result).toBe(true);
		if ('created' in result) {
			expect(result.created.waypoints).toHaveLength(2);
			expect(result.created.waypoints[1]!.linkedEntityId).toBe('poi-1');
		}
	});

	it('rejects a single-waypoint route and an out-of-bounds waypoint', () => {
		const tooFew = createRoute(routes, { id: 'r', layerId: 'l', label: 'X', visibility: 'dm-only', waypoints: [{ id: 'w', position: { x: 0, y: 0 } }] }, STAMP);
		expect('error' in tooFew && tooFew.error.kind).toBe('empty-route');
		const oob = createRoute(
			routes,
			{ id: 'r', layerId: 'l', label: 'X', visibility: 'dm-only', waypoints: [{ id: 'w1', position: { x: 0, y: 0 } }, { id: 'w2', position: { x: 5, y: 0 } }] },
			STAMP,
		);
		expect('error' in oob && oob.error.kind).toBe('invalid-position');
	});

	it('updates waypoints and bumps revision', () => {
		const created = createRoute(routes, { id: 'route-2', layerId: 'l', label: 'X', visibility: 'dm-only', waypoints: [{ id: 'w1', position: { x: 0, y: 0 } }, { id: 'w2', position: { x: 0.5, y: 0.5 } }] }, STAMP);
		if (!('created' in created)) throw new Error('create failed');
		const updated = updateRoute(created.routes, 'route-2', { waypoints: [{ id: 'w1', position: { x: 0.1, y: 0.1 } }, { id: 'w2', position: { x: 0.2, y: 0.2 } }, { id: 'w3', position: { x: 0.3, y: 0.3 } }] }, STAMP);
		if (!('updated' in updated)) throw new Error('update failed');
		expect(updated.updated.waypoints).toHaveLength(3);
		expect(updated.updated.revision).toBe(2);
	});
});

describe('MAP-012 fog reducers (append-only, ordered)', () => {
	const fog: MapFogOp[] = [];
	it('appends fog ops with increasing sequence', () => {
		const first = appendFogOp(fog, { id: 'fog-1', layerId: 'l', kind: 'reveal', region: { x: 0, y: 0, w: 0.5, h: 0.5 }, visibility: 'shared' }, STAMP);
		if (!('appended' in first)) throw new Error('append failed');
		expect(first.appended.sequence).toBe(1);
		const second = appendFogOp(first.fog, { id: 'fog-2', layerId: 'l', kind: 'conceal', region: { x: 0.5, y: 0.5, w: 0.4, h: 0.4 }, visibility: 'shared' }, STAMP);
		if (!('appended' in second)) throw new Error('append failed');
		expect(second.appended.sequence).toBe(2);
	});

	it('rejects an out-of-bounds region', () => {
		const bad = appendFogOp(fog, { id: 'f', layerId: 'l', kind: 'reveal', region: { x: 0.9, y: 0, w: 0.5, h: 0.1 }, visibility: 'shared' }, STAMP);
		expect('error' in bad && bad.error.kind).toBe('invalid-region');
	});

	it('removes a fog op by id', () => {
		const appended = appendFogOp(fog, { id: 'fog-x', layerId: 'l', kind: 'reveal', region: { x: 0, y: 0, w: 0.2, h: 0.2 }, visibility: 'shared' }, STAMP);
		if (!('appended' in appended)) throw new Error('append failed');
		const removed = removeFogOp(appended.fog, 'fog-x');
		expect('fog' in removed && removed.fog.some((o) => o.id === 'fog-x')).toBe(false);
	});
});

describe('MAP-019 token reducers', () => {
	const tokens: MapToken[] = [];
	it('creates a token recording linked actor, position, size, visibility, controller', () => {
		const result = createToken(
			tokens,
			{ id: 'token-1', layerId: 'l', label: 'Hero', linkedActorId: 'actor-player', position: { x: 0.3, y: 0.3 }, size: 1, visibility: 'shared', controllerActorId: 'actor-player' },
			STAMP,
		);
		expect('created' in result).toBe(true);
		if ('created' in result) {
			expect(result.created.linkedActorId).toBe('actor-player');
			expect(result.created.controllerActorId).toBe('actor-player');
			expect(result.created.size).toBe(1);
		}
	});

	it('rejects a non-positive size', () => {
		const bad = createToken(tokens, { id: 't', layerId: 'l', label: 'X', position: { x: 0, y: 0 }, size: 0, visibility: 'dm-only' }, STAMP);
		expect('error' in bad && bad.error.kind).toBe('invalid-size');
	});

	it('moves a token and reports from/to for distance computation', () => {
		const created = createToken(tokens, { id: 'token-2', layerId: 'l', label: 'X', position: { x: 0.1, y: 0.1 }, size: 1, visibility: 'dm-only' }, STAMP);
		if (!('created' in created)) throw new Error('create failed');
		const moved = moveToken(created.tokens, 'token-2', { position: { x: 0.4, y: 0.5 } }, STAMP);
		if (!('moved' in moved)) throw new Error('move failed');
		expect(moved.fromPosition).toEqual({ x: 0.1, y: 0.1 });
		expect(moved.toPosition).toEqual({ x: 0.4, y: 0.5 });
		expect(moved.moved.revision).toBe(2);
	});

	it('updates visibility/controller without moving', () => {
		const created = createToken(tokens, { id: 'token-3', layerId: 'l', label: 'X', position: { x: 0.1, y: 0.1 }, size: 1, visibility: 'dm-only' }, STAMP);
		if (!('created' in created)) throw new Error('create failed');
		const updated = updateToken(created.tokens, 'token-3', { visibility: 'player-visible', controllerActorId: 'actor-player' }, STAMP);
		if (!('updated' in updated)) throw new Error('update failed');
		expect(updated.updated.visibility).toBe('player-visible');
		expect(updated.updated.controllerActorId).toBe('actor-player');
		expect(updated.updated.position).toEqual({ x: 0.1, y: 0.1 });
	});
});
