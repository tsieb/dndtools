// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	VAULT_PRIVACY_MODE_KEY,
	VAULT_PRIVACY_DISCLOSURE_KEY,
	recordNewVaultPrivacyMode,
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

describe('ADR-042 creation records', () => {
	beforeEach(() => {
		window.localStorage.clear();
		vi.restoreAllMocks();
	});
	it('records the disclosure and preserves an existing Private choice', () => {
		recordNewVaultPrivacyMode('private-e2ee');
		recordNewVaultPrivacyMode('cloud-enhanced');
		expect(vaultPrivacyMode()).toBe('private-e2ee');
		expect(JSON.parse(localStorage.getItem(VAULT_PRIVACY_DISCLOSURE_KEY)!)).toMatchObject({
			mode: 'private-e2ee',
		});
	});
	it('records the phase-1 disclosure with the new Cloud-Enhanced default', () => {
		recordNewVaultPrivacyMode('cloud-enhanced');
		expect(vaultPrivacyMode()).toBe('cloud-enhanced');
		expect(localStorage.getItem(VAULT_PRIVACY_DISCLOSURE_KEY)).toContain('including secrets');
	});
	it('does not authorize a mode when disclosure persistence fails', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('quota');
		});
		expect(() => recordNewVaultPrivacyMode('cloud-enhanced')).toThrow('quota');
		expect(vaultPrivacyMode()).toBe('private-e2ee');
	});
});
