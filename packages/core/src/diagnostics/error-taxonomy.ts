/**
 * RC-ENG-6.1 — ERROR TAXONOMY COUNTS for the in-app Diagnostics surface (Settings › About ›
 * Diagnostics). The DM-facing diagnostics view needs to answer "what kind of trouble has this
 * session hit, and how much" without ever exposing the raw error text — a caught exception's
 * `message` routinely embeds a stack frame, an absolute path, a vault note title, or a token, and
 * none of that is safe to surface in a DM/admin panel or a support bundle.
 *
 * THE MODEL. A {@link RawErrorRecord} is what the shell's error boundary / logger collects: a
 * coarse, closed-set {@link ErrorTaxonomyCategory} (never free text) plus the raw message and
 * timestamp for LOCAL use only. {@link countErrorsByCategory} produces an {@link ErrorTaxonomyCounts}
 * map — categories to counts, nothing else. This is privacy-safe BY CONSTRUCTION rather than by
 * scrubbing: a count is a number, and the category is a fixed enum the app already knows, so there
 * is no field here a redactor could ever need to touch. The raw message never crosses this function's
 * return boundary at all.
 */

/** The closed set of error categories the app recognizes. Never free text (fail-closed: an unknown
 *  origin is bucketed under `'unknown'`, never allowed to smuggle a raw string into the taxonomy). */
export type ErrorTaxonomyCategory =
	| 'network'
	| 'sync'
	| 'storage'
	| 'permission'
	| 'validation'
	| 'render'
	| 'unknown';

export const ERROR_TAXONOMY_CATEGORIES: readonly ErrorTaxonomyCategory[] = [
	'network',
	'sync',
	'storage',
	'permission',
	'validation',
	'render',
	'unknown',
];

/**
 * ONE raw error observation. `message`/`stack` are for LOCAL debugging only — they are deliberately
 * NOT part of {@link ErrorTaxonomyCounts} and must never be threaded into a support bundle or a
 * DM-facing view; only the category count is.
 */
export interface RawErrorRecord {
	readonly category: ErrorTaxonomyCategory;
	readonly occurredAt: string;
	readonly message?: string;
}

/** Category → occurrence count. Every category is present (zero-filled), so the shape is stable
 *  for a UI to render as a fixed list rather than growing/shrinking keys. */
export type ErrorTaxonomyCounts = Readonly<Record<ErrorTaxonomyCategory, number>>;

function zeroCounts(): Record<ErrorTaxonomyCategory, number> {
	const counts = {} as Record<ErrorTaxonomyCategory, number>;
	for (const category of ERROR_TAXONOMY_CATEGORIES) counts[category] = 0;
	return counts;
}

/**
 * Count errors by category. Pure and deterministic. The RETURN VALUE carries nothing but category
 * ids and integers — no message, no stack, no timestamp — so it is safe to embed directly in a
 * DM diagnostics view or a support bundle with no further redaction needed (the taxonomy is
 * privacy-safe by construction, not by scrubbing).
 */
export function countErrorsByCategory(records: readonly RawErrorRecord[]): ErrorTaxonomyCounts {
	const counts = zeroCounts();
	for (const record of records) {
		const category = ERROR_TAXONOMY_CATEGORIES.includes(record.category)
			? record.category
			: 'unknown';
		counts[category] += 1;
	}
	return counts;
}
