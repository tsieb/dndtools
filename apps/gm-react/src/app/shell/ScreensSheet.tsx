import { useLocation, useNavigate } from 'react-router-dom';
import { Sheet } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useScreens } from '../../screens/screen/useScreens';
import { screenPath, SCREENS_PATH } from '../../screens/screen/screenModel';
import { activeSectionId, RUN } from '../nav';
import { PinnedScreenRows, SideGroup, SideRow } from './rows';
import { sectionPath } from './sections';
import { useSessionPosture } from './session-posture';

/**
 * Phone (IA-1, RC-ENG-15.1): the Screens tab's local chooser. One tap on the tab opens it; one more
 * opens the live screen, a default run screen, any pin or the library — with no pins, a long pin
 * list or a live session alike. Starting a session never navigates on its own; the live screen just
 * leads the list so the GM finds it first.
 */
export function ScreensSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const location = useLocation();
	const runtime = useRuntime();
	const posture = useSessionPosture();
	const { entries, nameOf } = useScreens();
	const active = activeSectionId(location.pathname);
	const live = posture.live ? entries.find((entry) => entry.isLive) : undefined;
	const go = (path: string) => {
		onClose();
		navigate(path);
	};
	return (
		<Sheet open={open} onClose={onClose} side="bottom" title={t('shell.screensChooser')}>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'minmax(0,1fr)',
					gridAutoRows: 'minmax(44px, auto)',
					gap: 'var(--space-1)',
					paddingBottom: 'var(--space-2)',
				}}
			>
				{live && (
					<SideGroup label={t('shell.liveNow')}>
						<div className="session-live-ring" data-testid="screens-sheet-live">
							<SideRow
								icon={live.layoutPolicy === 'flow' ? 'layout-list' : 'widget'}
								label={nameOf(live)}
								sub={[t('screens.live'), posture.elapsed].filter(Boolean).join(' · ')}
								active={location.pathname === screenPath(live.id)}
								onClick={() => go(screenPath(live.id))}
							/>
						</div>
					</SideGroup>
				)}
				<nav aria-label={t('shell.navScreenShortcuts')}>
					<SideGroup label={t('shell.groupRunTable')}>
						{RUN.map((s) => {
							const path = sectionPath(s.id, runtime.state, runtime.defaultActorId);
							return (
								<SideRow
									key={s.id}
									icon={s.icon}
									label={t(s.labelKey)}
									sub={s.subKey ? t(s.subKey) : undefined}
									active={active === s.id || location.pathname === path}
									onClick={() => go(path)}
								/>
							);
						})}
						<SideRow
							icon="layout-list"
							label={t('screens.all')}
							active={location.pathname === SCREENS_PATH}
							onClick={() => go(SCREENS_PATH)}
						/>
					</SideGroup>
				</nav>
				<PinnedScreenRows onOpen={onClose} />
			</div>
		</Sheet>
	);
}
