import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import ts from 'typescript-eslint';
import globals from 'globals';

const NODE_ONLY_MODULE_PATTERNS = [
	'node:*',
	'assert',
	'buffer',
	'child_process',
	'cluster',
	'crypto',
	'dgram',
	'dns',
	'electron',
	'fs',
	'http',
	'https',
	'inspector',
	'module',
	'net',
	'os',
	'path',
	'perf_hooks',
	'process',
	'readline',
	'repl',
	'stream',
	'tls',
	'url',
	'util',
	'vm',
	'worker_threads',
	'zlib',
];

const MCP_RENDERER_ONLY_IMPORT_PATTERNS = [
	'$app/*',
	'@sveltejs/*',
	'svelte',
	'svelte/*',
	'$lib/ui/*',
	'$lib/state/*',
	'$lib/runtime/*',
	'$lib/platform/desktop/*',
	'$lib/platform/storage/*',
	'src/routes/**',
	'src/lib/ui/**',
	'src/lib/state/**',
	'src/lib/runtime/**',
	'**/src/routes/**',
	'**/src/lib/ui/**',
	'**/src/lib/state/**',
	'**/src/lib/runtime/**',
];

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
		files: ['src/**/*.{ts,svelte,svelte.ts}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: NODE_ONLY_MODULE_PATTERNS,
							message:
								'Renderer code must not import Node.js or Electron modules. Use renderer-safe abstractions under $lib/platform/*.',
						},
					],
				},
			],
		},
	},
	{
		files: ['mcp/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: MCP_RENDERER_ONLY_IMPORT_PATTERNS,
							message:
								'MCP runtime must not import renderer-only modules (routes/ui/state/runtime). Move shared logic into runtime-agnostic modules.',
						},
					],
				},
			],
		},
	},
	{
		files: ['src/routes/**/*.{svelte,ts}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['$lib/platform/storage/*'],
							message:
								'Route components must not call storage adapters directly. Use state modules under $lib/state/*.',
						},
					],
					paths: [
						{
							name: '$lib/platform/storage/index.js',
							message:
								'Route components must not call storage adapters directly. Use state modules under $lib/state/*.',
						},
						{
							name: '$lib/platform/storage/index.ts',
							message:
								'Route components must not call storage adapters directly. Use state modules under $lib/state/*.',
						},
					],
				},
			],
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
