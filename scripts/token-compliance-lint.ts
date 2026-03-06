/**
 * Token Compliance Lint (Epic 15.1)
 *
 * Enforces that component files follow the design token architecture:
 * 1. No arbitrary pixel font sizes (text-[Npx]) — use the typography scale
 * 2. No structural `dark:` Tailwind prefix outside of permitted status-color patterns
 *
 * Permitted `dark:` patterns:
 *   - Status/difficulty colours: dark:text-{colour}-{shade}, dark:bg-{colour}-{shade}/opacity
 *     where colour ∈ {emerald, amber, orange, sky, red, rose, blue, green, yellow}
 *   These intentionally use different shades for legibility in each mode.
 *
 * Structural `dark:` violations (BLOCKED):
 *   - dark:bg-surface, dark:bg-tavern-*, dark:text-tavern-*, dark:border-*
 *   - Any dark: prefix on tokens that already have semantic equivalents
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

interface LintIssue {
	file: string;
	line: number;
	message: string;
}

const ROOT = process.cwd();
const TARGET_DIR = join(ROOT, 'src');

// Arbitrary pixel font size: text-[10px], text-[11px], etc.
const ARBITRARY_FONT_SIZE_RE = /text-\[\d+px\]/g;

// Structural dark: violations — dark: followed by surface/tavern/parchment tokens
const STRUCTURAL_DARK_RE =
	/dark:(?:bg|text|border|ring)-(?:surface|bg|tavern|parchment|ink|accent|border|error|warning|success|focus)/g;

// Permitted status-colour dark: patterns (exempted from lint)
const PERMITTED_DARK_COLOURS = new Set([
	'emerald',
	'amber',
	'orange',
	'sky',
	'red',
	'rose',
	'blue',
	'green',
	'yellow',
	'violet',
	'purple',
	'cyan',
	'slate',
]);

const _PERMITTED_DARK_RE = new RegExp(
	`dark:(?:bg|text|border)-(?:${[...PERMITTED_DARK_COLOURS].join('|')})-\\d+`,
	'g',
);

function collectSvelteFiles(dir: string, files: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			collectSvelteFiles(full, files);
			continue;
		}
		if (entry.isFile() && full.endsWith('.svelte')) {
			files.push(full);
		}
	}
	return files;
}

function toLineNumber(text: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index; i += 1) {
		if (text.charCodeAt(i) === 10) line += 1;
	}
	return line;
}

function lintFile(filePath: string): LintIssue[] {
	const source = readFileSync(filePath, 'utf8');
	const issues: LintIssue[] = [];
	const rel = relative(ROOT, filePath).replace(/\\/g, '/');

	// 1. Arbitrary pixel font sizes
	for (const match of source.matchAll(ARBITRARY_FONT_SIZE_RE)) {
		issues.push({
			file: rel,
			line: toLineNumber(source, match.index ?? 0),
			message: `Arbitrary font size '${match[0]}' — use the typography scale (text-2xs, text-xs, text-sm, etc.)`,
		});
	}

	// 2. Structural dark: violations
	for (const match of source.matchAll(STRUCTURAL_DARK_RE)) {
		// Skip if it's in a comment block
		const lineStart = source.lastIndexOf('\n', match.index ?? 0) + 1;
		const lineText = source.slice(lineStart, source.indexOf('\n', match.index ?? 0));
		if (/^\s*(?:\/\/|\/\*|\*|<!--)/.test(lineText)) continue;

		issues.push({
			file: rel,
			line: toLineNumber(source, match.index ?? 0),
			message: `Structural 'dark:' prefix '${match[0]}' — use semantic token (dark mode is handled by html.dark { } in app.css)`,
		});
	}

	return issues;
}

function main(): void {
	if (!statSync(TARGET_DIR, { throwIfNoEntry: false })?.isDirectory()) {
		console.error('Token compliance lint failed: src directory not found.');
		process.exit(1);
	}

	const files = collectSvelteFiles(TARGET_DIR);
	const issues = files.flatMap(lintFile);

	if (issues.length === 0) {
		console.log(`Token compliance lint passed (${files.length} Svelte files checked).`);
		return;
	}

	console.error(
		`Token compliance lint failed (${issues.length} issue${issues.length === 1 ? '' : 's'}).`,
	);
	for (const issue of issues) {
		console.error(`  ${issue.file}:${issue.line}  ${issue.message}`);
	}
	process.exit(1);
}

main();
