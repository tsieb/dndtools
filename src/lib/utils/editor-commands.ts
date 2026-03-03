import type { EditorView } from '@codemirror/view';
import { parseInlineRollCommand, rollDiceExpression } from '$lib/domain/dice.js';
import { formatRollBlock, parseInlineTableCommand } from '$lib/domain/random-tables.js';

/** Wrap selected text with markers, or toggle them off if already wrapped */
function wrapSelection(view: EditorView, before: string, after: string): boolean {
	const { from, to } = view.state.selection.main;
	const selected = view.state.sliceDoc(from, to);

	// Check if selection is already wrapped — toggle off
	if (
		selected.startsWith(before) &&
		selected.endsWith(after) &&
		selected.length >= before.length + after.length
	) {
		view.dispatch({
			changes: { from, to, insert: selected.slice(before.length, -after.length) },
		});
		return true;
	}

	// Check if the text around the cursor is already wrapped — toggle off
	const beforeText = view.state.sliceDoc(Math.max(0, from - before.length), from);
	const afterText = view.state.sliceDoc(to, Math.min(view.state.doc.length, to + after.length));
	if (beforeText === before && afterText === after) {
		view.dispatch({
			changes: [
				{ from: from - before.length, to: from, insert: '' },
				{ from: to, to: to + after.length, insert: '' },
			],
		});
		return true;
	}

	// Wrap selection or insert markers at cursor
	if (selected) {
		view.dispatch({
			changes: { from, to, insert: `${before}${selected}${after}` },
			selection: { anchor: from + before.length, head: to + before.length },
		});
	} else {
		view.dispatch({
			changes: { from, to, insert: `${before}${after}` },
			selection: { anchor: from + before.length },
		});
	}
	return true;
}

/** Insert or toggle a prefix at the start of the current line */
function toggleLinePrefix(view: EditorView, prefix: string): boolean {
	const { from } = view.state.selection.main;
	const line = view.state.doc.lineAt(from);

	if (line.text.startsWith(prefix)) {
		view.dispatch({
			changes: { from: line.from, to: line.from + prefix.length, insert: '' },
		});
	} else {
		view.dispatch({
			changes: { from: line.from, insert: prefix },
		});
	}
	return true;
}

export function toggleBold(view: EditorView): boolean {
	return wrapSelection(view, '**', '**');
}

export function toggleItalic(view: EditorView): boolean {
	return wrapSelection(view, '_', '_');
}

export function toggleStrikethrough(view: EditorView): boolean {
	return wrapSelection(view, '~~', '~~');
}

export function toggleInlineCode(view: EditorView): boolean {
	return wrapSelection(view, '`', '`');
}

export function insertHeading(view: EditorView, level: number = 2): boolean {
	const { from } = view.state.selection.main;
	const line = view.state.doc.lineAt(from);
	const prefix = '#'.repeat(level) + ' ';

	// If line already has a heading, replace it
	const headingMatch = line.text.match(/^#{1,6}\s/);
	if (headingMatch) {
		view.dispatch({
			changes: { from: line.from, to: line.from + headingMatch[0].length, insert: prefix },
		});
	} else {
		view.dispatch({
			changes: { from: line.from, insert: prefix },
		});
	}
	return true;
}

export function insertLink(view: EditorView): boolean {
	const { from, to } = view.state.selection.main;
	const selected = view.state.sliceDoc(from, to);

	if (selected) {
		view.dispatch({
			changes: { from, to, insert: `[${selected}](url)` },
			selection: { anchor: from + selected.length + 3, head: from + selected.length + 6 },
		});
	} else {
		view.dispatch({
			changes: { from, insert: '[](url)' },
			selection: { anchor: from + 1 },
		});
	}
	return true;
}

export function insertWikilink(view: EditorView): boolean {
	const { from, to } = view.state.selection.main;
	const selected = view.state.sliceDoc(from, to);

	if (selected) {
		view.dispatch({
			changes: { from, to, insert: `[[${selected}]]` },
			selection: { anchor: from + 2, head: from + 2 + selected.length },
		});
	} else {
		view.dispatch({
			changes: { from, insert: '[[]]' },
			selection: { anchor: from + 2 },
		});
	}
	return true;
}

export function insertBulletList(view: EditorView): boolean {
	return toggleLinePrefix(view, '- ');
}

export function insertNumberedList(view: EditorView): boolean {
	return toggleLinePrefix(view, '1. ');
}

export function insertTaskList(view: EditorView): boolean {
	return toggleLinePrefix(view, '- [ ] ');
}

export function insertBlockquote(view: EditorView): boolean {
	return toggleLinePrefix(view, '> ');
}

export function insertCodeBlock(view: EditorView): boolean {
	const { from, to } = view.state.selection.main;
	const selected = view.state.sliceDoc(from, to);
	const insert = `\`\`\`\n${selected}\n\`\`\``;

	view.dispatch({
		changes: { from, to, insert },
		selection: { anchor: from + 4 },
	});
	return true;
}

export function insertHorizontalRule(view: EditorView): boolean {
	const { from } = view.state.selection.main;
	const line = view.state.doc.lineAt(from);

	view.dispatch({
		changes: { from: line.to, insert: '\n\n---\n\n' },
		selection: { anchor: line.to + 6 },
	});
	return true;
}

export function insertTable(view: EditorView): boolean {
	const { from } = view.state.selection.main;
	const table =
		'| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n| cell     | cell     | cell     |';

	view.dispatch({
		changes: { from, insert: table },
		selection: { anchor: from + 2, head: from + 10 },
	});
	return true;
}

export function insertCallout(view: EditorView, type: string = 'info'): boolean {
	const { from } = view.state.selection.main;
	const line = view.state.doc.lineAt(from);
	const insert = `> [!${type}] Title\n> Content here`;

	view.dispatch({
		changes: { from: line.to, insert: '\n\n' + insert + '\n' },
	});
	return true;
}

export function insertObjectEmbedTemplate(view: EditorView): boolean {
	const { from, to } = view.state.selection.main;
	const template = '![[note:note_id|Embed Label|view=card]]';
	view.dispatch({
		changes: { from, to, insert: template },
		selection: { anchor: from + template.length },
	});
	return true;
}

export function insertRollTableBlock(view: EditorView, tableName = 'Table Name'): boolean {
	const { from, to } = view.state.selection.main;
	const block = formatRollBlock(tableName);
	view.dispatch({
		changes: { from, to, insert: block },
		selection: { anchor: from + block.length },
		scrollIntoView: true,
	});
	return true;
}

export function insertDiceRollResult(
	view: EditorView,
	expression: string,
): { ok: true; markdownLine: string } | { ok: false; error: string } {
	const normalized = expression.trim();
	if (!normalized) {
		return { ok: false, error: 'Roll expression is required.' };
	}
	try {
		const result = rollDiceExpression(normalized);
		const { from, to } = view.state.selection.main;
		const insert = `${result.markdownLine}\n`;
		view.dispatch({
			changes: { from, to, insert },
			selection: { anchor: from + insert.length },
			scrollIntoView: true,
		});
		return { ok: true, markdownLine: result.markdownLine };
	} catch (error) {
		return { ok: false, error: String(error) };
	}
}

export function executeInlineRollSlashCommand(view: EditorView): boolean {
	const selection = view.state.selection.main;
	const line = view.state.doc.lineAt(selection.from);
	const expression = parseInlineRollCommand(line.text);
	if (!expression) return false;
	try {
		const result = rollDiceExpression(expression);
		const insert = `${result.markdownLine}\n`;
		view.dispatch({
			changes: { from: line.from, to: line.to, insert },
			selection: { anchor: line.from + insert.length },
			scrollIntoView: true,
		});
		return true;
	} catch {
		// Fall through to default Enter behavior for invalid expressions.
		return false;
	}
}

export function executeInlineTableSlashCommand(view: EditorView): boolean {
	const selection = view.state.selection.main;
	const line = view.state.doc.lineAt(selection.from);
	const tableName = parseInlineTableCommand(line.text);
	if (!tableName) return false;
	const insert = `${formatRollBlock(tableName)}\n`;
	view.dispatch({
		changes: { from: line.from, to: line.to, insert },
		selection: { anchor: line.from + insert.length },
		scrollIntoView: true,
	});
	return true;
}

/** Map action names to command functions */
export function executeEditorAction(view: EditorView, action: string): boolean {
	switch (action) {
		case 'bold':
			return toggleBold(view);
		case 'italic':
			return toggleItalic(view);
		case 'strikethrough':
			return toggleStrikethrough(view);
		case 'code':
			return toggleInlineCode(view);
		case 'heading1':
			return insertHeading(view, 1);
		case 'heading2':
			return insertHeading(view, 2);
		case 'heading3':
			return insertHeading(view, 3);
		case 'link':
			return insertLink(view);
		case 'wikilink':
			return insertWikilink(view);
		case 'bullet-list':
			return insertBulletList(view);
		case 'numbered-list':
			return insertNumberedList(view);
		case 'task-list':
			return insertTaskList(view);
		case 'blockquote':
			return insertBlockquote(view);
		case 'code-block':
			return insertCodeBlock(view);
		case 'horizontal-rule':
			return insertHorizontalRule(view);
		case 'table':
			return insertTable(view);
		case 'callout':
			return insertCallout(view);
		case 'object-embed':
			return insertObjectEmbedTemplate(view);
		case 'roll-table-block':
			return insertRollTableBlock(view);
		default:
			return false;
	}
}
