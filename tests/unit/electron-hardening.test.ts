import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { Discovery, SERVICE_TYPE } = require('../../apps/gm-react/electron/discovery.cjs');
const {
	APP_ORIGIN,
	APP_ENTRY_URL,
	registerAppScheme,
	resolveAppAssetPath,
} = require('../../apps/gm-react/electron/app-protocol.cjs');
const {
	isAllowedMigratedPreference,
	validateLegacySchema,
} = require('../../apps/gm-react/electron/storage-origin-migration.cjs');
const mainPath = fileURLToPath(new URL('../../apps/gm-react/electron/main.cjs', import.meta.url));
const builderPath = fileURLToPath(
	new URL('../../apps/gm-react/electron-builder.yml', import.meta.url),
);

function discoveryResponse(ttl: number) {
	const sessionId = 'sess-expiry-test';
	const instance = `${sessionId}.${SERVICE_TYPE}`;
	return {
		answers: [{ name: SERVICE_TYPE, type: 'PTR', ttl, data: instance }],
		additionals: [
			{
				name: instance,
				type: 'SRV',
				ttl,
				data: { port: 43120, target: '192.168.1.20' },
			},
			{
				name: instance,
				type: 'TXT',
				ttl,
				data: [Buffer.from('name=Expiry Test'), Buffer.from(`session=${sessionId}`)],
			},
		],
	};
}

function createDiscoveryHarness() {
	let now = 1_000;
	let scheduledCallback: (() => void) | undefined;
	const mdns = {
		on: vi.fn(),
		removeListener: vi.fn(),
		query: vi.fn(),
		destroy: vi.fn(),
	};
	const setTimeout = vi.fn((callback: () => void) => {
		scheduledCallback = callback;
		return { unref: vi.fn() };
	});
	const discovery = new Discovery({
		mdns,
		now: () => now,
		setTimeout,
		clearTimeout: vi.fn(),
	});
	const rosters: Array<Array<{ sessionId: string }>> = [];
	discovery.setHandlers({
		onServices: (services: Array<{ sessionId: string }>) => rosters.push(services),
	});
	discovery.startBrowse();
	return {
		discovery,
		rosters,
		setTimeout,
		advanceTo: (timestamp: number) => {
			now = timestamp;
		},
		runScheduled: () => scheduledCallback?.(),
	};
}

describe('Electron LAN discovery lifecycle', () => {
	it('removes a discovered service when its mDNS TTL expires', () => {
		const harness = createDiscoveryHarness();
		harness.discovery.ingestResponse(discoveryResponse(2));

		expect(harness.rosters.at(-1)).toEqual([
			expect.objectContaining({ sessionId: 'sess-expiry-test', name: 'Expiry Test' }),
		]);
		expect(harness.setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 2_000);

		harness.advanceTo(3_000);
		harness.runScheduled();
		expect(harness.rosters.at(-1)).toEqual([]);
	});

	it('honors a zero-TTL goodbye immediately', () => {
		const harness = createDiscoveryHarness();
		harness.discovery.ingestResponse(discoveryResponse(120));
		harness.discovery.ingestResponse(discoveryResponse(0));

		expect(harness.rosters.at(-1)).toEqual([]);
	});
});

describe('packaged Electron hardening policy', () => {
	it('registers a normal secure app origin without bypassing CSP', () => {
		const registerSchemesAsPrivileged = vi.fn();
		registerAppScheme({ registerSchemesAsPrivileged });

		expect(APP_ORIGIN).toBe('dndtools://app');
		expect(APP_ENTRY_URL).toBe('dndtools://app/index.html');
		expect(registerSchemesAsPrivileged).toHaveBeenCalledWith([
			{
				scheme: 'dndtools',
				privileges: {
					standard: true,
					secure: true,
					supportFetchAPI: true,
					corsEnabled: true,
					stream: true,
					codeCache: true,
				},
			},
		]);
	});

	it('maps only the app host into the renderer bundle', () => {
		const root = path.resolve('/virtual/renderer');

		expect(resolveAppAssetPath(APP_ENTRY_URL, root)).toBe(path.join(root, 'index.html'));
		expect(resolveAppAssetPath(`${APP_ORIGIN}/assets/app.js?v=1`, root)).toBe(
			path.join(root, 'assets', 'app.js'),
		);
		expect(resolveAppAssetPath('dndtools://auth/index.html', root)).toBeNull();
		expect(resolveAppAssetPath('dndtools://app/%2e%2e%2fsecret.txt', root)).toBeNull();
		expect(resolveAppAssetPath('dndtools://app/..%5csecret.txt', root)).toBeNull();
		expect(resolveAppAssetPath('file:///etc/passwd', root)).toBeNull();
	});

	it('keeps privileged window and persistence controls fail-closed', () => {
		const source = readFileSync(mainPath, 'utf8');

		expect(source).toContain('http://[::1]:*');
		expect(source).toContain("permission === 'clipboard-sanitized-write'");
		expect(source).toContain("permission === 'speaker-selection'");
		expect(source.match(/devTools: !app\.isPackaged/g)).toHaveLength(2);
		expect(source).toContain('app.requestSingleInstanceLock()');
		expect(source).toContain("fs.openSync(tempFile, 'wx', 0o600)");
		expect(source).toContain('fs.renameSync(tempFile, file)');
		expect(source).toContain('event.senderFrame === event.sender.mainFrame');
		expect(source).toContain('isTrustedDisplayUrl(url)');
		expect(source).toContain("child.webContents.on('did-navigate-in-page'");
		expect(source).not.toMatch(/\bshell\s*\.\s*openExternal\s*\(/);
		expect(source).toContain('installAppProtocol(protocol, net, RENDERER_ROOT)');
		expect(source).toContain('await runStorageOriginMigration({');
		expect(source).toContain('win.loadURL(APP_ENTRY_URL)');
		expect(source).not.toContain('win.loadFile(');
	});

	it('distinguishes a damaged encrypted credential store from an empty store', () => {
		const source = readFileSync(mainPath, 'utf8');

		expect(source).toContain("error?.code === 'ENOENT' ? {} : null");
		expect(source).toContain(
			"throw new Error('The encrypted credential store is damaged or unreadable.')",
		);
		expect(source).not.toContain('all === null ? []');
		expect(source).toContain('An encrypted credential could not be decrypted on this device.');
	});

	it('copies only explicitly reviewed, account-scoped legacy preferences', () => {
		expect(isAllowedMigratedPreference('dndtools:react:theme')).toBe(true);
		expect(isAllowedMigratedPreference('dndtools.ai.provider-settings')).toBe(true);
		expect(isAllowedMigratedPreference('dndtools:react:cloud-sync-enabled:account-123')).toBe(true);
		expect(isAllowedMigratedPreference('dndtools:react:cloud-sync-enabled')).toBe(false);
		expect(isAllowedMigratedPreference('dndtools:react:entitlements:last')).toBe(false);
		expect(isAllowedMigratedPreference('dndtools:react:notifications')).toBe(false);
		expect(isAllowedMigratedPreference('dndtools.ai.provider-key')).toBe(false);
		expect(isAllowedMigratedPreference('dndtools:react:unknown-future-key')).toBe(false);
	});

	it('accepts only the three released Dexie native schemas for origin migration', () => {
		const stores = {
			documents: {
				name: 'documents',
				keyPath: 'key',
				autoIncrement: false,
				indexes: [],
			},
			operations: {
				name: 'operations',
				keyPath: 'id',
				autoIncrement: false,
				indexes: [{ name: 'sequence', keyPath: 'sequence', unique: false, multiEntry: false }],
			},
			migrationJournal: {
				name: 'migrationJournal',
				keyPath: 'key',
				autoIncrement: false,
				indexes: [],
			},
			assetBlobs: {
				name: 'assetBlobs',
				keyPath: 'id',
				autoIncrement: false,
				indexes: [],
			},
		};
		const v30 = {
			name: 'dndtools-v2',
			version: 30,
			stores: [stores.assetBlobs, stores.documents, stores.migrationJournal, stores.operations],
		};
		expect(validateLegacySchema(v30)).toBe(v30);
		expect(() => validateLegacySchema({ ...v30, version: 40 })).toThrow(/not supported/);
		expect(() =>
			validateLegacySchema({
				...v30,
				stores: [{ ...stores.assetBlobs, keyPath: null }, ...v30.stores.slice(1)],
			}),
		).toThrow(/unexpected schema/);
	});

	it('declares the macOS local-network and Bonjour usage metadata', () => {
		const config = parse(readFileSync(builderPath, 'utf8'));

		expect(config.mac.extendInfo.NSLocalNetworkUsageDescription).toContain('local network');
		expect(config.mac.extendInfo.NSBonjourServices).toContain('_dndtools._tcp');
	});
});
