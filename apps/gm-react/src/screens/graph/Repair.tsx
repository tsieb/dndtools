import { useMemo, useState } from 'react';
import {
	authorizeLinkRepairForActor,
	getContentItemsForActor,
	parseMarkdownNote,
	previewBulkLinkRepairForActor,
	serializeMarkdownNote,
	type BulkRepairPreviewRow,
} from '@dndtools/core';
import { Badge, Button, Icon, Toaster } from '../../ds';
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
	'local-markdown': 'this vault',
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
				gap: 8,
				padding: '12px 14px',
				border: `1px solid ${T.bd}`,
				borderRadius: 10,
				background: T.surf,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<Icon name="knowledge-book" size={14} color={T.ter} />
				<span
					style={{
						font: `600 13px ${T.sans}`,
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
			<div style={{ font: `12px ${T.sans}`, color: T.sub }}>
				{t('graph.repair.broken', { target: row.brokenTarget })}
			</div>
			{row.blocked === 'unsupported-source' && (
				<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
					{t('graph.repair.unsupportedSource', {
						source: SOURCE_LABEL[row.source] ?? row.source,
					})}
				</div>
			)}
			{row.blocked === 'no-candidate' && (
				<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
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
				<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
					<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
						{t('graph.repair.ambiguous')}
					</div>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
	const [busyKey, setBusyKey] = useState<string | null>(null);

	// Recomputed on every state change — a row for a link someone already fixed (here or elsewhere)
	// simply stops appearing; there is no local "already handled" list to fall out of sync.
	const preview = useMemo(
		() => previewBulkLinkRepairForActor(runtime.state.content, runtime.state.permissions, actorId),
		[runtime.state, actorId],
	);

	const fix = async (row: BulkRepairPreviewRow, fixTitle: string) => {
		const key = rowKey(row);
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
				Toaster.error(t('graph.repair.fixFailed', { title: row.itemTitle }));
				return;
			}
			const view = getContentItemsForActor(
				runtime.state.content,
				runtime.state.permissions,
				actorId,
			).find((v) => v.id === row.itemId);
			if (!view) {
				Toaster.error(t('graph.repair.fixFailed', { title: row.itemTitle }));
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
				Toaster.error(
					result.rejection.message ?? t('graph.repair.fixFailed', { title: row.itemTitle }),
				);
				return;
			}
			Toaster.success(t('graph.repair.fixed', { title: row.itemTitle }));
		} finally {
			setBusyKey(null);
		}
	};

	return (
		<Page max={860}>
			<BackBar to="/graph" label={t('graph.repair.back')} />
			<Panel
				title={t('graph.repair.title')}
				action={
					<Badge status={preview.rows.length === 0 ? 'success' : 'warning'}>
						{preview.rows.length}
					</Badge>
				}
			>
				<div style={{ font: `12px ${T.sans}`, color: T.sub, marginBottom: 12 }}>
					{t('graph.repair.intro')}
				</div>
				{preview.rows.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{t('graph.repair.empty')}</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						{preview.rows.map((row) => (
							<RepairRow
								key={rowKey(row)}
								row={row}
								busy={busyKey === rowKey(row)}
								onFix={(fixTitle) => fix(row, fixTitle)}
							/>
						))}
					</div>
				)}
			</Panel>
		</Page>
	);
}
