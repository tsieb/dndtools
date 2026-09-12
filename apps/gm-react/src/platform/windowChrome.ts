import {
	getElectronWindowBridge,
	getPlatformCapabilities,
	setAndroidSystemBarStyle,
} from './capabilities';
import { DARK_THEMES, followsSystemTheme, isThemePreset, type ThemePreset } from './theme';

interface NativeWindowBridge {
	/**
	 * `followSystem` hands `nativeTheme.themeSource` back to the OS. Pinning it to the preset's
	 * scheme would also pin the renderer's `prefers-color-scheme`, and a "System" choice could then
	 * never see the OS flip it is meant to follow.
	 */
	setTheme(theme: ThemePreset, followSystem: boolean): Promise<boolean>;
}

function bridge(): NativeWindowBridge | null {
	return getElectronWindowBridge<NativeWindowBridge>();
}

/** True only inside the trusted Electron renderer exposed by the window preload. */
export function isNativeDesktopRuntime(): boolean {
	return getPlatformCapabilities().runtimeKind === 'electron';
}

function currentTheme(): ThemePreset {
	const value = document.documentElement.getAttribute('data-theme');
	return isThemePreset(value) ? value : 'tavern';
}

function updateBrowserThemeColor(theme: ThemePreset): void {
	// Each preset's --color-surface, the colour the top bar paints under the browser chrome.
	const colors: Record<ThemePreset, string> = {
		tavern: '#1f1810',
		parchment: '#fdf8f0',
		scholar: '#fcfbf8',
		dungeon: '#120d09',
		'high-contrast': '#000000',
	};
	let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
	if (!meta) {
		meta = document.createElement('meta');
		meta.name = 'theme-color';
		document.head.append(meta);
	}
	meta.content = colors[theme];
}

/** Keep browser chrome and the Electron title-bar overlay aligned with the live app theme. */
export function bindWindowChromeTheme(): () => void {
	const capabilities = getPlatformCapabilities();
	document.documentElement.setAttribute('data-runtime', capabilities.runtimeKind);
	document.documentElement.toggleAttribute('data-android', capabilities.runtimeKind === 'android');
	const native = capabilities.windowManagement.available ? bridge() : null;
	if (native) document.documentElement.setAttribute('data-electron', 'true');
	const sync = () => {
		const theme = currentTheme();
		updateBrowserThemeColor(theme);
		if (native) void native.setTheme(theme, followsSystemTheme()).catch(() => false);
		if (capabilities.nativeBridgeAvailable) {
			void setAndroidSystemBarStyle(DARK_THEMES.has(theme) ? 'DARK' : 'LIGHT');
		}
	};
	sync();
	const observer = new MutationObserver(sync);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	return () => observer.disconnect();
}
