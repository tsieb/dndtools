import { useMemo, useState } from 'react';
import {
	buildWidgetPackageReviewSummary,
	type CommandResult,
	type WidgetHostPermission,
} from '@dndtools/core';
import { Badge, Button, Checkbox, SegmentedControl, Sheet, Toaster } from '../../ds';
import { T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n, type MessageKey } from '../../i18n';

/**
 * RC-WID-1.5 — the TRUST REVIEW sheet. An installed package can reach nothing until the DM sits
 * with this sheet: it lists every host permission the package asks for, next to the reason the
 * review analysis (`buildWidgetPackageReviewSummary`) gives for the request, with an Allow/Deny
 * choice each. The verdict dispatches the real `widget.package.review` command — the Core records
 * the decisions, and the sandbox host answers the widget's own `requestPermission` calls from them.
 *
 * When the analysis recommends denying the package until it is fixed, trusting it takes an explicit
 * acknowledgment here; the Core rejects a trust decision without one, so the checkbox is the real
 * gate rather than a warning the DM can click past.
 */

const HOST_PERM_LABEL: Record<string, MessageKey> = {
	filesystem: 'extensions.trust.perm.filesystem',
	clipboard: 'extensions.trust.perm.clipboard',
	network: 'extensions.trust.perm.network',
	'source-adapter': 'extensions.trust.perm.sourceAdapter',
	asset: 'extensions.trust.perm.asset',
	'external-link': 'extensions.trust.perm.externalLink',
};

// What granting the permission actually lets the widget do, in the DM's terms.
const HOST_PERM_MEANING: Record<string, MessageKey> = {
	filesystem: 'extensions.trust.meaning.filesystem',
	clipboard: 'extensions.trust.meaning.clipboard',
	network: 'extensions.trust.meaning.network',
	'source-adapter': 'extensions.trust.meaning.sourceAdapter',
	asset: 'extensions.trust.meaning.asset',
	'external-link': 'extensions.trust.meaning.externalLink',
};

const RECOMMENDATION_LABEL: Record<string, MessageKey> = {
	'trusted-after-review': 'extensions.trust.recommend.trusted',
	'requires-review': 'extensions.trust.recommend.review',
	'deny-until-fixed': 'extensions.trust.recommend.deny',
};
const RECOMMENDATION_TONE: Record<string, 'success' | 'warning' | 'error'> = {
	'trusted-after-review': 'success',
	'requires-review': 'warning',
	'deny-until-fixed': 'error',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
			<h3 style={{ margin: 0, font: `600 12.5px ${T.sans}`, color: T.ink }}>{title}</h3>
			{children}
		</section>
	);
}

export function TrustReviewSheet({
	packageId,
	onClose,
}: {
	packageId: string;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const previewing = !!runtime.preview;
	const isDm = runtime.state.permissions.actors[dmId]?.role === 'dm';
	const canWrite = isDm && !previewing;
	const record = runtime.state.widgets.packages[packageId];
	const [busy, setBusy] = useState(false);
	const [acknowledged, setAcknowledged] = useState(false);
	const [decisions, setDecisions] = useState<Record<string, 'approved' | 'denied'>>(
		() => ({ ...(record?.trust.hostPermissions ?? {}) }) as Record<string, 'approved' | 'denied'>,
	);

	const summary = useMemo(
		() => (record ? buildWidgetPackageReviewSummary(record.package) : null),
		[record],
	);
	// Which widget in the package asks for each permission — the reason behind the request.
	const requestedBy = useMemo(() => {
		const map = new Map<string, string[]>();
		for (const widget of record?.package.widgets ?? []) {
			for (const permission of widget.hostPermissions ?? []) {
				map.set(permission, [...(map.get(permission) ?? []), widget.displayName]);
			}
		}
		return map;
	}, [record]);

	if (!record || !summary) return null;

	const denyUntilFixed = summary.trustRecommendation === 'deny-until-fixed';
	const finish = (result: CommandResult, okText: string) => {
		if (result.status === 'accepted') {
			Toaster.success(okText);
			onClose();
		} else {
			const issues = (result.rejection.issues ?? [])
				.map((issue) => `${issue.path}: ${issue.message}`)
				.join(' · ');
			Toaster.error(issues ? `${result.rejection.message} ${issues}` : result.rejection.message);
		}
	};

	const decide = (trustState: 'trusted' | 'denied') => {
		if (busy) return;
		setBusy(true);
		void runtime
			.dispatch({
				type: 'widget.package.review',
				actorId: dmId,
				payload: {
					packageId,
					trustState,
					// Only the permissions this package asks for are ever sent; the Core rejects the rest.
					hostPermissions: Object.fromEntries(
						summary.requestedHostPermissions.map((permission) => [
							permission,
							decisions[permission] === 'approved' ? 'approved' : 'denied',
						]),
					),
					acknowledgeRecommendation: acknowledged,
				},
			})
			.then((result) =>
				finish(
					result,
					trustState === 'trusted'
						? t('extensions.trust.trusted', { name: record.package.displayName })
						: t('extensions.trust.denied', { name: record.package.displayName }),
				),
			)
			.catch((error: unknown) =>
				Toaster.error(error instanceof Error ? error.message : String(error)),
			)
			.finally(() => setBusy(false));
	};

	return (
		<Sheet
			open
			side="right"
			onClose={onClose}
			title={t('extensions.trust.title', { name: record.package.displayName })}
			description={t('extensions.trust.description')}
			footer={
				<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
					<Button variant="ghost" size="sm" onClick={onClose}>
						{t('common.action.cancel')}
					</Button>
					<Button
						variant="danger"
						size="sm"
						disabled={!canWrite || busy}
						onClick={() => decide('denied')}
					>
						{t('extensions.trust.denyPackage')}
					</Button>
					<Button
						variant="primary"
						size="sm"
						disabled={!canWrite || busy || (denyUntilFixed && !acknowledged)}
						onClick={() => decide('trusted')}
					>
						{t('extensions.trust.trustPackage')}
					</Button>
				</div>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				{!canWrite && (
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{t('extensions.trust.readOnly')}
					</div>
				)}
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 6,
						padding: 12,
						border: `1px solid ${T.bd}`,
						borderRadius: 10,
						background: T.sunken,
					}}
				>
					<Badge status={RECOMMENDATION_TONE[summary.trustRecommendation] ?? 'warning'}>
						{RECOMMENDATION_LABEL[summary.trustRecommendation]
							? t(RECOMMENDATION_LABEL[summary.trustRecommendation])
							: summary.trustRecommendation}
					</Badge>
					<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>
						{t('extensions.trust.version', { version: record.package.version })} ·{' '}
						{t(
							summary.customCodeWidgets.length > 0
								? 'extensions.trust.codeCustom'
								: 'extensions.trust.codeTemplates',
						)}{' '}
						{t(
							summary.playerVisibleOutputs.length > 0
								? 'extensions.trust.writesPlayerVisible'
								: 'extensions.trust.writesNothing',
						)}
					</div>
					{summary.runtimeIssues.length > 0 && (
						<ul style={{ margin: 0, paddingLeft: 18, font: `12px/1.5 ${T.sans}`, color: T.sub }}>
							{summary.runtimeIssues.map((issue) => (
								<li key={issue.code}>{issue.message}</li>
							))}
						</ul>
					)}
				</div>

				<Section title={t('extensions.trust.permsTitle')}>
					{summary.requestedHostPermissions.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							{t('extensions.trust.noPerms')}
						</div>
					) : (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
							{summary.requestedHostPermissions.map((permission: WidgetHostPermission) => (
								<div
									key={permission}
									style={{
										display: 'flex',
										gap: 12,
										alignItems: 'flex-start',
										padding: 10,
										border: `1px solid ${T.bd}`,
										borderRadius: 10,
										background: T.surf,
									}}
								>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ font: `600 12.5px ${T.sans}` }}>
											{HOST_PERM_LABEL[permission] ? t(HOST_PERM_LABEL[permission]) : permission}
										</div>
										<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
											{t(HOST_PERM_MEANING[permission] ?? 'extensions.trust.meaning.other')}
										</div>
										<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
											{t('extensions.trust.askedFor', {
												who:
													(requestedBy.get(permission) ?? []).join(', ') ||
													t('extensions.trust.thisPackage'),
											})}
										</div>
									</div>
									<SegmentedControl
										size="sm"
										ariaLabel={t('extensions.trust.permissionControl', {
											permission: HOST_PERM_LABEL[permission]
												? t(HOST_PERM_LABEL[permission])
												: permission,
										})}
										value={decisions[permission] === 'approved' ? 'approved' : 'denied'}
										options={[
											{ value: 'denied', label: t('extensions.trust.deny') },
											{ value: 'approved', label: t('extensions.trust.allow') },
										]}
										onChange={(value: string) =>
											setDecisions((current) => ({
												...current,
												[permission]: value === 'approved' ? 'approved' : 'denied',
											}))
										}
									/>
								</div>
							))}
						</div>
					)}
				</Section>

				{summary.requestedNetworkDestinations.length > 0 && (
					<Section title={t('extensions.trust.connectTitle')}>
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
							{summary.requestedNetworkDestinations.map((destination: string) => (
								<Badge key={destination} status="warning">
									{destination}
								</Badge>
							))}
						</div>
					</Section>
				)}

				{summary.playerVisibleOutputs.length > 0 && (
					<Section title={t('extensions.trust.writeTitle')}>
						<ul style={{ margin: 0, paddingLeft: 18, font: `12px/1.5 ${T.sans}`, color: T.sub }}>
							{summary.playerVisibleOutputs.map((output, index) => (
								<li key={`${output.widgetType}-${output.destinationClass}-${index}`}>
									{t('extensions.trust.writesTo', {
										widget: output.widgetType,
										destination: output.destinationClass.replace(/-/g, ' '),
									})}
								</li>
							))}
						</ul>
					</Section>
				)}

				{summary.requestedBindings.length > 0 && (
					<Section title={t('extensions.trust.readTitle')}>
						<ul style={{ margin: 0, paddingLeft: 18, font: `12px/1.5 ${T.sans}`, color: T.sub }}>
							{summary.requestedBindings.map((binding, index) => (
								<li key={`${binding.widgetType}-${binding.bindingId}-${index}`}>
									{binding.label} ({binding.modes.join(', ')}).
								</li>
							))}
						</ul>
					</Section>
				)}

				{denyUntilFixed && (
					<div
						style={{
							padding: 12,
							border: `1px solid ${T.bd}`,
							borderRadius: 10,
							background: T.sunken,
							display: 'flex',
							flexDirection: 'column',
							gap: 6,
						}}
					>
						<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>
							{t('extensions.trust.ackBody')}
						</div>
						<Checkbox
							checked={acknowledged}
							disabled={!canWrite}
							onChange={() => setAcknowledged((value) => !value)}
							label={t('extensions.trust.ackLabel')}
						/>
					</div>
				)}
			</div>
		</Sheet>
	);
}
