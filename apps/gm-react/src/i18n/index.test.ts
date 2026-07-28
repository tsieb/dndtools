import { describe, expect, it } from 'vitest';
import { MESSAGES, initialLocale, normalizeLocale, translate } from './index';

describe('localization', () => {
	it('uses a saved preference before the browser language', () => {
		expect(initialLocale('es-MX', ['en-CA'])).toBe('es');
		expect(initialLocale(null, ['es-ES', 'en-CA'])).toBe('es');
	});

	it('normalizes only supported language tags', () => {
		expect(normalizeLocale('EN-gb')).toBe('en');
		expect(normalizeLocale('fr-CA')).toBeNull();
	});

	it('uses source English when a translation is not yet supplied', () => {
		expect(translate('es', 'Save')).toBe('Guardar');
		expect(translate('es', 'A newly added message')).toBe('A newly added message');
	});

	it('interpolates dynamic values in both the source and translated message', () => {
		expect(translate('en', 'Pushed “{title}” to {count} players', { title: 'Map', count: 3 })).toBe(
			'Pushed “Map” to 3 players',
		);
		expect(
			translate('es', 'Pushed “{title}” to {count} players', { title: 'Mapa', count: 3 }),
		).toBe('«Mapa» enviado a 3 jugadores');
		// An unknown placeholder stays literal instead of rendering "undefined".
		expect(translate('en', 'Queue {title}', {})).toBe('Queue {title}');
	});

	it('keeps every interpolation placeholder intact in every translation', () => {
		const placeholders = (message: string) =>
			[...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
		for (const [source, translated] of Object.entries(MESSAGES.es)) {
			expect(placeholders(translated), `placeholders differ for: ${source}`).toEqual(
				placeholders(source),
			);
		}
	});
});
