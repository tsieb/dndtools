import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WIDGET_SANDBOX_CSP_DIRECTIVES, type WidgetDefinition } from '@dndtools/core';
import { FORWARDED_THEME_TOKENS } from './hostBridge';
import {
	KIT_THEME_TOKENS,
	WIDGET_KIT_VERSION,
	collectSandboxThemeVariables,
	kitDeclaresVersion,
} from './SandboxHost';

/**
 * RC-WID-5.4 — the design-system kit, held against the app it copies.
 *
 * The kit is a second copy of the DS look, written as classes because a sandboxed frame cannot run
 * the React components. A second copy drifts unless something checks it. The browser spec
 * (`widget-kit.spec.ts`) compares rendered components; these tests guard what that comparison
 * cannot see: the scale the kit declares for itself, the density sets and motion collapse, the
 * tokens it expects the host to forward, and the fact that it makes no requests.
 */

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');
const kit = read('apps/gm-react/public/widget-kit.css');
const hostDocument = read('apps/gm-react/public/widget-host.html');
const spacing = read('apps/gm-react/src/styles/tokens/spacing.css');
const typography = read('apps/gm-react/src/styles/tokens/typography.css');
const colors = read('apps/gm-react/src/styles/tokens/colors.css');

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Custom-property declarations of every rule whose selector list is exactly `selector`. */
function declarations(css: string, selector: string): Map<string, string> {
	const found = new Map<string, string>();
	for (const rule of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const selectors = rule[1]!.split(',').map((part) => part.trim().replace(/\s+/g, ' '));
		if (selectors.join(', ') !== selector) continue;
		for (const declaration of rule[2]!.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
			found.set(declaration[1]!, declaration[2]!.trim().replace(/\s+/g, ' '));
		}
	}
	return found;
}

const kitRoot = declarations(kit, ':root');
const appRoot = new Map([...declarations(spacing, ':root'), ...declarations(typography, ':root')]);
const MOTION_COLLAPSE = "[data-motion='reduced'], [data-motion='none']";

function definition(capabilities: string[]): WidgetDefinition {
	return { style: { capabilities } } as unknown as WidgetDefinition;
}

describe('the design-system kit matches the app', () => {
	it('declares the theme-invariant scale exactly as the app does', () => {
		expect(kitRoot.size).toBeGreaterThan(40);
		const drift = [...kitRoot]
			.filter(([name]) => name !== '--kit-version')
			.filter(([name, value]) => appRoot.get(name) !== value)
			.map(([name, value]) => `${name}: kit ${value}, app ${appRoot.get(name) ?? '(undeclared)'}`);
		expect(drift).toEqual([]);
	});

	it.each(['comfortable', 'compact'])('switches to the app’s %s density set', (density) => {
		const selector = `[data-density='${density}']`;
		const app = declarations(spacing, selector);
		const ours = declarations(kit, selector);
		expect(app.size).toBeGreaterThan(0);
		for (const [name, standard] of kitRoot) {
			if (!name.startsWith('--density-')) continue;
			const expected = app.get(name) ?? appRoot.get(name);
			expect(ours.get(name) ?? standard, name).toBe(expected);
		}
		// The kit's density set touches nothing it does not also declare in its standard set.
		expect([...ours.keys()].filter((name) => !kitRoot.has(name))).toEqual([]);
	});

	it('collapses every duration it declares under reduced motion, as the app does', () => {
		const durations = [...kitRoot.keys()].filter((name) => name.startsWith('--duration-'));
		expect(durations.length).toBeGreaterThan(0);
		const ours = declarations(kit, MOTION_COLLAPSE);
		const app = declarations(spacing, MOTION_COLLAPSE);
		for (const name of durations) {
			expect(ours.get(name), name).toBe('0ms');
			expect(app.get(name), name).toBe('0ms');
		}
		// And the blanket rule, which also stops the widget's OWN animations on their resting frame.
		for (const setting of ['reduced', 'none']) {
			expect(stripComments(kit)).toContain(`[data-motion='${setting}'] *::after`);
		}
		expect(stripComments(kit)).toMatch(
			/animation-duration: 0\.001ms !important;\s*animation-iteration-count: 1 !important;\s*transition-duration: 0\.001ms !important;/,
		);
	});
});

describe('the host forwards what the kit draws with', () => {
	it('resolves every token the kit reads, from its own scale or the forwarded set', () => {
		const referenced = new Set(
			[...stripComments(kit).matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((match) => match[1]!),
		);
		const available = new Set([...kitRoot.keys(), ...FORWARDED_THEME_TOKENS, ...KIT_THEME_TOKENS]);
		expect([...referenced].filter((name) => !available.has(name))).toEqual([]);
	});

	it('forwards only real theme tokens, and none the kit owns', () => {
		const declared = new Set(
			[...stripComments(`${colors}\n${typography}`).matchAll(/(--[a-z0-9-]+)\s*:/g)].map(
				(match) => match[1]!,
			),
		);
		expect(KIT_THEME_TOKENS.filter((token) => !declared.has(token))).toEqual([]);
		// A forwarded value is set inline on the frame's <html>, so it would beat the kit's density
		// sets and motion collapse. Those must stay the kit's to decide.
		expect(KIT_THEME_TOKENS.filter((token) => kitRoot.has(token))).toEqual([]);
		expect(
			[...FORWARDED_THEME_TOKENS, ...KIT_THEME_TOKENS].filter((token) =>
				/^--(density|duration|easing|space)-/.test(token),
			),
		).toEqual([]);
	});

	it('hands the kit tokens only to a package that asked for the host theme', () => {
		const reader = (token: string) => ` value${token} `;
		const themed = collectSandboxThemeVariables(definition(['host-theme-tokens']), reader);
		for (const token of KIT_THEME_TOKENS) expect(themed[token]).toBe(`value${token}`);
		expect(collectSandboxThemeVariables(definition(['css-variables']), reader)).toEqual({});
	});
});

describe('the kit does not widen the sandbox', () => {
	it('makes no requests of its own', () => {
		const code = stripComments(kit);
		expect(code).not.toMatch(/url\(/i);
		expect(code).not.toMatch(/@import/i);
		expect(code).not.toMatch(/image-set\(/i);
	});

	it('leaves the sandbox style policy inline-only', () => {
		expect(WIDGET_SANDBOX_CSP_DIRECTIVES['style-src']).toBe("'unsafe-inline'");
		expect(hostDocument).not.toMatch(/<link\b/i);
	});

	it('declares the class-contract version the host speaks', () => {
		expect(kitDeclaresVersion(kit, WIDGET_KIT_VERSION)).toBe(true);
		expect(kitDeclaresVersion(kit, WIDGET_KIT_VERSION + 1)).toBe(false);
	});

	it('is installed ahead of the package stylesheet, and re-themed by message', () => {
		const script = hostDocument.slice(hostDocument.indexOf('<script>'));
		const kitAt = script.indexOf("setAttribute('data-widget-kit'");
		expect(kitAt).toBeGreaterThan(-1);
		expect(kitAt).toBeLessThan(script.indexOf('style.textContent = payload.css'));
		expect(script).toContain("case 'theme':");
	});
});
