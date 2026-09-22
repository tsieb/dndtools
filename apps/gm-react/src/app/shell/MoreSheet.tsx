import { lazy, Suspense, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sheet } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { activeSectionId, isNavSectionVisible } from '../nav';
import { ALL_SECTIONS, PHONE_TABS, SECTION_PATH } from './sections';
import { SideRow } from './rows';
import { listLocalVaults } from '../../platform/storage/coreStore';

const VaultSwitcher = lazy(() =>
	import('./VaultSwitcher').then((module) => ({ default: module.VaultSwitcher })),
);

function currentVaultName(vaultId: string): string | undefined {
	try {
		return listLocalVaults().find((vault) => vault.id === vaultId)?.name;
	} catch {
		return undefined;
	}
}

/** Phone: the bottom sheet listing every section that does not fit in the tab bar. Extracted from
 * AppShell.tsx's PhoneNav unchanged (RC-STB-2.6). */
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const location = useLocation();
	const runtime = useRuntime();
	const [vaultsOpen, setVaultsOpen] = useState(false);
	const active = activeSectionId(location.pathname);
	const hotIds = new Set(PHONE_TABS.map((s) => s.id));
	// RC-UX-3.5 — the phone sheet must not leak a usage-gated surface the desktop sidebar keeps
	// hidden pending its signal (Graph before 3 links).
	const rest = ALL_SECTIONS.filter(
		(s) => !hotIds.has(s.id) && isNavSectionVisible(s.id, runtime.state),
	);
	return (
		<>
			<Sheet open={open} onClose={onClose} side="bottom" title={t('shell.allSections')}>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'minmax(0,1fr)',
						gap: 4,
						paddingBottom: 8,
					}}
				>
					{/* RC-UX-5.4 — the phone form of the sidebar's campaign chip. */}
					<SideRow
						icon="campaign-scroll"
						label={t('vaults.title')}
						sub={open ? currentVaultName(runtime.vaultId) : undefined}
						onClick={() => {
							onClose();
							setVaultsOpen(true);
						}}
					/>
					{rest.map((s) => (
						<SideRow
							key={s.id}
							icon={s.icon}
							label={t(s.labelKey)}
							sub={s.subKey ? t(s.subKey) : undefined}
							active={active === s.id}
							onClick={() => {
								onClose();
								navigate(SECTION_PATH[s.id] ?? '/');
							}}
						/>
					))}
				</div>
			</Sheet>
			{vaultsOpen && (
				<Suspense fallback={null}>
					<VaultSwitcher onClose={() => setVaultsOpen(false)} onChanged={() => {}} />
				</Suspense>
			)}
		</>
	);
}
