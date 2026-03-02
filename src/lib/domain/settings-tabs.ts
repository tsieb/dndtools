export type SettingsTabId = 'general' | 'world' | 'vault' | 'mcp' | 'health';

export function resolveSettingsTabFromUrl(url: URL): SettingsTabId | null {
	const tab = url.searchParams.get('tab');
	if (
		tab === 'general' ||
		tab === 'world' ||
		tab === 'vault' ||
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
