import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, IconButton, NavRail } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { activeSectionId } from '../nav';
import { T } from '../screen-kit';
import { ALL_SECTIONS, SECTION_PATH } from './sections';

/** Tablet: the DS NavRail — icon-only, labels move to the accessible name/tooltip. */
export function RailNav({ onOpenPalette }: { onOpenPalette: () => void }) {
	const navigate = useNavigate();
	const location = useLocation();
	const runtime = useRuntime();
	const active = activeSectionId(location.pathname);
	const liveDot = runtime.state.session.activeSceneId != null;
	return (
		<NavRail
			width={64}
			style={{
				width: 'calc(64px + var(--safe-area-left, 0px))',
				padding:
					'calc(var(--space-2) + var(--safe-area-top, 0px)) var(--space-2) calc(var(--space-2) + var(--safe-area-bottom, 0px)) calc(var(--space-2) + var(--safe-area-left, 0px))',
			}}
			items={ALL_SECTIONS.map((s) => ({
				key: s.id,
				icon: s.icon,
				label: s.label,
				badge: s.id === 'session' && liveDot ? '•' : undefined,
			}))}
			active={active}
			onSelect={(id: string) => navigate(SECTION_PATH[id] ?? '/')}
			header={
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
			}
			footer={
				<IconButton
					icon="search"
					label="Search (⌘K)"
					variant="ghost"
					size="sm"
					onClick={onOpenPalette}
				/>
			}
		/>
	);
}
