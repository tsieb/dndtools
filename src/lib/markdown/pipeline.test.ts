import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './pipeline.js';

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
				href: `/notes/abc123`,
				exists: true,
			}),
		});
		expect(html).toContain('/notes/abc123');
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
});
