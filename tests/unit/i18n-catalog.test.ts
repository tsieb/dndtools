import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	buildLocaleModule,
	exportLocaleCatalog,
	exportSourceCatalog,
	type FlatCatalog,
} from '../../scripts/i18n-catalog';
import { en } from '../../apps/gm-react/src/i18n/messages/en';
import { es } from '../../apps/gm-react/src/i18n/messages/es';

// RC-UX-1.4 — the community translation workflow round-trips a catalog through the flat JSON
// shape a Weblate/Crowdin "JSON file" component ingests. These tests exercise the pure
// export/build functions directly (no filesystem writes into the real messages/ tree — the CLI's
// import command is a thin wrapper that writes `buildLocaleModule`'s output, covered separately).

describe('exportSourceCatalog', () => {
	it('is every key in en, unmodified', () => {
		expect(exportSourceCatalog()).toEqual({ ...en });
	});
});

describe('exportLocaleCatalog', () => {
	it("only includes the locale's translated keys, in en's key order", () => {
		const flat = exportLocaleCatalog(es);
		expect(Object.keys(flat)).toEqual(
			(Object.keys(en) as (keyof typeof en)[]).filter((key) => es[key] !== undefined),
		);
		for (const [key, value] of Object.entries(flat)) {
			expect(value).toBe(es[key as keyof typeof es]);
		}
	});

	it('drops nothing en does not declare and adds nothing the locale never translated', () => {
		const flat = exportLocaleCatalog({ 'common.action.save': 'Guardar' } as FlatCatalog);
		expect(flat).toEqual({ 'common.action.save': 'Guardar' });
	});
});

describe('buildLocaleModule — round trip', () => {
	it('re-importing an exported catalog reproduces the exact same key/value set', () => {
		const exported = exportLocaleCatalog(es);
		const moduleText = buildLocaleModule('es', exported);

		// Evaluate the generated module body the same way the CLI's dynamic import would, without
		// touching the filesystem: strip the `import type` line (types erase at runtime) and eval
		// the `export const` as a plain object literal.
		const objectLiteral = moduleText
			.replace(/^import type.*\n\n/, '')
			.replace(/^\/\*\*[\s\S]*?\*\/\n/, '')
			.replace(/^export const es: [^=]+= /, '')
			.replace(/;\s*$/, '');
		const reimported = new Function(`return (${objectLiteral});`)() as FlatCatalog;

		expect(reimported).toEqual(exported);
		expect(Object.keys(reimported)).toEqual(Object.keys(exported));
	});

	it('rejects an uploaded key en.ts no longer declares', () => {
		expect(() => buildLocaleModule('es', { 'nonexistent.key': 'value' })).toThrow(
			/no longer declares/,
		);
	});

	it('drops a key the upload omits rather than keeping a stale translation', () => {
		const withoutSave = exportLocaleCatalog(es);
		delete withoutSave['common.action.save'];
		const moduleText = buildLocaleModule('es', withoutSave);
		expect(moduleText).not.toContain('"common.action.save"');
	});

	it('emits the documented do-not-hand-edit banner pointing at the doc', () => {
		const moduleText = buildLocaleModule('es', {});
		expect(moduleText).toContain('docs/development/LOCALIZATION.md');
	});
});

describe('LOCALIZATION.md exists and documents the round trip', () => {
	it('is present and mentions export/import', () => {
		const path = fileURLToPath(new URL('../../docs/development/LOCALIZATION.md', import.meta.url));
		const doc = readFileSync(path, 'utf8');
		expect(doc).toMatch(/i18n-catalog\.ts export/);
		expect(doc).toMatch(/i18n-catalog\.ts import/);
	});
});
