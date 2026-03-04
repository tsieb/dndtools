// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { registerImportImageNoteTool } from './import-image-note.js';
import { parseToolEnvelope, type ToolResult } from '../shared/response.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;
class MockMcpServer {
	handler: ToolHandler | null = null;
	tool(
		_name: string,
		_description: string,
		_schema: Record<string, unknown>,
		handler: ToolHandler,
	): void {
		this.handler = handler;
	}
}

describe('import_image_note tool', () => {
	it('returns not-found error for missing source file', async () => {
		const server = new MockMcpServer();
		registerImportImageNoteTool(server as never, { getVaultDir: () => '/tmp' } as never);
		const result = await server.handler?.({
			sourcePath: '/definitely/missing.png',
			assetFolder: '/assets/images',
			noteFolder: '/objects/image',
			summary: '',
			tags: [],
			visibility: 'dm_only',
			relationships: [],
			moveFile: false,
			overwrite: false,
		});
		expect(parseToolEnvelope(result as ToolResult)?.ok).toBe(false);
	});

	it('imports image and saves object for valid input', async () => {
		const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dndtools-image-test-'));
		const source = path.join(tmp, 'img.png');
		await fs.writeFile(source, 'fake');
		let saved = false;
		const server = new MockMcpServer();
		registerImportImageNoteTool(
			server as never,
			{
				getVaultDir: () => tmp,
				saveObject: async () => {
					saved = true;
				},
				getNote: async () => null,
				saveNote: async () => undefined,
			} as never,
		);
		const result = await server.handler?.({
			sourcePath: source,
			assetFolder: '/assets/images',
			noteFolder: '/objects/image',
			summary: '',
			tags: [],
			visibility: 'dm_only',
			relationships: [],
			moveFile: false,
			overwrite: false,
		});
		expect(saved).toBe(true);
		expect(parseToolEnvelope(result as ToolResult)?.ok).toBe(true);
	});
});
