// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { parseWikilink as parseInVault } from './knowledge';
import { parseWikilink as parseInReader } from './WikiReader';

// `[[wikilinks]]` used to render accent-coloured but INERT in both readers — the DM's vault
// (Knowledge) and the public wiki (WikiReader). Making them navigable means parsing Obsidian's own
// `[[Target#Section|Label]]` form, which is what the vaults are authored in. The two screens resolve
// against different indexes (the core's actor-filtered candidates vs. the loaded page list), so they
// keep separate parsers — but they must agree on what a link says.
const parsers: Array<[string, (raw: string) => { target: string; label: string }]> = [
	['Knowledge', parseInVault],
	['WikiReader', parseInReader],
];

describe.each(parsers)('%s parseWikilink', (_name, parseWikilink) => {
	it('reads a bare target as both target and label', () => {
		expect(parseWikilink('[[Harbor Bell]]')).toMatchObject({
			target: 'Harbor Bell',
			label: 'Harbor Bell',
		});
	});

	it('uses the alias after | as the visible label', () => {
		expect(parseWikilink('[[Harbor Bell|the old bell]]')).toMatchObject({
			target: 'Harbor Bell',
			label: 'the old bell',
		});
	});

	it('strips a #section anchor off the navigation target', () => {
		// The anchor must not become part of the title we look up, or nothing would ever resolve.
		expect(parseWikilink('[[Harbor Bell#Rumors]]').target).toBe('Harbor Bell');
	});

	it('keeps the alias when the link has both a section and an alias', () => {
		expect(parseWikilink('[[Harbor Bell#Rumors|what they say]]')).toMatchObject({
			target: 'Harbor Bell',
			label: 'what they say',
		});
	});

	it('trims surrounding whitespace so a padded link still resolves', () => {
		expect(parseWikilink('[[  Harbor Bell  ]]').target).toBe('Harbor Bell');
	});

	it('yields an empty target for an empty link rather than throwing', () => {
		// An empty target is what the callers test for before offering a navigation affordance.
		expect(parseWikilink('[[]]').target).toBe('');
	});
});

describe('Knowledge parseWikilink section anchor', () => {
	it('surfaces the section so the core resolver can flag a missing one', () => {
		// Knowledge resolves through `resolveWikilinkForActor`, which takes `{ target, section }` and
		// reports `sectionMissing` — so unlike the reader, it must not discard the anchor.
		expect(parseInVault('[[Harbor Bell#Rumors]]').section).toBe('Rumors');
		expect(parseInVault('[[Harbor Bell]]').section).toBeUndefined();
	});
});
