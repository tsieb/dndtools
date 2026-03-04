import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.dndtools.app',
	appName: 'DND Tools',
	webDir: 'build',
	bundledWebRuntime: false,
	server: {
		androidScheme: 'https',
	},
	android: {
		allowMixedContent: false,
		captureInput: true,
	},
};

export default config;
