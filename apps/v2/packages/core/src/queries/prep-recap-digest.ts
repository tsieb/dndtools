import type { PermissionState } from '../state/permission-state';
import type { SessionArchiveSnapshot, SessionState } from '../state/session-state';
import type { VaultContentState } from '../state/content';
import type { MapState } from '../state/map-state';
import type { CharacterState } from '../state/character-state';
import type { OperationLog } from '../sync/operation-log';
import type { CalendarDateFormat } from '../state/calendar';
import { getQuickReferencePanelsForActor } from './quick-reference-query';
import { getHandoutDeliveryHistory } from './handout-query';
import { getCombatTrackerForActor } from './combat-tracker-view';
import { getCalendarContextForActor, type CalendarContextView } from './calendar-continuity-query';

/**
 * SES-009 — THE pre-session PREP and post-session RECAP digest, as a PURE DERIVATION over the existing
 * durable sources. NOTHING here is a separate copied dataset: the digest is COMPUTED on demand from
 *
 *   - UNRESOLVED THREADS   ← the SES-007 quick-reference `open-thread` panels (resolved live, actor-filtered),
 *   - RECENT CHANGES       ← the op-log / content change events (the sync operation log),
 *   - HANDOUT OUTCOMES     ← the SES-004 durable delivery history (who received what, when),
 *   - COMBAT SUMMARIES     ← the SES-002 encounter/combat log (the actor-filtered tracker view),
 *   - CALENDAR CONTEXT     ← the SES-012 campaign date + linked past/upcoming events (CONTENT-011 formatting),
 *   - CONTINUITY PROMPTS   ← deterministically SYNTHESIZED from the above (no AI; SES-009 AC2 / SES-012 AC2).
 *
 * This is a DM-FACING surface (SES-009 is dm-only): a non-DM receives an EMPTY digest with no items —
 * never the DM prep/recap content or any hidden source content (fail closed; hard no-leak). Because every
 * source read is itself actor-filtered, the digest can never surface content the actor may not see; the
 * DM-only gate is an additional outer fail-closed guard so a player never even learns the digest exists.
 *
 * Pure + deterministic: a function of (session, content, maps, characters, permissions, sync, actor) only.
 * No GUI, no storage, no AI. A recap can OPTIONALLY persist a summary artifact (a durable note via the
 * existing content write path) whose CONTENT is derived from this digest — the digest itself is computed.
 *
 * Source selection for the live-vs-archived combat/handout fields: when the session is in `recap` (the
 * live combat/dice/handout fields were reset and snapshotted into the recap archive on entry — see
 * `commands/session-control.ts`), the COMBAT SUMMARY + HANDOUT OUTCOMES are derived from the archive
 * snapshot so the recap reflects the session that just ended. Otherwise they derive from the live session.
 * The calendar context + open threads are CAMPAIGN-level / DM authoring state and always read live.
 */

/** Which workflow the digest was computed for. `prep` looks forward; `recap` looks back at what happened. */
export type DigestMode = 'prep' | 'recap';

/** One unresolved open thread, derived from a SES-007 `open-thread` quick-reference panel. */
export interface DigestThread {
	panelId: string;
	label: string;
	/** The thread's resolved title, when its referenced target is visible; else null (degraded). */
	title: string | null;
	/** The thread's resolved snippet, when visible; else null. */
	snippet: string | null;
	/** Whether the referenced target resolved (false ⇒ the target is hidden/deleted — shown as a stale thread). */
	available: boolean;
}

/** One recent change, derived from the op-log (a durable accepted mutation). */
export interface DigestRecentChange {
	operationId: string;
	entityType: string;
	entityId: string;
	opType: string;
	actorId: string;
	at: string;
}

/** One handout outcome, derived from the SES-004 delivery history. */
export interface DigestHandoutOutcome {
	handoutId: string;
	handoutTitle: string;
	recipientActorId: string;
	deliveredAt: string;
	deliveryStatus: 'delivered' | 'queued';
}

/** A combat summary, derived from the SES-002 encounter/combat log. */
export interface DigestCombatSummary {
	encounterId: string | null;
	status: string;
	round: number;
	logEntryCount: number;
	/** The most recent visible log entry labels (oldest→newest of the tail), for a quick recap line. */
	recentLog: string[];
}

/**
 * A continuity prompt: a deterministically synthesized reminder line + the source it was derived from.
 * Prompts carry NO hidden content — each is built from already-actor-filtered digest items.
 */
export interface DigestContinuityPrompt {
	id: string;
	source: 'thread' | 'handout' | 'combat' | 'calendar' | 'recent-change';
	text: string;
}

/** The computed prep/recap digest (DM-facing; empty for a non-DM). */
export interface PrepRecapDigest {
	mode: DigestMode;
	/** True only for the DM. A non-DM gets `false` and every list below is empty (fail closed). */
	dmOnly: boolean;
	unresolvedThreads: DigestThread[];
	recentChanges: DigestRecentChange[];
	handoutOutcomes: DigestHandoutOutcome[];
	combatSummary: DigestCombatSummary | null;
	calendarContext: CalendarContextView;
	continuityPrompts: DigestContinuityPrompt[];
}

/** How many recent changes / log-tail lines the digest surfaces by default (deterministic, bounded). */
export const DEFAULT_RECENT_CHANGE_LIMIT = 10 as const;
const COMBAT_LOG_TAIL = 5;

const EMPTY_CALENDAR_CONTEXT: CalendarContextView = Object.freeze({
	currentDate: null,
	past: [],
	upcoming: [],
});

function emptyDigest(mode: DigestMode): PrepRecapDigest {
	return {
		mode,
		dmOnly: false,
		unresolvedThreads: [],
		recentChanges: [],
		handoutOutcomes: [],
		combatSummary: null,
		calendarContext: EMPTY_CALENDAR_CONTEXT,
		continuityPrompts: [],
	};
}

/**
 * The session view the COMBAT + HANDOUT sources derive from. In `recap`, the live fields were archived on
 * workflow entry, so the recap reflects the just-ended session via the snapshot. The returned object is a
 * SHAPE compatible with the SES-002/SES-004 reads (it carries the combat + handouts to summarize).
 */
function sourceSessionFor(
	session: SessionState,
	mode: DigestMode,
): { combat: SessionState['combat']; handouts: SessionState['handouts'] } {
	if (mode === 'recap' && session.recapArchiveId) {
		const archive: SessionArchiveSnapshot | undefined = session.archives[session.recapArchiveId];
		if (archive) return { combat: archive.combat, handouts: archive.handouts };
	}
	return { combat: session.combat, handouts: session.handouts };
}

/**
 * SES-009 — compute the prep/recap digest. DM-FACING: a non-DM receives an EMPTY digest (fail closed, hard
 * no-leak). Every populated source read is itself actor-filtered. Pure + deterministic.
 */
export function getPrepRecapDigest(
	session: SessionState,
	content: VaultContentState,
	maps: MapState,
	characters: CharacterState,
	permissions: PermissionState,
	sync: OperationLog,
	actorId: string,
	mode: DigestMode,
	options?: { recentChangeLimit?: number; format?: CalendarDateFormat },
): PrepRecapDigest {
	const actor = permissions.actors[actorId];
	// Hard DM-only gate: a non-DM (or unknown actor) never receives ANY digest content (fail closed).
	if (!actor || actor.role !== 'dm') return emptyDigest(mode);

	const format = options?.format ?? 'medium';
	const recentLimit = options?.recentChangeLimit ?? DEFAULT_RECENT_CHANGE_LIMIT;

	// UNRESOLVED THREADS ← SES-007 open-thread panels (resolved live + actor-filtered).
	const panels = getQuickReferencePanelsForActor(
		session,
		content,
		characters,
		permissions,
		actorId,
	);
	const unresolvedThreads: DigestThread[] = panels
		.filter((panel) => panel.kind === 'open-thread')
		.map((panel) => ({
			panelId: panel.id,
			label: panel.label,
			title: panel.status === 'available' ? (panel.content?.title ?? null) : null,
			snippet: panel.status === 'available' ? (panel.content?.snippet ?? null) : null,
			available: panel.status === 'available',
		}));

	// RECENT CHANGES ← the op-log (durable accepted mutations). Most-recent first, bounded.
	const recentChanges: DigestRecentChange[] = [...sync.operations]
		.reverse()
		.slice(0, Math.max(0, recentLimit))
		.map((op) => ({
			operationId: op.id,
			entityType: op.entityType,
			entityId: op.entityId,
			opType: op.opType,
			actorId: op.actorId,
			at: op.issuedAt,
		}));

	const source = sourceSessionFor(session, mode);

	// HANDOUT OUTCOMES ← SES-004 delivery history (DM-only at its own read). Derived from the source
	// session (the archive in recap). We read the history off a session-shaped projection of the source.
	const handoutOutcomes: DigestHandoutOutcome[] = getHandoutDeliveryHistory(
		{ ...session, handouts: source.handouts },
		permissions,
		actorId,
	).map((row) => ({
		handoutId: row.handoutId,
		handoutTitle: row.handoutTitle,
		recipientActorId: row.delivery.recipientActorId,
		deliveredAt: row.delivery.deliveredAt,
		deliveryStatus: row.delivery.deliveryStatus,
	}));

	// COMBAT SUMMARY ← SES-002 actor-filtered tracker view (the encounter log).
	const tracker = getCombatTrackerForActor(source.combat, permissions, actorId);
	const combatSummary: DigestCombatSummary | null =
		tracker.combatants.length > 0 || tracker.log.length > 0 || tracker.encounterId !== null
			? {
					encounterId: tracker.encounterId,
					status: tracker.status,
					round: tracker.round,
					logEntryCount: tracker.log.length,
					recentLog: tracker.log.slice(-COMBAT_LOG_TAIL).map((entry) => entry.label),
				}
			: null;

	// CALENDAR CONTEXT ← SES-012 campaign date + linked past/upcoming events (CONTENT-011 formatting).
	const calendarContext = getCalendarContextForActor(
		session,
		content,
		maps,
		permissions,
		actorId,
		format,
	);

	// CONTINUITY PROMPTS ← deterministically SYNTHESIZED from the above (no AI). Prep looks forward
	// (upcoming dated events + stale/dangling threads to re-anchor); recap looks back (what was delivered,
	// what combat occurred, what changed). Each prompt is built from already-actor-filtered items.
	const continuityPrompts = buildContinuityPrompts(
		mode,
		unresolvedThreads,
		handoutOutcomes,
		combatSummary,
		calendarContext,
		recentChanges,
	);

	return {
		mode,
		dmOnly: true,
		unresolvedThreads,
		recentChanges,
		handoutOutcomes,
		combatSummary,
		calendarContext,
		continuityPrompts,
	};
}

/** Deterministically synthesize continuity prompts from the actor-filtered digest items. No AI. */
function buildContinuityPrompts(
	mode: DigestMode,
	threads: DigestThread[],
	handouts: DigestHandoutOutcome[],
	combat: DigestCombatSummary | null,
	calendar: CalendarContextView,
	recentChanges: DigestRecentChange[],
): DigestContinuityPrompt[] {
	const prompts: DigestContinuityPrompt[] = [];

	// Open threads: a prompt to resolve each thread. A dangling thread (target hidden/deleted) gets a
	// distinct re-anchor prompt (no target content leaked — only the DM-authored label).
	for (const thread of threads) {
		prompts.push({
			id: `thread:${thread.panelId}`,
			source: 'thread',
			text: thread.available
				? `Unresolved thread: ${thread.title ?? thread.label}`
				: `Re-anchor the dangling thread "${thread.label}" (its reference is no longer available).`,
		});
	}

	// Calendar: prep highlights the next upcoming linked events; recap highlights the most recent past ones.
	if (mode === 'prep') {
		for (const link of calendar.upcoming.slice(0, COMBAT_LOG_TAIL)) {
			prompts.push({
				id: `calendar:${link.id}`,
				source: 'calendar',
				text: `Upcoming on ${link.date.display}: ${link.targetTitle ?? link.label}`,
			});
		}
	} else {
		for (const link of calendar.past.slice(-COMBAT_LOG_TAIL).reverse()) {
			prompts.push({
				id: `calendar:${link.id}`,
				source: 'calendar',
				text: `Recently on ${link.date.display}: ${link.targetTitle ?? link.label}`,
			});
		}
	}

	// Combat: a recap-focused prompt summarizing the encounter that occurred.
	if (combat && (combat.logEntryCount > 0 || combat.encounterId !== null)) {
		prompts.push({
			id: `combat:${combat.encounterId ?? 'encounter'}`,
			source: 'combat',
			text:
				mode === 'recap'
					? `Recap combat: ${combat.logEntryCount} log entr${combat.logEntryCount === 1 ? 'y' : 'ies'} over round ${combat.round}.`
					: `Combat is ${combat.status} (round ${combat.round}); review before resuming.`,
		});
	}

	// Handouts: a recap-focused prompt for each handout that was delivered (deduped by handout).
	const seenHandouts = new Set<string>();
	for (const outcome of handouts) {
		if (seenHandouts.has(outcome.handoutId)) continue;
		seenHandouts.add(outcome.handoutId);
		prompts.push({
			id: `handout:${outcome.handoutId}`,
			source: 'handout',
			text: `Handout delivered: ${outcome.handoutTitle}`,
		});
	}

	// Recent changes: a single prompt noting how much changed since last time (prep-forward framing).
	if (recentChanges.length > 0) {
		prompts.push({
			id: 'recent-changes',
			source: 'recent-change',
			text: `${recentChanges.length} recent change${recentChanges.length === 1 ? '' : 's'} to review.`,
		});
	}

	return prompts;
}
