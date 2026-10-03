import {
	DEFAULT_FEATURE_TIER,
	FEATURE_TIERS,
	SECTION_FEATURE_GATES,
	type FeatureTier,
} from '@dndtools/core';
import {
	PREFERENCE_KEYS,
	readPreference,
	writePreference,
	type PreferenceKey,
} from '../../platform/preferences';
import { applyThemePreference } from '../../platform/theme';
/* ---- Shared across the Settings subpages: the device-scoped display prefs and one error helper --- */
export function setDocAttr(attr: string, key: PreferenceKey, value: string) {
	if (attr === 'data-theme') {
		// A theme preference can be `system`, which is not itself a `data-theme` value; the platform
		// layer resolves it, paints the preset, keeps the native color-scheme in step, and persists it.
		applyThemePreference(value);
		return;
	}
	document.documentElement.setAttribute(attr, value);
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

/** RC-UX-5.1 — section metadata for Settings consumers. A tab's tier describes its entry point;
 * each section has its own tier, so a core tab can contain advanced controls. Anchors are stable
 * logical identifiers for future disclosure/deep-link adapters, not existing DOM element IDs.
 * This inventory does not replace permission checks or the existing tab enforcement policy. */
export const SETTINGS_FEATURE_GATES = SECTION_FEATURE_GATES.filter((gate) =>
	gate.surface.startsWith('/settings?tab='),
);

export function settingsFeatureGate(tab: string, sectionAnchor: string) {
	return SETTINGS_FEATURE_GATES.find(
		(gate) => gate.surface === `/settings?tab=${tab}` && gate.sectionAnchor === sectionAnchor,
	);
}

/** A byte count as the storage panels print it: `0 B`, `427 B`, `68.6 KB`. */
export function formatBytes(bytes: number): string {
	if (bytes <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / 1024 ** exp;
	return `${exp === 0 ? value : value.toFixed(1)} ${units[exp]}`;
}
