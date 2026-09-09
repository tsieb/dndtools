import { DEFAULT_FEATURE_TIER, FEATURE_TIERS, type FeatureTier } from '@dndtools/core';
import {
	PREFERENCE_KEYS,
	readPreference,
	writePreference,
	type PreferenceKey,
} from '../../platform/preferences';
/* ---- Shared across the Settings subpages: the device-scoped display prefs and one error helper --- */
// The themes that render dark — mirrors the boot script's DARK map in index.html so a runtime theme
// switch keeps the native color-scheme (scrollbars, form controls) in sync. The boot script sets
// `style.colorScheme` inline, and an inline style beats the `[data-theme]{color-scheme}` rule, so this
// must update it too or switching across the dark/light boundary leaves controls on the wrong scheme.
const DARK_THEMES = new Set(['tavern', 'high-contrast']);

export function setDocAttr(attr: string, key: PreferenceKey, value: string) {
	document.documentElement.setAttribute(attr, value);
	if (attr === 'data-theme') {
		document.documentElement.style.colorScheme = DARK_THEMES.has(value) ? 'dark' : 'light';
	}
	writePreference(key, value);
	// The tier is read by the Settings shell for REAL nav gating — notify it so a click on a
	// complexity card re-filters the rail immediately (localStorage writes don't event same-tab).
	if (attr === TIER_ATTR) window.dispatchEvent(new Event(TIER_EVENT));
}

// The theme in effect before high contrast was last switched on, so the switch is reversible.
export const PREV_THEME_KEY = PREFERENCE_KEYS.previousTheme;

/* Device preferences are read and written through the platform layer (RC-UX-4.1). */
export const readLocal = (key: PreferenceKey) => readPreference(key);
export const writeLocal = (key: PreferenceKey, value: string) => writePreference(key, value);
/* ---- Experience complexity → real feature tier ------------------------------------------------
 * The 3-card "complexity" control is wired to the Core's progressive-disclosure model: each level maps
 * to a real `FeatureTier`, and the per-card reveals come from `visibleFeatures(tier)` (the same query the
 * onboarding surface reads), so the list is authoritative, not authored. The active tier is a device-local
 * display preference (Contract 1): persisted to localStorage (+ a `data-feature-tier` attr for any future
 * consumer). The tier is ENFORCED here: gated settings tabs (see TAB_GATE) hide below their gate's tier. */
export const TIER_KEY = PREFERENCE_KEYS.tier;
export const TIER_ATTR = 'data-feature-tier';
export const TIER_EVENT = 'dndtools:react:tier-changed';
export function readTier(): FeatureTier {
	const candidate = document.documentElement.getAttribute(TIER_ATTR) ?? readPreference(TIER_KEY);
	return (FEATURE_TIERS as readonly string[]).includes(candidate ?? '')
		? (candidate as FeatureTier)
		: DEFAULT_FEATURE_TIER;
}
export const errMsg = (e: unknown, fallback: string) =>
	e instanceof Error && e.message ? e.message : fallback;

/** Spell a core entity type ('scene', 'content.note') as a readable noun for a status surface. */
export function humanizeEntity(entityType: string): string {
	const readable = entityType.replace(/[._-]+/g, ' ').trim();
	return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : 'Campaign item';
}
