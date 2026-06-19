import { getContext, setContext } from 'svelte';

/**
 * UX-VIS-001 / UX-VIS-003: theme is a DEVICE-LOCAL display preference owned by the GUI
 * (Contract 1), not durable vault state. The store resolves the user preference into the applied
 * `data-theme` attribute on <html>, persists it across sessions, follows the OS preference when
 * set to `system`, and emits an accessible announcement on change.
 *
 * Dark-first: a fresh install defaults to `system`, which resolves to the warm-dark `tavern`
 * theme when the OS reports a dark preference (UX-VIS-001).
 *
 * The full token values for every theme live in `apps/gm/src/routes/styles.css`; switching is
 * a single attribute swap with no per-component logic.
 *
 * This is a platform-layer store (like `navigation-history.svelte.ts`): it owns the device-local
 * persistence primitive (`localStorage`) and the OS colour-scheme probe (`matchMedia`) behind the
 * declared `theme-preference` exception in `platform-access-exceptions.json` (PLAT-006 / PLAT-012),
 * so GUI components consume it through the provided context rather than touching host globals.
 */

/** Applied theme = one of the three named themes shipped in the stylesheet. */
export const NAMED_THEMES = ['tavern', 'parchment', 'high-contrast'] as const;
export type AppliedTheme = (typeof NAMED_THEMES)[number];

/** User-selectable preferences: the five named themes plus `system` (follow OS). */
export const THEME_PREFERENCES = ['system', ...NAMED_THEMES] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

/** Themes that resolve to a dark `color-scheme` (used for the OS `system` mapping + scheme hint). */
const DARK_THEMES = new Set<AppliedTheme>(['tavern', 'high-contrast']);

export interface ThemeOption {
	readonly id: ThemePreference;
	readonly label: string;
	readonly description: string;
	/** Representative swatch colour for the selector dot (display hint only). */
	readonly swatch: string;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
	{ id: 'system', label: 'System', description: 'Match the operating system', swatch: '#888888' },
	{ id: 'tavern', label: 'Tavern', description: 'Dark, warm (default)', swatch: '#e0b06f' },
	{ id: 'parchment', label: 'Parchment', description: 'Light, warm', swatch: '#9a5418' },
	{
		id: 'high-contrast',
		label: 'High contrast',
		description: 'Maximum legibility (AAA)',
		swatch: '#ffff00',
	},
];

const STORAGE_KEY = 'dndtools:v2:theme';

function isThemePreference(value: unknown): value is ThemePreference {
	return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/** Resolve `system` against an OS-dark flag; named themes pass through. */
export function resolveAppliedTheme(preference: ThemePreference, osPrefersDark: boolean): AppliedTheme {
	if (preference === 'system') return osPrefersDark ? 'tavern' : 'parchment';
	return preference;
}

export function isDarkTheme(theme: AppliedTheme): boolean {
	return DARK_THEMES.has(theme);
}

export class ThemeStore {
	#preference = $state<ThemePreference>(DEFAULT_THEME_PREFERENCE);
	#osPrefersDark = $state<boolean>(true); // dark-first default until the OS is probed
	#announcement = $state<string>('');

	get preference(): ThemePreference {
		return this.#preference;
	}

	/** The theme actually written to `data-theme` (resolves `system`). */
	get appliedTheme(): AppliedTheme {
		return resolveAppliedTheme(this.#preference, this.#osPrefersDark);
	}

	get options(): readonly ThemeOption[] {
		return THEME_OPTIONS;
	}

	/** Live-region text for the most recent theme change (UX-VIS-001 announcement). */
	get announcement(): string {
		return this.#announcement;
	}

	/** Set the preference (fail-closed on unknown values), persist, apply, and announce. */
	setPreference(preference: ThemePreference): void {
		if (!isThemePreference(preference)) return;
		this.#preference = preference;
		this.#persist();
		this.#apply();
		this.#announce();
	}

	/**
	 * Wire the store to the host once, from the app shell. Reads the persisted preference, probes
	 * the OS colour-scheme, applies the resolved theme, and subscribes to OS preference changes so
	 * `system` tracks the OS live. Returns a cleanup function. SSR/test-safe.
	 */
	init(): () => void {
		if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

		const stored = this.#readStored();
		if (stored) this.#preference = stored;

		const query =
			typeof window.matchMedia === 'function'
				? window.matchMedia('(prefers-color-scheme: dark)')
				: null;
		if (query) this.#osPrefersDark = query.matches;

		this.#apply();

		if (!query) return () => {};
		const onChange = (event: MediaQueryListEvent) => {
			this.#osPrefersDark = event.matches;
			// Only re-apply for `system`; an explicit named theme ignores OS changes.
			if (this.#preference === 'system') this.#apply();
		};
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	}

	#readStored(): ThemePreference | null {
		try {
			const raw = window.localStorage?.getItem(STORAGE_KEY);
			return isThemePreference(raw) ? raw : null;
		} catch {
			return null;
		}
	}

	#persist(): void {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage?.setItem(STORAGE_KEY, this.#preference);
		} catch {
			// Storage may be unavailable (private mode); the in-memory preference still applies.
		}
	}

	#apply(): void {
		if (typeof document === 'undefined') return;
		const theme = this.appliedTheme;
		const root = document.documentElement;
		root.setAttribute('data-theme', theme);
		root.style.colorScheme = isDarkTheme(theme) ? 'dark' : 'light';
	}

	#announce(): void {
		const option = THEME_OPTIONS.find((entry) => entry.id === this.#preference);
		const label = option?.label ?? this.#preference;
		this.#announcement =
			this.#preference === 'system'
				? `Theme set to System (${this.appliedTheme})`
				: `Theme changed to ${label}`;
	}
}

const KEY = Symbol('dndtools:v2:theme');

export function provideTheme(store: ThemeStore): ThemeStore {
	setContext(KEY, store);
	return store;
}

export function useTheme(): ThemeStore {
	const store = getContext<ThemeStore | undefined>(KEY);
	if (!store) {
		throw new Error('ThemeStore context is missing; mount inside the root layout.');
	}
	return store;
}
