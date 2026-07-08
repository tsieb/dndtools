import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	collectViolations,
	defaultRoots,
	loadExceptions,
	type BoundaryLintRoots,
} from '../../scripts/boundary-lint';

// The repo root is three levels up from tests/unit.
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

/**
 * Build a minimal fixture tree that mirrors the app layout the lint expects (the React GM app
 * under apps/gm-react + the processing core under packages/core), so we can plant individual
 * violations and prove each rule fires. Returns roots pointed at the fixture.
 */
function makeFixture(files: Record<string, string>, exceptions: unknown[]): BoundaryLintRoots {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-react-boundary-'));
	tempDirs.push(root);
	const roots = defaultRoots(root);
	fs.mkdirSync(path.dirname(roots.exceptionsFile), { recursive: true });
	fs.writeFileSync(roots.exceptionsFile, JSON.stringify({ exceptions }));
	for (const [rel, content] of Object.entries(files)) {
		const full = path.join(root, rel);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, content);
	}
	return roots;
}

describe('boundary lint — clean repo baseline', () => {
	it('passes against the real repository tree', () => {
		const violations = collectViolations(defaultRoots(REPO_ROOT));
		expect(violations).toEqual([]);
	});
});

describe('PLAT-006 / PLAT-012: GUI/platform primitive access is caught', () => {
	it('flags a GUI component that imports Dexie directly', () => {
		const roots = makeFixture(
			{
				'apps/gm-react/src/ds/BadPanel.tsx':
					"import Dexie from 'dexie';\nconst db = new Dexie('x');\nexport const P = () => null;\n",
			},
			[],
		);
		const violations = collectViolations(roots);
		expect(violations.some((v) => /imports Dexie directly/.test(v.message))).toBe(true);
	});

	it('flags a screen component that touches indexedDB directly', () => {
		const roots = makeFixture(
			{
				'apps/gm-react/src/screens/Notes.tsx':
					"export const ok = typeof indexedDB !== 'undefined';\n",
			},
			[],
		);
		const violations = collectViolations(roots);
		expect(violations.some((v) => /accesses indexedDB directly/.test(v.message))).toBe(true);
	});

	it('flags a GUI component that reaches localStorage directly', () => {
		const roots = makeFixture(
			{
				'apps/gm-react/src/screens/Prefs.tsx': "localStorage.setItem('k', 'v');\n",
			},
			[],
		);
		const violations = collectViolations(roots);
		expect(violations.some((v) => /accesses localStorage directly/.test(v.message))).toBe(true);
	});

	it('flags a GUI component that reaches the Capacitor native bridge', () => {
		const roots = makeFixture(
			{
				'apps/gm-react/src/app/Native.tsx': 'const c = window.Capacitor;\nexport const x = c;\n',
			},
			[],
		);
		const violations = collectViolations(roots);
		expect(violations.some((v) => /Capacitor native bridge/.test(v.message))).toBe(true);
	});

	// PLAT-001 AC2: feature components must branch on the resolved platform profile, not raw
	// viewport width. The lint forbids innerWidth/matchMedia/screen.* in GUI/screen components.
	it('flags a GUI component that branches on window.innerWidth', () => {
		const roots = makeFixture(
			{
				'apps/gm-react/src/app/Layout.tsx': 'export const compact = window.innerWidth < 720;\n',
			},
			[],
		);
		const violations = collectViolations(roots);
		expect(violations.some((v) => /sniffs the raw viewport.*PLAT-001/.test(v.message))).toBe(true);
	});

	it('flags a screen component that uses matchMedia for layout', () => {
		const roots = makeFixture(
			{
				'apps/gm-react/src/screens/Scene.tsx':
					"export const m = window.matchMedia('(max-width: 700px)').matches;\n",
			},
			[],
		);
		const violations = collectViolations(roots);
		expect(violations.some((v) => /sniffs the raw viewport.*PLAT-001/.test(v.message))).toBe(true);
	});

	it('allows a GUI file to read the viewport behind its owned exception (PLAT-012)', () => {
		const probe = 'apps/gm-react/src/app/capabilities-probe.tsx';
		const exception = {
			id: 'platform-capabilities-probe',
			path: probe,
			primitives: ['viewport-sniff'],
			owner: 'PLAT',
			rationale: 'The single owned place the raw viewport is read.',
			removalCriteria: 'Reads stay confined to the platform layer.',
		};
		const roots = makeFixture({ [probe]: 'export const w = window.innerWidth;\n' }, [exception]);
		expect(collectViolations(roots)).toEqual([]);

		// Without the exception the same probe fails closed.
		const rootsNoException = makeFixture(
			{ [probe]: 'export const w = window.innerWidth;\n' },
			[],
		);
		expect(collectViolations(rootsNoException).length).toBeGreaterThan(0);
	});

	it('allows the same primitive only inside an allowlisted, owned exception path (PLAT-012)', () => {
		const adapter = 'apps/gm-react/src/app/store-probe.tsx';
		const exception = {
			id: 'storage-adapter-dexie',
			path: adapter,
			primitives: ['dexie', 'indexedDB'],
			owner: 'PLAT',
			rationale: 'The single browser-local storage adapter.',
			removalCriteria: 'Changes only with ADR-014 storage decision.',
		};
		const roots = makeFixture(
			{ [adapter]: "import Dexie from 'dexie';\nconst probe = indexedDB;\n" },
			[exception],
		);
		expect(collectViolations(roots)).toEqual([]);

		// Remove the exception and the very same file now fails closed.
		const rootsNoException = makeFixture(
			{ [adapter]: "import Dexie from 'dexie';\nconst probe = indexedDB;\n" },
			[],
		);
		expect(collectViolations(rootsNoException).length).toBeGreaterThan(0);
	});

	it('does not flag primitive names that only appear in comments or strings', () => {
		const roots = makeFixture(
			{
				'apps/gm-react/src/ds/Doc.tsx':
					"// this never touches indexedDB or localStorage\nexport const label = 'uses localStorage';\n",
			},
			[],
		);
		expect(collectViolations(roots)).toEqual([]);
	});
});

describe('PLAT-011: type-only contract modules reject runtime exports', () => {
	it('flags a runtime const exported from a *.contract.ts module', () => {
		const roots = makeFixture(
			{
				'packages/core/src/contracts/sample.contract.ts':
					'export type Foo = { a: number };\nexport const RUNTIME = 1;\n',
			},
			[],
		);
		const violations = collectViolations(roots);
		expect(violations.some((v) => /exports a runtime value \(PLAT-011\)/.test(v.message))).toBe(
			true,
		);
	});

	it('flags a runtime function exported from the contracts directory', () => {
		const roots = makeFixture(
			{
				'packages/core/src/contracts/helper.ts':
					'export interface Bar { b: string }\nexport function make(): Bar {\n  return { b: "x" };\n}\n',
			},
			[],
		);
		const violations = collectViolations(roots);
		expect(violations.some((v) => /exports a runtime value \(PLAT-011\)/.test(v.message))).toBe(
			true,
		);
	});

	it('allows pure type/interface exports in a contract module', () => {
		const roots = makeFixture(
			{
				'packages/core/src/contracts/pure.contract.ts':
					'export type Foo = { a: number };\nexport interface Bar { b: string }\n',
			},
			[],
		);
		expect(collectViolations(roots)).toEqual([]);
	});
});

describe('PLAT-012: exception manifest integrity', () => {
	it('rejects an exception missing a required owner field', () => {
		expect(() => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-boundary-exc-'));
			tempDirs.push(root);
			const roots = defaultRoots(root);
			fs.mkdirSync(path.dirname(roots.exceptionsFile), { recursive: true });
			fs.writeFileSync(
				roots.exceptionsFile,
				JSON.stringify({
					exceptions: [
						{
							id: 'x',
							path: 'a/b.ts',
							primitives: ['indexedDB'],
							rationale: 'r',
							removalCriteria: 'c',
						},
					],
				}),
			);
			loadExceptions(roots.exceptionsFile, root);
		}).toThrow(/owner/);
	});

	it('the real manifest parses and every entry is complete and owned', () => {
		const roots = defaultRoots(REPO_ROOT);
		const exceptions = loadExceptions(roots.exceptionsFile, REPO_ROOT);
		expect(exceptions.length).toBeGreaterThan(0);
		for (const exc of exceptions) {
			expect(exc.owner.trim()).not.toBe('');
			expect(exc.rationale.trim()).not.toBe('');
			expect(exc.removalCriteria.trim()).not.toBe('');
			expect(exc.primitives.length).toBeGreaterThan(0);
			// Every allowlisted file must exist; stale exceptions are a regression.
			expect(fs.existsSync(path.join(REPO_ROOT, exc.path))).toBe(true);
		}
	});
});

describe('MCP-012: MCP modules touch no filesystem API outside the allowlist', () => {
	// MCP-012 AC1: an MCP tool that imports a filesystem API (outside the declared, gated allowlist)
	// fails the boundary-lint gate. Each fixture plants the violation in an MCP core module.
	it('flags an MCP module that imports node:fs directly', () => {
		const roots = makeFixture(
			{
				'packages/core/src/mcp/bad-tool.ts':
					"import fs from 'node:fs';\nexport function read() {\n  return fs.readFileSync('x');\n}\n",
			},
			[],
		);
		const violations = collectViolations(roots);
		expect(violations.some((v) => /imports a filesystem API.*MCP-012/.test(v.message))).toBe(true);
	});

	it("flags an MCP module that imports the bare 'fs' / 'path' modules", () => {
		for (const spec of ['fs', 'path']) {
			const roots = makeFixture(
				{
					'packages/core/src/mcp/bad-import.ts': `import x from '${spec}';\nexport const y = x;\n`,
				},
				[],
			);
			const violations = collectViolations(roots);
			expect(
				violations.some((v) => /imports a filesystem API.*MCP-012/.test(v.message)),
				`expected an MCP-012 violation for bare '${spec}' import`,
			).toBe(true);
		}
	});

	it('flags an MCP module that calls a filesystem primitive directly', () => {
		const roots = makeFixture(
			{
				'packages/core/src/mcp/sneaky.ts':
					'export function dump() {\n  return readFileSync("/etc/passwd");\n}\n',
			},
			[],
		);
		const violations = collectViolations(roots);
		expect(violations.some((v) => /calls a filesystem API directly.*MCP-012/.test(v.message))).toBe(
			true,
		);
	});

	it('flags an MCP module that reaches a Node process global', () => {
		const roots = makeFixture(
			{
				'packages/core/src/mcp/leaky.ts':
					'export const home = process.env.HOME;\n',
			},
			[],
		);
		const violations = collectViolations(roots);
		expect(violations.some((v) => /reaches a Node process global.*MCP-012/.test(v.message))).toBe(
			true,
		);
	});

	it('does not flag a pure-policy MCP module (the real allowlist + dispatch are clean)', () => {
		const roots = makeFixture(
			{
				'packages/core/src/mcp/pure.ts':
					"import { z } from 'zod';\n// reads through fs-allowlist only — never node:fs\nexport const schema = z.object({});\n",
			},
			[],
		);
		expect(collectViolations(roots)).toEqual([]);
	});
});
