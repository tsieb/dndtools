import type { PermissionState } from '../state/permission-state';
import type { VaultContentState } from '../state/content';
import type { MapState } from '../state/map-state';
import type { SessionState } from '../state/session-state';
import { getNoteRelationshipsForActor } from './note-relationships';
import {
	getGraphBacklinksForActor,
	getGraphForwardLinksForActor,
	getGraphIndexStateForActor,
} from './graph-index-query';
import { resolveWikilinkForActor } from './wikilink-graph';
import type { GraphNode } from '../state/graph-index';
import type { NoteBacklink, RelatedNoteJump } from '../state/note-relationships';
import type { WikilinkResolution } from '../state/wikilink-graph';

/**
 * GRAPH-006 — the SOURCE-AGNOSTIC GRAPH QUERY API: the SINGLE actor-filtered entry point navigation,
 * search, widgets, and MCP tools use to read the link graph (backlinks, related notes, cross-source link
 * resolution) WITHOUT any consumer parsing raw markdown — or reading vault files — independently.
 *
 * This is the THIN, consumer-facing façade over the GRAPH engines the Processing Core already owns. It does
 * NOT compute a second graph; it COMPOSES the existing actor-filtered surfaces so EVERY consumer shares one
 * visibility-enforced, source-agnostic graph (Architecture Contract 1 — the Processing Core owns graph
 * indexing; the GUI/MCP/widgets read query results, never raw vault content):
 *
 *   - BACKLINKS + RELATED notes (with cross-section + redacted snippets) come from
 *     {@link getNoteRelationshipsForActor} (GRAPH-002) — the SAME engine the backlink panel uses.
 *   - The structural NODE-level backlinks/related (across notes, objects, maps, POIs) come from the
 *     incremental GRAPH-005 index ({@link getGraphIndexStateForActor}), so a widget/MCP request reflects the
 *     SAME incrementally-maintained graph the rest of the app sees.
 *   - Cross-SOURCE link RESOLUTION (local / Obsidian / Google-Docs notes) comes from
 *     {@link resolveWikilinkForActor} (CONTENT-006) — source-agnostic by construction (it resolves a link
 *     name to a node id regardless of which source the node lives in).
 *
 * The "source-agnostic" guarantee (GRAPH-006): a consumer passes an ENTITY ID and gets graph relationships
 * back; it never sees a file path, a markdown body, a source kind, or a sync cursor, and it never parses a
 * `[[wikilink]]` itself. The SAME call shape serves a local note, an Obsidian note, and a Google-Docs note —
 * the adapter/source detail is entirely below this API.
 *
 * The ACTOR-FILTER + fail-closed guarantee (GRAPH-006 AC2): every read is ACTOR-SCOPED. A player requesting
 * related notes receives ONLY visible relationships — a hidden/DM-only related note (and its edge) is absent
 * — because each composed surface already filters by visibility BEFORE returning (Cross-Contract
 * Non-Negotiable 2). An MCP tool requesting backlinks (AC1) goes through this API rather than reading files
 * ad hoc, so its result is identically visibility-filtered. An unknown/unauthenticated actor (or a request
 * for a node the actor cannot see) yields the generic EMPTY result — indistinguishable from "no
 * relationships" — so a consumer can never probe the graph to learn a hidden node exists.
 *
 * Pure + deterministic: the same (state, actor, node) always returns the same result. Every consumer that
 * needs the graph (navigation related-jumps, search relationship hints, widget related-notes bindings, MCP
 * backlink tools) reads it HERE — never by re-parsing content.
 */

/**
 * The kind of GRAPH-006 consumer making the request, recorded ONLY for diagnostics/audit. It does NOT change
 * the visibility result: a player MCP request and a player widget request over the same node return the SAME
 * visibility-filtered graph. The DM bypasses visibility by ROLE (Contract 3), never by consumer kind — there
 * is no "MCP can see more" backdoor.
 */
export type GraphConsumer = 'navigation' | 'search' | 'widget' | 'mcp';

/**
 * GRAPH-006 — the source-agnostic GRAPH RELATIONSHIPS of one node, for any consumer. Carries the navigable
 * backlinks + related notes (with cross-section + redacted snippets, GRAPH-002) AND the structural
 * node-level backlinks/related from the incremental index (GRAPH-005). Every list is over the actor's
 * VISIBLE graph only; the `consumer` is echoed back for audit. There is no file path, body, or source kind
 * anywhere in this shape — it is fully source-agnostic.
 */
export interface GraphRelationshipsResult {
	/** The node the relationships are for (echoed). */
	nodeId: string;
	/** Which consumer requested it (audit only — never changes the visibility result). */
	consumer: GraphConsumer;
	/** The navigable backlinks (visible source notes that link here, with cross-section + redacted snippet). */
	backlinks: NoteBacklink[];
	/** The navigable related-note jumps (visible notes this note links to). */
	related: RelatedNoteJump[];
	/** The structural node-level backlinks across notes/objects/maps/POIs (visible nodes only). */
	nodeBacklinks: GraphNode[];
	/** The structural node-level forward links across notes/objects/maps/POIs (visible nodes only). */
	nodeRelated: GraphNode[];
}

/** The fail-closed EMPTY result for a node the actor cannot see (indistinguishable from "no relationships"). */
function emptyResult(nodeId: string, consumer: GraphConsumer): GraphRelationshipsResult {
	return { nodeId, consumer, backlinks: [], related: [], nodeBacklinks: [], nodeRelated: [] };
}

/**
 * GRAPH-006 AC1 / AC2 — the source-agnostic GRAPH RELATIONSHIPS of one node for a consumer (navigation,
 * search, widget, or MCP). Composes the GRAPH-002 navigable relationships + the GRAPH-005 structural index,
 * both already actor-filtered, so a player (or a player-scoped widget/MCP request) receives ONLY visible
 * relationships (AC2) and an MCP backlink request uses this graph API rather than reading files ad hoc
 * (AC1). An unknown actor / hidden node yields the empty result (fail closed). Pure + deterministic.
 *
 * @param consumer recorded for audit only; it NEVER widens visibility — the result is identical across
 *   consumers for the same actor + node.
 */
export function getGraphRelationships(
	content: VaultContentState,
	maps: MapState,
	session: SessionState | undefined,
	permissions: PermissionState,
	actorId: string,
	nodeId: string,
	consumer: GraphConsumer,
): GraphRelationshipsResult {
	if (!permissions.actors[actorId]) return emptyResult(nodeId, consumer);

	// GRAPH-002 — the navigable backlinks/related (with cross-section + redacted snippets). Fails closed at
	// the target: a node the actor cannot see returns the generic empty relationship set.
	const navigable = getNoteRelationshipsForActor(content, permissions, actorId, nodeId);

	// GRAPH-005 — the structural node-level graph (notes/objects/maps/POIs). Same actor-filtered visibility.
	const graphState = getGraphIndexStateForActor(content, maps, session, permissions, actorId);
	const nodeBacklinks = getGraphBacklinksForActor(graphState, nodeId);
	const nodeRelated = getGraphForwardLinksForActor(graphState, nodeId);

	return {
		nodeId,
		consumer,
		backlinks: navigable.backlinks,
		related: navigable.related,
		nodeBacklinks,
		nodeRelated,
	};
}

/**
 * GRAPH-006 AC1 — the BACKLINKS of one node through the source-agnostic graph API, for an MCP backlink tool
 * (or any consumer). The MCP tool calls THIS rather than reading vault files ad hoc, so its backlinks are
 * the SAME visibility-filtered backlinks every other consumer sees. A hidden backlink source is absent
 * (fail closed). Convenience projection of {@link getGraphRelationships}. Pure + deterministic.
 */
export function getGraphBacklinks(
	content: VaultContentState,
	maps: MapState,
	session: SessionState | undefined,
	permissions: PermissionState,
	actorId: string,
	nodeId: string,
	consumer: GraphConsumer = 'mcp',
): NoteBacklink[] {
	return getGraphRelationships(content, maps, session, permissions, actorId, nodeId, consumer).backlinks;
}

/**
 * GRAPH-006 AC2 — the RELATED NOTES of one node through the source-agnostic graph API, for a widget binding
 * (or any consumer). When the actor is a PLAYER, only VISIBLE relationships are returned — a hidden/DM-only
 * related note (and its edge) is absent — because the composed engine already filters by visibility. The
 * widget never parses markdown; it reads this computed model. Pure + deterministic.
 */
export function getGraphRelatedNotes(
	content: VaultContentState,
	maps: MapState,
	session: SessionState | undefined,
	permissions: PermissionState,
	actorId: string,
	nodeId: string,
	consumer: GraphConsumer = 'widget',
): RelatedNoteJump[] {
	return getGraphRelationships(content, maps, session, permissions, actorId, nodeId, consumer).related;
}

/**
 * GRAPH-006 — RESOLVE a link NAME to a node through the source-agnostic graph API, for any consumer. The
 * resolution is source-agnostic (a name resolves to a node id regardless of whether the node lives in a
 * local, Obsidian, or Google-Docs source) and actor-filtered (a name that resolves only to a hidden node is
 * `unresolved` — never resolved across a node the actor cannot see). The consumer never parses the link
 * itself or touches a source adapter. Pure + deterministic.
 */
export function resolveGraphLink(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	link: { target: string; section?: string },
): WikilinkResolution {
	if (!permissions.actors[actorId]) return { status: 'unresolved' };
	return resolveWikilinkForActor(content, permissions, actorId, link);
}
