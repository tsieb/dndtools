import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

// RC-DSN-1.1 raw style value counter.
//
// Re-runs `dsn/no-raw-style-values` with no allowances and no cache so the number reported is the
// current source count — including grandfathered findings — rather than the sum of a potentially
// stale baseline. Pass `--write` to regenerate the ratchet allow-list from those counts after a
// token migration pass.

const root = resolve(import.meta.dirname, '..');
const files = ['apps/gm-react/src/app/**/*.{ts,tsx}', 'apps/gm-react/src/screens/**/*.{ts,tsx}'];
const ignores = ['**/*.test.ts', '**/*.test.tsx'];

const eslint = new ESLint({
	overrideConfig: {
		files,
		ignores,
		rules: { 'dsn/no-raw-style-values': ['error', { allow: {}, root }] },
	},
});
const results = await eslint.lintFiles(files);
if (results.some((result) => result.fatalErrorCount > 0)) {
	throw new Error('Cannot count raw style values: ESLint encountered a fatal parsing error.');
}

const counts = results
	.map((result) => ({
		file: result.filePath
			.slice(root.length + 1)
			.split('\\')
			.join('/'),
		count: result.messages.filter((message) => message.ruleId === 'dsn/no-raw-style-values').length,
	}))
	.filter((entry) => entry.count > 0)
	.sort((a, b) => a.file.localeCompare(b.file));

const total = counts.reduce((sum, entry) => sum + entry.count, 0);
console.log(`Raw style values: ${total} across ${counts.length} files (including allowances).`);

if (process.argv.includes('--write')) {
	const body = counts.map((entry) => `\t'${entry.file}': ${entry.count},`).join('\n');
	const target = resolve(root, 'scripts/eslint-rules/no-raw-style-values.allow.js');
	writeFileSync(
		target,
		`/**
 * RC-DSN-1.1 ratchet for \`no-raw-style-values\`.
 *
 * Each entry is a file in \`apps/gm-react/src/app\` or \`apps/gm-react/src/screens\` that still
 * contains legacy raw style literals. The migration ratchets when an entry is lowered to the
 * current real count; adding entries without lowering is not accepted. Regenerate with
 * \`pnpm lint:raw-style-count --write\` after a token migration pass.
 */

export const allow = {
${body}
};

// Total current findings: ${total}
`,
	);
	console.log(`Wrote ${counts.length} allow-list entries to ${target.slice(root.length + 1)}.`);
}
