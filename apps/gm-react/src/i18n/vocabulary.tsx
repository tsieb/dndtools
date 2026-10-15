import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
	DND5E_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE,
	type SystemVocabulary,
} from '@dndtools/core';
import type { MessageValues } from './format';

/**
 * RC-SYS-2.6 — the rules system's words, injected into every translated message.
 *
 * A message key never spells out "DM" or "spell": it carries a placeholder (`{gm}`, `{spell}`,
 * `{levelUp}`) and `useI18n().t` fills it from the ACTIVE system package's vocabulary. 5e says
 * "DM" and "Spell"; Generic says "GM" and "Ability"; a horror package says "Keeper". One catalog,
 * every system, and a translator still sees one Spanish string per concept rather than one per
 * package.
 *
 * Placeholders come in two cases because English does. `{gm}` is a proper noun and never lowercases
 * ("Only the DM can…", "Only the Keeper can…"); the words that appear mid-sentence as common nouns
 * get a `…Lower` twin, lowercased in the reader's locale rather than by ASCII.
 */
export type VocabularyValues = Readonly<Record<string, string>>;

// Match the complete vocabulary, not individual English words: a DM-authored set is
// authoritative. Compare values because vault hydration copies the built-in objects.
const SPANISH_VOCABULARIES: readonly (readonly [SystemVocabulary, SystemVocabulary])[] = [
	[
		DND5E_SYSTEM_PACKAGE.vocabulary,
		{
			gameMaster: 'DJ',
			player: 'Jugador',
			character: 'Personaje',
			ability: 'Conjuro',
			abilityPlural: 'Conjuros',
			levelUpVerb: 'Subir de nivel',
			levelNoun: 'Nivel',
			hitPoints: 'Puntos de golpe',
			session: 'Sesión',
			campaign: 'Campaña',
		},
	],
	[
		GENERIC_SYSTEM_PACKAGE.vocabulary,
		{
			gameMaster: 'DJ',
			player: 'Jugador',
			character: 'Personaje',
			ability: 'Habilidad',
			abilityPlural: 'Habilidades',
			levelUpVerb: 'Avanzar',
			levelNoun: 'Hito',
			hitPoints: 'Salud',
			session: 'Sesión',
			campaign: 'Historia',
		},
	],
];

function localizedVocabulary(vocabulary: SystemVocabulary, locale: string): SystemVocabulary {
	if (locale.toLowerCase().split('-')[0] !== 'es') return vocabulary;
	return (
		SPANISH_VOCABULARIES.find(([source]) =>
			(Object.keys(source) as (keyof SystemVocabulary)[]).every(
				(key) => source[key] === vocabulary[key],
			),
		)?.[1] ?? vocabulary
	);
}

export function vocabularyValues(
	vocabulary: SystemVocabulary,
	locale: string = 'en',
): VocabularyValues {
	vocabulary = localizedVocabulary(vocabulary, locale);
	const lower = (value: string) => value.toLocaleLowerCase(locale);
	return Object.freeze({
		gm: vocabulary.gameMaster,
		player: vocabulary.player,
		playerLower: lower(vocabulary.player),
		character: vocabulary.character,
		characterLower: lower(vocabulary.character),
		spell: vocabulary.ability,
		spellLower: lower(vocabulary.ability),
		spellPlural: vocabulary.abilityPlural,
		spellPluralLower: lower(vocabulary.abilityPlural),
		levelUp: vocabulary.levelUpVerb,
		levelUpLower: lower(vocabulary.levelUpVerb),
		level: vocabulary.levelNoun,
		levelLower: lower(vocabulary.levelNoun),
		hitPoints: vocabulary.hitPoints,
		session: vocabulary.session,
		campaign: vocabulary.campaign,
	});
}

/**
 * The fallback is 5e's vocabulary, not empty strings: the runtime seeds 5e as the default package,
 * so a surface rendered outside the provider (a unit test, an error boundary above the runtime)
 * reads the same words the app shows on a fresh vault instead of bare `{gm}` braces.
 */
export const DEFAULT_VOCABULARY: SystemVocabulary = DND5E_SYSTEM_PACKAGE.vocabulary;

const VocabularyContext = createContext<VocabularyValues>(vocabularyValues(DEFAULT_VOCABULARY));

export function VocabularyProvider({
	vocabulary,
	locale,
	children,
}: {
	vocabulary: SystemVocabulary;
	locale?: string;
	children: ReactNode;
}) {
	const values = useMemo(() => vocabularyValues(vocabulary, locale), [vocabulary, locale]);
	return <VocabularyContext.Provider value={values}>{children}</VocabularyContext.Provider>;
}

export function useVocabulary(): VocabularyValues {
	return useContext(VocabularyContext);
}

/** Vocabulary first, the call site's own values second: a caller may always override a word. */
export function withVocabulary(
	vocabulary: VocabularyValues,
	values: MessageValues | undefined,
): MessageValues {
	return values ? { ...vocabulary, ...values } : vocabulary;
}
