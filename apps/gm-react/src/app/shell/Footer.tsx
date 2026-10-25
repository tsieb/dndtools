import { useRuntime } from '../../runtime/RuntimeContext';
import { useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomTabBar } from '../../ds';
import { useI18n } from '../../i18n';
import { routeOwner } from '../nav';
import { T } from '../screen-kit';
import { HelpTrigger } from '../help/HelpMenu';
import { PHONE_TABS, sectionPath } from './sections';
import { MoreSheet } from './MoreSheet';
import { ScreensSheet } from './ScreensSheet';
import { useSessionPosture } from './session-posture';

/** Phone (≤640px, IA-1): Screens, Characters, Maps + "More". Screens and More each open a sheet;
 * Characters and Maps navigate. */
export function Footer() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const navigate = useNavigate();
	const location = useLocation();
	const [moreOpen, setMoreOpen] = useState(false);
	const [screensOpen, setScreensOpen] = useState(false);
	const owner = routeOwner(location.pathname);
	const hotIds = new Set(PHONE_TABS.map((s) => s.id));
	// RC-SES-1.1 — the phone's posture: a 16px accent strip directly above the tab bar carrying the
	// elapsed time. The phone has no room for a top-bar chip and no right rail, so this strip is the
	// one place it can say "the table is live" without costing a destination.
	const posture = useSessionPosture();
	return (
		<>
			{posture.live && (
				<div
					data-testid="phone-session-strip"
					style={{
						flex: '0 0 auto',
						height: 16,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 'var(--space-1-5)',
						background: T.acc,
						color: T.accFg,
						font: `600 10px ${T.sans}`,
						letterSpacing: '.04em',
						paddingLeft: 'var(--safe-area-left, 0px)',
						paddingRight: 'var(--safe-area-right, 0px)',
					}}
				>
					{posture.elapsed
						? t('shell.sessionLiveElapsed', { elapsed: posture.elapsed })
						: t('shell.sessionLive')}
				</div>
			)}
			{/* RC-UX-3.4 — an always-reachable Help affordance in the SAME location on every phone screen
			    (WCAG 3.2.6 consistent help): a slim row directly above the tab bar, in-flow so it never
			    overlaps the top bar's own controls (RC-STB-2.6's "Table controls" sheet trigger sits in
			    that corner already). Desktop and rail reach the same menu from the top bar; both triggers
			    open the shell's one `HelpHost` (RC-UX-6.1). The row says Help in words (RC-UX-6.6), so
			    "open Help" in a guide points at something a lost GM can read. */}
			<div
				style={{
					flex: '0 0 auto',
					display: 'flex',
					justifyContent: 'flex-end',
					padding: '4px max(8px, var(--safe-area-right, 0px)) 4px 8px',
					borderTop: `1px solid ${T.bd}`,
				}}
			>
				<HelpTrigger variant="ghost" />
			</div>
			<BottomTabBar
				style={{ '--color-text-tertiary': T.sub } as CSSProperties}
				items={[
					...PHONE_TABS.map((s) => ({
						key: s.id,
						icon: s.icon,
						label: t(s.labelKey),
						badge: s.liveBadge === true && posture.live ? '•' : undefined,
						...(s.id === 'screens'
							? { 'aria-haspopup': 'dialog' as const, 'aria-expanded': screensOpen }
							: {}),
					})),
					{
						key: 'more',
						icon: 'chevron-up',
						label: t('shell.more'),
						'aria-haspopup': 'dialog',
						'aria-expanded': moreOpen,
					},
				]}
				active={owner && hotIds.has(owner) ? owner : 'more'}
				onSelect={(id: string) => {
					if (id === 'more') {
						setMoreOpen(true);
						return;
					}
					if (id === 'screens') {
						setScreensOpen(true);
						return;
					}
					navigate(sectionPath(id, runtime.state, runtime.defaultActorId));
				}}
			/>
			<ScreensSheet open={screensOpen} onClose={() => setScreensOpen(false)} />
			<MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
		</>
	);
}
