import { SettingsSection } from './Experience';
import { useEffect, useState } from 'react';
import { Badge, Button, Dialog, StatusDot, Switch, Toaster } from '../../ds';
import { Panel, SetRow, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useCloudSync } from '../../cloud/CloudSyncContext';
import { isOnline } from '../../platform/preferences';
import { CloudOfflineNotice, useCloudActions } from '../../cloud/offline';
import { useEntitlements } from '../../cloud/entitlements';
import { humanizeEntity } from './shared';
import { RecoveryKeyPanel, VaultPrivacyPanel } from './SyncPrivacy';
import { SyncConflictsPanel } from './SyncConflicts';
import { ProductAnalyticsPanel } from './Analytics';
import { LocalBackupPanel } from './LocalBackup';
/* ---- Backup activity: local operation history + optional encrypted off-device copy. -------------- */
/* The two `humanize*` helpers below read a core command id ('scene.create') and spell it as English
 * prose ('Scene created'). They are the one thing on this screen the catalog cannot reach: the words
 * are derived from identifiers the core owns, not from copy this screen authors, so translating them
 * needs a per-command label catalog next to those ids rather than 200 keys invented here.
 * HANDOFF RC-UX-1.2 → packages/core command registry: a translatable label per command id. */
function humanizeOp(opType: string): string {
	const [scope = 'change', action = 'updated'] = opType.split('.', 2);
	const [verb = 'updated', ...detail] = action.split(/[-_]/g);
	const pastTense: Record<string, string> = {
		add: 'added',
		advance: 'advanced',
		assign: 'assigned',
		create: 'created',
		delete: 'deleted',
		deliver: 'delivered',
		end: 'ended',
		import: 'imported',
		move: 'moved',
		remove: 'removed',
		reorder: 'reordered',
		revoke: 'revoked',
		set: 'changed',
		start: 'started',
		stop: 'stopped',
		update: 'updated',
	};
	const subject = (detail.length > 0 ? detail : scope.split(/[-_]/g)).join(' ');
	const readableSubject = subject.charAt(0).toUpperCase() + subject.slice(1);
	return `${readableSubject} ${pastTense[verb] ?? verb}`;
}

/** E2EE cloud sync controls. "Sync now" COMPARES this device's history with the cloud copy before it
 *  pushes anything (RC-CLD-2.4): a second device that changed the same campaign is found first, so a
 *  push can never quietly overwrite it. Whole-vault restore stays explicit and destructive. */
function CloudSyncPanel({ online, localChanges }: { online: boolean; localChanges: number }) {
	const { t, formatTime } = useI18n();
	const cloud = useCloudSync();
	const ent = useEntitlements();
	const [busy, setBusy] = useState(false);
	const [restoreOpen, setRestoreOpen] = useState(false);
	// Every control below this point is a cloud round trip: enabling sync, pushing, restoring.
	const cloudActions = useCloudActions('cloud.offline.sync');

	if (!cloud.available) {
		return (
			<SettingsSection gateKey="settings.sync.cloudTitle">
				<Panel title={t('settings.sync.cloudTitle')}>
					<div style={{ display: 'flex', alignItems: 'center', gap: T.space.three }}>
						<StatusDot status={online ? 'live' : 'error'} pulse={online} />
						<div style={{ flex: 1 }}>
							<div style={{ font: `600 var(--text-sm) ${T.sans}` }}>
								{t('settings.sync.localOnlyState', {
									state: t(online ? 'settings.sync.online' : 'settings.sync.offline'),
								})}
							</div>
							<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
								{t('settings.sync.localOnlyCount', { count: localChanges })}
							</div>
						</div>
						<Button variant="secondary" size="sm" icon="retry" disabled>
							{t('settings.sync.syncNow')}
						</Button>
					</div>
				</Panel>
			</SettingsSection>
		);
	}

	const gate = cloud.gate;
	const canEnable = cloud.includedInPlan && (gate?.canEnableOnThisDevice ?? false);
	const es = cloud.engineStatus;
	const lastSynced = es?.lastSyncedAt
		? formatTime(new Date(es.lastSyncedAt), { timeStyle: 'medium' })
		: t('settings.sync.never');

	// "Sync now" is a comparison followed by a push, and each answer gets its own honest sentence: a
	// divergence is not an error and is not reported as success — nothing was pushed and the DM has
	// versions to choose. `syncNow` only rejects when the comparison or the push actually failed.
	const syncNow = async () => {
		setBusy(true);
		try {
			const merged = await cloud.syncNow();
			if (merged.outcome === 'diverged') {
				Toaster.info(
					merged.conflictCount > 0
						? t('settings.sync.diverged', { count: merged.conflictCount })
						: t('settings.sync.divergedNoOverlap'),
				);
			} else if (merged.outcome === 'fast-forward') {
				Toaster.success(t('settings.sync.fastForward', { count: merged.incomingCount }));
			} else {
				Toaster.success(t('settings.sync.backedUp'));
			}
		} catch (e) {
			Toaster.error(e instanceof Error ? e.message : t('settings.sync.cloudFailed'));
		} finally {
			setBusy(false);
		}
	};

	const run = async (fn: () => Promise<unknown>, okMsg: string) => {
		setBusy(true);
		try {
			const r = await fn();
			if (r === 'no-snapshot') Toaster.info(t('settings.sync.noSnapshot'));
			else Toaster.success(okMsg);
		} catch (e) {
			Toaster.error(e instanceof Error ? e.message : t('settings.sync.cloudFailed'));
		} finally {
			setBusy(false);
		}
	};

	return (
		<SettingsSection gateKey="settings.sync.cloudTitle">
			<Panel
				title={t('settings.sync.cloudTitle')}
				action={
					<Badge status={cloud.enabled ? 'success' : 'neutral'}>
						{t(cloud.enabled ? 'settings.sync.on' : 'settings.sync.off')}
					</Badge>
				}
			>
				<SetRow
					label={t('settings.sync.cloudRow')}
					help={t(
						!cloud.includedInPlan
							? ent.canChangePlan
								? 'settings.sync.helpNotInPlan'
								: 'settings.sync.helpNotInPlanLocked'
							: canEnable
								? 'settings.sync.help'
								: gate?.custodyAvailable === false
									? 'settings.sync.helpNoCustody'
									: 'settings.sync.helpUnavailable',
					)}
					control={
						<Switch
							checked={cloud.enabled}
							// `busy` flips synchronously inside this switch's own change handler, so a hard
							// `disabled` disabled the control under the user's focus and the browser dropped
							// focus to `<body>` mid-toggle. The durable `!canEnable` gate stays native.
							disabled={!canEnable}
							aria-disabled={busy || cloudActions.offline || undefined}
							title={cloudActions.offlineProps.title}
							data-cloud-offline={cloudActions.offlineProps['data-cloud-offline']}
							aria-label={t('settings.sync.cloudRow')}
							onChange={() => {
								// Switch is not a DS Button, so it does not swallow its own activation when
								// soft-disabled — the offline guard has to live in the handler.
								if (cloudActions.blocked) return;
								void run(
									() => (cloud.enabled ? cloud.disable() : cloud.enable()),
									t(cloud.enabled ? 'settings.sync.turnedOff' : 'settings.sync.turnedOn'),
								);
							}}
						/>
					}
				/>
				<CloudOfflineNotice />
				{cloud.enabled && canEnable ? (
					<div
						role="status"
						aria-live="polite"
						aria-atomic="true"
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: T.space.three,
							marginTop: T.space.three,
							flexWrap: 'wrap',
						}}
					>
						<StatusDot
							status={es?.lastError ? 'error' : es?.busy || busy ? 'pending' : 'live'}
							pulse={es?.busy}
						/>
						<div style={{ flex: 1, minWidth: 180 }}>
							<div style={{ font: `600 var(--text-sm) ${T.sans}` }}>
								{t(
									es?.busy || busy
										? 'settings.sync.stateBusy'
										: es?.lastError
											? 'settings.sync.stateError'
											: es?.lastSyncedAt
												? 'settings.sync.stateUpToDate'
												: 'settings.sync.stateWaiting',
								)}
							</div>
							<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
								{es?.lastError
									? es.lastError
									: t('settings.sync.lastBackedUp', { when: lastSynced })}
							</div>
							{es?.merge && !es.lastError ? (
								<div
									style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}
									data-testid="sync-merge-state"
								>
									{es.merge.outcome === 'diverged'
										? es.merge.conflictCount > 0
											? t('settings.sync.diverged', { count: es.merge.conflictCount })
											: t('settings.sync.divergedNoOverlap')
										: es.merge.outcome === 'fast-forward'
											? t('settings.sync.fastForward', { count: es.merge.incomingCount })
											: es.merge.outcome === 'push-only'
												? t('settings.sync.pushOnly', { count: es.merge.outgoingCount })
												: t('settings.sync.upToDate')}
								</div>
							) : null}
						</div>
						<Button
							variant="secondary"
							size="sm"
							icon="retry"
							disabled={busy || es?.busy}
							{...cloudActions.offlineProps}
							onClick={() => void syncNow()}
						>
							{t('settings.sync.syncNow')}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							icon="download"
							disabled={busy || es?.busy}
							{...cloudActions.offlineProps}
							onClick={() => setRestoreOpen(true)}
						>
							{t('settings.sync.restoreDevice')}
						</Button>
						<Dialog
							open={restoreOpen}
							onClose={() => setRestoreOpen(false)}
							title={t('settings.sync.restoreTitle')}
							description={t('settings.sync.restoreDescription')}
							tone="danger"
							size="sm"
							dismissible={!busy}
							initialFocus="#cancel-cloud-restore"
							role="alertdialog"
							aria-busy={busy}
							footer={
								<>
									<Button
										id="cancel-cloud-restore"
										variant="secondary"
										size="sm"
										disabled={busy}
										onClick={() => setRestoreOpen(false)}
									>
										{t('common.action.cancel')}
									</Button>
									<Button
										variant="danger"
										size="sm"
										disabled={busy}
										{...cloudActions.offlineProps}
										onClick={() => {
											setRestoreOpen(false);
											void run(cloud.restore, t('settings.sync.restored'));
										}}
									>
										{t('settings.sync.replaceLocal')}
									</Button>
								</>
							}
						>
							<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
								{t('settings.sync.restoreBody')}
							</div>
						</Dialog>
					</div>
				) : null}
			</Panel>
		</SettingsSection>
	);
}
export function SettingsSync() {
	const { t, formatDate } = useI18n();
	const runtime = useRuntime();
	const ops = runtime.state.sync.operations;
	const [online, setOnline] = useState<boolean>(isOnline);
	useEffect(() => {
		const on = () => setOnline(true);
		const off = () => setOnline(false);
		window.addEventListener('online', on);
		window.addEventListener('offline', off);
		return () => {
			window.removeEventListener('online', on);
			window.removeEventListener('offline', off);
		};
	}, []);
	const recent = [...ops].slice(-8).reverse();
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.four }}>
			{/* Local backup stays first: it is the section's daily-use action, and on the compact
			    shell the Android acceptance run proved that panels stacked above it push the
			    backup button's tap target under the fixed navigation. The ADR-026 consent and
			    recovery panels are set-once controls and read fine below it. */}
			<LocalBackupPanel />
			<CloudSyncPanel online={online} localChanges={ops.length} />
			{/* Gates itself, so an empty conflict list leaves no empty flex item (and no double gap). */}
			<SyncConflictsPanel />
			<VaultPrivacyPanel />
			<RecoveryKeyPanel />
			<ProductAnalyticsPanel />
			<SettingsSection gateKey="settings.sync.recentChanges">
				<Panel
					title={t('settings.sync.recentChanges')}
					action={<Badge status="neutral">{ops.length}</Badge>}
				>
					{recent.length === 0 ? (
						<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.sub }}>
							{t('settings.sync.noChanges')}
						</div>
					) : (
						recent.map((q) => (
							<div
								key={q.id}
								title={t('settings.sync.changeTitle', { entity: humanizeEntity(q.entityType) })}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: T.space.three,
									padding: `${T.space.two} ${T.space.zero}`,
									font: `var(--text-sm) ${T.sans}`,
									color: T.sub,
									flexWrap: 'wrap',
								}}
							>
								<Badge status="info">{humanizeOp(q.opType)}</Badge>
								<span style={{ flex: '1 1 150px', font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
									{t('settings.sync.saved', {
										when: formatDate(new Date(q.issuedAt), {
											dateStyle: 'medium',
											timeStyle: 'short',
										}),
									})}
								</span>
							</div>
						))
					)}
				</Panel>
			</SettingsSection>
		</div>
	);
}
