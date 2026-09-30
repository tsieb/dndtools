import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SaxesParser } from 'saxes';
import { describe, expect, it } from 'vitest';

// RC-ENG-10.3 — the WebView IndexedDB vault and the ADR-035 player-private store must leave the
// device only through the E2EE backup and explicit exports, never Android system backup or device
// transfer. This parses the shipped manifest and both rule files and lists every way WebView or
// database storage could still be copied off the device.

const main = new URL('../../apps/gm-react/android/app/src/main/', import.meta.url);
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, main)), 'utf8');

interface Element {
	name: string;
	attributes: Record<string, string>;
	children: Element[];
}

function parse(xml: string): Element {
	const parser = new SaxesParser();
	const stack: Element[] = [];
	let root: Element | undefined;
	parser.on('opentag', (tag) => {
		const element: Element = {
			name: tag.name,
			attributes: tag.attributes as Record<string, string>,
			children: [],
		};
		if (stack.length) stack[stack.length - 1].children.push(element);
		else root = element;
		stack.push(element);
	});
	parser.on('closetag', () => stack.pop());
	parser.write(xml).close();
	if (!root) throw new Error('empty XML document');
	return root;
}

// Where each backup domain lives: credential-encrypted ("ce") or device-protected ("de") app
// storage, relative to the data dir, or external storage.
const domains: Record<string, [storage: string, prefix: string]> = {
	root: ['ce', ''],
	file: ['ce', 'files/'],
	database: ['ce', 'databases/'],
	sharedpref: ['ce', 'shared_prefs/'],
	external: ['external', ''],
	device_root: ['de', ''],
	device_file: ['de', 'files/'],
	device_database: ['de', 'databases/'],
	device_sharedpref: ['de', 'shared_prefs/'],
};

// Representative files for the storage that must never be backed up.
const protectedStorage = [
	['ce', 'app_webview/Default/IndexedDB/https_localhost_0.indexeddb.leveldb/000003.log'],
	['ce', 'app_webview/Default/Local Storage/leveldb/CURRENT'],
	['ce', 'databases/vault.db'],
	['de', 'app_webview/Default/IndexedDB/https_localhost_0.indexeddb.leveldb/000003.log'],
	['de', 'databases/vault.db'],
] as const;

function covers(rule: Element, [storage, path]: readonly [string, string]) {
	const domain = domains[rule.attributes.domain];
	if (!domain || domain[0] !== storage) return false;
	const relative = (rule.attributes.path ?? '').replace(/^\.\/?/, '').replace(/\/$/, '');
	const target = `${domain[1]}${relative}`.replace(/\/$/, '');
	return target === '' || path === target || path.startsWith(`${target}/`);
}

// A section backs up a file when no <include> is present or one covers it, and no <exclude> does.
function backedUp(section: Element, file: readonly [string, string]) {
	const rules = (name: string) => section.children.filter((child) => child.name === name);
	const includes = rules('include');
	return (
		(!includes.length || includes.some((rule) => covers(rule, file))) &&
		!rules('exclude').some((rule) => covers(rule, file))
	);
}

function backupLeaks(manifestXml: string, fullBackupXml: string, extractionXml: string) {
	const leaks: string[] = [];
	const application = parse(manifestXml).children.find((child) => child.name === 'application');
	const attributes = application?.attributes ?? {};
	if (attributes['android:allowBackup'] !== 'false') leaks.push('android:allowBackup is not false');
	if (attributes['android:backupAgent']) leaks.push('a key/value backup agent is declared');
	if (attributes['android:fullBackupContent'] !== '@xml/backup_rules')
		leaks.push('android:fullBackupContent does not reference @xml/backup_rules');
	if (attributes['android:dataExtractionRules'] !== '@xml/data_extraction_rules')
		leaks.push('android:dataExtractionRules does not reference @xml/data_extraction_rules');

	const fullBackup = parse(fullBackupXml);
	const extraction = parse(extractionXml);
	const sections: [string, Element | undefined][] = [
		['full-backup-content', fullBackup.name === 'full-backup-content' ? fullBackup : undefined],
		...['cloud-backup', 'device-transfer'].map((name): [string, Element | undefined] => [
			name,
			extraction.name === 'data-extraction-rules'
				? extraction.children.find((child) => child.name === name)
				: undefined,
		]),
	];
	for (const [name, section] of sections) {
		// A missing data-extraction section means "back up everything" on Android 12+.
		if (!section) {
			leaks.push(`${name}: section missing`);
			continue;
		}
		for (const file of protectedStorage) {
			if (backedUp(section, file)) leaks.push(`${name}: ${file[0]} ${file[1]}`);
		}
	}
	return leaks;
}

describe('Android system backup (RC-ENG-10.3)', () => {
	it('keeps the WebView vault and databases out of backup and device transfer', () => {
		expect(
			backupLeaks(
				read('AndroidManifest.xml'),
				read('res/xml/backup_rules.xml'),
				read('res/xml/data_extraction_rules.xml'),
			),
		).toEqual([]);
	});

	it('flags the pre-fix configuration that excluded only the secure-store preferences', () => {
		const secureStore = '<exclude domain="sharedpref" path="dndtools_secure_store.xml" />';
		const leaks = backupLeaks(
			read('AndroidManifest.xml').replace(
				'android:allowBackup="false"',
				'android:allowBackup="true"',
			),
			`<full-backup-content>${secureStore}</full-backup-content>`,
			`<data-extraction-rules><cloud-backup>${secureStore}</cloud-backup>` +
				`<device-transfer>${secureStore}</device-transfer></data-extraction-rules>`,
		);
		expect(leaks).toContain('android:allowBackup is not false');
		for (const section of ['full-backup-content', 'cloud-backup', 'device-transfer']) {
			expect(leaks).toContain(`${section}: ce databases/vault.db`);
			expect(leaks.some((leak) => leak.startsWith(`${section}: ce app_webview/`))).toBe(true);
		}
	});

	it('flags a missing device-transfer section, a narrow exclude, and an include that re-adds storage', () => {
		const manifest = read('AndroidManifest.xml');
		const all = '<exclude domain="root" path="." /><exclude domain="device_root" path="." />';
		const full = `<full-backup-content>${all}</full-backup-content>`;
		expect(
			backupLeaks(
				manifest,
				full,
				`<data-extraction-rules><cloud-backup>${all}</cloud-backup></data-extraction-rules>`,
			),
		).toEqual(['device-transfer: section missing']);
		expect(
			backupLeaks(
				manifest,
				'<full-backup-content><exclude domain="database" path="." /></full-backup-content>',
				`<data-extraction-rules><cloud-backup>${all}</cloud-backup>` +
					`<device-transfer>${all}</device-transfer></data-extraction-rules>`,
			),
		).toContain(
			'full-backup-content: ce app_webview/Default/IndexedDB/https_localhost_0.indexeddb.leveldb/000003.log',
		);
		expect(
			backupLeaks(
				manifest,
				full,
				`<data-extraction-rules><cloud-backup><include domain="database" path="vault.db" />` +
					`</cloud-backup><device-transfer>${all}</device-transfer></data-extraction-rules>`,
			),
		).toEqual(['cloud-backup: ce databases/vault.db']);
	});

	it('flags a key/value backup agent', () => {
		const manifest = read('AndroidManifest.xml').replace(
			'<application',
			'<application android:backupAgent=".VaultBackupAgent"',
		);
		expect(
			backupLeaks(
				manifest,
				read('res/xml/backup_rules.xml'),
				read('res/xml/data_extraction_rules.xml'),
			),
		).toEqual(['a key/value backup agent is declared']);
	});
});
