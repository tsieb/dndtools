import fs from 'node:fs';
import path from 'node:path';

interface Violation {
	file: string;
	line: number;
	message: string;
}

const REPO_ROOT = process.cwd();
const APP_ROOT = path.join(REPO_ROOT, 'apps', 'v2');
const CORE_ROOT = path.join(APP_ROOT, 'packages', 'core');
const SVELTE_APP_ROOT = path.join(APP_ROOT, 'app');

const IMPORT_PATTERN = /(?:^|\s)(?:import|export)\s+(?:[\s\S]*?)\sfrom\s+['"]([^'"]+)['"]/g;
const SIDE_EFFECT_PATTERN = /(?:^|\s)import\s+['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_PATTERN = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

const CORE_FORBIDDEN_PREFIXES = [
	'svelte',
	'@sveltejs/',
	'$app',
	'$lib',
	'$service-worker',
	'dexie',
	'@capacitor/',
	'electron',
	'@modelcontextprotocol/sdk',
	'fs',
	'node:',
	'path',
	'os',
];

const V1_FORBIDDEN_PREFIXES = ['../../../../src/', '../../../../electron/', '../../../../mcp/'];

function walk(dir: string, files: string[] = []): string[] {
	if (!fs.existsSync(dir)) return files;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.svelte-kit')
			continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full, files);
		} else if (/\.(ts|svelte|svelte\.ts|js|mjs)$/.test(entry.name)) {
			files.push(full);
		}
	}
	return files;
}

function checkImport(spec: string, forbidden: string[]): boolean {
	for (const prefix of forbidden) {
		if (spec === prefix) return true;
		if (spec.startsWith(prefix)) return true;
	}
	return false;
}

function lineOf(source: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index; i += 1) {
		if (source[i] === '\n') line += 1;
	}
	return line;
}

function scanFile(
	file: string,
	forbidden: string[],
	violations: Violation[],
	allowVoidImports: string[] = [],
): void {
	const source = fs.readFileSync(file, 'utf8');
	const patterns = [IMPORT_PATTERN, SIDE_EFFECT_PATTERN, DYNAMIC_IMPORT_PATTERN];
	for (const pattern of patterns) {
		pattern.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(source))) {
			const spec = match[1];
			if (!spec) continue;
			if (allowVoidImports.includes(spec)) continue;
			if (checkImport(spec, forbidden)) {
				violations.push({
					file: path.relative(REPO_ROOT, file),
					line: lineOf(source, match.index),
					message: `Forbidden import "${spec}"`,
				});
			}
		}
	}
}

function main(): void {
	const violations: Violation[] = [];

	// Core production source must have zero GUI/platform/v1 dependencies.
	// Tests intentionally use Node APIs (fs/path) to scan source files, so they are excluded.
	for (const file of walk(path.join(CORE_ROOT, 'src'))) {
		scanFile(file, CORE_FORBIDDEN_PREFIXES, violations);
	}

	for (const file of walk(path.join(SVELTE_APP_ROOT, 'src'))) {
		scanFile(file, V1_FORBIDDEN_PREFIXES, violations);
	}
	for (const file of walk(path.join(SVELTE_APP_ROOT, 'tests'))) {
		scanFile(file, V1_FORBIDDEN_PREFIXES, violations);
	}

	if (violations.length > 0) {
		console.error('v2 boundary lint failed:');
		for (const v of violations) {
			console.error(`  ${v.file}:${v.line} — ${v.message}`);
		}
		process.exit(1);
	}
	console.log('v2 boundary lint passed');
}

main();
