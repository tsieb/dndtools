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

describe('runtime boundary lint rules', () => {
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
