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
import { useI18n, type MessageKey } from '../../i18n';

/**
 * Review — what will be installed, what it asks for, and the one button that writes it
 * (RC-WID-2.1).
 *
 * The trust recommendation and the requested-permission profile come from the core's own
 * `buildWidgetPackageReviewSummary`, the same summary the Plugins panel prints for an installed
 * package, so a widget is judged here by exactly the standard it will be judged by afterwards.
 * Nothing is installed until this step's button is pressed, and a rejection is printed verbatim.
 */

const RECOMMENDATION: Record<string, { label: MessageKey; tone: 'success' | 'warning' | 'error' }> =
	{
		'trusted-after-review': { label: 'extensions.plugins.recommendTrust', tone: 'success' },
		'requires-review': { label: 'extensions.trust.recommend.review', tone: 'warning' },
		'deny-until-fixed': { label: 'extensions.trust.recommend.deny', tone: 'error' },
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
	const { t } = useI18n();
	const pkg = useMemo(() => buildPackage(draft), [draft]);
	const summary = useMemo(() => buildWidgetPackageReviewSummary(pkg), [pkg]);
	const migration = generateMigration(draft);
	const recommendation = RECOMMENDATION[summary.trustRecommendation];
	const recommendationLabel = recommendation
		? t(recommendation.label)
		: summary.trustRecommendation;
	const recommendationTone = recommendation?.tone ?? 'warning';

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<StepHeader
				title={t('builder.step.review')}
				help={t(mode === 'upgrade' ? 'builder.review.helpUpgrade' : 'builder.review.helpInstall')}
			/>

			{issues.length > 0 && (
				<StepSection title={t('builder.review.fixFirst')}>
					<ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
						{issues.map((issue, index) => (
							<li
								key={`${issue.field}-${index}`}
								style={{ font: `12.5px ${T.sans}`, color: T.ink }}
							>
								{t(issue.message, issue.values)}{' '}
								<Button variant="ghost" size="sm" onClick={() => onGoToStep(issue.step)}>
									{t('builder.review.goTo', { step: t(STEP_LABEL[issue.step]) })}
								</Button>
							</li>
						))}
					</ul>
				</StepSection>
			)}

			<StepSection title={t('builder.review.summary')}>
				<DefinitionList
					items={[
						{
							label: t('builder.review.package'),
							value: `${pkg.displayName || '—'} · ${pkg.id || '—'}`,
						},
						{ label: t('builder.review.widgetType'), value: draft.typeId || '—' },
						{ label: t('builder.identity.version'), value: draft.version },
						{ label: t('builder.review.drawsAs'), value: t(TEMPLATE_LABEL[draft.template]) },
						{
							label: t('builder.review.dataQueries'),
							value:
								draft.dataQueries.length === 0
									? t('builder.review.none')
									: draft.dataQueries.map((query) => query.label).join(', '),
						},
						{
							label: t('builder.step.commands'),
							value:
								draft.commands.length === 0
									? t('builder.review.none')
									: draft.commands.map((command) => command.displayName).join(', '),
						},
					]}
				/>
			</StepSection>

			<StepSection title={t('builder.review.asksFor')} help={t('builder.review.asksForHelp')}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
					<Badge status={recommendationTone}>{recommendationLabel}</Badge>
					<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{summary.requestedHostPermissions.length === 0
							? t('builder.review.noPermsRequested')
							: t('builder.review.permsRequested', {
									list: summary.requestedHostPermissions.join(', '),
								})}
					</span>
				</div>
				{summary.playerVisibleOutputs.length > 0 && (
					<span style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
						{t('builder.review.playerVisibleWrites', {
							count: summary.playerVisibleOutputs.length,
						})}
					</span>
				)}
				{summary.portabilityWarnings.map((warning) => (
					<span key={warning} style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
						{warning}
					</span>
				))}
			</StepSection>

			{mode === 'upgrade' && (
				<StepSection title={t('builder.review.placedCopies')}>
					{migration ? (
						<span style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
							{t('builder.review.migrationFromTo', {
								from: migration.fromVersion,
								to: migration.toVersion,
							})}
							{migration.setConfigurationDefaults
								? t('builder.review.migrationGains', {
										settings: Object.keys(migration.setConfigurationDefaults).join(', '),
									})
								: '.'}
						</span>
					) : (
						<span style={{ font: `12.5px/1.6 ${T.sans}`, color: T.warn }}>
							{t('builder.review.noVersionBump')}
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
					{t(mode === 'upgrade' ? 'builder.review.saveVersion' : 'builder.review.install')}
				</Button>
				{!canWrite && (
					<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{t('builder.review.readOnly')}
					</span>
				)}
			</div>
		</div>
	);
}
