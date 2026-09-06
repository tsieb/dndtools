import { type VaultPrivacyMode } from '@dndtools/core';
import { Input } from '../../../ds';
import { useI18n } from '../../../i18n';
import { T, radioGroupKeyDown } from '../../screen-kit';
import { ChoiceCard } from '../ChoiceCard';
import { PRIVACY_ACK_PHRASE } from '../shared';

/** Step 3 (ADR-026) — the forced, undefaulted vault-privacy decision. Extracted from
 * Onboarding.tsx unchanged (RC-STB-2.6). */
export function PrivacyStep({
	privacy,
	setPrivacy,
	ack,
	setAck,
	ackOk,
	ackErrorId,
}: {
	privacy: VaultPrivacyMode | null;
	setPrivacy: (mode: VaultPrivacyMode) => void;
	ack: string;
	setAck: (value: string) => void;
	ackOk: boolean;
	ackErrorId: string;
}) {
	const { t } = useI18n();
	// One translatable sentence, split around the acknowledgment phrase so the phrase keeps its
	// emphasis and the rest of the sentence keeps its locale's word order. The phrase itself is
	// never translated — it is what the user has to type (ADR-026).
	const ackPrompt = t('onboarding.privacy.ackPrompt', { phrase: PRIVACY_ACK_PHRASE });
	const [ackBefore, ackAfter = ''] = ackPrompt.split(PRIVACY_ACK_PHRASE);
	return (
		<div style={{ paddingTop: 14 }}>
			<div
				role="radiogroup"
				aria-label={t('onboarding.privacy.groupLabel')}
				onKeyDown={radioGroupKeyDown}
			>
				<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>
					{t('onboarding.privacy.title')}
				</h2>
				<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
					{t('onboarding.privacy.intro')}
				</p>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
					<ChoiceCard
						on={privacy === 'private-e2ee'}
						tabbable={privacy === 'private-e2ee' || privacy === null}
						icon="lock"
						title={t('onboarding.privacy.privateTitle')}
						desc={t('onboarding.privacy.privateDesc')}
						onPick={() => setPrivacy('private-e2ee')}
					/>
					<ChoiceCard
						on={privacy === 'cloud-enhanced'}
						tabbable={privacy === 'cloud-enhanced'}
						icon="unlock"
						title={t('onboarding.privacy.cloudTitle')}
						desc={t('onboarding.privacy.cloudDesc')}
						onPick={() => setPrivacy('cloud-enhanced')}
					/>
				</div>
			</div>
			{privacy === 'private-e2ee' && (
				<div
					style={{
						marginTop: 14,
						padding: 12,
						borderRadius: 10,
						background: T.surf,
						border: `1px solid ${T.bdS}`,
					}}
				>
					<div style={{ font: `600 12.5px ${T.sans}`, marginBottom: 4 }}>
						{t('onboarding.privacy.noRecoveryTitle')}
					</div>
					<p style={{ margin: '0 0 10px', font: `12px/1.6 ${T.sans}`, color: T.sub }}>
						{t('onboarding.privacy.noRecoveryBody')} {ackBefore}
						<strong style={{ color: T.ink }}>{PRIVACY_ACK_PHRASE}</strong>
						{ackAfter}
					</p>
					{/* The field silently gated the whole wizard: a near-miss ("I hold the key")
										    produced no error, no invalid state and no hint that this was what
										    was blocking Continue (WCAG 3.3.1). */}
					<Input
						value={ack}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAck(e.target.value)}
						placeholder={PRIVACY_ACK_PHRASE}
						aria-label={t('onboarding.privacy.ackFieldLabel', { phrase: PRIVACY_ACK_PHRASE })}
						aria-invalid={ack.trim() !== '' && !ackOk ? true : undefined}
						aria-describedby={ack.trim() !== '' && !ackOk ? ackErrorId : undefined}
						maxLength={PRIVACY_ACK_PHRASE.length}
						style={{ width: '100%' }}
					/>
					{ack.trim() !== '' && !ackOk && (
						<div
							id={ackErrorId}
							role="alert"
							style={{
								marginTop: 6,
								font: `12px ${T.sans}`,
								color: 'var(--color-status-error-text)',
							}}
						>
							{t('onboarding.privacy.ackMismatch', { phrase: PRIVACY_ACK_PHRASE })}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
