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
		expect(messages[4].message).toContain('Raw color "#ffffff"');
	});
	it('permits only the existing count and rejects growth and stale allowances', () => {
		expect(lint(source, 6)).toEqual([]);
		expect(lint(source, 5)).toHaveLength(1);
		expect(lint(source, 7)[0].message).toContain('allows 7 raw style values but has 6');
	});
	it('accepts tokens and leaves non-style data alone', () => {
		expect(
			lint(
				'const data = { padding: 8 }; const route = "#/board"; <div style={{ padding: T.space.two, borderRadius: T.radius.md, color: "var(--color-text-primary)" }} />',
			),
		).toEqual([]);
	});
});

describe('style object resolution', () => {
	it('finds values in a style object declared after its use site', () => {
		// Scope analysis, not traversal order: a bottom-of-file style bucket must still be counted.
		const after = lint('function C(){ return <div style={s} />; }\nconst s = { padding: 8 };');
		const before = lint('const s = { padding: 8 };\nfunction C(){ return <div style={s} />; }');
		expect(after).toHaveLength(1);
		expect(before).toHaveLength(1);
	});
	it('follows member access, conditionals and spreads', () => {
		expect(
			lint('const styles = { row: { padding: 8 } };\n<div style={styles.row} />;'),
		).toHaveLength(1);
		expect(lint('<div style={ok ? { padding: 8 } : { padding: 4 }} />')).toHaveLength(2);
		expect(lint('<div style={{ padding: ok ? "7px 0" : 4 }} />')).toHaveLength(2);
		expect(lint('const base = { padding: 8 };\n<div style={{ ...base, gap: 4 }} />;')).toHaveLength(
			2,
		);
	});
	it('counts a shared style object once', () => {
		expect(
			lint('const s = { padding: 8 };\n<><div style={s} /><div style={s} /></>;'),
		).toHaveLength(1);
	});
	it('respects shadowing', () => {
		expect(
			lint(
				'const s = { padding: 8 };\nfunction C(){ const s = { padding: T.space.two }; return <div style={s} />; }',
			),
		).toEqual([]);
	});
});

describe('raw value detection', () => {
	it('flags multi-value spacing shorthands', () => {
		expect(lint('<div style={{ padding: "8px 12px" }} />')).toHaveLength(1);
		expect(lint('<div style={{ margin: "0 auto" }} />')).toEqual([]);
		expect(lint('<div style={{ padding: "0 0" }} />')).toEqual([]);
		expect(lint('<div style={{ padding: "calc(100% - 8px)", gap: "var(--space-2)" }} />')).toEqual(
			[],
		);
	});
	it('flags raw colors outside inline style objects', () => {
		expect(lint('const overlay = "rgba(0,0,0,0.5)";')).toHaveLength(1);
		expect(lint('const g = (d) => `linear-gradient(${d}deg,#2a2117,#14100b)`;')).toHaveLength(1);
	});
});
