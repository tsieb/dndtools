import { ESLint } from 'eslint';
import { resolve } from 'node:path';

// Re-run the same rule without allowances or cache so this is the current source count,
// including grandfathered findings, rather than the sum of a potentially stale baseline.
const eslint = new ESLint({
	overrideConfig: {
		files: ['apps/gm-react/src/app/**/*.{ts,tsx}', 'apps/gm-react/src/screens/**/*.{ts,tsx}'],
		ignores: ['**/*.test.tsx'],
		rules: {
			'dsn/no-raw-style-values': ['error', { allow: {}, root: resolve(import.meta.dirname, '..') }],
		},
	},
});
const results = await eslint.lintFiles([
	'apps/gm-react/src/app/**/*.{ts,tsx}',
	'apps/gm-react/src/screens/**/*.{ts,tsx}',
]);
if (results.some((result) => result.fatalErrorCount > 0)) {
	throw new Error('Cannot count raw style values: ESLint encountered a fatal parsing error.');
}
const counts = results.map((result) => ({
	file: result.filePath,
	count: result.messages.filter((message) => message.ruleId === 'dsn/no-raw-style-values').length,
}));
console.log(
	`Raw style values: ${counts.reduce((sum, result) => sum + result.count, 0)} across ${counts.filter((result) => result.count > 0).length} files (including allowances).`,
);
