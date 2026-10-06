import {
	STARTER_WIDGET_LIBRARY,
	buildWidgetPackageReviewSummary,
	type WidgetPackageDefinition,
	type WidgetPackageRecord,
} from '@dndtools/core';
import { Badge, Button, Icon, Switch } from '../../ds';
import { T } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import { useFocusOnReveal } from './shared';

const HOST_PERM_LABEL: Record<string, MessageKey> = {
	filesystem: 'extensions.trust.perm.filesystem',
	clipboard: 'extensions.trust.perm.clipboard',
	network: 'extensions.trust.perm.network',
	'source-adapter': 'extensions.trust.perm.sourceAdapter',
	asset: 'extensions.trust.perm.asset',
	'external-link': 'extensions.trust.perm.externalLink',
	navigate: 'extensions.trust.perm.navigate',
};

/** Whether a package asks for anything beyond drawing itself: a permission, the network, or a
 *  write the players can see. */
export function asksForNothing(definition: WidgetPackageDefinition): boolean {
	const review = buildWidgetPackageReviewSummary(definition);
	return (
		review.requestedHostPermissions.length === 0 &&
		review.requestedNetworkDestinations.length === 0 &&
		review.playerVisibleOutputs.length === 0
	);
}

/**
 * RC-WID-6.7 — a starter that ships with this build and asks for nothing. The Starter library
 * installs one enabled, because the GM has nothing to decide: the code is Lamplight's own and every
 * permission stays denied. The installed copy must still BE that starter, so a pasted package that
 * borrows a starter's id is judged like any other. The core normalises command and field defaults on
 * install, so the comparison covers what runs (the assets, each widget's entrypoint and style) and
 * what it may reach (its permission and network requests), not the whole definition.
 */
export function isBundledWithoutPermissions(definition: WidgetPackageDefinition): boolean {
	const starter = STARTER_WIDGET_LIBRARY.find((entry) => entry.packageId === definition.id);
	if (!starter || definition.authoring?.createdBy !== 'starter-library') return false;
	const runs = (pkg: WidgetPackageDefinition) =>
		JSON.stringify([
			pkg.version,
			pkg.assets,
			pkg.widgets.map((widget) => [
				widget.type,
				widget.renderEntrypoint,
				widget.style,
				widget.hostPermissions,
				widget.networkDestinationClasses,
			]),
		]);
	return runs(definition) === runs(starter.build()) && asksForNothing(definition);
}

interface Status {
	label: MessageKey;
	tone: 'success' | 'warning' | 'error' | 'neutral';
	/** A distinct shape per state, so the badge never relies on its colour alone. */
	icon: string;
}

/**
 * RC-WID-6.7 — a card says ONE thing about its package: the state that decides what the GM does
 * next. A failed update or a block outranks everything; a review the GM still owes comes last.
 */
function packageStatus(rec: WidgetPackageRecord, isSystem: boolean): Status {
	if (rec.migrationStatus?.state === 'failed') {
		return { label: 'extensions.plugins.migrationFailed', tone: 'error', icon: 'error' };
	}
	if (rec.trust.state === 'denied') {
		return { label: 'extensions.plugins.status.blocked', tone: 'error', icon: 'error' };
	}
	if (isSystem) return { label: 'extensions.objects.builtIn', tone: 'neutral', icon: 'lock' };
	if (isBundledWithoutPermissions(rec.package)) {
		return { label: 'extensions.plugins.status.bundled', tone: 'success', icon: 'check' };
	}
	if (rec.trust.state === 'trusted') {
		return { label: 'extensions.plugins.status.allowed', tone: 'success', icon: 'check' };
	}
	return { label: 'extensions.plugins.needsReview', tone: 'warning', icon: 'warning' };
}

/** One installed widget package: its one status, what it asks for, and what the GM can do with it. */
export function PluginPackageCard({
	rec,
	canWrite,
	busy,
	confirmingRemove,
	onReview,
	onToggle,
	onExport,
	onNewVersion,
	onAskRemove,
	onRemove,
	onKeep,
}: {
	rec: WidgetPackageRecord;
	canWrite: boolean;
	busy: boolean;
	confirmingRemove: boolean;
	onReview: () => void;
	onToggle: () => void;
	onExport: () => void;
	onNewVersion: () => void;
	onAskRemove: () => void;
	onRemove: () => void;
	onKeep: () => void;
}) {
	const { t } = useI18n();
	const def = rec.package;
	const isSystem = def.id.startsWith('system.');
	const review = buildWidgetPackageReviewSummary(def);
	const status = packageStatus(rec, isSystem);
	// RC-WID-1.5 — "needs review" is the RECORDED trust state, not the analysis: once the GM has
	// reviewed a package the card stops asking them to. RC-WID-6.7 — nor does a bundled starter that
	// asks for nothing.
	const needsReview = status.label === 'extensions.plugins.needsReview';
	const asks = [
		...review.requestedHostPermissions.map((p) => (HOST_PERM_LABEL[p] ? t(HOST_PERM_LABEL[p]) : p)),
		...review.requestedNetworkDestinations.map((d: string) =>
			t('extensions.plugins.network', { destination: d }),
		),
	];
	const confirmRef = useFocusOnReveal<HTMLSpanElement>(confirmingRemove);
	return (
		<div
			data-testid={`package-card-${def.id}`}
			style={{
				display: 'flex',
				flexWrap: 'wrap',
				gap: 'var(--space-3)',
				padding: 'var(--space-3)',
				border: `1px solid ${needsReview ? T.accBd : T.bd}`,
				borderRadius: 'var(--radius-lg)',
				background: T.surf,
			}}
		>
			<span
				aria-hidden="true"
				style={{
					width: 38,
					height: 38,
					borderRadius: 'var(--radius-md)',
					background: T.accSub,
					color: T.acc,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					flex: '0 0 auto',
				}}
			>
				<Icon name="widget" size="md" />
			</span>
			<div style={{ flex: '1 1 240px', minWidth: 0 }}>
				<div
					style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}
				>
					<span style={{ font: `600 var(--text-sm) ${T.sans}` }}>{def.displayName}</span>
					<Badge status={status.tone} icon={status.icon} data-testid="package-status">
						{t(status.label)}
					</Badge>
				</div>
				<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
					{[
						t('extensions.plugins.cardMeta', { version: def.version, widgets: def.widgets.length }),
						t(
							review.customCodeWidgets.length > 0
								? 'extensions.plugins.runsCode'
								: 'extensions.plugins.usesTemplates',
						),
						def.authoring?.source === 'generated' ? t('extensions.plugins.drafted') : null,
					]
						.filter(Boolean)
						.join(' · ')}
				</div>
				{/* What it asks for, in words: the status above already carries the verdict. */}
				<div
					style={{
						font: `var(--text-xs)/1.5 ${T.sans}`,
						color: T.sub,
						marginBottom: 'var(--space-1-5)',
					}}
				>
					{asks.length === 0
						? t('extensions.plugins.asksNothing')
						: t('extensions.plugins.asks', { list: asks.join(', ') })}
				</div>
			</div>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'flex-end',
					gap: 'var(--space-2)',
					flex: '0 0 auto',
					marginLeft: 'auto',
				}}
			>
				{/* RC-WID-1.5 — every package is reviewable, including one already trusted: a review can
				    be revisited, tightened, or reversed. */}
				<Button
					variant={needsReview ? 'secondary' : 'ghost'}
					size="sm"
					icon="permissions"
					// Every card carries a "Review" button, so the visible word alone is not a
					// distinguishing accessible name — the package name goes in the label.
					aria-label={t('extensions.plugins.reviewLabel', { name: def.displayName })}
					disabled={!canWrite || busy}
					onClick={onReview}
				>
					{t('extensions.plugins.review')}
				</Button>
				<Switch
					checked={rec.enabled}
					// `!canWrite` is durable, so it stays native. `busy` is transient and flips
					// synchronously inside this switch's own change handler — natively disabling there
					// strands focus on `<body>` mid-toggle, so it takes the soft form.
					disabled={!canWrite}
					aria-disabled={busy || undefined}
					aria-label={t('extensions.plugins.enableLabel', { name: def.displayName })}
					onChange={onToggle}
				/>
				{/* System packages are code-defined: no remove (the board's own widgets) and no JSON
				    round-trip (their `builtin` runtime is rejected by the installer by design). */}
				{!isSystem && (
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1-5)' }}>
						{confirmingRemove ? (
							<span ref={confirmRef} style={{ display: 'contents' }}>
								<Button
									variant="danger"
									size="sm"
									icon="delete"
									disabled={!canWrite || busy}
									onClick={onRemove}
								>
									{t('extensions.plugins.confirmRemove', { name: def.displayName })}
								</Button>
								<Button variant="ghost" size="sm" onClick={onKeep}>
									{t('extensions.compendium.keep')}
								</Button>
							</span>
						) : (
							<>
								<Button variant="ghost" size="sm" icon="upload" disabled={busy} onClick={onExport}>
									{t('extensions.plugins.exportJson')}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									icon="retry"
									aria-label={t('extensions.plugins.newVersionLabel', { name: def.displayName })}
									disabled={!canWrite || busy}
									onClick={onNewVersion}
								>
									{t('extensions.plugins.newVersion')}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									icon="delete"
									aria-label={t('extensions.plugins.removeLabel', { name: def.displayName })}
									disabled={!canWrite || busy}
									onClick={onAskRemove}
								>
									{t('common.action.remove')}
								</Button>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
