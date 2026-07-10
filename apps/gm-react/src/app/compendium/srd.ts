/**
 * Bundled SRD dataset — the OFFLINE source for the Compendium tab (and the fallback the live
 * Open5e client drops to on any network failure).
 *
 * The JSON payloads (`src/assets/srd/monsters.json` / `spells.json`, ~325 + ~319 entries,
 * CC-BY-4.0) are loaded through DYNAMIC `import()` so each stays a separate lazy chunk: nothing
 * here lands in the boot bundle until the Compendium actually needs it. The loaders memoize the
 * module promise, so the chunk is fetched at most once per session.
 *
 * Filtering is pure and mirrors the live client's query semantics (case-insensitive name
 * substring, exact CR / spell level), so the UI gets the SAME `CompendiumResult` shape from
 * either source.
 */

import type {
	CompendiumMonster,
	CompendiumQuery,
	CompendiumResult,
	CompendiumSpell,
} from './types';

/** The envelope shape both bundled JSON files ship in (attribution is a legal requirement). */
export interface SrdEnvelope<T> {
	source: string;
	document: string;
	license: string;
	attribution: string;
	kind: string;
	count: number;
	entries: T[];
}

/** Default page size when a query gives no explicit limit (matches the live client). */
export const DEFAULT_PAGE_LIMIT = 40;

let monstersPromise: Promise<SrdEnvelope<CompendiumMonster>> | null = null;
let spellsPromise: Promise<SrdEnvelope<CompendiumSpell>> | null = null;

/** Lazy-load the bundled monster envelope (a separate chunk; memoized). */
export function loadBundledMonsters(): Promise<SrdEnvelope<CompendiumMonster>> {
	monstersPromise ??= import('../../assets/srd/monsters.json').then(
		(mod) => mod.default as unknown as SrdEnvelope<CompendiumMonster>,
	);
	return monstersPromise;
}

/** Lazy-load the bundled spell envelope (a separate chunk; memoized). */
export function loadBundledSpells(): Promise<SrdEnvelope<CompendiumSpell>> {
	spellsPromise ??= import('../../assets/srd/spells.json').then(
		(mod) => mod.default as unknown as SrdEnvelope<CompendiumSpell>,
	);
	return spellsPromise;
}

/** Pure monster filter: case-insensitive name substring + exact CR. */
export function filterMonsters(
	entries: readonly CompendiumMonster[],
	query: CompendiumQuery,
): CompendiumMonster[] {
	const needle = query.search?.trim().toLowerCase() ?? '';
	return entries.filter(
		(entry) =>
			(needle === '' || entry.name.toLowerCase().includes(needle)) &&
			(query.cr === undefined || entry.cr === query.cr),
	);
}

/** Pure spell filter: case-insensitive name substring + exact level (0 = cantrip). */
export function filterSpells(
	entries: readonly CompendiumSpell[],
	query: CompendiumQuery,
): CompendiumSpell[] {
	const needle = query.search?.trim().toLowerCase() ?? '';
	return entries.filter(
		(entry) =>
			(needle === '' || entry.name.toLowerCase().includes(needle)) &&
			(query.level === undefined || entry.level === query.level),
	);
}

function toResult<T>(
	envelope: SrdEnvelope<T>,
	filtered: T[],
	limit: number | undefined,
): CompendiumResult<T> {
	return {
		source: 'bundled',
		document: envelope.document,
		license: envelope.license,
		attribution: envelope.attribution,
		total: filtered.length,
		entries: filtered.slice(0, limit ?? DEFAULT_PAGE_LIMIT),
	};
}

/** Search the bundled monsters — same result shape as the live client. */
export async function searchBundledMonsters(
	query: CompendiumQuery = {},
): Promise<CompendiumResult<CompendiumMonster>> {
	const envelope = await loadBundledMonsters();
	return toResult(envelope, filterMonsters(envelope.entries, query), query.limit);
}

/** Search the bundled spells — same result shape as the live client. */
export async function searchBundledSpells(
	query: CompendiumQuery = {},
): Promise<CompendiumResult<CompendiumSpell>> {
	const envelope = await loadBundledSpells();
	return toResult(envelope, filterSpells(envelope.entries, query), query.limit);
}
