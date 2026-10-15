import type { GraphVisualization } from '@dndtools/core';

/** Index only the current actor-filtered read, including its search/facet limits. */
export function indexConnections(viz: Pick<GraphVisualization, 'nodes' | 'edges'>) {
	const index = new Map(
		viz.nodes.map((n) => [
			n.id,
			{
				neighbors: new Set<string>(),
				edges: [] as GraphVisualization['edges'],
			},
		]),
	);
	for (const edge of viz.edges) {
		const from = index.get(edge.fromId);
		const to = index.get(edge.toId);
		if (!from || !to) continue;
		from.neighbors.add(edge.toId);
		to.neighbors.add(edge.fromId);
		from.edges.push(edge);
		if (from !== to) to.edges.push(edge);
	}
	return index;
}

export function walkNode(ids: string[], current: string, key: string): string | undefined {
	if (!ids.length) return undefined;
	if (key === 'Home') return ids[0];
	if (key === 'End') return ids[ids.length - 1];
	const step =
		key === 'ArrowRight' || key === 'ArrowDown'
			? 1
			: key === 'ArrowLeft' || key === 'ArrowUp'
				? -1
				: 0;
	if (!step) return undefined;
	return ids[(Math.max(0, ids.indexOf(current)) + step + ids.length) % ids.length];
}

export function showNodeLabel(count: number, phone: boolean, emphasized: boolean) {
	return emphasized || count <= (phone ? 12 : 24);
}

/**
 * RC-ENG-3.2 — how many nodes the canvas draws at once. Beyond this the ellipse is solid overlapping
 * circles, and every change re-lays-out every one of them (a 2,000-note vault spent most of a command's
 * update there). The result list beside the canvas still lists every match.
 */
export const CANVAS_NODE_LIMIT = 150;

/**
 * The nodes the canvas draws. At or under the limit, exactly `nodes`. Over it, the pinned nodes (the
 * selection, the focus anchor and their neighbours) in priority insertion order, then the rest (ties keep
 * list order), returned in list order so the layout stays deterministic.
 */
export function limitCanvasNodes<N extends { id: string; degree: number }>(
	nodes: readonly N[],
	pinned: ReadonlySet<string>,
	limit = CANVAS_NODE_LIMIT,
): readonly N[] {
	if (nodes.length <= limit) return nodes;
	const keep = new Set<string>();
	const available = new Set(nodes.map((n) => n.id));
	for (const id of pinned) {
		if (keep.size >= limit) break;
		if (available.has(id)) keep.add(id);
	}
	const ranked = nodes
		.map((n, i) => ({ n, i }))
		.sort((a, b) => b.n.degree - a.n.degree || a.i - b.i);
	for (const { n } of ranked) {
		if (keep.size >= limit) break;
		keep.add(n.id);
	}
	return nodes.filter((n) => keep.has(n.id));
}
