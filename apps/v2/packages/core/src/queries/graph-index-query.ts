import type { PermissionState } from '../state/permission-state';
import type { VaultContentState } from '../state/content';
import type { MapState } from '../state/map-state';
import type { SessionState } from '../state/session-state';
import { parseMarkdownNote } from '../state/markdown';
import {
	applyGraphChange,
	backlinksOf,
	buildGraphIndexState,
	emptyGraphIndex,
	emptyGraphIndexState,
	forwardLinksOf,
	graphRepairSignal,
	markGraphStale,
	outboundTargetsFromBody,
	setGraphAvailability,
	type GraphChange,
	type GraphIndex,
	type GraphIndexState,
	type GraphNode,
	type GraphNodeRecord,
	type GraphRepairSignal,
} from '../state/graph-index';
import { getContentItemsForActor, type ContentItemView } from './content-query';
import { getMapViewForActor, deliveredMapIdsForActor } from './map-query';

/**
 * GRAPH-005 — the ACTOR-FILTERED INCREMENTAL GRAPH-INDEX surface: it builds the actor's visible link graph
 * (notes, objects, maps, POIs + the edges between them) and maintains it INCREMENTALLY after accepted note,
 * object, map, POI, and sync operations, exposing the dependent reverse (backlink) index, the graph
 * FRESHNESS, and the repair/REINDEX signal.
 *
 * This is the single choke-point that feeds the pure {@link buildGraphIndexState} / {@link applyGraphChange}
 * engine ONLY the nodes — and the visible link targets — the actor may see. It is built ENTIRELY on the
 * EXISTING actor-filtered reads, NOT a second relationship source:
 *
 *   - The NOTE / OBJECT nodes come from {@link getContentItemsForActor} (CONTENT-011) — the SAME
 *     visibility-and-tombstone choke-point every CONTENT/SRCH/GRAPH surface uses. A `dm-only` /
 *     `shared`-but-undelivered / soft-deleted item never enters the set, so it can never be a node, an
 *     edge endpoint, a delta entry, or a backlink source (GRAPH-005 actor-filtering, fail closed;
 *     Cross-Contract Non-Negotiable 2).
 *   - The MAP / POI nodes come from {@link getMapViewForActor} — the SAME map→layer→annotation precedence
 *     read MAP surfaces use. A hidden map/POI is `unavailable`/filtered there, so it can never be a node.
 *   - The link EDGES are the SAME `[[wikilink]]` edges the rest of GRAPH parses (the engine extracts them
 *     from the visible body with {@link outboundTargetsFromBody}), resolved against the visible name index,
 *     plus a POI→note edge when a visible POI links a VISIBLE entity. A link to a target the actor cannot
 *     see simply yields NO edge — exactly as it would in the relationship/quality surfaces — so an
 *     incremental update can never surface a hidden node or edge.
 *
 * An INCREMENTAL update over the actor's visible set therefore inherits the no-leak guarantee: the change
 * only ever carries an actor-VISIBLE record (or removes a now-hidden node), and the rebuilt graph is over
 * the visible record set only, so it converges to exactly the full actor-filtered recompute (the tests
 * assert incremental == full per actor). When freshness is unknown or a source is unavailable, the graph
 * signals `stale`/`unknown` (never `fresh`) and {@link getGraphRepairSignalForActor} requires a reindex —
 * the graph signals staleness rather than serving a confidently-wrong result (GRAPH-005 AC2, fail closed).
 *
 * Pure + deterministic: the same (content, maps, session, permissions, actor) always produce the same graph.
 * The Processing Core owns the algorithm; the GUI renders the computed model (Architecture Contract 1).
 */

/** A node record built from a visible note/object content item: title + aliases + outbound wikilink targets. */
function contentNodeRecord(view: ContentItemView): GraphNodeRecord {
	const parsed = parseMarkdownNote(view.body);
	return {
		id: view.id,
		kind: view.kind === 'object' ? 'object' : 'note',
		title: view.title,
		aliases: parsed.aliases,
		// The note is actor-visible, so its link TARGETS (titles/ids) leak nothing; a target the actor
		// cannot see simply never resolves to an edge (fail closed).
		outboundTargets: outboundTargetsFromBody(parsed.body),
		revision: view.revision,
	};
}

/**
 * GRAPH-005 — build the ACTOR-FILTERED graph node records over the actor's VISIBLE notes, objects, maps,
 * and POIs. A map node carries no outbound wikilinks; a POI node carries a single outbound link to its
 * linked entity (when that entity is itself a visible node), so a visible POI that pins a hidden note
 * yields no edge (fail closed). Hidden entities never enter the record set. Pure.
 */
function buildGraphRecordsForActor(
	content: VaultContentState,
	maps: MapState,
	session: SessionState | undefined,
	permissions: PermissionState,
	actorId: string,
): GraphNodeRecord[] {
	const records: GraphNodeRecord[] = [];
	const visibleIds = new Set<string>();
	const titleById = new Map<string, string>();
	const addRecord = (record: GraphNodeRecord): void => {
		records.push(record);
		visibleIds.add(record.id);
		titleById.set(record.id, record.title);
	};

	// NOTE + OBJECT nodes (the wikilink-bearing entities).
	for (const view of getContentItemsForActor(content, permissions, actorId)) {
		addRecord(contentNodeRecord(view));
	}

	// MAP nodes + POI nodes (in a single visible-map pass). A POI links its target entity (note/object/map)
	// only when that target is itself a VISIBLE node — so a visible POI pinning a hidden note yields no edge
	// (fail closed). The POI's linked-entity id is resolved against the visible set AFTER all nodes are
	// collected, because a POI may link a note/POI that appears later in the pass.
	const deliveredMapIds = deliveredMapIdsForActor(session, actorId);
	const poiLinks: { poiId: string; linkedEntityId: string }[] = [];
	for (const mapId of Object.keys(maps.maps)) {
		const view = getMapViewForActor(maps, permissions, actorId, mapId, { deliveredMapIds });
		if (view.kind !== 'available') continue;
		addRecord({ id: view.mapId, kind: 'map', title: view.name, aliases: [], outboundTargets: [], revision: 0 });
		for (const poi of view.pois) {
			addRecord({ id: poi.id, kind: 'poi', title: poi.label, aliases: [], outboundTargets: [], revision: 0 });
			if (poi.linkedEntityId !== null) poiLinks.push({ poiId: poi.id, linkedEntityId: poi.linkedEntityId });
		}
	}

	// POI→linked-entity edges are resolved by ID (not wikilink title). We encode the link as the linked
	// entity's TITLE so the engine resolves it through the SAME name index every other edge uses (one edge
	// mechanism). A POI whose linked entity is not in the visible set contributes NO edge (fail closed).
	const recordById = new Map<string, GraphNodeRecord>(records.map((record) => [record.id, record]));
	for (const { poiId, linkedEntityId } of poiLinks) {
		if (!visibleIds.has(linkedEntityId)) continue;
		const linkedTitle = titleById.get(linkedEntityId);
		const record = recordById.get(poiId);
		if (linkedTitle !== undefined && record) record.outboundTargets = [linkedTitle];
	}

	return records;
}

/**
 * GRAPH-005 — the ACTOR-FILTERED incremental GRAPH-INDEX STATE: the visible graph + the records it was built
 * from (so an incremental change re-resolves edges without a full reparse). An unknown/unauthenticated actor
 * receives the EMPTY state (fail closed). This is the FULL build; {@link applyGraphChangeForActor} maintains
 * it incrementally after a single accepted change. Pure + deterministic.
 */
export function getGraphIndexStateForActor(
	content: VaultContentState,
	maps: MapState,
	session: SessionState | undefined,
	permissions: PermissionState,
	actorId: string,
): GraphIndexState {
	if (!permissions.actors[actorId]) return emptyGraphIndexState();
	const records = buildGraphRecordsForActor(content, maps, session, permissions, actorId);
	return buildGraphIndexState(records);
}

/**
 * GRAPH-005 — the ACTOR-FILTERED visible GRAPH INDEX (nodes + edges + freshness bookkeeping) for navigation,
 * search, widgets, and MCP. The thin projection of {@link getGraphIndexStateForActor} that drops the
 * incremental record cache. An unknown actor yields the empty graph (fail closed). Pure + deterministic.
 */
export function getGraphIndexForActor(
	content: VaultContentState,
	maps: MapState,
	session: SessionState | undefined,
	permissions: PermissionState,
	actorId: string,
): GraphIndex {
	if (!permissions.actors[actorId]) return emptyGraphIndex();
	return getGraphIndexStateForActor(content, maps, session, permissions, actorId).index;
}

/**
 * GRAPH-005 AC1 — apply ONE accepted change to an actor's maintained graph state INCREMENTALLY, given the
 * change's resolved actor-VISIBLE record (for an upsert) or removed node id (for a remove). Only the changed
 * node's edges + the dependent backlink index update; the result converges to the full actor-filtered
 * recompute. The change is built by the caller from the SAME actor-filtered reads, so it can never carry a
 * hidden node. Pure + deterministic — a thin re-export so consumers maintain the graph through one surface.
 */
export function applyGraphChangeForActor(
	state: GraphIndexState,
	change: GraphChange,
): GraphIndexState {
	return applyGraphChange(state, change);
}

/**
 * GRAPH-005 AC1 — build the incremental {@link GraphChange} for an UPSERTED visible note/object, parsing its
 * body the SAME way the full build does. The caller resolves visibility BEFORE calling this (only a visible
 * item's view is ever passed), so the change can never introduce a hidden node. Pure.
 */
export function graphUpsertChangeForContent(view: ContentItemView): GraphChange {
	return { op: 'upsert', record: contentNodeRecord(view) };
}

/** GRAPH-005 AC1 — build the incremental {@link GraphChange} for a REMOVED (deleted/hidden) node. Pure. */
export function graphRemoveChange(nodeId: string): GraphChange {
	return { op: 'remove', nodeId };
}

/**
 * GRAPH-005 AC2 — mark an actor's maintained graph STALE because an incremental update failed, returning the
 * updated state. The graph then signals staleness (its freshness is no longer `fresh`) and requires a
 * reindex via {@link getGraphRepairSignalForActor}. Pure.
 */
export function markGraphStaleForActor(state: GraphIndexState): GraphIndexState {
	return { ...state, index: markGraphStale(state.index) };
}

/**
 * GRAPH-005 — mark an actor's maintained graph source AVAILABILITY. An unavailable source forces the graph
 * `stale` (its cached graph is known-behind) without discarding the cached nodes/edges. Pure.
 */
export function setGraphAvailabilityForActor(
	state: GraphIndexState,
	available: boolean,
): GraphIndexState {
	return { ...state, index: setGraphAvailability(state.index, available) };
}

/**
 * GRAPH-005 AC2 — the REPAIR / REINDEX signal for an actor's maintained graph: whether a full reindex is
 * required (the index is stale / its source is unavailable) and the fail-closed reason. The signal carries
 * no content, so it never leaks. Pure.
 */
export function getGraphRepairSignalForActor(state: GraphIndexState): GraphRepairSignal {
	return graphRepairSignal(state.index);
}

/**
 * GRAPH-005 — the BACKLINKS (reverse index) of one node in an actor's maintained graph. Every backlink
 * source is a visible node; an unknown/hidden node yields the empty list (fail closed). Pure + deterministic.
 */
export function getGraphBacklinksForActor(state: GraphIndexState, nodeId: string): GraphNode[] {
	return backlinksOf(state.index, nodeId);
}

/**
 * GRAPH-005 — the FORWARD links (related nodes) of one node in an actor's maintained graph. Every related
 * node is visible; an unknown/hidden node yields the empty list (fail closed). Pure + deterministic.
 */
export function getGraphForwardLinksForActor(state: GraphIndexState, nodeId: string): GraphNode[] {
	return forwardLinksOf(state.index, nodeId);
}
