import { createContext } from 'react';

/** Explicitly choosing an importer reveals only its section, without changing experience level. */
export const ImportSettingsSection = createContext<string | null>(null);
export function settingsImportSection(search: string): string | null {
	const params = new URLSearchParams(search);
	const importer = params.get('import');
	if (
		params.get('tab') === 'vault' &&
		(importer === 'markdown-zip' || importer === 'markdown-folder')
	)
		return 'settings.folder.title';
	if (params.get('tab') === 'sync' && importer === 'backup') return 'settings.backup.title';
	return null;
}
