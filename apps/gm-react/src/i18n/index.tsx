import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
	formatDate as formatDateIn,
	formatDistance as formatDistanceIn,
	formatList as formatListIn,
	formatMessage,
	formatNumber as formatNumberIn,
	formatRelativeTime as formatRelativeTimeIn,
	formatTime as formatTimeIn,
	formatUnit as formatUnitIn,
	type MessageCatalog,
	type MessageValues,
	type UnitSystem,
} from './format';
import { en, type MessageKey } from './messages/en';
// RC-SYS-2.6 — the active system package's words reach `t` from here.
import { useVocabulary, withVocabulary } from './vocabulary';

export type { MessageCatalog, MessageKey, MessageValues, UnitSystem };
export {
	DEFAULT_VOCABULARY,
	VocabularyProvider,
	useVocabulary,
	vocabularyValues,
	type VocabularyValues,
} from './vocabulary';

/** The persisted preference is deliberately app-owned, rather than a browser setting: a GM can
 * share a device and needs the chosen language to survive relaunches and native shells. It is not
 * vault state — language belongs to the person holding the device, so two people sharing a synced
 * vault can read it in different languages (ADR-032 §6). */
export const LOCALE_STORAGE_KEY = 'dndtools:locale';

export const SUPPORTED_LOCALES = [
	{ code: 'en', label: 'English', nativeLabel: 'English' },
	{ code: 'es', label: 'Spanish', nativeLabel: 'Español' },
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]['code'];

/** Loaded catalogs. English is the source locale and is always present; the others arrive from
 * their own chunk, so a locale nobody selected costs nothing at startup. */
const CATALOGS: Partial<Record<SupportedLocale, MessageCatalog>> = { en };

/** Import a locale's catalog. English is already here; an import that fails (offline, a pruned
 * chunk) leaves the app rendering English rather than breaking the screen. */
export async function loadCatalog(locale: SupportedLocale): Promise<void> {
	if (CATALOGS[locale]) return;
	try {
		if (locale === 'es') CATALOGS.es = (await import('./messages/es')).es;
	} catch {
		// Fall through: `translate` degrades to the English source text for every key.
	}
}

export function normalizeLocale(value: string | null | undefined): SupportedLocale | null {
	if (!value) return null;
	const language = value.toLowerCase().split('-')[0];
	return SUPPORTED_LOCALES.some((locale) => locale.code === language)
		? (language as SupportedLocale)
		: null;
}

export function initialLocale(
	stored: string | null,
	browserLanguages: readonly string[] = [],
): SupportedLocale {
	return normalizeLocale(stored) ?? browserLanguages.map(normalizeLocale).find(Boolean) ?? 'en';
}

/** Resolve a key and render it. A key the active locale has not translated — or has not loaded
 * yet — renders its English source, so a partly translated locale reads as partly English rather
 * than showing a blank or a bare identifier. */
export function translate(
	locale: SupportedLocale,
	key: MessageKey,
	values?: MessageValues,
): string {
	const message = CATALOGS[locale]?.[key] ?? en[key] ?? key;
	return formatMessage(locale, message, values);
}

/** Share of the English key space a locale translates. Settings shows it, and RC-UX-1.2 gates on
 * it, so it belongs with the catalogs rather than in a script. Returns 0 until the catalog loads. */
export function catalogCoverage(locale: SupportedLocale): number {
	const keys = Object.keys(en) as MessageKey[];
	const catalog = CATALOGS[locale];
	if (!catalog || keys.length === 0) return locale === 'en' ? 1 : 0;
	return keys.filter((key) => catalog[key] !== undefined).length / keys.length;
}

type I18nContextValue = {
	locale: SupportedLocale;
	setLocale: (locale: SupportedLocale) => void;
	t: (key: MessageKey, values?: MessageValues) => string;
	formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
	formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
	formatTime: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
	formatRelativeTime: (value: Date | number, now?: Date | number) => string;
	formatList: (values: readonly string[], options?: Intl.ListFormatOptions) => string;
	/** Takes feet — the unit distances are stored in — and renders it in the rules' unit system. */
	formatDistance: (feet: number, system?: UnitSystem) => string;
	formatUnit: (value: number, unit: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
	const [locale, setLocaleState] = useState<SupportedLocale>(() => {
		try {
			return initialLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY), navigator.languages);
		} catch {
			return initialLocale(null, navigator.languages);
		}
	});
	// Bumped once the chosen locale's chunk is in, which is what re-renders the tree in the new
	// language. Until then every key renders its English source (ADR-032 §1).
	const [loaded, setLoaded] = useState(0);
	useEffect(() => {
		let cancelled = false;
		void loadCatalog(locale).then(() => {
			if (!cancelled) setLoaded((count) => count + 1);
		});
		return () => {
			cancelled = true;
		};
	}, [locale]);
	useEffect(() => {
		document.documentElement.lang = locale;
		try {
			window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
		} catch {
			// Private browsing may reject storage; the live preference still works for this session.
		}
	}, [locale]);
	const value = useMemo<I18nContextValue>(
		() => ({
			locale,
			setLocale: setLocaleState,
			t: (key, values) => translate(locale, key, values),
			formatNumber: (number, options) => formatNumberIn(locale, number, options),
			formatDate: (date, options) => formatDateIn(locale, date, options),
			formatTime: (date, options) => formatTimeIn(locale, date, options),
			formatRelativeTime: (date, now) => formatRelativeTimeIn(locale, date, now),
			formatList: (values, options) => formatListIn(locale, values, options),
			formatDistance: (feet, system) => formatDistanceIn(locale, feet, system),
			formatUnit: (number, unit) => formatUnitIn(locale, number, unit),
		}),
		// `loaded` is a render key, not a value: the callbacks read the catalog at call time.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[locale, loaded],
	);
	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * The app's translator. `t` is wrapped rather than returned raw so that every call site — all of
 * them, without a single edit — resolves the rules system's vocabulary placeholders (`{gm}`,
 * `{spell}`, `{levelUp}`) from the ACTIVE system package (RC-SYS-2.6). A caller that passes its
 * own value for one of those names still wins.
 */
export function useI18n(): I18nContextValue {
	const context = useContext(I18nContext);
	if (!context) throw new Error('useI18n must be used inside I18nProvider.');
	const vocabulary = useVocabulary();
	return useMemo(
		() => ({ ...context, t: (key, values) => context.t(key, withVocabulary(vocabulary, values)) }),
		[context, vocabulary],
	);
}
