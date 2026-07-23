import { beforeEach, describe, expect, it } from 'vitest';
import {
	VAULT_PRIVACY_MODE_KEY,
	setVaultPrivacyMode,
	storedVaultPrivacyMode,
	vaultPrivacyMode,
} from './vaultMode';

describe('vaultMode (ADR-026)', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it('defaults to Private when nothing was ever chosen (fail closed)', () => {
		expect(storedVaultPrivacyMode()).toBeNull();
		expect(vaultPrivacyMode()).toBe('private-e2ee');
	});

	it('round-trips both explicit choices', () => {
		setVaultPrivacyMode('cloud-enhanced');
		expect(storedVaultPrivacyMode()).toBe('cloud-enhanced');
		expect(vaultPrivacyMode()).toBe('cloud-enhanced');
		setVaultPrivacyMode('private-e2ee');
		expect(vaultPrivacyMode()).toBe('private-e2ee');
	});

	it('resolves garbage or tampered stored values to Private, and never persists one', () => {
		window.localStorage.setItem(VAULT_PRIVACY_MODE_KEY, 'server-readable-please');
		expect(storedVaultPrivacyMode()).toBeNull();
		expect(vaultPrivacyMode()).toBe('private-e2ee');
		// @ts-expect-error — deliberately hostile input
		setVaultPrivacyMode('everything-open');
		expect(window.localStorage.getItem(VAULT_PRIVACY_MODE_KEY)).toBe('server-readable-please');
	});
});
