import type { ContentItemView } from '@dndtools/core';

/**
 * Campaign's row shapes and the pure readers that pull typed values out of a role-projected
 * Vault Object's frontmatter fields.
 *
 * Extracted from `Campaign.tsx` unchanged so the screen stays under its RC-STB-2.7 line baseline
 * after RC-UX-3.1 placed the Factions visibility HelpTip; `campaignVocab.ts` holds the option tables.
 */

/** First non-heading body line, marker-stripped — the one-line summary for list cards. */
export function bodySummary(body: string, fallback: string): string {
	const line = body
		.split('\n')
		.map((l) => l.trim())
		.find((l) => l && !l.startsWith('#'));
	if (!line) return fallback;
	return line
		.replace(/^[>\-*]\s+/, '')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
		.slice(0, 180);
}

export const str = (v: unknown): string => (typeof v === 'string' ? v : '');
export const strArray = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((entry): entry is string => typeof entry === 'string') : [];

/** A quest objective as declared by the `quest` subtype schema: `{id, text, done}`, in order. */
export interface QuestObjective {
	id: string;
	text: string;
	done: boolean;
}

export const objectiveArray = (v: unknown): QuestObjective[] =>
	Array.isArray(v)
		? v.filter(
				(entry): entry is QuestObjective =>
					!!entry &&
					typeof entry === 'object' &&
					typeof (entry as QuestObjective).id === 'string' &&
					typeof (entry as QuestObjective).text === 'string' &&
					typeof (entry as QuestObjective).done === 'boolean',
			)
		: [];

/** A quest Vault Object row: the raw item view + its role-projected tracker fields. */
export interface QuestRow {
	view: ContentItemView;
	fields: Record<string, unknown>;
}

/** A faction Vault Object row: the raw item view + its role-projected dossier fields. */
export interface FactionRow {
	view: ContentItemView;
	fields: Record<string, unknown>;
}
