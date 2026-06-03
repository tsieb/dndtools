import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', 'src');

function walk(dir: string, files: string[] = []): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, files);
		else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(full);
	}
	return files;
}

const FORBIDDEN_IMPORT_PREFIXES = [
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

const FILE_FORBIDDEN_V1 = [
	'apps/v2',
	'src/',
	'electron/',
	'mcp/',
];

function readImports(source: string): string[] {
	const re = /(?:^|\s)(?:import|export)\s+(?:[\s\S]*?)\sfrom\s+['"]([^'"]+)['"]/g;
	const out: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = re.exec(source))) {
		if (match[1]) out.push(match[1]);
	}
	const side = /(?:^|\s)import\s+['"]([^'"]+)['"]/g;
	while ((match = side.exec(source))) {
		if (match[1]) out.push(match[1]);
	}
	return out;
}

describe('Processing Core boundary lint', () => {
	const files = walk(ROOT);
	it.each(files.map((f) => [path.relative(ROOT, f), f] as const))(
		'%s has no forbidden runtime imports',
		(_label, file) => {
			const source = fs.readFileSync(file, 'utf8');
			const imports = readImports(source);
			for (const spec of imports) {
				for (const bad of FORBIDDEN_IMPORT_PREFIXES) {
					expect(
						spec === bad || spec.startsWith(`${bad}/`) || spec.startsWith(bad),
						`Forbidden import "${spec}" in ${file}`,
					).toBe(false);
				}
				for (const v1Path of FILE_FORBIDDEN_V1) {
					expect(
						spec.includes(`../${v1Path}`) || spec.startsWith(`/${v1Path}`),
						`Forbidden v1 path "${spec}" in ${file}`,
					).toBe(false);
				}
			}
		},
	);
});
