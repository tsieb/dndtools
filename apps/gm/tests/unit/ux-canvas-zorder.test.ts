import { describe, expect, it } from 'vitest';
import {
	bringForward,
	bringToFront,
	resolveZOrder,
	sendBackward,
	sendToBack,
	zOrderAnnouncement,
	type ZWidget,
} from '../../src/lib/gui/ux-canvas/z-order';

// UX-CANVAS-006: z-order math (bring to front / send to back / forward / backward).

const widgets: ZWidget[] = [
	{ id: 'a', z: 0 },
	{ id: 'b', z: 1 },
	{ id: 'c', z: 2 },
];

describe('bringToFront / sendToBack', () => {
	it('brings a widget above the current max', () => {
		expect(bringToFront(widgets, 'a')).toBe(3);
	});
	it('is a no-op when already uniquely on top', () => {
		expect(bringToFront(widgets, 'c')).toBeNull();
	});
	it('sends a widget below the current min', () => {
		expect(sendToBack(widgets, 'c')).toBe(-1);
	});
	it('is a no-op when already uniquely on bottom', () => {
		expect(sendToBack(widgets, 'a')).toBeNull();
	});
});

describe('bringForward / sendBackward', () => {
	it('moves a widget one step up', () => {
		expect(bringForward(widgets, 'a')).toBe(2); // above b (z=1) → 1+1
	});
	it('moves a widget one step down', () => {
		expect(sendBackward(widgets, 'c')).toBe(0); // below b (z=1) → 1-1
	});
	it('returns null at the top/bottom', () => {
		expect(bringForward(widgets, 'c')).toBeNull();
		expect(sendBackward(widgets, 'a')).toBeNull();
	});
});

describe('resolveZOrder + announcements', () => {
	it('dispatches each op', () => {
		expect(resolveZOrder(widgets, 'a', 'front')).toBe(3);
		expect(resolveZOrder(widgets, 'c', 'back')).toBe(-1);
		expect(resolveZOrder(widgets, 'a', 'forward')).toBe(2);
		expect(resolveZOrder(widgets, 'c', 'backward')).toBe(0);
	});
	it('announces the operation', () => {
		expect(zOrderAnnouncement('Note widget', 'front')).toBe('Note widget brought to front.');
		expect(zOrderAnnouncement('Note widget', 'forward')).toContain('up one level');
	});
});
