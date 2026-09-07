import type { SessionRecapEntityRef } from './session-state';

/**
 * RC-SES-4.1 — the SESSION LOG: the note the end-of-session capture writes.
 *
 * The capture produces ONE structured record that is stored in two places on purpose: on the session
 * archive (as the recap's structured fields, so the prep/recap digest can read it) and as a durable
 * `session-log` note in the vault (so it is searchable in Knowledge and dated on the campaign
 * timeline). Both are written by EXISTING commands (`session.author-recap`, `content.create-item`);
 * this module owns only the PURE composition of the prose body they share, so the archive and the note
 * can never tell two different stories.
 *
 * Framework-free and language-free: the section headings are supplied by the caller (the GUI passes
 * its translated copy), so the core never hard-codes English into a DM's note.
 */

/** The Vault Object subtype a session-log note carries (`state/vault-object-schema.ts`). */
export const SESSION_LOG_SUBTYPE = 'session-log' as const;

/** The structured end-of-session capture, before it becomes prose. */
export interface SessionLogCapture {
	/** What happened, in the DM's own words (may be empty — the note is still worth having). */
	happened: string;
	/** What changed, as entity references (never entity copies). */
	changes: SessionRecapEntityRef[];
	/** The follow-ups to carry into the next session. */
	followUps: string[];
}

/** The section headings the composed markdown uses, supplied by the caller in its own language. */
export interface SessionLogLabels {
	happened: string;
	changes: string;
	followUps: string;
}

/** Drop blank entries and trim — the same normalization the note and the recap both store. */
function cleanLines(lines: readonly string[]): string[] {
	return lines.map((line) => line.trim()).filter((line) => line.length > 0);
}

/**
 * Normalize a raw capture: trim the prose, drop blank follow-ups, drop chips with no label. Pure, and
 * idempotent — normalizing an already-normalized capture returns the same value.
 */
export function normalizeSessionLogCapture(capture: SessionLogCapture): SessionLogCapture {
	return {
		happened: capture.happened.trim(),
		changes: capture.changes
			.filter((ref) => ref.label.trim().length > 0 && ref.entityId.length > 0)
			.map((ref) => ({ ...ref, label: ref.label.trim() })),
		followUps: cleanLines(capture.followUps),
	};
}

/** Whether a capture holds anything worth storing (an all-empty capture is not a session log). */
export function isEmptySessionLogCapture(capture: SessionLogCapture): boolean {
	const clean = normalizeSessionLogCapture(capture);
	return clean.happened === '' && clean.changes.length === 0 && clean.followUps.length === 0;
}

/**
 * Compose the capture into the markdown body shared by the session-log note and the archive recap.
 * A section whose content is empty is OMITTED entirely rather than rendered as an empty heading.
 * Pure and deterministic: the same capture + labels always produce the same markdown.
 */
export function composeSessionLogMarkdown(
	capture: SessionLogCapture,
	labels: SessionLogLabels,
): string {
	const clean = normalizeSessionLogCapture(capture);
	const sections: string[] = [];
	if (clean.happened !== '') sections.push(`## ${labels.happened}\n\n${clean.happened}`);
	if (clean.changes.length > 0) {
		sections.push(
			`## ${labels.changes}\n\n${clean.changes.map((ref) => `- ${ref.label}`).join('\n')}`,
		);
	}
	if (clean.followUps.length > 0) {
		sections.push(
			`## ${labels.followUps}\n\n${clean.followUps.map((line) => `- ${line}`).join('\n')}`,
		);
	}
	return sections.join('\n\n');
}
