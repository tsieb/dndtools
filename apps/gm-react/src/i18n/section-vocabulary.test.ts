import { describe, expect, it } from 'vitest';
import { en } from './messages/en';
import { es } from './messages/es';

// RC-ENG-15.2 — IA_REVIEW vocabulary: the sections are Maps, Story and Notes everywhere visible.
// "Atlas" and "Knowledge" stay internal route and model terms, so no message may send the user to
// a section by those names ("Knowledge → Sources", "player-visible in Knowledge", "the selected
// Atlas map"). This scans every message in both catalogs rather than a list of known keys, so a
// new string naming the old sections fails here wherever it is added. Palette search keywords are
// the one exception: IA_REVIEW keeps the old names as search synonyms.

const EN_OLD_SECTIONS = /\b(?:Knowledge|Atlas)\b/;
const ES_OLD_SECTIONS = /\b(?:Conocimiento|Atlas)\b/;

function naming(catalog: Record<string, string | undefined>, pattern: RegExp): string[] {
	return Object.entries(catalog)
		.filter(([key]) => !key.endsWith('Keywords'))
		.filter(([, message]) => message !== undefined && pattern.test(message))
		.map(([key, message]) => `${key}: ${message}`);
}

describe('no message names a section by its internal term', () => {
	it('English', () => {
		expect(naming(en, EN_OLD_SECTIONS)).toEqual([]);
	});

	it('Spanish', () => {
		expect(naming(es, ES_OLD_SECTIONS)).toEqual([]);
	});

	it('the patterns still catch the copy they were written against', () => {
		expect(EN_OLD_SECTIONS.test('Manage connected sources in Knowledge → Sources.')).toBe(true);
		expect(EN_OLD_SECTIONS.test('into the selected Atlas map')).toBe(true);
		expect(EN_OLD_SECTIONS.test('Manage connected sources in Notes → Sources.')).toBe(false);
		expect(ES_OLD_SECTIONS.test('Gestiona las fuentes en Conocimiento → Fuentes.')).toBe(true);
		expect(ES_OLD_SECTIONS.test('Gestiona las fuentes en Notas → Fuentes.')).toBe(false);
	});
});

describe('messages that point at a section use its visible name', () => {
	it.each([
		['en', en, 'Notes → Sources', 'in Notes'],
		['es', es, 'Notas → Fuentes', 'en Notas'],
	] as const)('%s', (_locale, catalog, sources, inNotes) => {
		for (const key of [
			'settings.vault.emptyBody',
			'settings.vault.emptyBodyWithDocs',
			'settings.vault.disconnectBody',
			'settings.vault.folderDisconnected',
		] as const) {
			expect(catalog[key]).toContain(sources);
		}
		for (const key of [
			'extensions.compendium.selectPrompt',
			'community.export.hint',
			'community.wiki.previewEmpty',
			'community.wiki.needsPages',
		] as const) {
			expect(catalog[key]).toContain(inNotes);
		}
		// The section name must match the navigation label it points at.
		expect(sources.startsWith(catalog['nav.knowledge'] ?? '—')).toBe(true);
		expect(catalog['knowledge.sources']).toBe(sources.split(' → ')[1]);
	});
});
