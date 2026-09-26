import { describe, expect, it } from 'vitest';
import { en } from './messages/en';
import { es } from './messages/es';

// RC-SES-6.2 — dice, tables, combat and handouts work in every workflow state, so no control may
// tell the DM to "go live" before using it. Starting a session is worded for what it does: it starts
// the log, the clock and the automations. This scans every message in both catalogs rather than a
// list of known keys, so a new "go live to …" string fails here wherever it is added.

/** English: "go live", "going live", "goes live". "Live" alone names a state and stays. */
const EN_GO_LIVE = /\bgo(?:es|ing)?\s+live\b/i;
/** Spanish: the imperative and infinitive forms the catalog used ("entra/entrar/ponte/ponerse en vivo"). */
const ES_GO_LIVE =
	/\b(?:entra|entrar|entres|entrando|ponte|ponerse|ponerte|poniéndose)\s+en\s+vivo\b/i;

function matching(catalog: Record<string, string | undefined>, pattern: RegExp): string[] {
	return Object.entries(catalog)
		.filter(([, message]) => message !== undefined && pattern.test(message))
		.map(([key, message]) => `${key}: ${message}`);
}

describe('no control carries "go live" copy', () => {
	it('English', () => {
		expect(matching(en, EN_GO_LIVE)).toEqual([]);
	});

	it('Spanish', () => {
		expect(matching(es, ES_GO_LIVE)).toEqual([]);
	});

	it('the patterns still catch the copy they were written against', () => {
		expect(EN_GO_LIVE.test('Go live to open combat')).toBe(true);
		expect(EN_GO_LIVE.test('Exit player preview before going live')).toBe(true);
		expect(EN_GO_LIVE.test('Session live')).toBe(false);
		expect(ES_GO_LIVE.test('Entra en vivo para abrir el combate')).toBe(true);
		expect(ES_GO_LIVE.test('Ponerse en vivo')).toBe(true);
		expect(ES_GO_LIVE.test('Sesión en vivo')).toBe(false);
	});
});

describe('starting a session says what it starts', () => {
	it.each([
		['en', en],
		['es', es],
	] as const)('%s names the log, the clock and the automations', (locale, catalog) => {
		const hint = catalog['session.goLive.hint'] ?? '';
		expect(hint).not.toBe('');
		const words =
			locale === 'en' ? ['log', 'clock', 'automations'] : ['registro', 'reloj', 'automatizaciones'];
		for (const word of words) expect(hint).toContain(word);
	});

	it('the Standby status is a quiet "not recording" line in both locales', () => {
		expect(en['session.standby.notRecording']).toBe(
			'Not recording. Rolls and combat are logged once you start the session.',
		);
		expect(es['session.standby.notRecording']).toMatch(/^No se está registrando\./);
	});
});
