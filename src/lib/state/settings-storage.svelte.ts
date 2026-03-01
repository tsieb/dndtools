import { getStorage } from '$lib/platform/storage/index.js';
import type { Note } from '$lib/types/note.js';
import type { AppSettings } from '$lib/types/settings.js';
import type { ImportResult, SafetySnapshot, SnapshotRestoreResult } from '$lib/types/storage.js';

type BackupSettings = {
	cadence: AppSettings['backupCadence'];
	retentionCount: number;
};

class SettingsStorageState {
	async getTemplateContext(): Promise<AppSettings['templateContext']> {
		return getStorage().getSetting('templateContext');
	}

	async saveTemplateContext(templateContext: AppSettings['templateContext']): Promise<void> {
		await getStorage().setSetting('templateContext', templateContext);
	}

	async getBackupSettings(): Promise<BackupSettings> {
		const storage = getStorage();
		const [cadence, retentionCount] = await Promise.all([
			storage.getSetting('backupCadence'),
			storage.getSetting('backupRetentionCount'),
		]);
		return { cadence, retentionCount };
	}

	async saveBackupSettings(settings: BackupSettings): Promise<BackupSettings> {
		const storage = getStorage();
		const retentionCount = Math.max(1, Math.round(settings.retentionCount));
		await Promise.all([
			storage.setSetting('backupCadence', settings.cadence),
			storage.setSetting('backupRetentionCount', retentionCount),
		]);
		return {
			cadence: settings.cadence,
			retentionCount,
		};
	}

	async listSafetySnapshots(): Promise<SafetySnapshot[]> {
		return getStorage().listSafetySnapshots();
	}

	async createSafetySnapshot(reason: string): Promise<SafetySnapshot> {
		return getStorage().createSafetySnapshot(reason);
	}

	async restoreDeletedFromSnapshot(snapshotId: string): Promise<SnapshotRestoreResult> {
		return getStorage().restoreDeletedFromSnapshot(snapshotId);
	}

	async importNotes(notes: Note[]): Promise<ImportResult> {
		return getStorage().importNotes(notes);
	}
}

export const settingsStorageState = new SettingsStorageState();
