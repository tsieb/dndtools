// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * UX-VIS-009 AC3: Lucide is the ONLY icon library and it is imported from ONE place. This gate scans
 * every v2 app source file for icon-library imports and fails closed if any non-Lucide icon library
 * appears, or if `@lucide/svelte` is imported outside the registry module. Either way it prevents the
 * "mixed icon soup" failure mode.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', '..', 'src');
const REGISTRY_REL = join('lib', 'gui', 'icons.ts');

// Known icon libraries that must NOT appear (Lucide is the single allowed family).
const FORBIDDEN_ICON_LIBS = [
	/(^|['"/])lucide-react(['"/]|$)/,
	/(^|['"/])lucide-svelte(['"/]|$)/, // the old package name; the v2 package is @lucide/svelte
	/@iconify\//,
	/react-icons/,
	/@heroicons\//,
	/heroicons/,
	/feather-icons/,
	/@fortawesome\//,
	/bootstrap-icons/,
	/@phosphor-icons\//,
	/phosphor-svelte/,
	/ionicons/,
	/@tabler\/icons/,
	/svelte-lucide/,
];

const LUCIDE = /['"]@lucide\/svelte(\/[^'"]*)?['"]/;
const IMPORT_LINE = /(?:^|\s)(?:import|export)\b[\s\S]*?from\s+['"][^'"]+['"]/g;

function walk(dir: string, files: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === '.svelte-kit' || entry === 'dist') continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, files);
		else if (/\.(ts|svelte|svelte\.ts|js)$/.test(entry)) files.push(full);
	}
	return files;
}

const FILES = walk(SRC);

describe('icon import gate (UX-VIS-009 AC3)', () => {
	it('scans a non-trivial set of source files', () => {
		expect(FILES.length).toBeGreaterThan(10);
	});

	it('imports no non-Lucide icon library anywhere in the v2 app', () => {
		const offenders: string[] = [];
		for (const file of FILES) {
			const source = readFileSync(file, 'utf8');
			for (const importStmt of source.match(IMPORT_LINE) ?? []) {
				for (const lib of FORBIDDEN_ICON_LIBS) {
					if (lib.test(importStmt)) {
						offenders.push(`${relative(SRC, file)}: ${importStmt.trim().slice(0, 80)}`);
					}
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	it('imports @lucide/svelte only from the icon registry module', () => {
		const offenders: string[] = [];
		for (const file of FILES) {
			const rel = relative(SRC, file).split(sep).join(sep);
			const source = readFileSync(file, 'utf8');
			if (LUCIDE.test(source) && rel !== REGISTRY_REL) {
				offenders.push(rel);
			}
		}
		expect(offenders, 'Lucide must be imported only via src/lib/gui/icons.ts').toEqual([]);
	});

	it('confirms the registry module actually imports Lucide (gate is non-vacuous)', () => {
		const registry = readFileSync(join(SRC, REGISTRY_REL), 'utf8');
		expect(LUCIDE.test(registry)).toBe(true);
	});
});
