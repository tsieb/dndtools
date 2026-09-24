import { useRef } from 'react';
import { Badge, Button, Textarea } from '../../ds';
import { T } from '../screen-kit';
import { useI18n } from '../../i18n';
import { STEP_IDS, STEP_LABEL, type BuilderStepId } from './draft';
import { type DraftIssue } from './validate';

/** The builder's stepper: every step, the current one marked, and any step with an open issue flagged. */
export function BuilderStepRail({
	step,
	issues,
	onGoToStep,
}: {
	step: BuilderStepId;
	issues: DraftIssue[];
	onGoToStep: (id: BuilderStepId) => void;
}) {
	const { t } = useI18n();
	return (
		<nav aria-label={t('extensions.builder.steps')} data-testid="widget-builder-steps">
			<ol
				style={{
					listStyle: 'none',
					margin: 'var(--space-0)',
					padding: 'var(--space-0)',
					display: 'grid',
					gap: 'var(--space-1)',
				}}
			>
				{STEP_IDS.map((id, index) => {
					const current = id === step;
					const blocked = issues.some((issue) => issue.step === id);
					return (
						<li key={id}>
							<button
								type="button"
								onClick={() => onGoToStep(id)}
								// The index badge is decoration; the step's NAME is the button's name.
								aria-label={t(STEP_LABEL[id])}
								aria-current={current ? 'step' : undefined}
								style={{
									width: '100%',
									display: 'flex',
									alignItems: 'center',
									gap: 'var(--space-2)',
									padding: 'var(--space-1-5) var(--space-2)',
									borderRadius: 'var(--radius-md)',
									border: `1px solid ${current ? T.accBd : 'transparent'}`,
									background: current ? T.accSub : 'transparent',
									color: current ? T.ink : T.sub,
									font: `${current ? 600 : 400} var(--text-sm) ${T.sans}`,
									textAlign: 'left',
									cursor: 'pointer',
								}}
							>
								<span
									aria-hidden="true"
									style={{
										width: 20,
										height: 20,
										flex: '0 0 auto',
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										borderRadius: 'var(--radius-full)',
										border: `1.5px solid ${current ? T.acc : T.bdS}`,
										color: current ? T.acc : T.sub,
										font: `600 var(--text-xs) ${T.mono}`,
									}}
								>
									{index + 1}
								</span>
								<span style={{ flex: 1, minWidth: 0 }}>{t(STEP_LABEL[id])}</span>
								{blocked && (
									<Badge status="warning" icon="warning">
										{t('extensions.builder.needsAttention')}
									</Badge>
								)}
							</button>
						</li>
					);
				})}
			</ol>
		</nav>
	);
}

/** The definition the draft builds, as read-only JSON the DM can select and copy. */
export function DefinitionPane({ json, narrow }: { json: string; narrow: boolean }) {
	const { t } = useI18n();
	const jsonRef = useRef<HTMLTextAreaElement>(null);
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minHeight: 0 }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<span style={{ flex: 1, font: `600 var(--text-xs) ${T.sans}`, color: T.sub }}>
					{t('extensions.builder.definition')}
				</span>
				<Button
					variant="ghost"
					size="sm"
					icon="duplicate"
					onClick={() => {
						jsonRef.current?.focus();
						jsonRef.current?.select();
					}}
				>
					{t('extensions.builder.selectAll')}
				</Button>
			</div>
			<Textarea
				ref={jsonRef}
				value={json}
				readOnly
				rows={narrow ? 14 : 26}
				aria-label={t('extensions.builder.definitionField')}
				data-testid="widget-builder-json"
				style={{ fontFamily: T.mono, fontSize: 'var(--text-xs)', flex: 1, minHeight: 0 }}
			/>
			<span style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
				{t('extensions.builder.definitionHelp')}
			</span>
		</div>
	);
}
