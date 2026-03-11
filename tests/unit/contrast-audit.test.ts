// @vitest-environment node
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type TokenMap = Record<string, string>;

function extractBlock(source: string, selector: string): string {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
	return match?.[1] ?? '';
}

function extractTokens(block: string): TokenMap {
	const tokens: TokenMap = {};
	for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
		const key = match[1]?.trim();
		const value = match[2]?.trim();
		if (!key || !value) continue;
		tokens[key] = value;
	}
	return tokens;
}

function hexToRgb(hex: string): [number, number, number] {
	const normalized = hex.trim().replace(/^#/, '');
	if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(normalized)) {
		throw new Error(`Expected hex color, received "${hex}"`);
	}
	const full =
		normalized.length === 3
			? normalized
					.split('')
					.map((char) => `${char}${char}`)
					.join('')
			: normalized;
	const r = Number.parseInt(full.slice(0, 2), 16);
	const g = Number.parseInt(full.slice(2, 4), 16);
	const b = Number.parseInt(full.slice(4, 6), 16);
	return [r, g, b];
}

function toLinear(channel: number): number {
	const normalized = channel / 255;
	return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function luminance(color: string): number {
	const [r, g, b] = hexToRgb(color);
	return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(foreground: string, background: string): number {
	const fg = luminance(foreground);
	const bg = luminance(background);
	const light = Math.max(fg, bg);
	const dark = Math.min(fg, bg);
	return (light + 0.05) / (dark + 0.05);
}

describe('theme contrast audit', () => {
	it('meets required WCAG contrast ratios for all presets', async () => {
		const appCss = await fs.readFile(path.resolve(process.cwd(), 'src/app.css'), 'utf8');
		const baseTokens = extractTokens(extractBlock(appCss, '@theme'));
		const themeOverrides = {
			parchment: {} as TokenMap,
			tavern: extractTokens(extractBlock(appCss, 'html.theme-tavern')),
			scholar: extractTokens(extractBlock(appCss, 'html.theme-scholar')),
			dungeon: extractTokens(extractBlock(appCss, 'html.theme-dungeon')),
			highContrast: extractTokens(extractBlock(appCss, 'html.theme-high-contrast')),
		};

		for (const [theme, overrides] of Object.entries(themeOverrides)) {
			const tokens = { ...baseTokens, ...overrides };
			const ink = tokens['--color-ink']!;
			const inkMuted = tokens['--color-ink-muted']!;
			const bg = tokens['--color-bg']!;
			const surface = tokens['--color-surface']!;
			const accentSubtle = tokens['--color-accent-subtle']!;
			const focusRing = tokens['--color-focus-ring']!;
			const success = tokens['--color-success']!;
			const warning = tokens['--color-warning']!;
			const error = tokens['--color-error']!;

			expect(contrastRatio(ink, bg), `${theme}: ink on bg`).toBeGreaterThanOrEqual(4.5);
			expect(contrastRatio(ink, surface), `${theme}: ink on surface`).toBeGreaterThanOrEqual(4.5);
			expect(normalizedContrast(inkMuted, bg), `${theme}: muted on bg`).toBeGreaterThanOrEqual(4.5);
			expect(
				normalizedContrast(inkMuted, surface),
				`${theme}: muted on surface`,
			).toBeGreaterThanOrEqual(4.5);
			expect(
				normalizedContrast(ink, accentSubtle),
				`${theme}: ink on accent-subtle (active nav background)`,
			).toBeGreaterThanOrEqual(4.5);
			expect(
				normalizedContrast(focusRing, surface),
				`${theme}: focus ring on surface`,
			).toBeGreaterThanOrEqual(3);
			expect(
				normalizedContrast(success, surface),
				`${theme}: success on surface`,
			).toBeGreaterThanOrEqual(3);
			expect(normalizedContrast(success, bg), `${theme}: success on bg`).toBeGreaterThanOrEqual(3);
			expect(
				normalizedContrast(warning, surface),
				`${theme}: warning on surface`,
			).toBeGreaterThanOrEqual(3);
			expect(normalizedContrast(warning, bg), `${theme}: warning on bg`).toBeGreaterThanOrEqual(3);
			expect(
				normalizedContrast(error, surface),
				`${theme}: error on surface`,
			).toBeGreaterThanOrEqual(3);
			expect(normalizedContrast(error, bg), `${theme}: error on bg`).toBeGreaterThanOrEqual(3);
		}

		const highContrast = { ...baseTokens, ...themeOverrides.highContrast };
		expect(
			contrastRatio(highContrast['--color-ink']!, highContrast['--color-bg']!),
			'high contrast: ink on bg (AAA)',
		).toBeGreaterThanOrEqual(7);
		expect(
			contrastRatio(highContrast['--color-ink']!, highContrast['--color-surface']!),
			'high contrast: ink on surface (AAA)',
		).toBeGreaterThanOrEqual(7);
	});
});

function normalizedContrast(foreground: string, background: string): number {
	return contrastRatio(foreground, background);
}
