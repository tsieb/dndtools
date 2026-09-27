import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AbilityScore, abilityModifier } from './AbilityScore';

describe('AbilityScore package contract', () => {
	it.each([
		[8, '-1'],
		[9, '-1'],
		[10, '+0'],
		[11, '+0'],
		[16, '+3'],
	] as const)('formats score %i as signed text %s', (score, expected) => {
		expect(abilityModifier(score)).toBe(expected);
		expect(renderToStaticMarkup(<AbilityScore label="STR" score={score} />)).toContain(
			`>${expected}</span>`,
		);
	});

	it('renders unknown scores without inventing a modifier', () => {
		const markup = renderToStaticMarkup(<AbilityScore label="STR" score={null} />);
		expect(markup.match(/>—<\/span>/g)).toHaveLength(2);
	});

	it('keeps an authored modifier instead of deriving a replacement', () => {
		const markup = renderToStaticMarkup(<AbilityScore label="STR" score={16} modifier="+7" />);
		expect(markup).toContain('>+7</span>');
		expect(markup).not.toContain('>+3</span>');
	});
});
