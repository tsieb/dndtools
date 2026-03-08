import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../pipeline.js';

describe('rehype-callouts', () => {
	it('transforms a basic info callout', async () => {
		const md = '> [!info] Important Info\n> This is a callout.';
		const html = await renderMarkdown(md);
		expect(html).toContain('callout');
		expect(html).toContain('callout-info');
		expect(html).toContain('Important Info');
		expect(html).toContain('This is a callout.');
	});

	it('transforms a warning callout', async () => {
		const md = '> [!warning] Watch Out\n> Danger ahead!';
		const html = await renderMarkdown(md);
		expect(html).toContain('callout-warning');
		expect(html).toContain('Watch Out');
	});

	it('supports D&D-specific callout types', async () => {
		const types = ['dm', 'quest', 'npc', 'location', 'item', 'lore', 'secret'];
		for (const type of types) {
			const md = `> [!${type}] Title\n> Content`;
			const html = await renderMarkdown(md);
			expect(html).toContain(`callout-${type}`);
		}
	});

	it('uses the type name as title when no title is given', async () => {
		const md = '> [!tip]\n> Helpful tip.';
		const html = await renderMarkdown(md);
		expect(html).toContain('callout-tip');
		expect(html).toContain('Tip');
	});

	it('preserves callout body content', async () => {
		const md = '> [!info] Title\n> **Bold** and _italic_ content.';
		const html = await renderMarkdown(md);
		expect(html).toContain('<strong>Bold</strong>');
		expect(html).toContain('<em>italic</em>');
	});

	it('does not transform regular blockquotes', async () => {
		const md = '> Just a regular quote.';
		const html = await renderMarkdown(md);
		expect(html).toContain('<blockquote>');
		expect(html).not.toContain('callout');
	});

	it('adds data-callout attribute', async () => {
		const md = '> [!danger] Deadly Trap\n> Roll dexterity save.';
		const html = await renderMarkdown(md);
		expect(html).toContain('data-callout="danger"');
	});

	it('adds a callout-title div', async () => {
		const md = '> [!info] My Title\n> Body text.';
		const html = await renderMarkdown(md);
		expect(html).toContain('callout-title');
		expect(html).toContain('callout-icon');
	});

	it('handles callout type case-insensitively', async () => {
		const md = '> [!WARNING] Loud Warning\n> Be careful.';
		const html = await renderMarkdown(md);
		expect(html).toContain('callout-warning');
	});
});
