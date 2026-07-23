import { describe, expect, it } from 'vitest';
import { initialLocale, normalizeLocale, translate } from './index';

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
});
