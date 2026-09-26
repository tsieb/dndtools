import { lazy, Suspense, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, IconButton, NavRail } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { activeSectionId, isNavSectionVisible } from '../nav';
import { T } from '../screen-kit';
import { ALL_SECTIONS, SECTION_PATH } from './sections';
import { useSessionPosture } from './session-posture';
import { isDemoLocalVault } from '../../platform/storage/coreStore';

const VaultSwitcher = lazy(() =>
	import('./VaultSwitcher').then((module) => ({ default: module.VaultSwitcher })),
);

/** Tablet: the DS NavRail — icon-only, labels move to the accessible name/tooltip. */
export function RailNav({ onOpenPalette }: { onOpenPalette: () => void }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const location = useLocation();
	const runtime = useRuntime();
	// RC-UX-5.4 — the rail's campaign mark is the tablet form of the sidebar's campaign chip.
	const [vaultsOpen, setVaultsOpen] = useState(false);
	// RC-UX-3.7 — the rail shows no vault name, so the demo is named in the mark's label and badged.
	const [demo] = useState(() => isDemoLocalVault(runtime.vaultId));
	const vaultsLabel = demo ? `${t('vaults.title')} · ${t('vaults.demoBadge')}` : t('vaults.title');
	const active = activeSectionId(location.pathname);
	// RC-SES-1.1 — one source for "live" across all three navigations: the session workflow.
	const live = useSessionPosture().live;
	// RC-UX-3.5 — the tablet rail must not leak a usage-gated surface either (Graph before 3 links).
	const visibleSections = ALL_SECTIONS.filter((s) => isNavSectionVisible(s.id, runtime.state));
	return (
		<>
			<NavRail
				width={64}
				style={{
					width: 'calc(64px + var(--safe-area-left, 0px))',
					padding:
						'calc(var(--space-2) + var(--safe-area-top, 0px)) var(--space-2) calc(var(--space-2) + var(--safe-area-bottom, 0px)) calc(var(--space-2) + var(--safe-area-left, 0px))',
				}}
				items={visibleSections.map((s) => ({
					key: s.id,
					icon: s.icon,
					label: t(s.labelKey),
					badge: s.liveBadge === true && live ? '•' : undefined,
				}))}
				active={active}
				onSelect={(id: string) => navigate(SECTION_PATH[id] ?? '/')}
				header={
					<button
						type="button"
						aria-label={vaultsLabel}
						title={vaultsLabel}
						aria-haspopup="dialog"
						aria-expanded={vaultsOpen}
						onClick={() => setVaultsOpen(true)}
						style={{
							padding: 'var(--space-0)',
							border: 0,
							borderRadius: 'var(--radius-md)',
							background: 'transparent',
							cursor: 'pointer',
							display: 'inline-flex',
							position: 'relative',
						}}
					>
						<span
							style={{
								width: 30,
								height: 30,
								borderRadius: 7,
								background: T.acc,
								color: T.accFg,
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								boxShadow: T.ssm,
							}}
						>
							<Icon name="dice" size="sm" />
						</span>
						{demo && (
							<span
								aria-hidden="true"
								style={{
									position: 'absolute',
									bottom: -6,
									left: '50%',
									transform: 'translateX(-50%)',
									padding: '0 var(--space-1)',
									borderRadius: 'var(--radius-sm)',
									background: 'var(--color-status-info-subtle)',
									color: 'var(--color-status-info-text)',
									font: `600 9px ${T.sans}`,
									lineHeight: '14px',
								}}
							>
								{t('vaults.demoBadge')}
							</span>
						)}
					</button>
				}
				footer={
					<IconButton
						icon="search"
						label={t('shell.searchShortcut')}
						variant="ghost"
						size="sm"
						onClick={onOpenPalette}
					/>
				}
			/>
			{vaultsOpen && (
				<Suspense fallback={null}>
					<VaultSwitcher onClose={() => setVaultsOpen(false)} onChanged={() => {}} />
				</Suspense>
			)}
		</>
	);
}
