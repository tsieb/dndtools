import { ShellLoading } from './ShellLoading';
import { useScreens } from '../../screens/screen/useScreens';
import { screenPath } from '../../screens/screen/screenModel';
import { lazy, Suspense, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, IconButton, NavRail } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useSettingsTier } from '../../screens/settings/Experience';
import { activeSectionId, PRIMARY, routeOwner, RUN } from '../nav';
import { T } from '../screen-kit';
import { localEntriesFor, sectionPath } from './sections';
import { useSessionPosture } from './session-posture';
import { isDemoLocalVault } from '../../platform/storage/coreStore';

const VaultSwitcher = lazy(() =>
	import('./VaultSwitcher').then((module) => ({ default: module.VaultSwitcher })),
);

/* The rail's groups are separate DS NavRails so each is its own labelled landmark (IA-1): the
 * column itself (header, scroll, search) is drawn here and each NavRail drops its own chrome. */
const GROUP: CSSProperties = {
	width: 64,
	height: 'auto',
	flex: '0 0 auto',
	padding: 'var(--space-1) var(--space-2)',
	background: 'transparent',
	borderRight: 0,
};
const DIVIDED: CSSProperties = { ...GROUP, borderTop: '1px solid var(--color-border)' };

/** Tablet: the DS NavRail — icon-only, labels move to the accessible name/tooltip. The six primary
 * sections first, then the current section's pages, the Screen shortcuts and the pins. */
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
	const { entries, nameOf } = useScreens();
	const pins = entries.filter((entry) => entry.pinned);
	const selectedPin = pins.find((entry) => location.pathname === screenPath(entry.id));
	const active = activeSectionId(location.pathname);
	const owner = routeOwner(location.pathname);
	const tier = useSettingsTier();
	// RC-SES-1.1 — one source for "live" across all three navigations: the session workflow.
	const live = useSessionPosture().live;
	// RC-UX-3.5 — the tablet rail must not leak a usage-gated page either (Graph before 3 links).
	const local = localEntriesFor(owner, active, runtime.state, tier);
	const ownerSection = PRIMARY.find((s) => s.id === owner);
	const go = (id: string) => navigate(sectionPath(id, runtime.state, runtime.defaultActorId));
	const shortcut = RUN.find(
		(s) =>
			active === s.id ||
			location.pathname === sectionPath(s.id, runtime.state, runtime.defaultActorId),
	);
	return (
		<>
			<div
				style={{
					width: 'calc(64px + var(--safe-area-left, 0px))',
					flex: '0 0 auto',
					height: '100%',
					boxSizing: 'border-box',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: 'var(--space-1)',
					// No side padding: each NavRail spans the 64px column and pads itself, so the Primary
					// landmark is the rail's full width (responsive.spec).
					padding:
						'calc(var(--space-2) + var(--safe-area-top, 0px)) 0 calc(var(--space-2) + var(--safe-area-bottom, 0px)) var(--safe-area-left, 0px)',
					background: 'var(--color-surface)',
					borderRight: '1px solid var(--color-border)',
				}}
			>
				<div style={{ padding: 'var(--space-2) 0 var(--space-1)' }}>
					<button
						type="button"
						aria-label={vaultsLabel}
						title={vaultsLabel}
						aria-haspopup="dialog"
						aria-expanded={vaultsOpen}
						onClick={() => setVaultsOpen(true)}
						style={{
							padding: 'var(--space-0)',
							// The icon-only launcher must fit the fixed-width rail at large text sizes.
							minWidth: 48,
							minHeight: 48,
							alignItems: 'center',
							justifyContent: 'center',
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
								borderRadius: 'var(--radius-md)',
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
				</div>
				<div
					style={{
						flex: 1,
						minHeight: 0,
						width: '100%',
						overflowY: 'auto',
						overflowX: 'hidden',
						display: 'flex',
						flexDirection: 'column',
					}}
				>
					<NavRail
						style={GROUP}
						items={PRIMARY.map((s) => ({
							key: s.id,
							icon: s.icon,
							label: t(s.labelKey),
							badge: s.liveBadge && live ? '•' : undefined,
						}))}
						active={owner ?? undefined}
						onSelect={go}
					/>
					{ownerSection && local.length > 0 && (
						<NavRail
							aria-label={t(ownerSection.labelKey)}
							style={DIVIDED}
							items={local.map((s) => ({ key: s.id, icon: s.icon, label: t(s.labelKey) }))}
							active={active}
							onSelect={go}
						/>
					)}
					<NavRail
						aria-label={t('shell.navScreenShortcuts')}
						style={DIVIDED}
						items={RUN.map((s) => ({
							key: s.id,
							icon: s.icon,
							label: t(s.labelKey),
							badge: s.liveBadge && live ? '•' : undefined,
						}))}
						active={shortcut?.id}
						onSelect={go}
					/>
					{pins.length > 0 && (
						<NavRail
							aria-label={t('shell.navPinnedScreens')}
							style={DIVIDED}
							items={pins.map((entry) => ({
								key: entry.id,
								icon: entry.layoutPolicy === 'flow' ? 'layout-list' : 'widget',
								label: `${nameOf(entry)}${entry.isLive && live ? ` · ${t('screens.live')}` : ''}`,
								badge: entry.isLive && live ? '•' : undefined,
							}))}
							active={selectedPin?.id}
							onSelect={(id: string) => navigate(screenPath(id))}
						/>
					)}
				</div>
				<IconButton
					icon="search"
					label={t('shell.searchShortcut')}
					variant="ghost"
					size="sm"
					onClick={onOpenPalette}
				/>
			</div>
			{vaultsOpen && (
				<Suspense fallback={<ShellLoading onClose={() => setVaultsOpen(false)} />}>
					<VaultSwitcher onClose={() => setVaultsOpen(false)} onChanged={() => {}} />
				</Suspense>
			)}
		</>
	);
}
