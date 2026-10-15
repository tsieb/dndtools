import { describe, expect, it } from 'vitest';
import { indexConnections, limitCanvasNodes, showNodeLabel, walkNode } from './interaction';
import type { GraphVisualization } from '@dndtools/core';

describe('graph interaction', () => {
	it('indexes directed, duplicate and self links without admitting missing nodes', () => {
		const viz = {
			nodes: [{ id: 'a' }, { id: 'b' }],
			edges: [
				{ fromId: 'a', toId: 'b' },
				{ fromId: 'b', toId: 'a' },
				{ fromId: 'a', toId: 'a' },
				{ fromId: 'hidden', toId: 'a' },
			],
		} as GraphVisualization;
		const index = indexConnections(viz);
		expect([...index.get('a')!.neighbors]).toEqual(['b', 'a']);
		expect(index.get('a')!.edges).toHaveLength(3);
		expect(index.get('b')!.edges).toHaveLength(2);
		expect(index.has('hidden')).toBe(false);
	});
	it('walks the rendered subset with wrapping and endpoints', () => {
		expect(walkNode(['a', 'b'], 'b', 'ArrowRight')).toBe('a');
		expect(walkNode(['a', 'b'], 'a', 'ArrowUp')).toBe('b');
		expect(walkNode(['a', 'b'], 'a', 'End')).toBe('b');
		expect(walkNode(['a', 'b'], 'b', 'Home')).toBe('a');
		expect(walkNode([], 'a', 'ArrowDown')).toBeUndefined();
		expect(walkNode(['a'], 'a', 'Enter')).toBeUndefined();
	});
	it('reduces label density by viewport and always reveals emphasized nodes', () => {
		expect(showNodeLabel(24, false, false)).toBe(true);
		expect(showNodeLabel(25, false, false)).toBe(false);
		expect(showNodeLabel(13, true, false)).toBe(false);
		expect(showNodeLabel(1000, true, true)).toBe(true);
	});
	it('draws every node up to the canvas limit, then pins and ranks by degree in list order', () => {
		const nodes = [
			{ id: 'a', degree: 1 },
			{ id: 'b', degree: 5 },
			{ id: 'c', degree: 0 },
			{ id: 'd', degree: 5 },
			{ id: 'e', degree: 3 },
		];
		expect(limitCanvasNodes(nodes, new Set(), 5)).toBe(nodes);
		expect(limitCanvasNodes(nodes, new Set(), 3).map((n) => n.id)).toEqual(['b', 'd', 'e']);
		expect(limitCanvasNodes(nodes, new Set(['c']), 3).map((n) => n.id)).toEqual(['b', 'c', 'd']);
		expect(limitCanvasNodes(nodes, new Set(['a', 'c', 'e', 'x']), 2).map((n) => n.id)).toEqual([
			'a',
			'c',
		]);
	});
});
