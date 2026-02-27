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

	it('ignores escaped wikilink openers', () => {
		const links = extractWikilinks(String.raw`Literal \[[Not a link]] then [[Real Link]].`);
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({ title: 'Real Link', displayText: 'Real Link' });
	});

	it('supports escaped delimiters in target and display', () => {
		const links = extractWikilinks(String.raw`[[A\|B|Shown \] value]]`);
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({
			title: 'A|B',
			displayText: 'Shown ] value',
		});
	});

	it('supports id-hint links with escaped display content', () => {
		const links = extractWikilinks(String.raw`[[note:abc123|Aria \| the \] Bard]]`);
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({
			targetIdHint: 'abc123',
			title: 'Aria | the ] Bard',
			displayText: 'Aria | the ] Bard',
		});
	});

	it('can skip embeds when requested', () => {
		const links = extractWikilinks('![[Neverwinter]] and [[Waterdeep]]', { includeEmbeds: false });
		expect(links).toHaveLength(1);
		expect(links[0]?.title).toBe('Waterdeep');
	});
});
