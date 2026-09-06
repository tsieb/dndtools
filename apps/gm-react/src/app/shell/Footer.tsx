import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomTabBar } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { activeSectionId } from '../nav';
import { PHONE_TABS, SECTION_PATH } from './sections';
import { MoreSheet } from './MoreSheet';

/** Phone (≤640px): the 4 hot destinations + "More". Extracted from AppShell.tsx's PhoneNav
 * unchanged (RC-STB-2.6). */
export function Footer() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const location = useLocation();
	const runtime = useRuntime();
	const [moreOpen, setMoreOpen] = useState(false);
	const active = activeSectionId(location.pathname);
	const hotIds = new Set(PHONE_TABS.map((s) => s.id));
	const liveDot = runtime.state.session.activeSceneId != null;
	return (
		<>
			<BottomTabBar
				items={[
					...PHONE_TABS.map((s) => ({
						key: s.id,
						icon: s.icon,
						label: s.id === 'home' ? t('nav.home') : t(s.labelKey),
						badge: s.id === 'session' && liveDot ? '•' : undefined,
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
