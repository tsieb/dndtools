import { buildWidgetPackageReviewSummary, type WidgetPackageRecord } from '@dndtools/core';
import { Badge, Button, Icon, Switch } from '../../ds';
import { T } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import { useFocusOnReveal } from './shared';

const TRUST_TONE: Record<string, 'success' | 'warning' | 'error'> = {
	trusted: 'success',
	unreviewed: 'warning',
	denied: 'error',
};
// Machine tokens from the trust/review model, rendered as spoken labels.
const TRUST_LABEL: Record<string, MessageKey> = {
	trusted: 'extensions.plugins.trustTrusted',
	unreviewed: 'extensions.plugins.trustUnreviewed',
	denied: 'extensions.plugins.trustDenied',
};
// A distinct shape per trust state, so the badge never relies on its colour alone.
const TRUST_ICON: Record<string, string> = {
	trusted: 'check',
	unreviewed: 'warning',
	denied: 'error',
};
const TRUST_RECOMMENDATION_LABEL: Record<string, MessageKey> = {
	'trusted-after-review': 'extensions.plugins.recommendTrust',
	'requires-review': 'extensions.trust.recommend.review',
	'deny-until-fixed': 'extensions.trust.recommend.deny',
};
const HOST_PERM_LABEL: Record<string, MessageKey> = {
	filesystem: 'extensions.trust.perm.filesystem',
	clipboard: 'extensions.trust.perm.clipboard',
	network: 'extensions.trust.perm.network',
	'source-adapter': 'extensions.trust.perm.sourceAdapter',
	asset: 'extensions.trust.perm.asset',
	'external-link': 'extensions.trust.perm.externalLink',
};

/** One installed widget package: its trust posture, what it asks for, and what the DM can do with it. */
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
	// RC-WID-1.5 — "needs review" is the RECORDED trust state, not the analysis: once the DM has
	// reviewed a package the card stops asking them to review it, and the analysis' recommendation
	// stays visible on its own line below.
	const needsReview = rec.trust.state === 'unreviewed';
	const perms: string[] = review.requestedHostPermissions;
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
					<Badge
						status={TRUST_TONE[rec.trust.state] ?? 'neutral'}
						icon={TRUST_ICON[rec.trust.state]}
					>
						{TRUST_LABEL[rec.trust.state] ? t(TRUST_LABEL[rec.trust.state]) : rec.trust.state}
					</Badge>
					{isSystem && <Badge status="neutral">{t('extensions.objects.builtIn')}</Badge>}
					{def.authoring?.source === 'generated' && (
						<Badge status="info" icon="sparkle">
							{t('extensions.plugins.generated')}
						</Badge>
					)}
					{needsReview && (
						<Badge status="warning" icon="permissions">
							{t('extensions.plugins.needsReview')}
						</Badge>
					)}
					{review.customCodeWidgets.length > 0 && (
						<Badge status="info" icon="toolbox">
							{t('extensions.plugins.customCode')}
						</Badge>
					)}
					{rec.migrationStatus?.state === 'failed' && (
						<Badge status="error" icon="error">
							{t('extensions.plugins.migrationFailed')}
						</Badge>
					)}
				</div>
				<div
					style={{
						font: `var(--text-xs) ${T.sans}`,
						color: T.sub,
						marginBottom: 'var(--space-1-5)',
					}}
				>
					{t('extensions.plugins.cardMeta', {
						version: def.version,
						widgets: def.widgets.length,
						recommendation: TRUST_RECOMMENDATION_LABEL[review.trustRecommendation]
							? t(TRUST_RECOMMENDATION_LABEL[review.trustRecommendation])
							: review.trustRecommendation,
					})}
				</div>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1-5)' }}>
					{perms.length === 0 ? (
						<Badge status="neutral">{t('extensions.plugins.noPerms')}</Badge>
					) : (
						perms.map((p) => (
							<Badge key={p} status="neutral" icon="permissions">
								{HOST_PERM_LABEL[p] ? t(HOST_PERM_LABEL[p]) : p}
							</Badge>
						))
					)}
					{review.requestedNetworkDestinations.map((d: string) => (
						<Badge key={d} status="warning" icon="warning">
							{t('extensions.plugins.network', { destination: d })}
						</Badge>
					))}
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
