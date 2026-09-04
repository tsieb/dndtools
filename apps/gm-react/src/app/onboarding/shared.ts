import { DEFAULT_FEATURE_TIER, type FeatureTier } from '@dndtools/core';

/* The onboarding wizard's device-local storage keys, the tier/complexity tables and the step
 * definition. Extracted from Onboarding.tsx unchanged (RC-STB-2.6). */

export const ONBOARDED_KEY = 'dndtools:react:onboarded';
export const VAULT_CHOICE_KEY = 'dndtools:react:vault-choice';
export const REPLAY_EVENT = 'dndtools:onboarding-replay';
export const INVITES_KEY = 'dndtools:react:invites';
export const TIER_KEY = 'dndtools:react:tier';
export const TIER_ATTR = 'data-feature-tier';
export const MAX_PARTY_NOTES = 20;
export const MAX_PARTY_NOTE_CHARS = 120;
// Mirrors Settings' complexity mapping — design vocabulary level → real core FeatureTier.
export const LEVEL_TO_TIER: Record<string, FeatureTier> = {
	beginner: 'core',
	standard: 'intermediate',
	expert: 'advanced',
};

// The experience-step card copy (design vocabulary). Each card's REVEALS list stays live — read from
// the Core's `visibleFeatures()` for the mapped tier, never from static copy.
export const COMPLEXITY_LEVELS = [
	{
		id: 'beginner',
		name: 'Beginner',
		icon: 'Sprout',
		rec: false,
		blurb:
			'The essentials only. Guided prompts, presets over fields, advanced panels hidden until you ask.',
	},
	{
		id: 'standard',
		name: 'Standard',
		icon: 'SlidersHorizontal',
		rec: true,
		blurb: 'The full table toolkit with sensible defaults. Most DMs live here.',
	},
	{
		id: 'expert',
		name: 'Expert',
		icon: 'Wrench',
		rec: false,
		blurb: 'All advanced controls, automation, permissions, extensions, and diagnostics.',
	},
] as const;

export function readStorage(key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function writeStorage(key: string, value: string) {
	try {
		window.localStorage.setItem(key, value);
	} catch {
		/* private mode — the overlay just re-appears next boot */
	}
}

export function removeStorage(key: string) {
	try {
		window.localStorage.removeItem(key);
	} catch {
		/* private mode — nothing was persisted anyway */
	}
}

/** Reload after a vault reset while preserving a HashRouter destination under both http(s) and file. */
export function reloadAtRoute(route?: string) {
	if (route) {
		const next = new URL(window.location.href);
		next.hash = route;
		window.history.replaceState(null, '', next.href);
	}
	window.location.reload();
}

export function readStoredTier(): FeatureTier {
	const value = readStorage(TIER_KEY);
	return value === 'core' || value === 'intermediate' || value === 'advanced'
		? value
		: DEFAULT_FEATURE_TIER;
}

export function readStoredPartyNotes(): string[] {
	try {
		const value = JSON.parse(readStorage(INVITES_KEY) ?? '[]') as unknown;
		if (!Array.isArray(value)) return [];
		return value
			.filter((entry): entry is string => typeof entry === 'string')
			.map((entry) => entry.trim().slice(0, MAX_PARTY_NOTE_CHARS))
			.filter(Boolean)
			.slice(0, MAX_PARTY_NOTES);
	} catch {
		return [];
	}
}

/** ARIA radio-group contract: arrows move selection (selection follows focus), Tab skips the group. */

export const ONB_STEPS = [
	{ id: 'welcome', title: 'Welcome', icon: 'sparkle' },
	{ id: 'vault', title: 'Your vault', icon: 'vault' },
	{ id: 'privacy', title: 'Privacy', icon: 'shield' },
	{ id: 'experience', title: 'Experience', icon: 'sliders' },
	{ id: 'tools', title: 'Tools', icon: 'sparkle' },
	{ id: 'players', title: 'Your party', icon: 'players' },
	{ id: 'ready', title: 'Ready', icon: 'flag' },
] as const;

export const PRIVACY_STEP_INDEX = ONB_STEPS.findIndex((s) => s.id === 'privacy');
/** ADR-026 — the typed acknowledgment for choosing Private (E2EE), mirroring AccountDangerPanel. */
export const PRIVACY_ACK_PHRASE = 'i hold the keys';

export const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
