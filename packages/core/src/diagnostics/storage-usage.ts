/**
 * RC-ENG-6.1 — STORAGE USAGE summary for the in-app Diagnostics surface (Settings › About ›
 * Diagnostics). The DM/admin panel needs "how much space is the vault/cache/sync queue using" as a
 * byte count per category — never a path, never a filename. Byte counts are safe to surface and
 * export unconditionally: there is no content in a number.
 */

/** The closed set of storage categories the app recognizes. An unknown source is bucketed under
 *  `'other'` (fail-closed: never lets a caller-supplied label ride along as free text). */
export type StorageCategory = 'vault' | 'cache' | 'assets' | 'sync-queue' | 'other';

export const STORAGE_CATEGORIES: readonly StorageCategory[] = [
	'vault',
	'cache',
	'assets',
	'sync-queue',
	'other',
];

/** ONE raw storage measurement: a category and its size in bytes. No path, no filename — the
 *  measurement is a location-free byte count by design. */
export interface RawStorageUsageEntry {
	readonly category: StorageCategory;
	readonly bytes: number;
}

export interface StorageUsageView {
	readonly totalBytes: number;
	readonly byCategory: Readonly<Record<StorageCategory, number>>;
}

function zeroByCategory(): Record<StorageCategory, number> {
	const out = {} as Record<StorageCategory, number>;
	for (const category of STORAGE_CATEGORIES) out[category] = 0;
	return out;
}

/**
 * Summarize raw storage measurements into a totals-by-category view. Pure and deterministic.
 * Negative or non-finite byte counts are clamped to 0 (fail-closed against a misbehaving probe
 * inflating or corrupting the DM-facing total).
 */
export function summarizeStorageUsage(entries: readonly RawStorageUsageEntry[]): StorageUsageView {
	const byCategory = zeroByCategory();
	let totalBytes = 0;
	for (const entry of entries) {
		const bytes = Number.isFinite(entry.bytes) && entry.bytes > 0 ? entry.bytes : 0;
		const category = STORAGE_CATEGORIES.includes(entry.category) ? entry.category : 'other';
		byCategory[category] += bytes;
		totalBytes += bytes;
	}
	return { totalBytes, byCategory };
}
