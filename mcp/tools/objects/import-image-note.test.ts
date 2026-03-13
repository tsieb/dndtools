// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { registerImportImageNoteTool } from './import-image-note.js';
import { parseToolEnvelope, type ToolResult } from '../shared/response.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

class MockMcpServer {
	handlers = new Map<string, ToolHandler>();

	tool(
		name: string,
		_description: string,
		_schema: Record<string, unknown>,
		handler: ToolHandler,
	): void {
		this.handlers.set(name, handler);
	}
}

describe('import_image_note tool', () => {
	it('imports images through the storage abstraction and returns embed metadata', async () => {
		const importAssetFile = vi.fn().mockResolvedValue({
			absolutePath: 'C:/vault/assets/images/fixture.png',
			relativePath: 'assets/images/fixture.png',
		});
		const saveObject = vi.fn().mockResolvedValue(undefined);
		const saveNote = vi.fn().mockResolvedValue(undefined);
		const getNote = vi.fn().mockResolvedValue({
			id: 'image-note',
			title: 'Fixture',
			folder: '/objects/image',
			content: '',
			tags: [],
			frontmatter: {},
			createdAt: '2026-03-01T00:00:00.000Z',
			updatedAt: '2026-03-01T00:00:00.000Z',
			deleted: false,
			deletedAt: null,
			pinned: false,
			pinnedAt: null,
		});

		const server = new MockMcpServer();
		registerImportImageNoteTool(
			server as never,
			{
				importAssetFile,
				saveObject,
				getNote,
				saveNote,
			} as never,
		);

		const handler = server.handlers.get('import_image_note');
		expect(handler).toBeTypeOf('function');
		const result = await handler!({
			sourcePath: 'C:/imports/fixture.png',
			name: 'Fixture',
			summary: '',
			tags: ['map'],
			assetFolder: '/assets/images',
			noteFolder: '/objects/image',
			moveFile: false,
			overwrite: false,
		});
		const envelope = parseToolEnvelope(result);
		expect(envelope?.ok).toBe(true);
		if (!envelope || !envelope.ok) return;

		expect(importAssetFile).toHaveBeenCalledWith({
			sourcePath: 'C:\\imports\\fixture.png',
			targetFolder: '/assets/images',
			suggestedName: 'Fixture',
			moveFile: false,
			overwrite: false,
		});
		expect(saveObject).toHaveBeenCalledTimes(1);
		expect(saveNote).toHaveBeenCalledTimes(1);
		expect(envelope.data).toMatchObject({
			name: 'Fixture',
			filePath: 'assets/images/fixture.png',
		});
	});

	it('rejects unsupported extensions before touching storage', async () => {
		const importAssetFile = vi.fn();
		const server = new MockMcpServer();
		registerImportImageNoteTool(server as never, { importAssetFile } as never);

		const handler = server.handlers.get('import_image_note');
		expect(handler).toBeTypeOf('function');
		const result = await handler!({
			sourcePath: 'C:/imports/fixture.txt',
		});
		const envelope = parseToolEnvelope(result);
		expect(envelope?.ok).toBe(false);
		if (!envelope || envelope.ok) return;
		expect(envelope.error.message).toContain('Unsupported image extension');
		expect(importAssetFile).not.toHaveBeenCalled();
	});

	it('maps missing file failures to a stable MCP error response', async () => {
		const server = new MockMcpServer();
		registerImportImageNoteTool(
			server as never,
			{
				importAssetFile: vi.fn().mockRejectedValue(new Error('ENOENT: missing')),
			} as never,
		);

		const handler = server.handlers.get('import_image_note');
		expect(handler).toBeTypeOf('function');
		const result = await handler!({
			sourcePath: 'C:/imports/missing.png',
		});
		const envelope = parseToolEnvelope(result);
		expect(envelope?.ok).toBe(false);
		if (!envelope || envelope.ok) return;
		expect(envelope.error.message).toContain('Source image file was not found');
	});
});
