// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const IMPORT_REGEX = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;

function listFiles(relativeDir: string): string[] {
	const absoluteDir = path.join(repoRoot, relativeDir);
	const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const relativePath = path.join(relativeDir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listFiles(relativePath));
			continue;
		}
		if (
			entry.isFile() &&
			!relativePath.endsWith('.d.ts') &&
			(relativePath.endsWith('.ts') ||
				relativePath.endsWith('.svelte') ||
				relativePath.endsWith('.svelte.ts'))
		) {
			files.push(relativePath.replace(/\\/g, '/'));
		}
	}
	return files;
}

function readFile(relativePath: string): string {
	return fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8');
}

function importSpecifiers(relativePath: string): string[] {
	const content = readFile(relativePath);
	return [...content.matchAll(IMPORT_REGEX)].map((match) => match[1] ?? '');
}

function resolveInternalImport(fromFile: string, specifier: string): string | null {
	const normalizedFrom = path.join(repoRoot, fromFile);
	const candidates: string[] = [];

	if (specifier.startsWith('$lib/')) {
		candidates.push(path.join(repoRoot, 'src', 'lib', specifier.slice('$lib/'.length)));
	} else if (specifier.startsWith('../src/') || specifier.startsWith('./') || specifier.startsWith('../')) {
		candidates.push(path.resolve(path.dirname(normalizedFrom), specifier));
	} else {
		return null;
	}

	for (const candidate of candidates) {
		for (const suffix of ['', '.ts', '.svelte', '.svelte.ts', '.js']) {
			const resolved = `${candidate}${suffix}`;
			const tsResolved = resolved.endsWith('.js') ? resolved.slice(0, -3) + '.ts' : resolved;
			const svelteResolved = resolved.endsWith('.js')
				? resolved.slice(0, -3) + '.svelte'
				: resolved;
			for (const exact of [resolved, tsResolved, svelteResolved]) {
				if (fs.existsSync(exact) && fs.statSync(exact).isFile()) {
					return path.relative(repoRoot, exact).replace(/\\/g, '/');
				}
			}
		}
	}

	return null;
}

function buildGraph(files: string[]): Map<string, string[]> {
	return new Map(
		files.map((file) => [
			file,
			importSpecifiers(file)
				.map((specifier) => resolveInternalImport(file, specifier))
				.filter((value): value is string => !!value),
		]),
	);
}

function findCycles(graph: Map<string, string[]>): string[][] {
	const visited = new Set<string>();
	const stack: string[] = [];
	const active = new Set<string>();
	const cycles: string[][] = [];

	const visit = (node: string): void => {
		if (active.has(node)) {
			const cycleStart = stack.indexOf(node);
			cycles.push([...stack.slice(cycleStart), node]);
			return;
		}
		if (visited.has(node)) return;
		visited.add(node);
		active.add(node);
		stack.push(node);
		for (const next of graph.get(node) ?? []) {
			if (graph.has(next)) {
				visit(next);
			}
		}
		stack.pop();
		active.delete(node);
	};

	for (const node of graph.keys()) {
		visit(node);
	}

	return cycles;
}

describe('repo boundary audit', () => {
	it('keeps MCP tool handlers off direct filesystem imports', () => {
		const violations = listFiles('mcp/tools')
			.filter((file) => !file.includes('/shared/') && !file.endsWith('.test.ts'))
			.filter((file) => /\bfrom ['"]node:fs(?:\/promises)?['"]|\bfrom ['"]fs['"]/.test(readFile(file)));

		expect(violations).toEqual([]);
	});

	it('keeps src/lib/types isolated from domain and runtime modules', () => {
		const violations = listFiles('src/lib/types').filter((file) =>
			importSpecifiers(file).some((specifier) => {
				const resolved = resolveInternalImport(file, specifier);
				return (
					resolved?.startsWith('src/lib/domain/') ||
					resolved?.startsWith('src/lib/state/') ||
					resolved?.startsWith('src/lib/runtime/') ||
					resolved?.startsWith('src/lib/ui/')
				);
			}),
		);

		expect(violations).toEqual([]);
	});

	it('has no circular imports across src, electron, and mcp', () => {
		const files = [...listFiles('src'), ...listFiles('electron'), ...listFiles('mcp')].filter(
			(file) => !file.endsWith('.test.ts'),
		);
		const cycles = findCycles(buildGraph(files));
		expect(cycles).toEqual([]);
	});
});
