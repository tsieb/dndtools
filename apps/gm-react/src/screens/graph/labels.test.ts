import { describe, expect, it } from 'vitest';
import { placeLabels, type LabelSlot, type Rect } from './presentation';

// RC-KNW-6.5 — the label collision pass, on plain boxes.

const bounds: Rect = { left: 0, top: 0, width: 600, height: 400 };

/** A 48px node centred at (x, y) and a w×16 label in its home slot just below it. */
function slot(id: string, x: number, y: number, w = 100): LabelSlot {
	return {
		id,
		node: { left: x - 24, top: y - 24, width: 48, height: 48 },
		label: { left: x - w / 2, top: y + 26, width: w, height: 16 },
	};
}

function placed(slots: LabelSlot[], offsets: Map<string, { dx: number; dy: number }>): Rect[] {
	return slots.map((s) => {
		const o = offsets.get(s.id)!;
		return { ...s.label, left: s.label.left + o.dx, top: s.label.top + o.dy };
	});
}

const overlaps = (a: Rect, b: Rect) =>
	Math.min(a.left + a.width, b.left + b.width) > Math.max(a.left, b.left) &&
	Math.min(a.top + a.height, b.top + b.height) > Math.max(a.top, b.top);

describe('placeLabels', () => {
	it('leaves a label that collides with nothing in its home slot below the node', () => {
		const offsets = placeLabels([slot('a', 100, 100), slot('b', 400, 100)], bounds);
		expect(offsets.get('a')).toEqual({ dx: 0, dy: 0 });
		expect(offsets.get('b')).toEqual({ dx: 0, dy: 0 });
	});

	it('moves the later of two overprinting labels and keeps the first in place', () => {
		const slots = [slot('a', 200, 100), slot('b', 260, 100)];
		const offsets = placeLabels(slots, bounds);
		expect(offsets.get('a')).toEqual({ dx: 0, dy: 0 });
		expect(offsets.get('b')).not.toEqual({ dx: 0, dy: 0 });
		const [a, b] = placed(slots, offsets);
		expect(overlaps(a!, b!)).toBe(false);
	});

	it('separates a crowded row of labels without covering a node or leaving the canvas', () => {
		const slots = Array.from({ length: 7 }, (_, i) => slot(`n${i}`, 60 + i * 80, 200, 120));
		const boxes = placed(slots, placeLabels(slots, bounds));
		for (let i = 0; i < boxes.length; i++) {
			for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false);
			for (const other of slots) expect(overlaps(boxes[i]!, other.node)).toBe(false);
			expect(boxes[i]!.left).toBeGreaterThanOrEqual(0);
			expect(boxes[i]!.left + boxes[i]!.width).toBeLessThanOrEqual(bounds.width);
		}
	});

	it('keeps names off an on-canvas control', () => {
		const control: Rect = { left: 40, top: 120, width: 120, height: 32 };
		const slots = [slot('a', 100, 100)];
		const [box] = placed(slots, placeLabels(slots, bounds, [control]));
		expect(overlaps(box!, control)).toBe(false);
	});

	it('pulls a label at the canvas edge back inside it', () => {
		const slots = [slot('a', 300, 370)];
		const [box] = placed(slots, placeLabels(slots, bounds));
		expect(box!.top + box!.height).toBeLessThanOrEqual(bounds.height);
	});
});
