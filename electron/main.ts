import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import http from 'node:http';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { FileSystemAdapter } from '../mcp/storage.js';
import {
	getSchemaMigrationReport as getVaultSchemaMigrationReport,
	runSchemaMigrations as runVaultSchemaMigrations,
} from '../mcp/migrations.js';
import { McpSidecar } from './mcp-sidecar.js';
import type { McpChangeRecord } from '../src/lib/types/mcp.js';
import type { HealthSubsystem, StructuredErrorEvent } from '../src/lib/types/diagnostics.js';
import { DiagnosticsTracker } from './diagnostics.js';

let storage: FileSystemAdapter | null = null;
let vaultDir = '';
let staticServer: http.Server | null = null;
const mcpSidecar = new McpSidecar();
const diagnostics = new DiagnosticsTracker();

const CONTENT_TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.mjs': 'application/javascript; charset=utf-8',
	'.cjs': 'application/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.txt': 'text/plain; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
};

function resolveVaultDir(): string {
	const vaultFlag = process.argv.find((arg) => arg.startsWith('--vault='));
	if (vaultFlag) return path.resolve(vaultFlag.slice('--vault='.length));

	const positional = process.argv.slice(2).find((arg) => !arg.startsWith('-'));
	if (positional) return path.resolve(positional);

	if (process.env.DNDTOOLS_VAULT) return path.resolve(process.env.DNDTOOLS_VAULT);
	return path.join(app.getPath('documents'), 'dndtools-vault');
}

function getRendererEntrypoint(): { devUrl: string | null; filePath: string } {
	const devUrl = process.env.DNDTOOLS_DEV_URL ?? null;
	const filePath = path.resolve(__dirname, '../../build/index.html');
	return { devUrl, filePath };
}

function resolveWindowIconPath(): string | undefined {
	const candidates = [
		path.resolve(__dirname, '../../build/app-icon.ico'),
		path.resolve(__dirname, '../../build/app-icon.png'),
		path.resolve(__dirname, '../../static/app-icon.ico'),
		path.resolve(__dirname, '../../static/app-icon.png'),
		path.resolve(__dirname, '../../src/lib/assets/app-icon.png'),
	];
	return candidates.find((candidate) => fsSync.existsSync(candidate));
}

async function readStaticAsset(
	rootDir: string,
	rawPath: string,
): Promise<{
	status: number;
	contentType: string;
	body: Buffer;
}> {
	const safePath = path.normalize(rawPath).replace(/^(\.\.[/\\])+/, '');
	const resolved = path.resolve(rootDir, safePath);
	const rootResolved = path.resolve(rootDir);

	if (!resolved.startsWith(rootResolved)) {
		return {
			status: 403,
			contentType: 'text/plain; charset=utf-8',
			body: Buffer.from('Forbidden'),
		};
	}

	try {
		const stat = await fs.stat(resolved);
		if (stat.isDirectory()) {
			const indexPath = path.join(resolved, 'index.html');
			const body = await fs.readFile(indexPath);
			return { status: 200, contentType: CONTENT_TYPES['.html'], body };
		}

		const ext = path.extname(resolved).toLowerCase();
		const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
		const body = await fs.readFile(resolved);
		return { status: 200, contentType, body };
	} catch {
		const fallback = path.join(rootDir, 'index.html');
		try {
			const body = await fs.readFile(fallback);
			return { status: 200, contentType: CONTENT_TYPES['.html'], body };
		} catch {
			return {
				status: 404,
				contentType: 'text/plain; charset=utf-8',
				body: Buffer.from('Not found'),
			};
		}
	}
}

async function startStaticServer(rootDir: string): Promise<string> {
	if (staticServer) {
		const address = staticServer.address();
		if (address && typeof address === 'object') {
			return `http://127.0.0.1:${address.port}`;
		}
	}

	staticServer = http.createServer(async (req, res) => {
		const urlPath = req.url ? decodeURIComponent(req.url.split('?')[0] ?? '/') : '/';
		const requestPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
		const response = await readStaticAsset(rootDir, requestPath);
		res.statusCode = response.status;
		res.setHeader('Content-Type', response.contentType);
		res.end(response.body);
	});

	await new Promise<void>((resolve, reject) => {
		staticServer!.once('error', reject);
		staticServer!.listen(0, '127.0.0.1', () => resolve());
	});

	const address = staticServer.address();
	if (!address || typeof address === 'string') {
		throw new Error('Failed to start static server');
	}

	return `http://127.0.0.1:${address.port}`;
}

async function setVaultDirectory(nextVaultDir: string): Promise<void> {
	if (storage) {
		await storage.close();
	}

	const schemaPreflight = await getVaultSchemaMigrationReport(nextVaultDir);
	if (schemaPreflight.upgradeRequired) {
		const applied = await runVaultSchemaMigrations(nextVaultDir, {
			dryRun: false,
			createCheckpoint: true,
		});
		if (applied.failures.length > 0) {
			throw new Error(
				`Vault upgrade required but migration failed: ${applied.failures[0]?.message ?? 'unknown error'}`,
			);
		}
	}

	storage = new FileSystemAdapter(nextVaultDir);
	try {
		await storage.initialize();
		diagnostics.markSubsystemSuccess('vault_sync');
	} catch (error) {
		diagnostics.recordError(
			createStructuredError({
				category: 'storage',
				code: 'STORAGE_INIT_FAILED',
				message: error instanceof Error ? error.message : String(error),
				details: error instanceof Error ? (error.stack ?? null) : null,
				context: {
					stage: 'setVaultDirectory',
				},
			}),
		);
		throw error;
	}
	vaultDir = nextVaultDir;
	await mcpSidecar.restart(nextVaultDir);
	const sidecarStatus = mcpSidecar.getStatus();
	if (sidecarStatus.state === 'error') {
		diagnostics.recordError(
			createStructuredError({
				category: 'mcp_sidecar',
				code: 'MCP_SIDECAR_START_FAILED',
				message: sidecarStatus.error ?? 'Failed to start MCP sidecar',
				context: {
					vaultDir: nextVaultDir,
				},
			}),
		);
	}
}

function requireStorage(): FileSystemAdapter {
	if (!storage) {
		throw new Error('Storage is not initialized');
	}
	return storage;
}

function createStructuredError(input: {
	category: StructuredErrorEvent['category'];
	code: string;
	message: string;
	details?: string | null;
	context?: StructuredErrorEvent['context'];
}): StructuredErrorEvent {
	return {
		id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
		at: new Date().toISOString(),
		category: input.category,
		code: input.code,
		message: input.message,
		severity: 'error',
		details: input.details ?? null,
		context: input.context ?? {},
	};
}

function isHealthSubsystem(value: unknown): value is HealthSubsystem {
	return (
		value === 'runtime_bootstrap' ||
		value === 'vault_sync' ||
		value === 'search_index' ||
		value === 'link_graph_build'
	);
}

function isStructuredErrorEvent(value: unknown): value is StructuredErrorEvent {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<StructuredErrorEvent>;
	return (
		typeof candidate.id === 'string' &&
		typeof candidate.at === 'string' &&
		typeof candidate.category === 'string' &&
		typeof candidate.code === 'string' &&
		typeof candidate.message === 'string' &&
		typeof candidate.severity === 'string' &&
		typeof candidate.context === 'object' &&
		candidate.context !== null
	);
}

async function collectBundleMetrics(): Promise<{
	noteCount: number | null;
	tagCount: number | null;
	pendingMcpChangeCount: number | null;
}> {
	const current = storage;
	if (!current) {
		return {
			noteCount: null,
			tagCount: null,
			pendingMcpChangeCount: null,
		};
	}

	try {
		const [noteCount, tagCounts, pendingChanges] = await Promise.all([
			current.getNoteCount(),
			current.getTagCounts(),
			current.getPendingMcpChanges(),
		]);
		return {
			noteCount,
			tagCount: tagCounts.length,
			pendingMcpChangeCount: pendingChanges.length,
		};
	} catch {
		return {
			noteCount: null,
			tagCount: null,
			pendingMcpChangeCount: null,
		};
	}
}

async function createMainWindow(): Promise<void> {
	const window = new BrowserWindow({
		title: 'DND Tools',
		width: 1560,
		height: 980,
		minWidth: 1180,
		minHeight: 760,
		icon: resolveWindowIconPath(),
		frame: false,
		titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
		titleBarOverlay: false,
		autoHideMenuBar: true,
		backgroundColor: '#f8f1e4',
		show: false,
		...(process.platform === 'win32' ? { backgroundMaterial: 'mica' as const } : {}),
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			preload: path.join(__dirname, 'preload.cjs'),
		},
	});
	window.removeMenu();
	window.setMenuBarVisibility(false);

	const emitWindowState = (): void => {
		if (window.isDestroyed()) return;
		window.webContents.send('dndtools:window-state', { isMaximized: window.isMaximized() });
	};

	window.on('maximize', emitWindowState);
	window.on('unmaximize', emitWindowState);
	window.on('enter-full-screen', emitWindowState);
	window.on('leave-full-screen', emitWindowState);
	window.once('ready-to-show', () => {
		window.show();
		emitWindowState();
	});

	const entry = getRendererEntrypoint();

	if (entry.devUrl) {
		await window.loadURL(entry.devUrl);
		window.webContents.openDevTools({ mode: 'detach' });
		return;
	}

	const rootDir = path.dirname(entry.filePath);
	const localUrl = await startStaticServer(rootDir);
	await window.loadURL(localUrl);
}

ipcMain.handle('dndtools:storage:get-note', async (_event, id: string) => {
	return requireStorage().getNote(id as never);
});
ipcMain.handle(
	'dndtools:storage:get-all-notes',
	async (_event, options?: { includeDeleted?: boolean }) => {
		return requireStorage().getAllNotes(options);
	},
);
ipcMain.handle('dndtools:storage:save-note', async (_event, note: unknown) => {
	await requireStorage().saveNote(note as never);
});
ipcMain.handle('dndtools:storage:delete-note', async (_event, id: string, permanent?: boolean) => {
	await requireStorage().deleteNote(id as never, permanent);
});
ipcMain.handle('dndtools:storage:restore-note', async (_event, id: string) => {
	await requireStorage().restoreNote(id as never);
});
ipcMain.handle('dndtools:storage:get-notes-by-folder', async (_event, folder: string) => {
	return requireStorage().getNotesByFolder(folder as never);
});
ipcMain.handle('dndtools:storage:get-notes-by-tag', async (_event, tag: string) => {
	return requireStorage().getNotesByTag(tag);
});
ipcMain.handle('dndtools:storage:get-recent-notes', async (_event, limit: number) => {
	return requireStorage().getRecentNotes(limit);
});
ipcMain.handle('dndtools:storage:get-deleted-notes', async () => {
	return requireStorage().getDeletedNotes();
});
ipcMain.handle('dndtools:storage:resolve-title', async (_event, title: string) => {
	return requireStorage().resolveTitle(title);
});
ipcMain.handle('dndtools:storage:get-links-from', async (_event, noteId: string) => {
	return requireStorage().getLinksFrom(noteId as never);
});
ipcMain.handle('dndtools:storage:get-links-to', async (_event, noteId: string) => {
	return requireStorage().getLinksTo(noteId as never);
});
ipcMain.handle(
	'dndtools:storage:set-links-from',
	async (_event, noteId: string, links: unknown) => {
		await requireStorage().setLinksFrom(noteId as never, links as never);
	},
);
ipcMain.handle('dndtools:storage:get-all-links', async () => {
	return requireStorage().getAllLinks();
});
ipcMain.handle('dndtools:storage:get-session-boards', async () => {
	return requireStorage().getSessionBoards();
});
ipcMain.handle('dndtools:storage:get-session-board', async (_event, id: string) => {
	return requireStorage().getSessionBoard(id as never);
});
ipcMain.handle('dndtools:storage:save-session-board', async (_event, board: unknown) => {
	await requireStorage().saveSessionBoard(board as never);
});
ipcMain.handle('dndtools:storage:delete-session-board', async (_event, id: string) => {
	await requireStorage().deleteSessionBoard(id as never);
});
ipcMain.handle(
	'dndtools:storage:suggest-related-notes',
	async (_event, noteIds: string[], limit?: number) => {
		return requireStorage().suggestRelatedNotes(noteIds as never, limit);
	},
);
ipcMain.handle('dndtools:storage:get-object', async (_event, id: string) => {
	return requireStorage().getObject(id as never);
});
ipcMain.handle(
	'dndtools:storage:get-all-objects',
	async (_event, options?: { type?: string; query?: string }) => {
		return requireStorage().getAllObjects(options);
	},
);
ipcMain.handle('dndtools:storage:save-object', async (_event, object: unknown) => {
	await requireStorage().saveObject(object as never);
});
ipcMain.handle('dndtools:storage:delete-object', async (_event, id: string) => {
	await requireStorage().deleteObject(id as never);
});
ipcMain.handle('dndtools:storage:get-object-relationship-graph', async () => {
	return requireStorage().getObjectRelationshipGraph();
});
ipcMain.handle('dndtools:storage:lint-objects', async () => {
	return requireStorage().lintObjects();
});
ipcMain.handle(
	'dndtools:storage:get-object-history',
	async (_event, id: string, options?: { limit?: number }) => {
		return requireStorage().getObjectHistory(id as never, options);
	},
);
ipcMain.handle(
	'dndtools:storage:revert-object-history',
	async (_event, id: string, historyEntryId: string) => {
		return requireStorage().revertObjectToHistory(id as never, historyEntryId);
	},
);
ipcMain.handle('dndtools:storage:get-setting', async (_event, key: string) => {
	return requireStorage().getSetting(key as never);
});
ipcMain.handle('dndtools:storage:set-setting', async (_event, key: string, value: unknown) => {
	await requireStorage().setSetting(key as never, value as never);
});
ipcMain.handle('dndtools:storage:create-safety-snapshot', async (_event, reason?: string) => {
	return requireStorage().createSafetySnapshot(reason);
});
ipcMain.handle('dndtools:storage:list-safety-snapshots', async () => {
	return requireStorage().listSafetySnapshots();
});
ipcMain.handle(
	'dndtools:storage:restore-deleted-from-snapshot',
	async (_event, snapshotId: string) => {
		return requireStorage().restoreDeletedFromSnapshot(snapshotId);
	},
);
ipcMain.handle('dndtools:storage:import-notes', async (_event, notes: unknown) => {
	return requireStorage().importNotes(notes as never);
});
ipcMain.handle('dndtools:storage:export-all-notes', async () => {
	return requireStorage().exportAllNotes();
});
ipcMain.handle('dndtools:storage:get-note-count', async () => {
	return requireStorage().getNoteCount();
});
ipcMain.handle('dndtools:storage:get-tag-counts', async () => {
	return requireStorage().getTagCounts();
});
ipcMain.handle('dndtools:storage:refresh-from-disk', async () => {
	await requireStorage().refreshFromDisk();
});
ipcMain.handle('dndtools:storage:get-integrity-report', async () => {
	return requireStorage().getMetadataIntegrityReport();
});
ipcMain.handle('dndtools:storage:repair-integrity', async () => {
	return requireStorage().repairMetadataIntegrity();
});
ipcMain.handle('dndtools:schema:get-migration-report', async () => {
	return requireStorage().getSchemaMigrationReport();
});
ipcMain.handle(
	'dndtools:schema:run-migrations',
	async (_event, options?: { dryRun?: boolean; createCheckpoint?: boolean }) => {
		return requireStorage().runSchemaMigrations(options);
	},
);

ipcMain.handle('dndtools:backend-info', async () => {
	return {
		backend: 'desktop-filesystem',
		vaultDir,
	};
});

ipcMain.handle('dndtools:mcp-status', async () => {
	return mcpSidecar.getStatus();
});

ipcMain.handle('dndtools:mcp-restart', async () => {
	await mcpSidecar.restart(vaultDir);
	const status = mcpSidecar.getStatus();
	if (status.state === 'error') {
		diagnostics.recordError(
			createStructuredError({
				category: 'mcp_sidecar',
				code: 'MCP_SIDECAR_RESTART_FAILED',
				message: status.error ?? 'MCP sidecar restart failed',
			}),
		);
	}
	return status;
});

ipcMain.handle('dndtools:diagnostics:mark-success', async (_event, subsystem: unknown) => {
	if (!isHealthSubsystem(subsystem)) {
		throw new Error(`Invalid subsystem: ${String(subsystem)}`);
	}
	diagnostics.markSubsystemSuccess(subsystem);
});

ipcMain.handle('dndtools:diagnostics:record-error', async (_event, event: unknown) => {
	if (!isStructuredErrorEvent(event)) {
		throw new Error('Invalid diagnostics error event payload');
	}
	diagnostics.recordError(event);
});

ipcMain.handle('dndtools:diagnostics:get-health', async () => {
	return {
		...diagnostics.getHealthSnapshot(),
		mcpStatus: mcpSidecar.getStatus(),
		mcpLifecycle: mcpSidecar.getLifecycleEvents(),
	};
});

ipcMain.handle('dndtools:diagnostics:export', async () => {
	const suffix = new Date().toISOString().replace(/[:.]/g, '-');
	const defaultPath = path.join(app.getPath('documents'), `dndtools-diagnostics-${suffix}.json`);
	const picked = await dialog.showSaveDialog({
		title: 'Export Diagnostics Bundle',
		defaultPath,
		filters: [{ name: 'JSON', extensions: ['json'] }],
	});

	if (picked.canceled || !picked.filePath) {
		return { canceled: true, path: null as string | null };
	}

	const health = diagnostics.getHealthSnapshot();
	const metricsBase = await collectBundleMetrics();
	const bundle = {
		generatedAt: new Date().toISOString(),
		health,
		environment: diagnostics.getEnvironment(),
		metrics: diagnostics.getMetrics(metricsBase),
		mcp: {
			status: mcpSidecar.getStatus(),
			lifecycle: mcpSidecar.getLifecycleEvents(120),
		},
		logs: health.recentErrors,
	};
	await fs.writeFile(picked.filePath, JSON.stringify(bundle, null, 2), 'utf-8');
	return { canceled: false, path: picked.filePath };
});

ipcMain.handle('dndtools:vault-refresh', async () => {
	const current = requireStorage();
	await current.refreshFromDisk();
	diagnostics.markSubsystemSuccess('vault_sync');
	return { noteCount: await current.getNoteCount() };
});

ipcMain.handle('dndtools:mcp-changes:list', async (): Promise<McpChangeRecord[]> => {
	return requireStorage().getPendingMcpChanges();
});

ipcMain.handle('dndtools:mcp-changes:audit', async (_event, limit?: number) => {
	return requireStorage().getMcpAuditTrail(limit);
});

ipcMain.handle('dndtools:mcp-policy:get', async () => {
	return requireStorage().getMcpPolicySettings();
});

ipcMain.handle('dndtools:mcp-policy:set', async (_event, settings: unknown) => {
	return requireStorage().setMcpPolicySettings(settings as never);
});

ipcMain.handle('dndtools:mcp-changes:approve', async (_event, changeId: string) => {
	return requireStorage().approveMcpChange(changeId);
});

ipcMain.handle('dndtools:mcp-changes:approve-all', async () => {
	return requireStorage().approveAllMcpChanges();
});

ipcMain.handle('dndtools:mcp-changes:reject', async (_event, changeId: string) => {
	return requireStorage().rejectMcpChange(changeId);
});

ipcMain.handle('dndtools:mcp-changes:reject-all', async () => {
	return requireStorage().rejectAllMcpChanges();
});

ipcMain.handle('dndtools:pick-vault', async () => {
	const picked = await dialog.showOpenDialog({
		properties: ['openDirectory', 'createDirectory'],
		title: 'Choose DND Tools Vault Folder',
	});

	if (picked.canceled || picked.filePaths.length === 0) return null;

	const nextVault = picked.filePaths[0]!;
	await setVaultDirectory(nextVault);
	return { vaultDir: nextVault };
});

ipcMain.handle('dndtools:window:minimize', async (event) => {
	BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle('dndtools:window:toggle-maximize', async (event) => {
	const win = BrowserWindow.fromWebContents(event.sender);
	if (!win) return;
	if (win.isMaximized()) {
		win.unmaximize();
		return;
	}
	win.maximize();
});

ipcMain.handle('dndtools:window:close', async (event) => {
	BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle('dndtools:window:get-state', async (event) => {
	const win = BrowserWindow.fromWebContents(event.sender);
	return {
		isMaximized: win?.isMaximized() ?? false,
	};
});

process.on('uncaughtException', (error) => {
	diagnostics.recordError(
		createStructuredError({
			category: 'ui_runtime',
			code: 'MAIN_UNCAUGHT_EXCEPTION',
			message: error.message,
			details: error.stack ?? null,
		}),
	);
});

process.on('unhandledRejection', (reason) => {
	diagnostics.recordError(
		createStructuredError({
			category: 'ui_runtime',
			code: 'MAIN_UNHANDLED_REJECTION',
			message: reason instanceof Error ? reason.message : String(reason),
			details: reason instanceof Error ? (reason.stack ?? null) : null,
		}),
	);
});

app.whenReady().then(async () => {
	await setVaultDirectory(resolveVaultDir());
	await createMainWindow();
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

app.on('activate', async () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		await createMainWindow();
	}
});

app.on('before-quit', () => {
	void storage?.close();
	void mcpSidecar.stop();
	if (staticServer) {
		staticServer.close();
		staticServer = null;
	}
});
