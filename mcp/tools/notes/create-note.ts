import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import type { Note } from '../../../src/lib/types/note.js';
import { createFolderId } from '../../../src/lib/types/note.js';
import { generateNoteId } from '../../../src/lib/utils/id.js';
import { nowISO } from '../../../src/lib/utils/date.js';
import {
	buildTemplateContext,
	renderNoteTemplate,
} from '../../../src/lib/domain/template-automation.js';
import { frontmatterSchema } from '../shared/frontmatter.js';
import { errorResult, jsonResult } from '../shared/response.js';

const templateContextOverrideSchema = z
	.object({
		campaignName: z.string().optional(),
		sessionNumber: z.number().int().min(1).optional(),
		characterNames: z.array(z.string()).optional(),
	})
	.strict();

export function registerCreateNoteTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'create_note',
		'Create a new note with managed metadata, optional template rendering, and optional custom frontmatter.',
		{
			title: z
				.string()
				.min(1)
				.optional()
				.describe('Note title (optional when templateId is provided)'),
			content: z.string().optional().describe('Markdown content'),
			folder: z.string().optional().describe('Folder path'),
			tags: z.array(z.string()).optional().describe('Tag list without # prefix'),
			frontmatter: frontmatterSchema
				.optional()
				.default({})
				.describe('Custom frontmatter fields only'),
			templateId: z.string().min(1).optional().describe('Template id from .vault/templates'),
			templateContext: templateContextOverrideSchema
				.optional()
				.describe(
					'Optional template variable overrides for campaignName/sessionNumber/characterNames',
				),
		},
		async ({ title, content, folder, tags, frontmatter, templateId, templateContext }) => {
			const hasExplicitContent = content !== undefined;
			const hasExplicitFolder = folder !== undefined;
			const hasExplicitTags = tags !== undefined;
			let resolvedTitle = title;
			let resolvedContent = content ?? '';
			let resolvedFolder = folder ?? '/';
			let resolvedTags = tags ?? [];

			if (templateId) {
				const templates = await storage.getNoteTemplates();
				const template = templates.find((entry) => entry.id === templateId);
				if (!template) {
					return errorResult(`Template "${templateId}" not found.`, {
						code: 'MCP_NOT_FOUND',
						hint: 'Use a template id that exists under .vault/templates and retry.',
						tool: 'create_note',
					});
				}

				const baseContext = await storage.getSetting('templateContext');
				const worldCalendar = await storage.getSetting('worldCalendar');
				const mergedContext = {
					campaignName: templateContext?.campaignName ?? baseContext.campaignName,
					sessionNumber: templateContext?.sessionNumber ?? baseContext.sessionNumber,
					characterNames: templateContext?.characterNames ?? baseContext.characterNames,
				};
				const rendered = renderNoteTemplate(
					template,
					buildTemplateContext(mergedContext, new Date(), { worldCalendar }),
				);
				resolvedTitle = resolvedTitle ?? rendered.title;
				if (!hasExplicitContent) {
					resolvedContent = rendered.content;
				}
				if (!hasExplicitFolder) {
					resolvedFolder = rendered.folder;
				}
				if (!hasExplicitTags) {
					resolvedTags = rendered.tags;
				}
			}

			if (!resolvedTitle) {
				return errorResult('title is required when templateId is not provided.', {
					code: 'MCP_INVALID_INPUT',
					hint: 'Pass title or provide templateId so title can be rendered from a template.',
					tool: 'create_note',
				});
			}

			const now = nowISO();
			const note: Note = {
				id: generateNoteId(),
				title: resolvedTitle,
				content: resolvedContent,
				folder: createFolderId(resolvedFolder),
				tags: resolvedTags,
				frontmatter,
				createdAt: now,
				updatedAt: now,
				deleted: false,
				deletedAt: null,
				pinned: false,
				pinnedAt: null,
			};

			await storage.saveNote(note);
			const persisted = (await storage.getNote(note.id)) ?? note;
			await storage.resolveAndIndexLinks(persisted.id, persisted.content);

			return jsonResult({
				id: persisted.id,
				title: persisted.title,
				folder: persisted.folder,
				filePath: persisted.filePath ?? null,
				tags: persisted.tags,
			});
		},
	);
}
