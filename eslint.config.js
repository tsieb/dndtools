import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import ts from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import noLiteralJsxText from './scripts/eslint-rules/no-literal-jsx-text.js';
import { allow as literalTextAllow } from './scripts/eslint-rules/no-literal-jsx-text.allow.js';

// Lint config for the React GM app (`apps/gm-react`), the processing core (`packages/core`),
// the cloud Lambdas (`packages/cloud-fns`), and repo tooling (`scripts/`, `tests/`). The Svelte
// app was retired to `archive/` (see archive/README.md) and is not linted.
export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
			],
			// Intentional swallow-and-continue in browser probes / verify scripts.
			'no-empty': ['error', { allowEmptyCatch: true }],
		},
	},
	{
		// The React GM app originated as a design-package port and still carries `any` in its
		// runtime/view-model seams. `no-explicit-any` and the effect-dependency hint stay visible
		// as warnings (tracked in DEBT.md) rather than blocking the gate; genuine defects
		// (unused vars, rules-of-hooks violations, etc.) stay errors.
		files: ['apps/gm-react/**/*.{ts,tsx}'],
		plugins: { 'react-hooks': reactHooks },
		rules: {
			'@typescript-eslint/no-explicit-any': 'warn',
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'warn',
		},
	},
	{
		// RC-UX-1.2: every user-visible string in the GM app comes out of `src/i18n/messages`.
		// Scoped to the surfaces a person actually reads — the shell (`app/`), the screens and the
		// design system — with a ratcheting allow-list (`no-literal-jsx-text.allow.mjs`) that a
		// migrating commit has to lower. Tests and stories are out of scope: their strings are
		// fixtures, not copy.
		files: [
			'apps/gm-react/src/app/**/*.tsx',
			'apps/gm-react/src/screens/**/*.tsx',
			'apps/gm-react/src/ds/**/*.tsx',
		],
		ignores: ['**/*.test.tsx'],
		plugins: { i18n: { rules: { 'no-literal-jsx-text': noLiteralJsxText } } },
		rules: {
			'i18n/no-literal-jsx-text': ['error', { allow: literalTextAllow, root: import.meta.dirname }],
		},
	},
	{
		// CommonJS node scripts (Electron smoke harness, etc.) legitimately use require().
		files: ['**/*.cjs'],
		rules: {
			'@typescript-eslint/no-require-imports': 'off',
		},
	},
	{
		ignores: [
			'**/dist/',
			'**/dist-demo/',
			// Capacitor copies the production bundle here during `cap sync`; lint the renderer source,
			// never the generated/minified Android asset mirror.
			'apps/gm-react/android/app/src/main/assets/public/',
			'**/.svelte-kit/',
			'**/build/',
			'node_modules/',
			'coverage/',
			'playwright-report/',
			'test-results/',
			// Vendored design-system reference kit (third-party React/JS mockups, not app source).
			'docs/design-package/',
			// Electron desktop shell (CommonJS main/preload + generated bundle) has its own runtime.
			'apps/gm-react/electron/',
			// Retired Svelte GM app — out of the workspace, not linted (see archive/README.md).
			'archive/',
		],
	},
);
