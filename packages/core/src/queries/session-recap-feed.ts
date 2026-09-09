import { decideCharacterDataRead } from '../permissions/consistency';
import type { PermissionState } from '../state/permission-state';
import type { SessionState } from '../state/session-state';

/**
 * RC-CLD-3.3 — THE single actor-filtered SESSION-RECAP-FEED read model: the "between-session inbox" a
 * player companion reads to catch up async, without the DM-only prep/recap digest (SES-009) or any of
 * its unresolved-thread / recent-change / combat-log detail. Every archive the DM has AUTHORED a recap
 * onto (`session.author-recap`) is a chronicle entry the whole table already lived through together —
 * there is no separate publish step, so an authored recap is player-visible the moment it exists.
 *
 * PERM-011 observer ceiling: an observer (or an unknown/unauthenticated actor) receives an EMPTY feed,
 * matching the ceiling {@link getCharacterJournalForActor} and {@link getPrepRecapDigest} already apply
 * to every other actor-scoped read (fail closed, no exception for "it's just a recap").
 */

/** One session's recap, projected for the between-session inbox feed. Newest session first. */
export interface SessionRecapFeedEntry {
	archiveId: string;
	/** The session's name at archive time, or null when the session was never named. */
	title: string | null;
	archivedAt: string;
	markdown: string;
	authoredBy: string;
	authoredAt: string;
	revision: number;
}

/**
 * RC-CLD-3.3 — the actor-filtered recap feed: every archived session that carries a DM-authored recap,
 * newest archive first. Pure function of (session, permissions, actor) only.
 */
export function getSessionRecapFeedForActor(
	session: SessionState,
	permissions: PermissionState,
	actorId: string,
): SessionRecapFeedEntry[] {
	if (decideCharacterDataRead(permissions, actorId).kind !== 'granted') return [];

	const entries: SessionRecapFeedEntry[] = [];
	for (const archive of Object.values(session.archives)) {
		if (!archive.recap) continue;
		entries.push({
			archiveId: archive.id,
			title: archive.title ?? null,
			archivedAt: archive.archivedAt,
			markdown: archive.recap.markdown,
			authoredBy: archive.recap.authoredBy,
			authoredAt: archive.recap.authoredAt,
			revision: archive.recap.revision,
		});
	}
	entries.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
	return entries;
}
