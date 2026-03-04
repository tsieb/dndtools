import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export type DesktopUpdateState =
	| 'idle'
	| 'disabled'
	| 'checking'
	| 'up_to_date'
	| 'available'
	| 'deferred'
	| 'downloading'
	| 'downloaded'
	| 'error';

export interface StagedRolloutStatus {
	active: boolean;
	reason: 'major' | 'not_major';
	eligible: boolean;
	cohortPercent: number;
	allowedPercent: number;
	dailyPercent: number;
	daysSinceRelease: number;
}

export interface DesktopUpdateStatus {
	enabled: boolean;
	state: DesktopUpdateState;
	currentVersion: string;
	latestVersion: string | null;
	releaseName: string | null;
	releaseDate: string | null;
	releaseNotes: string | null;
	downloadProgressPercent: number | null;
	downloadedBytes: number | null;
	totalBytes: number | null;
	lastCheckedAt: string | null;
	deferredUntil: string | null;
	stagedRollout: StagedRolloutStatus | null;
	message: string | null;
	error: string | null;
}

interface PersistedUpdateState {
	version: 1;
	installationId: string;
	deferredUntil: string | null;
}

interface UpdateInfoLike {
	version?: string;
	releaseName?: string | null;
	releaseDate?: string | null;
	releaseNotes?: unknown;
}

interface ProgressInfoLike {
	percent?: number;
	transferred?: number;
	total?: number;
}

interface UpdaterLike {
	autoDownload: boolean;
	autoInstallOnAppQuit: boolean;
	allowPrerelease: boolean;
	allowDowngrade: boolean;
	on(event: string, listener: (...args: unknown[]) => void): void;
	checkForUpdates(): Promise<unknown>;
	downloadUpdate(): Promise<unknown>;
	quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

const PERSISTED_VERSION = 1;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function safeIsoDate(input: unknown): string | null {
	if (typeof input !== 'string' || input.trim().length === 0) return null;
	const parsed = Date.parse(input);
	if (Number.isNaN(parsed)) return null;
	return new Date(parsed).toISOString();
}

function parseMajor(version: string): number | null {
	const match = /^v?(\d+)\./.exec(version.trim());
	if (!match) return null;
	return Number(match[1] ?? '');
}

function parseReleaseNotes(input: unknown): string | null {
	if (typeof input === 'string') {
		const trimmed = input.trim();
		return trimmed.length > 0 ? trimmed : null;
	}
	if (!Array.isArray(input)) return null;
	const chunks = input
		.map((entry) => {
			if (typeof entry === 'string') return entry.trim();
			if (
				entry !== null &&
				typeof entry === 'object' &&
				'note' in entry &&
				typeof (entry as { note?: unknown }).note === 'string'
			) {
				return ((entry as { note: string }).note || '').trim();
			}
			return '';
		})
		.filter((value) => value.length > 0);
	return chunks.length > 0 ? chunks.join('\n\n') : null;
}

export function cohortPercentFromKey(input: string): number {
	const digest = createHash('sha256').update(input, 'utf-8').digest('hex').slice(0, 8);
	return Number.parseInt(digest, 16) % 100;
}

export function evaluateStagedRollout(input: {
	currentVersion: string;
	nextVersion: string;
	releaseDate: string | null;
	installationId: string;
	now: Date;
	dailyPercent: number;
}): StagedRolloutStatus {
	const currentMajor = parseMajor(input.currentVersion);
	const nextMajor = parseMajor(input.nextVersion);
	const isMajorRelease =
		currentMajor !== null && nextMajor !== null ? nextMajor > currentMajor : false;
	const boundedDailyPercent = Math.min(100, Math.max(1, Math.round(input.dailyPercent)));
	const cohortPercent = cohortPercentFromKey(`${input.installationId}:${input.nextVersion}`);

	if (!isMajorRelease) {
		return {
			active: false,
			reason: 'not_major',
			eligible: true,
			cohortPercent,
			allowedPercent: 100,
			dailyPercent: boundedDailyPercent,
			daysSinceRelease: 0,
		};
	}

	const releaseMs = input.releaseDate ? Date.parse(input.releaseDate) : Number.NaN;
	const daysSinceRelease = Number.isNaN(releaseMs)
		? 0
		: Math.max(0, Math.floor((input.now.getTime() - releaseMs) / ONE_DAY_MS));
	const allowedPercent = Math.min(100, (daysSinceRelease + 1) * boundedDailyPercent);
	return {
		active: true,
		reason: 'major',
		eligible: cohortPercent < allowedPercent,
		cohortPercent,
		allowedPercent,
		dailyPercent: boundedDailyPercent,
		daysSinceRelease,
	};
}

export class DesktopUpdateService {
	private readonly statePath: string;
	private readonly now: () => Date;
	private readonly majorDailyPercent: number;
	private updater: UpdaterLike | null = null;
	private persistedState: PersistedUpdateState | null = null;
	private initialized = false;
	private status: DesktopUpdateStatus;

	constructor(input: {
		userDataDir: string;
		currentVersion: string;
		enabled: boolean;
		now?: () => Date;
		majorDailyPercent?: number;
		updater?: UpdaterLike;
	}) {
		this.statePath = path.join(input.userDataDir, 'update-state.json');
		this.now = input.now ?? (() => new Date());
		this.updater = input.updater ?? null;
		this.majorDailyPercent =
			input.majorDailyPercent ??
			Math.min(
				100,
				Math.max(1, Number.parseInt(process.env.DNDTOOLS_UPDATE_MAJOR_DAILY_PERCENT ?? '20', 10)),
			);
		this.status = {
			enabled: input.enabled,
			state: input.enabled ? 'idle' : 'disabled',
			currentVersion: input.currentVersion,
			latestVersion: null,
			releaseName: null,
			releaseDate: null,
			releaseNotes: null,
			downloadProgressPercent: null,
			downloadedBytes: null,
			totalBytes: null,
			lastCheckedAt: null,
			deferredUntil: null,
			stagedRollout: null,
			message: input.enabled ? null : 'Auto-update is only available in packaged desktop builds.',
			error: null,
		};
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		this.persistedState = await this.loadPersistedState();
		this.status.deferredUntil = this.persistedState.deferredUntil;
		this.initialized = true;
		if (!this.status.enabled) return;
		if (!this.updater) {
			const { autoUpdater } = await import('electron-updater');
			this.updater = autoUpdater as unknown as UpdaterLike;
		}
		const updater = this.updater;
		if (!updater) return;

		updater.autoDownload = false;
		updater.autoInstallOnAppQuit = true;
		updater.allowPrerelease = false;
		updater.allowDowngrade = false;

		updater.on('checking-for-update', () => {
			this.status.state = 'checking';
			this.status.error = null;
			this.status.message = 'Checking for updates...';
		});

		updater.on('update-not-available', () => {
			this.status.state = 'up_to_date';
			this.status.latestVersion = null;
			this.status.releaseName = null;
			this.status.releaseDate = null;
			this.status.releaseNotes = null;
			this.status.downloadProgressPercent = null;
			this.status.downloadedBytes = null;
			this.status.totalBytes = null;
			this.status.stagedRollout = null;
			this.status.error = null;
			this.status.message = 'You are running the latest version.';
		});

		updater.on('update-available', (info: UpdateInfoLike) => {
			this.handleUpdateAvailable(info);
		});

		updater.on('download-progress', (progress: ProgressInfoLike) => {
			this.status.state = 'downloading';
			this.status.downloadProgressPercent = Number.isFinite(progress.percent ?? Number.NaN)
				? Number((progress.percent ?? 0).toFixed(2))
				: 0;
			this.status.downloadedBytes = Number(progress.transferred ?? 0);
			this.status.totalBytes = Number(progress.total ?? 0);
			this.status.message = 'Downloading update...';
			this.status.error = null;
		});

		updater.on('update-downloaded', (info: UpdateInfoLike) => {
			this.status.state = 'downloaded';
			this.status.latestVersion = info.version ?? this.status.latestVersion;
			this.status.releaseName = info.releaseName ?? this.status.releaseName;
			this.status.releaseDate = safeIsoDate(info.releaseDate) ?? this.status.releaseDate;
			this.status.releaseNotes = parseReleaseNotes(info.releaseNotes) ?? this.status.releaseNotes;
			this.status.downloadProgressPercent = 100;
			this.status.message = 'Update ready to install.';
			this.status.error = null;
		});

		updater.on('error', (error: Error) => {
			this.status.state = 'error';
			this.status.error = error.message;
			this.status.message = 'Update check failed.';
		});
	}

	getStatus(): DesktopUpdateStatus {
		return { ...this.status };
	}

	async checkForUpdates(): Promise<DesktopUpdateStatus> {
		if (!this.status.enabled) return this.getStatus();
		await this.initialize();
		this.status.lastCheckedAt = this.now().toISOString();
		try {
			if (!this.updater) throw new Error('Updater client unavailable.');
			await this.updater.checkForUpdates();
		} catch (error) {
			this.status.state = 'error';
			this.status.error = error instanceof Error ? error.message : String(error);
			this.status.message = 'Update check failed.';
		}
		return this.getStatus();
	}

	async downloadUpdateNow(): Promise<DesktopUpdateStatus> {
		if (!this.status.enabled) return this.getStatus();
		if (this.status.state !== 'available') return this.getStatus();
		await this.initialize();
		try {
			this.status.state = 'downloading';
			this.status.message = 'Downloading update...';
			if (!this.updater) throw new Error('Updater client unavailable.');
			await this.updater.downloadUpdate();
		} catch (error) {
			this.status.state = 'error';
			this.status.error = error instanceof Error ? error.message : String(error);
			this.status.message = 'Update download failed.';
		}
		return this.getStatus();
	}

	installUpdateNow(): DesktopUpdateStatus {
		if (!this.status.enabled) return this.getStatus();
		if (this.status.state !== 'downloaded') return this.getStatus();
		if (!this.updater) return this.getStatus();
		this.updater.quitAndInstall(false, true);
		return this.getStatus();
	}

	async remindLater(hours = 24): Promise<DesktopUpdateStatus> {
		if (!this.status.enabled) return this.getStatus();
		await this.initialize();
		const deferredUntil = new Date(
			this.now().getTime() + Math.max(1, hours) * 60 * 60 * 1000,
		).toISOString();
		this.status.deferredUntil = deferredUntil;
		this.status.state = 'deferred';
		this.status.message = `Reminder set until ${deferredUntil}.`;
		if (this.persistedState) {
			this.persistedState.deferredUntil = deferredUntil;
			await this.savePersistedState(this.persistedState);
		}
		return this.getStatus();
	}

	private handleUpdateAvailable(info: UpdateInfoLike): void {
		const now = this.now();
		const latestVersion = info.version ?? null;
		const releaseDate = safeIsoDate(info.releaseDate);
		const releaseNotes = parseReleaseNotes(info.releaseNotes);
		const rollout =
			latestVersion && this.persistedState
				? evaluateStagedRollout({
						currentVersion: this.status.currentVersion,
						nextVersion: latestVersion,
						releaseDate,
						installationId: this.persistedState.installationId,
						now,
						dailyPercent: this.majorDailyPercent,
					})
				: null;
		const deferredUntil = safeIsoDate(this.status.deferredUntil);
		const reminderBlocked = deferredUntil ? now.getTime() < Date.parse(deferredUntil) : false;
		const rolloutBlocked = rollout ? rollout.active && !rollout.eligible : false;

		this.status.latestVersion = latestVersion;
		this.status.releaseName = info.releaseName ?? null;
		this.status.releaseDate = releaseDate;
		this.status.releaseNotes = releaseNotes;
		this.status.stagedRollout = rollout;
		this.status.error = null;

		if (rolloutBlocked) {
			this.status.state = 'deferred';
			this.status.message = `Staged rollout in progress for major release. Eligible cohort: ${rollout?.allowedPercent}% of users.`;
			return;
		}
		if (reminderBlocked) {
			this.status.state = 'deferred';
			this.status.message = `Update reminder deferred until ${deferredUntil}.`;
			return;
		}

		this.status.state = 'available';
		this.status.message = 'Update available.';
	}

	private async loadPersistedState(): Promise<PersistedUpdateState> {
		try {
			const raw = await fs.readFile(this.statePath, 'utf-8');
			const parsed = JSON.parse(raw) as Partial<PersistedUpdateState>;
			if (
				parsed.version === PERSISTED_VERSION &&
				typeof parsed.installationId === 'string' &&
				parsed.installationId.trim().length > 0
			) {
				const normalized: PersistedUpdateState = {
					version: PERSISTED_VERSION,
					installationId: parsed.installationId,
					deferredUntil: safeIsoDate(parsed.deferredUntil) ?? null,
				};
				return normalized;
			}
		} catch {
			// Fall through to initialize a new state file.
		}
		const initialized: PersistedUpdateState = {
			version: PERSISTED_VERSION,
			installationId: randomUUID(),
			deferredUntil: null,
		};
		await this.savePersistedState(initialized);
		return initialized;
	}

	private async savePersistedState(state: PersistedUpdateState): Promise<void> {
		await fs.mkdir(path.dirname(this.statePath), { recursive: true });
		await fs.writeFile(this.statePath, JSON.stringify(state, null, 2), 'utf-8');
	}
}
