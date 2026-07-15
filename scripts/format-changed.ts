import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SUPPORTED_EXTENSION = /\.(?:cjs|css|html|js|json|jsx|md|mjs|ts|tsx|yaml|yml)$/i;
const EXCLUDED_PATHS = [/^archive\//, /^pnpm-lock\.yaml$/, /^(?:coverage|test-results|tmp)\//];

export function isFormattingCandidate(relativePath: string): boolean {
	const normalized = relativePath.replaceAll('\\', '/');
	return (
		SUPPORTED_EXTENSION.test(normalized) &&
		!EXCLUDED_PATHS.some((pattern) => pattern.test(normalized))
	);
}

function gitFiles(repoRoot: string, args: string[]): string[] {
	try {
		const output = execFileSync('git', [...args, '-z'], { cwd: repoRoot, encoding: 'utf-8' });
		return output.split('\0').filter(Boolean);
	} catch {
		return [];
	}
}

function changedFiles(repoRoot: string): string[] {
	const files = new Set<string>();
	if (process.env.CI) {
		const base = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'HEAD^';
		for (const file of gitFiles(repoRoot, [
			'diff',
			'--name-only',
			'--diff-filter=ACMR',
			`${base}...HEAD`,
		])) {
			files.add(file);
		}
	} else {
		for (const args of [
			['diff', '--name-only', '--diff-filter=ACMR'],
			['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
			['ls-files', '--others', '--exclude-standard'],
		]) {
			for (const file of gitFiles(repoRoot, args)) files.add(file);
		}
	}
	return [...files]
		.filter(isFormattingCandidate)
		.filter((file) => fs.existsSync(path.join(repoRoot, file)))
		.sort();
}

function runCli(): void {
	const repoRoot = process.cwd();
	const files = changedFiles(repoRoot);
	if (files.length === 0) {
		console.log('changed-file format check passed: no supported files changed');
		return;
	}
	console.log(`checking formatting for ${files.length} changed file(s)`);
	const result = spawnSync('pnpm', ['exec', 'prettier', '--check', ...files], {
		cwd: repoRoot,
		stdio: 'inherit',
	});
	if (result.error) throw result.error;
	process.exit(result.status ?? 1);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) runCli();
