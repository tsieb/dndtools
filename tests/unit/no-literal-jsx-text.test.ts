import { describe, expect, it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../../scripts/eslint-rules/no-literal-jsx-text.js';

// The rule reads JSX only; espree with the JSX flag is enough and keeps the test independent of
// the TypeScript parser version.
const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 2022,
		sourceType: 'module',
		parserOptions: { ecmaFeatures: { jsx: true } },
	},
});

describe('no-literal-jsx-text', () => {
	it('flags prose and passes symbols, catalogued text and code', () => {
		ruleTester.run('no-literal-jsx-text', rule as never, {
			valid: [
				// Text that comes from the catalog is the whole point of the rule.
				{ code: 'const a = <p>{t("play.home.title")}</p>;' },
				// Punctuation, separators and numbers read the same in every locale.
				{ code: 'const a = <span>·</span>;' },
				{ code: 'const a = <span>— 12 / 30 +5 %</span>;' },
				// A single letter is a glyph, not a sentence.
				{ code: 'const a = <span>d</span>;' },
				// Code samples and keyboard hints are not prose.
				{ code: 'const a = <code>npm run build</code>;' },
				{ code: 'const a = <kbd>Shift</kbd>;' },
				{ code: 'const a = <pre><span>const x = 1</span></pre>;' },
				// Attributes that are not read aloud carry ids and CSS, not copy.
				{ code: 'const a = <div className="scene card" data-testid="scene card" />;' },
				{ code: 'const a = <input aria-label={t("common.action.search")} />;' },
			],
			invalid: [
				{
					code: 'const a = <p>Add a scene</p>;',
					errors: [{ messageId: 'literalText' }],
				},
				{
					code: 'const a = <button title="Close the panel">{x}</button>;',
					errors: [{ messageId: 'literalAttribute' }],
				},
				{
					code: 'const a = <input placeholder={"Search scenes"} />;',
					errors: [{ messageId: 'literalAttribute' }],
				},
				{
					code: 'const a = <img alt="A dark forest" />;',
					errors: [{ messageId: 'literalAttribute' }],
				},
			],
		});
		expect(true).toBe(true);
	});

	it('lets an allow-listed file keep exactly its budgeted literals', () => {
		ruleTester.run('no-literal-jsx-text', rule as never, {
			valid: [
				{
					code: 'const a = <p>Add a scene</p>;',
					filename: '/repo/src/Legacy.tsx',
					options: [{ root: '/repo', allow: { 'src/Legacy.tsx': 1 } }],
				},
			],
			invalid: [
				// Over budget: only the strings past the allowance are reported.
				{
					code: 'const a = <p>Add a scene<b>Remove a scene</b></p>;',
					filename: '/repo/src/Legacy.tsx',
					options: [{ root: '/repo', allow: { 'src/Legacy.tsx': 1 } }],
					errors: [{ messageId: 'literalText' }],
				},
				// Under budget: the ratchet has to be lowered in the same commit.
				{
					code: 'const a = <p>{t("play.home.title")}</p>;',
					filename: '/repo/src/Legacy.tsx',
					options: [{ root: '/repo', allow: { 'src/Legacy.tsx': 1 } }],
					errors: [{ messageId: 'staleAllowance' }],
				},
			],
		});
		expect(true).toBe(true);
	});
});
