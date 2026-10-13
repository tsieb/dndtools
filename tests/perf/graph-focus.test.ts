import { describe, expect, it } from 'vitest';
import { limitCanvasNodes } from '../../apps/gm-react/src/screens/graph/interaction';

describe('large graph focus admission', () => {
	it('retains a late-sorted hub and distinct selection before its 160 neighbours', () => {
		const neighbours = Array.from({ length: 160 }, (_, i) => ({
			id: `A${String(i).padStart(3, '0')}`,
			degree: 1,
		}));
		const nodes = [...neighbours, { id: 'Y Selected', degree: 0 }, { id: 'Z Hub', degree: 160 }];
		const pinned = new Set(['Y Selected', 'Z Hub', ...neighbours.map((n) => n.id)]);
		const result = limitCanvasNodes(nodes, pinned);
		expect(result).toHaveLength(150);
		expect(result.map((n) => n.id)).toEqual([
			...neighbours.slice(0, 148).map((n) => n.id),
			'Y Selected',
			'Z Hub',
		]);
	});
	it('does not spend slots on filtered or unavailable anchors', () => {
		const nodes = [
			{ id: 'a', degree: 1 },
			{ id: 'b', degree: 2 },
			{ id: 'c', degree: 3 },
		];
		expect(limitCanvasNodes(nodes, new Set(['hidden', 'a']), 2).map((n) => n.id)).toEqual([
			'a',
			'c',
		]);
	});
});
