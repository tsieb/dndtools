// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
	ownsEscape,
	popEscapeLayer,
	pushEscapeLayer,
	resetEscapeLayersForTest,
} from './escapeLayers';

afterEach(() => {
	resetEscapeLayersForTest();
	document.body.replaceChildren();
});

/** A sheet panel with a popover panel nested inside it, as the phone map dock renders them. */
function nestedPanels() {
	const sheet = document.createElement('div');
	const popover = document.createElement('div');
	sheet.appendChild(popover);
	document.body.appendChild(sheet);
	return { sheet, popover };
}

describe('escape layer ownership', () => {
	it('gives Escape to the overlay nested INSIDE another, not the one that registered last', () => {
		// The live case: MapEditor renders a Sheet ("Map panels") whose body holds LayersPanel's
		// layer-opacity Popover. Registration order cannot decide this — React runs child effects
		// before parent effects, so a chain mounted in one commit registers innermost-FIRST, while a
		// popover opened later inside an already-open sheet registers LAST. Containment is true in
		// both cases, which is why this is a DOM test and not an ordering one.
		const { sheet, popover } = nestedPanels();
		const sheetToken = pushEscapeLayer(() => sheet);
		const popoverToken = pushEscapeLayer(() => popover);

		expect(ownsEscape(popoverToken)).toBe(true);
		expect(ownsEscape(sheetToken)).toBe(false);
	});

	it('resolves the same way when the outer overlay registered last', () => {
		const { sheet, popover } = nestedPanels();
		const popoverToken = pushEscapeLayer(() => popover);
		const sheetToken = pushEscapeLayer(() => sheet);

		expect(ownsEscape(popoverToken)).toBe(true);
		expect(ownsEscape(sheetToken)).toBe(false);
	});

	it('hands ownership back to the outer overlay once the nested one closes', () => {
		const { sheet, popover } = nestedPanels();
		const sheetToken = pushEscapeLayer(() => sheet);
		const popoverToken = pushEscapeLayer(() => popover);
		popEscapeLayer(popoverToken);

		expect(ownsEscape(sheetToken)).toBe(true);
	});

	it('leaves two overlays that merely overlap exactly as they were', () => {
		// Deliberately narrow: only NESTING makes a surface stand down. Anything else keeps its old
		// behaviour, so this can never leave a surface un-dismissable.
		const a = document.createElement('div');
		const b = document.createElement('div');
		document.body.append(a, b);
		const first = pushEscapeLayer(() => a);
		const second = pushEscapeLayer(() => b);

		expect(ownsEscape(first)).toBe(true);
		expect(ownsEscape(second)).toBe(true);
	});

	it('owns Escape when its element is not mounted yet, and tolerates a double release', () => {
		// The token is claimed in the open effect, before the ref has necessarily settled — fail open.
		const token = pushEscapeLayer(() => null);
		expect(ownsEscape(token)).toBe(true);
		popEscapeLayer(token);
		expect(() => popEscapeLayer(token)).not.toThrow();
		expect(ownsEscape(token)).toBe(true);
	});
});
