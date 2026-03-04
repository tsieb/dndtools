import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';

export type VaultHealthStatus =
	| 'healthy'
	| 'read_only'
	| 'permission_denied'
	| 'unavailable'
	| 'error';

export interface VaultPermissionReport {
	vaultDir: string;
	health: VaultHealthStatus;
	readable: boolean;
	writable: boolean;
	available: boolean;
	remediation: string | null;
}

export interface RecentVaultEntry extends VaultPermissionReport {
	lastOpenedAt: string;
	lastError: string | null;
}

interface PersistedRecentVault {
	vaultDir: string;
	lastOpenedAt: string;
	lastError: string | null;
}

interface VaultHistoryFile {
	version: 1;
	lastVaultDir: string | null;
	recent: PersistedRecentVault[];
}

const HISTORY_VERSION = 1;
const MAX_RECENT_VAULTS = 12;

function isPersistedRecentVault(value: unknown): value is PersistedRecentVault {
	if (value === null || typeof value !== 'object') return false;
	const candidate = value as Partial<PersistedRecentVault>;
	return (
		typeof candidate.vaultDir === 'string' &&
		candidate.vaultDir.length > 0 &&
		typeof candidate.lastOpenedAt === 'string' &&
		typeof candidate.lastError === 'string'
	);
}

function normalizeRecentEntries(entries: PersistedRecentVault[]): PersistedRecentVault[] {
	const deduped = new Map<string, PersistedRecentVault>();
	for (const entry of entries) {
		const resolvedPath = path.resolve(entry.vaultDir);
		const current = deduped.get(resolvedPath);
		if (!current) {
			deduped.set(resolvedPath, {
				vaultDir: resolvedPath,
				lastOpenedAt: entry.lastOpenedAt,
				lastError: entry.lastError ?? null,
			});
			continue;
		}
		if (entry.lastOpenedAt > current.lastOpenedAt) {
			deduped.set(resolvedPath, {
				vaultDir: resolvedPath,
				lastOpenedAt: entry.lastOpenedAt,
				lastError: entry.lastError ?? null,
			});
		}
	}
	return [...deduped.values()]
		.sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
		.slice(0, MAX_RECENT_VAULTS);
}

export async function evaluateVaultPermissions(vaultDir: string): Promise<VaultPermissionReport> {
	const resolved = path.resolve(vaultDir);
	try {
		const stat = await fs.stat(resolved);
		if (!stat.isDirectory()) {
			return {
				vaultDir: resolved,
				health: 'unavailable',
				readable: false,
				writable: false,
				available: false,
				remediation: 'Select a directory path. The selected path is not a folder.',
			};
		}
	} catch {
		return {
			vaultDir: resolved,
			health: 'unavailable',
			readable: false,
			writable: false,
			available: false,
			remediation: 'The vault folder is missing. Choose an existing folder or create a new vault.',
		};
	}

	const readable = await fs
		.access(resolved, fsConstants.R_OK)
		.then(() => true)
		.catch(() => false);
	const writable = await fs
		.access(resolved, fsConstants.W_OK)
		.then(() => true)
		.catch(() => false);

	if (readable && writable) {
		return {
			vaultDir: resolved,
			health: 'healthy',
			readable: true,
			writable: true,
			available: true,
			remediation: null,
		};
	}
	if (readable && !writable) {
		return {
			vaultDir: resolved,
			health: 'read_only',
			readable: true,
			writable: false,
			available: true,
			remediation:
				'Grant write permission to this folder, or select a folder where your account has read/write access.',
		};
	}
	return {
		vaultDir: resolved,
		health: 'permission_denied',
		readable: false,
		writable: false,
		available: false,
		remediation:
			'The app cannot read this folder. Check OS permissions, file ownership, and security software rules.',
	};
}

export class VaultHistoryStore {
	private readonly historyPath: string;

	constructor(historyPath: string) {
		this.historyPath = historyPath;
	}

	async getLastVaultDir(): Promise<string | null> {
		const state = await this.load();
		return state.lastVaultDir ? path.resolve(state.lastVaultDir) : null;
	}

	async setLastVaultDir(vaultDir: string): Promise<void> {
		const state = await this.load();
		state.lastVaultDir = path.resolve(vaultDir);
		await this.save(state);
	}

	async recordVaultOpen(vaultDir: string): Promise<void> {
		const resolved = path.resolve(vaultDir);
		const state = await this.load();
		const now = new Date().toISOString();
		const recent = normalizeRecentEntries([
			{
				vaultDir: resolved,
				lastOpenedAt: now,
				lastError: '',
			},
			...state.recent.filter((entry) => path.resolve(entry.vaultDir) !== resolved),
		]);
		state.lastVaultDir = resolved;
		state.recent = recent;
		await this.save(state);
	}

	async recordVaultFailure(vaultDir: string, errorMessage: string): Promise<void> {
		const resolved = path.resolve(vaultDir);
		const state = await this.load();
		const now = new Date().toISOString();
		const recent = normalizeRecentEntries([
			{
				vaultDir: resolved,
				lastOpenedAt: now,
				lastError: errorMessage,
			},
			...state.recent.filter((entry) => path.resolve(entry.vaultDir) !== resolved),
		]);
		state.recent = recent;
		await this.save(state);
	}

	async listRecentVaults(limit = 8): Promise<RecentVaultEntry[]> {
		const state = await this.load();
		const capped = normalizeRecentEntries(state.recent).slice(0, Math.max(1, limit));
		const reports = await Promise.all(
			capped.map(async (entry): Promise<RecentVaultEntry> => {
				const permissions = await evaluateVaultPermissions(entry.vaultDir);
				return {
					...permissions,
					lastOpenedAt: entry.lastOpenedAt,
					lastError: entry.lastError || null,
				};
			}),
		);
		return reports;
	}

	private async load(): Promise<VaultHistoryFile> {
		try {
			const raw = await fs.readFile(this.historyPath, 'utf-8');
			const parsed = JSON.parse(raw) as Partial<VaultHistoryFile>;
			const recent = Array.isArray(parsed.recent)
				? parsed.recent.filter((entry): entry is PersistedRecentVault =>
						isPersistedRecentVault(entry),
					)
				: [];
			if (parsed.version === HISTORY_VERSION) {
				return {
					version: HISTORY_VERSION,
					lastVaultDir:
						typeof parsed.lastVaultDir === 'string' && parsed.lastVaultDir.length > 0
							? path.resolve(parsed.lastVaultDir)
							: null,
					recent: normalizeRecentEntries(recent),
				};
			}
		} catch {
			// Fall through to default initialization.
		}
		const initial: VaultHistoryFile = {
			version: HISTORY_VERSION,
			lastVaultDir: null,
			recent: [],
		};
		await this.save(initial);
		return initial;
	}

	private async save(payload: VaultHistoryFile): Promise<void> {
		await fs.mkdir(path.dirname(this.historyPath), { recursive: true });
		await fs.writeFile(this.historyPath, JSON.stringify(payload, null, 2), 'utf-8');
	}
}
