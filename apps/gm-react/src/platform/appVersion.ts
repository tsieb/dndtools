/**
 * The app's release version as built: `package.json`'s `version`, injected by Vite's `define` as
 * `__APP_VERSION__`. `null` where no build injected it (the Node unit-test runtime), so callers
 * fall back rather than throw on the bare identifier.
 */
export function appVersion(): string | null {
	return typeof __APP_VERSION__ === 'string' && __APP_VERSION__ !== '' ? __APP_VERSION__ : null;
}
