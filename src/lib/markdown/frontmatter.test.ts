import { describe, it, expect } from 'vitest';
import {
	extractFrontmatter,
	extractTags,
	extractTitle,
	stringifyFrontmatter,
	upsertFrontmatter,
} from './frontmatter.js';

describe('extractFrontmatter', () => {
	it('extracts YAML frontmatter', () => {
		const content = '---\ntitle: Test Note\ntags: [npc]\n---\n\n# Hello';
		const result = extractFrontmatter(content);
		expect(result.frontmatter['title']).toBe('Test Note');
		expect(result.body).toBe('# Hello');
	});

	it('handles missing frontmatter', () => {
		const content = '# Just a heading\n\nSome text';
		const result = extractFrontmatter(content);
		expect(result.frontmatter).toEqual({});
		expect(result.body).toBe(content);
	});

	it('handles invalid YAML gracefully', () => {
		const content = '---\n{{{invalid\n---\n\nContent';
		const result = extractFrontmatter(content);
		expect(result.frontmatter).toEqual({});
	});

	it('handles empty frontmatter', () => {
		const content = '---\n---\n\nContent';
		const result = extractFrontmatter(content);
		expect(result.body).toBe('Content');
	});
});

describe('extractTags', () => {
	it('extracts tags from frontmatter array', () => {
		const tags = extractTags({ tags: ['npc', 'waterdeep'] }, '');
		expect(tags).toContain('npc');
		expect(tags).toContain('waterdeep');
	});

	it('extracts inline #tags', () => {
		const tags = extractTags({}, 'This is about #dragons and #magic');
		expect(tags).toContain('dragons');
		expect(tags).toContain('magic');
	});

	it('combines frontmatter and inline tags', () => {
		const tags = extractTags({ tags: ['npc'] }, 'Has #magic too');
		expect(tags).toContain('npc');
		expect(tags).toContain('magic');
	});

	it('deduplicates tags', () => {
		const tags = extractTags({ tags: ['npc'] }, '#npc appears again');
		expect(tags.filter((t) => t === 'npc')).toHaveLength(1);
	});

	it('normalizes to lowercase', () => {
		const tags = extractTags({ tags: ['NPC'] }, '#MAGIC');
		expect(tags).toContain('npc');
		expect(tags).toContain('magic');
	});

	it('skips tags inside code blocks', () => {
		const content = '```\n#not-a-tag\n```\n\n#real-tag';
		const tags = extractTags({}, content);
		expect(tags).not.toContain('not-a-tag');
		expect(tags).toContain('real-tag');
	});

	it('returns sorted array', () => {
		const tags = extractTags({}, '#zebra #alpha #middle');
		expect(tags).toEqual(['alpha', 'middle', 'zebra']);
	});
});

describe('extractTitle', () => {
	it('prefers frontmatter title', () => {
		const title = extractTitle({ title: 'FM Title' }, '# Heading Title');
		expect(title).toBe('FM Title');
	});

	it('falls back to first heading', () => {
		const title = extractTitle({}, '# My Heading\n\nSome text');
		expect(title).toBe('My Heading');
	});

	it('returns Untitled when no title found', () => {
		const title = extractTitle({}, 'Just some text without heading');
		expect(title).toBe('Untitled');
	});

	it('trims whitespace', () => {
		const title = extractTitle({ title: '  Spaced  ' }, '');
		expect(title).toBe('Spaced');
	});
});

describe('stringifyFrontmatter', () => {
	it('returns empty string when there are no values', () => {
		expect(stringifyFrontmatter({ title: '', tags: [] })).toBe('');
	});

	it('builds a frontmatter block with valid keys', () => {
		const result = stringifyFrontmatter({ title: 'Test', tags: ['npc'] });
		expect(result.startsWith('---\n')).toBe(true);
		expect(result).toContain('title: Test');
		expect(result).toContain('- npc');
	});
});

describe('upsertFrontmatter', () => {
	it('adds frontmatter to markdown without a frontmatter block', () => {
		const content = '# Heading\n\nBody';
		const result = upsertFrontmatter(content, { type: 'npc' });
		expect(result).toContain('type: npc');
		expect(result).toContain('# Heading');
	});

	it('updates existing keys and keeps body intact', () => {
		const content = '---\ntype: old\n---\n\nBody';
		const result = upsertFrontmatter(content, { type: 'new', status: 'active' });
		expect(result).toContain('type: new');
		expect(result).toContain('status: active');
		expect(result.endsWith('Body')).toBe(true);
	});
});
