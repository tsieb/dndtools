import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import ts from 'typescript-eslint';
import globals from 'globals';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
			},
		},
	},
	{
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
			],
			// Typed-route signatures reject query/hash and dynamic href strings in Svelte templates.
			'svelte/no-navigation-without-resolve': 'off',
		},
	},
	{
		ignores: [
			'**/dist/',
			'.svelte-kit/',
			'build/',
			'dist/',
			'node_modules/',
			'mcp/dist/',
			'coverage/',
			'playwright-report/',
			'test-results/',
		],
	},
);
