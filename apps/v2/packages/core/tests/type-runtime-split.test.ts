import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, '..', 'src');

function walk(dir: string, files: string[] = []): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, files);
		else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(full);
	}
	return files;
}

const RUNTIME_EXPORT = /^\s*export\s+(?:default\s+)?(?:async\s+)?(const|let|var|function|class|enum)\b/;

function isContractModule(file: string): boolean {
	const rel = path.relative(SRC, file).split(path.sep).join('/');
	return rel.startsWith('contracts/') || file.endsWith('.contract.ts');
}

describe('PLAT-011: type-only contract modules contain no runtime values', () => {
	const contractFiles = walk(SRC).filter(isContractModule);

	it('has at least one type-only contract module', () => {
		expect(contractFiles.length).toBeGreaterThan(0);
	});

	it.each(contractFiles.map((f) => [path.relative(SRC, f), f] as const))(
		'%s exports only types',
		(_label, file) => {
			const lines = fs.readFileSync(file, 'utf8').split('\n');
			const offending = lines
				.map((line, i) => ({ line, i }))
				// Ignore lines inside comments/strings is unnecessary here: these modules are
				// authored as pure type declarations, so any runtime export is a real leak.
				.filter(({ line }) => RUNTIME_EXPORT.test(line));
			expect(offending, `runtime export in ${file}`).toEqual([]);
		},
	);
});

describe('PLAT-011: runtime validators import from runtime modules, not contract paths', () => {
	it('the runtime service-boundary module exports runtime constructors', async () => {
		const mod = await import('../src/platform/service-boundary');
		expect(typeof mod.createPlatformServiceRegistry).toBe('function');
		expect(typeof mod.validatePlatformRequest).toBe('function');
		expect(Array.isArray(mod.PLATFORM_SERVICE_METHODS)).toBe(true);
	});

	it('the type-only contract module yields no runtime own-enumerable exports', async () => {
		const mod = await import('../src/contracts/platform-boundary.contract');
		// Types are erased at runtime, so the imported namespace has no own runtime values.
		const runtimeKeys = Object.keys(mod).filter(
			(k) => (mod as Record<string, unknown>)[k] !== undefined,
		);
		expect(runtimeKeys).toEqual([]);
	});
});
