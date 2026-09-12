import { describe, expect, it } from 'vitest';
import { en } from '../messages/en';
import catalog from './qps-ploc';
import { pseudoMessage } from './pseudo';
import { formatMessage } from '../format';

describe('pseudo catalog generation', () => {
	it('matches the current source catalog exactly', () => {
		expect(catalog).toEqual(
			Object.fromEntries(Object.entries(en).map(([key, value]) => [key, pseudoMessage(value)])),
		);
	});
	it('accents and expands literal text by 40%, plus brackets', () => {
		expect(pseudoMessage('abcdefghij')).toBe('[áƀçďéƒğĥíĵ~~~~]');
	});
	it('keeps long padding wrappable without changing the expansion ratio', () => {
		const result = pseudoMessage('a '.repeat(100));
		expect(result.length).toBe(282);
		expect(result).not.toMatch(/~{5}/);
	});
	it('preserves nested selectors, arguments, and format styles', () => {
		const source =
			'{kind, select, foo {{n, plural, one {One {name}} other {# {name}}}} other {{n, number, percent}}}';
		const pseudo = pseudoMessage(source);
		expect(formatMessage('en', pseudo, { kind: 'foo', n: 2, name: 'Ada' })).toContain('2');
		expect(formatMessage('en', pseudo, { kind: 'foo', n: 1, name: 'Ada' })).toContain('Ada');
		expect(formatMessage('en', pseudo, { kind: 'other', n: 0.5 })).toBe('[50%]');
	});
});
