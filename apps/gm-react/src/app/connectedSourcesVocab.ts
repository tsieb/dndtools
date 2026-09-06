import type { ContentItemView } from '@dndtools/core';
import type { PushPlanNote } from '../platform/fsSource';
import type { MessageKey } from '../i18n';

/**
 * The connected-sources panel's data-only helpers: the pull-collision policy table, the
 * last-synced stamp and the filename stem a pushed note is written under.
 *
 * Extracted from `ConnectedSources.tsx` unchanged so that file stays under its RC-STB-2.7 line
 * baseline while RC-UX-1.2 moves its copy into the message catalog.
 */

export const PULL_POLICIES: { value: string; label: MessageKey }[] = [
	{ value: 'skip', label: 'sources.policy.skip' },
	{ value: 'overwrite', label: 'sources.policy.overwrite' },
	{ value: 'keep-both', label: 'sources.policy.keepBoth' },
];

/** The last-synced stamp, in the reader's locale — the caller passes the i18n date formatter and
 * the word for "no sync yet", since this is a plain function outside the component. */
export function when(
	iso: string | null,
	formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
	never: string,
): string {
	if (!iso) return never;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return never;
	return formatDate(d, { month: 'short', day: 'numeric' });
}

export function slugStem(title: string, fallback: string): string {
	const stem = title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return stem === '' ? fallback : stem;
}

export function viewToPlanNote(note: ContentItemView): PushPlanNote {
	return {
		id: note.id,
		title: note.title,
		body: note.body,
		fields: note.fields,
		visibility: note.visibility,
	};
}

export function errText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
