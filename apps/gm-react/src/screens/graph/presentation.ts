import { useLayoutEffect, useMemo, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	getMapViewForActor,
	listMapsForActor,
	getGraphHealthForDm,
	getPlayerScopedHealthSummary,
	kindWordFor,
	type ContentKindWord,
	type GraphVizNode,
} from '@dndtools/core';
import { T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import type { MessageKey } from '../../i18n';

// RC-KNW-6.2 — GraphVizNode.kind is the core's kind word (`kindWordFor`), so the legend, canvas,
// results and inspector name a faction object "Faction", not by its storage kind. Colors and icons
// follow the same words; the legend is built from the live facets.
export const KIND_COLOR: Record<string, string> = {
	note: 'var(--color-status-info)',
	quest: T.acc,
	faction: T.acc,
	npc: T.acc,
	map: T.ok,
	place: 'var(--color-status-warning)',
};
export const KIND_ICON: Record<string, string> = {
	note: 'knowledge-book',
	quest: 'flag',
	faction: 'campaign-scroll',
	npc: 'characters-person',
	map: 'new-map',
	place: 'globe',
};
/** The singular kind word: a row's meta, a node's label, an autocomplete row's right-hand word. */
export const KIND_LABEL: Record<ContentKindWord, MessageKey> = {
	note: 'kind.note',
	quest: 'kind.quest',
	faction: 'kind.faction',
	npc: 'kind.npc',
	map: 'kind.map',
	place: 'kind.place',
};
/** The plural kind word: a palette group heading, a Notes filter chip. */
export const KIND_PLURAL_LABEL: Record<ContentKindWord, MessageKey> = {
	note: 'kind.plural.note',
	quest: 'kind.plural.quest',
	faction: 'kind.plural.faction',
	npc: 'kind.plural.npc',
	map: 'kind.plural.map',
	place: 'kind.plural.place',
};

/**
 * RC-KNW-6.2 — THE kind label every surface shows: the Graph, the Notes filter, the palette and the
 * `[[` autocomplete all call this, so one object reads the same word on each. `kind`/`subtype` are
 * passed straight to the core's `kindWordFor` (see there for the accepted shapes).
 */
export function kindLabel(
	kind: string,
	subtype: unknown,
	t: (key: MessageKey) => string,
	form: 'one' | 'many' = 'one',
): string {
	const word = kindWordFor(kind, subtype);
	return t(form === 'one' ? KIND_LABEL[word] : KIND_PLURAL_LABEL[word]);
}
export const REL_LABEL: Record<string, MessageKey> = {
	wikilink: 'graph.rel.wikilink',
	'poi-link': 'graph.rel.poiLink',
};
export const BAND_TONE: Record<string, string> = {
	none: 'neutral',
	few: 'success',
	several: 'warning',
	many: 'error',
};
// Player-facing health bands arrive as machine tokens; render the spoken versions.
export const BAND_LABEL: Record<string, MessageKey> = {
	none: 'graph.band.none',
	few: 'graph.band.few',
	several: 'graph.band.several',
	many: 'graph.band.many',
	low: 'graph.band.low',
	moderate: 'graph.band.moderate',
	good: 'graph.band.good',
	excellent: 'graph.band.excellent',
};

/** Deterministic, force-free ellipse layout — the core graph carries no coordinates (it is a pure model). */
export function positioned(nodes: GraphVizNode[]): (GraphVizNode & { x: number; y: number })[] {
	const n = nodes.length;
	const cx = 50;
	const cy = 35;
	const rx = 38;
	const ry = 26;
	return nodes.map((node, i) => {
		if (n <= 1) return { ...node, x: cx, y: cy };
		const angle = (2 * Math.PI * i) / n - Math.PI / 2;
		return { ...node, x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
	});
}

/** A box in canvas pixels. */
export interface Rect {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** One label to place: its box when it sits in its home slot below the node, and the node's box. */
export interface LabelSlot {
	id: string;
	label: Rect;
	node: Rect;
}

function overlap(a: Rect, b: Rect): number {
	const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
	const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
	return w > 0 && h > 0 ? w * h : 0;
}

/**
 * RC-KNW-6.5 — the collision pass. Labels are placed in order (the caller puts the selected node and
 * the best-connected nodes first). Each label tries a ring of slots around its node — below it (home),
 * slid half or a whole label sideways, beside it, above it, then a row further out — and takes the
 * slot that overlaps the least: labels already placed and `obstacles` (on-canvas controls) count
 * most, then the canvas edge, then other nodes. Among equally clear slots the one nearest its node
 * wins, so a name stays beside the circle it names. When every slot collides the least-bad one is
 * used, so a pathological graph degrades instead of failing. Returns each label's offset from its
 * home slot, in pixels.
 */
export function placeLabels(
	slots: readonly LabelSlot[],
	bounds: Rect,
	obstacles: readonly Rect[] = [],
	gap = 2,
): Map<string, { dx: number; dy: number }> {
	const placed: Rect[] = [];
	const offsets = new Map<string, { dx: number; dy: number }>();
	for (const slot of slots) {
		const { label, node } = slot;
		const step = label.height + gap;
		const above = -(label.height + node.height + 2 * gap);
		const beside = node.width / 2 + gap + label.width / 2;
		const level = -(gap + node.height / 2 + label.height / 2);
		const candidates: [number, number][] = [];
		for (const dy of [0, above, step, above - step, 2 * step, above - 2 * step])
			for (const dx of [0, -label.width / 2, label.width / 2, -label.width, label.width])
				candidates.push([dx, dy]);
		for (const dy of [0, -step / 2, step / 2, -step, step])
			for (const dx of [beside, -beside]) candidates.push([dx, level + dy]);
		const cx = node.left + node.width / 2;
		const cy = node.top + node.height / 2;
		let best = { dx: 0, dy: 0 };
		let bestScore = Infinity;
		let bestDistance = Infinity;
		for (const [dx, dy] of candidates) {
			const box = { ...label, left: label.left + dx, top: label.top + dy };
			let score = 0;
			for (const other of placed) score += overlap(box, other) * 4;
			for (const other of obstacles) score += overlap(box, other) * 4;
			score += (box.width * box.height - overlap(box, bounds)) * 2;
			for (const other of slots) if (other !== slot) score += overlap(box, other.node);
			// How far the label's nearest edge sits from its node's centre.
			const distance = Math.hypot(
				Math.max(box.left - cx, 0, cx - (box.left + box.width)),
				Math.max(box.top - cy, 0, cy - (box.top + box.height)),
			);
			if (score < bestScore || (score === bestScore && distance < bestDistance)) {
				best = { dx, dy };
				bestScore = score;
				bestDistance = distance;
			}
		}
		placed.push({ ...label, left: label.left + best.dx, top: label.top + best.dy });
		offsets.set(slot.id, best);
	}
	return offsets;
}

/**
 * Run the collision pass over the rendered canvas: measure every `[data-graph-label]` in its home
 * slot, the `[data-graph-node]` it names and every other control on the canvas, place the labels,
 * and write each offset to the label's CSS `translate` (React never sets that property, so a
 * re-render does not undo it). It re-runs whenever `key` changes, when the canvas resizes and once
 * the web fonts land, since each of those moves the label boxes.
 */
export function useLabelPlacement(canvas: RefObject<HTMLElement | null>, key: string) {
	useLayoutEffect(() => {
		const el = canvas.current;
		if (!el) return;
		let frame = 0;
		let live = true;
		const run = () => {
			if (!live) return;
			const labels = [...el.querySelectorAll<HTMLElement>('[data-graph-label]')];
			for (const label of labels) label.style.translate = '';
			const origin = el.getBoundingClientRect();
			const local = (r: DOMRect): Rect => ({
				left: r.left - origin.left,
				top: r.top - origin.top,
				width: r.width,
				height: r.height,
			});
			// Place the highest-ranked labels first (`data-graph-rank`: the selection, then degree), so a
			// crowded neighbourhood moves its minor labels rather than the one the reader is looking at.
			const ranked = labels
				.map((label, i) => ({ label, i, rank: Number(label.dataset.graphRank ?? 0) }))
				.sort((a, b) => b.rank - a.rank || a.i - b.i);
			const nodes = new Map(
				[...el.querySelectorAll<HTMLElement>('[data-graph-node]')].map((node) => [
					node.dataset.graphNode,
					node,
				]),
			);
			const slots = ranked.flatMap(({ label }) => {
				const node = nodes.get(label.dataset.graphLabel);
				return node
					? [
							{
								id: label.dataset.graphLabel ?? '',
								label: local(label.getBoundingClientRect()),
								node: local(node.getBoundingClientRect()),
							},
						]
					: [];
			});
			// On-canvas controls (the Clusters toggle) stay readable: no name is placed over them.
			const obstacles = [
				...el.querySelectorAll<HTMLElement>('button:not([data-testid="graph-node"])'),
			].map((control) => local(control.getBoundingClientRect()));
			const offsets = placeLabels(
				slots,
				{ left: 0, top: 0, width: origin.width, height: origin.height },
				obstacles,
			);
			for (const label of labels) {
				const offset = offsets.get(label.dataset.graphLabel ?? '');
				if (offset && (offset.dx || offset.dy))
					label.style.translate = `${offset.dx}px ${offset.dy}px`;
			}
		};
		run();
		const schedule = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(run);
		};
		const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
		observer?.observe(el);
		void document.fonts?.ready.then(schedule);
		return () => {
			live = false;
			observer?.disconnect();
			cancelAnimationFrame(frame);
		};
	}, [canvas, key]);
}

/** Preserve the same actor-scoped health reads and memoization as the graph screen. */
export function useGraphHealth(view: 'dm' | 'player', dmId: string, playerId: string) {
	const runtime = useRuntime();
	const health = useMemo(() => {
		const now = new Date().toISOString();
		return view === 'dm'
			? {
					kind: 'dm' as const,
					report: getGraphHealthForDm(runtime.state.content, runtime.state.permissions, dmId, now),
				}
			: {
					kind: 'player' as const,
					summary: getPlayerScopedHealthSummary(
						runtime.state.content,
						runtime.state.permissions,
						playerId,
						now,
					),
				};
	}, [runtime.state, view, dmId, playerId]);

	return health;
}

/** RC-KNW-6.2 — whether opening a node goes to Story: a quest or faction object, nothing else. */
export function opensInStory(n: Pick<GraphVizNode, 'kind' | 'entity'>): boolean {
	return n.entity === 'object' && (n.kind === 'quest' || n.kind === 'faction');
}

export function useOpenGraphNode(viewActorId: string) {
	const runtime = useRuntime();
	const navigate = useNavigate();
	// Open navigates to the ENTITY the node represents, not to a list: notes deep-link to
	// `/knowledge/:id`, maps/POIs to the Atlas `?map=&poi=` deep link (the same URL MapBuilder's
	// "copy link" writes). A POI's owning map is resolved through the SAME actor-filtered map reads
	// the Atlas renders from, so the link never names a map the current viewpoint cannot see.
	// Quests and factions live on Story — the same destination the Characters mention-search uses
	// for object hits; any other object (a Note, or an NPC or Map by its subtype) is note-backed and
	// opens in Notes (RC-KNW-6.2).
	const openNode = (n: GraphVizNode) => {
		if (n.entity === 'note' || (n.entity === 'object' && !opensInStory(n))) {
			navigate(`/knowledge/${n.id}`);
			return;
		}
		if (n.entity === 'map') {
			navigate(`/atlas?map=${encodeURIComponent(n.id)}`);
			return;
		}
		if (n.entity === 'poi') {
			const owner = listMapsForActor(
				runtime.state.maps,
				runtime.state.permissions,
				viewActorId,
			).find((m) => {
				const view = getMapViewForActor(
					runtime.state.maps,
					runtime.state.permissions,
					viewActorId,
					m.id,
				);
				return view.kind === 'available' && view.pois.some((p) => p.id === n.id);
			});
			navigate(
				owner
					? `/atlas?map=${encodeURIComponent(owner.id)}&poi=${encodeURIComponent(n.id)}`
					: `/atlas?poi=${encodeURIComponent(n.id)}`,
			);
			return;
		}
		navigate('/campaign');
	};

	return openNode;
}
