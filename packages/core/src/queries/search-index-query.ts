import type { PermissionState } from '../state/permission-state';
import type { VaultContentState } from '../state/content';
import type { MapState } from '../state/map-state';
import type { SessionState } from '../state/session-state';
import type { CalendarDateFormat } from '../state/calendar';
import {
	EMPTY_INDEX_CURSOR,
	SEARCH_DOMAINS,
	ensureSearchIndex,
	publishDomainFreshness,
	type SearchDomain,
	type SearchDomainFreshness,
	type SearchIndexCursor,
	type SearchIndexState,
} from '../state/search-index';
import { getContentItemsForActor } from './content-query';
import { getMapViewForActor, deliveredMapIdsForActor } from './map-query';
import { getHandoutsForActor } from './handout-query';
import { getDiceHistoryForActor } from './dice-history';

/**
 * SRCH-009 — PUBLISH index FRESHNESS, the SOURCE CURSOR, and PARTIAL-RESULT status for EACH searchable
 * DOMAIN, WITHOUT blocking the visible cached results (SRCH-001 AC3 / SRCH-009 AC1, AC2).
 *
 * This is the freshness companion to {@link import('./search-query').searchVaultForActor}: that read
 * returns the cached visible hits; THIS read tells the GUI, per domain, whether those cached results are
 * `fresh`, `partial`, `stale`, or `unknown`, the cursor the local index reflects, and the cursor the source
 * has advanced to. The two are intentionally DECOUPLED — freshness is computed alongside, never gating, the
 * cached results, so an incomplete background index never blocks search (the local-first invariant).
 *
 * The model composes the SAME actor-filtered domain reads as search, so it inherits the no-leak guarantee:
 *
 *   - The SOURCE CURSOR of a domain is derived ENTIRELY from the actor's VISIBLE artifacts in that domain
 *     (their count + max visible revision). A hidden note/handout/secret roll/dm-only POI is never counted,
 *     so the freshness CURSORS and the behind-by deltas can never reveal that hidden content exists or
 *     changed (Cross-Contract Non-Negotiable 2). The DM's cursor reflects the full set; a player's cursor
 *     reflects only their visible subset — each actor sees freshness for their OWN index slice.
 *   - The INDEXED CURSOR is what the local cache index has consumed. The shell supplies the persisted
 *     index snapshot (a rebuildable, device-local cache — Contract 2). When NONE is supplied, the local
 *     store IS the index (local-first): the indexed cursor equals the source cursor and the domain is
 *     `fresh`. When a snapshot IS supplied and it is behind, the domain is `stale`/`partial` and the
 *     affected domains are surfaced WITHOUT failing the search.
 *
 * FAIL-CLOSED: when freshness cannot be proven (no source observed, or a domain source marked unavailable),
 * the domain reports `unknown`/`stale`, never `fresh`. An unknown/unauthenticated actor receives an empty,
 * fail-closed status (every domain `unknown`, all cursors zero).
 *
 * Pure + deterministic: a function of (state, actor[, persisted index]) only. No GUI, no storage, no clock.
 */

/** The PUBLISHED search-index freshness for an actor: per-domain freshness + overall partial/stale flags. */
export interface SearchIndexStatusView {
	actorId: string;
	role: 'dm' | 'player' | 'observer';
	/** Per-domain freshness (status + indexed/source cursors + behind-by), one per searchable domain. */
	domains: SearchDomainFreshness[];
	/** True when ANY domain is `partial` or `stale` (cached results may be behind — SRCH-009 AC1). */
	anyStale: boolean;
	/** The domains whose index is NOT `fresh` (the "affected sources" the GUI surfaces). */
	staleDomains: SearchDomain[];
}

/** A fail-closed status: every domain `unknown` at the zero cursor (an unknown actor sees nothing else). */
function deniedStatus(actorId: string): SearchIndexStatusView {
	const domains: SearchDomainFreshness[] = SEARCH_DOMAINS.map((domain) => ({
		domain,
		status: 'unknown',
		indexedCursor: { ...EMPTY_INDEX_CURSOR },
		sourceCursor: { ...EMPTY_INDEX_CURSOR },
		behindBy: 0,
	}));
	return { actorId, role: 'observer', domains, anyStale: false, staleDomains: [] };
}

/**
 * Compute a domain's SOURCE cursor from the actor's VISIBLE artifacts in that domain. The `sequence` is the
 * visible artifact count (a monotonic proxy for "how much there is to index"); the `revision` is the max
 * visible entity revision (0 when the domain has no revisioned entity); `updatedAt` is the latest visible
 * update. Derived from the visible set ONLY, so no hidden artifact ever influences the cursor.
 */
function deriveDomainSourceCursor(
	domain: SearchDomain,
	content: VaultContentState,
	maps: MapState,
	permissions: PermissionState,
	session: SessionState | undefined,
	actorId: string,
	dateFormat: CalendarDateFormat,
): SearchIndexCursor {
	let sequence = 0;
	let revision = 0;
	let updatedAt: string | null = null;
	const observe = (rev: number, at: string | null): void => {
		sequence += 1;
		if (rev > revision) revision = rev;
		if (at && (updatedAt === null || at > updatedAt)) updatedAt = at;
	};

	if (domain === 'note' || domain === 'object') {
		for (const item of getContentItemsForActor(content, permissions, actorId, dateFormat)) {
			const type = item.kind === 'object' ? 'object' : 'note';
			if (type !== domain) continue;
			observe(item.revision, item.updatedAt);
		}
	} else if (domain === 'poi') {
		const deliveredMapIds = deliveredMapIdsForActor(session, actorId);
		for (const mapId of Object.keys(maps.maps)) {
			const view = getMapViewForActor(maps, permissions, actorId, mapId, { deliveredMapIds });
			if (view.kind !== 'available') continue;
			// MapPoiView carries no revision; the visible POI count is the monotonic cursor proxy.
			for (const _poi of view.pois) observe(0, null);
		}
	} else if (domain === 'handout') {
		if (session) {
			for (const handout of getHandoutsForActor(session, permissions, actorId)) {
				observe(handout.revision, handout.updatedAt);
			}
		}
	} else {
		// session-artifact (recorded rolls). The roll has no revision; the count is the cursor proxy and
		// the latest rolledAt is the timestamp.
		if (session) {
			for (const roll of getDiceHistoryForActor(session, permissions, actorId).rolls) {
				observe(0, roll.rolledAt);
			}
		}
	}

	return { sequence, revision, updatedAt };
}

/**
 * SRCH-009 — publish the SEARCH-INDEX FRESHNESS for an actor. For each domain it derives the SOURCE cursor
 * from the actor's visible artifacts and compares it to the INDEXED cursor (from the supplied persisted
 * index snapshot, else "the local store IS the index" ⇒ fresh). It returns per-domain freshness + the
 * overall stale/partial flags, never blocking the cached results. An unknown actor is denied (fail closed).
 *
 * @param persistedIndex the rebuildable local index snapshot (what indexing has consumed). When absent,
 *   the local store is treated AS the index (local-first), so every domain is `fresh` against its own
 *   visible set. When present, a domain whose indexed cursor is behind its source cursor is `stale`/`partial`.
 */
export function getSearchIndexStatus(
	content: VaultContentState,
	maps: MapState,
	permissions: PermissionState,
	session: SessionState | undefined,
	actorId: string,
	persistedIndex?: SearchIndexState,
	dateFormat: CalendarDateFormat = 'medium',
): SearchIndexStatusView {
	const actor = permissions.actors[actorId];
	if (!actor) return deniedStatus(actorId);

	const index = ensureSearchIndex(persistedIndex);
	const domains: SearchDomainFreshness[] = [];
	const staleDomains: SearchDomain[] = [];

	for (const domain of SEARCH_DOMAINS) {
		const sourceCursor = deriveDomainSourceCursor(
			domain,
			content,
			maps,
			permissions,
			session,
			actorId,
			dateFormat,
		);
		const persistedDomain = index.domains[domain];
		// With no persisted snapshot supplied, the local store IS the index: the indexed cursor equals the
		// freshly-derived source cursor, so the domain is `fresh` (local-first, offline). With a snapshot,
		// the indexed cursor is what indexing has consumed; the source cursor is the freshly-derived live one.
		const usePersisted = persistedIndex !== undefined;
		const indexedCursor: SearchIndexCursor = usePersisted
			? { ...persistedDomain.indexedCursor }
			: { ...sourceCursor };
		const domainIndex = {
			domain,
			indexedCursor,
			sourceCursor,
			available: persistedDomain.available,
		};
		const freshness = publishDomainFreshness(domainIndex);
		domains.push(freshness);
		// A domain whose cached results may be behind (background indexing incomplete) is "affected".
		if (freshness.status === 'partial' || freshness.status === 'stale') {
			staleDomains.push(domain);
		}
	}

	const anyStale = domains.some((d) => d.status === 'partial' || d.status === 'stale');
	return {
		actorId,
		role: actor.role,
		domains,
		anyStale,
		staleDomains,
	};
}
