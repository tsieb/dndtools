import { type VaultPrivacyMode } from '@dndtools/core';
import { Input } from '../../../ds';
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
	return (
		<div style={{ paddingTop: 14 }}>
			<div role="radiogroup" aria-label="Vault privacy mode" onKeyDown={radioGroupKeyDown}>
				<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>Who can read your world?</h2>
				<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
					This decides how your campaign is stored if you ever use cloud features. There is no
					preset — this choice is yours, and you can change it later in Settings → Sync.
				</p>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
					<ChoiceCard
						on={privacy === 'private-e2ee'}
						tabbable={privacy === 'private-e2ee' || privacy === null}
						icon="lock"
						title="Private vault (end-to-end encrypted)"
						desc="Your campaign is encrypted on your devices before anything leaves them, and only your devices hold the keys — the service can never read it. Server-powered features (campaign AI, cloud search, opening your campaign from any browser) will not be available to this vault."
						onPick={() => setPrivacy('private-e2ee')}
					/>
					<ChoiceCard
						on={privacy === 'cloud-enhanced'}
						tabbable={privacy === 'cloud-enhanced'}
						icon="unlock"
						title="Cloud-Enhanced vault"
						desc="Encrypted in transit and at rest with service-managed keys, and readable by the service to power upcoming features — campaign AI, cloud search, and access from any browser. Today your data is still end-to-end encrypted; this records your consent for when those features arrive."
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
						No one can recover this for you
					</div>
					<p style={{ margin: '0 0 10px', font: `12px/1.6 ${T.sans}`, color: T.sub }}>
						Cloud backups of a Private vault can only be opened with keys held on your devices. If
						you lose every device without exporting a recovery key (Settings → Sync), the cloud copy
						is gone for good — the service cannot reset or restore it. Type{' '}
						<strong style={{ color: T.ink }}>{PRIVACY_ACK_PHRASE}</strong> to confirm you
						understand.
					</p>
					{/* The field silently gated the whole wizard: a near-miss ("I hold the key")
										    produced no error, no invalid state and no hint that this was what
										    was blocking Continue (WCAG 3.3.1). */}
					<Input
						value={ack}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAck(e.target.value)}
						placeholder={PRIVACY_ACK_PHRASE}
						aria-label={`Type "${PRIVACY_ACK_PHRASE}" to confirm`}
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
							That does not match — type “{PRIVACY_ACK_PHRASE}” exactly.
						</div>
					)}
				</div>
			)}
		</div>
	);
}
