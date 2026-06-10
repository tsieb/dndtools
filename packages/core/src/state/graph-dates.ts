/**
 * GRAPH-009 — the PURE DETERMINISTIC CALENDAR / CUSTOM-TIME RELATIONSHIP engine: it indexes the DATE
 * references content carries and derives the DATE RELATIONSHIPS the graph API exposes (which dated
 * items SHARE a date, and which dated items REFERENCE a concrete timeline target), as a pure function of
 * a set of {@link DateIndexEntry}s.
 *
 * Everything here is a PURE function of its explicit inputs. It NEVER reads ambient state, storage, a
 * clock, an id generator, or a real transport, and it embeds NO date arithmetic of its own — ordering
 * uses the absolute day index the CONTENT-011 calendar engine already computed (`state/calendar.ts`), so
 * a date is interpreted identically here and on every other surface. The ACTOR-FILTERED surface lives in
 * the query layer (`queries/graph-dates-query.ts`), which feeds this engine ONLY the date references of
 * notes/events/handouts the actor may see. Because the engine is fed only visible entries, NO date
 * relationship (a same-date edge, a timeline reference edge, a count) can ever name or reveal an entity
 * the actor cannot see: a player who cannot see a calendar-linked event has that event AND its
 * relationship EDGE absent (GRAPH-009 AC2 / Cross-Contract Non-Negotiable 2). A reference whose target is
 * not in the visible set simply has no resolved edge (fail closed — no leak, graceful degrade).
 *
 * This COMPOSES the existing actor-filtered date reads rather than introducing a second calendar index.
 * The date VALUES + their stable formatting come from the SAME CONTENT-011 calendar/timeline reads
 * (`getCalendarTimelineForActor` and the content view's `dateFields`/`timelineRefs`); this engine only
 * builds the RELATIONSHIP edges over them and exposes them through the same visibility-filtered graph API
 * navigation, search, session prep/recap, and MCP bundle tools all consume.
 *
 * Determinism (a HARD requirement): the same entries always produce the same relationships in the same
 * order, with TOTAL tie-breakers (sorted by absolute day index, then a stable key down to the id), so
 * identical visible content fingerprints identically across fresh fixtures whose volatile ids differ and
 * across repeated runs. The Processing Core owns the algorithm; the GUI renders the computed model
 * (Architecture Contract 1).
 */

export const GRAPH_DATES_SCHEMA_VERSION = 1 as const;

/** Which kind of entity a date reference came from (for grouping/disambiguation in navigation). */
export type DateRefKind = 'content' | 'timeline-link' | 'handout' | 'session';

export const DATE_REF_KINDS: readonly DateRefKind[] = Object.freeze([
	'content',
	'timeline-link',
	'handout',
	'session',
]);

/**
 * ONE date reference as fed to the engine: a visible entity carrying a custom date, with that date's
 * stable machine key (`isoLike`), its absolute day index (the ordering key the calendar engine computed),
 * its human display, and — for a timeline reference — the optional resolved TARGET id the reference points
 * at. An entry only ever appears here for an actor-VISIBLE source, and a `targetId` is only present when
 * the target is itself visible (the query layer fails closed), so deriving an edge from it leaks nothing.
 */
export interface DateIndexEntry {
	/** Stable id of the entity that carries the date (the content item id, the link id, the handout id…). */
	entityId: string;
	/** Which kind of entity carries the date. */
	kind: DateRefKind;
	/** The visible label/title for the dated entity (already actor-safe at its source). */
	title: string;
	/** The calendar the date belongs to. */
	calendarId: string;
	/** The canonical machine-stable date key (`YYYY-MM-DD`) — the same-date grouping key. */
	isoLike: string;
	/** The absolute day index from the calendar epoch — the deterministic ordering key. `null` when invalid. */
	absoluteDayIndex: number | null;
	/** The human display string in the requested format (stable, locale-independent). */
	display: string;
	/**
	 * For a timeline REFERENCE, the resolved id of the concrete timeline target it points at, when that
	 * target is itself VISIBLE to the actor; else `null`. The query layer only ever sets this to a visible
	 * id, so a reference edge never resolves to (and thus never reveals) a hidden target.
	 */
	targetId: string | null;
}

/** One dated relationship NODE in the graph API: a visible dated entity, exposed for navigation/search. */
export interface DateGraphNode {
	entityId: string;
	kind: DateRefKind;
	title: string;
	calendarId: string;
	isoLike: string;
	absoluteDayIndex: number | null;
	display: string;
}

/** The KIND of a date relationship edge in the visibility-filtered graph. */
export type DateEdgeKind = 'same-date' | 'timeline-reference';

/**
 * ONE date relationship EDGE between two visible dated entities. A `same-date` edge links two entities
 * that fall on the SAME calendar date (an undirected co-occurrence, emitted once per pair in stable id
 * order). A `timeline-reference` edge links a timeline reference to the concrete visible target it points
 * at (a directed navigation edge). Both endpoints are always visible, so an edge never reveals a hidden
 * entity (GRAPH-009 AC2).
 */
export interface DateGraphEdge {
	kind: DateEdgeKind;
	/** The id of the FROM endpoint (for `same-date` the lexicographically-smaller id). */
	fromId: string;
	/** The id of the TO endpoint (for `same-date` the lexicographically-larger id). */
	toId: string;
	/** The calendar the shared date belongs to (for a `same-date` edge); the reference's calendar otherwise. */
	calendarId: string;
	/** The shared date key (`same-date`) or the reference's date key (`timeline-reference`). */
	isoLike: string;
}

/**
 * The DATE RELATIONSHIPS one entity participates in, as exposed through the graph API. `related` is the
 * set of OTHER visible dated entities it shares a date with OR that it references / is referenced by; each
 * is itself a visible node, so the set never names a hidden entity (GRAPH-009 AC2 — a hidden related event
 * and its edge are absent).
 */
export interface DateRelationships {
	/** The entity the relationships are computed for. `null` when it is not in the visible date index. */
	node: DateGraphNode | null;
	/** The visible entities sharing this entity's date, deterministically ordered. */
	sameDate: DateGraphNode[];
	/** The visible timeline targets this entity references (forward edges). */
	references: DateGraphNode[];
	/** The visible entities that reference this entity (reverse edges). */
	referencedBy: DateGraphNode[];
}

/**
 * The complete, DETERMINISTIC date-relationship index over the actor's visible dated entities. Every list
 * is sorted by a stable, TOTAL key (absolute day index, then kind, then id) so the index is reproducible
 * across fresh fixtures and repeated runs. Counts are computed over the visible set only.
 */
export interface DateGraphIndex {
	schemaVersion: typeof GRAPH_DATES_SCHEMA_VERSION;
	/** The visible dated nodes, deterministically ordered. */
	nodes: DateGraphNode[];
	/** The date relationship edges (same-date co-occurrence + timeline references), deterministically ordered. */
	edges: DateGraphEdge[];
}

/** Project an index entry onto the exposed node shape (drops the internal `targetId`). */
function toNode(entry: DateIndexEntry): DateGraphNode {
	return {
		entityId: entry.entityId,
		kind: entry.kind,
		title: entry.title,
		calendarId: entry.calendarId,
		isoLike: entry.isoLike,
		absoluteDayIndex: entry.absoluteDayIndex,
		display: entry.display,
	};
}

/** Deterministic ordering for dated nodes: by absolute day index, then kind, then id. Total tie-break. */
function compareNodes(a: DateGraphNode, b: DateGraphNode): number {
	const ai = a.absoluteDayIndex;
	const bi = b.absoluteDayIndex;
	if (ai === null || bi === null) {
		if (ai !== bi) return ai === null ? 1 : -1; // invalid dates sort last, deterministically
	} else if (ai !== bi) {
		return ai - bi;
	}
	const kindOrder = DATE_REF_KINDS.indexOf(a.kind) - DATE_REF_KINDS.indexOf(b.kind);
	if (kindOrder !== 0) return kindOrder;
	return a.entityId.localeCompare(b.entityId);
}

/**
 * GRAPH-009 — build the complete DATE-RELATIONSHIP INDEX over the provided VISIBLE date references. Emits
 * one node per visible dated entity and the relationship edges between them: `same-date` co-occurrence
 * edges (one per unordered pair sharing a calendar + date key, in stable id order) and
 * `timeline-reference` edges (a reference → its resolved visible target). Every endpoint is a visible
 * node, so no edge can reveal a hidden entity. Pure + deterministic; every list has a total tie-breaker.
 */
export function buildDateGraphIndex(entries: readonly DateIndexEntry[]): DateGraphIndex {
	const nodes = entries.map(toNode).sort(compareNodes);
	const nodeIds = new Set(entries.map((entry) => entry.entityId));

	const edges: DateGraphEdge[] = [];

	// SAME-DATE edges: group visible entities by (calendarId, isoLike); within a group emit one undirected
	// edge per unordered pair, in stable id order, so the same visible set always yields the same edges.
	const byDate = new Map<string, DateIndexEntry[]>();
	for (const entry of entries) {
		if (entry.isoLike === '') continue;
		const key = `${entry.calendarId}::${entry.isoLike}`;
		const group = byDate.get(key) ?? [];
		group.push(entry);
		byDate.set(key, group);
	}
	for (const [, group] of byDate) {
		if (group.length < 2) continue;
		const sorted = [...group].sort((a, b) => a.entityId.localeCompare(b.entityId));
		for (let i = 0; i < sorted.length; i += 1) {
			for (let j = i + 1; j < sorted.length; j += 1) {
				const a = sorted[i]!;
				const b = sorted[j]!;
				if (a.entityId === b.entityId) continue; // never relate an entity to itself
				edges.push({
					kind: 'same-date',
					fromId: a.entityId,
					toId: b.entityId,
					calendarId: a.calendarId,
					isoLike: a.isoLike,
				});
			}
		}
	}

	// TIMELINE-REFERENCE edges: a reference → its resolved VISIBLE target. A `targetId` is only present
	// when the target is visible (the query layer fails closed), so an edge never reaches a hidden target.
	for (const entry of entries) {
		if (entry.targetId === null) continue;
		if (entry.targetId === entry.entityId) continue; // never a self-reference edge
		if (!nodeIds.has(entry.targetId)) continue; // target absent from the visible index ⇒ no edge (fail closed)
		edges.push({
			kind: 'timeline-reference',
			fromId: entry.entityId,
			toId: entry.targetId,
			calendarId: entry.calendarId,
			isoLike: entry.isoLike,
		});
	}

	edges.sort(
		(a, b) =>
			a.kind.localeCompare(b.kind) ||
			a.calendarId.localeCompare(b.calendarId) ||
			a.isoLike.localeCompare(b.isoLike) ||
			a.fromId.localeCompare(b.fromId) ||
			a.toId.localeCompare(b.toId),
	);

	return { schemaVersion: GRAPH_DATES_SCHEMA_VERSION, nodes, edges };
}

/**
 * GRAPH-009 — the DATE RELATIONSHIPS for ONE entity, derived from a built {@link DateGraphIndex}. Returns
 * the entity's node plus the visible entities it shares a date with (`sameDate`), the visible targets it
 * references (`references`), and the visible entities that reference it (`referencedBy`). When the entity
 * is not in the visible index — hidden, deleted, or undated — every list is empty and `node` is `null`
 * (fail closed, indistinguishable from "has no date relationships"). Pure + deterministic.
 */
export function relatedDatesForEntity(index: DateGraphIndex, entityId: string): DateRelationships {
	const nodeById = new Map<string, DateGraphNode>();
	for (const node of index.nodes) nodeById.set(node.entityId, node);
	const node = nodeById.get(entityId) ?? null;
	if (!node) return { node: null, sameDate: [], references: [], referencedBy: [] };

	const sameDateIds = new Set<string>();
	const referenceIds = new Set<string>();
	const referencedByIds = new Set<string>();
	for (const edge of index.edges) {
		if (edge.kind === 'same-date') {
			if (edge.fromId === entityId) sameDateIds.add(edge.toId);
			else if (edge.toId === entityId) sameDateIds.add(edge.fromId);
		} else {
			if (edge.fromId === entityId) referenceIds.add(edge.toId);
			else if (edge.toId === entityId) referencedByIds.add(edge.fromId);
		}
	}

	const resolve = (ids: Set<string>): DateGraphNode[] =>
		[...ids]
			.map((id) => nodeById.get(id))
			.filter((candidate): candidate is DateGraphNode => candidate !== undefined)
			.sort(compareNodes);

	return {
		node,
		sameDate: resolve(sameDateIds),
		references: resolve(referenceIds),
		referencedBy: resolve(referencedByIds),
	};
}
