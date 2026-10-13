import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * RC-CAN-8.7 — the flow screen and the tile menus carry NO copy of their own. Every word they show or
 * announce comes out of the message catalog (`boardCanvas.flow.*`, `boardCanvas.tileMenu.*`), so a
 * Spanish GM reads a Spanish menu. Both files used to keep an English `TEXT` table, which the
 * `no-literal-jsx-text` rule never saw: it reads JSX children and a handful of attributes, not an
 * object of strings handed to them later.
 *
 * So this scan reads EVERY string literal, template literal and JSX text in the two files, wherever it
 * sits, and fails on the first one that carries language. What does not carry language — a test id,
 * a CSS value, an icon name, a command type, a key name for `KeyboardEvent.key` — passes, because
 * nothing about it changes with the locale.
 *
 * "Carries language" is decided the way the copy in this app is written: sentence case. A string with
 * a capitalised word that is not a key name ("Move", "Actions for …", "Full width"), or one that
 * strings words together with an English function word ("position 2 of 5"), is copy.
 */
const APP = `${process.cwd()}/apps/gm-react/src`;
const FILES = ['app/canvas/FlowBoard.tsx', 'app/canvas/TileActionMenu.tsx'];

/** `KeyboardEvent.key` values and modifier names: protocol tokens, never shown as text. */
const KEY_NAMES = new Set([
	'Enter',
	'Escape',
	'Tab',
	'Delete',
	'Backspace',
	'Home',
	'End',
	'PageUp',
	'PageDown',
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'Shift',
	'Control',
	'Ctrl',
	'Alt',
	'Meta',
]);

/** Words that only ever join other words in prose; no CSS value, selector or token uses them. */
const FUNCTION_WORDS = new Set([
	'a',
	'an',
	'and',
	'at',
	'by',
	'for',
	'from',
	'in',
	'into',
	'is',
	'no',
	'not',
	'of',
	'on',
	'or',
	'the',
	'then',
	'this',
	'to',
	'with',
	'your',
]);

/** Does this text — a template's substitutions already blanked out — carry language? */
function carriesLanguage(text: string): boolean {
	const tokens = text
		.split(/[\s+]+/)
		.map((token) => token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
		.filter(Boolean);
	if (tokens.length === 0) return false;
	if (tokens.some((token) => /^\p{Lu}\p{Ll}/u.test(token) && !KEY_NAMES.has(token))) return true;
	const words = tokens.filter((token) => /^\p{L}+$/u.test(token));
	return words.length >= 2 && words.some((word) => FUNCTION_WORDS.has(word.toLowerCase()));
}

interface Literal {
	line: number;
	text: string;
}

/** Every literal in the file outside its import and export specifiers, with its line. */
function literalsOf(path: string): Literal[] {
	const source = ts.createSourceFile(
		path,
		readFileSync(path, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const found: Literal[] = [];
	const at = (node: ts.Node, text: string) =>
		found.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text });
	const visit = (node: ts.Node) => {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) at(node, node.text);
		else if (ts.isTemplateExpression(node))
			at(node, [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' '));
		else if (ts.isJsxText(node) && node.text.trim()) at(node, node.text);
		ts.forEachChild(node, visit);
	};
	visit(source);
	return found;
}

describe('the flow screen and the tile menus read every word from the catalog', () => {
	it.each(FILES)('%s has no string literal that carries language', (file) => {
		const copy = literalsOf(`${APP}/${file}`)
			.filter((literal) => carriesLanguage(literal.text))
			.map((literal) => `${file}:${literal.line} ${JSON.stringify(literal.text)}`);
		expect(copy).toEqual([]);
	});

	// Freeze the reviewed non-copy literals too: casing and English heuristics alone would let
	// new lowercase labels, all-caps copy or non-English copy slip through. Any new literal must
	// therefore be reviewed here, including technical tokens; never update this snapshot to
	// accommodate display copy (that belongs in the catalog).
	it('adds no unreviewed string literals', () => {
		const literals = Object.fromEntries(
			FILES.map((file) => [
				file,
				[...new Set(literalsOf(`${APP}/${file}`).map(({ text }) => text))].sort(),
			]),
		);
		expect(literals).toMatchInlineSnapshot(`
			{
			  "app/canvas/FlowBoard.tsx": [
			    "",
			    " ",
			    "   ",
			    "0 0 auto",
			    "1px solid  ",
			    "2px dashed  ",
			    "2px solid  ",
			    "4px solid  ",
			    "600 var(--text-2xs)  ",
			    "700 var(--text-lg)  ",
			    "700 var(--text-sm)  ",
			    "ArrowDown",
			    "ArrowLeft",
			    "ArrowRight",
			    "ArrowUp",
			    "Backspace",
			    "Delete",
			    "End",
			    "Enter",
			    "Escape",
			    "Home",
			    "[data-flow-index]",
			    "absolute",
			    "after",
			    "auto",
			    "available",
			    "bare",
			    "before",
			    "boardCanvas.flow.emptyHint",
			    "boardCanvas.flow.emptyTitle",
			    "boardCanvas.flow.hint",
			    "boardCanvas.flow.position",
			    "boardCanvas.flow.redo",
			    "boardCanvas.flow.redoNamed",
			    "boardCanvas.flow.spanNotice",
			    "boardCanvas.flow.tile",
			    "boardCanvas.flow.tileAt",
			    "boardCanvas.flow.toolbar",
			    "boardCanvas.flow.undo",
			    "boardCanvas.flow.undoNamed",
			    "bottom",
			    "calc(-1 *  )",
			    "calc(-1 *  ) calc(-1 *  )  ",
			    "center",
			    "column",
			    "data-flow-index",
			    "drag",
			    "ellipsis",
			    "flex",
			    "flow",
			    "flow-announcement",
			    "flow-drag- ",
			    "flow-drop-indicator",
			    "flow-grid",
			    "flow-history-controls",
			    "grab",
			    "grid",
			    "group",
			    "hidden",
			    "hover",
			    "inline-flex",
			    "input, textarea, select, [contenteditable="true"]",
			    "left",
			    "minmax(0, auto)",
			    "none",
			    "nowrap",
			    "pan-y",
			    "pointercancel",
			    "pointermove",
			    "pointerup",
			    "polite",
			    "redo",
			    "relative",
			    "repeat( , minmax(0, 1fr))",
			    "rest",
			    "right",
			    "scene-board-flow",
			    "status",
			    "sticky",
			    "stretch",
			    "tile-accent-rail",
			    "toolbar",
			    "top",
			    "touch",
			    "true",
			    "undo",
			    "uppercase",
			    "var( )",
			    "var(--color-status-warning-text)",
			    "var(--text-2xs)  ",
			    "var(--text-sm)  ",
			    "var(--text-xs)  ",
			    "var(--tracking-wide)",
			    "visibility-badge",
			    "warning",
			    "widget",
			    "widget- ",
			    "xl",
			    "y",
			    "z",
			  ],
			  "app/canvas/TileActionMenu.tsx": [
			    " ",
			    "  ",
			    "#/atlas?map=",
			    "#/characters/",
			    "#/knowledge/",
			    "#/scene/",
			    "100%",
			    "1px solid  ",
			    "ArrowDown",
			    "ArrowLeft",
			    "ArrowRight",
			    "ArrowUp",
			    "ArrowUp ArrowDown ArrowLeft ArrowRight",
			    "Delete",
			    "End",
			    "Enter",
			    "Escape",
			    "Home",
			    "Shift+ArrowRight Shift+ArrowDown",
			    "Tab",
			    "[aria-checked="true"]",
			    "[data-submenu-parent]",
			    "[data-testid="tile-actions-menu"]",
			    "[data-testid="widget- "]",
			    "[role^="menuitem"]",
			    "absolute",
			    "accepted",
			    "arrow-down",
			    "arrow-left",
			    "arrow-right",
			    "arrow-up",
			    "auto",
			    "bind",
			    "block",
			    "boardCanvas.flow.moveBack",
			    "boardCanvas.flow.moveForward",
			    "boardCanvas.flow.moveToEnd",
			    "boardCanvas.flow.moveToStart",
			    "boardCanvas.flow.width",
			    "boardCanvas.tileMenu.actions",
			    "boardCanvas.tileMenu.bind",
			    "boardCanvas.tileMenu.configure",
			    "boardCanvas.tileMenu.duplicate",
			    "boardCanvas.tileMenu.duplicated",
			    "boardCanvas.tileMenu.edit",
			    "boardCanvas.tileMenu.move",
			    "boardCanvas.tileMenu.noSettings",
			    "boardCanvas.tileMenu.noSettingsEditable",
			    "boardCanvas.tileMenu.noSettingsReason",
			    "boardCanvas.tileMenu.openCharacter",
			    "boardCanvas.tileMenu.openMap",
			    "boardCanvas.tileMenu.openNote",
			    "boardCanvas.tileMenu.remove",
			    "boardCanvas.tileMenu.resize",
			    "boardCanvas.tileMenu.resizeLocked",
			    "boardCanvas.tileMenu.visibility",
			    "boardCanvas.tileMenu.visibility.dmOnly",
			    "boardCanvas.tileMenu.visibility.players",
			    "boardCanvas.tileMenu.visibility.shared",
			    "button",
			    "calc(100dvh -  px)",
			    "center",
			    "check",
			    "chevron-right",
			    "configure",
			    "default",
			    "dm-only",
			    "duplicate",
			    "edit",
			    "enter",
			    "eye",
			    "fixed",
			    "flex",
			    "flex-start",
			    "flow-tile-actions",
			    "flow-tile-menu",
			    "ghost",
			    "group",
			    "keydown",
			    "left",
			    "link",
			    "menu",
			    "menuitem",
			    "menuitemradio",
			    "more",
			    "move",
			    "none",
			    "normal",
			    "outline",
			    "player-visible",
			    "pointer",
			    "pointercancel",
			    "scene.configure-widget",
			    "scene.duplicate-widget",
			    "scroll",
			    "separator",
			    "settings-gear",
			    "shared",
			    "sm",
			    "start",
			    "tile-actions-menu",
			    "tile-actions-trigger",
			    "top right",
			    "touch",
			    "translateX( px) scale( )",
			    "transparent",
			    "trash",
			    "var(--color-border)",
			    "var(--density-touch-target, 1.75rem)",
			    "var(--space-1) 0",
			    "var(--space-4)",
			    "var(--text-sm)  ",
			    "var(--text-xs)/1.4  ",
			    "var(--z-overlay)",
			    "visibility-players",
			    "visibility-shared",
			    "zoom-fit",
			  ],
			}
		`);
	});

	it('still reads the menus at all (the scan is not vacuous)', () => {
		for (const file of FILES) expect(literalsOf(`${APP}/${file}`).length).toBeGreaterThan(50);
	});

	it('recognises the copy the two files used to ship', () => {
		for (const text of [
			'Move',
			'Bind…',
			'No settings',
			'Actions for  ',
			'Full width',
			'An empty screen',
			'Layout history',
			'position  of  ',
			' , position  of  ',
			'  of  columns wide',
			'Press Edit layout, then Add to place a widget.',
			'This widget declares nothing to set.',
		])
			expect(carriesLanguage(text), text).toBe(true);
	});

	it('lets through what does not change with the locale', () => {
		for (const text of [
			'ArrowUp ArrowDown ArrowLeft ArrowRight',
			'Shift+ArrowRight Shift+ArrowDown',
			'Escape',
			'1px solid  ',
			'top right',
			'calc(100dvh -  px)',
			'input, textarea, select, [contenteditable="true"]',
			'scene.duplicate-widget',
			'menuitemradio',
			'visibility-players',
			'var(--text-xs)/1.4  ',
			'#/atlas?map=',
		])
			expect(carriesLanguage(text), text).toBe(false);
	});
});
