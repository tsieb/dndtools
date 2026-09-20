import type { RefObject } from 'react';
import { Button } from '../../ds';
import { T, srOnly } from '../screen-kit';
import { useI18n } from '../../i18n';
import { STEPS } from './data';
import { DiscardConfirm, Overlay, StepRail } from './Overlay';
import type { Wizard } from './wizard';
import { IdentityStep } from './steps/Identity';
import { ClassLevelStep } from './steps/ClassLevel';
import { AbilitiesStep } from './steps/Abilities';
import { KitStep } from './steps/Kit';
import { BioStep } from './steps/Bio';
import { ReviewStep } from './Review';

export function WizardFrame({
	w,
	i,
	identityOk,
	abilityValidation,
	poolIncomplete,
	isPc,
	ownerId,
	isPhone,
	titleRef,
	requestClose,
	jumpTo,
	back,
	next,
	create,
	submitting,
	confirmDiscard,
	setConfirmDiscard,
	onClose,
}: {
	w: Wizard;
	i: number;
	identityOk: boolean;
	abilityValidation: Wizard['abilityValidation'];
	poolIncomplete: boolean;
	isPc: boolean;
	ownerId: string;
	isPhone: boolean;
	titleRef: RefObject<HTMLHeadingElement>;
	requestClose: () => void;
	jumpTo: (i: number) => void;
	back: () => void;
	next: () => void;
	create: () => Promise<void>;
	submitting: boolean;
	confirmDiscard: boolean;
	setConfirmDiscard: (v: boolean) => void;
	onClose: () => void;
}) {
	const { t } = useI18n();
	/* ---- the from-scratch wizard ---- */
	const step = STEPS[i];
	const statsOk = (!abilityValidation || abilityValidation.valid) && !poolIncomplete;
	const canContinue = step.id === 'identity' ? identityOk : step.id === 'stats' ? statsOk : true;
	// Both footer buttons used hard `disabled`, which removes the tab stop AND suppresses the
	// tooltip — so the ONE thing the user needs (what is still missing) had no channel at all.
	const blockedReason =
		step.id === 'identity' && !identityOk
			? isPc && !ownerId
				? t('charBuilder.needNameAndOwner')
				: t('charBuilder.needName')
			: step.id === 'stats' && !statsOk
				? t('charBuilder.needScores')
				: null;

	return (
		<Overlay
			key="scratch"
			onClose={requestClose}
			wide
			label={t('charBuilder.wizard')}
			phone={isPhone}
		>
			<div style={{ display: 'flex', height: '100%', flex: 1, position: 'relative' }}>
				{/* The desktop rail would consume nearly all of a 320px dialog. Progress remains
					    discoverable in the persistent footer on phone instead. */}
				{!isPhone && <StepRail steps={STEPS} i={i} onJump={jumpTo} />}
				<div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							padding: isPhone
								? 'var(--space-3) var(--space-4) var(--space-0)'
								: 'var(--space-4) var(--space-6) var(--space-0)',
						}}
					>
						<h2
							ref={titleRef}
							tabIndex={-1}
							style={{ margin: T.space.zero, font: `700 var(--text-lg) ${T.sans}` }}
						>
							{t(step.title)}
						</h2>
						<Button variant="ghost" size="sm" onClick={requestClose}>
							{t('common.action.cancel')}
						</Button>
					</div>
					<div
						style={{
							flex: 1,
							minHeight: 0,
							overflowY: 'auto',
							padding: isPhone
								? 'var(--space-3) var(--space-4) var(--space-5)'
								: 'var(--space-3) var(--space-6) var(--space-5)',
						}}
					>
						{step.id === 'identity' && <IdentityStep w={w} />}
						{step.id === 'class' && <ClassLevelStep w={w} />}
						{step.id === 'stats' && <AbilitiesStep w={w} />}
						{step.id === 'kit' && <KitStep w={w} />}
						{step.id === 'bio' && <BioStep w={w} />}
						{step.id === 'review' && <ReviewStep w={w} />}
					</div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-2)',
							flexWrap: 'wrap',
							padding: isPhone ? 'var(--space-3) var(--space-4)' : 'var(--space-3) var(--space-6)',
							borderTop: `1px solid ${T.bd}`,
						}}
					>
						<Button variant="ghost" onClick={back} icon="chevron-left">
							{i === 0 ? t('common.action.back') : t(STEPS[i - 1].title)}
						</Button>
						<div style={{ flex: 1 }} />
						{/* A live region, so moving on announces where the user landed — Continue keeps
						    focus, and the step change was otherwise silent to a screen reader. */}
						<span role="status" style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
							{t('charBuilder.stepOf', { index: i + 1, total: STEPS.length })}
							<span style={srOnly}>{`: ${t(step.title)}`}</span>
						</span>
						{i < STEPS.length - 1 ? (
							<Button
								variant="primary"
								icon="chevron-right"
								aria-disabled={!canContinue || undefined}
								title={blockedReason ?? undefined}
								onClick={next}
							>
								{t('charBuilder.continue')}
							</Button>
						) : (
							<Button
								variant="primary"
								icon="check"
								disabled={submitting}
								aria-disabled={!identityOk || !statsOk || undefined}
								title={
									!identityOk
										? t('charBuilder.needName')
										: !statsOk
											? t('charBuilder.needScoresShort')
											: undefined
								}
								onClick={create}
							>
								{submitting ? t('charBuilder.creating') : t('charBuilder.createCharacter')}
							</Button>
						)}
					</div>
				</div>

				{confirmDiscard && (
					<DiscardConfirm
						name={w.name}
						onKeep={() => setConfirmDiscard(false)}
						onDiscard={() => {
							// Restore the nested modal isolation before unmounting its parent.
							setConfirmDiscard(false);
							setTimeout(onClose, 0);
						}}
					/>
				)}
			</div>
		</Overlay>
	);
}
