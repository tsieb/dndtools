// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { WidgetBinding, WidgetDataQuerySource, WidgetDataQueryDefinition } from '@dndtools/core';
import { resetCoreStorage } from '../../src/lib/platform/storage/scene-store';
import { SceneRuntime, defaultEnvironment } from '../../src/lib/canvas-runtime/runtime.svelte';
import { resolveWidgetData } from '../../src/lib/gui/ux-canvas/widgets/widget-data';

/**
 * The widget template data resolver maps a widget's declared `dataQueries` onto the actor-FILTERED
 * core read models. Two properties matter most:
 *   1. Every source returns a CONTEXT-SPECIFIC `emptyLabel` (the template shows it for "no data yet"),
 *      not a generic string — this is what TemplateDataTable/TemplateChart render when allRows === 0.
 *   2. The rows are already redacted for the viewing actor, so a DM-only entity never appears for a
 *      non-DM actor (the no-leak boundary lives in the core query, never in the GUI).
 *
 * A freshly loaded runtime seeds the demo MAP state but leaves scenes / characters / notes empty,
 * which is exactly what we need to exercise both the populated and the empty paths.
 */

function query(source: WidgetDataQuerySource): WidgetDataQueryDefinition {
	return { id: source, label: source, source, requiredCapability: 'viewer', audience: 'shared' };
}

describe('resolveWidgetData — context-specific empty labels', () => {
	let runtime: SceneRuntime;
	beforeEach(async () => {
		await resetCoreStorage();
		runtime = new SceneRuntime({ env: defaultEnvironment(), defaultActorId: 'local-dm' });
		await runtime.load();
	});

	it('returns the source-specific empty label for each empty read model', () => {
		const labels = (source: WidgetDataQuerySource) =>
			resolveWidgetData(runtime, 'local-dm', query(source)).emptyLabel;
		expect(labels('selected-scene')).toBe('No scenes yet.');
		expect(labels('visible-characters')).toBe('No party members yet.');
		expect(labels('maps')).toBe('No maps yet.');
		expect(labels('notes')).toBe('No notes yet.');
		expect(labels('content-objects')).toBe('No notes yet.');
		expect(labels('current-combatants')).toBe('No combatants in the tracker.');
	});

	it('reports no rows (and the empty label) for the empty scene / character / notes models', () => {
		for (const source of ['selected-scene', 'visible-characters', 'notes'] as const) {
			expect(resolveWidgetData(runtime, 'local-dm', query(source)).rows).toEqual([]);
		}
	});

	it('current-combatants carries a "No combat running" header when no combat is live', () => {
		const result = resolveWidgetData(runtime, 'local-dm', query('current-combatants'));
		expect(result.header).toBe('No combat running');
		expect(result.rows).toEqual([]);
	});

	it('session-state has no empty label (it always has a single workflow row)', () => {
		const result = resolveWidgetData(runtime, 'local-dm', query('session-state'));
		expect(result.emptyLabel).toBe('');
		expect(result.rows.map((r) => r.primary)).toEqual(['Workflow']);
	});

	it('an unknown source fails soft to the generic empty result', () => {
		const result = resolveWidgetData(runtime, 'local-dm', query('does-not-exist' as WidgetDataQuerySource));
		expect(result).toEqual({ rows: [], emptyLabel: 'Nothing here yet.' });
	});
});

describe('resolveWidgetData — binding source', () => {
	let runtime: SceneRuntime;
	beforeEach(async () => {
		await resetCoreStorage();
		runtime = new SceneRuntime({ env: defaultEnvironment(), defaultActorId: 'local-dm' });
		await runtime.load();
	});

	it('reports "No data source bound." with no rows when the binding is absent', () => {
		const result = resolveWidgetData(runtime, 'local-dm', query('binding'), null);
		expect(result).toEqual({ rows: [], emptyLabel: 'No data source bound.' });
	});

	it('emits a single descriptor row for a present binding', () => {
		const binding: WidgetBinding = {
			source: { entityType: 'character', entityId: 'char-aelar' },
			mode: 'read',
			requiredCapability: 'viewer',
		};
		const result = resolveWidgetData(runtime, 'local-dm', query('binding'), binding);
		expect(result.rows).toEqual([
			{ id: 'char-aelar', primary: 'char-aelar', meta: 'character' },
		]);
	});
});

describe('resolveWidgetData — maps source is actor-redacted (no-leak)', () => {
	let runtime: SceneRuntime;
	beforeEach(async () => {
		await resetCoreStorage();
		runtime = new SceneRuntime({ env: defaultEnvironment(), defaultActorId: 'local-dm' });
		await runtime.load();
	});

	it('lists the DM-only map for the DM but never for a player', () => {
		const dmNames = resolveWidgetData(runtime, 'local-dm', query('maps')).rows.map((r) => r.primary);
		expect(dmNames).toContain('Western Reaches');
		expect(dmNames).toContain('Hidden Outpost'); // dm-only demo map, visible to the DM

		runtime.setActiveActor('actor-player');
		const playerNames = resolveWidgetData(runtime, 'actor-player', query('maps')).rows.map(
			(r) => r.primary,
		);
		expect(playerNames).toContain('Western Reaches'); // player-visible map still listed
		expect(playerNames).not.toContain('Hidden Outpost'); // the dm-only map is redacted, not hidden
	});
});
