import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	activeSystemPackage,
	isBuiltInSystemPackageId,
	previewSystemPackageSelect,
	type CommandResult,
	type SystemPackage,
	type SystemPackageSelectFinding,
	type SystemPackageSelectPreviewResult,
} from '@dndtools/core';
import {
	CATEGORY_LABEL,
	FINDING_GROUP_LABEL,
	FINDING_GROUP_ORDER,
	FINDING_TONE,
	chipsFor,
	declaresFor,
	sigilFor,
	tierFor,
} from './systemVocab';
import { Badge, Button, Dialog, Field, Icon, Input, SystemPackageCard, Toaster } from '../../ds';
import { Panel, T, eb } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';
import { ExtSystemWidgetPackage } from './SystemWidgetSwitch';

/* ---- System package picker (RC-SYS-3.1 — the front door).
 *
 * REAL: the gallery lists the packages actually installed in the `systems` slice (the built-ins the
 * build seeds plus every `custom:` package the DM has forked), each card showing what that package
 * DECLARES — attributes, resources, conditions, dice — read off the package itself, never a
 * hard-coded table. Choosing one opens the pure `previewSystemPackageSelect` dry-run and applies
 * through the real `system.select` command, which fails closed when the switch would strand
 * character data unless the DM acknowledges it. "Build your own" dispatches the real `system.fork`:
 * a named copy in the `custom:` namespace, which is the only sanctioned way to base a homebrew on a
 * built-in. Editing that copy field-by-field is the system builder (RC-SYS-3.3); until it lands the
 * entry does the part it can actually do rather than opening a dead form.
 */

/* ---- the dry-run dialog ---------------------------------------------------------------------- */

function SystemSelectDialog({
	targetName,
	preview,
	busy,
	canWrite,
	onApply,
	onClose,
}: {
	targetName: string;
	preview: SystemPackageSelectPreviewResult;
	busy: boolean;
	canWrite: boolean;
	onApply: (acknowledgeLoss: boolean) => void;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const [phrase, setPhrase] = useState('');
	const available = preview.kind === 'available';
	const destructive = available && preview.destructive;
	// RC-SYS-3.2 — a checkbox is a single click; the drop count on some switches runs into the
	// dozens, so the acknowledgment is TYPED: the DM has to read and reproduce the word the dry-run
	// itself is using ("drop"), the same self-documenting pattern account deletion already uses
	// (`settings/Account.tsx`'s `deletePhrase`).
	const dropPhrase = t('extensions.system.select.dropPhrase').trim().toLowerCase();
	const ack = phrase.trim().toLowerCase() === dropPhrase;
	const canApply = available && (!destructive || ack) && canWrite && !busy;
	const allFindings: SystemPackageSelectFinding[] =
		preview.kind === 'available' ? preview.findings : [];
	const groups = FINDING_GROUP_ORDER.map((effect) => ({
		effect,
		findings: allFindings.filter((f) => f.effect === effect),
	})).filter((group) => group.findings.length > 0);
	return (
		<Dialog
			open
			onClose={onClose}
			title={t('extensions.system.select.title', { name: targetName })}
			description={t('extensions.system.select.description', { name: targetName })}
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
						{busy ? t('extensions.system.select.applying') : t('extensions.system.select.apply')}
					</Button>
				</>
			}
		>
			{!available && (
				// The verdict of the dry-run, announced rather than only painted (WCAG 4.1.3).
				<div role="status" style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{t(
						preview.reason === 'already-active'
							? 'extensions.system.reason.alreadyActive'
							: 'extensions.system.reason.notFound',
					)}{' '}
					{t('extensions.system.select.nothingChanged')}
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
						<Icon
							name={destructive ? 'warning' : 'success'}
							size={16}
							color={destructive ? T.warn : T.ok}
						/>
						{destructive
							? t('extensions.system.select.destructive', {
									count: preview.droppedInstanceCount,
								})
							: t('extensions.system.select.safe')}
					</div>
					{allFindings.length === 0 ? (
						<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
							{t('extensions.system.select.noFindings')}
						</div>
					) : (
						// RC-SYS-3.2 — grouped as maps directly / carries over / drops (FINDING_GROUP_ORDER),
						// each with its own instance counts, rather than one flat list a DM has to scan for
						// the word "Dropped".
						<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
							{groups.map((group) => (
								<div key={group.effect}>
									<div
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 8,
											marginBottom: 4,
											font: `600 11px ${T.sans}`,
											color: T.ter,
											textTransform: 'uppercase',
											letterSpacing: '0.04em',
										}}
									>
										{t(FINDING_GROUP_LABEL[group.effect])}
										<Badge status={FINDING_TONE[group.effect] ?? 'neutral'}>
											{group.findings.length}
										</Badge>
									</div>
									<div
										style={{
											display: 'flex',
											flexDirection: 'column',
											border: `1px solid ${T.bd}`,
											borderRadius: 10,
											overflow: 'hidden',
											maxHeight: 220,
											overflowY: 'auto',
										}}
									>
										{group.findings.map((f, i) => (
											<div
												key={`${f.category}.${f.key}`}
												style={{
													display: 'flex',
													alignItems: 'center',
													flexWrap: 'wrap',
													gap: 10,
													padding: '9px 14px',
													borderTop: i ? `1px solid ${T.bd}` : 'none',
													background: i % 2 ? T.alt : 'transparent',
												}}
											>
												<span style={{ ...eb, width: 78, flex: '0 0 auto' }}>
													{t(CATEGORY_LABEL[f.category] ?? 'extensions.system.category.attribute')}
												</span>
												<span style={{ font: `600 12.5px ${T.sans}`, flex: '0 0 auto' }}>
													{f.label}
												</span>
												<span
													style={{
														font: `11.5px ${T.mono}`,
														color: T.ter,
														width: 44,
														flex: '0 0 auto',
													}}
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
								</div>
							))}
						</div>
					)}
					{destructive && (
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 10,
								padding: '10px 12px',
								borderRadius: 9,
								border: `1px solid ${T.accBd}`,
								background: T.accSub,
							}}
						>
							<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
								{t('extensions.system.select.destructiveBody')}
							</div>
							<Button
								variant="ghost"
								size="sm"
								icon="download"
								style={{ alignSelf: 'flex-start' }}
								onClick={() => navigate('/settings?tab=sync')}
							>
								{t('extensions.system.select.backupLink')}
							</Button>
							<Field label={t('extensions.system.select.dropPhraseLabel', { phrase: dropPhrase })}>
								<Input
									id="system-select-drop-confirmation"
									value={phrase}
									onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhrase(e.target.value)}
									placeholder={dropPhrase}
									autoComplete="off"
									disabled={busy}
								/>
							</Field>
						</div>
					)}
					{preview.clean && (
						<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ok }}>
							{t('extensions.system.select.clean')}
						</div>
					)}
				</div>
			)}
		</Dialog>
	);
}

/* ---- fork ("build your own") ------------------------------------------------------------------ */

function SystemForkDialog({
	source,
	busy,
	canWrite,
	onFork,
	onClose,
}: {
	source: SystemPackage;
	busy: boolean;
	canWrite: boolean;
	onFork: (displayName: string) => void;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const [name, setName] = useState(
		t('extensions.system.fork.defaultName', { name: source.displayName }),
	);
	const trimmed = name.trim();
	return (
		<Dialog
			open
			onClose={onClose}
			title={t('extensions.system.fork.title')}
			description={t('extensions.system.fork.description', { name: source.displayName })}
			size="sm"
			footer={
				<>
					<Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
						{t('common.action.cancel')}
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon="add"
						disabled={!canWrite || busy || trimmed.length === 0}
						onClick={() => onFork(trimmed)}
					>
						{t('extensions.system.fork.create')}
					</Button>
				</>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
				<Field label={t('extensions.system.fork.nameLabel')}>
					<Input
						value={name}
						maxLength={120}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
					/>
				</Field>
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
					{t('extensions.system.fork.note')}
				</div>
			</div>
		</Dialog>
	);
}

/* ---- the screen -------------------------------------------------------------------------------- */

export function ExtSystem() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const viewport = useViewport();
	const dmId = runtime.defaultActorId;
	const previewing = !!runtime.preview;
	const isDm = runtime.state.permissions.actors[dmId]?.role === 'dm';
	const canWrite = isDm && !previewing;
	const systems = runtime.state.systems;
	const packages = useMemo(
		() =>
			Object.values(systems.packages).sort((a, b) => {
				const builtIn =
					Number(isBuiltInSystemPackageId(b.id)) - Number(isBuiltInSystemPackageId(a.id));
				return builtIn !== 0 ? builtIn : a.displayName.localeCompare(b.displayName);
			}),
		[systems],
	);
	const active = activeSystemPackage(systems);
	// `null` is the gallery; an id is the detail view for that package.
	const [detailId, setDetailId] = useState<string | null>(null);
	const [targetId, setTargetId] = useState<string | null>(null);
	const [forkSourceId, setForkSourceId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const detail = detailId ? (systems.packages[detailId] ?? null) : null;
	const forkSource = forkSourceId ? (systems.packages[forkSourceId] ?? null) : null;
	// The PURE dry-run behind the command — recomputed from the same state the command validates.
	const preview = targetId
		? previewSystemPackageSelect(systems, runtime.state.characters, targetId)
		: null;
	const targetName = targetId ? (systems.packages[targetId]?.displayName ?? targetId) : '';

	const select = (acknowledgeLoss: boolean) => {
		if (!targetId || busy) return;
		setBusy(true);
		void runtime
			.dispatch({
				type: 'system.select',
				actorId: dmId,
				payload: { packageId: targetId, acknowledgeLoss },
			})
			.then((res: CommandResult) => {
				if (res.status === 'accepted') {
					Toaster.success(t('extensions.system.select.done', { name: targetName }));
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

	const fork = (displayName: string) => {
		if (!forkSourceId || busy) return;
		setBusy(true);
		void runtime
			.dispatch({
				type: 'system.fork',
				actorId: dmId,
				payload: { sourcePackageId: forkSourceId, displayName },
			})
			.then((res: CommandResult) => {
				if (res.status === 'accepted') {
					Toaster.success(t('extensions.system.fork.done', { name: displayName }));
					setForkSourceId(null);
				} else {
					Toaster.error(res.rejection.message);
				}
			})
			.catch((error: unknown) =>
				Toaster.error(error instanceof Error ? error.message : String(error)),
			)
			.finally(() => setBusy(false));
	};

	const card = (pkg: SystemPackage, compact: boolean) => (
		<SystemPackageCard
			key={pkg.id}
			name={pkg.displayName}
			tier={tierFor(pkg, t)}
			summary={pkg.summary}
			chips={chipsFor(pkg, t)}
			icon={sigilFor(pkg)}
			active={pkg.id === active.id}
			activeLabel={t('extensions.system.active')}
			current={pkg.id === detailId}
			compact={compact}
			onSelect={() => setDetailId(pkg.id)}
		/>
	);

	/** The "build your own" entry, in both the gallery grid and the detail rail. */
	const buildYourOwn = (compact: boolean) => (
		<button
			type="button"
			onClick={() => setForkSourceId(detail?.id ?? active.id)}
			disabled={!canWrite}
			style={{
				textAlign: 'left',
				font: 'inherit',
				color: T.ink,
				cursor: canWrite ? 'pointer' : 'not-allowed',
				background: 'transparent',
				border: `1px dashed ${T.bdS}`,
				borderRadius: 12,
				padding: compact ? 12 : 16,
				display: 'flex',
				flexDirection: compact ? 'row' : 'column',
				alignItems: compact ? 'center' : 'flex-start',
				gap: 10,
				opacity: canWrite ? 1 : 0.6,
			}}
		>
			<span
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: compact ? 32 : 38,
					height: compact ? 32 : 38,
					borderRadius: 8,
					border: `1px dashed ${T.bdS}`,
					color: T.acc,
					flex: '0 0 auto',
				}}
			>
				<Icon name="add" size={compact ? 'micro' : 'sm'} aria-hidden="true" />
			</span>
			<span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
				<span style={{ font: `700 ${compact ? 13 : 17}px ${T.disp}` }}>
					{t('extensions.system.build.title')}
				</span>
				{!compact && (
					<span style={{ font: `12.5px/1.5 ${T.sans}`, color: T.sub }}>
						{t('extensions.system.build.body')}
					</span>
				)}
			</span>
		</button>
	);

	const detailPanel = detail && (
		<section
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 18,
				padding: 20,
				borderRadius: 12,
				border: `1px solid ${T.bd}`,
				background: T.surf,
				boxShadow: T.ssm,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
				<div style={{ flex: 1, minWidth: 0 }}>
					<h2 style={{ margin: 0, font: `700 21px ${T.disp}`, color: T.ink }}>
						{detail.displayName}
					</h2>
					<div style={{ ...eb, marginTop: 4 }}>
						{tierFor(detail, t)} · v{detail.version}
					</div>
				</div>
				{detail.id === active.id && (
					<Badge status="accent" icon="check">
						{t('extensions.system.activeSystem')}
					</Badge>
				)}
			</div>
			<p style={{ margin: 0, font: `13px/1.6 ${T.sans}`, color: T.sub }}>{detail.summary}</p>
			<div>
				<div style={{ ...eb, marginBottom: 10 }}>{t('extensions.system.declaresHeading')}</div>
				<dl
					style={{
						margin: 0,
						display: 'grid',
						gridTemplateColumns: viewport === 'phone' ? '1fr' : 'repeat(2,minmax(0,1fr))',
						gap: 1,
						background: T.bd,
						border: `1px solid ${T.bd}`,
						borderRadius: 10,
						overflow: 'hidden',
					}}
				>
					{declaresFor(detail, t).map((row) => (
						<div
							key={row.term}
							style={{
								background: T.surf,
								padding: '12px 14px',
								display: 'flex',
								alignItems: 'flex-start',
								gap: 10,
							}}
						>
							<Icon name={row.icon} size={16} color={T.acc} aria-hidden="true" />
							<div style={{ minWidth: 0 }}>
								<dt style={eb}>{row.term}</dt>
								<dd style={{ margin: '3px 0 0', font: `12.5px/1.45 ${T.sans}`, color: T.ink }}>
									{row.value}
								</dd>
							</div>
						</div>
					))}
				</dl>
			</div>
			{detail.id !== active.id && (
				<div
					style={{
						display: 'flex',
						alignItems: 'flex-start',
						gap: 10,
						padding: '11px 13px',
						borderRadius: 9,
						border: `1px solid ${T.accBd}`,
						background: T.accSub,
						font: `12.5px/1.5 ${T.sans}`,
						color: T.sub,
					}}
				>
					<Icon name="info" size={16} color={T.acc} aria-hidden="true" />
					<span>{t('extensions.system.dryRunNote', { name: active.displayName })}</span>
				</div>
			)}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					flexWrap: 'wrap',
					borderTop: `1px solid ${T.bd}`,
					paddingTop: 14,
				}}
			>
				{detail.id === active.id ? (
					<span style={{ font: `12.5px ${T.sans}`, color: T.sub, flex: 1 }}>
						{t('extensions.system.runningNow')}
					</span>
				) : (
					<Button
						variant="primary"
						size="sm"
						icon="retry"
						disabled={!canWrite || busy}
						onClick={() => setTargetId(detail.id)}
					>
						{t('extensions.system.previewSelect')}
					</Button>
				)}
				<Button
					variant="ghost"
					size="sm"
					icon="edit"
					disabled={!canWrite || busy}
					onClick={() => setForkSourceId(detail.id)}
				>
					{t('extensions.system.forkAction')}
				</Button>
			</div>
		</section>
	);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title={t('extensions.system.pickerTitle')} accent>
				<div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
					<div style={{ flex: '1 1 320px', font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						{t('extensions.system.pickerIntro')}
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
						<span style={eb}>{t('extensions.system.activePackage')}</span>
						<span style={{ font: `700 15px ${T.disp}`, color: T.ink }}>{active.displayName}</span>
					</div>
				</div>
				{!canWrite && (
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{t('extensions.system.readOnly')}
					</div>
				)}
			</Panel>

			{detail ? (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					<div>
						<Button
							variant="secondary"
							size="sm"
							icon="chevron-left"
							onClick={() => setDetailId(null)}
						>
							{t('extensions.system.allSystems')}
						</Button>
					</div>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: viewport === 'desktop' ? '272px minmax(0,1fr)' : '1fr',
							gap: 16,
							alignItems: 'start',
						}}
					>
						{viewport === 'desktop' && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
								{packages.map((pkg) => card(pkg, true))}
								{buildYourOwn(true)}
							</div>
						)}
						{detailPanel}
					</div>
				</div>
			) : (
				<>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fill,minmax(288px,1fr))',
							gap: 14,
						}}
					>
						{packages.map((pkg) => card(pkg, false))}
						{buildYourOwn(false)}
					</div>
					<ExtSystemWidgetPackage />
				</>
			)}

			{targetId && preview && (
				<SystemSelectDialog
					targetName={targetName}
					preview={preview}
					busy={busy}
					canWrite={canWrite}
					onApply={select}
					onClose={() => setTargetId(null)}
				/>
			)}
			{forkSource && (
				<SystemForkDialog
					source={forkSource}
					busy={busy}
					canWrite={canWrite}
					onFork={fork}
					onClose={() => setForkSourceId(null)}
				/>
			)}
		</div>
	);
}
