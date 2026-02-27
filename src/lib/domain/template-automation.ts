import type { AppSettings } from '$lib/types/settings.js';
import type { Note } from '$lib/types/note.js';
import { createFolderId } from '$lib/types/note.js';
import { DND_TEMPLATES, type NoteTemplate } from './templates.js';

export type TemplateScope = 'global' | 'folder';

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

const GLOBAL_TEMPLATE_IDS = new Set(['campaign-arc', 'timeline', 'rumor-clue', 'session-recap']);

const TEMPLATE_TITLE_OVERRIDES: Record<string, string> = {
	session: 'Session {{session_number}} - {{campaign_name}}',
	'session-prep': 'Session {{session_number}} Prep - {{campaign_name}}',
	'session-recap': 'Session {{session_number}} Recap - {{campaign_name}}',
};

const VARIABLE_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/gi;

function normalizeCharacterNames(names: readonly string[]): string[] {
	return names.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
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

export function getScopedTemplates(activeFolder: string | null): ScopedNoteTemplate[] {
	return DND_TEMPLATES.map((template) => {
		const isGlobal = GLOBAL_TEMPLATE_IDS.has(template.id);
		if (isGlobal) {
			return {
				template,
				scope: 'global',
				scopeFolder: null,
			} satisfies ScopedNoteTemplate;
		}

		return {
			template,
			scope: 'folder',
			scopeFolder: template.defaultFolder,
		} satisfies ScopedNoteTemplate;
	}).sort((a, b) => {
		if (
			activeFolder &&
			a.scope === 'folder' &&
			b.scope === 'global' &&
			a.scopeFolder === activeFolder
		) {
			return -1;
		}
		if (
			activeFolder &&
			b.scope === 'folder' &&
			a.scope === 'global' &&
			b.scopeFolder === activeFolder
		) {
			return 1;
		}
		return a.template.name.localeCompare(b.template.name);
	});
}

export function resolveTemplateTitle(template: NoteTemplate, context: TemplateContext): string {
	const titleTemplate = TEMPLATE_TITLE_OVERRIDES[template.id] ?? `${template.name} - {{date_iso}}`;
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
