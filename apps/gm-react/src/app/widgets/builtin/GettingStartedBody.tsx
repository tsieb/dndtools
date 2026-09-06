import { resolveOnboarding } from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import { Chip, Muted, StatPill, bodyWrap } from '../../widget-body-kit';

/**
 * The `getting-started` Command Center widget (RC-WID-4.1) — the first-run guidance tile, reading
 * the core's own onboarding view rather than re-deciding "is this vault set up" in the GUI.
 * `resolveOnboarding` is DM-gated (`canSetup`), so a participant sees the tier line and no setup
 * checklist at all.
 */
export function GettingStartedBody() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const view = resolveOnboarding(runtime.state, runtime.defaultActorId);
	const done = view.steps.filter((step) => step.done).length;
	return (
		<div style={bodyWrap}>
			<div style={{ display: 'flex', gap: 'var(--space-4)' }}>
				<StatPill
					label={t('widgetBody.gettingStarted.setup')}
					value={`${done} / ${view.steps.length}`}
				/>
				<StatPill
					label={t('widgetBody.gettingStarted.tier')}
					value={t(`widgetBody.gettingStarted.tier.${view.tier}`)}
				/>
			</div>
			{view.canSetup ? (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
					{view.steps.map((step) => (
						<Chip key={step.id} tone={step.done ? 'accent' : 'neutral'}>
							{step.label}
						</Chip>
					))}
				</div>
			) : (
				<Muted>{t('widgetBody.gettingStarted.participant')}</Muted>
			)}
			{view.status === 'complete' && <Muted>{t('widgetBody.gettingStarted.complete')}</Muted>}
		</div>
	);
}
