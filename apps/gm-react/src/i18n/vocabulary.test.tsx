// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	DND5E_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE,
	type SystemVocabulary,
} from '@dndtools/core';
import { I18nProvider, VocabularyProvider, useI18n, type MessageKey } from './index';
import { vocabularyValues } from './vocabulary';
import { en } from './messages/en';
import { es } from './messages/es';

/**
 * RC-SYS-2.6 — the catalog never spells out "DM" or "spell": a key carries a placeholder and the
 * ACTIVE system package supplies the word. These tests drive the real provider chain rather than
 * the formatter, because the point of the story is that no call site had to change to gain this.
 */

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

function Chrome({ messageKey }: { messageKey: MessageKey }) {
	const { t } = useI18n();
	return <p>{t(messageKey)}</p>;
}

/** Render one message the way a screen would: through `t`, under a package's vocabulary. */
function show(vocabulary: SystemVocabulary | null, messageKey: MessageKey): string {
	act(() => {
		root.render(
			<I18nProvider>
				{vocabulary ? (
					<VocabularyProvider vocabulary={vocabulary}>
						<Chrome messageKey={messageKey} />
					</VocabularyProvider>
				) : (
					<Chrome messageKey={messageKey} />
				)}
			</I18nProvider>,
		);
	});
	return container.textContent ?? '';
}

describe('the active system package names things', () => {
	it('calls the game master what the active package calls them', () => {
		expect(show(DND5E_SYSTEM_PACKAGE.vocabulary, 'nav.gmScreen')).toBe('DM screen');
		expect(show(GENERIC_SYSTEM_PACKAGE.vocabulary, 'nav.gmScreen')).toBe('GM screen');
	});

	it('renames the chrome across sections without a single call-site change', () => {
		expect(show(GENERIC_SYSTEM_PACKAGE.vocabulary, 'session.header.blockedNotDm')).toBe(
			'Only the GM can change the session phase.',
		);
		expect(show(GENERIC_SYSTEM_PACKAGE.vocabulary, 'characters.dmNotes')).toBe('GM notes');
		expect(show(GENERIC_SYSTEM_PACKAGE.vocabulary, 'common.visibility.dmOnly')).toBe('GM only');
	});

	it('keeps a proper noun capitalized and lowercases a common noun mid-sentence', () => {
		expect(show(DND5E_SYSTEM_PACKAGE.vocabulary, 'session.header.blockedNotDm')).toBe(
			'Only the DM can change the session phase.',
		);
		expect(show(GENERIC_SYSTEM_PACKAGE.vocabulary, 'player.vitals.noSlotsTitle')).toBe(
			'No ability slots',
		);
		expect(show(DND5E_SYSTEM_PACKAGE.vocabulary, 'player.vitals.noSlotsTitle')).toBe(
			'No spell slots',
		);
	});

	it('renames the advancement verb, so Generic never says "level up"', () => {
		expect(show(DND5E_SYSTEM_PACKAGE.vocabulary, 'characters.levelUpXp')).toBe('Level up (XP)');
		expect(show(GENERIC_SYSTEM_PACKAGE.vocabulary, 'characters.levelUpXp')).toBe('Advance (XP)');
		expect(show(GENERIC_SYSTEM_PACKAGE.vocabulary, 'characters.finishLevelUp')).toBe(
			'Finish advance',
		);
	});

	it('falls back to the default 5e vocabulary outside a provider, never to bare braces', () => {
		expect(show(null, 'common.visibility.dmOnly')).toBe('DM only');
	});

	it('exposes both cases of every renameable word', () => {
		const values = vocabularyValues(GENERIC_SYSTEM_PACKAGE.vocabulary);
		expect(values.gm).toBe('GM');
		expect(values.spell).toBe('Ability');
		expect(values.spellLower).toBe('ability');
		expect(values.spellPluralLower).toBe('abilities');
		expect(values.levelUp).toBe('Advance');
		expect(values.levelUpLower).toBe('advance');
	});

	it('leaves no vocabulary placeholder in the navigation catalog unsupplied', () => {
		// Navigation is where an unresolved `{gm}` would be most visible, and it is the one part of
		// the catalog whose messages take no caller arguments at all — so every argument in it must
		// be one the package fills.
		const supplied = new Set(Object.keys(vocabularyValues(DND5E_SYSTEM_PACKAGE.vocabulary)));
		const unsupplied: string[] = [];
		for (const catalog of [en, es] as Record<string, string>[]) {
			for (const [key, message] of Object.entries(catalog)) {
				if (!key.startsWith('nav.') && !key.startsWith('section.')) continue;
				for (const match of message.matchAll(/\{\s*(\w+)\s*\}/g)) {
					if (!supplied.has(match[1])) unsupplied.push(`${key}: {${match[1]}}`);
				}
			}
		}
		expect(unsupplied).toEqual([]);
	});
});
