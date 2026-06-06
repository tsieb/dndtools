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

// The repo-relative root of the v2 subproject. Any RELATIVE import that resolves OUTSIDE this tree is a
// v1 (or cross-app) import and forbidden; one that stays inside it (e.g. the intra-core `../mcp/` package
// directory) is fine. This is what distinguishes a genuine v1 `mcp/` import from the v2 core's own `mcp/`.
const V2_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

/**
 * Whether a RELATIVE import escapes the v2 subproject tree (i.e. resolves to a v1/cross-app path). An
 * absolute or bare import is handled by the prefix checks; this only judges `./` / `../` specifiers, by
 * resolving them against the importing file's directory. Resolving the target makes the v1-path check
 * precise: a single `../mcp/` from `src/perf/` lands inside the v2 core (allowed), while a deep
 * `../../../../../mcp/` escapes to the repo-root v1 `mcp/` (forbidden).
 */
function relativeImportEscapesV2(fromFile: string, spec: string): boolean {
	if (!spec.startsWith('.')) return false;
	const resolved = path.resolve(path.dirname(fromFile), spec);
	const rel = path.relative(V2_ROOT, resolved);
	return rel.startsWith('..') || path.isAbsolute(rel);
}

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
					// A bare/absolute v1 path is always forbidden. A RELATIVE specifier is forbidden only when it
					// actually RESOLVES outside the v2 subproject — so the v2 core's own `mcp/` directory, reached
					// via a relative `../mcp/`, is allowed while a v1 `mcp/` import (which must escape `apps/v2`) is
					// not. This keeps the ban precise rather than matching the substring `../mcp/` regardless of target.
					const forbidden = spec.startsWith('.')
						? relativeImportEscapesV2(file, spec)
						: spec.includes(`../${v1Path}`) || spec.startsWith(`/${v1Path}`);
					expect(forbidden, `Forbidden v1 path "${spec}" in ${file}`).toBe(false);
				}
			}
		},
	);
});
