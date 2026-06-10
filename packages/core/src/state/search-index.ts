import type { SearchContentType } from './saved-search';
import { SEARCH_CONTENT_TYPES } from './saved-search';

/**
 * SRCH-009 / SRCH-001 — the LOCAL SEARCH INDEX FRESHNESS model.
 *
 * This is the FOUNDATION the SRCH query surfaces (SRCH-003 faceted search, SRCH-004 saved searches) build
 * on. It does NOT hold a second copy of vault content — every searchable artifact stays in its own durable
 * state document and is read through its own actor-filtered query, so there is no parallel index that could
 * leak a hidden item (Cross-Contract Non-Negotiable 2). What this model holds is the small, REBUILDABLE
 * BOOKKEEPING that lets the engine PUBLISH index FRESHNESS, the SOURCE CURSOR, and PARTIAL-RESULT status for
 * each searchable DOMAIN without blocking visible cached results (SRCH-009):
 *
 *   - The local cache index is the primary copy for OFFLINE search (Contract 2 Local-First Invariant): a
 *     search resolves entirely from local state with zero network. This module's freshness signal lets the
 *     GUI tell the user when the locally-cached results MIGHT be behind a source that has advanced.
 *   - When a note/object/map artifact/session record CHANGES, the accepted mutation advances the indexed
 *     CURSOR for that domain. If background indexing is INCOMPLETE — the source cursor has advanced past the
 *     indexed cursor — the domain is `stale` or `partial`, and that status is exposed WITH the affected
 *     domains/sources (SRCH-001 AC3 / SRCH-009 AC1) WITHOUT blocking the cached results that DO exist.
 *   - When the source cursor advances after sync and indexing then completes, the indexed cursor catches up
 *     and the freshness returns to `fresh` (SRCH-009 AC2).
 *
 * FAIL-CLOSED FRESHNESS is the keystone safety property: when freshness is UNKNOWN (no cursor recorded yet)
 * or a source is unavailable, the domain is signalled `unknown`/`stale`, NEVER `fresh` — the engine prefers
 * "possibly-behind" over "confidently-wrong" (the requirement's "mark stale status before returning
 * results"). The model is a `cache index that can be rebuilt` (Contract 2 device-local-only), so it carries
 * NO content and NO secrets and is safe to discard and recompute.
 *
 * Pure data + pure reducers. No DOM, no storage, no clock — cursors/timestamps are supplied by the caller.
 */

export const SEARCH_INDEX_SCHEMA_VERSION = 1 as const;

/**
 * A SEARCHABLE DOMAIN == a SRCH-001 content type. Freshness is tracked PER DOMAIN so a stale handout index
 * never blocks fresh note results (SRCH-009 "for each searchable domain").
 */
export type SearchDomain = SearchContentType;

export const SEARCH_DOMAINS: readonly SearchDomain[] = SEARCH_CONTENT_TYPES;

/**
 * The freshness STATUS of one domain's local index:
 *   - `fresh`   — the indexed cursor matches (or is ahead of) the source cursor; cached results are current.
 *   - `partial` — indexing is IN PROGRESS: some of the domain is indexed but the source cursor is ahead, so
 *                 results are returned but may be incomplete (SRCH-009 AC1 "stale or partial").
 *   - `stale`   — the source cursor has advanced and indexing has NOT started/caught up; cached results are
 *                 known-behind. Also the fail-closed status for a domain whose source is unavailable.
 *   - `unknown` — no cursor has been recorded yet (freshness cannot be proven). Fail-closed: treated as not
 *                 fresh, so the GUI never presents an unproven index as current.
 */
export type SearchDomainFreshnessStatus = 'fresh' | 'partial' | 'stale' | 'unknown';

/**
 * A monotonically-advancing INDEX CURSOR. Mirrors the sync source-cursor concept (Contract 2: source
 * adapters expose change cursors/revisions, not snapshots) but for the LOCAL index: a count of accepted
 * mutations the index has consumed, plus the latest entity revision/timestamp it reflects. A higher cursor
 * strictly dominates a lower one, so two cursors are deterministically comparable.
 */
export interface SearchIndexCursor {
	/** The number of accepted domain mutations consumed into the index (monotonic, advances on each write). */
	sequence: number;
	/** The highest entity revision the index reflects for this domain (0 when the domain is empty). */
	revision: number;
	/** The timestamp of the most recent indexed mutation, or `null` when nothing has been indexed yet. */
	updatedAt: string | null;
}

export const EMPTY_INDEX_CURSOR: SearchIndexCursor = Object.freeze({
	sequence: 0,
	revision: 0,
	updatedAt: null,
});

/**
 * One domain's index state: the cursor the LOCAL index has reached, plus the SOURCE cursor the domain has
 * been observed to reach. When `sourceCursor` is ahead of `indexedCursor`, indexing is behind and the
 * domain is `stale`/`partial`. `available` is the fail-closed source-availability flag: an unavailable
 * source forces `stale` regardless of cursors (its cached results are known-behind).
 */
export interface SearchDomainIndex {
	domain: SearchDomain;
	/** The cursor the local index has consumed up to. */
	indexedCursor: SearchIndexCursor;
	/** The cursor the source/store has advanced to (what indexing must catch up to). */
	sourceCursor: SearchIndexCursor;
	/** Whether the domain's source is currently available. `false` ⇒ fail-closed `stale`. */
	available: boolean;
}

/** The durable-ish (rebuildable) local search index: one {@link SearchDomainIndex} per searchable domain. */
export interface SearchIndexState {
	domains: Record<SearchDomain, SearchDomainIndex>;
	schemaVersion: typeof SEARCH_INDEX_SCHEMA_VERSION;
}

function emptyDomainIndex(domain: SearchDomain): SearchDomainIndex {
	return {
		domain,
		indexedCursor: { ...EMPTY_INDEX_CURSOR },
		sourceCursor: { ...EMPTY_INDEX_CURSOR },
		available: true,
	};
}

/** A fresh, empty index where every domain is at the zero cursor (nothing indexed yet — `fresh` and empty). */
export function createEmptySearchIndex(): SearchIndexState {
	const domains = {} as Record<SearchDomain, SearchDomainIndex>;
	for (const domain of SEARCH_DOMAINS) domains[domain] = emptyDomainIndex(domain);
	return { domains, schemaVersion: SEARCH_INDEX_SCHEMA_VERSION };
}

/** The canonical empty index value. */
export const EMPTY_SEARCH_INDEX: SearchIndexState = Object.freeze(createEmptySearchIndex());

/** Whether `a` strictly dominates `b`: it has consumed at least as much by BOTH sequence and revision. */
function cursorDominates(a: SearchIndexCursor, b: SearchIndexCursor): boolean {
	return a.sequence >= b.sequence && a.revision >= b.revision;
}

/** Whether two cursors are exactly equal. */
function cursorEquals(a: SearchIndexCursor, b: SearchIndexCursor): boolean {
	return a.sequence === b.sequence && a.revision === b.revision && a.updatedAt === b.updatedAt;
}

/**
 * Compute one domain's FRESHNESS from its indexed vs source cursors, fail-closed:
 *   - source unavailable ⇒ `stale` (its cached results are known-behind; never reported `fresh`).
 *   - no source cursor recorded (sequence 0, nothing observed) ⇒ `unknown` (freshness unproven).
 *   - indexed cursor dominates the source cursor ⇒ `fresh` (caught up).
 *   - indexed cursor has consumed SOME of the domain but the source is ahead ⇒ `partial` (indexing).
 *   - the source is ahead and the index has consumed nothing of the new work ⇒ `stale`.
 */
export function domainFreshnessStatus(index: SearchDomainIndex): SearchDomainFreshnessStatus {
	if (!index.available) return 'stale';
	if (index.sourceCursor.sequence === 0 && index.sourceCursor.revision === 0) {
		// Nothing has ever been observed for this domain. An empty index over an empty domain is `fresh`
		// (there is nothing to be behind); but if the indexed cursor itself is also zero we cannot prove
		// freshness against any observation, so we report `fresh` only for the genuinely-empty case.
		return cursorEquals(index.indexedCursor, EMPTY_INDEX_CURSOR) ? 'fresh' : 'unknown';
	}
	if (cursorDominates(index.indexedCursor, index.sourceCursor)) return 'fresh';
	// The source is ahead. If the index has consumed at least the prior state (its sequence > 0), indexing
	// is in progress over a known-behind tail ⇒ `partial`; otherwise it has not started ⇒ `stale`.
	return index.indexedCursor.sequence > 0 ? 'partial' : 'stale';
}

/** The PUBLISHED freshness of one domain (SRCH-009): status + both cursors + a behind-by delta. */
export interface SearchDomainFreshness {
	domain: SearchDomain;
	status: SearchDomainFreshnessStatus;
	/** The cursor the local index reflects. */
	indexedCursor: SearchIndexCursor;
	/** The cursor the source has advanced to. */
	sourceCursor: SearchIndexCursor;
	/**
	 * How many accepted mutations the index is BEHIND the source by (0 ⇒ caught up). A positive value means
	 * cached results may be missing/behind the source — the GUI surfaces this without blocking the results.
	 */
	behindBy: number;
}

/** Publish one domain's freshness record (SRCH-009). Pure. */
export function publishDomainFreshness(index: SearchDomainIndex): SearchDomainFreshness {
	const behindBy = Math.max(0, index.sourceCursor.sequence - index.indexedCursor.sequence);
	return {
		domain: index.domain,
		status: domainFreshnessStatus(index),
		indexedCursor: { ...index.indexedCursor },
		sourceCursor: { ...index.sourceCursor },
		behindBy,
	};
}

/**
 * RECORD an accepted DOMAIN MUTATION: a note/object/map artifact/session record changed and the change was
 * ACCEPTED (SRCH-001 AC3). This advances BOTH the source cursor (the domain has new work) and — because the
 * local store IS the index's source of truth for already-local content (local-first) — the indexed cursor,
 * so a purely-local accepted write keeps the domain `fresh`: the index updates INCREMENTALLY in lock-step
 * with the accepted mutation. A caller that needs to model "indexed asynchronously, behind the source" uses
 * {@link observeDomainSourceCursor} instead, which advances ONLY the source cursor (leaving the index to
 * catch up). Returns a NEW state; unknown/empty input is tolerated fail-closed. Pure.
 */
export function recordDomainMutation(
	state: SearchIndexState | undefined,
	domain: SearchDomain,
	revision: number,
	now: string,
): SearchIndexState {
	const base = ensureSearchIndex(state);
	const existing = base.domains[domain];
	const nextCursor: SearchIndexCursor = {
		sequence: existing.indexedCursor.sequence + 1,
		revision: Math.max(existing.indexedCursor.revision, revision),
		updatedAt: now,
	};
	const nextDomain: SearchDomainIndex = {
		...existing,
		indexedCursor: { ...nextCursor },
		// The source cursor advances to the same point (the accepted local write IS the new source state).
		sourceCursor: { ...nextCursor },
		available: true,
	};
	return { ...base, domains: { ...base.domains, [domain]: nextDomain } };
}

/**
 * OBSERVE that a domain's SOURCE cursor advanced (e.g. a sync source pulled remote changes) WITHOUT the
 * local index having consumed them yet — background indexing is now BEHIND. Advances only the source
 * cursor, leaving the indexed cursor where it was, so the domain becomes `stale`/`partial` until
 * {@link catchUpDomainIndex} consumes the work (SRCH-009 AC1/AC2). Pure.
 */
export function observeDomainSourceCursor(
	state: SearchIndexState | undefined,
	domain: SearchDomain,
	sourceCursor: SearchIndexCursor,
): SearchIndexState {
	const base = ensureSearchIndex(state);
	const existing = base.domains[domain];
	const nextSource: SearchIndexCursor = {
		sequence: Math.max(existing.sourceCursor.sequence, sourceCursor.sequence),
		revision: Math.max(existing.sourceCursor.revision, sourceCursor.revision),
		updatedAt: sourceCursor.updatedAt ?? existing.sourceCursor.updatedAt,
	};
	const nextDomain: SearchDomainIndex = { ...existing, sourceCursor: nextSource };
	return { ...base, domains: { ...base.domains, [domain]: nextDomain } };
}

/**
 * Background indexing COMPLETED for a domain: the local index has consumed up to the source cursor, so the
 * indexed cursor catches up and the domain returns to `fresh` (SRCH-009 AC2 — freshness reflects the new
 * cursor once indexing completes). Pure.
 */
export function catchUpDomainIndex(
	state: SearchIndexState | undefined,
	domain: SearchDomain,
): SearchIndexState {
	const base = ensureSearchIndex(state);
	const existing = base.domains[domain];
	const nextDomain: SearchDomainIndex = {
		...existing,
		indexedCursor: { ...existing.sourceCursor },
		available: true,
	};
	return { ...base, domains: { ...base.domains, [domain]: nextDomain } };
}

/**
 * Mark a domain's source AVAILABILITY. An unavailable source forces the domain `stale` (its cached results
 * are known-behind) WITHOUT failing the search — the cached results still return (SRCH-001/SRCH-003 AC2).
 * Pure.
 */
export function setDomainAvailability(
	state: SearchIndexState | undefined,
	domain: SearchDomain,
	available: boolean,
): SearchIndexState {
	const base = ensureSearchIndex(state);
	const existing = base.domains[domain];
	if (existing.available === available) return base;
	return {
		...base,
		domains: { ...base.domains, [domain]: { ...existing, available } },
	};
}

/**
 * Tolerantly hydrate a possibly-undefined/partial persisted index (the index is REBUILDABLE, so a missing
 * or older record restores to a safe baseline rather than failing). Every domain is present after hydrate;
 * a domain missing from the persisted record restores to the zero cursor; an unknown persisted domain key
 * is dropped. Cursors default to the empty cursor; availability defaults to `true`. Pure + fail-closed.
 */
export function ensureSearchIndex(state: SearchIndexState | undefined): SearchIndexState {
	const domains = {} as Record<SearchDomain, SearchDomainIndex>;
	for (const domain of SEARCH_DOMAINS) {
		const persisted = state?.domains?.[domain];
		domains[domain] = {
			domain,
			indexedCursor: normalizeCursor(persisted?.indexedCursor),
			sourceCursor: normalizeCursor(persisted?.sourceCursor),
			available: persisted?.available ?? true,
		};
	}
	return { domains, schemaVersion: SEARCH_INDEX_SCHEMA_VERSION };
}

/** Normalize a possibly-partial persisted cursor to a safe value (non-negative integers). Pure. */
function normalizeCursor(cursor: Partial<SearchIndexCursor> | undefined): SearchIndexCursor {
	if (!cursor) return { ...EMPTY_INDEX_CURSOR };
	return {
		sequence: Math.max(0, Math.trunc(cursor.sequence ?? 0)),
		revision: Math.max(0, Math.trunc(cursor.revision ?? 0)),
		updatedAt: typeof cursor.updatedAt === 'string' ? cursor.updatedAt : null,
	};
}
