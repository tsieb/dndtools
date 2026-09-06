import { Icon } from '../../../ds';
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
	return (
		<div
			style={{ paddingTop: 14 }}
			role="radiogroup"
			aria-label="Vault choice"
			onKeyDown={radioGroupKeyDown}
		>
			<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>
				Where should your world live?
			</h2>
			<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
				{vaultEmpty
					? 'Your vault lives on this device — every note, map, and character. This device started fresh, so the vault is currently empty.'
					: 'Your vault lives on this device — every note, map, and character. The sample campaign is already loaded so nothing starts empty.'}
			</p>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
				<ChoiceCard
					on={vault === 'sample'}
					icon="scene"
					title={vaultEmpty ? 'Load the sample campaign' : 'Keep the sample campaign'}
					badge="Recommended"
					desc={
						vaultEmpty
							? 'Loads the sample table — scenes, party, maps and notes — so you can explore with nothing starting empty. Everything is editable or deletable later.'
							: `Explore with a table already set: ${vaultFacts.scenes} scenes · ${vaultFacts.pcs} PCs · ${vaultFacts.npcs} NPCs · ${vaultFacts.maps} ${vaultFacts.maps === 1 ? 'map' : 'maps'} · ${vaultFacts.notes} notes. Everything is editable or deletable later.`
					}
					onPick={() => setVault('sample')}
				/>
				<ChoiceCard
					on={vault === 'fresh'}
					icon="add"
					title="Start fresh"
					desc={
						vaultEmpty
							? "Keeps this device's vault empty. Your own campaign from a blank page."
							: 'Clears the sample campaign from this device and boots an empty vault. Your own campaign from a blank page.'
					}
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
				<Icon name="import" size={13} /> Importing from Obsidian, Google Docs or a Roll20 export
				lives in Settings → Vault connections.
			</p>
		</div>
	);
}
