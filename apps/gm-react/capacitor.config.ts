import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	// `appId` is the Play Store package identity, not branding — renaming it would orphan any
	// installed build and force a package refactor, so it stays on the original namespace.
	// `appName` is what the launcher and task switcher actually show.
	appId: 'com.dndtools.gm',
	appName: 'Lamplight GM',
	webDir: 'dist',
	loggingBehavior: 'none',
	android: {
		allowMixedContent: false,
		// --color-bg, so the native window matches the first frame the webview paints.
		backgroundColor: '#14100b',
		captureInput: true,
		webContentsDebuggingEnabled: false,
	},
	server: {
		androidScheme: 'https',
		cleartext: false,
	},
	plugins: {
		SystemBars: {
			insetsHandling: 'css',
			style: 'DARK',
		},
		SplashScreen: {
			launchAutoHide: true,
			launchFadeOutDuration: 240,
			backgroundColor: '#14100bff',
			androidScaleType: 'CENTER_CROP',
			showSpinner: false,
		},
		LocalNotifications: {
			smallIcon: 'ic_stat_lamplight',
			iconColor: '#e0b06f',
		},
	},
};

export default config;
