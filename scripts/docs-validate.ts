import fs from 'node:fs/promises';
import path from 'node:path';
import { validateWorkpack } from './workpack.js';
import {
	auditCountTable,
	auditDefectCounts,
	auditStructureInventory,
} from './lib/generated-doc-audit.js';

interface ValidationIssue {
	file: string;
	line: number;
	message: string;
}

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, 'docs');

// PLAT-015 generated-from-structured-sources audits.
const requirementsDocPath = path.join(docsRoot, 'remake-review', '10-requirements.md');
const requirementsDir = path.join(docsRoot, 'remake-review', 'requirements');
const defectRegisterPath = path.join(docsRoot, 'remake-review', '07-known-defects.md');
const structureDocPath = path.join(docsRoot, 'reference', 'PROJECT_STRUCTURE.md');
// Top-level entries that are generated, tooling, or otherwise intentionally undocumented in the
// structure inventory. A real product directory missing from the inventory still fails closed.
const structureIgnoredTopLevel = new Set([
	'node_modules',
	'build',
	'.svelte-kit',
	'.git',
	'.github',
	'.vscode',
	'.idea',
	'.claude',
	'.agents',
	'.codex',
	'coverage',
	'dist',
	'tmp',
	'test-results',
	'playwright-report',
	'.husky',
]);
const pathPrefixAllowlist = ['.github/', 'apps/', 'packages/', 'docs/', 'tests/', 'scripts/'];
const rootFileAllowlist = new Set([
	'package.json',
	'pnpm-lock.yaml',
	'vitest.config.ts',
	'README.md',
	'CHANGELOG.md',
	'pnpm-workspace.yaml',
]);
const generatedPathPrefixes = ['apps/v2/', 'apps/gm/', 'packages/core/', 'build/', '.svelte-kit/'];
const pathValidatedDocs = [
	'docs/adr/README.md',
	'docs/adr/016-promote-gm-app-and-monorepo-reorg.md',
	'docs/development/V2_AGENTIC_IMPLEMENTATION.md',
	'docs/remake-review/00-vision-brief.md',
	'docs/remake-review/08-glossary.md',
	'docs/remake-review/09-architecture-contracts.md',
	'docs/remake-review/10-requirements.md',
	'docs/remake-review/requirements/',
];

const fileExtensionPattern =
	/\.(md|ts|tsx|js|cjs|mjs|json|yml|yaml|svelte|css|html|txt|png|jpg|jpeg|svg|ico)$/i;

async function collectMarkdownFiles(dir: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await fs.readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const nextPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectMarkdownFiles(nextPath)));
			continue;
		}
		if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
			files.push(nextPath);
		}
	}
	return files;
}

function isLikelyLocalPath(token: string): boolean {
	const normalized = token.trim().replace(/[),.;:]+$/, '');
	if (!normalized) return false;
	if (normalized.startsWith('http://') || normalized.startsWith('https://')) return false;
	if (normalized.startsWith('mailto:') || normalized.startsWith('#')) return false;
	if (normalized.includes('*') || normalized.includes('{') || normalized.includes('}'))
		return false;
	if (normalized.includes(' ')) return false;
	if (normalized.includes('://')) return false;
	if (normalized.startsWith('<') || normalized.endsWith('>')) return false;
	if (normalized.startsWith('/.vault/') || normalized.startsWith('.vault/')) return false;

	if (normalized.startsWith('./') || normalized.startsWith('../')) {
		return normalized.endsWith('/') || fileExtensionPattern.test(normalized);
	}

	const repoRelative = normalized.startsWith('/') ? normalized.slice(1) : normalized;
	if (!repoRelative.includes('/')) {
		return rootFileAllowlist.has(repoRelative);
	}
	if (!pathPrefixAllowlist.some((prefix) => repoRelative.startsWith(prefix))) {
		return false;
	}
	return repoRelative.endsWith('/') || fileExtensionPattern.test(repoRelative);
}

function isGeneratedPathReference(token: string): boolean {
	const normalized = token
		.trim()
		.replace(/[),.;:]+$/, '')
		.replace(/\\/g, '/')
		.split('#')[0]
		.split('?')[0];
	if (!normalized) return false;
	const repoRelative = normalized.startsWith('/') ? normalized.slice(1) : normalized;
	return generatedPathPrefixes.some((prefix) => repoRelative.startsWith(prefix));
}

function resolveCandidatePath(docPath: string, token: string): string {
	const normalized = token
		.trim()
		.replace(/[),.;:]+$/, '')
		.replace(/\\/g, '/')
		.split('#')[0]
		.split('?')[0];

	if (normalized.startsWith('./') || normalized.startsWith('../')) {
		return path.resolve(path.dirname(docPath), normalized);
	}
	if (normalized.startsWith('/')) {
		return path.resolve(repoRoot, `.${normalized}`);
	}
	return path.resolve(repoRoot, normalized);
}

function shouldValidatePathReferences(markdownFile: string): boolean {
	const repoRelative = path.relative(repoRoot, markdownFile).replace(/\\/g, '/');
	return pathValidatedDocs.some((entry) =>
		entry.endsWith('/') ? repoRelative.startsWith(entry) : repoRelative === entry,
	);
}

function extractPathCandidates(markdown: string): Array<{ token: string; line: number }> {
	const results: Array<{ token: string; line: number }> = [];
	const lines = markdown.split(/\r?\n/);
	let inTodoBlock = false;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index]!;
		if (line.trim() === '') {
			inTodoBlock = false;
		}
		if (isTodoAnnotationLine(line)) {
			inTodoBlock = true;
		}
		if (inTodoBlock) {
			continue;
		}

		const codeSpanMatches = line.matchAll(/`([^`\n]+)`/g);
		for (const match of codeSpanMatches) {
			results.push({ token: match[1] ?? '', line: index + 1 });
		}

		const linkMatches = line.matchAll(/\[[^\]]*]\(([^)]+)\)/g);
		for (const match of linkMatches) {
			results.push({ token: match[1] ?? '', line: index + 1 });
		}
	}

	return results;
}

function isTodoAnnotationLine(line: string): boolean {
	if (line.includes('TODO(APP):')) return true;
	return /^\s*-\s*\[[ xX]\]\s*`TODO\(APP\)`/.test(line);
}

function validateTodoFields(markdown: string, filePath: string): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const lines = markdown.split(/\r?\n/);

	for (let index = 0; index < lines.length; index += 1) {
		if (!isTodoAnnotationLine(lines[index] ?? '')) continue;

		let blockEnd = index;
		while (blockEnd + 1 < lines.length && lines[blockEnd + 1]?.trim() !== '') {
			blockEnd += 1;
		}
		const block = lines.slice(index, blockEnd + 1).join('\n');

		const hasReason = /reason\s*:|current issue\s*:|context\s*:/i.test(block);
		const hasTarget = /targets?\s*:|target files?\s*:/i.test(block);
		const hasRisk = /risk\s*:|impact\s*:/i.test(block);

		if (!hasReason || !hasTarget || !hasRisk) {
			const missing = [
				!hasReason ? 'reason:' : null,
				!hasTarget ? 'target:' : null,
				!hasRisk ? 'risk:' : null,
			]
				.filter(Boolean)
				.join(', ');
			issues.push({
				file: path.relative(repoRoot, filePath).replace(/\\/g, '/'),
				line: index + 1,
				message: `TODO(APP) annotation is missing required field(s): ${missing}`,
			});
		}
	}

	return issues;
}

/**
 * PLAT-015: recompute high-churn markdown registers from structured sources and report drift so
 * docs validation fails closed. Covers the requirement Count Audit table (AC3), the defect-count
 * summary (AC1), and the top-level structure inventory (AC2).
 */
async function validateGeneratedDocAudits(): Promise<ValidationIssue[]> {
	const issues: ValidationIssue[] = [];

	// Count Audit: recompute per-domain counts from requirement headings.
	const requirementsMarkdown = await fs.readFile(requirementsDocPath, 'utf-8');
	const requirementEntries = await fs.readdir(requirementsDir, { withFileTypes: true });
	const requirementFiles = await Promise.all(
		requirementEntries
			.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
			.map(async (entry) => ({
				content: await fs.readFile(path.join(requirementsDir, entry.name), 'utf-8'),
			})),
	);
	issues.push(
		...auditCountTable(
			'docs/remake-review/10-requirements.md',
			requirementsMarkdown,
			requirementFiles,
		),
	);

	// Defect-count summary: recompute P1/P2/P3 + total from the register rows.
	const defectMarkdown = await fs.readFile(defectRegisterPath, 'utf-8');
	issues.push(...auditDefectCounts('docs/remake-review/07-known-defects.md', defectMarkdown));

	// Structure inventory: compare documented top-level dirs against the real repo top level.
	const structureMarkdown = await fs.readFile(structureDocPath, 'utf-8');
	const topLevelEntries = await fs.readdir(repoRoot, { withFileTypes: true });
	const actualTopLevelDirs = new Set(
		topLevelEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
	);
	issues.push(
		...auditStructureInventory(
			'docs/reference/PROJECT_STRUCTURE.md',
			structureMarkdown,
			actualTopLevelDirs,
			{ ignore: structureIgnoredTopLevel },
		),
	);

	return issues;
}

async function validateDocs(): Promise<ValidationIssue[]> {
	const issues: ValidationIssue[] = [];
	const markdownFiles = await collectMarkdownFiles(docsRoot);

	for (const markdownFile of markdownFiles) {
		const content = await fs.readFile(markdownFile, 'utf-8');
		issues.push(...validateTodoFields(content, markdownFile));

		// Historical/audit docs intentionally preserve old path references. The V2 control-plane
		// docs remain path-validated so implementation agents do not follow stale files.
		if (!shouldValidatePathReferences(markdownFile)) {
			continue;
		}

		const candidates = extractPathCandidates(content);
		for (const candidate of candidates) {
			if (!isLikelyLocalPath(candidate.token)) continue;
			if (isGeneratedPathReference(candidate.token)) continue;
			const resolvedPath = resolveCandidatePath(markdownFile, candidate.token);
			try {
				await fs.access(resolvedPath);
			} catch {
				issues.push({
					file: path.relative(repoRoot, markdownFile).replace(/\\/g, '/'),
					line: candidate.line,
					message: `Referenced path does not exist: ${candidate.token}`,
				});
			}
		}
	}

	issues.push(...(await validateGeneratedDocAudits()));

	let hasV2Workpack = false;
	try {
		await fs.access(path.join(docsRoot, 'planning', 'v2', 'requirements-index.yaml'));
		hasV2Workpack = true;
	} catch {
		// The v2 workpack is optional until generated. Once present, docs validation enforces it.
	}

	if (hasV2Workpack) {
		const workpackIssues = await validateWorkpack(repoRoot);
		issues.push(
			...workpackIssues.map((issue) => ({
				file: issue.file,
				line: 1,
				message: issue.message,
			})),
		);
	}

	return issues;
}

async function run(): Promise<void> {
	const issues = await validateDocs();
	if (issues.length > 0) {
		console.error(`docs validation failed with ${issues.length} issue(s):`);
		for (const issue of issues) {
			console.error(`- ${issue.file}:${issue.line} ${issue.message}`);
		}
		process.exit(1);
	}
	console.log('docs validation passed');
}

run().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
