import { describe, expect, it } from 'vitest';
import {
	extractInlineRolls,
	extractWikilinks,
	parseInlineRoll,
	parseMarkdownNote,
	rollExpression,
} from '../src';

/**
 * RC-SES-2.2 — inline `[[roll:1d20+5]]` grammar. The point of parsing this in the core is that the
 * DM's renderer and the player's projection can never disagree about which `[[...]]` is a die, so
 * these tests pin both halves: what a roll parses to, and what it is deliberately NOT (a wikilink).
 */
describe('RC-SES-2.2 inline roll parsing', () => {
	it('parses a bare expression', () => {
		expect(parseInlineRoll('[[roll:1d20+5]]')).toEqual({
			expression: '1d20+5',
			raw: '[[roll:1d20+5]]',
		});
	});

	it('parses an authored label after the pipe', () => {
		expect(parseInlineRoll('[[roll:1d20+5|Stealth check]]')).toEqual({
			expression: '1d20+5',
			label: 'Stealth check',
			raw: '[[roll:1d20+5|Stealth check]]',
		});
	});

	it('is case-insensitive on the marker and tolerates surrounding space', () => {
		expect(parseInlineRoll('[[ ROLL:2d6 ]]')?.expression).toBe('2d6');
	});

	it('is not a roll without the marker', () => {
		expect(parseInlineRoll('[[Waterdeep]]')).toBeNull();
		expect(parseInlineRoll('[[rolling:1d20]]')).toBeNull();
	});

	it('refuses an empty expression rather than producing a rollless control', () => {
		expect(parseInlineRoll('[[roll:]]')).toBeNull();
		expect(parseInlineRoll('[[roll: |Label]]')).toBeNull();
	});

	it('extracts every roll in a body, in document order, duplicates preserved', () => {
		const body = 'Climb: [[roll:1d20+3]] then again [[roll:1d20+3]] and [[roll:2d6|Damage]].';
		expect(extractInlineRolls(body).map((r) => r.expression)).toEqual(['1d20+3', '1d20+3', '2d6']);
		expect(extractInlineRolls(body)[2]?.label).toBe('Damage');
	});

	it('keeps rolls out of the wikilink set so they never become backlinks', () => {
		const body = 'See [[Waterdeep]] and roll [[roll:1d20+5|Stealth check]].';
		expect(extractWikilinks(body).map((link) => link.target)).toEqual(['Waterdeep']);
		expect(parseMarkdownNote(body).wikilinks.map((link) => link.target)).toEqual(['Waterdeep']);
	});

	it('yields an expression the core dice engine can actually roll', () => {
		const parsed = parseInlineRoll('[[roll:1d20+5|Stealth check]]')!;
		const rolled = rollExpression(parsed.expression, 42);
		expect(rolled.ok).toBe(true);
		if (!rolled.ok) return;
		expect(rolled.result.total).toBeGreaterThanOrEqual(6);
		expect(rolled.result.total).toBeLessThanOrEqual(25);
		// Same expression + same seed ⇒ same outcome, so an inline roll replays like any other.
		const again = rollExpression(parsed.expression, 42);
		expect(again.ok && again.result.total).toBe(rolled.result.total);
	});
});
