import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.dndtools.gm',
	appName: 'DND Tools GM',
	webDir: 'dist',
	loggingBehavior: 'none',
	android: {
		allowMixedContent: false,
		backgroundColor: '#10151c',
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
			backgroundColor: '#10151cff',
			androidScaleType: 'CENTER_CROP',
			showSpinner: false,
		},
		LocalNotifications: {
			smallIcon: 'ic_stat_dndtools',
			iconColor: '#d6a84b',
		},
	},
};

export default config;
