import { useMemo, useState } from 'react';
import type { McpAgentBinding, McpAuditEntry } from '@dndtools/core';
import { Badge, Button, Select, Toaster } from '../../ds';
import { Panel, Seg, T } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import { downloadJsonFile, fileDateStamp } from '../../platform/download';
import { errMsg } from './shared';

/* ---- RC-AI-2.3 — AUDIT BROWSER + EXPORT ------------------------------------------------------------
 * `McpAuditEntry` (MCP-011 AC2) is already an append-only, decision-only record of every write attempt
 * — no mutated content, just who/what/how. Before this the panel showed only the last five; a DM
 * auditing a session-long run had no way to see the rest or take a copy off-device. This component adds
 * the browse (filter by outcome + agent, oldest-first history at full length) and the export (the
 * FULL trail, independent of the filters in view, so a saved audit is never a filtered slice mistaken
 * for the whole record) via the same `exportFile`-backed download every other export uses. Read-only:
 * nothing here dispatches. */

const AUDIT_MODE_LABEL: Record<McpAuditEntry['mode'], MessageKey> = {
	staged: 'settings.ai.auditMode.staged',
	direct: 'settings.ai.auditMode.direct',
	denied: 'settings.ai.auditMode.denied',
};

const AUDIT_MODE_BADGE: Record<McpAuditEntry['mode'], 'error' | 'warning' | 'info'> = {
	denied: 'error',
	staged: 'warning',
	direct: 'info',
};

type AuditModeFilter = 'all' | McpAuditEntry['mode'];

export function AiAuditBrowser({
	entries,
	bindings,
	actorName,
}: {
	entries: McpAuditEntry[];
	bindings: McpAgentBinding[];
	actorName: (id: string) => string;
}) {
	const { t, formatDate } = useI18n();
	const [mode, setMode] = useState<AuditModeFilter>('all');
	const [agentId, setAgentId] = useState<string>('all');
	const [exporting, setExporting] = useState(false);

	const agentLabel = (id: string): string => bindings.find((b) => b.agentId === id)?.label || id;
	const agentIdsInEntries = useMemo(
		() => Array.from(new Set(entries.map((e) => e.agentId))).sort(),
		[entries],
	);

	const newestFirst = useMemo(() => [...entries].reverse(), [entries]);
	const filtered = newestFirst.filter(
		(e) => (mode === 'all' || e.mode === mode) && (agentId === 'all' || e.agentId === agentId),
	);

	const exportAudit = async () => {
		setExporting(true);
		try {
			const bundle = {
				exportedAt: new Date().toISOString(),
				entryCount: entries.length,
				entries: entries.map((e) => ({
					...e,
					actorName: actorName(e.actorId),
				})),
			};
			const result = await downloadJsonFile(
				`dndtools-ai-audit-${fileDateStamp()}.json`,
				bundle,
				t('settings.ai.auditExport'),
			);
			if (result.status === 'exported') Toaster.success(t('settings.ai.auditExported'));
		} catch (e: unknown) {
			Toaster.error(errMsg(e, t('settings.ai.auditExportFailed')));
		} finally {
			setExporting(false);
		}
	};

	return (
		<Panel
			title={t('settings.ai.auditTitle')}
			action={<Badge status="neutral">{entries.length}</Badge>}
		>
			<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, marginBottom: 8 }}>
				{t('settings.ai.auditIntro')}
			</div>
			{entries.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{t('settings.ai.auditEmpty')}</div>
			) : (
				<>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							flexWrap: 'wrap',
							marginBottom: 10,
						}}
					>
						<Seg
							value={mode}
							ariaLabel={t('settings.ai.auditFilterMode')}
							onChange={(v) => setMode(v as AuditModeFilter)}
							options={[
								{ value: 'all', label: t('settings.ai.auditFilterAll') },
								{ value: 'staged', label: t('settings.ai.auditMode.staged') },
								{ value: 'direct', label: t('settings.ai.auditMode.direct') },
								{ value: 'denied', label: t('settings.ai.auditMode.denied') },
							]}
						/>
						<span style={{ flex: '0 0 170px' }}>
							<Select
								aria-label={t('settings.ai.auditFilterAgent')}
								value={agentId}
								onChange={(e: { target: { value: string } }) => setAgentId(e.target.value)}
								options={[
									{ value: 'all', label: t('settings.ai.auditFilterAgentAll') },
									...agentIdsInEntries.map((id) => ({ value: id, label: agentLabel(id) })),
								]}
							/>
						</span>
						<div style={{ flex: 1 }} />
						<Button
							variant="secondary"
							size="sm"
							icon="download"
							disabled={exporting}
							onClick={() => void exportAudit()}
						>
							{t('settings.ai.auditExport')}
						</Button>
					</div>
					{filtered.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							{t('settings.ai.auditNoMatch')}
						</div>
					) : (
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								maxHeight: 360,
								overflowY: 'auto',
							}}
						>
							{filtered.map((a, i) => (
								<div
									key={a.id}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										padding: '6px 0',
										borderTop: i ? `1px solid ${T.bd}` : 'none',
										font: `12px ${T.sans}`,
										color: T.sub,
									}}
								>
									<Badge status={AUDIT_MODE_BADGE[a.mode]}>{t(AUDIT_MODE_LABEL[a.mode])}</Badge>
									<span style={{ font: `11.5px ${T.mono}`, color: T.ter }}>
										{agentLabel(a.agentId)} · {a.toolId}
									</span>
									<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
										{t('settings.ai.auditAsActor', { actor: actorName(a.actorId) })}
									</span>
									<span style={{ marginLeft: 'auto', font: `11px ${T.sans}`, color: T.ter }}>
										{formatDate(new Date(a.recordedAt), {
											dateStyle: 'medium',
											timeStyle: 'short',
										})}
									</span>
								</div>
							))}
						</div>
					)}
				</>
			)}
		</Panel>
	);
}
