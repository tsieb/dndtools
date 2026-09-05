import { useMemo, useState } from 'react';
import {
	previewSystemSwitch,
	type CommandResult,
	type SystemSwitchPreviewResult,
} from '@dndtools/core';
import { Badge, Button, Checkbox, Dialog, Icon, Toaster } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';

/* ---- System (REAL — `previewSystemSwitch` dry-run gating the `widget.package.switch-system` command) */
const SWITCH_UNAVAILABLE_COPY: Record<string, string> = {
	'package-not-found': 'That package is not installed.',
	'package-removed': 'That package has been removed — reinstall it first.',
	'package-disabled': 'That package is disabled — enable it on the Plugins tab first.',
	'already-active': 'That package is already the active system.',
};
const FINDING_TONE: Record<string, 'success' | 'warning' | 'error'> = {
	keep: 'success',
	remap: 'warning',
	drop: 'error',
};
const FINDING_LABEL: Record<string, string> = {
	keep: 'Kept',
	remap: 'Remapped',
	drop: 'Dropped',
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
	const [ack, setAck] = useState(false);
	const available = preview.kind === 'available';
	const blocked = available && !preview.vault.canMigrate;
	const destructive = available && preview.destructive;
	const canApply = available && !blocked && (!destructive || ack) && canWrite && !busy;
	return (
		<Dialog
			open
			onClose={onClose}
			title={`Switch to ${targetName}`}
			description={`Preview of switching to ${targetId} — nothing changes until you apply`}
			tone={destructive ? 'danger' : undefined}
			size="md"
			footer={
				<>
					<Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
						Cancel
					</Button>
					<Button
						variant={destructive ? 'danger' : 'primary'}
						size="sm"
						icon="check"
						disabled={!canApply}
						onClick={() => onApply(destructive && ack)}
					>
						{busy ? 'Switching…' : 'Apply switch'}
					</Button>
				</>
			}
		>
			{!available && (
				// The verdict of an async preview, and the one sentence that says the vault was NOT
				// touched — it has to be announced, not just painted (WCAG 4.1.3).
				<div role="status" style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{SWITCH_UNAVAILABLE_COPY[preview.reason] ?? 'The switch is unavailable.'} Nothing was
					changed.
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
						{blocked
							? 'This campaign cannot be migrated safely, so the switch is blocked.'
							: 'The campaign passed its migration safety check.'}
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
							No widget-vocabulary changes — the current system declares no types the target lacks.
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
										{FINDING_LABEL[f.effect] ?? f.effect}
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
								Dropped types above have live widgets on your scenes — they would be disabled
								(recoverable by switching back). The command fails closed unless you acknowledge
								this.
							</div>
							<Checkbox checked={ack} onChange={(v: boolean) => setAck(v)} label="I understand" />
						</div>
					)}
					{preview.clean && (
						<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ok }}>
							Nothing is lost — the switch applies cleanly.
						</div>
					)}
				</div>
			)}
		</Dialog>
	);
}

export function ExtSystem() {
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
					Toaster.success(`Active system switched to ${targetName}.`);
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
			<Panel title="Campaign system" accent>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					The campaign system controls which widget types are available throughout the app. Before
					switching, Lamplight checks the campaign without changing it. Unsafe switches are blocked,
					and any switch that would remove live widgets requires your explicit confirmation.
					{activeId === null &&
						' No explicit system package is set yet; the built-in scene widgets act as the default until you switch.'}
				</div>
				{!canWrite && (
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						Switching is DM-only and read-only while previewing.
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
										Active
									</Badge>
								) : rec.enabled ? (
									<Badge status="neutral">v{def.version}</Badge>
								) : (
									<Badge status="warning">disabled</Badge>
								)}
							</div>
							<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{def.id}</div>
							<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub, flex: 1 }}>
								{def.widgets.length} {def.widgets.length === 1 ? 'widget type' : 'widget types'}{' '}
								declared.
							</div>
							{active ? (
								<Button variant="secondary" size="sm" disabled>
									Current system
								</Button>
							) : (
								<Button
									variant="primary"
									size="sm"
									icon="retry"
									disabled={busy}
									onClick={() => setTargetId(def.id)}
								>
									Preview switch
								</Button>
							)}
						</div>
					);
				})}
			</div>
			<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
				Want a system that isn't listed? Install its widget package on the Plugins tab (starter
				library or package JSON) — every installed, enabled package can be previewed as the active
				system.
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
