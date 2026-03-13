import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const configPath = path.join(repoRoot, 'eslint.config.js');
const eslint = new ESLint({
	cwd: repoRoot,
	overrideConfigFile: configPath,
	ignore: false,
});

async function lintText(code: string, filePath: string): Promise<string[]> {
	const [result] = await eslint.lintText(code, { filePath });
	return (result?.messages ?? []).map((message) => message.message);
}

describe('runtime boundary lint rules — ESLint', () => {
	it('rejects Node-only imports in renderer files', async () => {
		const messages = await lintText(
			"import fs from 'node:fs';\nexport const value = fs;",
			path.join(repoRoot, 'src/lib/domain/__lint__/node-import.ts'),
		);
		expect(messages.join('\n')).toContain(
			'Renderer code must not import Node.js or Electron modules',
		);
	}, 60_000);

	it('rejects renderer-only imports in MCP files', async () => {
		const messages = await lintText(
			"import { writable } from 'svelte/store';\nexport const value = writable(0);",
			path.join(repoRoot, 'mcp/tools/__lint__/renderer-import.ts'),
		);
		expect(messages.join('\n')).toContain('MCP runtime must not import renderer-only modules');
	});

	it('rejects direct storage imports in routes', async () => {
		const messages = await lintText(
			'<script lang="ts">import { getStorage } from \'$lib/platform/storage/index.js\';</script>',
			path.join(repoRoot, 'src/routes/__lint__/+page.svelte'),
		);
		expect(messages.join('\n')).toContain(
			'Route components must not call storage adapters directly',
		);
	});

	it('allows shared src imports from MCP files', async () => {
		const messages = await lintText(
			"import type { Note } from '../../src/lib/types/note.js';\nexport type Test = Note;",
			path.join(repoRoot, 'mcp/tools/__lint__/shared-import.ts'),
		);
		expect(messages).toHaveLength(0);
	});
});

describe('runtime boundary lint rules — MCP filesystem boundary', () => {
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

	function isAllowed(rel: string): boolean {
		if (rel.endsWith('.test.ts')) return true;
		if (ALLOWED_FILES.has(rel)) return true;
		return ALLOWED_PREFIXES.some((prefix) => rel.startsWith(prefix));
	}

	function walkDir(dir: string): string[] {
		const results: string[] = [];
		for (const entry of readdirSync(dir)) {
			const full = path.join(dir, entry);
			const stat = statSync(full);
			if (stat.isDirectory() && entry !== 'node_modules' && entry !== 'dist') {
				results.push(...walkDir(full));
			} else if (entry.endsWith('.ts') || entry.endsWith('.js')) {
				results.push(full);
			}
		}
		return results;
	}

	it('no MCP tool files import fs directly outside allowed list', () => {
		const mcpDir = path.join(repoRoot, 'mcp');
		const files = walkDir(mcpDir);
		const violations: string[] = [];

		for (const file of files) {
			const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
			if (isAllowed(rel)) continue;

			const content = readFileSync(file, 'utf-8');
			const lines = content.split('\n');
			for (let i = 0; i < lines.length; i++) {
				if (FS_IMPORT_RE.test(lines[i]!)) {
					violations.push(`${rel}:${i + 1}`);
				}
			}
		}

		expect(violations).toEqual([]);
	});
});

describe('runtime boundary lint rules — circular dependencies', () => {
	it.each(['src/', 'electron/', 'mcp/'])(
		'%s has no circular imports',
		(dir) => {
			const output = execSync(`npx madge --circular --extensions ts,js --json ${dir}`, {
				encoding: 'utf-8',
				timeout: 120_000,
			});
			const cycles: string[][] = JSON.parse(output);
			expect(cycles).toEqual([]);
		},
		120_000,
	);
});
