import { translate, type MessageKey, type MessageValues } from '../../i18n';
import { DEFAULT_VOCABULARY, vocabularyValues, withVocabulary } from '../../i18n/vocabulary';

const DEFAULT_WORDS = vocabularyValues(DEFAULT_VOCABULARY);

/** A message lookup: the `t` of `useI18n()`, or {@link englishCopy} outside React. */
export type Translate = (key: MessageKey, values?: MessageValues) => string;

/**
 * RC-POL-1.2 — English with the default vocabulary: what a framework-free canvas helper says when
 * no `t` is handed in (unit tests, pure geometry callers). Components pass their own `t`.
 */
export const englishCopy: Translate = (key, values) =>
	translate('en', key, withVocabulary(DEFAULT_WORDS, values));
