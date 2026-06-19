import { extractWikilinks } from './markdown';
import { resolveWikilink, type WikilinkTarget } from './wikilink-graph';
import { editDistance } from './edit-distance';
import {
	featureSupportForSource,
	type ContentSourceId,
} from './content-constraints';

/**
 * GRAPH-010 — the PURE DETERMINISTIC LINK-REPAIR + LINK-PICKER engine: it builds a non-revealing
 * LINK-PICKER suggestion list for an unresolved link, and a BULK-REPAIR PREVIEW (each proposed rewrite,
 * affected source, ambiguity, and unsupported-source limitation) over a set of dead links — as a pure
 * function of the actor-VISIBLE candidate index + the dead-link occurrences fed to it.
 *
 * Everything here is a PURE function of its explicit inputs. It NEVER reads ambient state, storage, a
 * clock, an id generator, or a real transport. The ACTOR-FILTERED + CAPABILITY-SCOPED surface lives in
 * the query/command layer (`queries/graph-link-repair-query.ts`), which feeds this engine ONLY the
 * candidate targets the actor may see and the dead links inside content the actor may EDIT. Because the
 * engine is fed only visible candidates, NO suggestion / preview row / repair candidate can ever name or
 * reveal a target the actor cannot see (GRAPH-010 AC1, AC4 — only visible candidate targets and
 * non-revealing labels appear; a hidden note title/id/count is omitted). It REUSES the SAME
 * {@link resolveWikilink} the CONTENT-006 wikilink lifecycle uses, so a link resolves / a repair applies
 * here exactly as it would through the existing repair path — no parallel mechanism.
 *
 * Determinism (a HARD requirement): the same candidates + dead links always produce the same suggestions
 * and the same preview in the same order, with TOTAL tie-breakers (down to the id), so the surface is
 * reproducible across fresh fixtures whose volatile ids differ and across repeated runs. The Processing
 * Core owns the algorithm; the GUI renders the computed model and dispatches the per-link repair command
 * the editor selects (Architecture Contract 1).
 */

export const GRAPH_LINK_REPAIR_SCHEMA_VERSION = 1 as const;

/** Normalize a target/alias/title for case-insensitive, trimmed matching. Deterministic. */
function normalizeName(name: string): string {
	return name.trim().toLowerCase();
}

/**
 * ONE link-picker SUGGESTION: a VISIBLE candidate target the editor may pick to repair a link. It carries
 * only the visible title + id (a `WikilinkTarget` is always a visible candidate), so the picker NEVER
 * offers a hidden target (GRAPH-010 AC1/AC4). `exactName` marks a suggestion whose title/alias matches the
 * broken target exactly (the strongest pick); the rest are close matches ranked by edit distance.
 */
export interface LinkPickerSuggestion {
	itemId: string;
	/** The visible title inserted into the repaired `[[...]]`. Already actor-safe. */
	title: string;
	/** True when the candidate's title/alias matches the broken target name exactly (case-insensitive). */
	exactName: boolean;
}

const MAX_PICKER_SUGGESTIONS = 10;

/**
 * The deterministic MATCH TIER of a candidate against the typed/broken target (lower sorts first). A link
 * picker serves BOTH partial-typing autocomplete (prefix/substring of a name being typed) AND broken-link
 * disambiguation (a near-miss typo), so the tiers fold both: an EXACT name match, then a PREFIX match,
 * then a SUBSTRING match, then a fuzzy EDIT-DISTANCE match. A candidate that fits no tier is excluded.
 */
const enum MatchTier {
	Exact = 0,
	Prefix = 1,
	Substring = 2,
	Fuzzy = 3,
	None = 4,
}

/**
 * GRAPH-010 AC1 / AC4 — build the LINK-PICKER suggestions for a broken/partial link `target` over the
 * actor's VISIBLE candidate index. A candidate's name (title or alias) qualifies when it matches the
 * target EXACTLY, by PREFIX, by SUBSTRING, or within a small EDIT-DISTANCE budget (a typo) — covering both
 * partial-typing autocomplete and broken-link disambiguation. Ranked by match tier, then edit distance,
 * then title, then id (a TOTAL deterministic order), capped to a small list. Because every candidate is a
 * visible target, a hidden note is NEVER suggested and no count reveals one. A blank target returns the
 * leading visible candidates so the picker always has something to offer. Pure + deterministic.
 */
export function buildLinkPickerSuggestions(
	target: string,
	candidates: readonly WikilinkTarget[],
): LinkPickerSuggestion[] {
	const needle = normalizeName(target);
	const budget = needle === '' ? 0 : Math.max(1, Math.min(4, Math.floor(needle.length / 3)));
	const ranked: Array<{ candidate: WikilinkTarget; tier: MatchTier; distance: number }> = [];
	for (const candidate of candidates) {
		const names = [candidate.title, ...candidate.aliases].map(normalizeName);
		if (needle === '') {
			// Blank target ⇒ every visible candidate is an equal leading offer.
			ranked.push({ candidate, tier: MatchTier.Prefix, distance: 0 });
			continue;
		}
		let tier: MatchTier = MatchTier.None;
		let distance = budget + 1;
		for (const name of names) {
			if (name === needle) {
				tier = MatchTier.Exact;
				distance = 0;
				break;
			}
			if (name.startsWith(needle) && tier > MatchTier.Prefix) tier = MatchTier.Prefix;
			else if (name.includes(needle) && tier > MatchTier.Substring) tier = MatchTier.Substring;
			const d = editDistance(needle, name, budget);
			if (d <= budget) {
				distance = Math.min(distance, d);
				if (tier > MatchTier.Fuzzy) tier = MatchTier.Fuzzy;
			}
		}
		if (tier === MatchTier.None) continue;
		ranked.push({ candidate, tier, distance });
	}
	ranked.sort(
		(a, b) =>
			a.tier - b.tier ||
			a.distance - b.distance ||
			a.candidate.title.localeCompare(b.candidate.title) ||
			a.candidate.id.localeCompare(b.candidate.id),
	);
	return ranked.slice(0, MAX_PICKER_SUGGESTIONS).map((entry) => ({
		itemId: entry.candidate.id,
		title: entry.candidate.title,
		exactName: entry.tier === MatchTier.Exact,
	}));
}

/** ONE dead link occurrence to be considered for bulk repair: where it lives + its raw broken target. */
export interface DeadLinkOccurrence {
	/** The content item id the dead link lives in (the source document of the rewrite). */
	itemId: string;
	/** The source item's title (already actor-safe), for the preview row. */
	itemTitle: string;
	/** The source the item lives in (local / Obsidian / Google Docs), for the unsupported-source check. */
	source: ContentSourceId;
	/** The raw, normalized broken target the link names (resolved to nothing in the visible graph). */
	target: string;
}

/** Why a proposed bulk-repair rewrite is BLOCKED (it is listed in the preview but not applied). */
export type RepairBlockReason =
	/** The link's source cannot represent wikilinks (e.g. Google Docs) — repairing it would mangle the doc. */
	| 'unsupported-source'
	/** No visible candidate matched the broken target — there is nothing safe to rewrite it to. */
	| 'no-candidate';

/**
 * GRAPH-010 AC2 — ONE row of the BULK-REPAIR PREVIEW: a proposed rewrite of a dead link, the affected
 * source, whether the target is AMBIGUOUS (more than one visible candidate could repair it), and any
 * limitation that BLOCKS the rewrite (an unsupported source, or no candidate). Every candidate named here
 * is a visible target, so the preview never reveals a hidden note (AC4).
 */
export interface BulkRepairPreviewRow {
	/** The affected source document the rewrite would touch. */
	itemId: string;
	itemTitle: string;
	source: ContentSourceId;
	/** The broken target the link names. */
	brokenTarget: string;
	/**
	 * The proposed replacement title (the single best visible candidate), or `null` when the rewrite is
	 * blocked. When `ambiguous` is true the editor must DISAMBIGUATE by choosing among `candidates`.
	 */
	proposedTitle: string | null;
	/** Whether more than one visible candidate could repair the broken target (the editor must choose one). */
	ambiguous: boolean;
	/** The visible candidate titles that could repair this link (the disambiguation choices). Stable order. */
	candidates: string[];
	/** When set, the rewrite is BLOCKED and listed for visibility only (no write is proposed). */
	blocked: RepairBlockReason | null;
}

/** The complete, DETERMINISTIC bulk-repair preview over a set of dead links (GRAPH-010 AC2). */
export interface BulkRepairPreview {
	schemaVersion: typeof GRAPH_LINK_REPAIR_SCHEMA_VERSION;
	/** One row per dead link occurrence, deterministically ordered (item title → id → broken target). */
	rows: BulkRepairPreviewRow[];
	/** How many rows propose a clean (unambiguous, applicable) rewrite. */
	applicableCount: number;
	/** How many rows are AMBIGUOUS (need the editor to disambiguate before writing). */
	ambiguousCount: number;
	/** How many rows are BLOCKED (unsupported source or no candidate) and listed for visibility only. */
	blockedCount: number;
}

/**
 * Collect the visible candidate TITLES that could repair a broken `target`, using the SAME match tiers as
 * {@link buildLinkPickerSuggestions} (exact / prefix / substring / fuzzy), deterministically ordered. Used
 * to decide ambiguity (more than one DISTINCT title ⇒ ambiguous) and to propose the single best title. A
 * blank target yields no candidates (there is nothing to repair to). Pure. Titles are deduped (two notes
 * can share a title — that is GRAPH-003's duplicate-title domain; here a shared title is one repair STRING).
 */
function repairCandidateTitles(target: string, candidates: readonly WikilinkTarget[]): string[] {
	if (normalizeName(target) === '') return [];
	const seen = new Set<string>();
	const titles: string[] = [];
	for (const suggestion of buildLinkPickerSuggestions(target, candidates)) {
		const key = normalizeName(suggestion.title);
		if (seen.has(key)) continue;
		seen.add(key);
		titles.push(suggestion.title);
	}
	return titles;
}

/**
 * GRAPH-010 AC2 — build the BULK-REPAIR PREVIEW over a set of dead-link occurrences against the actor's
 * VISIBLE candidate index. For each occurrence it reports the affected source, the proposed rewrite (the
 * single best visible candidate), whether the broken target is AMBIGUOUS (more than one visible candidate
 * could repair it — the editor must choose), and any limitation that BLOCKS the rewrite: an
 * `unsupported-source` (a source that cannot represent wikilinks, e.g. Google Docs) or `no-candidate`.
 * Every candidate named is a visible target, so the preview never reveals a hidden note (AC4). Pure +
 * deterministic — rows are sorted by a total tie-breaker so the preview is reproducible.
 */
export function buildBulkRepairPreview(
	occurrences: readonly DeadLinkOccurrence[],
	candidates: readonly WikilinkTarget[],
): BulkRepairPreview {
	const rows: BulkRepairPreviewRow[] = [];
	for (const occurrence of occurrences) {
		const supportsWikilinks = featureSupportForSource(occurrence.source, 'wikilinks') !== 'unsupported';
		const candidateTitles = repairCandidateTitles(occurrence.target, candidates);
		let blocked: RepairBlockReason | null = null;
		let proposedTitle: string | null = null;
		let ambiguous = false;
		if (!supportsWikilinks) {
			// The source cannot represent a wikilink — list the limitation; never propose a destructive rewrite.
			blocked = 'unsupported-source';
		} else if (candidateTitles.length === 0) {
			blocked = 'no-candidate';
		} else {
			proposedTitle = candidateTitles[0]!;
			ambiguous = candidateTitles.length > 1;
		}
		rows.push({
			itemId: occurrence.itemId,
			itemTitle: occurrence.itemTitle,
			source: occurrence.source,
			brokenTarget: normalizeName(occurrence.target),
			proposedTitle,
			ambiguous,
			candidates: candidateTitles,
			blocked,
		});
	}
	rows.sort(
		(a, b) =>
			a.itemTitle.localeCompare(b.itemTitle) ||
			a.itemId.localeCompare(b.itemId) ||
			a.brokenTarget.localeCompare(b.brokenTarget),
	);
	let applicableCount = 0;
	let ambiguousCount = 0;
	let blockedCount = 0;
	for (const row of rows) {
		if (row.blocked) blockedCount += 1;
		else if (row.ambiguous) ambiguousCount += 1;
		else applicableCount += 1;
	}
	return {
		schemaVersion: GRAPH_LINK_REPAIR_SCHEMA_VERSION,
		rows,
		applicableCount,
		ambiguousCount,
		blockedCount,
	};
}

/**
 * GRAPH-010 — collect the DEAD-LINK occurrences inside ONE note body against a visible candidate index:
 * every `[[target]]` whose target resolves to nothing visible (or to an unavailable source). Deduped per
 * (normalized target) so a target linked twice is one occurrence. Reuses {@link resolveWikilink}, so a
 * link is dead here exactly when it is dead in the repair path. Pure + deterministic.
 */
export function deadLinksInBody(
	itemId: string,
	itemTitle: string,
	source: ContentSourceId,
	body: string,
	candidates: readonly WikilinkTarget[],
): DeadLinkOccurrence[] {
	const seen = new Set<string>();
	const occurrences: DeadLinkOccurrence[] = [];
	for (const link of extractWikilinks(body)) {
		const resolution = resolveWikilink({ target: link.target }, candidates);
		// `resolved` (to a visible target) is fine; `unresolved` / `source-unavailable` are dead for repair.
		if (resolution.status === 'resolved') continue;
		const normalized = normalizeName(link.target);
		if (normalized === '' || seen.has(normalized)) continue;
		seen.add(normalized);
		occurrences.push({ itemId, itemTitle, source, target: normalized });
	}
	return occurrences;
}
