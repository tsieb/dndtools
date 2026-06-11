import { describe, expect, it } from 'vitest';
import {
	buildLibrary,
	defaultSizeForType,
	placementTopLeft,
} from '../../src/lib/gui/ux-canvas/widget-library';
import {
	resolveCanvasShortcut,
	toShortcutEvent,
	CANVAS_SHORTCUTS,
} from '../../src/lib/gui/ux-canvas/canvas-shortcuts';

// UX-CANVAS-002 library/insert model + UX-CANVAS-015 canvas keyboard model.

describe('buildLibrary (UX-CANVAS-002)', () => {
	it('groups the catalogue by category', () => {
		const { groups } = buildLibrary('desktop');
		expect(groups.length).toBeGreaterThan(0);
		expect(groups.map((g) => g.category)).toContain('Notes');
	});
	it('filters live by name/type', () => {
		const { groups, matchCount } = buildLibrary('desktop', { search: 'dice' });
		expect(matchCount).toBe(1);
		expect(groups.flatMap((g) => g.items).map((i) => i.type)).toEqual(['dice']);
	});
	it('keeps unsupported widgets but marks them unavailable (CMD-005, not hidden)', () => {
		const mobile = buildLibrary('mobile');
		const map = mobile.groups.flatMap((g) => g.items).find((i) => i.type === 'map');
		expect(map).toBeDefined();
		expect(map?.available).toBe(false);
		expect(map?.unavailableReason).toContain('mobile');
		const desktopMap = buildLibrary('desktop').groups.flatMap((g) => g.items).find((i) => i.type === 'map');
		expect(desktopMap?.available).toBe(true);
	});
});

describe('placement geometry (UX-CANVAS-002 §Default sizes)', () => {
	it('returns the declared default size', () => {
		expect(defaultSizeForType('map')).toEqual({ w: 360, h: 280 });
		expect(defaultSizeForType('note')).toEqual({ w: 240, h: 160 });
	});
	it('centres the widget on the chosen point', () => {
		expect(placementTopLeft({ x: 200, y: 200 }, { w: 100, h: 80 })).toEqual({ x: 150, y: 160 });
	});
	it('clamps a negative origin to zero', () => {
		expect(placementTopLeft({ x: 10, y: 10 }, { w: 100, h: 80 })).toEqual({ x: 0, y: 0 });
	});
});

describe('resolveCanvasShortcut (UX-CANVAS-015)', () => {
	function key(opts: Partial<{ key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }>) {
		return toShortcutEvent({ key: 'x', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...opts });
	}
	it('maps history shortcuts', () => {
		expect(resolveCanvasShortcut(key({ key: 'z', ctrlKey: true }))).toBe('undo');
		expect(resolveCanvasShortcut(key({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe('redo');
		expect(resolveCanvasShortcut(key({ key: 'y', metaKey: true }))).toBe('redo');
	});
	it('maps selection + structural shortcuts', () => {
		expect(resolveCanvasShortcut(key({ key: 'a', ctrlKey: true }))).toBe('select-all');
		expect(resolveCanvasShortcut(key({ key: 'g', ctrlKey: true }))).toBe('group');
		expect(resolveCanvasShortcut(key({ key: 'g', ctrlKey: true, shiftKey: true }))).toBe('ungroup');
	});
	it('maps z-order shortcuts', () => {
		expect(resolveCanvasShortcut(key({ key: ']', ctrlKey: true }))).toBe('z-forward');
		expect(resolveCanvasShortcut(key({ key: ']', ctrlKey: true, shiftKey: true }))).toBe('z-front');
		expect(resolveCanvasShortcut(key({ key: '[', ctrlKey: true }))).toBe('z-backward');
		expect(resolveCanvasShortcut(key({ key: '[', ctrlKey: true, shiftKey: true }))).toBe('z-back');
	});
	it('maps bare keys', () => {
		expect(resolveCanvasShortcut(key({ key: 'w' }))).toBe('open-library');
		expect(resolveCanvasShortcut(key({ key: 'Delete' }))).toBe('delete');
		expect(resolveCanvasShortcut(key({ key: '?' }))).toBe('help');
		expect(resolveCanvasShortcut(key({ key: 'Escape' }))).toBe('escape');
	});
	it('returns null for unrelated / viewport keys', () => {
		expect(resolveCanvasShortcut(key({ key: '1' }))).toBeNull();
		expect(resolveCanvasShortcut(key({ key: '0' }))).toBeNull();
		expect(resolveCanvasShortcut(key({ key: 'ArrowRight' }))).toBeNull();
	});
	it('publishes a non-empty shortcut reference', () => {
		expect(CANVAS_SHORTCUTS.length).toBeGreaterThan(10);
	});
});
