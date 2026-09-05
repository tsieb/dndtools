import { useMemo, useState } from 'react';
import {
	buildWidgetPackageReviewSummary,
	type CommandResult,
	type WidgetHostPermission,
} from '@dndtools/core';
import { Badge, Button, Checkbox, SegmentedControl, Sheet, Toaster } from '../../ds';
import { T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';

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

const HOST_PERM_LABEL: Record<string, string> = {
	filesystem: 'Filesystem',
	clipboard: 'Clipboard',
	network: 'Network',
	'source-adapter': 'Source adapter',
	asset: 'Assets',
	'external-link': 'External links',
};

// What granting the permission actually lets the widget do, in the DM's terms.
const HOST_PERM_MEANING: Record<string, string> = {
	filesystem: 'Read and write files you choose on this device.',
	clipboard: 'Read from and write to your clipboard.',
	network: 'Send requests to the destinations listed below.',
	'source-adapter': 'Read your configured content sources.',
	asset: 'Read images and audio from your campaign assets.',
	'external-link': 'Open links outside Lamplight.',
};

const RECOMMENDATION_LABEL: Record<string, string> = {
	'trusted-after-review': 'Safe to trust after review',
	'requires-review': 'Requires review',
	'deny-until-fixed': 'Deny until fixed',
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
						? `Trusted ${record.package.displayName} with the permissions you allowed.`
						: `Denied ${record.package.displayName} — it is disabled and its placed widgets are paused.`,
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
			title={`Review ${record.package.displayName}`}
			description="Decide what this package may reach. Everything is denied until you allow it."
			footer={
				<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
					<Button variant="ghost" size="sm" onClick={onClose}>
						Cancel
					</Button>
					<Button
						variant="danger"
						size="sm"
						disabled={!canWrite || busy}
						onClick={() => decide('denied')}
					>
						Deny package
					</Button>
					<Button
						variant="primary"
						size="sm"
						disabled={!canWrite || busy || (denyUntilFixed && !acknowledged)}
						onClick={() => decide('trusted')}
					>
						Trust package
					</Button>
				</div>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				{!canWrite && (
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						Reviewing a package is DM only and read-only while previewing.
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
						{RECOMMENDATION_LABEL[summary.trustRecommendation] ?? summary.trustRecommendation}
					</Badge>
					<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>
						v{record.package.version} ·{' '}
						{summary.customCodeWidgets.length > 0
							? 'Runs its own code in a sandbox.'
							: 'Uses built-in widget templates only.'}{' '}
						{summary.playerVisibleOutputs.length > 0
							? 'It can write content your players see.'
							: 'It writes nothing your players see.'}
					</div>
					{summary.runtimeIssues.length > 0 && (
						<ul style={{ margin: 0, paddingLeft: 18, font: `12px/1.5 ${T.sans}`, color: T.sub }}>
							{summary.runtimeIssues.map((issue) => (
								<li key={issue.code}>{issue.message}</li>
							))}
						</ul>
					)}
				</div>

				<Section title="Permissions it asks for">
					{summary.requestedHostPermissions.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							This package asks for no host permissions.
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
											{HOST_PERM_LABEL[permission] ?? permission}
										</div>
										<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
											{HOST_PERM_MEANING[permission] ?? 'Reaches a host capability.'}
										</div>
										<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
											Asked for by{' '}
											{(requestedBy.get(permission) ?? []).join(', ') || 'this package'}.
										</div>
									</div>
									<SegmentedControl
										size="sm"
										ariaLabel={`${HOST_PERM_LABEL[permission] ?? permission} permission`}
										value={decisions[permission] === 'approved' ? 'approved' : 'denied'}
										options={[
											{ value: 'denied', label: 'Deny' },
											{ value: 'approved', label: 'Allow' },
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
					<Section title="Where it would connect">
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
					<Section title="What it can write">
						<ul style={{ margin: 0, paddingLeft: 18, font: `12px/1.5 ${T.sans}`, color: T.sub }}>
							{summary.playerVisibleOutputs.map((output, index) => (
								<li key={`${output.widgetType}-${output.destinationClass}-${index}`}>
									{output.widgetType} writes to {output.destinationClass.replace(/-/g, ' ')}.
								</li>
							))}
						</ul>
					</Section>
				)}

				{summary.requestedBindings.length > 0 && (
					<Section title="What it can read">
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
							The review recommends denying this package until it is fixed. Trusting it anyway needs
							your acknowledgement.
						</div>
						<Checkbox
							checked={acknowledged}
							disabled={!canWrite}
							onChange={() => setAcknowledged((value) => !value)}
							label="I understand the recommendation and want to trust it anyway"
						/>
					</div>
				)}
			</div>
		</Sheet>
	);
}
