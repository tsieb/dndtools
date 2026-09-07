import {
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { T } from '../screen-kit';
import { useI18n, type MessageKey } from '../../i18n';

/**
 * RC-KNW-1.2 — the note editor's formatting toolbar and the pure text transforms behind it.
 *
 * The transforms are separated from the component on purpose: they are the part that can silently
 * corrupt a DM's note (a wrong offset eats a paragraph), so they are pure `(text, selection) →
 * {text, selection}` functions with their own unit tests, and the component is a thin button row.
 *
 * Every action TOGGLES. Pressing Bold twice returns the original text rather than nesting `****`,
 * and pressing List on a bulleted block removes the bullets — the same contract a keyboard user
 * gets from Ctrl+B, so pointer and keyboard dispatch identical edits (WCAG 2.2 AA, guardrail 7).
 */

/** A completed edit: the whole new body plus where the caret/selection must land afterwards. */
export interface DraftEdit {
	text: string;
	start: number;
	end: number;
}

export type ToolbarAction =
	| 'bold'
	| 'italic'
	| 'heading'
	| 'bullet'
	| 'ordered'
	| 'quote'
	| 'link'
	| 'table';

/** Wrap (or unwrap) the selection in an inline marker such as `**` or `*`. */
export function wrapInline(text: string, start: number, end: number, marker: string): DraftEdit {
	const inner = text.slice(start, end);
	const len = marker.length;
	// Already wrapped, either inside the selection or immediately around it — unwrap instead of
	// nesting. Nesting is what makes a toolbar feel broken: two presses must be a no-op.
	if (inner.startsWith(marker) && inner.endsWith(marker) && inner.length > len * 2) {
		const stripped = inner.slice(len, -len);
		return {
			text: text.slice(0, start) + stripped + text.slice(end),
			start,
			end: start + stripped.length,
		};
	}
	if (text.slice(start - len, start) === marker && text.slice(end, end + len) === marker) {
		return {
			text: text.slice(0, start - len) + inner + text.slice(end + len),
			start: start - len,
			end: end - len,
		};
	}
	const next = text.slice(0, start) + marker + inner + marker + text.slice(end);
	// An empty selection leaves the caret BETWEEN the markers so the next keystroke is bold text,
	// not text typed after a stray `****`.
	return { text: next, start: start + len, end: end + len };
}

/** The line range [from,to) of the whole lines the selection touches. */
function lineSpan(text: string, start: number, end: number): { from: number; to: number } {
	const from = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
	const nextBreak = text.indexOf('\n', end);
	return { from, to: nextBreak === -1 ? text.length : nextBreak };
}

/**
 * Rewrite every line the selection touches through `rewrite`, then place the selection over the
 * rewritten block. `rewrite` returns the line unchanged to leave it alone.
 */
function mapLines(
	text: string,
	start: number,
	end: number,
	rewrite: (line: string, index: number, allPrefixed: boolean) => string,
	isPrefixed: (line: string) => boolean,
): DraftEdit {
	const { from, to } = lineSpan(text, start, end);
	const lines = text.slice(from, to).split('\n');
	const meaningful = lines.filter((line) => line.trim() !== '');
	// "All already prefixed" is what turns the action into a toggle. A block with one un-bulleted
	// line still bullets the whole block first, which is the behaviour every editor has.
	const allPrefixed = meaningful.length > 0 && meaningful.every(isPrefixed);
	const rewritten = lines.map((line, index) => rewrite(line, index, allPrefixed)).join('\n');
	return {
		text: text.slice(0, from) + rewritten + text.slice(to),
		start: from,
		end: from + rewritten.length,
	};
}

const HEADING_RE = /^(#{1,6})\s+/;
/** The toolbar button makes an H2 specifically, so only an H2 toggles back off. */
const H2_RE = /^##\s+/;
const BULLET_RE = /^\s*[-*]\s+/;
const ORDERED_RE = /^\s*\d+[.)]\s+/;
const QUOTE_RE = /^\s*>\s?/;

/** Toggle a `## ` heading on the touched lines, replacing any heading level already there. */
export function toggleHeading(text: string, start: number, end: number): DraftEdit {
	return mapLines(
		text,
		start,
		end,
		(line, _index, allPrefixed) => {
			if (line.trim() === '') return line;
			const bare = line.replace(HEADING_RE, '');
			return allPrefixed ? bare : `## ${bare}`;
		},
		(line) => H2_RE.test(line),
	);
}

/** Toggle `- ` bullets on the touched lines. */
export function toggleBullets(text: string, start: number, end: number): DraftEdit {
	return mapLines(
		text,
		start,
		end,
		(line, _index, allPrefixed) => {
			if (line.trim() === '') return line;
			return allPrefixed ? line.replace(BULLET_RE, '') : `- ${line.replace(ORDERED_RE, '')}`;
		},
		(line) => BULLET_RE.test(line),
	);
}

/** Toggle `1. ` numbering on the touched lines, renumbering from one. */
export function toggleOrdered(text: string, start: number, end: number): DraftEdit {
	let counter = 0;
	return mapLines(
		text,
		start,
		end,
		(line, _index, allPrefixed) => {
			if (line.trim() === '') return line;
			if (allPrefixed) return line.replace(ORDERED_RE, '');
			counter += 1;
			return `${counter}. ${line.replace(BULLET_RE, '')}`;
		},
		(line) => ORDERED_RE.test(line),
	);
}

/** Toggle `> ` blockquote markers on the touched lines. */
export function toggleQuote(text: string, start: number, end: number): DraftEdit {
	return mapLines(
		text,
		start,
		end,
		(line, _index, allPrefixed) => {
			if (line.trim() === '') return line;
			return allPrefixed ? line.replace(QUOTE_RE, '') : `> ${line}`;
		},
		(line) => QUOTE_RE.test(line),
	);
}

/**
 * Insert `snippet` over the selection. `caretOffset` counts from the START of the inserted text and
 * is where the caret lands, so a template can drop the author straight into the first blank.
 */
export function insertSnippetText(
	text: string,
	start: number,
	end: number,
	snippet: string,
	caretOffset = snippet.length,
): DraftEdit {
	const next = text.slice(0, start) + snippet + text.slice(end);
	const caret = start + caretOffset;
	return { text: next, start: caret, end: caret };
}

/**
 * The one entry point the editor calls. `labels` carries the two words that end up IN the document
 * (a link's placeholder text and a table's header cells), so this module holds no English.
 */
export function applyToolbarAction(
	action: ToolbarAction,
	text: string,
	start: number,
	end: number,
	labels: { linkText: string; column: string },
): DraftEdit {
	switch (action) {
		case 'bold':
			return wrapInline(text, start, end, '**');
		case 'italic':
			return wrapInline(text, start, end, '*');
		case 'heading':
			return toggleHeading(text, start, end);
		case 'bullet':
			return toggleBullets(text, start, end);
		case 'ordered':
			return toggleOrdered(text, start, end);
		case 'quote':
			return toggleQuote(text, start, end);
		case 'link': {
			const label = text.slice(start, end) || labels.linkText;
			const snippet = `[${label}](https://)`;
			// Caret inside the empty href: the label is either the DM's own selection or a placeholder
			// they can see, but the URL is the part that is definitely missing.
			return insertSnippetText(text, start, end, snippet, snippet.length - 1);
		}
		case 'table': {
			const head = `| ${labels.column} | ${labels.column} |`;
			const snippet = `${head}\n| --- | --- |\n|  |  |\n`;
			const lead = start > 0 && text[start - 1] !== '\n' ? '\n' : '';
			return insertSnippetText(text, start, end, lead + snippet, lead.length + 2);
		}
	}
}

const ACTION_LABELS: Record<ToolbarAction, MessageKey> = {
	bold: 'editor.bold',
	italic: 'editor.italic',
	heading: 'editor.heading',
	bullet: 'editor.bulletList',
	ordered: 'editor.numberedList',
	quote: 'editor.quote',
	link: 'editor.link',
	table: 'editor.table',
};

const ACTION_ORDER: ToolbarAction[] = [
	'bold',
	'italic',
	'heading',
	'bullet',
	'ordered',
	'quote',
	'link',
	'table',
];

const FACE_STYLE: Partial<Record<ToolbarAction, CSSProperties>> = {
	bold: { fontWeight: 700 },
	italic: { fontStyle: 'italic' },
};

/**
 * The formatting toolbar. Text labels rather than glyphs: the icon registry
 * (`docs/reference/ICON_VOCABULARY.md`) carries no formatting marks, and a word is its own
 * accessible name, so label-in-name (WCAG 2.5.3) holds for free.
 *
 * Roving tabindex per the ARIA toolbar pattern — the whole row is ONE tab stop between the title
 * field and the body, so Tab still walks the editor in reading order and arrows move within it.
 */
export function EditorToolbar({
	onAction,
	disabled = false,
}: {
	onAction: (action: ToolbarAction) => void;
	disabled?: boolean;
}) {
	const { t } = useI18n();
	const rowRef = useRef<HTMLDivElement>(null);
	const [focused, setFocused] = useState(0);

	function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
		const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
		if (!keys.includes(e.key)) return;
		const buttons = Array.from(rowRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
		const at = buttons.indexOf(e.target as HTMLButtonElement);
		if (at === -1 || buttons.length < 2) return;
		e.preventDefault();
		const next =
			e.key === 'Home'
				? 0
				: e.key === 'End'
					? buttons.length - 1
					: (at + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
		setFocused(next);
		buttons[next]?.focus();
	}

	return (
		<div
			ref={rowRef}
			role="toolbar"
			aria-label={t('editor.toolbar')}
			aria-orientation="horizontal"
			onKeyDown={onKeyDown}
			style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
		>
			{ACTION_ORDER.map((action, index) => (
				<button
					key={action}
					type="button"
					disabled={disabled}
					tabIndex={index === focused ? 0 : -1}
					onFocus={() => setFocused(index)}
					onClick={() => onAction(action)}
					style={{
						font: `12px ${T.sans}`,
						color: T.sub,
						background: T.surf,
						border: `1px solid ${T.bd}`,
						borderRadius: 6,
						padding: '5px 9px',
						cursor: disabled ? 'default' : 'pointer',
						opacity: disabled ? 0.5 : 1,
						...FACE_STYLE[action],
					}}
				>
					{t(ACTION_LABELS[action])}
				</button>
			))}
		</div>
	);
}
