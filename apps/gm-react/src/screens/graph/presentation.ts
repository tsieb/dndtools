import { useMemo } from 'react';
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

export function useOpenGraphNode(viewActorId: string) {
	const runtime = useRuntime();
	const navigate = useNavigate();
	// Open navigates to the ENTITY the node represents, not to a list: notes deep-link to
	// `/knowledge/:id`, maps/POIs to the Atlas `?map=&poi=` deep link (the same URL MapBuilder's
	// "copy link" writes). A POI's owning map is resolved through the SAME actor-filtered map reads
	// the Atlas renders from, so the link never names a map the current viewpoint cannot see.
	// Quests and factions live on Story — the same destination the Characters mention-search uses
	// for object hits; any other object is a Note by its kind word and opens in Notes (RC-KNW-6.2).
	const openNode = (n: GraphVizNode) => {
		if (n.entity === 'note' || (n.entity === 'object' && n.kind === 'note')) {
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
