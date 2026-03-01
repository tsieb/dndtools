import type MiniSearchType from 'minisearch';
import type { Note, NoteId } from '$lib/types/note.js';
import { slugify } from '$lib/utils/slug.js';
import { PERFORMANCE_BUDGETS } from '$lib/types/diagnostics.js';
import { recordPerformanceMeasurement } from '$lib/runtime/diagnostics.js';
import { workerBridge } from '$lib/runtime/worker-bridge.js';
import { parseNotesForIndex, SEARCH_INDEX_OPTIONS } from '$lib/runtime/worker/operations.js';
import type { IndexedNoteDocument } from '$lib/runtime/worker/types.js';
import { extractWikilinks } from '$lib/domain/link-extractor.js';

export interface SearchResult {
	id: NoteId;
	title: string;
	folder: string;
	filePath: string | null;
	score: number;
	snippet: string;
	anchor: string | null;
	tags: string[];
	type: string | null;
	updatedAt: string;
}

type IndexedNote = IndexedNoteDocument;

interface UpdatedFilter {
	fromMs: number | null;
	toMs: number | null;
	raw: string;
}

export interface ParsedSearchQuery {
	raw: string;
	terms: string[];
	phrases: string[];
	tagFilters: string[];
	folderFilters: string[];
	typeFilters: string[];
	linkFilters: string[];
	hasTagNoneFilter: boolean;
	updatedFilters: UpdatedFilter[];
	operatorErrors: string[];
	textQuery: string;
}

export interface SearchFacetEntry {
	value: string;
	count: number;
}

export interface SearchFacets {
	tags: SearchFacetEntry[];
	folders: SearchFacetEntry[];
	types: SearchFacetEntry[];
}

export interface SearchTelemetry {
	elapsedMs: number;
	budgetMs: number;
	exceededBudget: boolean;
	averageMs: number;
	p95Ms: number;
	sampleSize: number;
}

export interface SearchQueryResult {
	results: SearchResult[];
	parsed: ParsedSearchQuery;
	facets: SearchFacets;
	telemetry: SearchTelemetry;
}

const SEARCH_BUDGET_MS = PERFORMANCE_BUDGETS.search_response.targetMs;
const SEARCH_TIMING_WINDOW = 50;
const SEARCH_INDEX_WORKER_THRESHOLD = 500;
let searchMeasureCounter = 0;

function noteType(note: Note): string {
	const value = note.frontmatter.type;
	if (typeof value !== 'string') return '';
	return value.trim().toLowerCase();
}

function noteToIndexed(note: Note): IndexedNote {
	return {
		id: note.id,
		title: note.title,
		content: note.content,
		tags: note.tags.join(' '),
		folder: note.folder,
		filePath: note.filePath ?? '',
		type: noteType(note),
		updatedAt: note.updatedAt,
	};
}

function normalizeTag(value: string): string {
	return value.trim().replace(/^#/, '').toLowerCase();
}

function normalizeFolder(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return '';
	if (trimmed.startsWith('/')) return trimmed;
	return `/${trimmed}`;
}

function normalizeLinkTarget(value: string): string {
	const [targetRaw] = value.split('|', 1);
	const target = (targetRaw ?? value)
		.trim()
		.replace(/\\([\\|\]])/g, '$1')
		.toLowerCase();
	return target.replace(/\s+/g, ' ');
}

function asDayRange(isoDate: string): { fromMs: number; toMs: number } | null {
	const parsed = Date.parse(`${isoDate}T00:00:00.000Z`);
	if (Number.isNaN(parsed)) return null;
	const end = parsed + 24 * 60 * 60 * 1000 - 1;
	return { fromMs: parsed, toMs: end };
}

function asMonthRange(isoYearMonth: string): { fromMs: number; toMs: number } | null {
	const parsed = Date.parse(`${isoYearMonth}-01T00:00:00.000Z`);
	if (Number.isNaN(parsed)) return null;
	const [yearStr, monthStr] = isoYearMonth.split('-');
	const year = Number(yearStr);
	const month = Number(monthStr);
	if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
	const nextMonth = month === 12 ? Date.UTC(year + 1, 0, 1) : Date.UTC(year, month, 1);
	return { fromMs: parsed, toMs: nextMonth - 1 };
}

function asYearRange(isoYear: string): { fromMs: number; toMs: number } | null {
	const year = Number(isoYear);
	if (!Number.isInteger(year)) return null;
	const fromMs = Date.UTC(year, 0, 1);
	const toMs = Date.UTC(year + 1, 0, 1) - 1;
	return { fromMs, toMs };
}

function parseRelativeDate(value: string): number | null {
	const match = value.match(/^-(\d+)([dhmwy])$/i);
	if (!match) return null;
	const [, amountRaw, unitRaw] = match;
	if (!amountRaw || !unitRaw) return null;
	const amount = Number(amountRaw);
	const unit = unitRaw.toLowerCase();
	if (!Number.isFinite(amount) || amount <= 0) return null;
	const day = 24 * 60 * 60 * 1000;
	const multipliers: Record<string, number> = {
		h: 60 * 60 * 1000,
		d: day,
		w: 7 * day,
		m: 30 * day,
		y: 365 * day,
	};
	const ms = multipliers[unit];
	if (!ms) return null;
	return Date.now() - amount * ms;
}

function parseDateOrRange(value: string): { fromMs: number; toMs: number } | null {
	const relative = parseRelativeDate(value);
	if (relative !== null) {
		return { fromMs: relative, toMs: Date.now() };
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return asDayRange(value);
	}
	if (/^\d{4}-\d{2}$/.test(value)) {
		return asMonthRange(value);
	}
	if (/^\d{4}$/.test(value)) {
		return asYearRange(value);
	}
	const parsed = Date.parse(value);
	if (Number.isNaN(parsed)) return null;
	return { fromMs: parsed, toMs: parsed };
}

function parseUpdatedFilter(rawValue: string): UpdatedFilter | null {
	const value = rawValue.trim();
	if (!value) return null;

	if (value.includes('..')) {
		const [fromRaw, toRaw] = value.split('..', 2);
		const fromRange = parseDateOrRange((fromRaw ?? '').trim());
		const toRange = parseDateOrRange((toRaw ?? '').trim());
		if (!fromRange || !toRange) return null;
		return {
			fromMs: fromRange.fromMs,
			toMs: toRange.toMs,
			raw: value,
		};
	}

	const comparatorMatch = value.match(/^(>=|<=|>|<)(.+)$/);
	if (comparatorMatch) {
		const [, op, valueRaw] = comparatorMatch;
		if (!op || !valueRaw) return null;
		const range = parseDateOrRange(valueRaw.trim());
		if (!range) return null;
		if (op === '>=') {
			return { fromMs: range.fromMs, toMs: null, raw: value };
		}
		if (op === '>') {
			return { fromMs: range.toMs + 1, toMs: null, raw: value };
		}
		if (op === '<=') {
			return { fromMs: null, toMs: range.toMs, raw: value };
		}
		return { fromMs: null, toMs: range.fromMs - 1, raw: value };
	}

	const exactRange = parseDateOrRange(value);
	if (!exactRange) return null;
	return {
		fromMs: exactRange.fromMs,
		toMs: exactRange.toMs,
		raw: value,
	};
}

function parseQuery(query: string): ParsedSearchQuery {
	const terms: string[] = [];
	const phrases: string[] = [];
	const tagFilters: string[] = [];
	const folderFilters: string[] = [];
	const typeFilters: string[] = [];
	const linkFilters: string[] = [];
	const updatedFilters: UpdatedFilter[] = [];
	const operatorErrors: string[] = [];
	let hasTagNoneFilter = false;

	const linkStrippedQuery = query.replace(
		/links:\[\[([\s\S]*?)\]\]/gi,
		(_match, rawValue: string) => {
			const normalized = normalizeLinkTarget(rawValue);
			if (!normalized) {
				operatorErrors.push('Invalid links: filter');
			} else {
				linkFilters.push(normalized);
			}
			return ' ';
		},
	);

	const tokenRegex = /"([^"]+)"|(\S+)/g;
	const matches = linkStrippedQuery.matchAll(tokenRegex);
	for (const match of matches) {
		const phrase = match[1];
		const token = match[2];

		if (phrase) {
			const normalized = phrase.trim();
			if (normalized) {
				phrases.push(normalized);
			}
			continue;
		}

		if (!token) {
			continue;
		}

		const separator = token.indexOf(':');
		if (separator <= 0) {
			terms.push(token);
			continue;
		}

		const key = token.slice(0, separator).toLowerCase();
		const rawValue = token.slice(separator + 1).trim();
		if (!rawValue) {
			operatorErrors.push(`Missing value for ${key}:`);
			continue;
		}

		if (key === 'tag') {
			for (const entry of rawValue.split(',')) {
				const normalized = normalizeTag(entry);
				if (!normalized) continue;
				if (normalized === 'none' || normalized === 'untagged') {
					hasTagNoneFilter = true;
					continue;
				}
				tagFilters.push(normalized);
			}
			continue;
		}

		if (key === 'folder') {
			const normalized = normalizeFolder(rawValue);
			if (normalized) folderFilters.push(normalized.toLowerCase());
			continue;
		}

		if (key === 'type') {
			typeFilters.push(rawValue.toLowerCase());
			continue;
		}

		if (key === 'updated') {
			const filter = parseUpdatedFilter(rawValue);
			if (!filter) {
				operatorErrors.push(`Invalid updated: filter '${rawValue}'`);
				continue;
			}
			updatedFilters.push(filter);
			continue;
		}

		terms.push(token);
	}

	const unique = (values: string[]): string[] => [...new Set(values)];

	return {
		raw: query,
		terms: unique(terms),
		phrases: unique(phrases),
		tagFilters: unique(tagFilters),
		folderFilters: unique(folderFilters),
		typeFilters: unique(typeFilters),
		linkFilters: unique(linkFilters),
		hasTagNoneFilter,
		updatedFilters,
		operatorErrors,
		textQuery: [...phrases, ...terms].join(' ').trim(),
	};
}

function fuzzyLevel(query: string): number | boolean {
	const len = query.trim().length;
	if (len <= 3) return false;
	if (len <= 6) return 0.1;
	if (len <= 12) return 0.2;
	return 0.25;
}

function normalizeForSearch(text: string): string {
	return text.toLowerCase();
}

function stripFrontmatter(content: string): string {
	return content.replace(/^---[\s\S]*?---\n?/, '');
}

function collapseWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function findNearestHeadingAnchor(content: string, index: number): string | null {
	const headingRegex = /^#{1,6}\s+(.+)$/gm;
	let nearest: { title: string; index: number } | null = null;
	for (const match of content.matchAll(headingRegex)) {
		const position = match.index ?? 0;
		const title = match[1];
		if (!title) continue;
		if (position > index) break;
		nearest = { title: title.trim(), index: position };
	}
	if (!nearest) return null;
	const slug = slugify(nearest.title);
	return slug || null;
}

function buildSnippet(
	note: Note,
	parsed: ParsedSearchQuery,
): { snippet: string; anchor: string | null } {
	const content = stripFrontmatter(note.content);
	const haystack = normalizeForSearch(content);
	const needles = [
		...parsed.phrases,
		...parsed.terms.filter((term) => term.length > 2),
		...parsed.tagFilters,
	].map(normalizeForSearch);

	for (const needle of needles) {
		const index = haystack.indexOf(needle);
		if (index === -1) continue;
		const start = Math.max(0, index - 80);
		const end = Math.min(content.length, index + needle.length + 100);
		const snippet = collapseWhitespace(content.slice(start, end));
		const prefix = start > 0 ? '... ' : '';
		const suffix = end < content.length ? ' ...' : '';
		return {
			snippet: `${prefix}${snippet}${suffix}`,
			anchor: findNearestHeadingAnchor(content, index),
		};
	}

	const fallback = collapseWhitespace(content.slice(0, 180));
	return {
		snippet: fallback,
		anchor: null,
	};
}

function hasPhraseMatch(note: Note, parsed: ParsedSearchQuery): boolean {
	if (parsed.phrases.length === 0) return true;
	const scope = normalizeForSearch(
		[
			note.title,
			note.content,
			note.filePath ?? '',
			note.folder,
			note.tags.join(' '),
			noteType(note),
		].join(' '),
	);
	return parsed.phrases.every((phrase) => scope.includes(normalizeForSearch(phrase)));
}

function hasOperatorMatch(note: Note, parsed: ParsedSearchQuery): boolean {
	if (!hasPhraseMatch(note, parsed)) {
		return false;
	}

	const tags = note.tags.map((tag) => normalizeTag(tag));
	if (parsed.hasTagNoneFilter && tags.length > 0) {
		return false;
	}
	for (const tag of parsed.tagFilters) {
		if (!tags.includes(tag)) return false;
	}

	const folder = String(note.folder).toLowerCase();
	for (const expected of parsed.folderFilters) {
		if (!(folder === expected || folder.startsWith(`${expected}/`))) {
			return false;
		}
	}

	const type = noteType(note);
	for (const expectedType of parsed.typeFilters) {
		if (type !== expectedType) {
			return false;
		}
	}

	if (parsed.linkFilters.length > 0) {
		const links = extractWikilinks(note.content);
		const linkTargets = new Set<string>();
		for (const link of links) {
			linkTargets.add(normalizeLinkTarget(link.title));
			if (link.displayText) {
				linkTargets.add(normalizeLinkTarget(link.displayText));
			}
			if (link.targetIdHint) {
				linkTargets.add(normalizeLinkTarget(link.targetIdHint));
				linkTargets.add(normalizeLinkTarget(`note:${link.targetIdHint}`));
				linkTargets.add(normalizeLinkTarget(`id:${link.targetIdHint}`));
			}
		}

		for (const expectedLink of parsed.linkFilters) {
			if (!linkTargets.has(expectedLink)) {
				return false;
			}
		}
	}

	if (parsed.updatedFilters.length > 0) {
		const updatedMs = Date.parse(note.updatedAt);
		if (Number.isNaN(updatedMs)) {
			return false;
		}
		for (const filter of parsed.updatedFilters) {
			if (filter.fromMs !== null && updatedMs < filter.fromMs) {
				return false;
			}
			if (filter.toMs !== null && updatedMs > filter.toMs) {
				return false;
			}
		}
	}

	return true;
}

function rankResult(note: Note, baseScore: number, parsed: ParsedSearchQuery): number {
	let score = baseScore;
	const normalizedText = normalizeForSearch(parsed.textQuery);
	const title = normalizeForSearch(note.title);
	const body = normalizeForSearch(note.content);
	const folder = normalizeForSearch(note.folder);
	const path = normalizeForSearch(note.filePath ?? '');
	const tags = note.tags.map((tag) => normalizeTag(tag));

	if (normalizedText) {
		if (title === normalizedText) score += 35;
		if (title.startsWith(normalizedText)) score += 22;
		if (title.includes(normalizedText)) score += 14;
	}

	for (const phrase of parsed.phrases) {
		const normalizedPhrase = normalizeForSearch(phrase);
		if (title.includes(normalizedPhrase)) score += 16;
		if (body.includes(normalizedPhrase)) score += 6;
	}

	for (const term of parsed.terms) {
		const normalizedTerm = normalizeForSearch(term);
		if (normalizedTerm.length < 2) continue;
		if (title.startsWith(normalizedTerm)) score += 8;
		if (title.includes(normalizedTerm)) score += 4;
		if (body.includes(normalizedTerm)) score += 1.5;
		if (folder.includes(normalizedTerm)) score += 2;
		if (path.includes(normalizedTerm)) score += 1;
	}

	for (const tag of parsed.tagFilters) {
		if (tags.includes(tag)) score += 8;
	}

	const type = noteType(note);
	if (type && parsed.typeFilters.includes(type)) {
		score += 8;
	}

	const updatedMs = Date.parse(note.updatedAt);
	if (!Number.isNaN(updatedMs)) {
		const days = Math.max(0, (Date.now() - updatedMs) / (24 * 60 * 60 * 1000));
		if (days <= 1) score += 4;
		else if (days <= 7) score += 2.5;
		else if (days <= 30) score += 1;
	}

	return score;
}

function toFacetEntries(values: Map<string, number>): SearchFacetEntry[] {
	return [...values.entries()]
		.map(([value, count]) => ({ value, count }))
		.sort((a, b) => {
			if (a.count !== b.count) return b.count - a.count;
			return a.value.localeCompare(b.value);
		});
}

class SearchService {
	private index: MiniSearchType<IndexedNote> | null = null;
	private indexedIds = new Set<string>();
	private notesById = new Map<string, Note>();
	private indexSignature = '';
	private lastQuery = '';
	private lastResult: SearchQueryResult | null = null;
	private timings: number[] = [];

	private resetQueryCache(): void {
		this.lastQuery = '';
		this.lastResult = null;
	}

	private buildSignature(notes: Note[]): string {
		return notes
			.map((note) => `${note.id}:${note.updatedAt}:${note.deleted ? 1 : 0}`)
			.sort()
			.join('|');
	}

	private createEmptyResult(parsed: ParsedSearchQuery, elapsedMs = 0): SearchQueryResult {
		return {
			results: [],
			parsed,
			facets: { tags: [], folders: [], types: [] },
			telemetry: this.recordTiming(elapsedMs),
		};
	}

	private recordTiming(elapsedMs: number): SearchTelemetry {
		this.timings.push(elapsedMs);
		if (this.timings.length > SEARCH_TIMING_WINDOW) {
			this.timings.shift();
		}
		const sorted = [...this.timings].sort((a, b) => a - b);
		const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
		const p95Ms = sorted[p95Index] ?? elapsedMs;
		const averageMs =
			this.timings.length > 0
				? this.timings.reduce((sum, value) => sum + value, 0) / this.timings.length
				: elapsedMs;
		return {
			elapsedMs,
			budgetMs: SEARCH_BUDGET_MS,
			exceededBudget: elapsedMs > SEARCH_BUDGET_MS,
			averageMs,
			p95Ms,
			sampleSize: this.timings.length,
		};
	}

	async buildIndex(notes: Note[]): Promise<void> {
		const nextSignature = this.buildSignature(notes);
		if (this.indexSignature === nextSignature) {
			return;
		}

		const MiniSearch = (await import('minisearch')).default;
		const indexedById = new Map(
			notes.filter((note) => !note.deleted).map((note) => [String(note.id), note]),
		);

		if (notes.length >= SEARCH_INDEX_WORKER_THRESHOLD) {
			try {
				const parsed = await workerBridge.parseNoteBatch({ notes });
				const built = await workerBridge.buildSearchIndex({ documents: parsed.documents });
				this.index = MiniSearch.loadJSON<IndexedNote>(built.serializedIndex, SEARCH_INDEX_OPTIONS);
				this.indexedIds = new Set(parsed.documents.map((note) => note.id));
				this.notesById = new Map(
					parsed.documents
						.map((doc) => [doc.id, indexedById.get(doc.id)])
						.filter((entry): entry is [string, Note] => !!entry[1]),
				);
			} catch {
				if (!this.index) {
					this.index = new MiniSearch<IndexedNote>(SEARCH_INDEX_OPTIONS);
				}
				this.index.removeAll();
				const parsed = parseNotesForIndex({ notes });
				this.index.addAll(parsed.documents);
				this.indexedIds = new Set(parsed.documents.map((note) => note.id));
				this.notesById = new Map(
					parsed.documents
						.map((doc) => [doc.id, indexedById.get(doc.id)])
						.filter((entry): entry is [string, Note] => !!entry[1]),
				);
			}
		} else {
			if (!this.index) {
				this.index = new MiniSearch<IndexedNote>(SEARCH_INDEX_OPTIONS);
			}
			this.index.removeAll();
			const parsed = parseNotesForIndex({ notes });
			this.index.addAll(parsed.documents);
			this.indexedIds = new Set(parsed.documents.map((note) => note.id));
			this.notesById = new Map(
				parsed.documents
					.map((doc) => [doc.id, indexedById.get(doc.id)])
					.filter((entry): entry is [string, Note] => !!entry[1]),
			);
		}

		this.indexSignature = nextSignature;
		this.resetQueryCache();
	}

	search(query: string): SearchResult[] {
		return this.searchDetailed(query).results;
	}

	searchDetailed(query: string): SearchQueryResult {
		const measureId = `search-${Date.now()}-${searchMeasureCounter++}`;
		const startMark = `dndtools:${measureId}:start`;
		const endMark = `dndtools:${measureId}:end`;
		const measureName = `dndtools:${measureId}:measure`;
		performance.mark(startMark);
		const startedAt = performance.now();
		const normalizedQuery = query.trim();
		const parsed = parseQuery(normalizedQuery);
		if (!this.index || !normalizedQuery) {
			const result = this.createEmptyResult(
				parsed,
				Math.round((performance.now() - startedAt) * 100) / 100,
			);
			const elapsedMs = result.telemetry.elapsedMs;
			performance.mark(endMark);
			performance.measure(measureName, startMark, endMark);
			performance.clearMarks(startMark);
			performance.clearMarks(endMark);
			performance.clearMeasures(measureName);
			void recordPerformanceMeasurement({
				operation: 'search_response',
				durationMs: elapsedMs,
				context: {
					queryLength: normalizedQuery.length,
					resultCount: 0,
				},
			});
			return result;
		}
		if (normalizedQuery === this.lastQuery && this.lastResult) {
			const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
			performance.mark(endMark);
			performance.measure(measureName, startMark, endMark);
			performance.clearMarks(startMark);
			performance.clearMarks(endMark);
			performance.clearMeasures(measureName);
			void recordPerformanceMeasurement({
				operation: 'search_response',
				durationMs: elapsedMs,
				context: {
					queryLength: normalizedQuery.length,
					resultCount: this.lastResult.results.length,
					cached: true,
				},
			});
			return this.lastResult;
		}

		const baseScores = new Map<string, number>();
		if (parsed.textQuery) {
			const raw = this.index.search(parsed.textQuery, {
				prefix: true,
				fuzzy: fuzzyLevel(parsed.textQuery),
			}) as Array<{ id: string; score: number }>;
			for (const entry of raw) {
				baseScores.set(String(entry.id), entry.score ?? 0);
			}
		} else {
			for (const id of this.notesById.keys()) {
				baseScores.set(id, 0);
			}
		}

		const tagFacets = new Map<string, number>();
		const folderFacets = new Map<string, number>();
		const typeFacets = new Map<string, number>();
		const results: SearchResult[] = [];

		for (const [id, baseScore] of baseScores) {
			const note = this.notesById.get(id);
			if (!note) continue;
			if (!hasOperatorMatch(note, parsed)) continue;

			const type = noteType(note) || null;
			const { snippet, anchor } = buildSnippet(note, parsed);
			const score = rankResult(note, baseScore, parsed);
			results.push({
				id: note.id,
				title: note.title,
				folder: note.folder,
				filePath: note.filePath ?? null,
				score,
				snippet,
				anchor,
				tags: [...note.tags],
				type,
				updatedAt: note.updatedAt,
			});

			for (const tag of note.tags) {
				const normalizedTag = normalizeTag(tag);
				if (!normalizedTag) continue;
				tagFacets.set(normalizedTag, (tagFacets.get(normalizedTag) ?? 0) + 1);
			}
			folderFacets.set(note.folder, (folderFacets.get(note.folder) ?? 0) + 1);
			if (type) {
				typeFacets.set(type, (typeFacets.get(type) ?? 0) + 1);
			}
		}

		results.sort((a, b) => {
			if (a.score !== b.score) return b.score - a.score;
			const byUpdated = b.updatedAt.localeCompare(a.updatedAt);
			if (byUpdated !== 0) return byUpdated;
			return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
		});

		const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
		const output: SearchQueryResult = {
			results,
			parsed,
			facets: {
				tags: toFacetEntries(tagFacets),
				folders: toFacetEntries(folderFacets),
				types: toFacetEntries(typeFacets),
			},
			telemetry: this.recordTiming(elapsedMs),
		};
		this.lastQuery = normalizedQuery;
		this.lastResult = output;
		performance.mark(endMark);
		performance.measure(measureName, startMark, endMark);
		performance.clearMarks(startMark);
		performance.clearMarks(endMark);
		performance.clearMeasures(measureName);
		void recordPerformanceMeasurement({
			operation: 'search_response',
			durationMs: elapsedMs,
			context: {
				queryLength: normalizedQuery.length,
				resultCount: results.length,
				operatorCount:
					parsed.tagFilters.length +
					parsed.folderFilters.length +
					parsed.typeFilters.length +
					parsed.linkFilters.length +
					parsed.updatedFilters.length,
			},
		});
		return output;
	}

	addNote(note: Note): void {
		if (!this.index) return;
		this.removeNote(note.id);
		if (!note.deleted) {
			this.index.add(noteToIndexed(note));
			this.indexedIds.add(String(note.id));
			this.notesById.set(String(note.id), note);
		}
		this.indexSignature = '';
		this.resetQueryCache();
	}

	removeNote(id: NoteId): void {
		if (!this.index) return;
		const key = String(id);
		if (!this.indexedIds.has(key)) {
			return;
		}
		this.index.discard(id);
		this.indexedIds.delete(key);
		this.notesById.delete(key);
		this.indexSignature = '';
		this.resetQueryCache();
	}
}

export const searchService = new SearchService();
export { parseQuery };
