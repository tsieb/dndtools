/**
 * Open5e v2 API client — the LIVE source for the Compendium tab.
 *
 * Talks to `https://api.open5e.com/v2/` (`/v2/creatures/`, `/v2/spells/`, `/v2/documents/`).
 * The v1 API is dead (it returns an HTML shell), so everything here is v2-only. Confirmed live
 * query params: `document__key` (source filter — defaults to the SRD, `srd-2014`),
 * `name__icontains` (search; the DRF `search` param is NOT honored on creatures),
 * `challenge_rating` (exact CR, fractional values like 0.25 work), `level` (exact spell level),
 * and `limit` (page size; responses paginate via `next`).
 *
 * Every response row is PROJECTED into the bundled-SRD entry shape (`types.ts`), so the UI is
 * source-agnostic. On any network failure (offline, non-2xx, malformed body) the search helpers
 * fall back to the bundled SRD dataset and mark the result `source: 'bundled'` — the UI shows an
 * honest "offline — bundled SRD" indicator. An intentional abort (`AbortController` on re-search)
 * is RE-THROWN, never swallowed into a fallback, so a stale query can't clobber a fresh one.
 *
 * LICENSING: non-SRD documents are only ever queried when the UI passes an explicit
 * `document` (the user opted in after seeing that source's own license, listed by
 * `listDocuments`). The default is always the CC-BY-4.0 SRD.
 */

import type {
	CompendiumMonster,
	CompendiumQuery,
	CompendiumResult,
	CompendiumSpell,
	MonsterAction,
	MonsterTrait,
} from './types';
import { searchBundledMonsters, searchBundledSpells, DEFAULT_PAGE_LIMIT } from './srd';

export const OPEN5E_API_BASE = 'https://api.open5e.com/v2';

/** The default (and only un-opted-in) source: the 5.1 SRD. */
export const SRD_DOCUMENT_KEY = 'srd-2014';
export const SRD_DOCUMENT_NAME = 'System Reference Document 5.1';
export const SRD_LICENSE = 'CC-BY-4.0';
/** The canonical SRD 5.1 CC-BY-4.0 attribution (identical to the bundled envelopes'). */
export const SRD_ATTRIBUTION =
	'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/legalcode).';

/** One publishable source from `/v2/documents/` — shown (with its licenses) before any opt-in. */
export interface Open5eDocument {
	key: string;
	name: string;
	displayName: string;
	publisher: string;
	licenses: Array<{ name: string; key: string }>;
	permalink: string;
}

/** Injectable fetch + abort signal (tests pass `fetchFn`; the UI passes `signal`). */
export interface Open5eRequestOptions {
	signal?: AbortSignal;
	fetchFn?: typeof fetch;
	/** Metadata for a non-SRD document the user opted into (drives license/attribution display). */
	document?: Open5eDocument;
}

/** Whether an error is an intentional `AbortController` abort (re-thrown, never a fallback). */
export function isAbortError(error: unknown): boolean {
	return (
		(typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
		(error instanceof Error && error.name === 'AbortError')
	);
}

/** The legal attribution line for a document (the SRD keeps its canonical CC-BY-4.0 string). */
export function documentAttribution(doc: Open5eDocument): string {
	if (doc.key === SRD_DOCUMENT_KEY) return SRD_ATTRIBUTION;
	const licenses = doc.licenses.map((l) => l.name).join(', ');
	const licenseText = licenses !== '' ? `under ${licenses}` : "under its publisher's license terms";
	const link = doc.permalink !== '' ? ` (${doc.permalink})` : '';
	return `This work includes material taken from "${doc.name}" by ${doc.publisher}${link}, used ${licenseText}.`;
}

// --- projections (exported for unit tests) -------------------------------------------------------

const asString = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const asNumber = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/** Project one `/v2/creatures/` row into the bundled-SRD monster shape. */
export function projectCreature(raw: Record<string, unknown>): CompendiumMonster {
	const r = raw as Record<string, any>;

	const speed: Record<string, number | boolean> = {};
	for (const [k, v] of Object.entries((r.speed as Record<string, unknown>) ?? {})) {
		if (typeof v === 'number' || typeof v === 'boolean') speed[k] = v;
	}

	const senses: Record<string, number> = {};
	const senseFields: Array<[string, string]> = [
		['darkvision_range', 'darkvision'],
		['blindsight_range', 'blindsight'],
		['tremorsense_range', 'tremorsense'],
		['truesight_range', 'truesight'],
	];
	for (const [field, label] of senseFields) {
		const v = r[field];
		if (typeof v === 'number' && v > 0) senses[label] = v;
	}

	// Immunity/resistance display strings live either top-level or under `resistances_and_immunities`.
	const rni = (r.resistances_and_immunities as Record<string, unknown>) ?? {};
	const displayOf = (topLevel: unknown, nestedKey: string): string | undefined =>
		asString(topLevel) ?? asString(rni[`${nestedKey}_display`]);

	const traits: MonsterTrait[] = Array.isArray(r.traits)
		? r.traits.map((t: any) => ({ name: String(t?.name ?? ''), desc: String(t?.desc ?? '') }))
		: [];
	const actions: MonsterAction[] = Array.isArray(r.actions)
		? r.actions.map((a: any): MonsterAction => {
				const actionType = asString(a?.action_type);
				return {
					name: String(a?.name ?? ''),
					desc: String(a?.desc ?? ''),
					...(actionType ? { actionType } : {}),
					// v2 stamps `legendary_action_cost: 1` on plain actions too — only meaningful on legendary ones.
					...(actionType === 'LEGENDARY_ACTION' && typeof a?.legendary_action_cost === 'number'
						? { legendaryCost: a.legendary_action_cost }
						: {}),
					...(a?.usage_limits ? { usageLimits: a.usage_limits } : {}),
				};
			})
		: [];

	return {
		key: String(r.key ?? ''),
		name: String(r.name ?? ''),
		size: asString(r.size?.name) ?? '',
		type: asString(r.type?.name) ?? '',
		alignment: asString(r.alignment) ?? '',
		cr: asNumber(r.challenge_rating) ?? 0,
		xp: asNumber(r.experience_points),
		ac: asNumber(r.armor_class),
		acDetail: asString(r.armor_detail),
		hp: asNumber(r.hit_points),
		hitDice: asString(r.hit_dice),
		speed,
		abilityScores: (r.ability_scores as Record<string, number>) ?? {},
		savingThrows: (r.saving_throws as Record<string, number>) ?? {},
		skillBonuses: (r.skill_bonuses as Record<string, number>) ?? {},
		passivePerception: asNumber(r.passive_perception),
		senses,
		languages: asString(r.languages?.as_string),
		damageImmunities: displayOf(r.damage_immunities, 'damage_immunities'),
		damageResistances: displayOf(r.damage_resistances, 'damage_resistances'),
		damageVulnerabilities: displayOf(r.damage_vulnerabilities, 'damage_vulnerabilities'),
		conditionImmunities: displayOf(r.condition_immunities, 'condition_immunities'),
		traits,
		actions,
	};
}

/** Project one `/v2/spells/` row into the bundled-SRD spell shape. */
export function projectSpell(raw: Record<string, unknown>): CompendiumSpell {
	const r = raw as Record<string, any>;
	// Components render like the SRD statblock line: "V, S, M (a pinch of sulfur.)".
	const parts: string[] = [];
	if (r.verbal === true) parts.push('V');
	if (r.somatic === true) parts.push('S');
	if (r.material === true) {
		const material = asString(r.material_specified);
		parts.push(material ? `M (${material})` : 'M');
	}
	return {
		key: String(r.key ?? ''),
		name: String(r.name ?? ''),
		level: asNumber(r.level) ?? 0,
		school: asString(r.school?.name) ?? '',
		castingTime: asString(r.casting_time) ?? '',
		range: asString(r.range_text) ?? '',
		components: parts.join(', '),
		duration: asString(r.duration) ?? '',
		concentration: r.concentration === true ? true : undefined,
		ritual: r.ritual === true ? true : undefined,
		classes: Array.isArray(r.classes)
			? r.classes.map((c: any) => String(c?.name ?? '')).filter((n: string) => n !== '')
			: [],
		desc: asString(r.desc) ?? '',
		higherLevel: asString(r.higher_level),
	};
}

// --- live fetch ----------------------------------------------------------------------------------

interface Open5eListResponse {
	count: number;
	next: string | null;
	results: Array<Record<string, unknown>>;
}

function resolveFetch(opts: Open5eRequestOptions): typeof fetch {
	// Bind to avoid "Illegal invocation" when the global fetch is called unbound.
	return opts.fetchFn ?? globalThis.fetch.bind(globalThis);
}

async function fetchList(url: string, opts: Open5eRequestOptions): Promise<Open5eListResponse> {
	const doFetch = resolveFetch(opts);
	const response = await doFetch(url, { signal: opts.signal, headers: { Accept: 'application/json' } });
	if (!response.ok) throw new Error(`Open5e request failed: HTTP ${response.status}`);
	const body = (await response.json()) as Partial<Open5eListResponse>;
	if (!Array.isArray(body.results)) throw new Error('Open5e response had no results array');
	return { count: typeof body.count === 'number' ? body.count : body.results.length, next: body.next ?? null, results: body.results };
}

function listUrl(path: string, query: CompendiumQuery, kindParam: 'cr' | 'level'): string {
	const params = new URLSearchParams();
	params.set('document__key', query.documentKey ?? SRD_DOCUMENT_KEY);
	params.set('limit', String(query.limit ?? DEFAULT_PAGE_LIMIT));
	const search = query.search?.trim();
	if (search) params.set('name__icontains', search);
	if (kindParam === 'cr' && query.cr !== undefined) params.set('challenge_rating', String(query.cr));
	if (kindParam === 'level' && query.level !== undefined) params.set('level', String(query.level));
	return `${OPEN5E_API_BASE}${path}?${params.toString()}`;
}

function liveResult<T>(
	body: Open5eListResponse,
	entries: T[],
	opts: Open5eRequestOptions,
): CompendiumResult<T> {
	const doc = opts.document;
	return {
		source: 'live',
		document: doc?.name ?? SRD_DOCUMENT_NAME,
		license: doc ? doc.licenses.map((l) => l.name).join(', ') || 'see source' : SRD_LICENSE,
		attribution: doc ? documentAttribution(doc) : SRD_ATTRIBUTION,
		total: body.count,
		entries,
	};
}

/** Search `/v2/creatures/` live (no fallback — throws on failure). */
export async function searchLiveMonsters(
	query: CompendiumQuery,
	opts: Open5eRequestOptions = {},
): Promise<CompendiumResult<CompendiumMonster>> {
	const body = await fetchList(listUrl('/creatures/', query, 'cr'), opts);
	return liveResult(body, body.results.map(projectCreature), opts);
}

/** Search `/v2/spells/` live (no fallback — throws on failure). */
export async function searchLiveSpells(
	query: CompendiumQuery,
	opts: Open5eRequestOptions = {},
): Promise<CompendiumResult<CompendiumSpell>> {
	const body = await fetchList(listUrl('/spells/', query, 'level'), opts);
	return liveResult(body, body.results.map(projectSpell), opts);
}

// --- live-with-fallback (what the UI calls) ------------------------------------------------------

/**
 * Search monsters: live Open5e first, bundled SRD on ANY network failure (marked `source:
 * 'bundled'`). Intentional aborts re-throw. NOTE the bundled fallback is SRD-only — a non-SRD
 * `documentKey` degrades to the SRD offline, which the result's `document` field makes visible.
 */
export async function searchMonsters(
	query: CompendiumQuery,
	opts: Open5eRequestOptions = {},
): Promise<CompendiumResult<CompendiumMonster>> {
	try {
		return await searchLiveMonsters(query, opts);
	} catch (error) {
		if (isAbortError(error)) throw error;
		return searchBundledMonsters(query);
	}
}

/** Search spells: live Open5e first, bundled SRD on any network failure. Aborts re-throw. */
export async function searchSpells(
	query: CompendiumQuery,
	opts: Open5eRequestOptions = {},
): Promise<CompendiumResult<CompendiumSpell>> {
	try {
		return await searchLiveSpells(query, opts);
	} catch (error) {
		if (isAbortError(error)) throw error;
		return searchBundledSpells(query);
	}
}

/**
 * List the publishable Open5e source documents (for the explicit non-SRD opt-in — each entry
 * carries its own `licenses` so the UI can show them BEFORE any content is fetched). Live-only:
 * throws on network failure (the opt-in flow simply stays unavailable offline).
 */
export async function listDocuments(opts: Open5eRequestOptions = {}): Promise<Open5eDocument[]> {
	const doFetch = resolveFetch(opts);
	const docs: Open5eDocument[] = [];
	let url: string | null = `${OPEN5E_API_BASE}/documents/?limit=100`;
	while (url) {
		const response = await doFetch(url, { signal: opts.signal, headers: { Accept: 'application/json' } });
		if (!response.ok) throw new Error(`Open5e documents request failed: HTTP ${response.status}`);
		const body = (await response.json()) as { next?: string | null; results?: Array<Record<string, any>> };
		for (const r of body.results ?? []) {
			docs.push({
				key: String(r.key ?? ''),
				name: String(r.name ?? ''),
				displayName: asString(r.display_name) ?? String(r.name ?? ''),
				publisher: asString(r.publisher?.name) ?? 'unknown publisher',
				licenses: Array.isArray(r.licenses)
					? r.licenses.map((l: any) => ({ name: String(l?.name ?? ''), key: String(l?.key ?? '') }))
					: [],
				permalink: asString(r.permalink) ?? '',
			});
		}
		url = body.next ?? null;
	}
	return docs;
}
