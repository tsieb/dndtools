import fs from 'node:fs';
import path from 'node:path';

const IMPORT_STATEMENT_REGEX =
	/\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_REGEX = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const SOURCE_EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs', '.svelte', '.svelte.ts'];
const IGNORED_DIRECTORIES = new Set([
	'.svelte-kit',
	'build',
	'coverage',
	'dist',
	'node_modules',
	'playwright-report',
	'test-results',
]);

export interface CycleResult {
	directory: string;
	cycles: string[][];
}

function normalizePath(filePath: string): string {
	return filePath.replace(/\\/g, '/');
}

function isSourceFile(filePath: string): boolean {
	if (filePath.endsWith('.d.ts')) return false;
	return SOURCE_EXTENSIONS.some((extension) => filePath.endsWith(extension));
}

function listFiles(repoRoot: string, relativeDir: string): string[] {
	const absoluteDir = path.join(repoRoot, relativeDir);
	if (!fs.existsSync(absoluteDir)) return [];

	const files: string[] = [];
	for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
		if (IGNORED_DIRECTORIES.has(entry.name)) continue;
		const relativePath = path.join(relativeDir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listFiles(repoRoot, relativePath));
			continue;
		}
		if (entry.isFile() && isSourceFile(relativePath)) {
			files.push(normalizePath(relativePath));
		}
	}
	return files;
}

function readFile(repoRoot: string, relativePath: string): string {
	return fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8');
}

function importSpecifiers(repoRoot: string, relativePath: string): string[] {
	const content = readFile(repoRoot, relativePath);
	const specifiers = new Set<string>();
	for (const match of content.matchAll(IMPORT_STATEMENT_REGEX)) {
		if (match[1]) specifiers.add(match[1]);
	}
	for (const match of content.matchAll(DYNAMIC_IMPORT_REGEX)) {
		if (match[1]) specifiers.add(match[1]);
	}
	return [...specifiers];
}

function sourceAlternates(filePath: string): string[] {
	if (filePath.endsWith('.js')) {
		const withoutExtension = filePath.slice(0, -3);
		return [filePath, `${withoutExtension}.ts`, `${withoutExtension}.svelte`];
	}
	if (filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
		return [filePath, `${filePath.slice(0, -4)}.ts`];
	}
	return [filePath];
}

function existingSourceFile(candidate: string): string | null {
	const candidates = new Set<string>();
	for (const alternate of sourceAlternates(candidate)) {
		candidates.add(alternate);
		for (const extension of SOURCE_EXTENSIONS) {
			candidates.add(`${alternate}${extension}`);
		}
		for (const extension of SOURCE_EXTENSIONS) {
			candidates.add(path.join(alternate, `index${extension}`));
		}
	}

	for (const possiblePath of candidates) {
		if (fs.existsSync(possiblePath) && fs.statSync(possiblePath).isFile()) {
			return possiblePath;
		}
	}
	return null;
}

function resolveInternalImport(
	repoRoot: string,
	fromFile: string,
	specifier: string,
): string | null {
	const normalizedFrom = path.join(repoRoot, fromFile);
	let candidate: string | null = null;

	if (specifier.startsWith('$lib/')) {
		candidate = path.join(repoRoot, 'src', 'lib', specifier.slice('$lib/'.length));
	} else if (
		specifier.startsWith('src/') ||
		specifier.startsWith('electron/') ||
		specifier.startsWith('mcp/')
	) {
		candidate = path.join(repoRoot, specifier);
	} else if (specifier.startsWith('./') || specifier.startsWith('../')) {
		candidate = path.resolve(path.dirname(normalizedFrom), specifier);
	}

	if (!candidate) return null;
	const resolved = existingSourceFile(candidate);
	if (!resolved) return null;
	return normalizePath(path.relative(repoRoot, resolved));
}

function buildGraph(repoRoot: string, files: string[]): Map<string, string[]> {
	return new Map(
		files.map((file) => [
			file,
			importSpecifiers(repoRoot, file)
				.map((specifier) => resolveInternalImport(repoRoot, file, specifier))
				.filter((value): value is string => !!value),
		]),
	);
}

function findCycles(graph: Map<string, string[]>): string[][] {
	const visited = new Set<string>();
	const active = new Set<string>();
	const stack: string[] = [];
	const cycles = new Set<string>();

	const visit = (node: string): void => {
		if (active.has(node)) {
			const cycleStart = stack.indexOf(node);
			const cycle = [...stack.slice(cycleStart), node];
			cycles.add(JSON.stringify(cycle));
			return;
		}
		if (visited.has(node)) return;

		visited.add(node);
		active.add(node);
		stack.push(node);
		for (const next of graph.get(node) ?? []) {
			if (graph.has(next)) visit(next);
		}
		stack.pop();
		active.delete(node);
	};

	for (const node of graph.keys()) {
		visit(node);
	}

	return [...cycles].map((cycle) => JSON.parse(cycle) as string[]);
}

export function auditImportCycles(repoRoot: string, relativeDir: string): CycleResult {
	const files = listFiles(repoRoot, relativeDir);
	return {
		directory: relativeDir,
		cycles: findCycles(buildGraph(repoRoot, files)),
	};
}

export function auditDirectories(repoRoot: string, directories: string[]): CycleResult[] {
	return directories.map((directory) => auditImportCycles(repoRoot, directory));
}
