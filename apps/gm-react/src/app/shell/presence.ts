import { useI18n } from '../../i18n';
import { useCloudSync } from '../../cloud/CloudSyncContext';
import { useSession } from '../../net/SessionContext';

/**
 * The DM-footer presence dot — REAL state, not a hardcoded "Online": the live P2P session role wins
 * (hosting / joined), then the cloud-backup engine (error / backing up / current), else the honest
 * local-only baseline. The label doubles as the row's status caption.
 */
export function usePresenceStatus(): { dot: 'live' | 'idle' | 'error' | 'pending'; label: string } {
	const { t } = useI18n();
	const session = useSession();
	const cloud = useCloudSync();
	if (session.role === 'host') {
		const n = session.peers.length;
		return {
			dot: 'live',
			label: n > 0 ? t('shell.hostingPlayers', { count: n }) : t('shell.hostingWaiting'),
		};
	}
	if (session.role === 'joined') return { dot: 'live', label: t('shell.connected') };
	if (cloud.available && cloud.enabled) {
		const es = cloud.engineStatus;
		if (es?.lastError) return { dot: 'error', label: t('shell.backupError') };
		if (es?.busy) return { dot: 'pending', label: t('shell.backingUp') };
		return {
			dot: 'live',
			label: es?.lastSyncedAt ? t('shell.backupCurrent') : t('shell.backupOn'),
		};
	}
	return { dot: 'idle', label: t('shell.localOnly') };
}
