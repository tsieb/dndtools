import { beforeEach, describe, expect, it } from 'vitest';
import {
	BLOCK_PROPERTY_SCHEMAS,
	COMMAND_CENTER_LAYOUT_KEY,
	DashboardLayoutStore,
	MIN_BLOCK_H,
	MIN_BLOCK_W,
	blockTitle,
	commandCenterDefaultBlocks,
	type DashboardBlock,
} from '../../src/lib/gui/ux-canvas/dashboard/dashboard-layout.svelte';
import { CanvasModeStore } from '../../src/lib/gui/ux-canvas/dashboard/canvas-mode.svelte';
import { ViewportController } from '../../src/lib/canvas-runtime/viewport-controller.svelte';

// Command Center redesign: the spatial-dashboard layout store (geometry + per-widget display
// options, device-local) and the view/edit mode store. The SAME store class powers every spatial
// surface: the Command Center instantiates it LOCKED (fixed widget set — §4), other scenes
// unlocked (full add/remove), so full edit elsewhere needs no refactoring (deliverable §8.8).

function ccStore(): DashboardLayoutStore {
	return new DashboardLayoutStore({
		storageKey: COMMAND_CENTER_LAYOUT_KEY,
		defaults: commandCenterDefaultBlocks(),
		locked: true,
	});
}

function extraBlock(id = 'extra'): DashboardBlock {
	return {
		id,
		type: 'notes',
		rect: { x: 10, y: 10, w: 200, h: 150 },
		z: 1,
		config: {},
	};
}

beforeEach(() => {
	window.localStorage.clear();
});

describe('authored Command Center default board', () => {
	it('covers the full widget catalog with non-overlapping, curated rects', () => {
		const blocks = commandCenterDefaultBlocks();
		const types = blocks.map((b) => b.type);
		for (const required of [
			'session',
			'data-hub',
			'player-views',
			'tools',
			'atlas',
			'combat',
			'notes',
			'characters',
			'search',
			'getting-started',
		]) {
			expect(types).toContain(required);
		}
		// Curated means non-overlapping: no two block rects intersect.
		for (let i = 0; i < blocks.length; i += 1) {
			for (let j = i + 1; j < blocks.length; j += 1) {
				const a = blocks[i]!.rect;
				const b = blocks[j]!.rect;
				const overlap =
					a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
				expect(overlap, `${blocks[i]!.id} overlaps ${blocks[j]!.id}`).toBe(false);
			}
		}
	});

	it('every widget type has a Properties Panel schema and a default title', () => {
		for (const block of commandCenterDefaultBlocks()) {
			expect(BLOCK_PROPERTY_SCHEMAS[block.type].length).toBeGreaterThan(0);
			expect(blockTitle(block)).not.toBe('');
		}
	});
});

describe('geometry edits + persistence', () => {
	it('move/resize round and clamp to the minimum block size', () => {
		const store = ccStore();
		store.move('notes', -50, 12.6);
		expect(store.get('notes')!.rect.x).toBe(0);
		expect(store.get('notes')!.rect.y).toBe(13);
		store.resize('notes', 10, 10);
		expect(store.get('notes')!.rect.w).toBe(MIN_BLOCK_W);
		expect(store.get('notes')!.rect.h).toBe(MIN_BLOCK_H);
	});

	it('a moved layout persists and is restored by load() over the authored defaults', () => {
		const store = ccStore();
		store.move('combat', 555, 333);
		store.configure('data-hub', 'title', 'Library');

		const fresh = ccStore();
		expect(fresh.get('combat')!.rect.x).not.toBe(555); // defaults until load()
		fresh.load();
		expect(fresh.get('combat')!.rect.x).toBe(555);
		expect(fresh.get('combat')!.rect.y).toBe(333);
		expect(blockTitle(fresh.get('data-hub')!)).toBe('Library');
	});

	it('reset() restores the authored board and clears the persisted layout', () => {
		const store = ccStore();
		const original = store.get('combat')!.rect.x;
		store.move('combat', 555, 333);
		store.reset();
		expect(store.get('combat')!.rect.x).toBe(original);
		const fresh = ccStore();
		fresh.load();
		expect(fresh.get('combat')!.rect.x).toBe(original);
	});

	it('corrupt persisted data is ignored (authored defaults stay)', () => {
		window.localStorage.setItem(COMMAND_CENTER_LAYOUT_KEY, '{not json');
		const store = ccStore();
		store.load();
		expect(store.blocks.length).toBe(commandCenterDefaultBlocks().length);
	});

	it('bringToFront assigns the top z', () => {
		const store = ccStore();
		const top = Math.max(...store.blocks.map((b) => b.z));
		store.bringToFront('session');
		expect(store.get('session')!.z).toBe(top + 1);
	});

	it('setRect validates partial updates (Properties Panel layout fields)', () => {
		const store = ccStore();
		store.setRect('search', { w: 12, x: -4 });
		expect(store.get('search')!.rect.w).toBe(MIN_BLOCK_W);
		expect(store.get('search')!.rect.x).toBe(0);
	});
});

describe('locked vs unlocked widget set (§4 / §8.8)', () => {
	it('the locked Command Center board fails add/remove closed', () => {
		const store = ccStore();
		expect(store.add(extraBlock())).toBe(false);
		expect(store.get('extra')).toBeUndefined();
		expect(store.remove('notes')).toBe(false);
		expect(store.get('notes')).toBeDefined();
	});

	it('an unlocked scene board supports full add/remove with the same API', () => {
		const store = new DashboardLayoutStore({
			storageKey: 'dndtools:v2:test-scene-board',
			defaults: commandCenterDefaultBlocks(),
			locked: false,
		});
		expect(store.add(extraBlock())).toBe(true);
		expect(store.get('extra')).toBeDefined();
		expect(store.remove('extra')).toBe(true);
		expect(store.get('extra')).toBeUndefined();
	});

	it('a stale persisted entry for an unknown widget is dropped on a locked board', () => {
		const unlocked = new DashboardLayoutStore({
			storageKey: COMMAND_CENTER_LAYOUT_KEY,
			defaults: commandCenterDefaultBlocks(),
			locked: false,
		});
		unlocked.add(extraBlock());

		const locked = ccStore();
		locked.load();
		expect(locked.get('extra')).toBeUndefined();
	});
});

describe('CanvasModeStore (view/edit + selection)', () => {
	it('selection only exists in edit mode and clears on mode exit', () => {
		const mode = new CanvasModeStore();
		mode.select('session');
		expect(mode.selectedId).toBeNull(); // fail closed: no selection in view mode
		mode.setMode('edit');
		mode.select('session');
		expect(mode.selectedId).toBe('session');
		mode.setMode('view');
		expect(mode.selectedId).toBeNull();
	});

	it('toggle flips between view and edit', () => {
		const mode = new CanvasModeStore();
		mode.toggle();
		expect(mode.isEdit).toBe(true);
		mode.toggle();
		expect(mode.mode).toBe('view');
	});
});

describe('ViewportController fit insets (floating chrome clearance §3)', () => {
	it('zoomToFit honours the reserved chrome insets', () => {
		const c = new ViewportController();
		c.setSize({ w: 1000, h: 700 });
		c.setContentRects([{ x: 0, y: 0, w: 1240, h: 656 }]);
		c.setFitInsets({ top: 64, right: 24, bottom: 64, left: 24 });
		c.zoomToFit();
		// Content top-left lands at/inside the inset origin (never under the floating chrome).
		const v = c.viewport;
		expect(v.ty).toBeGreaterThanOrEqual(64);
		expect(v.tx).toBeGreaterThanOrEqual(24);
		// The fitted content also fits inside the inset-reduced area.
		expect(656 * v.scale).toBeLessThanOrEqual(700 - 128 + 1);
		expect(1240 * v.scale).toBeLessThanOrEqual(1000 - 48 + 1);
	});
});
