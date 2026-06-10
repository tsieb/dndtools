import { describe, expect, it } from 'vitest';
import {
	extractWikilinks,
	parseMarkdownNote,
	serializeMarkdownNote,
} from '../src';

/**
 * CONTENT-007 — the pure, deterministic Obsidian-aware markdown parse/serialize that import/export
 * compose. Preservation of frontmatter properties, aliases, tags, and `[[wikilinks]]` is proven here.
 */

describe('CONTENT-007 markdown parse/serialize (pure, deterministic)', () => {
	it('parses front matter properties, aliases, tags, and inline hashtags (preserved + merged)', () => {
		const text = [
			'---',
			'title: Highmoor',
			'aliases: [Highmoor Keep, The Keep]',
			'tags: [location, ruins]',
			'cssclass: lore',
			'---',
			'',
			'# Highmoor',
			'',
			'An ancient keep #fortress near the #ruins.',
		].join('\n');

		const parsed = parseMarkdownNote(text);
		expect(parsed.hadFrontmatter).toBe(true);
		expect(parsed.properties['title']).toBe('Highmoor');
		expect(parsed.properties['cssclass']).toBe('lore');
		// Aliases preserved as a list.
		expect(parsed.aliases).toEqual(['Highmoor Keep', 'The Keep']);
		// Tags merge frontmatter list + inline #hashtags, deduped, first-seen order.
		expect(parsed.tags).toEqual(['location', 'ruins', 'fortress']);
		expect(parsed.body.startsWith('# Highmoor')).toBe(true);
	});

	it('parses block-list aliases/tags', () => {
		const text = ['---', 'aliases:', '  - A', '  - B', 'tags:', '  - x', '---', 'Body'].join('\n');
		const parsed = parseMarkdownNote(text);
		expect(parsed.aliases).toEqual(['A', 'B']);
		expect(parsed.tags).toEqual(['x']);
		expect(parsed.body).toBe('Body');
	});

	it('extracts wikilinks with section and alias, preserving raw text and order', () => {
		const body = 'See [[Highmoor]] and [[Lore/Gods#Bane|the Black Hand]] then [[Highmoor]] again.';
		const links = extractWikilinks(body);
		expect(links).toHaveLength(3);
		expect(links[0]).toMatchObject({ target: 'Highmoor', raw: '[[Highmoor]]' });
		expect(links[1]).toMatchObject({
			target: 'Lore/Gods',
			section: 'Bane',
			alias: 'the Black Hand',
			raw: '[[Lore/Gods#Bane|the Black Hand]]',
		});
		// Duplicate link preserved (document order), not deduped.
		expect(links[2]!.target).toBe('Highmoor');
	});

	it('degrades tolerantly when there is no front matter (never throws)', () => {
		const parsed = parseMarkdownNote('Just a body with a #tag and a [[Link]].');
		expect(parsed.hadFrontmatter).toBe(false);
		expect(parsed.properties).toEqual({});
		expect(parsed.tags).toEqual(['tag']);
		expect(parsed.wikilinks).toHaveLength(1);
	});

	it('parsing is deterministic — the same text always parses identically', () => {
		const text = '---\ntitle: T\ntags: [a, b]\n---\nBody #c';
		expect(parseMarkdownNote(text)).toEqual(parseMarkdownNote(text));
	});

	it('serializes properties in stable sorted key order (diff-friendly, deterministic)', () => {
		const out = serializeMarkdownNote({ title: 'T', aliases: ['x', 'y'], cssclass: 'lore' }, 'Body');
		// Keys sorted: aliases, cssclass, title.
		expect(out).toBe('---\naliases: [x, y]\ncssclass: lore\ntitle: T\n---\n\nBody\n');
	});

	it('omits the front matter block entirely when there are no properties', () => {
		expect(serializeMarkdownNote({}, 'Body')).toBe('Body\n');
	});

	it('round-trips properties without loss for the interpreted keys', () => {
		const text = '---\ntitle: T\naliases: [a]\ntags: [x, y]\n---\nBody';
		const parsed = parseMarkdownNote(text);
		const out = serializeMarkdownNote(parsed.properties, parsed.body);
		const reparsed = parseMarkdownNote(out);
		expect(reparsed.properties['title']).toBe('T');
		expect(reparsed.aliases).toEqual(['a']);
		expect(reparsed.tags).toEqual(['x', 'y']);
	});
});
