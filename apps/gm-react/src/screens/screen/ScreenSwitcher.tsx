import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon, Menu } from '../../ds';
import { useI18n } from '../../i18n';
import { T } from '../../app/screen-kit';
import { screenPath, SCREENS_PATH } from './screenModel';
import { useScreens } from './useScreens';

/**
 * RC-CAN-7.3 — the switcher in a screen's header: every screen this actor may list, pinned first in
 * the GM's order, then "All screens" for the library. Choosing one is ONE navigation, so it pushes
 * exactly one history entry and Back returns to the screen the GM came from. The current screen is
 * marked (`aria-current`) and still listed, so the menu's order never shifts under the GM.
 */
export function ScreenSwitcher({ currentId }: { currentId: string }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const { entries, nameOf } = useScreens();
	const [open, setOpen] = useState(false);
	// The DS Button does not forward a ref (React 18), so the wrapper is the trigger the menu's
	// outside-press check exempts.
	const triggerRef = useRef<HTMLDivElement>(null);

	function go(path: string) {
		setOpen(false);
		navigate(path);
	}

	return (
		<div ref={triggerRef} style={{ position: 'relative', flex: '0 0 auto' }}>
			<Button
				variant="ghost"
				size="sm"
				icon="layers"
				aria-haspopup="menu"
				aria-expanded={open}
				data-testid="screen-switcher"
				onClick={() => setOpen((v) => !v)}
			>
				{t('screens.switch')}
			</Button>
			{open && (
				<Menu
					triggerRef={triggerRef}
					title={t('screens.switchTitle')}
					onClose={() => setOpen(false)}
					width={280}
					style={{
						position: 'absolute',
						top: '100%',
						right: 0,
						marginTop: T.space.one,
						zIndex: T.z.dropdown,
					}}
				>
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: T.space.half,
							maxHeight: '60vh',
							overflowY: 'auto',
						}}
					>
						{entries.map((entry) => {
							const current = entry.id === currentId;
							return (
								<Button
									key={entry.id}
									role="menuitem"
									variant={current ? 'accent' : 'ghost'}
									size="sm"
									aria-current={current ? 'page' : undefined}
									onClick={() => (current ? setOpen(false) : go(screenPath(entry.id)))}
									style={{
										width: '100%',
										justifyContent: 'flex-start',
										textAlign: 'left',
										gap: T.space.two,
									}}
								>
									<Icon
										name={
											entry.pinned
												? 'pin'
												: entry.layoutPolicy === 'flow'
													? 'layout-list'
													: 'widget'
										}
										size="sm"
									/>
									<span
										style={{
											flex: 1,
											minWidth: 0,
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
										}}
									>
										{nameOf(entry)}
									</span>
									{entry.isLive && (
										<span style={{ font: `var(--text-2xs) ${T.sans}`, color: T.sub }}>
											{t('screens.live')}
										</span>
									)}
								</Button>
							);
						})}
						<Button
							role="menuitem"
							variant="ghost"
							size="sm"
							icon="layout-list"
							onClick={() => go(SCREENS_PATH)}
							style={{
								width: '100%',
								justifyContent: 'flex-start',
								borderTop: `1px solid ${T.bd}`,
							}}
						>
							{t('screens.all')}
						</Button>
					</div>
				</Menu>
			)}
		</div>
	);
}
