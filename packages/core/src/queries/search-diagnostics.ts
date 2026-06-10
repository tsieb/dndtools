import type { SearchContentType, SearchFilter } from '../state/saved-search';
import { normalizeSearchFilter } from '../state/saved-search';
import type { RankingSignals, SearchHit, SearchResult } from './search-query';

/**
 * SRCH-008 — DETERMINISTIC SEARCH DIAGNOSTICS that stay stable across FRESH VAULT FIXTURES.
 *
 * The earlier SRCH epics made the search RESULT deterministic (stable ranking + tie-breaks). But the result
 * still carries VOLATILE entity IDs: in production every note/POI/handout id is a `crypto.randomUUID()`, so
 * generating the same fixture vault twice produces structurally-identical results whose ids differ entirely.
 * The defects this epic closes (`CODEX-PR12-AXE-FINGERPRINTS`, `AUDIT-21.4-FEATURE-TIER-E2E`) are exactly
 * that churn: a test artifact / diagnostic FINGERPRINT that changes run-to-run only because the ids changed,
 * drowning the real signal. SRCH-008 requires that "volatile IDs do not create unrelated fingerprint churn"
 * (AC1) and that an exported/imported saved search either preserves its STABLE criteria or surfaces explicit
 * remapping diagnostics (AC2).
 *
 * This module is the determinism layer. It is PURE + INSPECTABLE and produces two things:
 *
 *   1. A {@link SearchResultDiagnostics} fingerprint of a search result that NORMALIZES volatile ids to
 *      STABLE, content-derived tokens, so two fresh vaults with the same visible content fingerprint
 *      IDENTICALLY even though their raw ids differ (AC1). It also captures the deterministic RANKING shape
 *      (per-signal breakdown, the deterministic order) so the order is inspectable/explainable — and it does
 *      so over the ALREADY ACTOR-FILTERED result, so it can never expose a hidden hit, a hidden id, or a
 *      count that reveals hidden content (the result it summarizes contains only visible hits).
 *   2. A {@link SavedSearchPortabilityDiagnostics} report for exporting/importing a saved search: it
 *      separates the STABLE criteria (text, tags, folder, source, content type, date range) — which carry
 *      across vaults verbatim — from criteria that reference a VOLATILE id (a relationship anchor id) that
 *      CANNOT be assumed to exist in the new vault, and emits an explicit REMAPPING diagnostic for each
 *      (AC2). Nothing here resolves content, so no hidden artifact is touched.
 *
 * NO-LEAK: every input here is an ALREADY actor-filtered value (a {@link SearchResult} of visible hits, or a
 * {@link SearchFilter} which names no results and carries no content). The diagnostics summarize only what
 * the actor can already see, so they can never reveal a hidden item, hidden match text, or a revealing count.
 *
 * Pure + deterministic: a function of its explicit inputs only. No clock, no id generator, no DOM.
 */

/** The version of the diagnostic fingerprint schema, so a persisted/compared fingerprint can be matched. */
export const SEARCH_DIAGNOSTICS_SCHEMA_VERSION = 1 as const;

/**
 * One hit's NORMALIZED diagnostic row. The volatile `id` is REPLACED by a stable `key` — a content-derived,
 * id-free token (`<type>:<title>` for content/handouts, `<type>:<title>@<mapId-rank>` is avoided so a
 * volatile map id never leaks into the fingerprint). The rank, type, score, and per-signal breakdown make
 * the row explainable WITHOUT depending on any volatile id.
 */
export interface SearchDiagnosticHit {
	/** 1-based rank in the deterministic order (stable across fresh fixtures for identical content). */
	rank: number;
	/** The hit's content type. */
	type: SearchContentType;
	/**
	 * A STABLE, id-free key for the hit: `<type>:<normalized-title>`. Two fresh vaults with the same visible
	 * content produce the same key even though the underlying entity ids differ (SRCH-008 AC1). Lowercased +
	 * whitespace-collapsed so trivial title formatting differences do not churn the fingerprint.
	 */
	key: string;
	/** The deterministic composite score (a function of the visible signals — stable across fixtures). */
	score: number;
	/** The per-signal breakdown, so the rank is explainable without re-running search. */
	signals: RankingSignals;
}

/** The deterministic, id-free DIAGNOSTIC FINGERPRINT of a search result (SRCH-008 AC1). */
export interface SearchResultDiagnostics {
	schemaVersion: typeof SEARCH_DIAGNOSTICS_SCHEMA_VERSION;
	/** The normalized per-hit rows, in the result's deterministic order. */
	hits: SearchDiagnosticHit[];
	/** Total visible hits (== the result's `totalCount`; never a hidden count). */
	totalCount: number;
	/** Per-type visible counts (echoes the result facet counts — over the visible set only). */
	countsByType: Record<SearchContentType, number>;
	/**
	 * A single STABLE FINGERPRINT string of the whole result: the ordered list of `<rank>=<key>@<score>`
	 * rows joined deterministically. Identical for two fresh vaults with the same visible content + ranking
	 * (SRCH-008 AC1), so a test/diagnostic can assert on it without volatile-id churn.
	 */
	fingerprint: string;
}

/** Normalize a title into a stable, id-free token: trimmed, lowercased, internal whitespace collapsed. */
function normalizeTitleKey(title: string): string {
	return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The STABLE, id-free key for a hit: `<type>:<normalized-title>`. Carries no volatile id (SRCH-008 AC1). */
function stableHitKey(hit: SearchHit): string {
	return `${hit.type}:${normalizeTitleKey(hit.title)}`;
}

/**
 * SRCH-008 AC1 — build the DETERMINISTIC, id-free diagnostic fingerprint of a search result. The result is
 * ALREADY actor-filtered (only visible hits), so this exposes nothing hidden. The hits are kept in the
 * result's deterministic order; each row replaces the volatile id with a stable content-derived key, so the
 * fingerprint is identical across fresh vault fixtures with the same visible content. Pure.
 */
export function diagnoseSearchResult(result: SearchResult): SearchResultDiagnostics {
	const hits: SearchDiagnosticHit[] = result.hits.map((hit, index) => ({
		rank: index + 1,
		type: hit.type,
		key: stableHitKey(hit),
		score: hit.score,
		signals: { ...hit.signals },
	}));
	const fingerprint = hits.map((row) => `${row.rank}=${row.key}@${row.score}`).join('|');
	return {
		schemaVersion: SEARCH_DIAGNOSTICS_SCHEMA_VERSION,
		hits,
		totalCount: result.totalCount,
		countsByType: { ...result.countsByType },
		fingerprint,
	};
}

/**
 * SRCH-008 AC2 — one REMAPPING diagnostic for a saved-search criterion that references a VOLATILE id which
 * cannot be assumed to exist in the imported vault. The message is generic + non-leaking (it names the
 * criterion + the dangling id, never any content). The GUI surfaces these so the importing DM can re-point
 * the criterion at the new vault's entity.
 */
export interface SavedSearchRemapping {
	/** Which criterion needs remapping. */
	criterion: 'relationship-anchor';
	/** The kind of anchor (a content item or a POI), so the DM knows what to re-point at. */
	anchorKind: 'content' | 'poi';
	/** The dangling id from the source vault (a value, not content — it names no title/snippet). */
	sourceId: string;
	/** A generic, non-leaking explanation for the GUI. */
	message: string;
}

/**
 * SRCH-008 AC2 — the PORTABILITY report for exporting/importing a saved search across vaults. It splits the
 * filter into the STABLE criteria that carry across verbatim and the volatile-id criteria that need explicit
 * remapping. `portable` is true when every criterion is stable (the saved search runs unchanged in the new
 * vault); otherwise the `remappings` list tells the DM exactly what to re-point.
 */
export interface SavedSearchPortabilityDiagnostics {
	/** The normalized, STABLE filter that carries across vaults verbatim (volatile-id criteria stripped). */
	stableFilter: SearchFilter;
	/** The explicit remapping diagnostics for criteria that reference a volatile id (empty ⇒ fully portable). */
	remappings: SavedSearchRemapping[];
	/** True when the filter is fully portable (no remapping needed). */
	portable: boolean;
}

/**
 * SRCH-008 AC2 — diagnose how a saved search's FILTER ports to a fresh vault. The STABLE criteria (free
 * text, tags, folder, source, content type, date range) are vault-independent VALUES and carry across
 * verbatim — they are preserved on the `stableFilter`. The only criterion that references a VOLATILE entity
 * id is the RELATIONSHIP anchor (a content-item / POI id), which cannot be assumed to exist in the new
 * vault; it is STRIPPED from the stable filter and reported as an explicit remapping diagnostic so the
 * import surfaces it rather than silently matching nothing (or, worse, a coincidental id). Pure + no-leak:
 * the filter names no results and carries no content, so nothing hidden is touched.
 *
 * Note: a date range's `calendarId` is a vault-level CONFIG id, not a per-entity volatile id; the v2 model
 * keeps calendars as stable, named vault configuration, so the date range is treated as stable criteria and
 * carried across. (If a future epic makes calendar ids volatile per-vault, it plugs a remapping here without
 * changing this contract.)
 */
export function diagnoseSavedSearchPortability(
	filter: SearchFilter | undefined,
): SavedSearchPortabilityDiagnostics {
	const normalized = normalizeSearchFilter(filter);
	const remappings: SavedSearchRemapping[] = [];

	// Strip the relationship anchor (the only volatile-id criterion) from the stable filter and report it.
	const { relationship, ...stableRest } = normalized;
	const stableFilter: SearchFilter = { ...stableRest };
	if (relationship) {
		remappings.push({
			criterion: 'relationship-anchor',
			anchorKind: relationship.anchorKind,
			sourceId: relationship.anchorId,
			message:
				'This saved search filters by a related item that may not exist in the imported vault. ' +
				'Re-select the related item to restore the relationship filter.',
		});
	}

	return {
		stableFilter,
		remappings,
		portable: remappings.length === 0,
	};
}
