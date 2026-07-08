import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORBIDDEN_RENDERER_IMPORT_PREFIXES, isForbiddenRendererImport } from '@dndtools/core';
import {
	collectViolations,
	defaultRoots,
	type BoundaryLintRoots,
} from '../../scripts/boundary-lint';

/**
 * SEC-001 AC1 — RENDERER ISOLATION, the MECHANICAL half. "Given renderer code attempts to import filesystem
 * APIs, when lint/build runs, then the boundary violation fails." This proves the live `pnpm lint:boundary`
 * boundary-lint rejects a renderer/core module that imports a Node/filesystem/Electron/MCP/cloud API, and
 * that the SEC-001 declared catalogue (`FORBIDDEN_RENDERER_IMPORT_PREFIXES`) is exactly the set the lint
 * enforces — so the policy and the enforcer can never silently diverge.
 *
 * This lives in the APP package (not core) because importing the boundary-lint script is in-bounds here;
 * the core package `rootDir` forbids reaching outside `packages/core`.
 */

// The repo root is three levels up from tests/unit.
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Build a minimal v2 fixture tree with a single planted core module, pointed-at roots returned. */
function makeFixture(files: Record<string, string>): BoundaryLintRoots {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sec001-boundary-'));
	tempDirs.push(root);
	const roots = defaultRoots(root);
	fs.mkdirSync(path.dirname(roots.exceptionsFile), { recursive: true });
	fs.writeFileSync(roots.exceptionsFile, JSON.stringify({ exceptions: [] }));
	for (const [rel, content] of Object.entries(files)) {
		const full = path.join(root, rel);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, content);
	}
	return roots;
}

describe('SEC-001 AC1 — a renderer module that imports a forbidden API fails the boundary lint', () => {
	it('a core/renderer module importing node:fs is a boundary violation (fails lint/build)', () => {
		const roots = makeFixture({
			'packages/core/src/evil-renderer.ts':
				"import fs from 'node:fs';\nexport const leak = () => fs.readFileSync('/etc/passwd');\n",
		});
		const violations = collectViolations(roots);
		expect(violations.some((v) => /Forbidden import "node:fs"/.test(v.message))).toBe(true);
	});

	it('a core/renderer module importing electron (arbitrary IPC) is a boundary violation', () => {
		const roots = makeFixture({
			'packages/core/src/evil-ipc.ts':
				"import { ipcRenderer } from 'electron';\nexport const x = ipcRenderer;\n",
		});
		const violations = collectViolations(roots);
		expect(violations.some((v) => /Forbidden import "electron"/.test(v.message))).toBe(true);
	});

	it('a core/renderer module importing the MCP sidecar SDK is a boundary violation', () => {
		const roots = makeFixture({
			'packages/core/src/evil-mcp.ts':
				"import { Client } from '@modelcontextprotocol/sdk';\nexport const c = Client;\n",
		});
		const violations = collectViolations(roots);
		expect(violations.some((v) => /Forbidden import "@modelcontextprotocol\/sdk"/.test(v.message))).toBe(true);
	});

	it('every SEC-001 declared forbidden prefix is one the live boundary lint also forbids (no drift)', () => {
		for (const prefix of FORBIDDEN_RENDERER_IMPORT_PREFIXES) {
			expect(isForbiddenRendererImport(prefix)).toBe(true);
			const spec = prefix.endsWith('/') ? `${prefix}thing` : prefix;
			const roots = makeFixture({
				'packages/core/src/probe.ts': `import x from '${spec}';\nexport const y = x;\n`,
			});
			const violations = collectViolations(roots);
			expect(
				violations.some((v) => v.message.includes('Forbidden import')),
				`boundary lint did not forbid declared renderer prefix "${spec}"`,
			).toBe(true);
		}
	});

	it('the REAL repository tree has no forbidden renderer imports (the live invariant holds)', () => {
		expect(collectViolations(defaultRoots(REPO_ROOT))).toEqual([]);
	});
});
