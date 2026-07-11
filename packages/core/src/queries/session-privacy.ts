import { hasDmAuthority } from '../state/permission-state';
import type { ActorId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';

/**
 * UX-PERM-008 — cache purge and session privacy status (DM view).
 *
 * Builds the DM-facing "Session privacy" panel model from per-departed-participant purge outcomes
 * (COLLAB-010 purge/seal on leave, COLLAB-014 cache policy). Three hard rules:
 *
 *   - DM-ONLY, DEFAULT-DENY: the resolver returns `null` for any non-DM/unknown actor, so the panel
 *     simply does not exist on a player/observer surface (PERM-014).
 *   - NO DEVICE SECRETS: the input record and the output row carry ONLY an actor id, a display
 *     name, a departure time, and a coarse outcome — no keys, paths, or device identifiers exist in
 *     the type, so the advisory copy cannot leak them (UX-PERM-008 AC1).
 *   - 24-HOUR WINDOW: a departed participant's row is shown for 24 h after departure, then
 *     archived; confirmed-purged rows auto-clear the same way (UX-PERM-008 §spec).
 */

/** A departed participant's purge outcome as acknowledged (or not) by their device. */
export type PurgeOutcome = 'purged' | 'purge-unconfirmed' | 'purge-failed';

/** Input record for one departed/removed participant. Carries NO device-level data by construction. */
export interface DepartedParticipantRecord {
	actorId: ActorId;
	/** Display name; empty/absent when the participant record was sealed (anonymized). */
	displayName?: string;
	/** ISO timestamp of the departure/removal. */
	departedAt: string;
	outcome: PurgeOutcome;
}

/** Visual tone for the status chip — paired with the text label, never color alone. */
export type PrivacyStatusTone = 'positive' | 'warning' | 'critical';

/** One rendered row of the Session privacy panel. */
export interface SessionPrivacyRow {
	actorId: ActorId;
	displayName: string;
	status: PurgeOutcome;
	statusLabel: string;
	tone: PrivacyStatusTone;
	/** Advisory copy for the unconfirmed/failed states; empty for a confirmed purge. */
	advisory: string;
	/** True when the row should offer the "Review grants" remediation link (purge failed). */
	reviewGrants: boolean;
}

/** The DM panel model: rows inside the 24 h window, plus the empty state when none remain. */
export interface SessionPrivacyView {
	rows: SessionPrivacyRow[];
	/** True when no departed participant has an outstanding (non-purged) row in the window. */
	allClear: boolean;
	/** Empty-state copy, rendered when `rows` is empty (UX-PERM-008 AC2). */
	emptyStateMessage: string;
	/** Rows older than the 24 h window (archived, not rendered). */
	archivedCount: number;
}

export const SESSION_PRIVACY_EMPTY_STATE =
	'All departed participants have been confirmed. No outstanding cache risks.';

export const PURGE_UNCONFIRMED_ADVISORY =
	'We could not confirm cache was cleared on this device. Content with session-only access may ' +
	'still be readable until the device reconnects or the TTL expires.';

export const PURGE_FAILED_ADVISORY =
	'Cache could not be cleared. Session-only content may remain readable. Consider revoking ' +
	'persistent grants if any were issued.';

const STATUS_LABELS: Record<PurgeOutcome, string> = {
	purged: 'Purged',
	'purge-unconfirmed': 'Purge unconfirmed',
	'purge-failed': 'Purge failed',
};

const STATUS_TONES: Record<PurgeOutcome, PrivacyStatusTone> = {
	purged: 'positive',
	'purge-unconfirmed': 'warning',
	'purge-failed': 'critical',
};

const STATUS_ADVISORY: Record<PurgeOutcome, string> = {
	purged: '',
	'purge-unconfirmed': PURGE_UNCONFIRMED_ADVISORY,
	'purge-failed': PURGE_FAILED_ADVISORY,
};

/** Rows are shown for 24 h after departure, then archived. */
export const SESSION_PRIVACY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Anonymized fallback for a sealed participant record. */
const SEALED_PARTICIPANT_NAME = 'Departed participant';

function withinWindow(departedAt: string, nowMs: number): boolean {
	const departedMs = Date.parse(departedAt);
	// Fail closed on an unparseable departure time: keep the row VISIBLE (a privacy risk must not
	// silently age out because of a bad clock value).
	if (!Number.isFinite(departedMs)) return true;
	return nowMs - departedMs < SESSION_PRIVACY_WINDOW_MS;
}

/**
 * Resolve the DM's Session privacy panel. Returns `null` for any non-DM actor (the panel must not
 * exist on their surface). Rows inside the 24 h window are sorted most-recent departure first;
 * older rows are archived (counted, not rendered).
 */
export function resolveSessionPrivacy(
	permissions: PermissionState,
	actorId: string,
	departures: readonly DepartedParticipantRecord[],
	now: string,
): SessionPrivacyView | null {
	if (!hasDmAuthority(permissions.actors[actorId]?.role)) return null;
	const nowMs = Date.parse(now);
	const effectiveNowMs = Number.isFinite(nowMs) ? nowMs : Number.NEGATIVE_INFINITY;
	const current = departures.filter((record) => withinWindow(record.departedAt, effectiveNowMs));
	const archivedCount = departures.length - current.length;
	const rows = [...current]
		.sort((a, b) => b.departedAt.localeCompare(a.departedAt))
		.map((record): SessionPrivacyRow => {
			const displayName = record.displayName?.trim() || SEALED_PARTICIPANT_NAME;
			return {
				actorId: record.actorId,
				displayName,
				status: record.outcome,
				statusLabel: STATUS_LABELS[record.outcome],
				tone: STATUS_TONES[record.outcome],
				advisory: STATUS_ADVISORY[record.outcome],
				reviewGrants: record.outcome === 'purge-failed',
			};
		});
	return {
		rows,
		allClear: rows.every((row) => row.status === 'purged'),
		emptyStateMessage: SESSION_PRIVACY_EMPTY_STATE,
		archivedCount,
	};
}
