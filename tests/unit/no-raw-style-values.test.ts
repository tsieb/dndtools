import { describe, expect, it } from 'vitest';
import { Linter } from 'eslint';
import rule from '../../scripts/eslint-rules/no-raw-style-values.js';

function lint(code: string, allowance?: number) {
	return new Linter().verify(
		code,
		{
			languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
			plugins: { dsn: { rules: { 'no-raw-style-values': rule } } },
			rules: {
				'dsn/no-raw-style-values': [
					'error',
					{ allow: allowance === undefined ? {} : { 'fixture.js': allowance } },
				],
			},
		},
		{ filename: 'fixture.js' },
	);
}

describe('raw style value ratchet', () => {
	const source =
		'<div style={{ padding: 8, marginTop: -2, gap: 4, borderRadius: 6, color: "#ffffff", background: "rgba(0,0,0,.2)" }} />';
	it('reports actionable diagnostics for every unapproved value', () => {
		const messages = lint(source);
		expect(messages).toHaveLength(6);
		expect(messages.every((message) => !message.message.includes('{{'))).toBe(true);
		expect(messages[0].message).toContain('`padding` has raw layout value "8"');
		expect(messages[4].message).toContain('raw color "#ffffff"');
	});
	it('permits only the existing count and rejects growth and stale allowances', () => {
		expect(lint(source, 6)).toEqual([]);
		expect(lint(source, 5)).toHaveLength(1);
		expect(lint(source, 7)[0].message).toContain('allows 7 raw style values but has 6');
	});
	it('accepts tokens and leaves non-style data alone', () => {
		expect(
			lint(
				'const data = { padding: 8, color: "#fff" }; <div style={{ padding: T.space.two, borderRadius: T.radius.md, color: "var(--color-text-primary)" }} />',
			),
		).toEqual([]);
	});
});
