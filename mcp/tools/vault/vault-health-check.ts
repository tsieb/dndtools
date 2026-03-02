import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { extractWikilinks } from '../../../src/lib/domain/link-extractor.js';
import { buildLinkGraphQualityReport } from '../../../src/lib/domain/link-graph-intelligence.js';
import { jsonResult } from '../shared/response.js';
import { getLinkEntriesView } from '../shared/storage-view.js';

interface HealthIssue {
	type: 'broken_link' | 'orphan' | 'empty_note' | 'untagged' | 'root_folder' | 'duplicate_title';
	severity: 'warning' | 'info';
	noteId: string;
	noteTitle: string;
	detail: string;
	suggestion: string;
}

export function registerVaultHealthCheckTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'vault_health_check',
		'Run a structural health scan for broken links and organization problems.',
		{},
		async () => {
			const notes = await storage.getAllNotes();
			const active = notes.filter((note) => !note.deleted);
			const links = await getLinkEntriesView(storage);
			const noteById = new Map(active.map((note) => [note.id, note]));
			const noteTitles = new Set(active.map((note) => note.title.toLowerCase().trim()));

			const issues: HealthIssue[] = [];

			for (const note of active) {
				const extractedLinks = extractWikilinks(note.content);
				for (const link of extractedLinks) {
					const resolved = link.targetIdHint
						? noteById.has(link.targetIdHint)
						: noteTitles.has(link.title.toLowerCase().trim());
					if (!resolved) {
						issues.push({
							type: 'broken_link',
							severity: 'warning',
							noteId: note.id,
							noteTitle: note.title,
							detail: `Unresolved wikilink [[${link.title || 'unknown'}]]`,
							suggestion: 'Create or rename the linked note to match the target title.',
						});
					}
				}

				if (note.content.trim().length === 0) {
					issues.push({
						type: 'empty_note',
						severity: 'warning',
						noteId: note.id,
						noteTitle: note.title,
						detail: 'Note has no content.',
						suggestion: 'Add content or remove the note.',
					});
				}

				if (note.tags.length === 0) {
					issues.push({
						type: 'untagged',
						severity: 'info',
						noteId: note.id,
						noteTitle: note.title,
						detail: 'Note has no tags.',
						suggestion: 'Add at least one tag to improve search and grouping.',
					});
				}

				if (note.folder === '/') {
					issues.push({
						type: 'root_folder',
						severity: 'info',
						noteId: note.id,
						noteTitle: note.title,
						detail: 'Note is still in root folder.',
						suggestion: 'Move it into a topical subfolder.',
					});
				}
			}

			const incoming = new Set(links.map((link) => link.targetId));
			const outgoing = new Set(links.map((link) => link.sourceId));
			for (const note of active) {
				if (!incoming.has(note.id) && !outgoing.has(note.id)) {
					issues.push({
						type: 'orphan',
						severity: 'info',
						noteId: note.id,
						noteTitle: note.title,
						detail: 'No incoming or outgoing links.',
						suggestion: 'Add wikilinks to connect this note to related material.',
					});
				}
			}

			const titles = new Map<string, string[]>();
			for (const note of active) {
				const key = note.title.toLowerCase().trim();
				const group = titles.get(key);
				if (group) {
					group.push(note.id);
				} else {
					titles.set(key, [note.id]);
				}
			}

			for (const [normalizedTitle, ids] of titles.entries()) {
				if (ids.length < 2) continue;
				for (const id of ids) {
					const note = noteById.get(id);
					if (!note) continue;
					issues.push({
						type: 'duplicate_title',
						severity: 'warning',
						noteId: note.id,
						noteTitle: note.title,
						detail: `Duplicate title group: "${normalizedTitle}".`,
						suggestion: 'Rename or merge duplicates to avoid ambiguous links.',
					});
				}
			}

			const warnings = issues.filter((issue) => issue.severity === 'warning').length;
			const infos = issues.filter((issue) => issue.severity === 'info').length;
			const linkQuality = buildLinkGraphQualityReport({ notes: active });

			return jsonResult({
				summary: {
					notesScanned: active.length,
					warnings,
					infos,
					totalIssues: issues.length,
				},
				linkQuality: {
					totalLinks: linkQuality.totals.totalLinks,
					brokenLinks: linkQuality.totals.brokenLinks,
					aliasMatchedLinks: linkQuality.totals.aliasMatchedLinks,
					loops: linkQuality.totals.loops,
					crossFolderLinkDensity: linkQuality.totals.crossFolderLinkDensity,
					orphanCount: linkQuality.orphanNoteIds.length,
					hubCount: linkQuality.highCentrality.length,
					drilldown: {
						orphanNoteIds: linkQuality.orphanNoteIds,
						hubNoteIds: linkQuality.highCentrality.map((entry) => entry.noteId),
						brokenLinkNoteIds: linkQuality.drilldown.brokenLinkNoteIds,
						aliasMatchedNoteIds: linkQuality.drilldown.aliasMatchedNoteIds,
						loopNoteIds: linkQuality.drilldown.loopNoteIds,
						crossFolderNoteIds: linkQuality.drilldown.crossFolderNoteIds,
					},
				},
				issues,
			});
		},
	);
}
