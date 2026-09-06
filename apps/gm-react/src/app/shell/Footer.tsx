import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomTabBar } from '../../ds';
import { useI18n } from '../../i18n';
import { activeSectionId } from '../nav';
import { T } from '../screen-kit';
import { PHONE_TABS, SECTION_PATH } from './sections';
import { MoreSheet } from './MoreSheet';
import { useSessionPosture } from './session-posture';

/** Phone (≤640px): the 4 hot destinations + "More". Extracted from AppShell.tsx's PhoneNav
 * unchanged (RC-STB-2.6). */
export function Footer() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const location = useLocation();
	const [moreOpen, setMoreOpen] = useState(false);
	const active = activeSectionId(location.pathname);
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
						gap: 6,
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
			<BottomTabBar
				items={[
					...PHONE_TABS.map((s) => ({
						key: s.id,
						icon: s.icon,
						label: s.id === 'home' ? t('nav.home') : t(s.labelKey),
						badge: s.liveBadge === true && posture.live ? '•' : undefined,
					})),
					{ key: 'more', icon: 'chevron-up', label: t('shell.more') },
				]}
				active={hotIds.has(active) ? active : 'more'}
				onSelect={(id: string) => {
					if (id === 'more') {
						setMoreOpen(true);
						return;
					}
					navigate(SECTION_PATH[id] ?? '/');
				}}
			/>
			<MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
		</>
	);
}
