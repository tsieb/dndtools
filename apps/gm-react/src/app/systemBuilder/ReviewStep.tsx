import { Badge, Button, Textarea } from '../../ds';
import { T, eb } from '../screen-kit';
import { StepHeader, StepSection } from '../widgetBuilder/fields';
import {
	STEP_IDS,
	STEP_LABEL,
	buildPackage,
	issueText,
	type SystemDraft,
	type SystemDraftIssue,
	type SystemStepId,
} from './draft';
import type { Translate } from './ui';

/**
 * Step 8 — review (RC-SYS-3.3).
 *
 * Three things, in the order a DM needs them: what this package came FROM, everything still wrong
 * with it (grouped by the step that can fix it, each heading a real button that goes there), and
 * the JSON that will be saved. Saving dispatches `system.define` or `system.update` and prints the
 * CORE's rejection verbatim when it refuses — the checks above are a guide to the same rules, never
 * a replacement for them.
 *
 * Saving does not activate. Switching the campaign's system runs the dry-run in the picker
 * (RC-SYS-3.2), which is the only path that can tell a DM what a switch would drop, so the builder
 * hands them back to it rather than quietly changing what everyone is playing.
 */
export function ReviewStep({
	draft,
	issues,
	mode,
	originName,
	busy,
	canWrite,
	rejection,
	onGoToStep,
	onSubmit,
	t,
}: {
	draft: SystemDraft;
	issues: SystemDraftIssue[];
	mode: 'define' | 'update';
	/** The package this one was forked from, when the fork was recorded. */
	originName: string | null;
	busy: boolean;
	canWrite: boolean;
	rejection: string | null;
	onGoToStep: (step: SystemStepId) => void;
	onSubmit: () => void;
	t: Translate;
}) {
	const json = JSON.stringify(buildPackage(draft), null, 2);
	const grouped = STEP_IDS.map((step) => ({
		step,
		found: issues.filter((issue) => issue.step === step),
	})).filter((group) => group.found.length > 0);
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
			<StepHeader title={t('systemBuilder.step.review')} help={t('systemBuilder.review.help')} />

			<StepSection title={t('systemBuilder.review.origin')}>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 4,
						padding: '11px 13px',
						borderRadius: 9,
						border: `1px solid ${T.bd}`,
						background: T.sunken,
					}}
				>
					<span style={eb}>{t('systemBuilder.review.forkedFrom')}</span>
					<span style={{ font: `600 13px ${T.sans}`, color: T.ink }}>
						{originName ?? t('systemBuilder.review.noOrigin')}
					</span>
					<span style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
						{t('systemBuilder.review.identity', { id: draft.id, version: draft.version })}
					</span>
				</div>
			</StepSection>

			<StepSection title={t('systemBuilder.review.issues')}>
				{grouped.length === 0 ? (
					<div
						role="status"
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							font: `12.5px ${T.sans}`,
							color: T.sub,
						}}
					>
						<Badge status="success" icon="check">
							{t('systemBuilder.review.clean')}
						</Badge>
						<span>{t('systemBuilder.review.cleanBody')}</span>
					</div>
				) : (
					<div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						{grouped.map((group) => (
							<div key={group.step} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
								<div>
									<Button
										variant="ghost"
										size="sm"
										icon="chevron-right"
										onClick={() => onGoToStep(group.step)}
									>
										{t(STEP_LABEL[group.step])}
									</Button>
								</div>
								<ul
									style={{
										margin: 0,
										padding: '0 0 0 26px',
										font: `12px/1.55 ${T.sans}`,
										color: T.sub,
									}}
								>
									{group.found.map((issue) => (
										<li key={`${issue.path}:${issue.message}`}>
											<code style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{issue.path}</code> —{' '}
											{issueText(issue, t)}
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				)}
			</StepSection>

			<StepSection title={t('systemBuilder.review.json')} help={t('systemBuilder.review.jsonHelp')}>
				<Textarea
					value={json}
					readOnly
					rows={16}
					aria-label={t('systemBuilder.review.jsonField')}
					data-testid="system-builder-json"
					style={{ fontFamily: T.mono, fontSize: 11.5 }}
				/>
			</StepSection>

			{rejection && (
				<div
					role="alert"
					style={{
						padding: '11px 13px',
						borderRadius: 9,
						border: `1px solid ${T.err}`,
						font: `12.5px/1.55 ${T.sans}`,
						color: T.ink,
					}}
				>
					{rejection}
				</div>
			)}

			<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
				<Button
					variant="primary"
					size="sm"
					icon="check"
					disabled={!canWrite || busy}
					onClick={onSubmit}
				>
					{busy
						? t('systemBuilder.review.saving')
						: mode === 'update'
							? t('systemBuilder.review.save')
							: t('systemBuilder.review.create')}
				</Button>
				<span style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, flex: '1 1 220px' }}>
					{canWrite ? t('systemBuilder.review.activateNote') : t('systemBuilder.review.readOnly')}
				</span>
			</div>
		</div>
	);
}
