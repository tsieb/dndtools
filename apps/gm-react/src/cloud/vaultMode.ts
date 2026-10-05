// PER-VAULT PRIVACY MODE (ADR-026/042). Device-local record of a creation default or explicit
// choice between Private (E2EE) and Cloud-Enhanced. This flag is UX state and
// consent bookkeeping, NOT the security authority: the core's mode selectors + release gates decide
// what any mode may actually do, and the Cloud-Enhanced record ships unapproved (phase 1), so a
// tampered flag cannot widen any trust boundary. Absent or unrecognized values ALWAYS resolve to
// Private — trust never widens by accident (fail closed).

import { isVaultPrivacyMode, type VaultPrivacyMode } from '@dndtools/core';
import { vaultPreferenceKey } from '../platform/storage/coreStore';

export const VAULT_PRIVACY_MODE_KEY = 'dndtools:react:vault-privacy-mode';

/** The recorded explicit choice, or null when none was ever made (legacy install / fresh profile). */
export function storedVaultPrivacyMode(): VaultPrivacyMode | null {
	try {
		if (typeof window === 'undefined') return null;
		const raw = window.localStorage.getItem(vaultPreferenceKey(VAULT_PRIVACY_MODE_KEY));
		return isVaultPrivacyMode(raw) ? raw : null;
	} catch {
		return null;
	}
}

/** The effective mode. No recorded choice ⇒ Private (fail closed). */
export function vaultPrivacyMode(): VaultPrivacyMode {
	return storedVaultPrivacyMode() ?? 'private-e2ee';
}

/** Record an explicit Settings choice. Creation uses the disclosure-recording function below. */
export function setVaultPrivacyMode(mode: VaultPrivacyMode): void {
	if (!isVaultPrivacyMode(mode)) return; // never persist an unrecognized value
	try {
		if (typeof window !== 'undefined')
			window.localStorage.setItem(vaultPreferenceKey(VAULT_PRIVACY_MODE_KEY), mode);
	} catch {
		/* private mode — the effective mode simply stays Private next boot (fail closed) */
	}
}

export const VAULT_PRIVACY_DISCLOSURE_KEY = 'dndtools:react:vault-privacy-disclosure';
export const CLOUD_ENHANCED_DISCLOSURE =
	'Cloud-Enhanced lets our server read your campaign content, including secrets, to provide cloud features. Those features are not in this edition, so your vault stays end-to-end encrypted.';

/** Creation only: preserve existing decisions and record the disclosure before the mode.
 * This local record never grants server authorization. Unlike a display preference, a failed
 * write must keep the creation screen open rather than claim the chosen mode was saved.
 */
export function recordNewVaultPrivacyMode(mode: VaultPrivacyMode): void {
	if (!isVaultPrivacyMode(mode)) throw new Error('Choose a valid storage mode.');
	if (storedVaultPrivacyMode() !== null) return;
	const storage = window.localStorage;
	storage.setItem(
		vaultPreferenceKey(VAULT_PRIVACY_DISCLOSURE_KEY),
		JSON.stringify({
			version: 'ADR-042-phase-1',
			mode,
			disclosure:
				mode === 'cloud-enhanced'
					? CLOUD_ENHANCED_DISCLOSURE
					: 'You hold the keys. No cloud recovery.',
		}),
	);
	storage.setItem(vaultPreferenceKey(VAULT_PRIVACY_MODE_KEY), mode);
	if (storedVaultPrivacyMode() !== mode)
		throw new Error('The storage mode could not be saved. Try again.');
}
