export type SettingsTabId = 'general' | 'about' | 'world' | 'vault' | 'handouts' | 'mcp' | 'health';

export function resolveSettingsTabFromUrl(url: URL): SettingsTabId | null {
	const tab = url.searchParams.get('tab');
	if (
		tab === 'general' ||
		tab === 'about' ||
		tab === 'world' ||
		tab === 'vault' ||
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
