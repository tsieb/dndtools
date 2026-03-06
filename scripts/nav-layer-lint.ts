import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

interface LintIssue {
	file: string;
	line: number;
	message: string;
}

const ROOT = process.cwd();
const TARGET_DIR = join(ROOT, 'src');
const NAV_TAG_RE = /<nav\b[\s\S]*?>/gi;
const ROLE_NAV_RE = /<(?!nav\b)[^>]*\brole\s*=\s*["']navigation["'][^>]*>/gi;
const ARIA_LABEL_RE = /\baria-label\s*=\s*(?:"([^"]*)"|'([^']*)'|{`([^`]*)`})/i;
const LAYER_LABEL_RE = /\b(global|local|contextual)\s+navigation\b/i;

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
		if (text.charCodeAt(i) === 10) {
			line += 1;
		}
	}
	return line;
}

function lintTag(tag: string, file: string, source: string, startIndex: number): LintIssue | null {
	const line = toLineNumber(source, startIndex);
	const aria = tag.match(ARIA_LABEL_RE);
	if (!aria) {
		return {
			file,
			line,
			message:
				'Navigation element is missing aria-label. Include layer prefix: Global navigation, Local navigation, or Contextual navigation.',
		};
	}

	const label = (aria[1] ?? aria[2] ?? aria[3] ?? '').trim();
	if (!LAYER_LABEL_RE.test(label)) {
		return {
			file,
			line,
			message:
				'Navigation aria-label must include layer prefix: Global navigation, Local navigation, or Contextual navigation.',
		};
	}

	return null;
}

function lintFile(filePath: string): LintIssue[] {
	const source = readFileSync(filePath, 'utf8');
	const issues: LintIssue[] = [];
	const rel = relative(ROOT, filePath).replace(/\\/g, '/');

	for (const match of source.matchAll(NAV_TAG_RE)) {
		const tag = match[0];
		const index = match.index ?? 0;
		const issue = lintTag(tag, rel, source, index);
		if (issue) issues.push(issue);
	}

	for (const match of source.matchAll(ROLE_NAV_RE)) {
		const tag = match[0];
		const index = match.index ?? 0;
		const issue = lintTag(tag, rel, source, index);
		if (issue) issues.push(issue);
	}

	return issues;
}

function main(): void {
	if (!statSync(TARGET_DIR, { throwIfNoEntry: false })?.isDirectory()) {
		console.error('Navigation lint failed: src directory not found.');
		process.exit(1);
	}

	const files = collectSvelteFiles(TARGET_DIR);
	const issues = files.flatMap(lintFile);

	if (issues.length === 0) {
		console.log(`Navigation lint passed (${files.length} Svelte files checked).`);
		return;
	}

	console.error(
		`Navigation lint failed (${issues.length} issue${issues.length === 1 ? '' : 's'}).`,
	);
	for (const issue of issues) {
		console.error(`- ${issue.file}:${issue.line} ${issue.message}`);
	}
	process.exit(1);
}

main();
