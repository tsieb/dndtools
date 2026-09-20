import './graph.css';
import { useMemo, useState } from 'react';
import {
	authorizeLinkRepairForActor,
	getContentItemsForActor,
	parseMarkdownNote,
	previewBulkLinkRepairForActor,
	serializeMarkdownNote,
	type BulkRepairPreviewRow,
} from '@dndtools/core';
import { Badge, Button, EmptyState, Icon, Toaster } from '../../ds';
import { BackBar, Page, Panel, T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';

/**
 * RC-KNW-4.2 — Link repair: every broken wikilink inside the content the current actor may edit,
 * with a suggested target, fixed one click at a time.
 *
 * Every row comes straight from `previewBulkLinkRepairForActor` (GRAPH-010) — the actor-filtered,
 * capability-scoped preview — so a hidden note is never named/suggested here and a source the actor
 * cannot edit never appears (fail closed). This screen adds no authoring logic of its own: it renders
 * the computed preview and, on "Fix", re-runs `authorizeLinkRepairForActor` right before dispatching
 * (never trusting the row it already has — another edit may have changed the note since the preview
 * was read) and dispatches the rewrite through the existing `content.update-item` command, so only
 * that one link changes and the graph/search indexes update incrementally (AC3).
 *
 * The repair engine computes its rewrite over the FRONTMATTER-STRIPPED body (`parseMarkdownNote`), so
 * its result never carries the note's `aliases`/`tags` front matter block back. Before dispatching we
 * re-attach the item's own properties with `serializeMarkdownNote` — otherwise a "fixed" link would
 * silently drop the note's aliases.
 */

const SOURCE_LABEL: Record<string, string> = {
	obsidian: 'Obsidian',
	'google-docs': 'Google Docs',
};

function rowKey(row: BulkRepairPreviewRow): string {
	return `${row.itemId}:${row.brokenTarget}`;
}

function RepairRow({
	row,
	busy,
	onFix,
}: {
	row: BulkRepairPreviewRow;
	busy: boolean;
	onFix: (fixTitle: string) => void;
}) {
	const { t } = useI18n();
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-2)',
				padding: 'var(--space-3) var(--space-4)',
				border: `0.0625rem solid ${T.bd}`,
				borderRadius: 'var(--radius-lg)',
				background: T.surf,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<Icon name="knowledge-book" size={14} color={T.ter} />
				<span
					style={{
						font: `600 var(--text-base) ${T.sans}`,
						flex: 1,
						minWidth: 0,
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
					}}
				>
					{row.itemTitle}
				</span>
				{row.blocked && <Badge status="neutral">{t('graph.repair.blockedBadge')}</Badge>}
			</div>
			<div style={{ font: `var(--text-base) ${T.sans}`, color: T.sub }}>
				{t('graph.repair.broken', { target: row.brokenTarget })}
			</div>
			{row.blocked === 'unsupported-source' && (
				<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>
					{t('graph.repair.unsupportedSource', {
						source:
							row.source === 'local-markdown'
								? t('graph.thisVault')
								: (SOURCE_LABEL[row.source] ?? row.source),
					})}
				</div>
			)}
			{row.blocked === 'no-candidate' && (
				<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>
					{t('graph.repair.noCandidate')}
				</div>
			)}
			{!row.blocked && !row.ambiguous && row.proposedTitle && (
				<div>
					<Button
						variant="secondary"
						size="sm"
						icon="check"
						disabled={busy}
						onClick={() => onFix(row.proposedTitle!)}
					>
						{t('graph.repair.fixTo', { title: row.proposedTitle })}
					</Button>
				</div>
			)}
			{!row.blocked && row.ambiguous && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
					<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>
						{t('graph.repair.ambiguous')}
					</div>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1-5)' }}>
						{row.candidates.map((candidate) => (
							<Button
								key={candidate}
								variant="secondary"
								size="sm"
								disabled={busy}
								onClick={() => onFix(candidate)}
							>
								{candidate}
							</Button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

export function Repair() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const [error, setError] = useState<string | null>(null);
	const [busyKey, setBusyKey] = useState<string | null>(null);

	// Recomputed on every state change — a row for a link someone already fixed (here or elsewhere)
	// simply stops appearing; there is no local "already handled" list to fall out of sync.
	const preview = useMemo(
		() => previewBulkLinkRepairForActor(runtime.state.content, runtime.state.permissions, actorId),
		[runtime.state, actorId],
	);

	const fix = async (row: BulkRepairPreviewRow, fixTitle: string) => {
		const key = rowKey(row);
		if (runtime.readOnly || busyKey) return;
		setError(null);
		setBusyKey(key);
		try {
			const authorized = authorizeLinkRepairForActor(
				runtime.state.content,
				runtime.state.permissions,
				actorId,
				row.itemId,
				row.brokenTarget,
				fixTitle,
			);
			if (authorized.status !== 'authorized' || authorized.result.status !== 'repaired') {
				setError(t('graph.repair.fixFailed', { title: row.itemTitle }));
				return;
			}
			const view = getContentItemsForActor(
				runtime.state.content,
				runtime.state.permissions,
				actorId,
			).find((v) => v.id === row.itemId);
			if (!view) {
				setError(t('graph.repair.fixFailed', { title: row.itemTitle }));
				return;
			}
			// Reattach the note's own front matter — the engine only ever saw the stripped body.
			const { properties } = parseMarkdownNote(view.body);
			const body = serializeMarkdownNote(properties, authorized.result.body);
			const result = await runtime.dispatch({
				type: 'content.update-item',
				actorId,
				payload: { itemId: row.itemId, title: view.title, body, baseRevision: view.revision },
			});
			if (result.status !== 'accepted') {
				setError(t('graph.repair.fixFailed', { title: row.itemTitle }));
				return;
			}
			Toaster.success(t('graph.repair.fixed', { title: row.itemTitle }));
		} catch {
			setError(t('graph.repair.fixFailed', { title: row.itemTitle }));
		} finally {
			setBusyKey(null);
		}
	};

	return (
		<Page max={860}>
			<div className="graph-surface">
				<BackBar to="/graph" label={t('graph.repair.back')} />
				<Panel
					title={t('graph.repair.title')}
					action={
						<Badge status={preview.rows.length === 0 ? 'success' : 'warning'}>
							{preview.rows.length}
						</Badge>
					}
				>
					<div
						style={{
							font: `var(--text-base) ${T.sans}`,
							color: T.sub,
							marginBottom: 'var(--space-3)',
						}}
					>
						{t('graph.repair.intro')}
					</div>
					{error && (
						<div role="alert">
							<EmptyState
								inset
								icon="warning"
								title={error}
								description={t('graph.repair.retry')}
							/>
						</div>
					)}
					{busyKey && <p role="status">{t('graph.repair.saving')}</p>}
					{runtime.readOnly && <p>{t('graph.repair.readOnly')}</p>}
					{preview.rows.length === 0 ? (
						<EmptyState inset illustration="graph-empty" title={t('graph.repair.empty')} />
					) : (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
							{preview.rows.map((row) => (
								<RepairRow
									key={rowKey(row)}
									row={row}
									busy={busyKey !== null || runtime.readOnly}
									onFix={(fixTitle) => fix(row, fixTitle)}
								/>
							))}
						</div>
					)}
				</Panel>
			</div>
		</Page>
	);
}
