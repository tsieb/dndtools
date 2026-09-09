import { resolveWikilink, type WikilinkTarget } from './wikilink-graph';
import type { QualityNode } from './graph-quality';

/**
 * RC-KNW-4.1 — CLUSTERS AND MOMENTUM: the PURE, DETERMINISTIC community-detection half of the
 * graph-quality engine. Label propagation over the actor-visible resolved-link graph groups notes into
 * ARCS, and each arc carries a MOMENTUM figure — the share of its notes mutated inside a recency window —
 * so a DM can see at a glance which storyline is moving and which has gone quiet.
 *
 * It sits beside `state/graph-quality.ts` rather than inside it: same engine, same {@link QualityNode}
 * input, separate concern, and neither file grows past the repo's size ceiling. Everything here is a PURE
 * function of its explicit inputs — no ambient state, no storage, NO CLOCK (the caller passes `now`), no
 * id generator, no AI. Every arc is produced by an inspectable algorithm (Vision "Algorithms not AI";
 * Cross-Contract Non-Negotiable 7).
 *
 * ACTOR-FILTERING is the query layer's job (`queries/graph-quality-query.ts`), which feeds this engine
 * ONLY the notes the actor may see. Because a hidden note is never a node, it can never be a cluster
 * member, shift a momentum figure, or make an arc look dormant — so no cluster or "dormant arc" can
 * reveal the existence of content the actor cannot see (fail closed; Non-Negotiable 2).
 */

/**
 * RC-KNW-4.1 — the schema version of the cluster/momentum report. Additive to
 * {@link GRAPH_QUALITY_SCHEMA_VERSION}: clusters are a SECOND report over the SAME visible node set,
 * not a change to the quality report's persisted shape, so nothing already stored moves.
 */
export const GRAPH_CLUSTER_SCHEMA_VERSION = 1 as const;

/**
 * The threshold version stamped on every cluster report. Bumping it is a clustering-policy change, so a
 * report says which knob set produced it exactly as a quality finding does. Lockstep with
 * {@link CLUSTER_THRESHOLDS}.
 */
export const GRAPH_CLUSTER_THRESHOLD_VERSION = '1' as const;

/**
 * The inspectable knobs the clustering + momentum algorithm runs on — deliberately named constants, not
 * numbers buried in the loop, so a DM can be told WHY an arc is called dormant.
 */
export const CLUSTER_THRESHOLDS = Object.freeze({
	/** How far back a note's `updatedAt` still counts as a RECENT mutation, in days. */
	recentWindowDays: 14,
	/** Label propagation is iterated at most this many rounds; it is stopped early once labels settle. */
	maxRounds: 20,
	/** A cluster whose momentum is at or below this is DORMANT (0 == nothing in it moved recently). */
	dormantMomentumMax: 0,
	/** A dormant cluster is only reported as an ARC once it has at least this many notes (1 note is not an arc). */
	dormantMinSize: 2,
});

/**
 * ONE note as fed to the cluster engine: a {@link QualityNode} plus WHEN it was last mutated. The
 * timestamp is the note's own `updatedAt` from the actor-filtered read — the caller passes only notes the
 * actor may see, so no cluster, momentum figure or dormant arc can be shaped by a hidden note.
 */
export interface ClusterInputNode extends QualityNode {
	/** ISO-8601 timestamp of the note's last mutation (its content-item `updatedAt`). */
	updatedAt: string;
}

/** ONE detected community of linked notes, with its recent-activity momentum (RC-KNW-4.1). */
export interface GraphCluster {
	/**
	 * A stable cluster id: the lexicographically smallest member id. Derived from the membership, so the
	 * same visible graph always names the same cluster the same way (no counter, no id generator).
	 */
	id: string;
	/** The ANCHOR note's title — the member with the highest intra-cluster degree (ties by title, then id). */
	label: string;
	/** The anchor note's id, so the GUI can select/deep-link the cluster without inventing a target. */
	anchorId: string;
	/** Member note ids, deduped + sorted (stable across fixtures whose ids differ in creation order). */
	memberIds: string[];
	/** Member note titles, in the same order as {@link memberIds}. Already actor-safe. */
	memberTitles: string[];
	/** How many notes the cluster holds (== `memberIds.length`). */
	size: number;
	/** How many members were mutated inside the recency window (the momentum numerator). */
	recentMutations: number;
	/** MOMENTUM: recent mutations ÷ cluster size, in [0,1], rounded to 3 decimals for stable comparison. */
	momentum: number;
	/** The most recent member `updatedAt` in the cluster, or `null` when no member carried a timestamp. */
	lastTouchedAt: string | null;
	/** Whether the cluster counts as DORMANT under {@link CLUSTER_THRESHOLDS}. */
	dormant: boolean;
}

/** The complete, deterministic cluster + momentum report over the actor's visible notes. */
export interface GraphClusterReport {
	schemaVersion: typeof GRAPH_CLUSTER_SCHEMA_VERSION;
	thresholdVersion: typeof GRAPH_CLUSTER_THRESHOLD_VERSION;
	/** The recency window the momentum figures were computed against, in days. */
	recentWindowDays: number;
	/** Every detected cluster, sorted by momentum (busiest first), then size, then label, then id. */
	clusters: GraphCluster[];
	/** DORMANT ARCS: the dormant clusters of at least `dormantMinSize` notes, oldest-touched first. */
	dormantArcs: GraphCluster[];
}

/**
 * Build the UNDIRECTED adjacency of the visible graph: two notes are neighbours when either links to the
 * other with a link that RESOLVES in the visible candidate index. Direction is dropped on purpose —
 * community detection asks "are these notes talking about each other", not "who linked first". Self-links
 * are ignored. Pure.
 */
function buildUndirectedAdjacency(
	nodes: readonly ClusterInputNode[],
	candidates: readonly WikilinkTarget[],
): Map<string, Set<string>> {
	const known = new Set(nodes.map((node) => node.id));
	const adjacency = new Map<string, Set<string>>();
	for (const node of nodes) adjacency.set(node.id, new Set<string>());
	for (const node of nodes) {
		for (const rawTarget of node.outboundTargets) {
			const resolution = resolveWikilink({ target: rawTarget }, candidates);
			if (resolution.status !== 'resolved') continue;
			const targetId = resolution.targetId;
			if (targetId === node.id || !known.has(targetId)) continue;
			adjacency.get(node.id)?.add(targetId);
			adjacency.get(targetId)?.add(node.id);
		}
	}
	return adjacency;
}

/**
 * RC-KNW-4.1 — DETERMINISTIC LABEL PROPAGATION. Every note starts labelled with its own id; in each
 * round, notes are visited in a fixed (id-sorted) order and adopt the label carried by most of their
 * neighbours, ties broken by the lexicographically smallest label. Updates are applied immediately
 * (the asynchronous variant), which converges quickly and — because both the visit order and the
 * tie-break are total — always converges to the SAME labelling for the same graph. No randomness, no
 * seed, no clock: this is an algorithm, not an AI guess.
 */
function propagateLabels(adjacency: Map<string, Set<string>>): Map<string, string> {
	const ids = [...adjacency.keys()].sort((a, b) => a.localeCompare(b));
	const labels = new Map<string, string>(ids.map((id) => [id, id]));
	for (let round = 0; round < CLUSTER_THRESHOLDS.maxRounds; round += 1) {
		let changed = false;
		for (const id of ids) {
			const neighbours = adjacency.get(id);
			if (!neighbours || neighbours.size === 0) continue;
			const tally = new Map<string, number>();
			for (const neighbourId of neighbours) {
				const label = labels.get(neighbourId);
				if (label === undefined) continue;
				tally.set(label, (tally.get(label) ?? 0) + 1);
			}
			let best: string | null = null;
			let bestCount = 0;
			for (const [label, count] of [...tally].sort((a, b) => a[0].localeCompare(b[0]))) {
				if (count > bestCount) {
					best = label;
					bestCount = count;
				}
			}
			if (best !== null && best !== labels.get(id)) {
				labels.set(id, best);
				changed = true;
			}
		}
		if (!changed) break;
	}
	return labels;
}

/** Whether an ISO timestamp falls inside the recency window ending at `now`. Invalid/absent == not recent. */
function isRecent(updatedAt: string, nowMs: number, windowDays: number): boolean {
	const at = Date.parse(updatedAt);
	if (Number.isNaN(at)) return false;
	const ageMs = nowMs - at;
	// A future timestamp (clock skew on a peer's device) still counts as recent rather than as "ancient".
	return ageMs <= windowDays * 24 * 60 * 60 * 1000;
}

/**
 * RC-KNW-4.1 — compute the CLUSTER + MOMENTUM report over the visible notes.
 *
 * Communities come from deterministic label propagation over the UNDIRECTED resolved-link graph; a note
 * with no resolvable visible links is its own singleton cluster (honest: it belongs to nothing). MOMENTUM
 * is `recent mutations ÷ cluster size` — the share of the arc that moved inside the recency window — so a
 * big cluster with one edit does not read as busy as a two-note cluster with one edit. A cluster whose
 * momentum is at or below {@link CLUSTER_THRESHOLDS.dormantMomentumMax} is DORMANT, and the dormant arcs
 * worth surfacing are those with at least `dormantMinSize` notes.
 *
 * Pure: a function of the nodes, the candidate index and the EXPLICIT `now` — it never reads a clock, so
 * the same inputs always produce the same report. Every list is sorted by a total key, so identical
 * visible content fingerprints identically across fresh fixtures whose ids differ.
 */
export function computeGraphClusters(
	nodes: readonly ClusterInputNode[],
	candidates: readonly WikilinkTarget[],
	options: { now: string; recentWindowDays?: number },
): GraphClusterReport {
	const recentWindowDays = options.recentWindowDays ?? CLUSTER_THRESHOLDS.recentWindowDays;
	const parsedNow = Date.parse(options.now);
	const nowMs = Number.isNaN(parsedNow) ? 0 : parsedNow;

	const adjacency = buildUndirectedAdjacency(nodes, candidates);
	const labels = propagateLabels(adjacency);
	const byId = new Map(nodes.map((node) => [node.id, node]));

	// Group by settled label, then RE-KEY each group by its smallest member id so the cluster id depends
	// only on membership (the propagation's winning label is an implementation detail).
	const groups = new Map<string, string[]>();
	for (const [id, label] of labels) {
		const members = groups.get(label) ?? [];
		members.push(id);
		groups.set(label, members);
	}

	const clusters: GraphCluster[] = [];
	for (const members of groups.values()) {
		const memberIds = [...members].sort((a, b) => a.localeCompare(b));
		if (memberIds.length === 0) continue;
		const memberSet = new Set(memberIds);

		// The ANCHOR is the member with the most links INSIDE the cluster — the note the arc hangs off.
		let anchorId = memberIds[0]!;
		let anchorDegree = -1;
		let anchorTitle = byId.get(anchorId)?.title ?? '';
		for (const id of memberIds) {
			const title = byId.get(id)?.title ?? '';
			const degree = [...(adjacency.get(id) ?? [])].filter((n) => memberSet.has(n)).length;
			const better =
				degree > anchorDegree ||
				(degree === anchorDegree &&
					(title.localeCompare(anchorTitle) < 0 ||
						(title === anchorTitle && id.localeCompare(anchorId) < 0)));
			if (better) {
				anchorId = id;
				anchorDegree = degree;
				anchorTitle = title;
			}
		}

		let recentMutations = 0;
		let lastTouchedAt: string | null = null;
		for (const id of memberIds) {
			const node = byId.get(id);
			if (!node) continue;
			if (isRecent(node.updatedAt, nowMs, recentWindowDays)) recentMutations += 1;
			if (!Number.isNaN(Date.parse(node.updatedAt))) {
				if (lastTouchedAt === null || node.updatedAt > lastTouchedAt)
					lastTouchedAt = node.updatedAt;
			}
		}
		const size = memberIds.length;
		const momentum = Math.round((recentMutations / size) * 1000) / 1000;
		clusters.push({
			id: memberIds[0]!,
			label: anchorTitle,
			anchorId,
			memberIds,
			memberTitles: memberIds.map((id) => byId.get(id)?.title ?? ''),
			size,
			recentMutations,
			momentum,
			lastTouchedAt,
			dormant: momentum <= CLUSTER_THRESHOLDS.dormantMomentumMax,
		});
	}

	// Busiest arcs first — that is what a DM scans for; total tie-breakers keep it reproducible.
	clusters.sort(
		(a, b) =>
			b.momentum - a.momentum ||
			b.size - a.size ||
			a.label.localeCompare(b.label) ||
			a.id.localeCompare(b.id),
	);

	// Dormant arcs read the other way round: the arc untouched LONGEST is the one begging for a scene.
	const dormantArcs = clusters
		.filter((cluster) => cluster.dormant && cluster.size >= CLUSTER_THRESHOLDS.dormantMinSize)
		.sort(
			(a, b) =>
				(a.lastTouchedAt ?? '').localeCompare(b.lastTouchedAt ?? '') ||
				b.size - a.size ||
				a.label.localeCompare(b.label) ||
				a.id.localeCompare(b.id),
		);

	return {
		schemaVersion: GRAPH_CLUSTER_SCHEMA_VERSION,
		thresholdVersion: GRAPH_CLUSTER_THRESHOLD_VERSION,
		recentWindowDays,
		clusters,
		dormantArcs,
	};
}
