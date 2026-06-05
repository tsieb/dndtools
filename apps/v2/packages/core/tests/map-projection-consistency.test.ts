import { describe, expect, it } from 'vitest';
import {
	auditMapProjectionConsistency,
	getMapProjectionConsistencyForActor,
	normalizeMapEntity,
	normalizeMapLayer,
	type MapEntity,
	type MapLayer,
	type MapProjectionInput,
} from '../src';

function layer(id: string, visibility: MapLayer['visibility']): MapLayer {
	return normalizeMapLayer({
		id,
		name: id,
		category: 'dm-annotations',
		visibility,
		enabled: true,
		opacity: 1,
	});
}

function mapWith(layers: MapLayer[]): MapEntity {
	return normalizeMapEntity({
		id: 'map-1',
		name: 'Map One',
		description: '',
		visibility: 'player-visible',
		layers,
		regions: [],
		defaultRegionId: null,
		updatedAt: null as never,
		revision: 1,
	});
}

describe('MAP-016 pre-projection visibility consistency', () => {
	it('AC1: a player-visible route referencing a hidden POI BLOCKS projection', () => {
		const input: MapProjectionInput = {
			map: mapWith([layer('visible-layer', 'player-visible'), layer('dm-layer', 'dm-only')]),
			pois: [{ id: 'poi-hidden', layerId: 'dm-layer', visibility: 'dm-only' }],
			routes: [
				{
					id: 'route-1',
					layerId: 'visible-layer',
					visibility: 'player-visible',
					poiIds: ['poi-hidden'],
				},
			],
		};
		const report = auditMapProjectionConsistency(input);
		expect(report.blocked).toBe(true);
		expect(report.problems).toContainEqual(
			expect.objectContaining({
				kind: 'visible-route-references-hidden-poi',
				severity: 'error',
				elementId: 'route-1',
				relatedElementId: 'poi-hidden',
			}),
		);
		// Non-leaking: the report carries only references, never the hidden POI's name/value.
		expect(JSON.stringify(report)).not.toContain('Map One'); // no titles
	});

	it('a player-visible route whose POIs are all visible does NOT block', () => {
		const input: MapProjectionInput = {
			map: mapWith([layer('visible-layer', 'player-visible')]),
			pois: [{ id: 'poi-ok', layerId: 'visible-layer', visibility: 'player-visible' }],
			routes: [
				{
					id: 'route-ok',
					layerId: 'visible-layer',
					visibility: 'player-visible',
					poiIds: ['poi-ok'],
				},
			],
		};
		const report = auditMapProjectionConsistency(input);
		expect(report.blocked).toBe(false);
		expect(report.problems).toEqual([]);
	});

	it('AC2: a hidden token whose omission would mislead a visible overlay BLOCKS projection', () => {
		const input: MapProjectionInput = {
			map: mapWith([layer('overlay', 'player-visible')]),
			tokens: [
				{
					id: 'token-ghost',
					layerId: 'overlay',
					visibility: 'dm-only',
					overlayDependsOnPresence: true,
				},
			],
		};
		const report = auditMapProjectionConsistency(input);
		expect(report.blocked).toBe(true);
		expect(report.problems).toContainEqual(
			expect.objectContaining({
				kind: 'visible-overlay-omits-required-token',
				severity: 'error',
				elementId: 'token-ghost',
			}),
		);
	});

	it('AC3: a hidden token safely omitted from a DM-only overlay is a NON-blocking warning', () => {
		const input: MapProjectionInput = {
			map: mapWith([layer('dm-overlay', 'dm-only'), layer('public', 'player-visible')]),
			tokens: [{ id: 'token-safe', layerId: 'dm-overlay', visibility: 'dm-only' }],
		};
		const report = auditMapProjectionConsistency(input);
		expect(report.blocked).toBe(false);
		expect(report.problems).toContainEqual(
			expect.objectContaining({
				kind: 'safely-omitted-hidden-token',
				severity: 'warning',
				elementId: 'token-safe',
			}),
		);
	});

	it('a hidden token on a player-visible layer that does NOT mislead is a non-blocking notice', () => {
		const input: MapProjectionInput = {
			map: mapWith([layer('public', 'player-visible')]),
			tokens: [{ id: 'token-extra', layerId: 'public', visibility: 'dm-only' }],
		};
		const report = auditMapProjectionConsistency(input);
		expect(report.blocked).toBe(false);
		expect(report.problems).toContainEqual(
			expect.objectContaining({ kind: 'hidden-content-on-visible-layer', severity: 'warning' }),
		);
	});

	it('a player-visible nested-map link to a hidden child map BLOCKS projection', () => {
		const input: MapProjectionInput = {
			map: mapWith([layer('public', 'player-visible')]),
			nestedLinks: [
				{
					id: 'link-1',
					parentLayerId: 'public',
					visibility: 'player-visible',
					childMapId: 'map-secret',
				},
			],
			childMapVisibility: { 'map-secret': 'dm-only' },
		};
		const report = auditMapProjectionConsistency(input);
		expect(report.blocked).toBe(true);
		expect(report.problems).toContainEqual(
			expect.objectContaining({
				kind: 'visible-link-targets-hidden-map',
				relatedElementId: 'map-secret',
			}),
		);
	});

	it('a fully player-visible map with no hidden references projects cleanly', () => {
		const input: MapProjectionInput = {
			map: mapWith([layer('public', 'player-visible')]),
			pois: [{ id: 'poi', layerId: 'public', visibility: 'player-visible' }],
			tokens: [{ id: 'tok', layerId: 'public', visibility: 'player-visible' }],
			routes: [{ id: 'r', layerId: 'public', visibility: 'player-visible', poiIds: ['poi'] }],
		};
		const report = auditMapProjectionConsistency(input);
		expect(report.blocked).toBe(false);
		expect(report.problems).toEqual([]);
	});

	it('the report is DM-only: a non-DM actor receives null (never leaked)', () => {
		const input: MapProjectionInput = { map: mapWith([layer('public', 'player-visible')]) };
		expect(getMapProjectionConsistencyForActor(input, 'dm')).not.toBeNull();
		expect(getMapProjectionConsistencyForActor(input, 'player')).toBeNull();
		expect(getMapProjectionConsistencyForActor(input, 'observer')).toBeNull();
	});
});
