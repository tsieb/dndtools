import { useMemo, useState } from 'react';
import {
	previewSystemSwitch,
	type CommandResult,
	type SystemSwitchPreviewResult,
} from '@dndtools/core';
import { Badge, Button, Checkbox, Dialog, Icon, Toaster } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n, type MessageKey } from '../../i18n';

/* ---- Widget-package switch (REAL — the `previewSystemSwitch` dry-run gating the
 * `widget.package.switch-system` command). Pure move out of `System.tsx` (RC-SYS-3.1): that file is
 * now the SYSTEM PACKAGE picker, and which widget package supplies the scene's widget types is a
 * separate, secondary choice that keeps its own screen half. No behaviour change. */
const SWITCH_UNAVAILABLE_COPY: Record<string, MessageKey> = {
	'package-not-found': 'extensions.system.reason.notFound',
	'package-removed': 'extensions.system.reason.removed',
	'package-disabled': 'extensions.system.reason.disabled',
	'already-active': 'extensions.system.reason.alreadyActive',
};
const FINDING_TONE: Record<string, 'success' | 'warning' | 'error'> = {
	keep: 'success',
	remap: 'warning',
	drop: 'error',
};
const FINDING_LABEL: Record<string, MessageKey> = {
	keep: 'extensions.system.finding.keep',
	remap: 'extensions.system.finding.remap',
	drop: 'extensions.system.finding.drop',
};

function SystemSwitchDialog({
	targetId,
	targetName,
	preview,
	busy,
	canWrite,
	onApply,
	onClose,
}: {
	targetId: string;
	targetName: string;
	preview: SystemSwitchPreviewResult;
	busy: boolean;
	canWrite: boolean;
	onApply: (acknowledgeLoss: boolean) => void;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const [ack, setAck] = useState(false);
	const available = preview.kind === 'available';
	const blocked = available && !preview.vault.canMigrate;
	const destructive = available && preview.destructive;
	const canApply = available && !blocked && (!destructive || ack) && canWrite && !busy;
	return (
		<Dialog
			open
			onClose={onClose}
			title={t('extensions.system.switchTo', { name: targetName })}
			description={t('extensions.system.switchPreview', { id: targetId })}
			tone={destructive ? 'danger' : undefined}
			size="md"
			footer={
				<>
					<Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
						{t('common.action.cancel')}
					</Button>
					<Button
						variant={destructive ? 'danger' : 'primary'}
						size="sm"
						icon="check"
						disabled={!canApply}
						onClick={() => onApply(destructive && ack)}
					>
						{busy ? t('extensions.system.switching') : t('extensions.system.applySwitch')}
					</Button>
				</>
			}
		>
			{!available && (
				// The verdict of an async preview, and the one sentence that says the vault was NOT
				// touched — it has to be announced, not just painted (WCAG 4.1.3).
				<div role="status" style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{t('extensions.system.unavailable', {
						reason: t(SWITCH_UNAVAILABLE_COPY[preview.reason] ?? 'extensions.system.reason.other'),
					})}
				</div>
			)}
			{available && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							font: `12.5px ${T.sans}`,
							color: T.sub,
						}}
					>
						<Icon name={blocked ? 'error' : 'success'} size={16} color={blocked ? T.err : T.ok} />
						{blocked ? t('extensions.system.blocked') : t('extensions.system.safetyPassed')}
					</div>
					{blocked && (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
							{preview.vault.blockingIssues.map((issue, i) => (
								<div key={i} style={{ font: `12px/1.5 ${T.sans}`, color: T.err }}>
									{issue.documentId}: {issue.reason}
								</div>
							))}
						</div>
					)}
					{preview.findings.length === 0 ? (
						<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
							{t('extensions.system.noChanges')}
						</div>
					) : (
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								border: `1px solid ${T.bd}`,
								borderRadius: 10,
								overflow: 'hidden',
							}}
						>
							{preview.findings.map((f, i) => (
								<div
									key={f.widgetType}
									style={{
										display: 'flex',
										alignItems: 'center',
										// The type name, badge and instance count are all fixed-width, so inside
										// Dialog's `overflowX: hidden` port the flex:1 note — the ONLY text saying
										// WHY a widget type is being Dropped — collapsed to nothing and was clipped
										// out of a destructive confirmation. Let it drop to its own full-width line.
										flexWrap: 'wrap',
										gap: 12,
										padding: '10px 14px',
										borderTop: i ? `1px solid ${T.bd}` : 'none',
										background: i % 2 ? T.alt : 'transparent',
									}}
								>
									<span style={{ font: `600 12.5px ${T.mono}`, width: 140, flex: '0 0 auto' }}>
										{f.widgetType}
									</span>
									<Badge status={FINDING_TONE[f.effect] ?? 'neutral'}>
										{FINDING_LABEL[f.effect] ? t(FINDING_LABEL[f.effect]) : f.effect}
									</Badge>
									<span
										style={{ font: `11.5px ${T.mono}`, color: T.ter, width: 60, flex: '0 0 auto' }}
									>
										×{f.instanceCount}
									</span>
									<span
										style={{
											flex: '1 1 200px',
											minWidth: 0,
											font: `12px/1.4 ${T.sans}`,
											color: T.sub,
										}}
									>
										{f.note}
									</span>
								</div>
							))}
						</div>
					)}
					{destructive && !blocked && (
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 10,
								padding: '10px 12px',
								borderRadius: 9,
								border: `1px solid ${T.accBd}`,
								background: T.accSub,
							}}
						>
							<div style={{ flex: 1, font: `12px/1.5 ${T.sans}`, color: T.sub }}>
								{t('extensions.system.destructiveBody')}
							</div>
							<Checkbox
								checked={ack}
								onChange={(v: boolean) => setAck(v)}
								label={t('extensions.system.understand')}
							/>
						</div>
					)}
					{preview.clean && (
						<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ok }}>
							{t('extensions.system.clean')}
						</div>
					)}
				</div>
			)}
		</Dialog>
	);
}

export function ExtSystemWidgetPackage() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const previewing = !!runtime.preview;
	const isDm = runtime.state.permissions.actors[dmId]?.role === 'dm';
	const canWrite = isDm && !previewing;
	const widgets = runtime.state.widgets;
	const packages = useMemo(
		() => Object.values(widgets.packages).filter((rec) => !rec.removedAt),
		[widgets],
	);
	// RC-SYS-1.1: the active system moved to the `systems` document; the widget-package id the DM
	// selected is carried there as `activeWidgetPackageId`.
	const activeId = runtime.state.systems.activeWidgetPackageId;
	const [targetId, setTargetId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	// The PURE dry-run behind the command — recomputed live from the same state the command validates.
	const preview = targetId
		? previewSystemSwitch(widgets, runtime.state.scenes, targetId, activeId)
		: null;
	const targetName = targetId ? (widgets.packages[targetId]?.package.displayName ?? targetId) : '';

	const apply = (acknowledgeLoss: boolean) => {
		if (!targetId || busy) return;
		setBusy(true);
		void runtime
			.dispatch({
				type: 'widget.package.switch-system',
				actorId: dmId,
				payload: { packageId: targetId, acknowledgeLoss },
			})
			.then((res: CommandResult) => {
				if (res.status === 'accepted') {
					Toaster.success(t('extensions.system.switched', { name: targetName }));
					setTargetId(null);
				} else {
					Toaster.error(res.rejection.message);
				}
			})
			.catch((error: unknown) =>
				Toaster.error(error instanceof Error ? error.message : String(error)),
			)
			.finally(() => setBusy(false));
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title={t('extensions.system.title')} accent>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{t('extensions.system.intro')}
					{activeId === null && ` ${t('extensions.system.noActive')}`}
				</div>
				{!canWrite && (
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{t('extensions.system.readOnly')}
					</div>
				)}
			</Panel>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))',
					gap: 14,
				}}
			>
				{packages.map((rec) => {
					const def = rec.package;
					const active = def.id === activeId;
					return (
						<div
							key={def.id}
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 10,
								padding: 16,
								borderRadius: 12,
								border: `1px solid ${active ? T.accBd : T.bd}`,
								background: T.surf,
								boxShadow: active ? T.smd : 'none',
							}}
						>
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									gap: 8,
								}}
							>
								<span style={{ font: `700 15px ${T.disp}`, color: active ? T.acc : T.ink }}>
									{def.displayName}
								</span>
								{active ? (
									<Badge status="accent" icon="check">
										{t('extensions.system.active')}
									</Badge>
								) : rec.enabled ? (
									<Badge status="neutral">v{def.version}</Badge>
								) : (
									<Badge status="warning">{t('extensions.system.disabled')}</Badge>
								)}
							</div>
							<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{def.id}</div>
							<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub, flex: 1 }}>
								{t('extensions.system.declares', { count: def.widgets.length })}
							</div>
							{active ? (
								<Button variant="secondary" size="sm" disabled>
									{t('extensions.system.current')}
								</Button>
							) : (
								<Button
									variant="primary"
									size="sm"
									icon="retry"
									disabled={busy}
									onClick={() => setTargetId(def.id)}
								>
									{t('extensions.system.previewSwitch')}
								</Button>
							)}
						</div>
					);
				})}
			</div>
			<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
				{t('extensions.system.notListed')}
			</div>
			{targetId && preview && (
				<SystemSwitchDialog
					targetId={targetId}
					targetName={targetName}
					preview={preview}
					busy={busy}
					canWrite={canWrite}
					onApply={apply}
					onClose={() => setTargetId(null)}
				/>
			)}
		</div>
	);
}
