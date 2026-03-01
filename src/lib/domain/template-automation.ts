import type { AppSettings } from '$lib/types/settings.js';
import type { Note } from '$lib/types/note.js';
import { createFolderId } from '$lib/types/note.js';
import type { NoteTemplate, TemplateScope } from '$lib/types/template-library.js';
import { GLOBAL_TEMPLATE_IDS } from './templates.js';

export type { TemplateScope };

export interface TemplateContext {
	dateISO: string;
	datePretty: string;
	campaignName: string;
	sessionNumber: number;
	characterNames: string[];
}

export interface ScopedNoteTemplate {
	template: NoteTemplate;
	scope: TemplateScope;
	scopeFolder: string | null;
}

export interface RenderedTemplate {
	title: string;
	content: string;
	tags: string[];
	folder: string;
}

const TEMPLATE_TITLE_OVERRIDES: Record<string, string> = {
	session: 'Session {{session_number}} - {{campaign_name}}',
	'session-prep': 'Session {{session_number}} Prep - {{campaign_name}}',
	'session-recap': 'Session {{session_number}} Recap - {{campaign_name}}',
};

const VARIABLE_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/gi;
const VARIABLE_REFERENCE = [
	{
		key: '{{date_iso}}',
		description: 'Current date in YYYY-MM-DD format',
		example: '2026-03-01',
	},
	{
		key: '{{date_pretty}}',
		description: 'Localized current date for display',
		example: '3/1/2026',
	},
	{
		key: '{{campaign_name}}',
		description: 'Campaign name from Template Automation settings',
		example: 'Shadows Over Phandalin',
	},
	{
		key: '{{session_number}}',
		description: 'Session number from Template Automation settings',
		example: '12',
	},
	{
		key: '{{character_names_csv}}',
		description: 'Character names joined by commas',
		example: 'Aria, Brom, Cyra',
	},
	{
		key: '{{character_names_bullets}}',
		description: 'Character names rendered as markdown bullets',
		example: '- **Aria:**',
	},
] as const;

function normalizeCharacterNames(names: readonly string[]): string[] {
	return names.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function normalizeFolderPath(folder: string | null | undefined): string | null {
	if (!folder) return null;
	const trimmed = folder.trim();
	if (!trimmed) return null;
	const normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
	return normalized ? `/${normalized}` : '/';
}

function resolveTemplateScope(template: NoteTemplate): {
	scope: TemplateScope;
	scopeFolder: string | null;
} {
	if (template.scope === 'global') {
		return { scope: 'global', scopeFolder: null };
	}
	if (template.scope === 'folder') {
		const scopeFolder = normalizeFolderPath(template.scopeFolder ?? template.defaultFolder) ?? '/';
		return { scope: 'folder', scopeFolder };
	}
	if (GLOBAL_TEMPLATE_IDS.has(template.id)) {
		return { scope: 'global', scopeFolder: null };
	}
	return {
		scope: 'folder',
		scopeFolder: normalizeFolderPath(template.defaultFolder) ?? '/',
	};
}

function buildVariableTable(context: TemplateContext): Record<string, string> {
	const characterNames = normalizeCharacterNames(context.characterNames);
	const fallbackCharacterName = characterNames.length > 0 ? characterNames.join(', ') : 'Party';
	const bulletRows =
		characterNames.length > 0
			? characterNames.map((name) => `- **${name}:**`).join('\n')
			: '- **Party:**';

	return {
		date_iso: context.dateISO,
		date_pretty: context.datePretty,
		campaign_name: context.campaignName || 'Campaign',
		session_number: String(context.sessionNumber),
		character_names_csv: fallbackCharacterName,
		character_names_bullets: bulletRows,
	};
}

export function buildTemplateContext(
	settings: AppSettings['templateContext'],
	now = new Date(),
): TemplateContext {
	const sessionNumber = Math.max(1, Math.round(settings.sessionNumber || 1));
	return {
		dateISO: now.toISOString().slice(0, 10),
		datePretty: now.toLocaleDateString(),
		campaignName: settings.campaignName.trim(),
		sessionNumber,
		characterNames: normalizeCharacterNames(settings.characterNames),
	};
}

export function renderTemplateVariables(text: string, context: TemplateContext): string {
	const table = buildVariableTable(context);
	return text.replace(VARIABLE_PATTERN, (_, raw: string) => table[raw.toLowerCase()] ?? '');
}

export function getTemplateVariableReference(): ReadonlyArray<{
	key: string;
	description: string;
	example: string;
}> {
	return VARIABLE_REFERENCE;
}

export function getScopedTemplates(
	templates: readonly NoteTemplate[],
	activeFolder: string | null,
): ScopedNoteTemplate[] {
	const normalizedActiveFolder = normalizeFolderPath(activeFolder);
	return templates
		.map((template) => {
			const { scope, scopeFolder } = resolveTemplateScope(template);
			return {
				template,
				scope,
				scopeFolder,
			} satisfies ScopedNoteTemplate;
		})
		.sort((a, b) => {
			if (
				normalizedActiveFolder &&
				a.scope === 'folder' &&
				b.scope === 'global' &&
				a.scopeFolder === normalizedActiveFolder
			) {
				return -1;
			}
			if (
				normalizedActiveFolder &&
				b.scope === 'folder' &&
				a.scope === 'global' &&
				b.scopeFolder === normalizedActiveFolder
			) {
				return 1;
			}
			return a.template.name.localeCompare(b.template.name);
		});
}

export function getFolderScopedTemplateMatches(
	templates: readonly NoteTemplate[],
	activeFolder: string | null,
): NoteTemplate[] {
	const normalizedActiveFolder = normalizeFolderPath(activeFolder);
	if (!normalizedActiveFolder) return [];
	return getScopedTemplates(templates, normalizedActiveFolder)
		.filter((entry) => entry.scope === 'folder' && entry.scopeFolder === normalizedActiveFolder)
		.map((entry) => entry.template);
}

export function resolveTemplateTitle(template: NoteTemplate, context: TemplateContext): string {
	const titleTemplate =
		template.titleTemplate ??
		TEMPLATE_TITLE_OVERRIDES[template.id] ??
		`${template.name} - {{date_iso}}`;
	return renderTemplateVariables(titleTemplate, context);
}

export function renderNoteTemplate(
	template: NoteTemplate,
	context: TemplateContext,
	folderOverride?: string,
): RenderedTemplate {
	return {
		title: resolveTemplateTitle(template, context),
		content: renderTemplateVariables(template.content, context),
		tags: [...template.defaultTags],
		folder: folderOverride || template.defaultFolder,
	};
}

export function toNewNoteOverrides(rendered: RenderedTemplate): Partial<Note> {
	return {
		title: rendered.title,
		content: rendered.content,
		tags: [...rendered.tags],
		folder: createFolderId(rendered.folder),
	};
}
