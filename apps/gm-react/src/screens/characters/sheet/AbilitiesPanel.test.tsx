// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CharacterView } from '@dndtools/core';
import { I18nProvider } from '../../../i18n';
import { AbilitiesPanel } from './AbilitiesPanel';

/**
 * RC-DSN-2.1 — the DS `abilityModifier` returns signed display text ("+3"), which the old `any`
 * facade typed as a number. Adding the proficiency bonus to it concatenated strings: STR 16 with a
 * +2 bonus rendered "++32" instead of "+5". The sums must use the numeric core query.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe('AbilitiesPanel bonuses', () => {
	it('adds the proficiency bonus to the numeric ability modifier', () => {
		const prof: CharacterView['proficiencies'] = {
			skills: { athletics: 'proficient', acrobatics: 'expertise' },
			saves: ['str'],
			proficiencyBonus: null,
			hitDice: { die: 'd10', total: 0, spent: 0 },
		};
		const view = {
			abilityScores: { str: 16, dex: 8, con: 10, int: 10, wis: 10, cha: 10 },
			proficiencies: prof,
		} as unknown as CharacterView;
		act(() =>
			root.render(
				<I18nProvider>
					<AbilitiesPanel
						view={view}
						prof={prof}
						profBonus={2}
						passivePer={null}
						hasProficiencyData
						abilityCells={[{ key: 'STR', val: 16 }]}
						isPhone={false}
					/>
				</I18nProvider>,
			),
		);
		const text = container.textContent ?? '';
		// Saving throws: STR +3 proficient = +5; DEX -1 unproficient = -1.
		expect(text).toContain('STR+5');
		expect(text).toContain('DEX-1');
		// Skills: Athletics (STR, proficient) +5; Acrobatics (DEX, expertise) -1 + 4 = +3.
		expect(text).toContain('Athletics+5');
		expect(text).toContain('Acrobatics ★+3');
		expect(text).not.toMatch(/\+\+|\+-/);
		// The ability-score display keeps the DS signed-string helper.
		expect(text).toContain('+3');
	});
});
