import { useMemo } from 'react';
import { buildWidgetPackageReviewSummary } from '@dndtools/core';
import { Badge, Button, DefinitionList } from '../../ds';
import { T } from '../screen-kit';
import {
	STEP_LABEL,
	buildPackage,
	generateMigration,
	type BuilderStepId,
	type DraftIssue,
	type WidgetDraft,
} from './draft';
import { StepHeader, StepSection } from './fields';
import { TEMPLATE_LABEL } from './vocabulary';

/**
 * Review — what will be installed, what it asks for, and the one button that writes it
 * (RC-WID-2.1).
 *
 * The trust recommendation and the requested-permission profile come from the core's own
 * `buildWidgetPackageReviewSummary`, the same summary the Plugins panel prints for an installed
 * package, so a widget is judged here by exactly the standard it will be judged by afterwards.
 * Nothing is installed until this step's button is pressed, and a rejection is printed verbatim.
 */

const RECOMMENDATION: Record<string, { label: string; tone: 'success' | 'warning' | 'error' }> = {
	'trusted-after-review': { label: 'Trust after review', tone: 'success' },
	'requires-review': { label: 'Requires review', tone: 'warning' },
	'deny-until-fixed': { label: 'Deny until fixed', tone: 'error' },
};

export function ReviewStep({
	draft,
	issues,
	mode,
	busy,
	canWrite,
	rejection,
	onGoToStep,
	onSubmit,
}: {
	draft: WidgetDraft;
	issues: DraftIssue[];
	/** Whether Review will install a new package or upgrade the one already carrying this id. */
	mode: 'install' | 'upgrade';
	busy: boolean;
	canWrite: boolean;
	/** The core's own rejection message from the last attempt, printed verbatim. */
	rejection: string | null;
	onGoToStep: (step: BuilderStepId) => void;
	onSubmit: () => void;
}) {
	const pkg = useMemo(() => buildPackage(draft), [draft]);
	const summary = useMemo(() => buildWidgetPackageReviewSummary(pkg), [pkg]);
	const migration = generateMigration(draft);
	const recommendation = RECOMMENDATION[summary.trustRecommendation] ?? {
		label: summary.trustRecommendation,
		tone: 'warning' as const,
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<StepHeader
				title="Review"
				help={
					mode === 'upgrade'
						? 'This id is already installed, so this saves a new version and migrates every copy already placed on a scene.'
						: 'Check what is about to be installed. It lands disabled with every host permission denied — enable it from Installed packages when you are happy with it.'
				}
			/>

			{issues.length > 0 && (
				<StepSection title="Fix these first">
					<ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
						{issues.map((issue, index) => (
							<li
								key={`${issue.field}-${index}`}
								style={{ font: `12.5px ${T.sans}`, color: T.ink }}
							>
								{issue.message}{' '}
								<Button variant="ghost" size="sm" onClick={() => onGoToStep(issue.step)}>
									Go to {STEP_LABEL[issue.step]}
								</Button>
							</li>
						))}
					</ul>
				</StepSection>
			)}

			<StepSection title="Summary">
				<DefinitionList
					items={[
						{ label: 'Package', value: `${pkg.displayName || '—'} · ${pkg.id || '—'}` },
						{ label: 'Widget type', value: draft.typeId || '—' },
						{ label: 'Version', value: draft.version },
						{ label: 'Draws as', value: TEMPLATE_LABEL[draft.template] },
						{
							label: 'Data queries',
							value:
								draft.dataQueries.length === 0
									? 'None'
									: draft.dataQueries.map((query) => query.label).join(', '),
						},
						{
							label: 'Commands',
							value:
								draft.commands.length === 0
									? 'None'
									: draft.commands.map((command) => command.displayName).join(', '),
						},
					]}
				/>
			</StepSection>

			<StepSection
				title="What it asks for"
				help="The same review Lamplight shows for any installed package."
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
					<Badge status={recommendation.tone}>{recommendation.label}</Badge>
					<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{summary.requestedHostPermissions.length === 0
							? 'No host permissions requested.'
							: `Host permissions: ${summary.requestedHostPermissions.join(', ')}.`}
					</span>
				</div>
				{summary.playerVisibleOutputs.length > 0 && (
					<span style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
						Writes players can see: {summary.playerVisibleOutputs.length}.
					</span>
				)}
				{summary.portabilityWarnings.map((warning) => (
					<span key={warning} style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
						{warning}
					</span>
				))}
			</StepSection>

			{mode === 'upgrade' && (
				<StepSection title="Placed copies">
					{migration ? (
						<span style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
							Every copy on version {migration.fromVersion} moves to {migration.toVersion}
							{migration.setConfigurationDefaults
								? `, and gains the new settings ${Object.keys(migration.setConfigurationDefaults).join(', ')}.`
								: '.'}
						</span>
					) : (
						<span style={{ font: `12.5px/1.6 ${T.sans}`, color: T.warn }}>
							The version has not changed, so copies already placed keep the definition they have.
							Raise the version on the Identity step to update them.
						</span>
					)}
				</StepSection>
			)}

			{rejection && (
				<div
					role="alert"
					style={{
						font: `12.5px/1.6 ${T.sans}`,
						color: T.ink,
						padding: 11,
						border: `1px solid ${T.err}`,
						borderRadius: 10,
						background: T.surf,
					}}
				>
					{rejection}
				</div>
			)}

			<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
				<Button
					variant="primary"
					icon={mode === 'upgrade' ? 'retry' : 'check'}
					disabled={!canWrite || busy || issues.length > 0}
					onClick={onSubmit}
				>
					{mode === 'upgrade' ? 'Save new version' : 'Install widget'}
				</Button>
				{!canWrite && (
					<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
						Building widgets is DM-only, and read-only while previewing as someone else.
					</span>
				)}
			</div>
		</div>
	);
}
