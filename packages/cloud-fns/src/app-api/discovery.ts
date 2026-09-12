// RC-CLD-4.5 — marketplace DISCOVERY, the pure half: how a search query is read, how a listing is
// matched and faceted, and how ratings are summarised. No I/O here. The handler owns every read and
// write; these rules are plain functions over rows so every route applies the same ones.
import { MODULE_KINDS, type ModuleKind } from '@dndtools/core';

/** A row as DynamoDB hands it back through `fromItem` (every attribute a string). */
export type Row = Record<string, string>;

export const MAX_QUERY_CHARS = 100;
export const MAX_QUERY_TERMS = 8;
export const MAX_FACET_CHARS = 80;
export const MAX_LISTING_SYSTEMS = 16;
export const MAX_REVIEW_NOTE_CHARS = 280;
export const MIN_STARS = 1;
export const MAX_STARS = 5;

export interface ListingQuery {
	/** Case-folded words. A listing matches when its name or summary contains every one. */
	terms: string[];
	kind: ModuleKind | null;
	system: string | null;
	license: string | null;
}

export type ParsedQuery = { ok: true; query: ListingQuery } | { ok: false; error: string };

/**
 * A game system as discovery compares it: case-folded, without the `builtin:`/`custom:` namespace a
 * system package's id carries, so a re-homed `custom:dnd5e` is found under `dnd5e` too.
 */
export function normalizeSystem(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/^(?:builtin|custom):/, '')
		.slice(0, MAX_FACET_CHARS);
}

/** Licences are free text (`CC-BY-4.0`, `cc-by-4.0`), so a filter compares them case-folded. */
export function normalizeLicense(value: string): string {
	return value.trim().toLowerCase().slice(0, MAX_FACET_CHARS);
}

/** Read `?q&kind&system&license`. API Gateway has already URL-decoded the values. */
export function parseListingQuery(
	params: Readonly<Record<string, string | undefined>> | null | undefined,
): ParsedQuery {
	const q = (params?.q ?? '').trim();
	if (q.length > MAX_QUERY_CHARS)
		return { ok: false, error: `q must be at most ${MAX_QUERY_CHARS} characters` };
	const terms = [...new Set(q.toLowerCase().split(/\s+/).filter(Boolean))];
	if (terms.length > MAX_QUERY_TERMS)
		return { ok: false, error: `q can hold at most ${MAX_QUERY_TERMS} words` };
	const kind = (params?.kind ?? '').trim();
	if (kind && !(MODULE_KINDS as readonly string[]).includes(kind))
		return { ok: false, error: `kind must be one of: ${MODULE_KINDS.join(', ')}` };
	const system = (params?.system ?? '').trim();
	const license = (params?.license ?? '').trim();
	for (const [name, value] of [
		['system', system],
		['license', license],
	] as const) {
		if (value.length > MAX_FACET_CHARS)
			return { ok: false, error: `${name} must be at most ${MAX_FACET_CHARS} characters` };
	}
	return {
		ok: true,
		query: {
			terms,
			kind: kind ? (kind as ModuleKind) : null,
			system: system ? normalizeSystem(system) : null,
			license: license ? normalizeLicense(license) : null,
		},
	};
}

/** The systems a listing row targets. Stored as a JSON array; anything unreadable is none. */
export function listingSystems(row: Row): string[] {
	if (!row.systems) return [];
	try {
		const parsed: unknown = JSON.parse(row.systems);
		return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
	} catch {
		return [];
	}
}

/**
 * The facets a publish records on its listing, read from the bundle the server just validated
 * (never from a client claim). A system package that names no systems is found under its own id.
 * A bare legacy widget package has no manifest, so it carries neither facet.
 */
export function bundleFacets(
	bundle: {
		manifest: { kind: ModuleKind; license?: string; systems?: string[] };
		payload: unknown;
	} | null,
): { systems: string[]; license: string } {
	if (!bundle) return { systems: [], license: '' };
	const declared = bundle.manifest.systems ?? [];
	const ownId = (bundle.payload as { id?: unknown } | null)?.id;
	const fallback =
		bundle.manifest.kind === 'system-package' && typeof ownId === 'string' ? [ownId] : [];
	const systems = [
		...new Set((declared.length > 0 ? declared : fallback).map(normalizeSystem).filter(Boolean)),
	].slice(0, MAX_LISTING_SYSTEMS);
	return { systems, license: bundle.manifest.license?.trim() ?? '' };
}

/** Whether one listing (whose kind the caller has already resolved) satisfies a query. */
export function matchesQuery(row: Row, kind: ModuleKind, query: ListingQuery): boolean {
	if (query.kind && kind !== query.kind) return false;
	if (query.system && !listingSystems(row).includes(query.system)) return false;
	if (query.license && normalizeLicense(row.license ?? '') !== query.license) return false;
	if (query.terms.length === 0) return true;
	const haystack = `${row.name ?? ''} ${row.summary ?? ''}`.toLowerCase();
	return query.terms.every((term) => haystack.includes(term));
}

/**
 * The filter options, computed over the WHOLE shelf rather than the filtered result, so choosing
 * one system never makes the other systems disappear from the menu.
 */
export function listingFacets(rows: readonly Row[]): { systems: string[]; licenses: string[] } {
	const systems = new Set<string>();
	const licenses = new Map<string, string>(); // case-folded → a stable spelling independent of query order
	for (const row of rows) {
		for (const system of listingSystems(row)) systems.add(system);
		const license = (row.license ?? '').trim();
		const previous = licenses.get(license.toLowerCase());
		if (license && (previous === undefined || license < previous))
			licenses.set(license.toLowerCase(), license);
	}
	const byText = (a: string, b: string) => a.localeCompare(b);
	return { systems: [...systems].sort(byText), licenses: [...licenses.values()].sort(byText) };
}

/** Newest publish first — the one ordering that needs no ranking model to be honest. */
export const newestFirst = (a: Row, b: Row) =>
	(b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');

export interface RatingSummary {
	/** Mean stars to one decimal, or null when nobody has rated the listing yet. */
	average: number | null;
	count: number;
}

/** Summarise a `listing-ratings` aggregate row (absent → unrated). */
export function ratingSummary(row: Row | undefined): RatingSummary {
	const count = Math.max(0, Math.trunc(Number(row?.ratingCount ?? 0)) || 0);
	if (count === 0) return { average: null, count: 0 };
	const sum = Number(row?.ratingSum ?? 0) || 0;
	// Aggregates only ever move by whole-star deltas, but the clamp keeps a damaged row from ever
	// reading as "7.3 stars".
	const average = Math.min(MAX_STARS, Math.max(MIN_STARS, Math.round((sum / count) * 10) / 10));
	return { average, count };
}

/** A rating is a whole number of stars from 1 to 5, and nothing else. */
export function parseStars(value: unknown): number | null {
	return typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= MIN_STARS &&
		value <= MAX_STARS
		? value
		: null;
}

/** The maintainer allowlist (Cognito subs, comma-separated). Empty, the default, means nobody. */
export function maintainerSubs(raw: string | undefined): Set<string> {
	return new Set(
		(raw ?? '')
			.split(',')
			.map((sub) => sub.trim())
			.filter(Boolean),
	);
}
