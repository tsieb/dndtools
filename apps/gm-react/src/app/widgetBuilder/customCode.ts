import type { WidgetPackageAsset } from '@dndtools/core';

/**
 * The custom HTML/JS half of the builder's Advanced step (RC-WID-2.5).
 *
 * A `custom-html-js` package is three files, not one blob: the markup that goes in the frame's body,
 * a stylesheet, and a module script. The author edits those three directly, and this module is the
 * only place that knows how they become package ASSETS — the entrypoint document that
 * `assembleWidgetDocument` (RC-WID-1.3) scans for its `<link>` and `<script>`, and the two files it
 * points at.
 *
 * The wrapper document is written by the host, not by the author, for one reason: the assembler
 * finds a package's stylesheet and script by reading the entrypoint's tags, so an author who forgot
 * a `<script src>` would ship a widget that installs cleanly and then does nothing. Generating the
 * head means the three editors are always wired to each other. The author's markup is placed in the
 * body verbatim, so reading an installed package back into the builder returns exactly what was
 * typed.
 *
 * Everything here is pure string work over plain data, so the round trip and the formatter are unit
 * tested without a DOM (`customCode.test.ts`).
 */

export const CUSTOM_ENTRY_PATH = 'index.html';
export const CUSTOM_STYLE_PATH = 'styles.css';
export const CUSTOM_SCRIPT_PATH = 'main.js';

/** Which of the three editors a piece of code belongs to. */
export type CustomCodePart = 'html' | 'css' | 'js';

export interface CustomCodeSource {
	html: string;
	css: string;
	js: string;
}

/**
 * What the editors are filled with the first time a draft turns on custom code.
 *
 * It is a WORKING widget rather than a comment: it draws the widget's title and its first data
 * query's row count through `window.dndtoolsWidget.onRender`, so the preview shows something real
 * the moment the runtime is switched, and the author edits a running example instead of a blank box.
 */
export const CUSTOM_CODE_SCAFFOLD: CustomCodeSource = {
	html: [
		'<section class="card">',
		'  <h1 data-title>Widget</h1>',
		'  <p data-summary>Waiting for the host.</p>',
		'</section>',
	].join('\n'),
	css: [
		'.card {',
		'  box-sizing: border-box;',
		'  padding: 12px;',
		'  color: var(--widget-text, #e8e2d8);',
		'  font: 13px/1.5 system-ui, sans-serif;',
		'}',
		'.card h1 { margin: 0 0 4px; font-size: 14px; }',
		'.card p { margin: 0; opacity: 0.8; }',
	].join('\n'),
	js: [
		'// The host hands the widget its actor-filtered props. There is no other way in.',
		'window.dndtoolsWidget.onRender(function (props) {',
		'  var title = document.querySelector("[data-title]");',
		'  var summary = document.querySelector("[data-summary]");',
		'  if (title) title.textContent = props.widget.title;',
		'  var first = (props.queries || [])[0];',
		'  if (summary) {',
		'    summary.textContent = first ? first.label + ": " + first.rows.length : "No data queries yet.";',
		'  }',
		'});',
	].join('\n'),
};

const DOCUMENT_HEAD = [
	'<!doctype html>',
	'<html lang="en">',
	'<head>',
	'<meta charset="utf-8" />',
	'<meta name="viewport" content="width=device-width, initial-scale=1" />',
	`<link rel="stylesheet" href="./${CUSTOM_STYLE_PATH}" />`,
	'</head>',
	'<body>',
].join('\n');

const DOCUMENT_TAIL = [
	`<script src="./${CUSTOM_SCRIPT_PATH}"></script>`,
	'</body>',
	'</html>',
].join('\n');

/** The entrypoint asset: the author's markup inside a head the builder wires up. */
export function customEntrypointDocument(html: string): string {
	return `${DOCUMENT_HEAD}\n${html}\n${DOCUMENT_TAIL}\n`;
}

/** The author's markup back out of an entrypoint document this module wrote. */
export function readEntrypointBody(document: string): string {
	const start = document.indexOf(`${DOCUMENT_HEAD}\n`);
	const end = document.indexOf(`\n${DOCUMENT_TAIL}`);
	if (start !== 0 || end < 0) {
		// Somebody else's document (an imported package, a hand-edited export): show it whole rather
		// than guessing at a body, so nothing an author would have to retype is silently dropped.
		return document;
	}
	return document.slice(DOCUMENT_HEAD.length + 1, end);
}

/** The three files a `custom-html-js` package ships, in entrypoint-first order. */
export function customCodeAssets(source: CustomCodeSource): WidgetPackageAsset[] {
	return [
		{
			path: CUSTOM_ENTRY_PATH,
			kind: 'html',
			entrypoint: true,
			content: customEntrypointDocument(source.html),
			contentEncoding: 'utf-8',
		},
		{
			path: CUSTOM_STYLE_PATH,
			kind: 'css',
			content: source.css,
			contentEncoding: 'utf-8',
		},
		{
			path: CUSTOM_SCRIPT_PATH,
			kind: 'javascript',
			content: source.js,
			contentEncoding: 'utf-8',
		},
	];
}

function assetContent(assets: readonly WidgetPackageAsset[], path: string): string {
	const asset = assets.find((entry) => entry.path === path);
	if (!asset || asset.contentEncoding === 'base64') return '';
	return asset.content ?? '';
}

/** Read an installed package's assets back into the three editors. */
export function readCustomCode(
	assets: readonly WidgetPackageAsset[],
	entrypointPath: string | undefined,
): CustomCodeSource {
	const entrypoint = assetContent(assets, entrypointPath ?? CUSTOM_ENTRY_PATH);
	return {
		html: entrypoint === '' ? '' : readEntrypointBody(entrypoint),
		css: assetContent(assets, CUSTOM_STYLE_PATH),
		js: assetContent(assets, CUSTOM_SCRIPT_PATH),
	};
}

// --- the Format button ------------------------------------------------------------------------

const INDENT = '  ';
const VOID_ELEMENTS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
]);

/**
 * Re-indent, nothing more.
 *
 * "Format" here trims trailing whitespace, drops runs of blank lines and lays each line out at its
 * nesting depth. It deliberately does NOT reflow, rewrite or parse: a formatter that rearranged an
 * author's code would need a real parser to be safe, and shipping a half-parser that mangles a
 * template literal is worse than shipping an honest indenter. The button's help text says exactly
 * this, so nobody presses it expecting Prettier.
 */
export function formatCode(part: CustomCodePart, source: string): string {
	const lines = source.replace(/\r\n?/g, '\n').split('\n');
	const out: string[] = [];
	let depth = 0;
	let blanks = 0;
	for (const raw of lines) {
		const line = raw.trim();
		if (line === '') {
			// One blank line survives between blocks; a run of them collapses.
			if (out.length > 0 && blanks === 0) out.push('');
			blanks += 1;
			continue;
		}
		blanks = 0;
		const shift = part === 'html' ? htmlShift(line) : braceShift(line);
		depth = Math.max(0, depth + shift.before);
		out.push(depth > 0 ? `${INDENT.repeat(depth)}${line}` : line);
		depth = Math.max(0, depth + shift.after);
	}
	while (out.length > 0 && out[out.length - 1] === '') out.pop();
	return out.join('\n');
}

/** How a brace-delimited line moves the depth: closers at its head dedent it, its net opens indent what follows. */
function braceShift(line: string): { before: number; after: number } {
	let before = 0;
	for (const character of line) {
		if (character === '}' || character === ')' || character === ']') before -= 1;
		else break;
	}
	let net = 0;
	for (const character of line) {
		if (character === '{' || character === '(' || character === '[') net += 1;
		if (character === '}' || character === ')' || character === ']') net -= 1;
	}
	return { before, after: net - before };
}

const HTML_TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*?)?\/?>/g;

/** The same, over tags: an open tag indents what follows, a close tag dedents its own line. */
function htmlShift(line: string): { before: number; after: number } {
	const before = /^<\//.test(line) ? -1 : 0;
	let net = 0;
	for (const match of line.matchAll(HTML_TAG)) {
		const tag = match[0];
		const name = (match[1] ?? '').toLowerCase();
		if (tag.startsWith('</')) net -= 1;
		else if (tag.endsWith('/>') || VOID_ELEMENTS.has(name)) continue;
		else net += 1;
	}
	return { before, after: net - before };
}
