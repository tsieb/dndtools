import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// WHY THIS SUITE EXISTS
// ---------------------
// `border: 1px solid var(--does-not-exist)` is not a no-op — the whole shorthand is INVALID, so the
// element renders with NO border at all. That has now bitten this app twice:
//   • `--color-status-*-border` (fixed by adding the aliases in colors.css)
//   • `--color-visibility-dm` / `--color-visibility-dm-subtle` — used at 7 sites to paint the
//     DM-only safety boundary in PlayerView / Player / Community, defined nowhere, so the app's most
//     safety-critical affordance silently had no border in every theme.
// Both were invisible to every existing gate: CSS custom properties fail silently, the contrast lint
// only reads `[data-theme]` blocks, and Playwright asserts behaviour rather than computed borders.
// So: resolve every `var(--…)` the app references against the tokens it actually ships.

const SRC = fileURLToPath(new URL('..', import.meta.url));
const STYLES = fileURLToPath(new URL('.', import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			walk(full, out);
			continue;
		}
		out.push(full);
	}
	return out;
}

const ALL_FILES = walk(SRC);
const CSS_FILES = ALL_FILES.filter((f) => f.endsWith('.css'));
const CODE_FILES = ALL_FILES.filter(
	(f) => /\.(ts|tsx|js|jsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f),
);

/** Every custom property DECLARED anywhere in the app's stylesheets, in any selector. */
const declared = new Set<string>();
for (const file of CSS_FILES) {
	for (const m of readFileSync(file, 'utf8').matchAll(/(--[A-Za-z0-9-]+)\s*:/g)) {
		declared.add(m[1]!);
	}
}

/** `var(--x)` references, with the ones that supply their own fallback filtered out. */
function referencesIn(source: string): string[] {
	const refs: string[] = [];
	for (const m of source.matchAll(/var\(\s*(--[A-Za-z0-9-]+)\s*([,)])/g)) {
		// `var(--x, fallback)` degrades gracefully by design, so an undefined name is not a defect.
		if (m[2] === ',') continue;
		refs.push(m[1]!);
	}
	return refs;
}

describe('CSS custom-property references resolve to a declared token', () => {
	it('declares a non-trivial token set (guards against the walker silently finding nothing)', () => {
		expect(CSS_FILES.length).toBeGreaterThan(3);
		expect(declared.size).toBeGreaterThan(100);
		expect(declared.has('--color-accent')).toBe(true);
	});

	it('every var(--x) in the stylesheets is declared', () => {
		const missing = new Map<string, string[]>();
		for (const file of CSS_FILES) {
			for (const ref of referencesIn(readFileSync(file, 'utf8'))) {
				if (declared.has(ref)) continue;
				missing.set(ref, [...(missing.get(ref) ?? []), file.slice(SRC.length)]);
			}
		}
		expect(Object.fromEntries(missing)).toEqual({});
	});

	it('every var(--x) in component code is declared', () => {
		// This is the check that would have caught `--color-visibility-dm`: the token was only ever
		// referenced from inline `style={{}}` in .tsx, never from a stylesheet.
		const missing = new Map<string, string[]>();
		for (const file of CODE_FILES) {
			for (const ref of referencesIn(readFileSync(file, 'utf8'))) {
				if (declared.has(ref)) continue;
				missing.set(ref, [...(missing.get(ref) ?? []), file.slice(SRC.length)]);
			}
		}
		expect(Object.fromEntries(missing)).toEqual({});
	});

	it('the DM-only boundary tokens specifically resolve, in every theme', () => {
		// Regression lock for the exact defect: these two are the DM-only banner's fill + border.
		// A theme is spread over SEVERAL `[data-theme='x']` blocks (colours, then the map/layer ramp),
		// so collect per theme NAME rather than asserting on every individual block.
		const colors = readFileSync(join(STYLES, 'tokens', 'colors.css'), 'utf8');
		const byTheme = new Map<string, string>();
		for (const m of colors.matchAll(/\[data-theme='([^']+)'\]\s*\{([^}]*)\}/g)) {
			byTheme.set(m[1]!, (byTheme.get(m[1]!) ?? '') + m[2]!);
		}
		expect(byTheme.size).toBeGreaterThanOrEqual(3);
		for (const [theme, block] of byTheme) {
			expect(block, `theme ${theme} must define the DM-only badge colour`).toContain(
				'--color-dm-only-badge',
			);
			expect(block, `theme ${theme} must define the DM-only fill`).toContain(
				'--color-dm-only-subtle',
			);
		}
		// And nothing may reference the old, never-declared names again.
		for (const file of [...CODE_FILES, ...CSS_FILES]) {
			expect(readFileSync(file, 'utf8')).not.toContain('--color-visibility-dm');
		}
	});
});

describe('shared surfaces do not bypass the token layer for text on a tokenized fill', () => {
	it('POIMarker tints its glyph from a token, not a literal white', () => {
		// The default `--layer-*` ramp is deliberately LIGHT (it has to read against a candle-lit map),
		// so a '#fff' glyph landed near 2:1 — below WCAG 1.4.11's 3:1 for meaningful graphics.
		const src = readFileSync(join(SRC, 'ds/components/map/POIMarker.jsx'), 'utf8');
		expect(src).toContain("color: 'var(--color-text-inverse)'");
		expect(src).not.toContain("color: '#fff'");
	});

	it("Button's danger variant labels itself from a token, not a literal white", () => {
		// `#fff` on `--color-status-error` is 3.49:1 on dark/tavern's salmon and 2.43:1 on
		// high-contrast's `#ff8080`. The label is 16px semibold, so WCAG 1.4.3 wants 4.5:1, and
		// two of the four themes need DARK ink — only a per-theme foreground token can serve both.
		const src = readFileSync(join(SRC, 'ds/components/core/Button.jsx'), 'utf8');
		expect(src).toContain("color: 'var(--color-status-error-foreground)'");
		expect(src).not.toContain("color: '#fff'");
	});
});

describe('every in-app Tabs completes the ARIA tabs pattern', () => {
	it('passes idBase, so the tablist actually points at a tabpanel', () => {
		// `Tabs` emits `aria-controls` only when given an `idBase`, and the consumer must spread
		// `tabPanelProps(idBase, active)` on the body. A tablist with no reachable panel is WCAG 4.1.2.
		const offenders: string[] = [];
		for (const file of CODE_FILES.filter((f) => /\.tsx$/.test(f))) {
			const src = readFileSync(file, 'utf8');
			for (const m of src.matchAll(/<Tabs\b[\s\S]{0,400}?\/>/g)) {
				if (!m[0].includes('idBase')) offenders.push(`${file.slice(SRC.length)}: ${m[0].slice(0, 60)}`);
			}
		}
		expect(offenders).toEqual([]);
	});
});
