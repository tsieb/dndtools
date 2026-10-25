import { ShellLoading } from './ShellLoading';
import { lazy, Suspense, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge, Sheet } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useSettingsTier } from '../../screens/settings/Experience';
import { activeSectionId, routeOwner, SETTINGS_SECTION, type NavSection } from '../nav';
import { localEntriesFor, MORE_SECTIONS, sectionPath } from './sections';
import { PinnedScreenRows, SideRow } from './rows';
import { listLocalVaults } from '../../platform/storage/coreStore';

const VaultSwitcher = lazy(() =>
	import('./VaultSwitcher').then((module) => ({ default: module.VaultSwitcher })),
);

function currentVault(vaultId: string) {
	try {
		return listLocalVaults().find((vault) => vault.id === vaultId);
	} catch {
		return undefined;
	}
}

/** Phone (IA-1): the bottom sheet behind the More tab — the pinned screens first (ADR-041), then
 * Story, Notes and Tools, the current section's own pages, and the vault and Settings utilities. */
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const location = useLocation();
	const runtime = useRuntime();
	const [vaultsOpen, setVaultsOpen] = useState(false);
	const active = activeSectionId(location.pathname);
	const vault = open ? currentVault(runtime.vaultId) : undefined;
	const tier = useSettingsTier();
	const owner = routeOwner(location.pathname);
	// RC-UX-3.5 / RC-UX-6.4 — a local page behind a usage or tier gate (Graph before 3 links) stays
	// out until earned, unless it is the page you're on.
	const local = localEntriesFor(owner, active, runtime.state, tier);
	const localCurrent = local.some((s) => s.id === active);
	const sectionRow = (s: NavSection, isActive: boolean, current: 'page' | 'true' = 'page') => (
		<SideRow
			key={s.id}
			icon={s.icon}
			label={t(s.labelKey)}
			sub={s.subKey ? t(s.subKey) : undefined}
			active={isActive}
			current={current}
			onClick={() => {
				onClose();
				navigate(sectionPath(s.id, runtime.state, runtime.defaultActorId));
			}}
		/>
	);
	return (
		<>
			<Sheet open={open} onClose={onClose} side="bottom" title={t('shell.allSections')}>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'minmax(0,1fr)',
						// RC-UX-4.2 — a phone touch target is at least 44px. A row with a subtitle clears that
						// on its own, but Settings has none and rendered 36px tall; the track floor stretches
						// every row's button to 44px without touching the shared SideRow.
						gridAutoRows: 'minmax(44px, auto)',
						gap: 'var(--space-1)',
						paddingBottom: 'var(--space-2)',
					}}
				>
					<PinnedScreenRows onOpen={onClose} />
					{MORE_SECTIONS.map((s) => sectionRow(s, owner === s.id, localCurrent ? 'true' : 'page'))}
					{local.map((s) => sectionRow(s, active === s.id))}
					{/* RC-UX-5.4 — the phone form of the sidebar's campaign chip. */}
					<SideRow
						icon="campaign-scroll"
						label={t('vaults.title')}
						sub={vault?.name}
						// RC-UX-3.7 — the demo vault is badged wherever its name shows.
						badge={
							vault?.kind === 'demo' ? (
								<Badge status="info">{t('vaults.demoBadge')}</Badge>
							) : undefined
						}
						onClick={() => {
							onClose();
							setVaultsOpen(true);
						}}
					/>
					{sectionRow(SETTINGS_SECTION, owner === 'settings')}
				</div>
			</Sheet>
			{vaultsOpen && (
				<Suspense fallback={<ShellLoading onClose={() => setVaultsOpen(false)} />}>
					<VaultSwitcher onClose={() => setVaultsOpen(false)} onChanged={() => {}} />
				</Suspense>
			)}
		</>
	);
}
