import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './pipeline.js';
import { createVaultObjectId } from '$lib/types/object.js';

describe('renderMarkdown', () => {
	it('renders basic markdown', async () => {
		const html = await renderMarkdown('# Hello\n\nThis is a paragraph.');
		expect(html).toContain('<h1');
		expect(html).toContain('Hello');
		expect(html).toContain('<p>This is a paragraph.</p>');
	});

	it('renders GFM tables', async () => {
		const md = '| Name | Class |\n|------|-------|\n| Elminster | Wizard |';
		const html = await renderMarkdown(md);
		expect(html).toContain('<table>');
		expect(html).toContain('Elminster');
	});

	it('renders GFM task lists', async () => {
		const md = '- [x] Done\n- [ ] Not done';
		const html = await renderMarkdown(md);
		expect(html).toContain('checkbox');
	});

	it('strips frontmatter from output', async () => {
		const md = '---\ntitle: Test\ntags: [npc]\n---\n\n# Content';
		const html = await renderMarkdown(md);
		expect(html).not.toContain('tags:');
		expect(html).toContain('Content');
	});

	it('adds slug IDs to headings', async () => {
		const html = await renderMarkdown('## My Section');
		expect(html).toContain('id=');
		expect(html).toContain('my-section');
	});

	it('sanitizes XSS attempts', async () => {
		const md = '<script>alert("xss")</script>\n\nSafe content';
		const html = await renderMarkdown(md);
		expect(html).not.toContain('<script>');
		expect(html).toContain('Safe content');
	});

	it('renders code blocks', async () => {
		const md = '```javascript\nconsole.log("hello");\n```';
		const html = await renderMarkdown(md);
		expect(html).toContain('<pre>');
		expect(html).toContain('<code');
	});

	it('renders inline code', async () => {
		const html = await renderMarkdown('Use `const x = 1` here');
		expect(html).toContain('<code>const x = 1</code>');
	});

	it('renders wikilinks as links', async () => {
		const html = await renderMarkdown('See [[Elminster]]');
		expect(html).toContain('<a');
		expect(html).toContain('Elminster');
	});

	it('renders wikilinks with display text', async () => {
		const html = await renderMarkdown('See [[Elminster the Sage|the old wizard]]');
		expect(html).toContain('the old wizard');
		expect(html).toContain('<a');
	});

	it('renders resolved wikilinks with correct href', async () => {
		const html = await renderMarkdown('See [[Test]]', {
			resolveLink: (_title) => ({
				href: `/knowledge/notes/abc123`,
				exists: true,
			}),
		});
		expect(html).toContain('/knowledge/notes/abc123');
		expect(html).toContain('Test');
	});

	it('renders blockquotes', async () => {
		const html = await renderMarkdown('> A wise quote');
		expect(html).toContain('<blockquote>');
		expect(html).toContain('A wise quote');
	});

	it('renders bold and italic', async () => {
		const html = await renderMarkdown('**bold** and *italic*');
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('<em>italic</em>');
	});

	it('renders callout blockquotes as callout divs', async () => {
		const md = '> [!info] Important\n> Some info here.';
		const html = await renderMarkdown(md);
		expect(html).toContain('callout');
		expect(html).toContain('callout-info');
		expect(html).not.toContain('<blockquote>');
	});

	it('renders roll blocks with interactive hooks', async () => {
		const html = await renderMarkdown('Try {{roll: Loot Table}} now');
		expect(html).toContain('roll-block');
		expect(html).toContain('data-roll-table="Loot Table"');
		expect(html).toContain('data-roll-action="roll"');
		expect(html).toContain('data-roll-action="accept"');
	});

	it('renders object embeds as rich cards', async () => {
		const md = '![[obj:stat_block:abc123|Goblin Scout]]';
		const html = await renderMarkdown(md, {
			resolveObject: () => ({
				id: createVaultObjectId('abc123'),
				type: 'stat_block',
				name: 'Goblin Scout',
				summary: 'AC 15 | HP 7 | CR 1/4',
				tags: ['npc'],
				visibility: 'dm_only',
				relationships: [],
				createdAt: '2026-02-18T00:00:00.000Z',
				updatedAt: '2026-02-18T00:00:00.000Z',
				data: {
					abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
					traits: [],
					actions: [],
					reactions: [],
					legendaryActions: [],
				},
			}),
		});
		expect(html).toContain('object-embed');
		expect(html).toContain('Goblin Scout');
		expect(html).toContain('data-object-id="abc123"');
	});

	it('renders id-based object embeds and links card titles to object notes', async () => {
		const md = '[[obj:abc123|Goblin Scout]]';
		const html = await renderMarkdown(md, {
			resolveObject: () => ({
				id: createVaultObjectId('abc123'),
				type: 'stat_block',
				name: 'Goblin Scout',
				summary: 'AC 15 | HP 7 | CR 1/4',
				tags: ['npc'],
				visibility: 'dm_only',
				relationships: [],
				createdAt: '2026-02-18T00:00:00.000Z',
				updatedAt: '2026-02-18T00:00:00.000Z',
				data: {
					abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
					traits: [],
					actions: [],
					reactions: [],
					legendaryActions: [],
				},
			}),
		});
		expect(html).toContain('object-embed');
		expect(html).toContain('href="/knowledge/notes/abc123"');
	});

	it('renders note embeds as rich cards with metadata options', async () => {
		const md = '![[note:note-1|Session Recap|view=card,open=true]]';
		const html = await renderMarkdown(md, {
			resolveNote: () => ({
				id: 'note-1',
				title: 'Session Recap',
				kind: 'note',
				summary: 'Travel, tavern, and cliffhanger.',
				preview: 'The party reached Neverwinter.',
				updatedAt: '2026-02-18T00:00:00.000Z',
			}),
		});
		expect(html).toContain('object-embed');
		expect(html).toContain('Session Recap');
		expect(html).toContain('Travel, tavern, and cliffhanger.');
		expect(html).toContain('data-object-id="note-1"');
	});
});
