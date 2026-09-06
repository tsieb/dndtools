import { useMemo, useRef, useState } from 'react';
import {
	buildWidgetPackageReviewSummary,
	type WidgetHostPermission,
	type WidgetNetworkDestinationClass,
} from '@dndtools/core';
import { Badge, Button, Checkbox, DefinitionList, Textarea } from '../../ds';
import { Seg, T } from '../screen-kit';
import { buildPackage } from './draft';
import { CUSTOM_CODE_SCAFFOLD, formatCode, type CustomCodePart } from './customCode';
import { StepHeader, StepSection, ToggleGroup, issueFor, type StepProps } from './fields';
import {
	CODE_PART_LABEL,
	HOST_API_REFERENCE,
	HOST_PERMISSIONS,
	HOST_PERMISSION_LABEL,
	NETWORK_DESTINATIONS,
	NETWORK_DESTINATION_HELP,
	NETWORK_DESTINATION_LABEL,
	RUNTIME_LABEL,
	TRUST_RECOMMENDATION,
} from './vocabulary';
import { useI18n, type MessageKey } from '../../i18n';

/**
 * Advanced — custom HTML/JS, what the package asks the host for, and what a reviewer will be told
 * (RC-WID-2.5).
 *
 * The code editor is three plain `<textarea>`s behind a picker, with a line-number gutter and a
 * Format button that only re-indents. That is a deliberate ceiling: a real editor component would
 * add a large dependency to the one screen that needs it least, and the code being written here is
 * a widget body of a few dozen lines that runs in an opaque-origin iframe. What the step owes the
 * author instead is TRUTH about the sandbox — hence the host API reference beside the editor, which
 * lists exactly the `window.dndtoolsWidget` surface `public/widget-host.html` exposes and nothing
 * more, so nobody writes against an API the frame does not have.
 *
 * Permissions are a REQUEST, never a grant: a package installs unreviewed with every host permission
 * denied, and only `widget.package.review` (RC-WID-1.5) can approve one. The security summary under
 * them is the core's own `buildWidgetPackageReviewSummary` — the same summary the Plugins review
 * sheet and the Review step print — recomputed on every keystroke, so the author watches the trust
 * recommendation fall to "review before trusting" the moment they turn code on, rather than
 * discovering it after install.
 *
 * The SEC-011 destination picker scopes the `network` permission. It appears only when `network` is
 * requested, because a destination class without the permission grants nothing, and the draft
 * validator says so rather than letting the mismatch install quietly.
 */

const CODE_PARTS: CustomCodePart[] = ['html', 'css', 'js'];

const CODE_LABEL: Record<CustomCodePart, MessageKey> = CODE_PART_LABEL;

/** A plain textarea with a gutter of line numbers that scrolls with it. */
function CodeEditor({
	label,
	value,
	rows,
	onChange,
	invalid,
}: {
	label: string;
	value: string;
	rows: number;
	onChange: (next: string) => void;
	invalid?: boolean;
}) {
	const gutterRef = useRef<HTMLDivElement | null>(null);
	const lineCount = Math.max(1, value.split('\n').length);
	const lineHeight = 19;
	return (
		<div
			style={{
				display: 'flex',
				border: `1px solid ${invalid ? T.err : T.bd}`,
				borderRadius: 10,
				overflow: 'hidden',
				background: T.surf,
			}}
		>
			<div
				ref={gutterRef}
				aria-hidden="true"
				style={{
					flex: '0 0 auto',
					padding: '9px 8px',
					textAlign: 'right',
					font: `12px/${lineHeight}px ${T.mono}`,
					color: T.ter,
					background: T.bg,
					borderRight: `1px solid ${T.bd}`,
					overflow: 'hidden',
					userSelect: 'none',
				}}
			>
				{Array.from({ length: lineCount }, (_, index) => (
					<div key={index}>{index + 1}</div>
				))}
			</div>
			<Textarea
				aria-label={label}
				value={value}
				rows={rows}
				spellCheck={false}
				wrap="off"
				data-testid="widget-builder-code"
				style={{
					flex: 1,
					minWidth: 0,
					border: 0,
					borderRadius: 0,
					background: 'transparent',
					font: `12px/${lineHeight}px ${T.mono}`,
					padding: '9px 10px',
					resize: 'vertical',
				}}
				onScroll={(e: { currentTarget: { scrollTop: number } }) => {
					if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
				}}
				onChange={(e: { target: { value: string } }) => onChange(e.target.value)}
			/>
		</div>
	);
}

export function AdvancedStep({ draft, patch, issues }: StepProps) {
	const { t } = useI18n();
	const [part, setPart] = useState<CustomCodePart>('html');
	const isCustom = draft.runtime === 'custom-html-js';

	// The core's own reading of the draft, recomputed as it is typed: the trust recommendation here
	// is the one the Review step and the Plugins review sheet will print, never a builder-local guess.
	const summary = useMemo(() => buildWidgetPackageReviewSummary(buildPackage(draft)), [draft]);
	const recommendation = TRUST_RECOMMENDATION[summary.trustRecommendation];

	const togglePermission = (permission: WidgetHostPermission) => {
		const next = draft.hostPermissions.includes(permission)
			? draft.hostPermissions.filter((entry) => entry !== permission)
			: [...draft.hostPermissions, permission];
		// Dropping `network` drops the classes it scoped: leaving them behind would keep asking for
		// destinations no permission can reach.
		patch({
			hostPermissions: next,
			...(permission === 'network' && !next.includes('network') ? { networkDestinations: [] } : {}),
		});
	};

	const toggleDestination = (destination: WidgetNetworkDestinationClass) =>
		patch({
			networkDestinations: draft.networkDestinations.includes(destination)
				? draft.networkDestinations.filter((entry) => entry !== destination)
				: [...draft.networkDestinations, destination],
		});

	const setRuntime = (runtime: 'template' | 'custom-html-js') => {
		const blank =
			!draft.customCode.html.trim() && !draft.customCode.css.trim() && !draft.customCode.js.trim();
		patch({
			runtime,
			// Turning code on for the first time starts from a widget that runs, so the preview shows
			// the sandbox working rather than an empty frame the author has to debug blind.
			...(runtime === 'custom-html-js' && blank ? { customCode: { ...CUSTOM_CODE_SCAFFOLD } } : {}),
		});
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<StepHeader title={t('builder.advanced.title')} help={t('builder.advanced.help')} />

			<StepSection
				title={t('builder.advanced.runtimeTitle')}
				help={t('builder.advanced.runtimeHelp')}
			>
				<Seg
					ariaLabel={t('builder.advanced.runtimeTitle')}
					value={draft.runtime}
					onChange={(next: string) =>
						setRuntime(next === 'custom-html-js' ? 'custom-html-js' : 'template')
					}
					options={[
						{ value: 'template', label: t(RUNTIME_LABEL.template) },
						{ value: 'custom-html-js', label: t(RUNTIME_LABEL['custom-html-js']) },
					]}
				/>
				<span style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
					{t(
						isCustom
							? 'builder.advanced.runtimeCustomNote'
							: 'builder.advanced.runtimeTemplateNote',
					)}
				</span>
			</StepSection>

			{isCustom && (
				<StepSection title={t('builder.advanced.codeTitle')} help={t('builder.advanced.codeHelp')}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
						<Seg
							ariaLabel={t('builder.advanced.codeTitle')}
							value={part}
							onChange={(next: string) => setPart(next as CustomCodePart)}
							options={CODE_PARTS.map((value) => ({ value, label: t(CODE_LABEL[value]) }))}
						/>
						<Button
							variant="secondary"
							size="sm"
							icon="edit"
							onClick={() =>
								patch({
									customCode: {
										...draft.customCode,
										[part]: formatCode(part, draft.customCode[part]),
									},
								})
							}
						>
							{t('builder.advanced.format')}
						</Button>
						<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
							{t('builder.advanced.formatHelp')}
						</span>
					</div>
					<CodeEditor
						label={t(CODE_LABEL[part])}
						value={draft.customCode[part]}
						rows={part === 'js' ? 14 : 10}
						invalid={Boolean(issueFor(issues, 'customCode', t))}
						onChange={(next) => patch({ customCode: { ...draft.customCode, [part]: next } })}
					/>
					{issueFor(issues, 'customCode', t) && (
						<span role="alert" style={{ font: `12px ${T.sans}`, color: T.err }}>
							{issueFor(issues, 'customCode', t)}
						</span>
					)}
				</StepSection>
			)}

			{isCustom && (
				<StepSection title={t('builder.advanced.apiTitle')} help={t('builder.advanced.apiHelp')}>
					<DefinitionList
						items={HOST_API_REFERENCE.map((entry) => ({
							label: entry.signature,
							value: t(entry.description),
						}))}
					/>
				</StepSection>
			)}

			<StepSection title={t('builder.advanced.permsTitle')} help={t('builder.advanced.permsHelp')}>
				<ToggleGroup legend={t('builder.advanced.permsLegend')}>
					{HOST_PERMISSIONS.map((permission: WidgetHostPermission) => (
						<Checkbox
							key={permission}
							checked={draft.hostPermissions.includes(permission)}
							label={t(HOST_PERMISSION_LABEL[permission])}
							onChange={() => togglePermission(permission)}
						/>
					))}
				</ToggleGroup>
				{draft.hostPermissions.includes('network') && (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
						<ToggleGroup legend={t('builder.advanced.destinationsLegend')}>
							{NETWORK_DESTINATIONS.map((destination) => (
								<Checkbox
									key={destination}
									checked={draft.networkDestinations.includes(destination)}
									label={t(NETWORK_DESTINATION_LABEL[destination])}
									onChange={() => toggleDestination(destination)}
								/>
							))}
						</ToggleGroup>
						<ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
							{NETWORK_DESTINATIONS.map((destination) => (
								<li key={destination} style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
									{t(NETWORK_DESTINATION_LABEL[destination])} —{' '}
									{t(NETWORK_DESTINATION_HELP[destination])}
								</li>
							))}
						</ul>
						{issueFor(issues, 'networkDestinations', t) && (
							<span role="alert" style={{ font: `12px ${T.sans}`, color: T.err }}>
								{issueFor(issues, 'networkDestinations', t)}
							</span>
						)}
					</div>
				)}
			</StepSection>

			<StepSection
				title={t('builder.advanced.securityTitle')}
				help={t('builder.advanced.securityHelp')}
			>
				<div
					data-testid="widget-builder-security-summary"
					style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
				>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
						<Badge status={recommendation?.tone ?? 'warning'}>
							{recommendation ? t(recommendation.label) : summary.trustRecommendation}
						</Badge>
						<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
							{summary.customCodeWidgets.length > 0
								? t('builder.advanced.summaryCustomCode')
								: t('builder.advanced.summaryNoCustomCode')}
						</span>
					</div>
					<DefinitionList
						items={[
							{
								label: t('builder.advanced.permsTitle'),
								value:
									summary.requestedHostPermissions.length === 0
										? t('builder.review.noPermsRequested')
										: summary.requestedHostPermissions
												.map((permission) => t(HOST_PERMISSION_LABEL[permission]))
												.join(', '),
							},
							{
								label: t('builder.advanced.destinationsLegend'),
								value:
									summary.requestedNetworkDestinations.length === 0
										? t('builder.advanced.noDestinations')
										: summary.requestedNetworkDestinations
												.map((destination) => t(NETWORK_DESTINATION_LABEL[destination]))
												.join(', '),
							},
						]}
					/>
					{summary.runtimeIssues.map((issue) => (
						<span key={issue.code} style={{ font: `12px/1.5 ${T.sans}`, color: T.warn }}>
							{issue.message}
						</span>
					))}
				</div>
			</StepSection>

			<StepSection title={t('builder.advanced.notesTitle')} help={t('builder.advanced.notesHelp')}>
				<Textarea
					value={draft.portabilityWarnings.join('\n')}
					rows={3}
					aria-label={t('builder.advanced.notesTitle')}
					placeholder={t('builder.advanced.notesPlaceholder')}
					onChange={(e: { target: { value: string } }) =>
						patch({
							portabilityWarnings: e.target.value
								.split('\n')
								.map((line) => line.trim())
								.filter(Boolean),
						})
					}
				/>
			</StepSection>
		</div>
	);
}
