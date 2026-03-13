/**
 * MCP Filesystem Boundary Lint (Epic 21.5)
 *
 * Ensures MCP tool handlers do not directly import Node filesystem APIs.
 * All vault data access must go through FileSystemAdapter (mcp/storage.ts).
 *
 * Allowed exceptions:
 * - mcp/storage.ts and mcp/storage/ (the adapter implementation itself)
 * - mcp/safe-write.ts (atomic write primitive used by storage)
 * - mcp/migrations.ts (schema migrations operate at infrastructure level)
 * - mcp/index.ts (server bootstrap)
 * - mcp/cli/ (CLI utilities)
 * - test files (*.test.ts)
 * - mcp/tools/shared/contract-server.ts (diagnostic telemetry infrastructure)
 * - mcp/tools/objects/import-image-note.ts (justified: imports external user files)
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

interface Violation {
	file: string;
	line: number;
	message: string;
}

const ROOT = process.cwd();
const MCP_DIR = join(ROOT, 'mcp');

const FS_IMPORT_RE = /(?:import|require)\s*(?:\(|.*from\s+)['"](?:node:)?(?:fs|fs\/promises)['"]/;

const ALLOWED_FILES = new Set([
	'mcp/storage.ts',
	'mcp/safe-write.ts',
	'mcp/migrations.ts',
	'mcp/index.ts',
	'mcp/tools/shared/contract-server.ts',
	'mcp/tools/objects/import-image-note.ts',
]);

const ALLOWED_PREFIXES = ['mcp/storage/', 'mcp/cli/'];

function isAllowed(relativePath: string): boolean {
	if (relativePath.endsWith('.test.ts')) return true;
	if (ALLOWED_FILES.has(relativePath)) return true;
	return ALLOWED_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

function walkDir(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory() && entry !== 'node_modules' && entry !== 'dist') {
			results.push(...walkDir(full));
		} else if (entry.endsWith('.ts') || entry.endsWith('.js')) {
			results.push(full);
		}
	}
	return results;
}

const violations: Violation[] = [];
const files = walkDir(MCP_DIR);

for (const file of files) {
	const rel = relative(ROOT, file).replace(/\\/g, '/');
	if (isAllowed(rel)) continue;

	const content = readFileSync(file, 'utf-8');
	const lines = content.split('\n');
	for (let i = 0; i < lines.length; i++) {
		if (FS_IMPORT_RE.test(lines[i])) {
			violations.push({
				file: rel,
				line: i + 1,
				message: `Direct fs import found. Use FileSystemAdapter from mcp/storage.ts instead.`,
			});
		}
	}
}

if (violations.length === 0) {
	console.log('✔ MCP filesystem boundary — no violations found.');
} else {
	console.error(`✘ MCP filesystem boundary — ${violations.length} violation(s):\n`);
	for (const v of violations) {
		console.error(`  ${v.file}:${v.line} — ${v.message}`);
	}
	process.exit(1);
}
