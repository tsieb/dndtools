import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import AdmZip from 'adm-zip';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { z } from 'zod';
import { FileSystemAdapter } from '../mcp/storage.js';
import {
	getSchemaMigrationReport as getVaultSchemaMigrationReport,
	runSchemaMigrations as runVaultSchemaMigrations,
} from '../mcp/migrations.js';
import { McpSidecar } from './mcp-sidecar.js';
import type { McpChangeRecord } from '../src/lib/types/mcp.js';
import type {
	HealthSubsystem,
	PerformanceMeasurementInput,
	StructuredErrorEvent,
} from '../src/lib/types/diagnostics.js';
import { getErrorTaxonomyEntry } from '../src/lib/domain/error-taxonomy.js';
import type { NoteId, FolderId, Link } from '../src/lib/types/note.js';
import type { AppSettings } from '../src/lib/types/settings.js';
import type { SessionBoardId, SessionBoard } from '../src/lib/types/session-board.js';
import type { VaultObjectId, VaultObject } from '../src/lib/types/object.js';
import { DiagnosticsTracker } from './diagnostics.js';
import { ImportExportService } from './import-export-service.js';
import * as BackupScheduler from './backup-scheduler.js';
import { DesktopUpdateService } from './update-service.js';
import {
	VaultHistoryStore,
	evaluateVaultPermissions,
	type RecentVaultEntry,
	type VaultPermissionReport,
} from './vault-history.js';
import {
	parseIpcArg,
	idSchema,
	folderPathSchema,
	tagSchema,
	limitSchema,
	optionalLimitSchema,
	noteSchema,
	linkSchema,
	vaultObjectSchema,
	sessionBoardSchema,
	appSettingsKeySchema,
	settingValueSchemas,
	mcpPolicySettingsSchema,
	migrationOptionsSchema,
	healthSubsystemSchema,
	structuredErrorEventSchema,
	performanceMeasurementSchema,
	getAllNotesOptionsSchema,
	getAllObjectsOptionsSchema,
	getObjectHistoryOptionsSchema,
	suggestNoteIdsSchema,
	importNotesSchema,
	snapshotReasonSchema,
	semanticModelSchema,
	semanticTextsSchema,
	importSourceRequestSchema,
	startImportJobSchema,
	importJobQuerySchema,
	exportMarkdownZipSchema,
	mapAssetRelativePathSchema,
} from './ipc-schemas.js';

let storage: FileSystemAdapter | null = null;
let vaultDir = '';
let staticServer: http.Server | null = null;
const mcpSidecar = new McpSidecar();
const diagnostics = new DiagnosticsTracker();
const smokeTestMode = process.env.DNDTOOLS_SMOKE_TEST === '1';
const autoUpdateEnabled =
	process.env.DNDTOOLS_DISABLE_AUTO_UPDATE !== '1' && process.env.NODE_ENV !== 'test';
let vaultHistoryStore: VaultHistoryStore | null = null;
let updateService: DesktopUpdateService | null = null;
let updateCheckInterval: NodeJS.Timeout | null = null;

type VaultSwitchStepId = 'permission_check' | 'open_target' | 'rollback';

interface VaultSwitchStep {
	id: VaultSwitchStepId;
	status: 'completed' | 'failed' | 'skipped';
	at: string;
	detail: string;
}

interface VaultSwitchResult {
	ok: boolean;
	vaultDir: string | null;
	previousVaultDir: string | null;
	rollbackApplied: boolean;
	steps: VaultSwitchStep[];
	error: string | null;
	remediation: string | null;
}

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

const MAP_IMPORT_MAX_BYTES = 50 * 1024 * 1024;
const MAP_IMPORT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
const MAP_IMPORT_FILTERS = [
	{
		name: 'Map Images',
		extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'],
	},
];

function sanitizeFileNameSegment(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function normalizeMapAssetRelativePath(relativePath: string): string {
	return relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function ensurePathInsideVault(vaultRoot: string, candidatePath: string): void {
	const relative = path.relative(path.resolve(vaultRoot), path.resolve(candidatePath));
	if (
		relative.startsWith('..') ||
		path.isAbsolute(relative) ||
		relative.split(path.sep).includes('..')
	) {
		throw new Error('Path escapes the active vault.');
	}
}

async function importMapAssetFromSource(
	sourceAbsolutePath: string,
	vaultRoot: string,
): Promise<{
	filePath: string;
	fileUrl: string;
	byteSize: number;
	mimeType: string;
	name: string;
}> {
	const sourceStats = await fs.stat(sourceAbsolutePath);
	if (!sourceStats.isFile()) {
		throw new Error('Selected map asset is not a file.');
	}
	if (sourceStats.size > MAP_IMPORT_MAX_BYTES) {
		throw new Error('Map asset exceeds 50 MB limit.');
	}

	const extension = path.extname(sourceAbsolutePath).toLowerCase();
	if (!MAP_IMPORT_EXTENSIONS.has(extension)) {
		throw new Error('Unsupported map asset format.');
	}

	const sourceName = path.basename(sourceAbsolutePath, extension);
	const slug = sanitizeFileNameSegment(sourceName) || 'map';
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const fileName = `${slug}-${timestamp}${extension}`;
	const relativePath = path.join('.vault', 'assets', 'maps', fileName);
	const normalizedRelativePath = normalizeMapAssetRelativePath(relativePath);
	const targetAbsolutePath = path.join(vaultRoot, normalizedRelativePath);
	ensurePathInsideVault(vaultRoot, targetAbsolutePath);

	await fs.mkdir(path.dirname(targetAbsolutePath), { recursive: true });
	await fs.copyFile(sourceAbsolutePath, targetAbsolutePath);

	const mimeType = CONTENT_TYPES[extension] ?? 'application/octet-stream';
	return {
		filePath: normalizedRelativePath,
		fileUrl: pathToFileURL(targetAbsolutePath).toString(),
		byteSize: sourceStats.size,
		mimeType,
		name: sourceName || 'Map',
	};
}

function resolveVaultDirFromArgsOrEnv(): string | null {
	const vaultFlag = process.argv.find((arg) => arg.startsWith('--vault='));
	if (vaultFlag) return path.resolve(vaultFlag.slice('--vault='.length));

	const positional = process.argv.slice(2).find((arg) => !arg.startsWith('-'));
	if (positional) return path.resolve(positional);

	if (process.env.DNDTOOLS_VAULT) return path.resolve(process.env.DNDTOOLS_VAULT);
	return null;
}

function getDefaultVaultDir(): string {
	return path.join(app.getPath('documents'), 'dndtools-vault');
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function createVaultSwitchStep(
	id: VaultSwitchStepId,
	status: VaultSwitchStep['status'],
	detail: string,
): VaultSwitchStep {
	return {
		id,
		status,
		detail,
		at: new Date().toISOString(),
	};
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
	const measureId = `vault-open-${Date.now()}`;
	const startMark = `dndtools:${measureId}:start`;
	const endMark = `dndtools:${measureId}:end`;
	const measureName = `dndtools:${measureId}:measure`;
	const startedAt = performance.now();
	performance.mark(startMark);
	let completed = false;

	try {
		BackupScheduler.stop();
		if (storage) {
			await storage.close();
		}

		const schemaPreflight = await getVaultSchemaMigrationReport(nextVaultDir);
		if (schemaPreflight.vaultTooNew) {
			throw new Error(
				'This vault was created with a newer version of DND Tools and cannot be opened. Please upgrade the application.',
			);
		}
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
		BackupScheduler.start(
			nextVaultDir,
			() => storage,
			async () => (storage ? storage.getSetting('backupCadence').catch(() => null) : null),
		);
		// Configure sidecar log path and load persisted events before restarting.
		mcpSidecar.setLogPath(nextVaultDir);
		await mcpSidecar.loadPersistedEvents();
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
		completed = true;
	} finally {
		performance.mark(endMark);
		performance.measure(measureName, startMark, endMark);
		const measured = performance.getEntriesByName(measureName, 'measure').at(-1);
		const durationMs = Number(
			((measured?.duration ?? performance.now() - startedAt) || 0).toFixed(2),
		);
		performance.clearMarks(startMark);
		performance.clearMarks(endMark);
		performance.clearMeasures(measureName);
		diagnostics.recordPerformance({
			operation: 'vault_open',
			durationMs,
			source: 'main',
			context: {
				success: completed,
				vaultName: path.basename(nextVaultDir),
			},
		});
	}
}

async function getStartupVaultCandidate(): Promise<string> {
	const explicit = resolveVaultDirFromArgsOrEnv();
	if (explicit) return explicit;
	const recent = await vaultHistoryStore?.getLastVaultDir();
	if (recent) return recent;
	return getDefaultVaultDir();
}

function renderRecentVaultLine(entry: RecentVaultEntry): string {
	const healthLabel =
		entry.health === 'healthy'
			? 'healthy'
			: entry.health === 'read_only'
				? 'read-only'
				: entry.health === 'permission_denied'
					? 'permission denied'
					: entry.health === 'unavailable'
						? 'missing'
						: 'error';
	return `${path.basename(entry.vaultDir)} — ${healthLabel} — ${entry.lastOpenedAt}`;
}

async function promptStartupVaultSelection(errorMessage: string): Promise<string | null> {
	const recent = (await vaultHistoryStore?.listRecentVaults(3)) ?? [];
	const recentButtons = recent.map((entry) => `Open ${path.basename(entry.vaultDir)}`);
	const chooseButton = 'Choose vault folder';
	const defaultButton = 'Use default vault';
	const quitButton = 'Quit';
	const buttons = [...recentButtons, chooseButton, defaultButton, quitButton];
	const chooseIndex = recentButtons.length;
	const defaultIndex = recentButtons.length + 1;
	const quitIndex = recentButtons.length + 2;

	const detailLines = [
		`Open error: ${errorMessage}`,
		'',
		...(recent.length > 0
			? ['Recent vaults:', ...recent.map((entry) => `- ${renderRecentVaultLine(entry)}`)]
			: ['No recent vaults recorded yet.']),
		'',
		'Select a vault to continue.',
	];

	const response = await dialog.showMessageBox({
		type: 'warning',
		title: 'Vault unavailable',
		message: 'The last vault could not be opened.',
		detail: detailLines.join('\n'),
		buttons,
		defaultId: 0,
		cancelId: quitIndex,
		noLink: true,
	});

	if (response.response >= 0 && response.response < recent.length) {
		return recent[response.response]!.vaultDir;
	}
	if (response.response === chooseIndex) {
		const picked = await dialog.showOpenDialog({
			properties: ['openDirectory', 'createDirectory'],
			title: 'Choose DND Tools Vault Folder',
		});
		if (picked.canceled || picked.filePaths.length === 0) return null;
		return path.resolve(picked.filePaths[0]!);
	}
	if (response.response === defaultIndex) {
		return getDefaultVaultDir();
	}
	if (response.response === quitIndex || response.response === -1) {
		return null;
	}
	return null;
}

async function initializeStartupVault(): Promise<boolean> {
	let candidate = await getStartupVaultCandidate();
	for (let attempts = 0; attempts < 5; attempts += 1) {
		try {
			await setVaultDirectory(candidate);
			await vaultHistoryStore?.recordVaultOpen(candidate);
			return true;
		} catch (error) {
			const message = toErrorMessage(error);
			await vaultHistoryStore?.recordVaultFailure(candidate, message);
			diagnostics.recordError(
				createStructuredError({
					category: 'storage',
					code: 'STORAGE_INIT_FAILED',
					message,
					context: {
						stage: 'startup-vault-selection',
						vaultDir: candidate,
					},
				}),
			);
			const next = await promptStartupVaultSelection(message);
			if (!next) {
				return false;
			}
			candidate = path.resolve(next);
		}
	}
	return false;
}

async function switchVaultDirectory(nextVaultDir: string): Promise<VaultSwitchResult> {
	const targetVaultDir = path.resolve(nextVaultDir);
	const previousVaultDir = vaultDir ? path.resolve(vaultDir) : null;
	const steps: VaultSwitchStep[] = [];
	const permissions = await evaluateVaultPermissions(targetVaultDir);

	if (!permissions.readable || !permissions.writable) {
		steps.push(
			createVaultSwitchStep(
				'permission_check',
				'failed',
				permissions.remediation ?? 'Vault permission check failed.',
			),
		);
		await vaultHistoryStore?.recordVaultFailure(
			targetVaultDir,
			permissions.remediation ?? 'Vault permission check failed.',
		);
		steps.push(
			createVaultSwitchStep('open_target', 'skipped', 'Skipped due to permission failure.'),
		);
		steps.push(
			createVaultSwitchStep(
				'rollback',
				'skipped',
				'No switch attempt was made, rollback not required.',
			),
		);
		return {
			ok: false,
			vaultDir: previousVaultDir,
			previousVaultDir,
			rollbackApplied: false,
			steps,
			error: 'Vault permission check failed.',
			remediation: permissions.remediation,
		};
	}

	steps.push(
		createVaultSwitchStep(
			'permission_check',
			'completed',
			'Vault read/write permissions verified.',
		),
	);
	try {
		await setVaultDirectory(targetVaultDir);
		await vaultHistoryStore?.recordVaultOpen(targetVaultDir);
		steps.push(createVaultSwitchStep('open_target', 'completed', 'Vault opened successfully.'));
		steps.push(createVaultSwitchStep('rollback', 'skipped', 'Rollback not required.'));
		return {
			ok: true,
			vaultDir: targetVaultDir,
			previousVaultDir,
			rollbackApplied: false,
			steps,
			error: null,
			remediation: null,
		};
	} catch (error) {
		const message = toErrorMessage(error);
		steps.push(createVaultSwitchStep('open_target', 'failed', message));
		await vaultHistoryStore?.recordVaultFailure(targetVaultDir, message);

		let rollbackApplied = false;
		let rollbackError: string | null = null;
		if (previousVaultDir && previousVaultDir !== targetVaultDir) {
			try {
				await setVaultDirectory(previousVaultDir);
				await vaultHistoryStore?.recordVaultOpen(previousVaultDir);
				rollbackApplied = true;
				steps.push(
					createVaultSwitchStep(
						'rollback',
						'completed',
						'Restored previous vault after switch failure.',
					),
				);
			} catch (rollbackFailure) {
				rollbackError = toErrorMessage(rollbackFailure);
				steps.push(createVaultSwitchStep('rollback', 'failed', rollbackError));
			}
		} else {
			steps.push(
				createVaultSwitchStep('rollback', 'skipped', 'No previous vault available for rollback.'),
			);
		}

		return {
			ok: false,
			vaultDir: rollbackApplied ? previousVaultDir : null,
			previousVaultDir,
			rollbackApplied,
			steps,
			error: rollbackError ? `${message} (rollback failed: ${rollbackError})` : message,
			remediation:
				'Select another vault folder, then confirm this folder exists and has read/write access for your user account.',
		};
	}
}

function requireStorage(): FileSystemAdapter {
	if (!storage) {
		throw new Error('Storage is not initialized');
	}
	return storage;
}

function requireUpdateService(): DesktopUpdateService {
	if (!updateService) {
		throw new Error('Update service is not initialized');
	}
	return updateService;
}

const importExportService = new ImportExportService(
	() => requireStorage(),
	() => vaultDir,
);

function createStructuredError(input: {
	category: StructuredErrorEvent['category'];
	code: string;
	message: string;
	details?: string | null;
	context?: StructuredErrorEvent['context'];
}): StructuredErrorEvent {
	const entry = getErrorTaxonomyEntry(input.code);
	return {
		id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
		at: new Date().toISOString(),
		category: input.category,
		code: input.code,
		message: input.message,
		severity: entry?.severity ?? 'error',
		recoveryHint: entry?.recoveryHint ?? null,
		details: input.details ?? null,
		context: input.context ?? {},
	};
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

async function ingestMcpPerformanceSamples(): Promise<void> {
	if (!vaultDir) return;
	const perfLogPath = path.join(vaultDir, '.vault', 'mcp-performance.json');
	try {
		const raw = await fs.readFile(perfLogPath, 'utf-8');
		const parsed = JSON.parse(raw) as { events?: unknown[] };
		if (!Array.isArray(parsed.events)) return;
		for (const event of parsed.events) {
			const validated = performanceMeasurementSchema.safeParse(event);
			if (!validated.success) continue;
			diagnostics.recordPerformance(validated.data as PerformanceMeasurementInput);
		}
	} catch {
		// No MCP performance log yet or parse failure. Ignore.
	}
}

type EmbeddingStatus = {
	available: boolean;
	model: string | null;
	models: string[];
	reason: string | null;
};

const OLLAMA_BASE_URL = process.env.DNDTOOLS_OLLAMA_URL ?? 'http://127.0.0.1:11434';
const EMBEDDING_MODEL_HINT = /(embed|embedding|nomic-embed|bge|e5|gte)/i;

function chooseEmbeddingModel(models: string[]): string | null {
	const exact = models.find((name) => EMBEDDING_MODEL_HINT.test(name));
	return exact ?? null;
}

async function fetchEmbeddingStatus(): Promise<EmbeddingStatus> {
	try {
		const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
			method: 'GET',
			signal: AbortSignal.timeout(2000),
		});
		if (!response.ok) {
			return {
				available: false,
				model: null,
				models: [],
				reason: `Ollama tags request failed (${response.status})`,
			};
		}
		const payload = (await response.json()) as {
			models?: Array<{ name?: string; model?: string }>;
		};
		const models = (payload.models ?? [])
			.map((entry) => entry.name ?? entry.model ?? '')
			.map((value) => value.trim())
			.filter(Boolean);
		const model = chooseEmbeddingModel(models);
		if (!model) {
			return {
				available: false,
				model: null,
				models,
				reason: 'No embedding model found in local Ollama',
			};
		}
		return {
			available: true,
			model,
			models,
			reason: null,
		};
	} catch (error) {
		return {
			available: false,
			model: null,
			models: [],
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}

async function fetchEmbeddings(model: string, texts: string[]): Promise<number[][]> {
	const vectors: number[][] = [];
	for (const text of texts) {
		const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				prompt: text,
			}),
			signal: AbortSignal.timeout(5_000),
		});
		if (!response.ok) {
			throw new Error(`Embedding request failed (${response.status})`);
		}
		const payload = (await response.json()) as { embedding?: number[] };
		if (!Array.isArray(payload.embedding)) {
			throw new Error('Embedding payload missing vector');
		}
		vectors.push(payload.embedding.map((value) => Number(value) || 0));
	}
	return vectors;
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
		if (smokeTestMode) {
			console.log('DNDTOOLS_SMOKE_READY');
			setTimeout(() => {
				if (!window.isDestroyed()) {
					window.close();
				}
			}, 350);
		}
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

// â”€â”€â”€ Storage IPC handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ipcMain.handle('dndtools:storage:get-note', async (_event, rawId: unknown) => {
	const id = parseIpcArg(idSchema, rawId, 'storage:get-note');
	return requireStorage().getNote(id as NoteId);
});

ipcMain.handle('dndtools:storage:get-all-notes', async (_event, rawOptions: unknown) => {
	const options = parseIpcArg(getAllNotesOptionsSchema, rawOptions, 'storage:get-all-notes');
	return requireStorage().getAllNotes(options);
});

ipcMain.handle('dndtools:storage:save-note', async (_event, rawNote: unknown) => {
	const note = parseIpcArg(noteSchema, rawNote, 'storage:save-note');
	await requireStorage().saveNote(note as never);
});

ipcMain.handle(
	'dndtools:storage:delete-note',
	async (_event, rawId: unknown, rawPermanent: unknown) => {
		const id = parseIpcArg(idSchema, rawId, 'storage:delete-note:id');
		const permanent = parseIpcArg(
			z.boolean().optional(),
			rawPermanent,
			'storage:delete-note:permanent',
		);
		await requireStorage().deleteNote(id as NoteId, permanent);
	},
);

ipcMain.handle('dndtools:storage:restore-note', async (_event, rawId: unknown) => {
	const id = parseIpcArg(idSchema, rawId, 'storage:restore-note');
	await requireStorage().restoreNote(id as NoteId);
});

ipcMain.handle('dndtools:storage:get-notes-by-folder', async (_event, rawFolder: unknown) => {
	const folder = parseIpcArg(folderPathSchema, rawFolder, 'storage:get-notes-by-folder');
	return requireStorage().getNotesByFolder(folder as FolderId);
});

ipcMain.handle('dndtools:storage:get-notes-by-tag', async (_event, rawTag: unknown) => {
	const tag = parseIpcArg(tagSchema, rawTag, 'storage:get-notes-by-tag');
	return requireStorage().getNotesByTag(tag);
});

ipcMain.handle('dndtools:storage:get-recent-notes', async (_event, rawLimit: unknown) => {
	const limit = parseIpcArg(limitSchema, rawLimit, 'storage:get-recent-notes');
	return requireStorage().getRecentNotes(limit);
});

ipcMain.handle('dndtools:storage:get-deleted-notes', async () => {
	return requireStorage().getDeletedNotes();
});

ipcMain.handle('dndtools:storage:resolve-title', async (_event, rawTitle: unknown) => {
	const title = parseIpcArg(z.string().min(1).max(1024), rawTitle, 'storage:resolve-title');
	return requireStorage().resolveTitle(title);
});

ipcMain.handle('dndtools:storage:get-links-from', async (_event, rawNoteId: unknown) => {
	const noteId = parseIpcArg(idSchema, rawNoteId, 'storage:get-links-from');
	return requireStorage().getLinksFrom(noteId as NoteId);
});

ipcMain.handle('dndtools:storage:get-links-to', async (_event, rawNoteId: unknown) => {
	const noteId = parseIpcArg(idSchema, rawNoteId, 'storage:get-links-to');
	return requireStorage().getLinksTo(noteId as NoteId);
});

ipcMain.handle(
	'dndtools:storage:set-links-from',
	async (_event, rawNoteId: unknown, rawLinks: unknown) => {
		const noteId = parseIpcArg(idSchema, rawNoteId, 'storage:set-links-from:noteId');
		const links = parseIpcArg(z.array(linkSchema), rawLinks, 'storage:set-links-from:links');
		await requireStorage().setLinksFrom(noteId as NoteId, links as Link[]);
	},
);

ipcMain.handle('dndtools:storage:get-all-links', async () => {
	return requireStorage().getAllLinks();
});

ipcMain.handle('dndtools:storage:get-session-boards', async () => {
	return requireStorage().getSessionBoards();
});

ipcMain.handle('dndtools:storage:get-session-board', async (_event, rawId: unknown) => {
	const id = parseIpcArg(idSchema, rawId, 'storage:get-session-board');
	return requireStorage().getSessionBoard(id as SessionBoardId);
});

ipcMain.handle('dndtools:storage:save-session-board', async (_event, rawBoard: unknown) => {
	const board = parseIpcArg(sessionBoardSchema, rawBoard, 'storage:save-session-board');
	await requireStorage().saveSessionBoard(board as SessionBoard);
});

ipcMain.handle('dndtools:storage:delete-session-board', async (_event, rawId: unknown) => {
	const id = parseIpcArg(idSchema, rawId, 'storage:delete-session-board');
	await requireStorage().deleteSessionBoard(id as SessionBoardId);
});

ipcMain.handle(
	'dndtools:storage:suggest-related-notes',
	async (_event, rawNoteIds: unknown, rawLimit: unknown) => {
		const noteIds = parseIpcArg(
			suggestNoteIdsSchema,
			rawNoteIds,
			'storage:suggest-related-notes:noteIds',
		);
		const limit = parseIpcArg(optionalLimitSchema, rawLimit, 'storage:suggest-related-notes:limit');
		return requireStorage().suggestRelatedNotes(noteIds as NoteId[], limit);
	},
);

ipcMain.handle('dndtools:storage:get-object', async (_event, rawId: unknown) => {
	const id = parseIpcArg(idSchema, rawId, 'storage:get-object');
	return requireStorage().getObject(id as VaultObjectId);
});

ipcMain.handle('dndtools:storage:get-all-objects', async (_event, rawOptions: unknown) => {
	const options = parseIpcArg(getAllObjectsOptionsSchema, rawOptions, 'storage:get-all-objects');
	return requireStorage().getAllObjects(options);
});

ipcMain.handle('dndtools:storage:save-object', async (_event, rawObject: unknown) => {
	const object = parseIpcArg(vaultObjectSchema, rawObject, 'storage:save-object');
	await requireStorage().saveObject(object as VaultObject);
});

ipcMain.handle('dndtools:storage:delete-object', async (_event, rawId: unknown) => {
	const id = parseIpcArg(idSchema, rawId, 'storage:delete-object');
	await requireStorage().deleteObject(id as VaultObjectId);
});

ipcMain.handle('dndtools:storage:get-object-relationship-graph', async () => {
	return requireStorage().getObjectRelationshipGraph();
});

ipcMain.handle('dndtools:storage:lint-objects', async () => {
	return requireStorage().lintObjects();
});

ipcMain.handle(
	'dndtools:storage:get-object-history',
	async (_event, rawId: unknown, rawOptions: unknown) => {
		const id = parseIpcArg(idSchema, rawId, 'storage:get-object-history:id');
		const options = parseIpcArg(
			getObjectHistoryOptionsSchema,
			rawOptions,
			'storage:get-object-history:options',
		);
		return requireStorage().getObjectHistory(id as VaultObjectId, options);
	},
);

ipcMain.handle(
	'dndtools:storage:revert-object-history',
	async (_event, rawId: unknown, rawHistoryEntryId: unknown) => {
		const id = parseIpcArg(idSchema, rawId, 'storage:revert-object-history:id');
		const historyEntryId = parseIpcArg(
			idSchema,
			rawHistoryEntryId,
			'storage:revert-object-history:historyEntryId',
		);
		return requireStorage().revertObjectToHistory(id as VaultObjectId, historyEntryId);
	},
);

ipcMain.handle('dndtools:storage:get-setting', async (_event, rawKey: unknown) => {
	const key = parseIpcArg(appSettingsKeySchema, rawKey, 'storage:get-setting');
	return requireStorage().getSetting(key as keyof AppSettings);
});

ipcMain.handle(
	'dndtools:storage:set-setting',
	async (_event, rawKey: unknown, rawValue: unknown) => {
		const key = parseIpcArg(appSettingsKeySchema, rawKey, 'storage:set-setting:key');
		const value = parseIpcArg(settingValueSchemas[key], rawValue, 'storage:set-setting:value');
		if (key === 'backupCadence') {
			BackupScheduler.updateCadence(value as string, () => storage);
		}
		await requireStorage().setSetting(key as keyof AppSettings, value as never);
	},
);

ipcMain.handle('dndtools:storage:get-note-templates', async () => {
	return requireStorage().getNoteTemplates();
});

ipcMain.handle('dndtools:storage:get-reusable-snippets', async () => {
	return requireStorage().getReusableSnippets();
});

ipcMain.handle('dndtools:storage:create-safety-snapshot', async (_event, rawReason: unknown) => {
	const reason = parseIpcArg(snapshotReasonSchema, rawReason, 'storage:create-safety-snapshot');
	return requireStorage().createSafetySnapshot(reason);
});

ipcMain.handle('dndtools:storage:list-safety-snapshots', async () => {
	return requireStorage().listSafetySnapshots();
});

ipcMain.handle(
	'dndtools:storage:restore-deleted-from-snapshot',
	async (_event, rawSnapshotId: unknown) => {
		const snapshotId = parseIpcArg(
			idSchema,
			rawSnapshotId,
			'storage:restore-deleted-from-snapshot',
		);
		return requireStorage().restoreDeletedFromSnapshot(snapshotId);
	},
);

ipcMain.handle('dndtools:storage:import-notes', async (_event, rawNotes: unknown) => {
	const notes = parseIpcArg(importNotesSchema, rawNotes, 'storage:import-notes');
	return requireStorage().importNotes(notes as never);
});

ipcMain.handle('dndtools:storage:export-all-notes', async () => {
	return requireStorage().exportAllNotes();
});

ipcMain.handle('dndtools:import-export:pick-source', async () => {
	const picked = await dialog.showOpenDialog({
		properties: ['openDirectory'],
		title: 'Choose Import Source Folder',
	});
	if (picked.canceled || picked.filePaths.length === 0) return null;
	return { sourceRoot: path.resolve(picked.filePaths[0]!) };
});

ipcMain.handle('dndtools:import-export:analyze-source', async (_event, rawRequest: unknown) => {
	const request = parseIpcArg(
		importSourceRequestSchema,
		rawRequest,
		'import-export:analyze-source',
	);
	return importExportService.analyzeImportSource(request.sourceRoot);
});

ipcMain.handle('dndtools:import-export:start-job', async (_event, rawRequest: unknown) => {
	const request = parseIpcArg(startImportJobSchema, rawRequest, 'import-export:start-job');
	return importExportService.startImportJob({
		sourceRoot: request.sourceRoot,
		defaultResolution: request.defaultResolution,
		resumeFromCheckpoint: request.resumeFromCheckpoint ?? false,
	});
});

ipcMain.handle('dndtools:import-export:get-job', async (_event, rawRequest: unknown) => {
	const request = parseIpcArg(importJobQuerySchema, rawRequest, 'import-export:get-job');
	return importExportService.getImportJobProgress(request.jobId);
});

ipcMain.handle('dndtools:import-export:get-checkpoint', async () => {
	return importExportService.getImportCheckpointSummary();
});

ipcMain.handle('dndtools:import-export:resume-checkpoint', async () => {
	const checkpoint = await importExportService.getImportCheckpointSummary();
	if (!checkpoint.exists || !checkpoint.sourceRoot) {
		return null;
	}
	return importExportService.startImportJob({
		sourceRoot: checkpoint.sourceRoot,
		defaultResolution: checkpoint.defaultResolution,
		resumeFromCheckpoint: true,
	});
});

ipcMain.handle('dndtools:import-export:clear-checkpoint', async () => {
	await importExportService.clearImportCheckpoint();
	return importExportService.getImportCheckpointSummary();
});

ipcMain.handle('dndtools:import-export:export-zip', async (_event, rawRequest: unknown) => {
	const request = parseIpcArg(exportMarkdownZipSchema, rawRequest, 'import-export:export-zip');
	let outputPath = request.outputPath ?? null;
	if (!outputPath) {
		const suffix = request.profile === 'deterministic_markdown_zip' ? 'deterministic' : 'portable';
		const defaultPath = path.join(app.getPath('documents'), `dndtools-export-${suffix}.zip`);
		const picked = await dialog.showSaveDialog({
			title: 'Export Markdown Zip',
			defaultPath,
			filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
		});
		if (picked.canceled || !picked.filePath) {
			const now = new Date().toISOString();
			return {
				canceled: true,
				path: null,
				profile: request.profile,
				noteCount: 0,
				assetCount: 0,
				validation: {
					generatedAt: now,
					brokenEmbeds: 0,
					unresolvedLinks: 0,
					issues: [],
				},
			};
		}
		outputPath = picked.filePath;
	}

	return importExportService.exportMarkdownZip({
		profile: request.profile,
		outputPath: path.resolve(outputPath),
	});
});

ipcMain.handle('dndtools:maps:import-from-dialog', async () => {
	const picked = await dialog.showOpenDialog({
		title: 'Import Map Asset',
		properties: ['openFile'],
		filters: MAP_IMPORT_FILTERS,
	});
	if (picked.canceled || picked.filePaths.length === 0) {
		return { canceled: true };
	}

	const sourceAbsolutePath = path.resolve(picked.filePaths[0]!);
	const imported = await importMapAssetFromSource(sourceAbsolutePath, vaultDir);
	return {
		canceled: false,
		...imported,
	};
});

ipcMain.handle('dndtools:maps:resolve-asset-url', async (_event, rawRelativePath: unknown) => {
	const relativePath = parseIpcArg(
		mapAssetRelativePathSchema,
		rawRelativePath,
		'maps:resolve-asset-url:path',
	);
	const normalizedRelativePath = normalizeMapAssetRelativePath(relativePath);
	if (!normalizedRelativePath.startsWith('.vault/assets/maps/')) {
		throw new Error('Map asset path must be under .vault/assets/maps/.');
	}

	const absolutePath = path.join(vaultDir, normalizedRelativePath);
	ensurePathInsideVault(vaultDir, absolutePath);
	try {
		const stat = await fs.stat(absolutePath);
		if (!stat.isFile()) {
			return null;
		}
		return pathToFileURL(absolutePath).toString();
	} catch {
		return null;
	}
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

ipcMain.handle('dndtools:storage:rebuild-index', async () => {
	return requireStorage().rebuildVaultIndex();
});

ipcMain.handle(
	'dndtools:storage:clear-changelog',
	async (_event, options?: { maxAgeMs?: number }) => {
		return requireStorage().clearMcpChangelog(options);
	},
);

// â”€â”€â”€ Schema migration IPC handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ipcMain.handle('dndtools:schema:get-migration-report', async () => {
	return requireStorage().getSchemaMigrationReport();
});

ipcMain.handle('dndtools:schema:run-migrations', async (_event, rawOptions: unknown) => {
	const options = parseIpcArg(migrationOptionsSchema, rawOptions, 'schema:run-migrations');
	const store = requireStorage();
	// Create a safety snapshot before applying live migrations so the user can
	// restore via the UI if something goes wrong, regardless of the checkpoint.
	if (!options.dryRun) {
		await store.createSafetySnapshot('before-migration').catch(() => undefined);
	}
	return store.runSchemaMigrations(options);
});

ipcMain.handle('dndtools:schema:list-checkpoints', async () => {
	return requireStorage().listMigrationCheckpoints();
});

ipcMain.handle('dndtools:schema:restore-checkpoint', async (_event, rawCheckpointName: unknown) => {
	const checkpointName = parseIpcArg(
		z.string().min(1).max(512),
		rawCheckpointName,
		'schema:restore-checkpoint',
	);
	return requireStorage().restoreMigrationCheckpoint(checkpointName);
});

// Meta / platform IPC handlers

ipcMain.handle('dndtools:backend-info', async () => {
	return {
		backend: 'desktop-filesystem',
		vaultDir,
	};
});

ipcMain.handle('dndtools:mcp-status', async () => {
	return mcpSidecar.getStatus();
});

ipcMain.handle('dndtools:update:get-status', async () => {
	return requireUpdateService().getStatus();
});

ipcMain.handle('dndtools:update:check', async () => {
	return requireUpdateService().checkForUpdates();
});

ipcMain.handle('dndtools:update:download', async () => {
	return requireUpdateService().downloadUpdateNow();
});

ipcMain.handle('dndtools:update:install', async () => {
	return requireUpdateService().installUpdateNow();
});

ipcMain.handle('dndtools:update:remind-later', async (_event, rawHours: unknown) => {
	const hours = parseIpcArg(
		z.number().int().min(1).max(168).optional(),
		rawHours,
		'update:remind-later:hours',
	);
	return requireUpdateService().remindLater(hours ?? 24);
});

ipcMain.handle('dndtools:semantic:status', async () => {
	return fetchEmbeddingStatus();
});

ipcMain.handle(
	'dndtools:semantic:embed',
	async (_event, rawModel: unknown, rawTexts: unknown): Promise<number[][]> => {
		const model = parseIpcArg(semanticModelSchema, rawModel, 'semantic:embed:model');
		const texts = parseIpcArg(semanticTextsSchema, rawTexts, 'semantic:embed:texts');
		return fetchEmbeddings(model, texts);
	},
);

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

// â”€â”€â”€ Diagnostics IPC handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ipcMain.handle('dndtools:diagnostics:mark-success', async (_event, rawSubsystem: unknown) => {
	const subsystem = parseIpcArg(healthSubsystemSchema, rawSubsystem, 'diagnostics:mark-success');
	diagnostics.markSubsystemSuccess(subsystem as HealthSubsystem);
});

ipcMain.handle('dndtools:diagnostics:record-error', async (_event, rawEvent: unknown) => {
	const event = parseIpcArg(structuredErrorEventSchema, rawEvent, 'diagnostics:record-error');
	diagnostics.recordError(event as StructuredErrorEvent);
});

ipcMain.handle('dndtools:diagnostics:record-performance', async (_event, rawEvent: unknown) => {
	const event = parseIpcArg(
		performanceMeasurementSchema,
		rawEvent,
		'diagnostics:record-performance',
	);
	diagnostics.recordPerformance(event as PerformanceMeasurementInput);
});

ipcMain.handle('dndtools:diagnostics:get-health', async () => {
	await ingestMcpPerformanceSamples();
	return {
		...diagnostics.getHealthSnapshot(),
		mcpStatus: mcpSidecar.getStatus(),
		mcpLifecycle: mcpSidecar.getLifecycleEvents(),
	};
});

ipcMain.handle('dndtools:diagnostics:export', async () => {
	const now = new Date();
	const suffix = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const defaultPath = path.join(app.getPath('documents'), `dndtools-diagnostics-${suffix}.zip`);
	const picked = await dialog.showSaveDialog({
		title: 'Export Diagnostics Bundle',
		defaultPath,
		filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
	});

	if (picked.canceled || !picked.filePath) {
		return { canceled: true, path: null as string | null };
	}

	const metricsBase = await collectBundleMetrics();
	const environment = diagnostics.getEnvironment();
	const metrics = diagnostics.getMetrics(metricsBase);
	const mcpStatus = mcpSidecar.getStatus();
	const mcpLifecycle = mcpSidecar.getLifecycleEvents(120);
	const integrityReport = (await storage?.getMetadataIntegrityReport().catch(() => null)) ?? null;
	await ingestMcpPerformanceSamples();
	const refreshedHealth = diagnostics.getHealthSnapshot();

	// Redact user-identifying paths before bundling.
	const redactedVaultDir = vaultDir ? '[VAULT_DIR_REDACTED]' : null;
	const redactedMcpEntry = mcpStatus.entry ? path.basename(mcpStatus.entry) : null;

	const diagnosticsJson = {
		generatedAt: now.toISOString(),
		appVersion: app.getVersion(),
		environment,
		metrics,
		health: {
			generatedAt: refreshedHealth.generatedAt,
			lastSuccessful: refreshedHealth.lastSuccessful,
			performance: refreshedHealth.performance,
		},
		mcp: {
			state: mcpStatus.state,
			entry: redactedMcpEntry,
			vaultDir: redactedVaultDir,
			pid: mcpStatus.pid,
			lastStartedAt: mcpStatus.lastStartedAt,
			lastStoppedAt: mcpStatus.lastStoppedAt,
			lastExitReason: mcpStatus.lastExitReason,
			restartCount: mcpStatus.restartCount,
			crashCount: mcpStatus.crashCount,
			error: mcpStatus.error,
		},
	};

	// Redact error events: preserve operational fields, strip vault paths from messages.
	const redactedErrors = refreshedHealth.recentErrors.map((e) => ({
		id: e.id,
		at: e.at,
		category: e.category,
		code: e.code,
		severity: e.severity,
		recoveryHint: e.recoveryHint,
		// Strip vault dir from message/details to avoid leaking user path.
		message: vaultDir ? e.message.replaceAll(vaultDir, '[VAULT_DIR]') : e.message,
		context: e.context,
	}));

	const integrityJson = vaultDir
		? JSON.stringify(integrityReport, null, 2).replaceAll(vaultDir, '[VAULT_DIR]')
		: JSON.stringify(integrityReport, null, 2);

	const readme = [
		'DND Tools Diagnostics Bundle',
		'============================',
		'',
		`Generated: ${now.toISOString()}`,
		'',
		'Contents:',
		'  diagnostics.json  â€” Runtime environment, health timestamps, MCP status, metrics.',
		'  errors.json       â€” Recent structured error events (vault paths redacted).',
		'  sidecar-log.json  â€” MCP sidecar lifecycle event history.',
		'  integrity.json    \u2014 Vault metadata integrity report (vault paths redacted).',
		'',
		'How to share:',
		'  Attach this zip file to a GitHub issue at:',
		'  https://github.com/anthropics/dndtools/issues',
		'',
		'Privacy:',
		'  Vault directory paths are redacted. Note titles and content are NOT included.',
		'  Error messages may contain application-level details but not note content.',
	].join('\n');

	const zip = new AdmZip();
	zip.addFile('diagnostics.json', Buffer.from(JSON.stringify(diagnosticsJson, null, 2), 'utf-8'));
	zip.addFile('errors.json', Buffer.from(JSON.stringify(redactedErrors, null, 2), 'utf-8'));
	zip.addFile(
		'sidecar-log.json',
		Buffer.from(JSON.stringify({ events: mcpLifecycle }, null, 2), 'utf-8'),
	);
	zip.addFile('integrity.json', Buffer.from(integrityJson, 'utf-8'));
	zip.addFile('README.txt', Buffer.from(readme, 'utf-8'));
	zip.writeZip(picked.filePath);

	return { canceled: false, path: picked.filePath };
});

// â”€â”€â”€ Vault IPC handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ipcMain.handle('dndtools:vault-refresh', async () => {
	const current = requireStorage();
	await current.refreshFromDisk();
	diagnostics.markSubsystemSuccess('vault_sync');
	return { noteCount: await current.getNoteCount() };
});

// â”€â”€â”€ MCP change review IPC handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ipcMain.handle('dndtools:mcp-changes:list', async (): Promise<McpChangeRecord[]> => {
	return requireStorage().getPendingMcpChanges();
});

ipcMain.handle('dndtools:mcp-changes:audit', async (_event, rawLimit: unknown) => {
	const limit = parseIpcArg(optionalLimitSchema, rawLimit, 'mcp-changes:audit');
	return requireStorage().getMcpAuditTrail(limit);
});

ipcMain.handle('dndtools:mcp-policy:get', async () => {
	return requireStorage().getMcpPolicySettings();
});

ipcMain.handle('dndtools:mcp-policy:set', async (_event, rawSettings: unknown) => {
	const settings = parseIpcArg(mcpPolicySettingsSchema, rawSettings, 'mcp-policy:set');
	return requireStorage().setMcpPolicySettings(settings as never);
});

ipcMain.handle('dndtools:mcp-changes:approve', async (_event, rawChangeId: unknown) => {
	const changeId = parseIpcArg(idSchema, rawChangeId, 'mcp-changes:approve');
	return requireStorage().approveMcpChange(changeId);
});

ipcMain.handle('dndtools:mcp-changes:approve-all', async () => {
	return requireStorage().approveAllMcpChanges();
});

ipcMain.handle('dndtools:mcp-changes:reject', async (_event, rawChangeId: unknown) => {
	const changeId = parseIpcArg(idSchema, rawChangeId, 'mcp-changes:reject');
	return requireStorage().rejectMcpChange(changeId);
});

ipcMain.handle('dndtools:mcp-changes:reject-all', async () => {
	return requireStorage().rejectAllMcpChanges();
});

// â”€â”€â”€ Vault picker and lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ipcMain.handle('dndtools:vault:recent', async (_event, rawLimit: unknown) => {
	const limit = parseIpcArg(
		z.number().int().min(1).max(20).optional(),
		rawLimit,
		'vault:recent:limit',
	);
	return (await vaultHistoryStore?.listRecentVaults(limit ?? 8)) ?? [];
});

ipcMain.handle('dndtools:vault:permissions', async (_event, rawVaultDir: unknown) => {
	const requested = parseIpcArg(
		z.string().min(1).max(2048).optional(),
		rawVaultDir,
		'vault:permissions:vaultDir',
	);
	const target = requested ? path.resolve(requested) : vaultDir;
	if (!target) {
		return {
			vaultDir: '',
			health: 'unavailable',
			readable: false,
			writable: false,
			available: false,
			remediation: 'No vault is currently selected.',
		} satisfies VaultPermissionReport;
	}
	return evaluateVaultPermissions(target);
});

ipcMain.handle('dndtools:vault:switch', async (_event, rawVaultDir: unknown) => {
	const nextVaultDir = parseIpcArg(folderPathSchema, rawVaultDir, 'vault:switch:vaultDir');
	return switchVaultDirectory(nextVaultDir);
});

ipcMain.handle('dndtools:pick-vault', async () => {
	const picked = await dialog.showOpenDialog({
		properties: ['openDirectory', 'createDirectory'],
		title: 'Choose DND Tools Vault Folder',
	});
	if (picked.canceled || picked.filePaths.length === 0) return null;
	const nextVault = path.resolve(picked.filePaths[0]!);
	return switchVaultDirectory(nextVault);
});

// â”€â”€â”€ Window management IPC handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Process-level error trapping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Application lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.whenReady().then(async () => {
	vaultHistoryStore = new VaultHistoryStore(
		path.join(app.getPath('userData'), 'vault-history.json'),
	);
	updateService = new DesktopUpdateService({
		userDataDir: app.getPath('userData'),
		currentVersion: app.getVersion(),
		enabled: app.isPackaged && autoUpdateEnabled,
	});
	await updateService.initialize();

	const startupReady = await initializeStartupVault();
	if (!startupReady) {
		app.quit();
		return;
	}

	await createMainWindow();

	if (updateService.getStatus().enabled) {
		void updateService.checkForUpdates();
		updateCheckInterval = setInterval(
			() => {
				void updateService?.checkForUpdates();
			},
			6 * 60 * 60 * 1000,
		);
	}
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

app.on('activate', async () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		await createMainWindow();
	}
});

let isQuitting = false;

app.on('before-quit', (event) => {
	if (isQuitting) return;

	const current = storage;
	const needsOnCloseSnapshot = !!current;

	if (!needsOnCloseSnapshot) {
		void mcpSidecar.stop();
		if (updateCheckInterval) {
			clearInterval(updateCheckInterval);
			updateCheckInterval = null;
		}
		if (staticServer) {
			staticServer.close();
			staticServer = null;
		}
		return;
	}

	// Prevent default quit to allow async cleanup (snapshot + close) to finish.
	event.preventDefault();
	isQuitting = true;

	void (async () => {
		try {
			const cadence = await current.getSetting('backupCadence').catch(() => null);
			if (cadence === 'on-close') {
				await current.createSafetySnapshot('auto-on-close').catch(() => undefined);
			}
		} finally {
			BackupScheduler.stop();
			await current.close().catch(() => undefined);
			void mcpSidecar.stop();
			if (updateCheckInterval) {
				clearInterval(updateCheckInterval);
				updateCheckInterval = null;
			}
			if (staticServer) {
				staticServer.close();
				staticServer = null;
			}
			app.quit();
		}
	})();
});
