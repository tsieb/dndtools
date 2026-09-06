import { Icon } from '../../../ds';
import { useI18n } from '../../../i18n';
import { T, radioGroupKeyDown } from '../../screen-kit';
import { ChoiceCard } from '../ChoiceCard';

/** Step 2 — keep the sample campaign or start fresh. Extracted from Onboarding.tsx unchanged
 * (RC-STB-2.6). */
export function VaultStep({
	vault,
	setVault,
	vaultFacts,
	vaultEmpty,
}: {
	vault: 'sample' | 'fresh';
	setVault: (v: 'sample' | 'fresh') => void;
	vaultFacts: { scenes: number; pcs: number; npcs: number; maps: number; notes: number };
	vaultEmpty: boolean;
}) {
	const { t } = useI18n();
	return (
		<div
			style={{ paddingTop: 14 }}
			role="radiogroup"
			aria-label={t('onboarding.vault.groupLabel')}
			onKeyDown={radioGroupKeyDown}
		>
			<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>
				{t('onboarding.vault.title')}
			</h2>
			<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
				{t(vaultEmpty ? 'onboarding.vault.introEmpty' : 'onboarding.vault.introSample')}
			</p>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
				<ChoiceCard
					on={vault === 'sample'}
					icon="scene"
					title={t(vaultEmpty ? 'onboarding.vault.loadSample' : 'onboarding.vault.keepSample')}
					badge={t('common.badge.recommended')}
					desc={
						vaultEmpty
							? t('onboarding.vault.sampleDescEmpty')
							: t('onboarding.vault.sampleDescLoaded', {
									scenes: vaultFacts.scenes,
									pcs: vaultFacts.pcs,
									npcs: vaultFacts.npcs,
									maps: vaultFacts.maps,
									notes: vaultFacts.notes,
								})
					}
					onPick={() => setVault('sample')}
				/>
				<ChoiceCard
					on={vault === 'fresh'}
					icon="add"
					title={t('onboarding.vault.fresh')}
					desc={t(
						vaultEmpty ? 'onboarding.vault.freshDescEmpty' : 'onboarding.vault.freshDescLoaded',
					)}
					onPick={() => setVault('fresh')}
				/>
			</div>
			<p
				style={{
					margin: '14px 0 0',
					font: `12px ${T.sans}`,
					color: T.ter,
					display: 'flex',
					alignItems: 'center',
					gap: 7,
				}}
			>
				<Icon name="import" size={13} /> {t('onboarding.vault.importHint')}
			</p>
		</div>
	);
}
