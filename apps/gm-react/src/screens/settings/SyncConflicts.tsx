// RC-CLD-2.4 — the DM's side of a cross-device merge. When two devices changed the same item after
// they last matched, the core records a durable conflict; this panel shows those conflicts on
// Settings › Sync and dispatches the DM's choice. It lives beside Sync.tsx rather than inside it
// because it reads a different core surface (the conflict lifecycle, not the backup engine) and
// renders whether or not cloud backup is configured at all.

import { useState } from 'react';
import { getConflictLifecycle, isMergeConflictId } from '@dndtools/core';
import { Badge, Button, Toaster } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { humanizeEntity } from './shared';

/**
 * RC-CLD-2.4 — the sync conflicts a cross-device comparison recorded, and the DM's choice between the
 * two versions. The list comes from the CORE's actor-filtered conflict view over the op-log, and each
 * choice dispatches the same DM-only `conflict.resolve` command every other conflict in the vault
 * uses; this screen never decides that a conflict exists and never writes the resolution itself.
 *
 * It renders only when there is something to resolve, and it is independent of whether cloud backup
 * is configured: a recorded conflict is durable campaign state and stays resolvable offline.
 */
export function SyncConflictsPanel() {
	const { t, formatDate } = useI18n();
	const runtime = useRuntime();
	const [busyId, setBusyId] = useState<string | null>(null);
	const view = getConflictLifecycle(runtime.state.permissions, runtime.defaultActorId, {
		operations: runtime.state.sync.operations,
	});
	const conflicts =
		view.kind === 'conflict-lifecycle'
			? view.dmDetail.filter((entry) => !entry.resolved && isMergeConflictId(entry.conflictId))
			: [];
	if (conflicts.length === 0) return null;

	const choose = async (
		entry: (typeof conflicts)[number],
		side: 'local' | 'remote',
	): Promise<void> => {
		setBusyId(entry.conflictId);
		try {
			const result = await runtime.dispatch({
				type: 'conflict.resolve',
				actorId: runtime.defaultActorId,
				payload: {
					entityType: entry.entityType,
					entityId: entry.entityId,
					conflictId: entry.conflictId,
					selectedValue: side === 'local' ? entry.local.value : entry.remote.value,
					sourceLocalRevision: entry.local.revision,
					sourceRemoteRevision: entry.remote.revision,
				},
			});
			if (result.status === 'accepted') Toaster.success(t('settings.sync.conflictResolved'));
			else Toaster.error(result.rejection?.message ?? t('settings.sync.conflictFailed'));
		} catch (e) {
			Toaster.error(e instanceof Error ? e.message : t('settings.sync.conflictFailed'));
		} finally {
			setBusyId(null);
		}
	};

	return (
		<Panel
			title={t('settings.sync.conflictsTitle')}
			action={<Badge status="warning">{conflicts.length}</Badge>}
		>
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub, marginBottom: 12 }}>
				{t('settings.sync.conflictsBody')}
			</div>
			<ul
				aria-label={t('settings.sync.conflictsTitle')}
				style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: 0, padding: 0 }}
			>
				{conflicts.map((entry) => (
					<li
						key={entry.conflictId}
						data-testid="sync-conflict"
						style={{
							listStyle: 'none',
							border: `1px solid ${T.bd}`,
							borderRadius: 8,
							padding: 12,
							display: 'flex',
							flexDirection: 'column',
							gap: 8,
						}}
					>
						<div style={{ font: `600 13px ${T.sans}` }}>
							{entry.path
								? t('settings.sync.conflictEntity', {
										entity: humanizeEntity(entry.entityType),
										path: entry.path,
									})
								: t('settings.sync.conflictWhole', {
										entity: humanizeEntity(entry.entityType),
									})}
						</div>
						<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
							{t('settings.sync.conflictFound', {
								when: formatDate(new Date(entry.detectedAt), { dateStyle: 'medium' }),
							})}
						</div>
						<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
							<ConflictSide label={t('settings.sync.conflictSideThis')} value={entry.local.value} />
							<ConflictSide
								label={t('settings.sync.conflictSideOther')}
								value={entry.remote.value}
							/>
						</div>
						<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
							<Button
								variant="secondary"
								size="sm"
								icon="check"
								disabled={busyId !== null}
								onClick={() => void choose(entry, 'local')}
							>
								{t('settings.sync.keepThisDevice')}
							</Button>
							<Button
								variant="secondary"
								size="sm"
								icon="check"
								disabled={busyId !== null}
								onClick={() => void choose(entry, 'remote')}
							>
								{t('settings.sync.keepOtherDevice')}
							</Button>
						</div>
					</li>
				))}
			</ul>
		</Panel>
	);
}

/** One side of a sync conflict: whose version it is and a bounded preview of what it holds. */
function ConflictSide({ label, value }: { label: string; value: unknown }) {
	// An operation's value is any entity's payload, so there is no typed renderer for it. Show a
	// bounded serialization rather than nothing: the DM needs to see WHAT differs to choose.
	const preview = (() => {
		try {
			const text = JSON.stringify(value ?? null);
			return text.length > 160 ? `${text.slice(0, 160)}…` : text;
		} catch {
			return '';
		}
	})();
	return (
		<div style={{ flex: '1 1 200px', minWidth: 180 }}>
			<div style={{ font: `600 12px ${T.sans}`, color: T.sub }}>{label}</div>
			<div style={{ font: `12px/1.5 ${T.mono}`, color: T.ter, wordBreak: 'break-word' }}>
				{preview}
			</div>
		</div>
	);
}
