type WindowTheme = 'tavern' | 'parchment' | 'high-contrast';

interface NativeWindowBridge {
	setTheme(theme: WindowTheme): Promise<boolean>;
}

function bridge(): NativeWindowBridge | null {
	return (
		(
			globalThis as typeof globalThis & {
				dndtoolsWindow?: NativeWindowBridge;
			}
		).dndtoolsWindow ?? null
	);
}

/** True only inside the trusted Electron renderer exposed by the window preload. */
export function isNativeDesktopRuntime(): boolean {
	return bridge() !== null;
}

function currentTheme(): WindowTheme {
	const value = document.documentElement.getAttribute('data-theme');
	return value === 'parchment' || value === 'high-contrast' ? value : 'tavern';
}

function updateBrowserThemeColor(theme: WindowTheme): void {
	const colors: Record<WindowTheme, string> = {
		tavern: '#1f1810',
		parchment: '#fdf8f0',
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
	const native = bridge();
	if (native) document.documentElement.setAttribute('data-electron', 'true');
	const sync = () => {
		const theme = currentTheme();
		updateBrowserThemeColor(theme);
		if (native) void native.setTheme(theme).catch(() => false);
	};
	sync();
	const observer = new MutationObserver(sync);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	return () => observer.disconnect();
}
