export const MOBILE_VAULT_ROOT_STORAGE_KEY = 'dndtools.mobileVaultRoot';
export const DEFAULT_MOBILE_VAULT_ROOT = 'dndtools/vault';

export function normalizeMobileVaultRoot(value: string): string {
	const normalized = value
		.trim()
		.replace(/\\/g, '/')
		.replace(/^\/+/, '')
		.replace(/\/+/g, '/')
		.replace(/\/+$/, '');
	return normalized || DEFAULT_MOBILE_VAULT_ROOT;
}

export function resolveConfiguredMobileVaultRoot(): string {
	if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
		return DEFAULT_MOBILE_VAULT_ROOT;
	}
	const saved = window.localStorage.getItem(MOBILE_VAULT_ROOT_STORAGE_KEY);
	if (!saved) {
		return DEFAULT_MOBILE_VAULT_ROOT;
	}
	return normalizeMobileVaultRoot(saved);
}
