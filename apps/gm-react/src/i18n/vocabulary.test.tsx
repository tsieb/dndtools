// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	DND5E_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE,
	type SystemVocabulary,
} from '@dndtools/core';
import {
	I18nProvider,
	VocabularyProvider,
	useI18n,
	type MessageKey,
	loadCatalog,
	LOCALE_STORAGE_KEY,
} from './index';
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
	localStorage.removeItem(LOCALE_STORAGE_KEY);
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	localStorage.removeItem(LOCALE_STORAGE_KEY);
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
			'Ask your GM to change the session phase.',
		);
		expect(show(GENERIC_SYSTEM_PACKAGE.vocabulary, 'characters.dmNotes')).toBe('GM notes');
		expect(show(GENERIC_SYSTEM_PACKAGE.vocabulary, 'common.visibility.dmOnly')).toBe('GM only');
	});

	it('keeps a proper noun capitalized and lowercases a common noun mid-sentence', () => {
		expect(show(DND5E_SYSTEM_PACKAGE.vocabulary, 'session.header.blockedNotDm')).toBe(
			'Ask your DM to change the session phase.',
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

	it('uses a custom game-master name in board, safety and recovery instructions', () => {
		const vocabulary = { ...GENERIC_SYSTEM_PACKAGE.vocabulary, gameMaster: 'Keeper' };
		expect(show(vocabulary, 'board.title')).toBe('Keeper screen');
		expect(show(vocabulary, 'markdown.dmOnly')).toBe('Keeper only');
		expect(show(vocabulary, 'calendar.readOnly')).toBe(
			'Ask your Keeper to edit the campaign calendar.',
		);
	});

	it('keeps fixed game-master names out of both message catalogs', () => {
		for (const catalog of [en, es]) {
			for (const [key, message] of Object.entries(catalog)) {
				expect(message, key).not.toMatch(/\b(?:DM|DMs|GM|DJ|Dungeon Master)\b/);
			}
		}
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

const spanishMessages: readonly MessageKey[] = [
	'player.tab.levelUp',
	'player.vitals.spellSlots',
	'player.vitals.noSlotsTitle',
	'player.vitals.noSlotsBody',
	'player.vitals.preparedSpells',
	'player.vitals.noSpellsTitle',
	'player.vitals.noSpellsBody',
	'character.levelUp.byXp',
	'character.levelUp.byMilestone',
	'characters.finishLevelUp',
	'characters.levelUpXp',
	'characters.spellcasting',
	'characters.spellsPrepared',
	'characters.addSpell',
];

function SpanishMessages() {
	const { t } = useI18n();
	return (
		<>
			{spanishMessages.map((key) => (
				<p key={key}>{t(key, { count: 2 })}</p>
			))}
		</>
	);
}

// Mirrors AppSystemProvider: the reader's locale flows into vocabulary production.
function LocalizedPackage({
	vocabulary,
	locale,
}: {
	vocabulary: SystemVocabulary;
	locale: string;
}) {
	const { locale: activeLocale, setLocale } = useI18n();
	useEffect(() => setLocale(locale), [locale, setLocale]);
	return (
		<VocabularyProvider vocabulary={vocabulary} locale={activeLocale}>
			<SpanishMessages />
		</VocabularyProvider>
	);
}

async function showSpanish(vocabulary: SystemVocabulary, locale = 'es') {
	await loadCatalog(locale);
	await act(async () => {
		root.render(
			<I18nProvider>
				<LocalizedPackage vocabulary={vocabulary} locale={locale} />
			</I18nProvider>,
		);
	});
	return Array.from(container.querySelectorAll('p'), (element) => element.textContent);
}

describe('shipped vocabularies speak Spanish', () => {
	it.each([
		[DND5E_SYSTEM_PACKAGE, 'Conjuro', 'Conjuros', 'Subir de nivel'],
		[GENERIC_SYSTEM_PACKAGE, 'Habilidad', 'Habilidades', 'Avanzar'],
	] as const)(
		'renders all fourteen messages for $0.displayName, including a hydrated vocabulary',
		async (pkg, singular, plural, advance) => {
			const lower = singular.toLowerCase();
			expect(await showSpanish({ ...pkg.vocabulary })).toEqual([
				advance,
				`Espacios de ${singular}`,
				`Sin espacios de ${lower}`,
				`Todavía no se registran espacios de ${lower} para este personaje.`,
				`${plural} en preparación (2)`,
				`Sin ${plural.toLowerCase()} en el registro`,
				`${plural}: aquí puedes consultar lo que aprenda el personaje y marcar su preparación.`,
				`${advance} (PX)`,
				`${advance} (hito)`,
				`Terminar ${advance.toLowerCase()}`,
				`${advance} (PX)`,
				plural,
				`${plural} (2 en preparación)`,
				`Añadir ${lower}`,
			]);
		},
	);

	it('preserves every word of a custom vocabulary, even its shared English terms', async () => {
		const custom = { ...GENERIC_SYSTEM_PACKAGE.vocabulary, gameMaster: 'Keeper' };
		expect(vocabularyValues(custom, 'es')).toEqual(vocabularyValues(custom, 'en'));
		const rendered = await showSpanish(custom);
		expect(rendered[0]).toBe('Advance');
		expect(rendered[1]).toBe('Espacios de Ability');
		expect(rendered[11]).toBe('Abilities');
	});

	it('updates when the reader changes language or package', async () => {
		expect((await showSpanish(DND5E_SYSTEM_PACKAGE.vocabulary))[1]).toBe('Espacios de Conjuro');
		expect((await showSpanish(GENERIC_SYSTEM_PACKAGE.vocabulary))[1]).toBe('Espacios de Habilidad');
		expect((await showSpanish(GENERIC_SYSTEM_PACKAGE.vocabulary, 'en'))[1]).toBe('Ability slots');
	});

	it('supports regional Spanish and leaves other locales and source data unchanged', () => {
		for (const pkg of [DND5E_SYSTEM_PACKAGE, GENERIC_SYSTEM_PACKAGE]) {
			const original = { ...pkg.vocabulary };
			expect(vocabularyValues(pkg.vocabulary, 'es-MX')).toEqual(
				vocabularyValues(pkg.vocabulary, 'es'),
			);
			expect(vocabularyValues(pkg.vocabulary, 'fr')).toEqual(
				vocabularyValues(pkg.vocabulary, 'en'),
			);
			expect(pkg.vocabulary).toEqual(original);
		}
	});
});
