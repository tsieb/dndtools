import { isBuiltInSystemPackageId, type SystemPackage } from '@dndtools/core';
import { declaresFor, tierFor } from './systemVocab';
import { Badge, Button, Icon } from '../../ds';
import { T, eb } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useI18n } from '../../i18n';

/* ---- the "build your own" entry, in both the gallery grid and the detail rail ------------------- */

export function BuildYourOwnCard({
	compact,
	canWrite,
	onClick,
}: {
	compact: boolean;
	canWrite: boolean;
	onClick: () => void;
}) {
	const { t } = useI18n();
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={!canWrite}
			style={{
				textAlign: 'left',
				font: 'inherit',
				color: T.ink,
				cursor: canWrite ? 'pointer' : 'not-allowed',
				background: 'transparent',
				border: `1px dashed ${T.bdS}`,
				borderRadius: 'var(--radius-lg)',
				padding: compact ? 'var(--space-3)' : 'var(--space-4)',
				display: 'flex',
				flexDirection: compact ? 'row' : 'column',
				alignItems: compact ? 'center' : 'flex-start',
				gap: 'var(--space-2)',
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
					borderRadius: 'var(--radius-md)',
					border: `1px dashed ${T.bdS}`,
					color: T.acc,
					flex: '0 0 auto',
				}}
			>
				<Icon name="add" size={compact ? 'micro' : 'sm'} aria-hidden="true" />
			</span>
			<span
				style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)', minWidth: 0 }}
			>
				<span style={{ font: `700 ${compact ? 'var(--text-sm)' : 'var(--text-md)'} ${T.sans}` }}>
					{t('extensions.system.build.title')}
				</span>
				{!compact && (
					<span style={{ font: `var(--text-sm)/1.5 ${T.sans}`, color: T.sub }}>
						{t('extensions.system.build.body')}
					</span>
				)}
			</span>
		</button>
	);
}

/* ---- one package's detail view: what it declares, and the switch / edit / fork actions ---------- */

export function SystemDetailPanel({
	detail,
	active,
	canWrite,
	busy,
	onPreviewSelect,
	onEdit,
	onFork,
}: {
	detail: SystemPackage;
	active: SystemPackage;
	canWrite: boolean;
	busy: boolean;
	onPreviewSelect: () => void;
	onEdit: () => void;
	onFork: () => void;
}) {
	const { t } = useI18n();
	const viewport = useViewport();
	return (
		<section
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-4)',
				padding: 'var(--space-5)',
				borderRadius: 'var(--radius-lg)',
				border: `1px solid ${T.bd}`,
				background: T.surf,
				boxShadow: T.smd,
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'flex-start',
					gap: 'var(--space-3)',
					flexWrap: 'wrap',
				}}
			>
				<div style={{ flex: 1, minWidth: 0 }}>
					<h2
						style={{ margin: 'var(--space-0)', font: `700 var(--text-xl) ${T.disp}`, color: T.ink }}
					>
						{detail.displayName}
					</h2>
					<div style={{ ...eb, marginTop: 'var(--space-1)' }}>
						{tierFor(detail, t)} · v{detail.version}
					</div>
				</div>
				{detail.id === active.id && (
					<Badge status="success" icon="check">
						{t('extensions.system.activeSystem')}
					</Badge>
				)}
			</div>
			<p style={{ margin: 'var(--space-0)', font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
				{detail.summary}
			</p>
			<div>
				<div style={{ ...eb, marginBottom: 'var(--space-2)' }}>
					{t('extensions.system.declaresHeading')}
				</div>
				<dl
					style={{
						margin: 'var(--space-0)',
						display: 'grid',
						gridTemplateColumns: viewport === 'phone' ? '1fr' : 'repeat(2,minmax(0,1fr))',
						// A hairline between cells: the border colour shows through a 1px gap.
						gap: 'calc(var(--space-0-5) / 2)',
						background: T.bd,
						border: `1px solid ${T.bd}`,
						borderRadius: 'var(--radius-lg)',
						overflow: 'hidden',
					}}
				>
					{declaresFor(detail, t).map((row) => (
						// A `<dl>` may only group its terms in a bare `<div>`: the icon lives inside the `<dt>`.
						<div
							key={row.term}
							style={{ background: T.surf, padding: 'var(--space-3)', minWidth: 0 }}
						>
							<dt style={{ ...eb, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
								<Icon name={row.icon} size={16} color={T.acc} aria-hidden="true" />
								{row.term}
							</dt>
							<dd
								style={{
									margin: 'var(--space-0-5) var(--space-0) var(--space-0)',
									paddingLeft: 'var(--space-6)',
									font: `var(--text-sm)/1.45 ${T.sans}`,
									color: T.ink,
								}}
							>
								{row.value}
							</dd>
						</div>
					))}
				</dl>
			</div>
			{detail.id !== active.id && (
				<div
					style={{
						display: 'flex',
						alignItems: 'flex-start',
						gap: 'var(--space-2)',
						padding: 'var(--space-3) var(--space-3)',
						borderRadius: 'var(--radius-md)',
						border: `1px solid ${T.accBd}`,
						background: T.accSub,
						font: `var(--text-sm)/1.5 ${T.sans}`,
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
					gap: 'var(--space-2)',
					flexWrap: 'wrap',
					borderTop: `1px solid ${T.bd}`,
					paddingTop: 'var(--space-3)',
				}}
			>
				{detail.id === active.id ? (
					<span style={{ font: `var(--text-sm) ${T.sans}`, color: T.sub, flex: 1 }}>
						{t('extensions.system.runningNow')}
					</span>
				) : (
					<Button
						variant="primary"
						size="sm"
						icon="retry"
						disabled={!canWrite || busy}
						onClick={onPreviewSelect}
					>
						{t('extensions.system.previewSelect')}
					</Button>
				)}
				{!isBuiltInSystemPackageId(detail.id) && (
					<Button
						variant="secondary"
						size="sm"
						icon="edit"
						disabled={!canWrite || busy}
						onClick={onEdit}
					>
						{t('extensions.system.editAction')}
					</Button>
				)}
				<Button
					variant="ghost"
					size="sm"
					icon="duplicate"
					disabled={!canWrite || busy}
					onClick={onFork}
				>
					{t('extensions.system.forkAction')}
				</Button>
			</div>
		</section>
	);
}
