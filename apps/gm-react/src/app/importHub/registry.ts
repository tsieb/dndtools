/** Every local material importer has a route and a hub row. Keep parsing in its existing flow. */
export const IMPORTERS = {
	'markdown-zip': '/settings?tab=vault&import=markdown-zip',
	'markdown-folder': '/settings?tab=vault&import=markdown-folder',
	notes: '/knowledge',
	characters: '/characters',
	maps: '/atlas',
	audio: '/audio',
	backup: '/settings?tab=sync&import=backup',
	module: '/community',
	scene: '/community',
} as const;
export type ImporterId = keyof typeof IMPORTERS;
export const IMPORT_HUB_EVENT = 'lamplight:import-hub';
export function openImportHub() {
	window.dispatchEvent(new Event(IMPORT_HUB_EVENT));
}
