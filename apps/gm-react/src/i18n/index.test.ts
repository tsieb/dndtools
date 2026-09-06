import { beforeAll, describe, expect, it } from 'vitest';
import { catalogCoverage, initialLocale, loadCatalog, normalizeLocale, translate } from './index';
import { en, type MessageKey } from './messages/en';
import { es } from './messages/es';
import {
	formatDistance,
	formatList,
	formatMessage,
	formatNumber,
	formatRelativeTime,
} from './format';

// The Spanish catalog ships in its own chunk (ADR-032 §1), so `translate` renders English until it
// resolves. Every locale-sensitive assertion below runs after the import.
beforeAll(() => loadCatalog('es'));

describe('locale selection', () => {
	it('uses a saved preference before the browser language', () => {
		expect(initialLocale('es-MX', ['en-CA'])).toBe('es');
		expect(initialLocale(null, ['es-ES', 'en-CA'])).toBe('es');
	});

	it('falls back to English when neither the preference nor the system offers a supported locale', () => {
		expect(initialLocale(null, ['fr-CA', 'de'])).toBe('en');
		expect(initialLocale(null, [])).toBe('en');
	});

	it('normalizes only supported language tags', () => {
		expect(normalizeLocale('EN-gb')).toBe('en');
		expect(normalizeLocale('fr-CA')).toBeNull();
	});
});

describe('message catalogs', () => {
	it('resolves a key in the active locale', () => {
		expect(translate('es', 'common.action.save')).toBe('Guardar');
		expect(translate('en', 'common.action.save')).toBe('Save');
	});

	it('falls back to the English source when a locale has not translated a key', () => {
		const untranslated = (Object.keys(en) as MessageKey[]).find((key) => es[key] === undefined);
		expect(
			untranslated,
			'expected at least one untranslated key to exercise the fallback',
		).toBeDefined();
		expect(translate('es', untranslated as MessageKey)).toBe(en[untranslated as MessageKey]);
	});

	it('renders the key itself rather than nothing when no catalog knows it', () => {
		expect(translate('en', 'nope.not.a.key' as MessageKey)).toBe('nope.not.a.key');
	});

	it('interpolates dynamic values in both the source and translated message', () => {
		expect(translate('en', 'sceneCards.queue', { title: 'Tavern' })).toBe('Queue Tavern');
		expect(translate('es', 'sceneCards.queue', { title: 'Taberna' })).toBe('Poner Taberna en cola');
		// An argument with no supplied value stays literal instead of rendering "undefined".
		expect(translate('en', 'sceneCards.queue', {})).toBe('Queue {title}');
	});

	it('keeps every argument and plural category intact in every translation', () => {
		const shape = (message: string) =>
			[...message.matchAll(/\{\s*(\w+)\s*(?:,\s*(\w+))?/g)]
				.map((match) => `${match[1]}:${match[2] ?? ''}`)
				.sort();
		for (const [key, translated] of Object.entries(es)) {
			expect(shape(translated as string), `arguments differ for: ${key}`).toEqual(
				shape(en[key as MessageKey]),
			);
		}
	});

	it('translates only keys the English catalog declares', () => {
		const orphans = Object.keys(es).filter((key) => !(key in en));
		expect(orphans, 'Spanish keys with no English source').toEqual([]);
	});

	it('addresses every key by a dotted area path, never by its English text', () => {
		for (const key of Object.keys(en)) expect(key).toMatch(/^[a-z][A-Za-z]*(\.[a-zA-Z0-9]+)+$/);
	});

	it('reports catalog coverage', () => {
		expect(catalogCoverage('en')).toBe(1);
		expect(catalogCoverage('es')).toBeGreaterThan(0.9);
	});
});

describe('ICU message formatting', () => {
	it('selects a plural branch and substitutes the formatted count for #', () => {
		const message = '{count, plural, =0 {No players} one {# player} other {# players}} joined';
		expect(formatMessage('en', message, { count: 0 })).toBe('No players joined');
		expect(formatMessage('en', message, { count: 1 })).toBe('1 player joined');
		expect(formatMessage('en', message, { count: 4200 })).toBe('4,200 players joined');
	});

	it('pluralizes the pushed-handout message in both locales from one key', () => {
		expect(translate('en', 'projection.pushed', { title: 'Map', count: 1 })).toBe(
			'Pushed “Map” to 1 player',
		);
		expect(translate('en', 'projection.pushed', { title: 'Map', count: 3 })).toBe(
			'Pushed “Map” to 3 players',
		);
		expect(translate('es', 'projection.pushed', { title: 'Mapa', count: 1 })).toBe(
			'«Mapa» enviado a 1 jugador',
		);
		expect(translate('es', 'projection.pushed', { title: 'Mapa', count: 3 })).toBe(
			'«Mapa» enviado a 3 jugadores',
		);
	});

	it('uses the target locale plural rules, not English ones', () => {
		const message = '{count, plural, one {{count} jugador} other {{count} jugadores}}';
		expect(formatMessage('es', message, { count: 1 })).toBe('1 jugador');
		expect(formatMessage('es', message, { count: 2 })).toBe('2 jugadores');
	});

	it('renders a select branch and falls back to other', () => {
		const message = '{visibility, select, dm {DM only} shared {Shared} other {Player visible}}';
		expect(formatMessage('en', message, { visibility: 'dm' })).toBe('DM only');
		expect(formatMessage('en', message, { visibility: 'anything' })).toBe('Player visible');
	});

	it('formats number, percent, date and time arguments', () => {
		const when = new Date(Date.UTC(2026, 0, 2, 15, 4));
		expect(formatMessage('en', '{n, number}', { n: 12345.6 })).toBe('12,345.6');
		expect(formatMessage('en', '{n, number, percent}', { n: 0.25 })).toBe('25%');
		expect(formatMessage('en', '{when, date, short}', { when })).toContain('26');
		expect(formatMessage('en', '{when, time, short}', { when })).toMatch(/\d/);
	});

	it('nests arguments inside a plural branch', () => {
		const message = '{count, plural, one {{title} has # note} other {{title} has # notes}}';
		expect(formatMessage('en', message, { count: 2, title: 'Keep' })).toBe('Keep has 2 notes');
	});

	it('leaves an unbalanced or unsupplied argument literal rather than throwing', () => {
		expect(formatMessage('en', 'Broken {count, plural, one {x}', { count: 1 })).toBe(
			'Broken {count, plural, one {x}',
		);
		expect(formatMessage('en', 'Hello {name}', { other: 1 })).toBe('Hello {name}');
	});

	it('is a no-op for a message with no arguments', () => {
		expect(formatMessage('es', 'Guardar', { count: 1 })).toBe('Guardar');
	});
});

describe('Intl formatting helpers', () => {
	it('formats numbers per locale', () => {
		expect(formatNumber('en', 1234.5)).toBe('1,234.5');
		expect(formatNumber('es', 1234.5)).toBe('1234,5');
	});

	it('chooses a relative-time unit from the size of the gap', () => {
		const now = new Date(Date.UTC(2026, 5, 1, 12, 0));
		expect(formatRelativeTime('en', new Date(Date.UTC(2026, 5, 1, 11, 57)), now)).toBe(
			'3 minutes ago',
		);
		expect(formatRelativeTime('en', new Date(Date.UTC(2026, 5, 3, 12, 0)), now)).toBe('in 2 days');
		expect(formatRelativeTime('en', now, now)).toBe('now');
	});

	it('joins a list the way the locale does', () => {
		expect(formatList('en', ['Ana', 'Ben', 'Cy'])).toBe('Ana, Ben, and Cy');
		expect(formatList('es', ['Ana', 'Ben', 'Cy'])).toBe('Ana, Ben y Cy');
	});

	it('localizes the number of a distance while the unit stays a rules fact', () => {
		// Stored feet render as feet by default and as metres only when the rules say metric —
		// the locale never decides this (ADR-032 §4).
		expect(formatDistance('en', 30)).toBe('30 ft');
		expect(formatDistance('es', 30)).toBe('30 ft');
		expect(formatDistance('en', 5, 'metric')).toBe('1.5 m');
		expect(formatDistance('es', 5, 'metric')).toBe('1,5 m');
	});

	it('renders a unit argument inside a message', () => {
		expect(formatMessage('en', 'Speed {feet, unit, foot}', { feet: 30 })).toBe('Speed 30 ft');
	});
});
