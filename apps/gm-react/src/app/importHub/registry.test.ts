import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { IMPORTERS } from './registry';
import { en } from '../../i18n/messages/en';

const root = fileURLToPath(new URL('../../', import.meta.url));
function sources(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		return entry.isDirectory()
			? sources(path)
			: /\.(ts|tsx)$/.test(path) && !/\.test\./.test(path)
				? [path]
				: [];
	});
}

describe('import hub completeness', () => {
	it('has a labeled row, effect description and launch handler for every registered importer', () => {
		const hub = readFileSync(join(root, 'app/importHub/ImportHub.tsx'), 'utf8');
		const rowBlock = hub.split('export const IMPORT_HUB_ROWS = {')[1]!.split('} as const')[0]!;
		const rows = [...rowBlock.matchAll(/\s['"]?([\w-]+)['"]?: '(importHub\.\w+)'/g)];
		expect(rows.map((row) => row[1]).sort()).toEqual(Object.keys(IMPORTERS).sort());
		for (const row of rows) {
			expect(en[row[2] as keyof typeof en]).toBeTruthy();
			expect(en[`${row[2]}.description` as keyof typeof en]).toBeTruthy();
		}
		const handlers = sources(root).flatMap((path) =>
			[...readFileSync(path, 'utf8').matchAll(/useImportLaunch\(\s*'([\w-]+)'/g)].map(
				(match) => match[1],
			),
		);
		expect(handlers.sort()).toEqual(Object.keys(IMPORTERS).sort());
	});

	it('requires newly added material file pickers to register a hub launcher', () => {
		// Picker implementations, recovery entry and account-specific imports are not material flows.
		const exceptions = new Set([
			'platform/filePick.ts',
			'platform/backup.ts',
			'platform/fsSource.ts',
			'App.tsx',
			'screens/settings/SyncPrivacy.tsx',
			// The character overlay is launched by the registered RosterActions handler.
			'app/charBuilder/index.tsx',
			// Knowledge's registered route handler mounts the review panel.
			'screens/knowledge/ImportPanel.tsx',
			// Map's registered Atlas launcher opens this same dialog.
			'app/map/ImportMapDialog.tsx',
		]);
		const missing = sources(root)
			.filter((path) => {
				const text = readFileSync(path, 'utf8');
				return (
					/\b(?:pickTextFiles?|pickBinaryFile|pickMarkdownZip|pickMarkdownDirectory)\(/.test(
						text,
					) &&
					!exceptions.has(relative(root, path)) &&
					!/useImportLaunch\(/.test(text)
				);
			})
			.map((path) => relative(root, path));
		expect(missing).toEqual([]);
	});
});
