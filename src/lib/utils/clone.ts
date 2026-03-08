export function deepClone<T>(value: T): T {
	if (typeof globalThis.structuredClone === 'function') {
		try {
			return globalThis.structuredClone(value);
		} catch {
			// Svelte state proxies cannot always be structured-cloned.
		}
	}
	return JSON.parse(JSON.stringify(value)) as T;
}
