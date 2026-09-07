import {
	contentSnippet,
	contentTemplatePreset,
	listContentSnippets,
	listContentTemplatePresets,
} from '@dndtools/core';
import type { EditorTrigger, SuggestionRow } from './Autocomplete';
import type { MessageKey, MessageValues } from '../../i18n';

/**
 * RC-KNW-1.2 — the `/` insert menu.
 *
 * Templates and snippets are the CORE's, not this file's: the rows come from
 * `listContentTemplatePresets()` / `listContentSnippets()` and the inserted text is the preset's own
 * `bodyTemplate` / the snippet's own `body`. A template's `{{placeholder}}` markers are inserted
 * as-authored, because filling them in is template-driven note CREATION, which is RC-KNW-1.3 — this
 * menu inserts text into the note you are already writing and says so in the row hint.
 *
 * Every generated fragment is plain markdown the shared renderer (RC-KNW-1.1) actually understands.
 * Nothing here invents a syntax the reader would render as literal text.
 */

type Translate = (key: MessageKey, values?: MessageValues) => string;

/** One insertable fragment. `caretOffset` counts from the start of `insert`. */
export interface SlashItem {
	id: string;
	label: string;
	hint: string;
	meta: string;
	insert: string;
	caretOffset?: number;
	/** Extra words the query matches against, so `/npc` finds "Location lore" style rows. */
	keywords: string;
}

/**
 * Find an unterminated `/` command immediately before the caret. The slash must open a word — at the
 * start of a line or after whitespace — so a date like `12/03` or a path never opens the menu.
 */
export function findSlashTrigger(text: string, caret: number): EditorTrigger | null {
	const slash = text.lastIndexOf('/', Math.max(0, caret - 1));
	if (slash === -1) return null;
	const before = slash === 0 ? '' : text[slash - 1]!;
	if (before !== '' && !/\s/.test(before)) return null;
	const typed = text.slice(slash + 1, caret);
	if (/\s/.test(typed)) return null;
	return { start: slash, query: typed.toLowerCase() };
}

/** Replace the `/query` with the item's text; the caret lands at the item's own offset. */
export function completeSlash(
	text: string,
	trigger: EditorTrigger,
	caret: number,
	item: SlashItem,
): { text: string; caret: number } {
	return {
		text: text.slice(0, trigger.start) + item.insert + text.slice(caret),
		caret: trigger.start + (item.caretOffset ?? item.insert.length),
	};
}

/**
 * The insert catalog: table, the four callout flavours, an inline roll, today's date, every
 * note-kind template preset and every snippet the core ships.
 *
 * `today` is passed in already formatted by the reader's locale — this module owns no clock and no
 * `Intl` call, so the same catalog renders identically in a test.
 */
export function slashItems(t: Translate, today: string): SlashItem[] {
	const column = t('editor.tableColumn');
	const table = `| ${column} | ${column} |\n| --- | --- |\n|  |  |\n`;
	const items: SlashItem[] = [
		{
			id: 'table',
			label: t('editor.table'),
			hint: t('editor.slashTableHint'),
			meta: t('editor.slashBlock'),
			insert: table,
			caretOffset: 2,
			keywords: 'table grid columns',
		},
		{
			id: 'callout-lore',
			label: t('editor.slashCalloutLore'),
			hint: t('editor.slashCalloutHint'),
			meta: t('editor.slashCallout'),
			insert: '> [!Lore] \n> ',
			caretOffset: 10,
			keywords: 'callout lore',
		},
		{
			id: 'callout-warning',
			label: t('editor.slashCalloutWarning'),
			hint: t('editor.slashCalloutHint'),
			meta: t('editor.slashCallout'),
			insert: '> [!Warning] \n> ',
			caretOffset: 13,
			keywords: 'callout warning',
		},
		{
			id: 'callout-tip',
			label: t('editor.slashCalloutTip'),
			hint: t('editor.slashCalloutHint'),
			meta: t('editor.slashCallout'),
			insert: '> [!Tip] \n> ',
			caretOffset: 9,
			keywords: 'callout tip',
		},
		{
			id: 'callout-secret',
			label: t('editor.slashCalloutSecret'),
			// A secret is the one callout with a rule attached, so its hint states the rule rather
			// than repeating the others': the core strips it from every player projection.
			hint: t('editor.slashCalloutSecretHint'),
			meta: t('editor.slashCallout'),
			insert: '> [!Secret] \n> ',
			caretOffset: 12,
			keywords: 'callout secret dm only hidden',
		},
		{
			id: 'roll',
			label: t('editor.slashRoll'),
			hint: t('editor.slashRollHint'),
			meta: t('editor.slashInline'),
			insert: '`1d20`',
			// Caret after the expression, not after the closing backtick: the number is the part
			// the DM immediately edits.
			caretOffset: 5,
			keywords: 'roll dice d20 check',
		},
		{
			id: 'date',
			label: t('editor.slashDate'),
			hint: today,
			meta: t('editor.slashInline'),
			insert: today,
			keywords: 'date today stamp',
		},
	];

	for (const preset of listContentTemplatePresets()) {
		// Only note templates: an `object` preset carries handout front-matter that belongs to a NEW
		// item, not pasted into the middle of a note someone is already writing.
		if (preset.kind !== 'note') continue;
		const full = contentTemplatePreset(preset.id);
		if (!full) continue;
		items.push({
			id: `template-${preset.id}`,
			label: preset.name,
			hint: t('editor.slashTemplateHint'),
			meta: t('editor.slashTemplate'),
			insert: full.bodyTemplate,
			keywords: `template ${preset.name} ${preset.description}`,
		});
	}

	for (const summary of listContentSnippets()) {
		const full = contentSnippet(summary.id);
		if (!full) continue;
		items.push({
			id: `snippet-${summary.id}`,
			label: summary.name,
			hint: summary.description,
			meta: t('editor.slashSnippet'),
			insert: full.body,
			keywords: `snippet ${summary.name} ${summary.description}`,
		});
	}

	return items;
}

/** Substring match over label, meta and keywords; a blank query lists everything. */
export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
	const needle = query.trim().toLowerCase();
	if (needle === '') return items;
	return items.filter((item) =>
		`${item.label} ${item.meta} ${item.keywords}`.toLowerCase().includes(needle),
	);
}

/** Project the catalog onto the shared listbox's row shape. */
export function slashRows(items: SlashItem[]): SuggestionRow[] {
	return items.map((item) => ({
		id: item.id,
		label: item.label,
		meta: item.meta,
		hint: item.hint,
	}));
}
