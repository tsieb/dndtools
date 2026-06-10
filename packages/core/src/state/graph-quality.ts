import { extractWikilinks } from './markdown';
import { resolveWikilink, type WikilinkTarget } from './wikilink-graph';

/**
 * GRAPH-003 — the PURE DETERMINISTIC GRAPH-QUALITY engine: UNRESOLVED LINKS (+ repair candidates),
 * ALIAS / DUPLICATE-TITLE disambiguation, ORPHAN notes, HUB notes, and RELATIONSHIP-QUALITY scoring,
 * computed as a PURE function of a set of {@link QualityNode}s (each a visible note's id/title/aliases +
 * its outbound links).
 *
 * Everything here is a PURE function of its explicit inputs. It NEVER reads ambient state, storage, a
 * clock, an id generator, or a real transport, and it embeds NO AI — every finding is produced by an
 * inspectable, reproducible ALGORITHM (Vision "Algorithms not AI"; Cross-Contract Non-Negotiable 7). The
 * ACTOR-FILTERED surface lives in the query layer (`queries/graph-quality-query.ts`), which feeds this
 * engine ONLY the notes — and their links — the actor may see. Because the engine is fed only visible
 * inputs, NO finding (count, repair candidate, duplicate group, hub, orphan, score) can ever name or
 * even reveal the EXISTENCE of a note the actor cannot see (GRAPH-003 actor-filtering, fail closed;
 * Cross-Contract Non-Negotiable 2). In particular an UNRESOLVED-LINK report can never distinguish
 * "target is hidden from this actor" from "target truly missing": a link to a target absent from the
 * visible set is simply `unresolved`, so a player can never probe a dangling link to learn a DM-only
 * note exists.
 *
 * This COMPOSES the existing actor-filtered link graph rather than introducing a second relationship
 * source. The link RESOLUTION it builds on is the SAME {@link resolveWikilink} the CONTENT-006 wikilink
 * lifecycle uses (`state/wikilink-graph.ts`), and the candidate index it consumes is the SAME
 * {@link WikilinkTarget} shape (`buildWikilinkCandidatesForActor`). A repair candidate it proposes is
 * therefore exactly a target the existing repair path could rewrite to — no parallel mechanism.
 *
 * Determinism (a HARD requirement): the same nodes always produce the same findings in the same order,
 * with TOTAL tie-breakers (every list is sorted by a stable key down to the id), so identical visible
 * content fingerprints identically across fresh fixtures whose volatile ids differ and across repeated
 * runs. Every relationship-quality score carries its deterministic INPUTS, the THRESHOLD VERSION, and
 * the SOURCE REFERENCES it was computed from, and never an AI-only rationale (GRAPH-003 AC3). The
 * Processing Core owns the algorithm; the GUI renders the computed findings (Architecture Contract 1).
 */

export const GRAPH_QUALITY_SCHEMA_VERSION = 1 as const;

/**
 * The THRESHOLD VERSION stamped on every relationship-quality finding (GRAPH-003 AC3). Bumping it is a
 * scoring-policy change: a persisted/compared finding records which threshold set produced it, so a
 * score is reproducible AND explainable across releases. Kept in lockstep with {@link QUALITY_THRESHOLDS}.
 */
export const GRAPH_QUALITY_THRESHOLD_VERSION = '1' as const;

/**
 * The deterministic SCORING THRESHOLDS the relationship-quality findings are graded against. These are
 * the inspectable knobs (not magic numbers buried in code): a hub is a note with at least this many
 * inbound links; a note's connection score is graded against these band edges. Frozen + versioned so the
 * grading is reproducible and the {@link GRAPH_QUALITY_THRESHOLD_VERSION} can certify which set was used.
 */
export const QUALITY_THRESHOLDS = Object.freeze({
	/** Inbound-link count at/above which a note is a HUB (a highly-referenced note). */
	hubInboundMin: 3,
	/** A connection score at/above this is `well-connected`; below `isolatedMax` is `isolated`; else `sparse`. */
	wellConnectedMin: 4,
	/** A connection score at/below this is `isolated` (an orphan scores 0). */
	isolatedMax: 0,
});

/**
 * ONE note as fed to the graph-quality engine: its id/title/aliases (for duplicate/alias detection and
 * link resolution) and its OUTBOUND links (the `[[wikilinks]]` it authored). A node only ever appears
 * here for an actor-VISIBLE note, so deriving any finding from it leaks nothing. The link TARGETS are
 * resolved against the visible candidate index, so a link to a hidden/missing target is simply unresolved.
 */
export interface QualityNode {
	/** The content item id the note resolves to. */
	id: string;
	/** The canonical title a link names (and the title duplicate-detection groups by). */
	title: string;
	/** Alternate names (Obsidian `aliases`) that also resolve to this note (alias-collision detection). */
	aliases: string[];
	/** The raw `[[...]]` link targets this note authored, in document order (duplicates preserved). */
	outboundTargets: string[];
}

/** Normalize a title/alias/target for case-insensitive, trimmed matching. Deterministic. */
function normalizeName(name: string): string {
	return name.trim().toLowerCase();
}

/**
 * Build a {@link QualityNode} from a note's raw body + identity. Extracts the outbound `[[wikilink]]`
 * targets from the body the SAME way the rest of the graph does ({@link extractWikilinks}). Pure: a
 * function of the explicit inputs only — no clock, no ambient state — so the node is stable across
 * fixtures. The caller (the query layer) supplies only actor-visible notes + their visible bodies.
 */
export function buildQualityNode(input: {
	id: string;
	title: string;
	aliases: readonly string[];
	body: string;
}): QualityNode {
	return {
		id: input.id,
		title: input.title,
		aliases: [...input.aliases],
		outboundTargets: extractWikilinks(input.body).map((link) => link.target),
	};
}

/** One UNRESOLVED link found in the visible graph: which note authored it, the raw target, and a repair candidate. */
export interface UnresolvedLink {
	/** The id of the note that authored the unresolved `[[target]]`. */
	sourceId: string;
	/** The source note's title (already actor-safe). */
	sourceTitle: string;
	/** The raw, normalized link target that resolved to nothing in the visible graph. */
	target: string;
	/**
	 * GRAPH-003 AC1 — a DETERMINISTIC repair candidate: the visible title closest to the broken `target`,
	 * proposed WITHOUT AI, or `null` when no reasonable candidate exists. This is exactly a title the
	 * existing repair path ({@link import('./wikilink-graph').applyLinkRepair}) could rewrite the link to.
	 */
	repairCandidate: string | null;
}

/** One DUPLICATE-TITLE / ALIAS COLLISION group surfaced for disambiguation (GRAPH-003 AC2). */
export interface DisambiguationGroup {
	/** Why these notes collide: identical normalized title, or a shared alias/title name. */
	kind: 'duplicate-title' | 'alias-collision';
	/** The normalized name they collide on (the title, or the shared alias/title). */
	name: string;
	/** The ids of the colliding notes, deduped + sorted (stable across fixtures). */
	itemIds: string[];
	/** The colliding notes' titles, in the same order as `itemIds` (already actor-safe). */
	titles: string[];
}

/** A note with NO inbound and NO (resolvable) outbound visible links — an ORPHAN (GRAPH-003). */
export interface OrphanNote {
	itemId: string;
	title: string;
}

/** A HUB note: one referenced by many visible notes (an inbound-degree at/above the hub threshold). */
export interface HubNote {
	itemId: string;
	title: string;
	/** How many DISTINCT visible notes link to this note (its inbound degree over the visible graph). */
	inboundCount: number;
}

/** The graded connection band of a note's relationship quality. */
export type ConnectionBand = 'isolated' | 'sparse' | 'well-connected';

/**
 * GRAPH-003 AC3 — ONE relationship-quality finding for a note. It carries the DETERMINISTIC INPUTS the
 * score was computed from, the THRESHOLD VERSION that graded it, and the SOURCE REFERENCES (the ids of
 * the visible notes that contributed inbound/outbound edges) — and NO AI-only rationale. Every value is
 * derived from the actor-visible graph only, so a score never reflects a hidden edge.
 */
export interface RelationshipQualityScore {
	itemId: string;
	title: string;
	/** The graded band (`isolated` / `sparse` / `well-connected`), decided by {@link QUALITY_THRESHOLDS}. */
	band: ConnectionBand;
	/** The composite connection score (a deterministic function of the inputs below). Higher == better connected. */
	score: number;
	/** The DETERMINISTIC INPUTS the score was computed from (GRAPH-003 AC3 — inspectable, no AI). */
	inputs: {
		/** Distinct visible notes that link TO this note (inbound degree). */
		inboundCount: number;
		/** Distinct visible notes this note links TO that RESOLVE (outbound resolved degree). */
		outboundResolvedCount: number;
		/** Outbound links from this note that resolve to nothing visible (unresolved degree). */
		outboundUnresolvedCount: number;
	};
	/** GRAPH-003 AC3 — the threshold-set version that graded this finding. */
	thresholdVersion: typeof GRAPH_QUALITY_THRESHOLD_VERSION;
	/**
	 * GRAPH-003 AC3 — the SOURCE REFERENCES: the ids of the visible notes that contributed the edges this
	 * score reflects (inbound sources + resolved outbound targets), deduped + sorted. Every id is a visible
	 * note, so the references can never name a hidden note.
	 */
	sourceRefs: string[];
}

/**
 * The complete, DETERMINISTIC graph-quality report over the actor's visible graph. Every list is sorted
 * by a stable, TOTAL key so the report is reproducible across fresh fixtures and repeated runs. Counts
 * are computed over the visible set only, so none reveals hidden content.
 */
export interface GraphQualityReport {
	schemaVersion: typeof GRAPH_QUALITY_SCHEMA_VERSION;
	thresholdVersion: typeof GRAPH_QUALITY_THRESHOLD_VERSION;
	/** Visible links that resolve to nothing, each with a deterministic repair candidate (AC1). */
	unresolvedLinks: UnresolvedLink[];
	/** Duplicate-title + alias-collision groups, for DM/editor disambiguation (AC2). */
	disambiguation: DisambiguationGroup[];
	/** Notes with no visible inbound or resolvable outbound links. */
	orphans: OrphanNote[];
	/** Highly-referenced notes (inbound degree ≥ the hub threshold). */
	hubs: HubNote[];
	/** Per-note relationship-quality scores with deterministic inputs + threshold version + source refs (AC3). */
	scores: RelationshipQualityScore[];
}

/**
 * Levenshtein edit distance between two strings, capped early at `max` for efficiency. Pure: a function
 * of the two strings only. Used to propose a DETERMINISTIC repair candidate for an unresolved link
 * (the closest visible title), so the same broken target + candidate set always proposes the same fix.
 */
function editDistance(a: string, b: string, max: number): number {
	if (a === b) return 0;
	if (Math.abs(a.length - b.length) > max) return max + 1;
	const prev = new Array<number>(b.length + 1);
	const curr = new Array<number>(b.length + 1);
	for (let j = 0; j <= b.length; j += 1) prev[j] = j;
	for (let i = 1; i <= a.length; i += 1) {
		curr[0] = i;
		let rowMin = curr[0]!;
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
			if (curr[j]! < rowMin) rowMin = curr[j]!;
		}
		// Whole row already exceeds the cap — no path can come back under it; bail deterministically.
		if (rowMin > max) return max + 1;
		for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j]!;
	}
	return prev[b.length]!;
}

/**
 * GRAPH-003 AC1 — propose a DETERMINISTIC repair candidate for a broken link target: the visible title
 * with the smallest edit distance to the target, within a small distance budget, with ties broken
 * deterministically by the candidate title then id (so the same inputs always propose the same fix and
 * no AI is involved). Returns `null` when no visible title is close enough — better to offer nothing than
 * a misleading fix. Every candidate is a visible note, so the proposal never reveals a hidden note.
 */
function proposeRepairCandidate(
	target: string,
	candidates: readonly WikilinkTarget[],
): string | null {
	const needle = normalizeName(target);
	if (needle === '') return null;
	// Distance budget scales gently with the target length so short names need a near-exact match.
	const budget = Math.max(1, Math.min(4, Math.floor(needle.length / 3)));
	let best: { title: string; id: string; distance: number } | null = null;
	for (const candidate of candidates) {
		// Compare against the candidate's title AND each alias; the closest of them is the candidate's distance.
		const names = [candidate.title, ...candidate.aliases];
		let candidateDistance = budget + 1;
		for (const name of names) {
			const distance = editDistance(needle, normalizeName(name), budget);
			if (distance < candidateDistance) candidateDistance = distance;
		}
		if (candidateDistance > budget) continue;
		if (
			best === null ||
			candidateDistance < best.distance ||
			(candidateDistance === best.distance && candidate.title.localeCompare(best.title) < 0) ||
			(candidateDistance === best.distance &&
				candidate.title === best.title &&
				candidate.id.localeCompare(best.id) < 0)
		) {
			best = { title: candidate.title, id: candidate.id, distance: candidateDistance };
		}
	}
	return best ? best.title : null;
}

/**
 * GRAPH-003 — compute the complete, DETERMINISTIC graph-quality report over the provided VISIBLE nodes +
 * candidate index. The `candidates` are the SAME actor-filtered {@link WikilinkTarget} index the wikilink
 * lifecycle uses; link resolution reuses {@link resolveWikilink}, so a link resolves here exactly when it
 * resolves there. Every finding is derived from the visible inputs only (no hidden note can appear in or
 * be revealed by any list/count), and every list is sorted by a total tie-breaker so the report is stable
 * across fresh fixtures and repeated runs. Pure + deterministic; embeds no AI.
 */
export function computeGraphQuality(
	nodes: readonly QualityNode[],
	candidates: readonly WikilinkTarget[],
): GraphQualityReport {
	// Resolve each node's outbound links ONCE against the visible candidate index. Track, per note, the
	// distinct resolved outbound target ids and the unresolved raw targets — the substrate every finding uses.
	const resolvedOutbound = new Map<string, Set<string>>(); // sourceId -> set of resolved target ids
	const inbound = new Map<string, Set<string>>(); // targetId -> set of source ids that link to it
	const unresolvedLinks: UnresolvedLink[] = [];
	for (const node of nodes) {
		const resolvedTargets = new Set<string>();
		const reportedUnresolved = new Set<string>(); // one unresolved entry per (source, normalized target)
		for (const rawTarget of node.outboundTargets) {
			const resolution = resolveWikilink({ target: rawTarget }, candidates);
			if (resolution.status === 'resolved') {
				// A self-link does not contribute to connectivity (a note is not connected to itself).
				if (resolution.targetId === node.id) continue;
				resolvedTargets.add(resolution.targetId);
				const set = inbound.get(resolution.targetId) ?? new Set<string>();
				set.add(node.id);
				inbound.set(resolution.targetId, set);
			} else {
				// `unresolved` OR `source-unavailable` — in both cases the link does not reach a visible target.
				// A `source-unavailable` target is one the actor cannot currently reach; treating it as
				// unresolved here keeps the report fail-closed (it never asserts a hidden/offline target exists).
				const normalized = normalizeName(rawTarget);
				if (normalized === '' || reportedUnresolved.has(normalized)) continue;
				reportedUnresolved.add(normalized);
				unresolvedLinks.push({
					sourceId: node.id,
					sourceTitle: node.title,
					target: normalized,
					repairCandidate: proposeRepairCandidate(rawTarget, candidates),
				});
			}
		}
		resolvedOutbound.set(node.id, resolvedTargets);
	}
	unresolvedLinks.sort(
		(a, b) =>
			a.sourceTitle.localeCompare(b.sourceTitle) ||
			a.sourceId.localeCompare(b.sourceId) ||
			a.target.localeCompare(b.target),
	);

	// --- DISAMBIGUATION: duplicate titles + alias collisions (GRAPH-003 AC2) ---
	const disambiguation = computeDisambiguation(nodes);

	// --- ORPHANS + HUBS + relationship-quality SCORES ---
	const orphans: OrphanNote[] = [];
	const hubs: HubNote[] = [];
	const scores: RelationshipQualityScore[] = [];
	for (const node of nodes) {
		const inboundSources = inbound.get(node.id) ?? new Set<string>();
		const outboundResolved = resolvedOutbound.get(node.id) ?? new Set<string>();
		const inboundCount = inboundSources.size;
		const outboundResolvedCount = outboundResolved.size;
		const outboundUnresolvedCount = unresolvedLinks.filter((link) => link.sourceId === node.id).length;

		if (inboundCount === 0 && outboundResolvedCount === 0) {
			orphans.push({ itemId: node.id, title: node.title });
		}
		if (inboundCount >= QUALITY_THRESHOLDS.hubInboundMin) {
			hubs.push({ itemId: node.id, title: node.title, inboundCount });
		}

		// The composite connection score weights inbound references (being referenced) and resolved
		// outbound references (referencing others) equally; it is a deterministic function of the inputs.
		const score = inboundCount + outboundResolvedCount;
		const band: ConnectionBand =
			score >= QUALITY_THRESHOLDS.wellConnectedMin
				? 'well-connected'
				: score <= QUALITY_THRESHOLDS.isolatedMax
					? 'isolated'
					: 'sparse';
		const sourceRefs = [...new Set<string>([...inboundSources, ...outboundResolved])].sort((a, b) =>
			a.localeCompare(b),
		);
		scores.push({
			itemId: node.id,
			title: node.title,
			band,
			score,
			inputs: { inboundCount, outboundResolvedCount, outboundUnresolvedCount },
			thresholdVersion: GRAPH_QUALITY_THRESHOLD_VERSION,
			sourceRefs,
		});
	}
	orphans.sort((a, b) => a.title.localeCompare(b.title) || a.itemId.localeCompare(b.itemId));
	hubs.sort(
		(a, b) =>
			b.inboundCount - a.inboundCount ||
			a.title.localeCompare(b.title) ||
			a.itemId.localeCompare(b.itemId),
	);
	scores.sort((a, b) => a.title.localeCompare(b.title) || a.itemId.localeCompare(b.itemId));

	return {
		schemaVersion: GRAPH_QUALITY_SCHEMA_VERSION,
		thresholdVersion: GRAPH_QUALITY_THRESHOLD_VERSION,
		unresolvedLinks,
		disambiguation,
		orphans,
		hubs,
		scores,
	};
}

/**
 * GRAPH-003 AC2 — surface DUPLICATE TITLES and ALIAS COLLISIONS for disambiguation. Two notes collide on
 * a `duplicate-title` when their normalized titles match; they collide on an `alias-collision` when one
 * note's alias matches another note's title OR alias (so an alias that shadows a real title is caught).
 * Groups are deterministic: keyed by the normalized colliding name, with member ids/titles deduped +
 * sorted. A name shared by only one note is not a collision. Pure.
 */
function computeDisambiguation(nodes: readonly QualityNode[]): DisambiguationGroup[] {
	// Group note ids by every name they answer to, tracking title-names vs alias-names per group.
	const byName = new Map<string, { titleIds: Set<string>; aliasIds: Set<string> }>();
	const ensure = (name: string) => {
		let entry = byName.get(name);
		if (!entry) {
			entry = { titleIds: new Set<string>(), aliasIds: new Set<string>() };
			byName.set(name, entry);
		}
		return entry;
	};
	for (const node of nodes) {
		const title = normalizeName(node.title);
		if (title !== '') ensure(title).titleIds.add(node.id);
		for (const alias of node.aliases) {
			const normalized = normalizeName(alias);
			if (normalized !== '') ensure(normalized).aliasIds.add(node.id);
		}
	}

	const titleById = new Map<string, string>();
	for (const node of nodes) titleById.set(node.id, node.title);

	const groups: DisambiguationGroup[] = [];
	for (const [name, entry] of byName) {
		const allIds = new Set<string>([...entry.titleIds, ...entry.aliasIds]);
		if (allIds.size < 2) continue; // a name owned by a single note is not a collision
		// DUPLICATE-TITLE when ≥2 DISTINCT notes carry this name as their TITLE; otherwise an ALIAS collision
		// (an alias that matches another note's title/alias). Title collisions are the stronger signal.
		const kind: DisambiguationGroup['kind'] =
			entry.titleIds.size >= 2 ? 'duplicate-title' : 'alias-collision';
		const itemIds = [...allIds].sort((a, b) => a.localeCompare(b));
		groups.push({
			kind,
			name,
			itemIds,
			titles: itemIds.map((id) => titleById.get(id) ?? ''),
		});
	}
	// Deterministic order: duplicate-title groups first, then by colliding name, then by first id.
	const kindOrder: Record<DisambiguationGroup['kind'], number> = {
		'duplicate-title': 0,
		'alias-collision': 1,
	};
	groups.sort(
		(a, b) =>
			kindOrder[a.kind] - kindOrder[b.kind] ||
			a.name.localeCompare(b.name) ||
			(a.itemIds[0] ?? '').localeCompare(b.itemIds[0] ?? ''),
	);
	return groups;
}
