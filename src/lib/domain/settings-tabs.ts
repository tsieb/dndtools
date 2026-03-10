export type SettingsTabId =
	| 'general'
	| 'appearance'
	| 'features'
	| 'about'
	| 'world'
	| 'maps'
	| 'vault'
	| 'sync'
	| 'handouts'
	| 'mcp'
	| 'health';

export function resolveSettingsTabFromUrl(url: URL): SettingsTabId | null {
	const tab = url.searchParams.get('tab');
	if (
		tab === 'general' ||
		tab === 'appearance' ||
		tab === 'features' ||
		tab === 'about' ||
		tab === 'world' ||
		tab === 'maps' ||
		tab === 'vault' ||
		tab === 'sync' ||
		tab === 'handouts' ||
		tab === 'mcp' ||
		tab === 'health'
	) {
		return tab;
	}

	if (url.hash === '#mcp-changes' || url.hash === '#mcp') {
		return 'mcp';
	}

	return null;
}
