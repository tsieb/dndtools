import fs from 'node:fs';
import path from 'node:path';

/**
 * RC-DOC-2.2: the docs link and coupling checker, run by `pnpm gates` (scripts/quality-gates.ts).
 * It fails when:
 *
 *   - a relative link in a `docs/**` markdown file (`[text](path)`, `![alt](path)`, or a
 *     `[label]: path` definition) points at a file or directory that does not exist;
 *   - a file under `docs/` cannot be reached from `docs/README.md` by following relative links. A
 *     link to a directory reaches everything beneath it, which is how the vendored
 *     `docs/design-package/` and the dispatcher's `docs/development/run-journals/` are covered;
 *   - a string that other tooling reads out of the docs is gone ({@link DOCS_COUPLINGS});
 *   - an ADR's own `- Status:` line differs from its Status cell in `docs/adr/README.md`, or an ADR
 *     file and the index disagree about which ADRs exist.
 *
 * Fenced code blocks and inline code spans are prose, not links, and are skipped.
 */

export type DocsProblemKind =
	| 'broken-link'
	| 'unreachable-doc'
	| 'missing-coupling-string'
	| 'adr-index-drift';

export interface DocsProblem {
	/** Repo-relative, forward slashes. */
	readonly file: string;
	readonly line?: number;
	readonly kind: DocsProblemKind;
	readonly message: string;
}

export interface DocsAuditResult {
	/** Files under `docs/`, all of which were reachable when `problems` is empty. */
	readonly files: number;
	/** Relative links checked across every `docs/**` markdown file. */
	readonly links: number;
	readonly problems: DocsProblem[];
}

export interface DocsCoupling {
	readonly file: string;
	readonly needle: string;
	/** Who reads the string, so the failure message says what breaks. */
	readonly consumer: string;
}

export const DOCS_COUPLINGS: readonly DocsCoupling[] = [
	...['test:critical', 'test:cloud', 'test:app', 'test:tooling'].map(
		(script): DocsCoupling => ({
			file: 'docs/development/TESTING.md',
			needle: `\`${script}\``,
			consumer: 'tests/unit/ci-guardrails.test.ts',
		}),
	),
	...['export', 'import'].map(
		(verb): DocsCoupling => ({
			file: 'docs/development/LOCALIZATION.md',
			needle: `i18n-catalog.ts ${verb}`,
			consumer: 'tests/unit/i18n-catalog.test.ts',
		}),
	),
];

const DOCS_DIR = 'docs';
const DOCS_INDEX = 'docs/README.md';
const ADR_DIR = 'docs/adr';
const ADR_INDEX = 'docs/adr/README.md';

const INLINE_LINK = /\]\(\s*(<[^>\n]*>|[^)\s]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g;
const LINK_DEFINITION = /^ {0,3}\[[^\]\n]+\]:[ \t]*(<[^>\n]*>|\S+)/gm;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const ADR_FILE = /^(\d{3})-.+\.md$/;
// Prettier wraps a long list item onto indented continuation lines.
const ADR_STATUS_LINE = /^- Status:[ \t]*(.+(?:\n {2,}(?!- ).+)*)/m;
const ADR_INDEX_ROW = /^\|\s*\[(\d{3})\]\(([^)]+)\)\s*\|\s*([^|]*?)\s*\|/gm;

interface DocLink {
	readonly target: string;
	readonly line: number;
}

function toPosix(relative: string): string {
	return relative.split(path.sep).join('/');
}

function walkFiles(dir: string, out: string[] = []): string[] {
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith('.')) continue;
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) walkFiles(fullPath, out);
		else if (entry.isFile()) out.push(fullPath);
	}
	return out;
}

/** Offset of the backtick run that closes a code span opened by `run` backticks, or -1. */
function findClosingRun(text: string, from: number, run: number): number {
	let index = from;
	while (index < text.length) {
		const char = text[index];
		if (char === '\n' && /^\n[ \t]*(\n|$)/.test(text.slice(index, index + 64))) return -1;
		if (char === '`') {
			let length = 0;
			while (text[index + length] === '`') length++;
			if (length === run) return index;
			index += length;
			continue;
		}
		index++;
	}
	return -1;
}

/**
 * Blank out fenced code blocks and inline code spans, keeping every newline and every other
 * character's offset, so a match in the result maps to the same line of the source.
 */
export function maskCode(text: string): string {
	let fence: string | null = null;
	const lines = text.split('\n').map((line) => {
		const match = FENCE.exec(line);
		if (fence === null) {
			if (!match) return line;
			fence = match[1]!;
			return ' '.repeat(line.length);
		}
		if (
			match &&
			match[1]![0] === fence[0] &&
			match[1]!.length >= fence.length &&
			!match[2]!.trim()
		) {
			fence = null;
		}
		return ' '.repeat(line.length);
	});
	const unfenced = lines.join('\n');

	const chunks: string[] = [];
	let cursor = 0;
	let index = 0;
	while (index < unfenced.length) {
		if (unfenced[index] !== '`') {
			index++;
			continue;
		}
		let run = 0;
		while (unfenced[index + run] === '`') run++;
		const close = findClosingRun(unfenced, index + run, run);
		if (close === -1) {
			index += run;
			continue;
		}
		chunks.push(
			unfenced.slice(cursor, index),
			unfenced.slice(index, close + run).replace(/[^\n]/g, ' '),
		);
		index = close + run;
		cursor = index;
	}
	chunks.push(unfenced.slice(cursor));
	return chunks.join('');
}

function lineStarts(text: string): number[] {
	const starts = [0];
	for (let index = 0; index < text.length; index++) {
		if (text[index] === '\n') starts.push(index + 1);
	}
	return starts;
}

function lineOf(starts: number[], offset: number): number {
	let low = 0;
	let high = starts.length - 1;
	while (low < high) {
		const mid = (low + high + 1) >> 1;
		if (starts[mid]! <= offset) low = mid;
		else high = mid - 1;
	}
	return low + 1;
}

/** Every relative link in a markdown file, in source order, with URLs and pure anchors dropped. */
export function extractRelativeLinks(markdown: string): DocLink[] {
	const masked = maskCode(markdown);
	const starts = lineStarts(masked);
	const links: DocLink[] = [];
	for (const pattern of [INLINE_LINK, LINK_DEFINITION]) {
		for (const match of masked.matchAll(pattern)) {
			let target = match[1]!;
			if (target.startsWith('<')) target = target.slice(1, -1);
			if (URL_SCHEME.test(target) || target.startsWith('#')) continue;
			target = target.split('#')[0]!.split('?')[0]!;
			if (!target) continue;
			try {
				target = decodeURIComponent(target);
			} catch {
				// A malformed escape stays as written; it will simply fail to resolve.
			}
			links.push({ target, line: lineOf(starts, match.index) });
		}
	}
	return links.sort((a, b) => a.line - b.line);
}

function resolveTarget(root: string, fromFile: string, target: string): string {
	return target.startsWith('/')
		? path.join(root, target)
		: path.resolve(path.dirname(fromFile), target);
}

function isInside(dir: string, candidate: string): boolean {
	const relative = path.relative(dir, candidate);
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function plainStatus(status: string): string {
	return status
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();
}

function auditAdrIndex(root: string): DocsProblem[] {
	const indexPath = path.join(root, ADR_INDEX);
	if (!fs.existsSync(indexPath)) {
		return [{ file: ADR_INDEX, kind: 'adr-index-drift', message: 'the ADR index is missing' }];
	}
	const index = fs.readFileSync(indexPath, 'utf-8');
	const indexStarts = lineStarts(index);
	const rows = new Map<string, { target: string; status: string; line: number }>();
	for (const match of index.matchAll(ADR_INDEX_ROW)) {
		rows.set(match[1]!, {
			target: match[2]!,
			status: match[3]!,
			line: lineOf(indexStarts, match.index),
		});
	}

	const problems: DocsProblem[] = [];
	const files = new Map<string, string>();
	for (const name of fs.readdirSync(path.join(root, ADR_DIR)).sort()) {
		const number = ADR_FILE.exec(name)?.[1];
		if (number && number !== '000') files.set(number, name);
	}

	for (const [number, name] of files) {
		const file = `${ADR_DIR}/${name}`;
		const status = ADR_STATUS_LINE.exec(fs.readFileSync(path.join(root, file), 'utf-8'))?.[1];
		const row = rows.get(number);
		if (status === undefined) {
			problems.push({ file, kind: 'adr-index-drift', message: 'has no `- Status:` line' });
		} else if (!row) {
			problems.push({
				file: ADR_INDEX,
				kind: 'adr-index-drift',
				message: `ADR-${number} (${name}) has no row in the index`,
			});
		} else if (plainStatus(status) !== plainStatus(row.status)) {
			problems.push({
				file: ADR_INDEX,
				line: row.line,
				kind: 'adr-index-drift',
				message: `ADR-${number} Status cell "${plainStatus(row.status)}" differs from ${file} "${plainStatus(status)}"`,
			});
		}
	}

	for (const [number, row] of rows) {
		const name = files.get(number);
		if (path.posix.basename(row.target) !== name) {
			problems.push({
				file: ADR_INDEX,
				line: row.line,
				kind: 'adr-index-drift',
				message: name
					? `ADR-${number} row links ${row.target}, but the file is ${name}`
					: `ADR-${number} row has no ADR file in ${ADR_DIR}/`,
			});
		}
	}
	return problems;
}

export function auditDocs(root: string): DocsAuditResult {
	const docsDir = path.join(root, DOCS_DIR);
	const allFiles = walkFiles(docsDir);
	const markdownFiles = allFiles.filter((file) => file.endsWith('.md'));
	const problems: DocsProblem[] = [];
	const linksByFile = new Map<string, string[]>();
	let linkCount = 0;

	for (const file of markdownFiles) {
		const resolved: string[] = [];
		for (const link of extractRelativeLinks(fs.readFileSync(file, 'utf-8'))) {
			linkCount++;
			const target = resolveTarget(root, file, link.target);
			if (fs.existsSync(target)) {
				resolved.push(target);
			} else {
				problems.push({
					file: toPosix(path.relative(root, file)),
					line: link.line,
					kind: 'broken-link',
					message: `${link.target} does not exist`,
				});
			}
		}
		linksByFile.set(file, resolved);
	}

	const indexPath = path.join(root, DOCS_INDEX);
	const reachable = new Set<string>();
	if (fs.existsSync(indexPath)) {
		reachable.add(indexPath);
		const queue = [indexPath];
		while (queue.length > 0) {
			for (const target of linksByFile.get(queue.shift()!) ?? []) {
				if (!isInside(docsDir, target)) continue;
				const reached = fs.statSync(target).isDirectory() ? walkFiles(target) : [target];
				for (const file of reached) {
					if (reachable.has(file)) continue;
					reachable.add(file);
					if (file.endsWith('.md')) queue.push(file);
				}
			}
		}
	} else {
		problems.push({
			file: DOCS_INDEX,
			kind: 'unreachable-doc',
			message: 'the docs index is missing',
		});
	}
	for (const file of allFiles) {
		if (reachable.has(file)) continue;
		problems.push({
			file: toPosix(path.relative(root, file)),
			kind: 'unreachable-doc',
			message: `no chain of relative links from ${DOCS_INDEX} reaches this file`,
		});
	}

	for (const coupling of DOCS_COUPLINGS) {
		const file = path.join(root, coupling.file);
		const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
		if (text === null || !text.includes(coupling.needle)) {
			problems.push({
				file: coupling.file,
				kind: 'missing-coupling-string',
				message: `${text === null ? 'file is missing' : `no longer contains ${coupling.needle}`}; ${coupling.consumer} depends on it`,
			});
		}
	}

	problems.push(...auditAdrIndex(root));
	return { files: allFiles.length, links: linkCount, problems };
}
