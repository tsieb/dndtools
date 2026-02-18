import { describe, expect, it } from 'vitest';
import { extractWikilinks } from './link-extractor.js';

describe('extractWikilinks', () => {
	it('extracts regular wikilinks', () => {
		const links = extractWikilinks('See [[Waterdeep|the city]].');
		expect(links).toHaveLength(1);
		expect(links[0]?.title).toBe('Waterdeep');
		expect(links[0]?.displayText).toBe('the city');
	});

	it('ignores object embeds', () => {
		const links = extractWikilinks('![[obj:character:abc123|Aria]] and [[Neverwinter]]');
		expect(links).toHaveLength(1);
		expect(links[0]?.title).toBe('Neverwinter');
	});

	it('includes note embeds for graph indexing', () => {
		const links = extractWikilinks('![[note:abc123|Aria]] and [[Neverwinter]]');
		expect(links).toHaveLength(2);
		expect(links[0]?.targetIdHint).toBe('abc123');
		expect(links[1]?.title).toBe('Neverwinter');
	});
});
